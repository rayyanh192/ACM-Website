/**
 * Payment Service Configuration
 * Centralized configuration for payment processing with timeout management
 */

export const paymentConfig = {
  // Timeout configurations (in milliseconds)
  timeouts: {
    // Standard payment processing timeout
    payment: parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 30000, // 30 seconds
    
    // Payment validation timeout
    validation: parseInt(process.env.VUE_APP_PAYMENT_VALIDATION_TIMEOUT) || 10000, // 10 seconds
    
    // Payment status check timeout
    statusCheck: parseInt(process.env.VUE_APP_PAYMENT_STATUS_TIMEOUT) || 15000, // 15 seconds
    
    // Refund processing timeout
    refund: parseInt(process.env.VUE_APP_PAYMENT_REFUND_TIMEOUT) || 45000, // 45 seconds
  },

  // Retry configuration
  retry: {
    // Maximum number of retry attempts
    maxAttempts: parseInt(process.env.VUE_APP_PAYMENT_RETRY_ATTEMPTS) || 3,
    
    // Base delay between retries (exponential backoff)
    baseDelay: parseInt(process.env.VUE_APP_PAYMENT_RETRY_DELAY) || 1000, // 1 second
    
    // Maximum delay between retries
    maxDelay: parseInt(process.env.VUE_APP_PAYMENT_RETRY_MAX_DELAY) || 10000, // 10 seconds
  },

  // API endpoints
  endpoints: {
    // Payment processing endpoint
    process: process.env.VUE_APP_PAYMENT_ENDPOINT || '/api/payment/process',
    
    // Payment validation endpoint
    validate: process.env.VUE_APP_PAYMENT_VALIDATE_ENDPOINT || '/api/payment/validate',
    
    // Payment status endpoint
    status: process.env.VUE_APP_PAYMENT_STATUS_ENDPOINT || '/api/payment/status',
    
    // Refund endpoint
    refund: process.env.VUE_APP_PAYMENT_REFUND_ENDPOINT || '/api/payment/refund',
  },

  // Payment providers configuration
  providers: {
    // Default payment provider
    default: process.env.VUE_APP_PAYMENT_PROVIDER || 'stripe',
    
    // Provider-specific configurations
    stripe: {
      publicKey: process.env.VUE_APP_STRIPE_PUBLIC_KEY,
      timeout: parseInt(process.env.VUE_APP_STRIPE_TIMEOUT) || 25000,
    },
    
    paypal: {
      clientId: process.env.VUE_APP_PAYPAL_CLIENT_ID,
      timeout: parseInt(process.env.VUE_APP_PAYPAL_TIMEOUT) || 30000,
    },
  },

  // Circuit breaker configuration
  circuitBreaker: {
    // Failure threshold before opening circuit
    failureThreshold: parseInt(process.env.VUE_APP_PAYMENT_FAILURE_THRESHOLD) || 5,
    
    // Time to wait before attempting to close circuit (in milliseconds)
    resetTimeout: parseInt(process.env.VUE_APP_PAYMENT_RESET_TIMEOUT) || 60000, // 1 minute
    
    // Monitoring window for failure counting (in milliseconds)
    monitoringWindow: parseInt(process.env.VUE_APP_PAYMENT_MONITORING_WINDOW) || 120000, // 2 minutes
  },

  // Error handling configuration
  errors: {
    // Enable detailed error logging
    enableDetailedLogging: process.env.VUE_APP_PAYMENT_DETAILED_LOGGING !== 'false',
    
    // Enable user-friendly error messages
    enableUserFriendlyMessages: process.env.VUE_APP_PAYMENT_USER_FRIENDLY_ERRORS !== 'false',
    
    // Timeout error codes
    timeoutErrorCodes: ['TIMEOUT', 'REQUEST_TIMEOUT', 'GATEWAY_TIMEOUT', 'SERVICE_UNAVAILABLE'],
  },

  // Development/debugging settings
  development: {
    // Enable mock payment processing in development
    enableMockPayments: process.env.NODE_ENV === 'development' && process.env.VUE_APP_MOCK_PAYMENTS === 'true',
    
    // Mock payment delay (for testing timeout scenarios)
    mockDelay: parseInt(process.env.VUE_APP_MOCK_PAYMENT_DELAY) || 2000,
    
    // Enable verbose logging in development
    enableVerboseLogging: process.env.NODE_ENV === 'development',
  }
};

export default paymentConfig;