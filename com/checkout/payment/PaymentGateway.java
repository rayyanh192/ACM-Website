package com.checkout.payment;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Logger;
import java.util.logging.Level;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.Files;
import java.nio.file.Paths;

public class PaymentGateway {
    private static final Logger logger = Logger.getLogger(PaymentGateway.class.getName());
    
    private final HttpClient httpClient;
    private final String baseUrl;
    private final ObjectMapper objectMapper;
    
    // FIXED: Load timeout configuration from config file
    private final Duration requestTimeout;
    private final int maxRetries;
    private final long baseRetryDelayMs;
    private final double backoffMultiplier;
    private final long jitterMs;
    
    // Circuit breaker state
    private volatile int failureCount = 0;
    private volatile long lastFailureTime = 0;
    private volatile CircuitState circuitState = CircuitState.CLOSED;
    private final int failureThreshold;
    private final long recoveryTimeoutMs;
    
    private enum CircuitState {
        CLOSED, OPEN, HALF_OPEN
    }
    
    public PaymentGateway() {
        this.baseUrl = System.getProperty("payment.gateway.url", "https://api.payment-gateway.com");
        this.objectMapper = new ObjectMapper();
        
        // FIXED: Load configuration from timeout.json
        TimeoutConfig config = loadTimeoutConfig();
        
        // FIXED: Increased timeout from 5s to 20s
        this.requestTimeout = Duration.ofMillis(config.paymentTimeoutMs); // 20 seconds
        this.maxRetries = config.maxRetries;
        this.baseRetryDelayMs = config.retryDelayMs;
        this.backoffMultiplier = config.backoffMultiplier;
        this.jitterMs = config.jitterMs;
        this.failureThreshold = config.failureThreshold;
        this.recoveryTimeoutMs = config.recoveryTimeoutMs;
        
        // FIXED: HTTP client with improved timeout
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(requestTimeout)
            .build();
            
        logger.info("PaymentGateway initialized with " + requestTimeout.toSeconds() + "s timeout");
    }
    
    private TimeoutConfig loadTimeoutConfig() {
        try {
            String configPath = "/workspace/config/timeout.json";
            String content = Files.readString(Paths.get(configPath));
            JsonNode config = objectMapper.readTree(content);
            JsonNode paymentConfig = config.get("payment");
            JsonNode circuitBreakerConfig = paymentConfig.get("circuit_breaker");
            
            return new TimeoutConfig(
                paymentConfig.get("timeout_ms").asLong(),
                paymentConfig.get("max_retries").asInt(),
                paymentConfig.get("retry_delay_ms").asLong(),
                paymentConfig.get("retry_backoff_multiplier").asDouble(),
                paymentConfig.get("retry_jitter_ms").asLong(),
                circuitBreakerConfig.get("failure_threshold").asInt(),
                circuitBreakerConfig.get("recovery_timeout_ms").asLong()
            );
        } catch (Exception e) {
            logger.warning("Failed to load timeout config, using defaults: " + e.getMessage());
            // Fallback to safer defaults
            return new TimeoutConfig(20000, 3, 2000, 2.0, 500, 5, 60000);
        }
    }
    
