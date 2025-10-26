package com.checkout.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public class PaymentGateway {
    
    private static final Logger logger = LoggerFactory.getLogger(PaymentGateway.class);
    
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final Map<String, Object> config;
    private final String paymentServiceUrl;
    
    public PaymentGateway() {
        this.config = loadConfiguration();
        this.objectMapper = new ObjectMapper();
        this.paymentServiceUrl = getPaymentServiceUrl();
        this.httpClient = createHttpClient();
    }
    
    private Map<String, Object> loadConfiguration() {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode configNode = mapper.readTree(
                getClass().getClassLoader().getResourceAsStream("config/timeout.json")
            );
            
            Map<String, Object> config = new HashMap<>();
            config.put("payment_service", mapper.convertValue(
                configNode.get("payment_service"), Map.class));
            config.put("api", mapper.convertValue(
                configNode.get("api"), Map.class));
            
            return config;
        } catch (Exception e) {
            logger.warn("Failed to load configuration, using defaults: {}", e.getMessage());
            return getDefaultConfiguration();
        }
    }
    
    private Map<String, Object> getDefaultConfiguration() {
        Map<String, Object> config = new HashMap<>();
        
        Map<String, Object> paymentConfig = new HashMap<>();
        paymentConfig.put("timeout_ms", 30000);
        paymentConfig.put("retry_attempts", 3);
        paymentConfig.put("retry_delay_ms", 1000);
        paymentConfig.put("connection_timeout_ms", 10000);
        
        Map<String, Object> apiConfig = new HashMap<>();
        apiConfig.put("request_timeout_ms", 25000);
        apiConfig.put("keepalive_timeout_ms", 5000);
        
        config.put("payment_service", paymentConfig);
        config.put("api", apiConfig);
        
        return config;
    }
    
    private String getPaymentServiceUrl() {
        String url = System.getenv("PAYMENT_SERVICE_URL");
        return url != null ? url : "https://api.payment-service.internal";
    }
    
    private HttpClient createHttpClient() {
        Map<String, Object> apiConfig = (Map<String, Object>) config.get("api");
        int requestTimeoutMs = (Integer) apiConfig.getOrDefault("request_timeout_ms", 25000);
        int keepaliveTimeoutMs = (Integer) apiConfig.getOrDefault("keepalive_timeout_ms", 5000);
        
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(keepaliveTimeoutMs))
                .build();
    }
    
    public PaymentResult processPayment(PaymentRequest paymentRequest) {
        Map<String, Object> paymentConfig = (Map<String, Object>) config.get("payment_service");
        int maxRetries = (Integer) paymentConfig.getOrDefault("retry_attempts", 3);
        int retryDelayMs = (Integer) paymentConfig.getOrDefault("retry_delay_ms", 1000);
        
        Exception lastException = null;
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info("Processing payment attempt {}/{}", attempt, maxRetries);
                
                PaymentResult result = executePaymentRequest(paymentRequest);
                
                if (result.isSuccess()) {
                    logger.info("Payment processed successfully on attempt {}", attempt);
                    return result;
                } else {
                    throw new RuntimeException("Payment failed: " + result.getErrorMessage());
                }
                
            } catch (Exception e) {
                lastException = e;
                logger.warn("Payment attempt {} failed: {}", attempt, e.getMessage());
                
                if (attempt < maxRetries) {
                    try {
                        logger.info("Retrying payment in {}ms...", retryDelayMs);
                        Thread.sleep(retryDelayMs);
                        // Exponential backoff
                        retryDelayMs = (int) (retryDelayMs * 1.5);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("Payment processing interrupted", ie);
                    }
                }
            }
        }
        
        logger.error("Payment processing failed after {} attempts", maxRetries);
        throw new RuntimeException("Payment gateway unreachable", lastException);
    }
    
    private PaymentResult executePaymentRequest(PaymentRequest paymentRequest) throws Exception {
        Map<String, Object> paymentConfig = (Map<String, Object>) config.get("payment_service");
        int timeoutMs = (Integer) paymentConfig.getOrDefault("timeout_ms", 30000);
        
        String requestBody = objectMapper.writeValueAsString(paymentRequest);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(paymentServiceUrl + "/v1/charges"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + getApiKey())
                .header("User-Agent", "checkout-api/1.0")
                .timeout(Duration.ofMillis(timeoutMs))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();
        
        try {
            logger.info("Sending payment request to {} with timeout {}ms", 
                       paymentServiceUrl, timeoutMs);
            
            HttpResponse<String> response = httpClient.send(request, 
                HttpResponse.BodyHandlers.ofString());
            
            return handlePaymentResponse(response);
            
        } catch (java.net.http.HttpTimeoutException e) {
            logger.error("Payment request timed out after {}ms", timeoutMs);
            throw new RuntimeException("Payment request timeout", e);
        } catch (java.net.ConnectException e) {
            logger.error("Failed to connect to payment service: {}", e.getMessage());
            throw new RuntimeException("Payment gateway unreachable", e);
        } catch (IOException e) {
            logger.error("Payment request failed: {}", e.getMessage());
            throw new RuntimeException("Payment processing error", e);
        }
    }
    
    private PaymentResult handlePaymentResponse(HttpResponse<String> response) throws IOException {
        int statusCode = response.statusCode();
        String responseBody = response.body();
        
        logger.info("Payment service response: {} - {}", statusCode, responseBody);
        
        if (statusCode == 200) {
            JsonNode responseJson = objectMapper.readTree(responseBody);
            return PaymentResult.success(
                responseJson.get("transaction_id").asText(),
                responseJson.get("amount").asDouble()
            );
        } else if (statusCode == 400) {
            JsonNode errorJson = objectMapper.readTree(responseBody);
            String errorMessage = errorJson.has("message") ? 
                errorJson.get("message").asText() : "Bad request";
            return PaymentResult.failure("Invalid payment data: " + errorMessage);
        } else if (statusCode == 401) {
            return PaymentResult.failure("Authentication failed - invalid API key");
        } else if (statusCode == 429) {
            return PaymentResult.failure("Rate limit exceeded - too many requests");
        } else if (statusCode >= 500) {
            return PaymentResult.failure("Payment service error: " + statusCode);
        } else {
            return PaymentResult.failure("Unexpected response: " + statusCode);
        }
    }
    
    private String getApiKey() {
        String apiKey = System.getenv("PAYMENT_API_KEY");
        if (apiKey == null) {
            logger.warn("PAYMENT_API_KEY not set, using default");
            return "test_key_12345";
        }
        return apiKey;
    }
    
    public CompletableFuture<PaymentResult> processPaymentAsync(PaymentRequest paymentRequest) {
        return CompletableFuture.supplyAsync(() -> processPayment(paymentRequest));
    }
    
    public HealthCheckResult healthCheck() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(paymentServiceUrl + "/health"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            
            long startTime = System.currentTimeMillis();
            HttpResponse<String> response = httpClient.send(request, 
                HttpResponse.BodyHandlers.ofString());
            long responseTime = System.currentTimeMillis() - startTime;
            
            boolean isHealthy = response.statusCode() == 200;
            
            return new HealthCheckResult(isHealthy, responseTime, response.statusCode());
            
        } catch (Exception e) {
            logger.error("Health check failed: {}", e.getMessage());
            return new HealthCheckResult(false, -1, -1, e.getMessage());
        }
    }
    
    // Inner classes for request/response handling
    public static class PaymentRequest {
        private double amount;
        private String paymentMethod;
        private String currency;
        private Map<String, Object> metadata;
        
        // Constructors, getters, and setters
        public PaymentRequest() {}
        
        public PaymentRequest(double amount, String paymentMethod, String currency) {
            this.amount = amount;
            this.paymentMethod = paymentMethod;
            this.currency = currency;
            this.metadata = new HashMap<>();
        }
        
        // Getters and setters
        public double getAmount() { return amount; }
        public void setAmount(double amount) { this.amount = amount; }
        
        public String getPaymentMethod() { return paymentMethod; }
        public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
        
        public String getCurrency() { return currency; }
        public void setCurrency(String currency) { this.currency = currency; }
        
        public Map<String, Object> getMetadata() { return metadata; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
    }
    
    public static class PaymentResult {
        private boolean success;
        private String transactionId;
        private double amount;
        private String errorMessage;
        
        private PaymentResult(boolean success, String transactionId, double amount, String errorMessage) {
            this.success = success;
            this.transactionId = transactionId;
            this.amount = amount;
            this.errorMessage = errorMessage;
        }
        
        public static PaymentResult success(String transactionId, double amount) {
            return new PaymentResult(true, transactionId, amount, null);
        }
        
        public static PaymentResult failure(String errorMessage) {
            return new PaymentResult(false, null, 0, errorMessage);
        }
        
        // Getters
        public boolean isSuccess() { return success; }
        public String getTransactionId() { return transactionId; }
        public double getAmount() { return amount; }
        public String getErrorMessage() { return errorMessage; }
    }
    
    public static class HealthCheckResult {
        private boolean healthy;
        private long responseTimeMs;
        private int statusCode;
        private String errorMessage;
        
        public HealthCheckResult(boolean healthy, long responseTimeMs, int statusCode) {
            this(healthy, responseTimeMs, statusCode, null);
        }
        
        public HealthCheckResult(boolean healthy, long responseTimeMs, int statusCode, String errorMessage) {
            this.healthy = healthy;
            this.responseTimeMs = responseTimeMs;
            this.statusCode = statusCode;
            this.errorMessage = errorMessage;
        }
        
        // Getters
        public boolean isHealthy() { return healthy; }
        public long getResponseTimeMs() { return responseTimeMs; }
        public int getStatusCode() { return statusCode; }
        public String getErrorMessage() { return errorMessage; }
    }
}