    public PaymentResult processPayment(PaymentRequest paymentRequest) {
        logger.info("Processing payment for amount: " + paymentRequest.getAmount());
        
        // Check circuit breaker state
        if (isCircuitOpen()) {
            logger.severe("Circuit breaker is OPEN, rejecting payment request");
            return PaymentResult.builder()
                .success(false)
                .errorMessage("Payment service temporarily unavailable (circuit breaker open)")
                .build();
        }
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info("Payment attempt " + attempt + "/" + maxRetries);
                
                // This is line 234 mentioned in the error logs - now with better timeout handling
                PaymentResult result = makePaymentRequest(paymentRequest);
                
                if (result.isSuccess()) {
                    recordSuccess();
                    return result;
                } else {
                    recordFailure();
                    if (attempt == maxRetries) {
                        throw new RuntimeException("Payment failed after all retries: " + result.getErrorMessage());
                    }
                }
                
            } catch (Exception e) {
                logger.log(Level.WARNING, "Payment attempt " + attempt + " failed: " + e.getMessage());
                recordFailure();
                
                if (attempt == maxRetries) {
                    logger.log(Level.SEVERE, "All payment attempts failed", e);
                    throw new RuntimeException("Payment gateway unreachable after " + maxRetries + " attempts", e);
                }
                
                // IMPROVED: Exponential backoff with jitter instead of fixed delay
                long delay = calculateRetryDelay(attempt - 1);
                logger.info("Waiting " + delay + "ms before retry");
                
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Payment processing interrupted", ie);
                }
            }
        }
        
        throw new RuntimeException("Payment processing failed after " + maxRetries + " attempts");
    }
    
    private boolean isCircuitOpen() {
        switch (circuitState) {
            case CLOSED:
                return false;
            case OPEN:
                // Check if recovery timeout has passed
                if (System.currentTimeMillis() - lastFailureTime > recoveryTimeoutMs) {
                    circuitState = CircuitState.HALF_OPEN;
                    logger.info("Circuit breaker transitioning to HALF_OPEN state");
                    return false;
                }
                return true;
            case HALF_OPEN:
                return false;
            default:
                return false;
        }
    }
    
    private void recordSuccess() {
        if (circuitState != CircuitState.CLOSED) {
            logger.info("Circuit breaker transitioning to CLOSED state after successful request");
            circuitState = CircuitState.CLOSED;
        }
        failureCount = 0;
        lastFailureTime = 0;
    }
    
    private void recordFailure() {
        failureCount++;
        lastFailureTime = System.currentTimeMillis();
        
        if (failureCount >= failureThreshold && circuitState == CircuitState.CLOSED) {
            circuitState = CircuitState.OPEN;
            logger.severe("Circuit breaker OPEN after " + failureCount + " failures");
        } else if (circuitState == CircuitState.HALF_OPEN) {
            circuitState = CircuitState.OPEN;
            logger.severe("Circuit breaker returning to OPEN state after failure in HALF_OPEN");
        }
    }
    
    private long calculateRetryDelay(int attempt) {
        // Exponential backoff: base_delay * (multiplier ^ attempt)
        long delay = (long) (baseRetryDelayMs * Math.pow(backoffMultiplier, attempt));
        
        // Add jitter to prevent thundering herd
        long jitter = ThreadLocalRandom.current().nextLong(0, jitterMs + 1);
        
        return delay + jitter;
    }
    
    private PaymentResult makePaymentRequest(PaymentRequest paymentRequest) throws Exception {
        try {
            String requestBody = objectMapper.writeValueAsString(paymentRequest);
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v1/charges"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + getApiKey())
                .timeout(requestTimeout) // FIXED: 20 second timeout instead of 5
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();
            
            long startTime = System.currentTimeMillis();
            HttpResponse<String> response = httpClient.send(request, 
                HttpResponse.BodyHandlers.ofString());
            long duration = System.currentTimeMillis() - startTime;
            
            logger.info("Payment request completed in " + duration + "ms");
            
            if (response.statusCode() == 200) {
                JsonNode responseJson = objectMapper.readTree(response.body());
                logger.info("Payment successful: " + responseJson.get("transaction_id"));
                
                return PaymentResult.builder()
                    .success(true)
                    .transactionId(responseJson.get("transaction_id").asText())
                    .amount(paymentRequest.getAmount())
                    .currency(paymentRequest.getCurrency())
                    .build();
                    
            } else if (response.statusCode() == 429) {
                // Rate limited - should retry
                logger.warning("Rate limited by payment gateway");
                return PaymentResult.builder()
                    .success(false)
                    .errorMessage("Rate limited - will retry")
                    .build();
                
            } else {
                logger.severe("Payment failed with status: " + response.statusCode() + 
                            ", body: " + response.body());
                return PaymentResult.builder()
                    .success(false)
                    .errorMessage("Payment failed: HTTP " + response.statusCode())
                    .build();
            }
            
        } catch (java.net.http.HttpTimeoutException e) {
            logger.severe("Payment request timed out after " + requestTimeout.toMillis() + "ms");
            throw new RuntimeException("Payment gateway timeout", e);
            
        } catch (java.net.ConnectException e) {
            logger.severe("Cannot connect to payment gateway: " + e.getMessage());
            throw new RuntimeException("Payment gateway unreachable", e);
            
        } catch (IOException e) {
            logger.severe("IO error during payment request: " + e.getMessage());
            throw new RuntimeException("Payment gateway communication error", e);
        }
    }
    
    private String getApiKey() {
        return System.getProperty("payment.api.key", "your-api-key-here");
    }
    
    public HealthStatus getHealthStatus() {
        return new HealthStatus(
            circuitState.toString(),
            failureCount,
            lastFailureTime,
            requestTimeout.toMillis()
        );
    }
    
    // Configuration class
    private static class TimeoutConfig {
        final long paymentTimeoutMs;
        final int maxRetries;
        final long retryDelayMs;
        final double backoffMultiplier;
        final long jitterMs;
        final int failureThreshold;
        final long recoveryTimeoutMs;
        
        TimeoutConfig(long paymentTimeoutMs, int maxRetries, long retryDelayMs, 
                     double backoffMultiplier, long jitterMs, int failureThreshold, 
                     long recoveryTimeoutMs) {
            this.paymentTimeoutMs = paymentTimeoutMs;
            this.maxRetries = maxRetries;
            this.retryDelayMs = retryDelayMs;
            this.backoffMultiplier = backoffMultiplier;
            this.jitterMs = jitterMs;
            this.failureThreshold = failureThreshold;
            this.recoveryTimeoutMs = recoveryTimeoutMs;
        }
    }
    
    // Health status class
    public static class HealthStatus {
        private final String circuitState;
        private final int failureCount;
        private final long lastFailureTime;
        private final long timeoutMs;
        
        public HealthStatus(String circuitState, int failureCount, long lastFailureTime, long timeoutMs) {
            this.circuitState = circuitState;
            this.failureCount = failureCount;
            this.lastFailureTime = lastFailureTime;
            this.timeoutMs = timeoutMs;
        }
        
        // Getters
        public String getCircuitState() { return circuitState; }
        public int getFailureCount() { return failureCount; }
        public long getLastFailureTime() { return lastFailureTime; }
        public long getTimeoutMs() { return timeoutMs; }
    }
    
    // Inner classes for request/response
    public static class PaymentRequest {
        private double amount;
        private String currency;
        private String paymentMethod;
        private String customerId;
        
        // Getters and setters
        public double getAmount() { return amount; }
        public void setAmount(double amount) { this.amount = amount; }
        
        public String getCurrency() { return currency; }
        public void setCurrency(String currency) { this.currency = currency; }
        
        public String getPaymentMethod() { return paymentMethod; }
        public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
        
        public String getCustomerId() { return customerId; }
        public void setCustomerId(String customerId) { this.customerId = customerId; }
    }
    
    public static class PaymentResult {
        private boolean success;
        private String transactionId;
        private double amount;
        private String currency;
        private String errorMessage;
        
        public static Builder builder() {
            return new Builder();
        }
        
        // Getters
        public boolean isSuccess() { return success; }
        public String getTransactionId() { return transactionId; }
        public double getAmount() { return amount; }
        public String getCurrency() { return currency; }
        public String getErrorMessage() { return errorMessage; }
        
        public static class Builder {
            private PaymentResult result = new PaymentResult();
            
            public Builder success(boolean success) {
                result.success = success;
                return this;
            }
            
            public Builder transactionId(String transactionId) {
                result.transactionId = transactionId;
                return this;
            }
            
            public Builder amount(double amount) {
                result.amount = amount;
                return this;
            }
            
            public Builder currency(String currency) {
                result.currency = currency;
                return this;
            }
            
            public Builder errorMessage(String errorMessage) {
                result.errorMessage = errorMessage;
                return this;
            }
            
            public PaymentResult build() {
                return result;
            }
        }
    }
}