/**
 * Service Configuration for External API Calls and Database Connections
 * Handles timeout, retry, and connection pool settings
 */

export const serviceConfig = {
  // Payment Service Configuration
  payment: {
    baseUrl: process.env.VUE_APP_PAYMENT_SERVICE_URL || 'https://api.payment-service.com',
    timeout: parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 5000, // 5 seconds
    retryAttempts: parseInt(process.env.VUE_APP_PAYMENT_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.VUE_APP_PAYMENT_RETRY_DELAY) || 1000, // 1 second
    circuitBreakerThreshold: parseInt(process.env.VUE_APP_PAYMENT_CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.VUE_APP_PAYMENT_CIRCUIT_BREAKER_TIMEOUT) || 60000, // 1 minute
  },

  // Database Configuration
  database: {
    connectionTimeout: parseInt(process.env.VUE_APP_DB_CONNECTION_TIMEOUT) || 10000, // 10 seconds
    queryTimeout: parseInt(process.env.VUE_APP_DB_QUERY_TIMEOUT) || 30000, // 30 seconds
    maxConnections: parseInt(process.env.VUE_APP_DB_MAX_CONNECTIONS) || 10,
    minConnections: parseInt(process.env.VUE_APP_DB_MIN_CONNECTIONS) || 2,
    idleTimeout: parseInt(process.env.VUE_APP_DB_IDLE_TIMEOUT) || 300000, // 5 minutes
    retryAttempts: parseInt(process.env.VUE_APP_DB_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.VUE_APP_DB_RETRY_DELAY) || 2000, // 2 seconds
  },

  // General API Configuration
  api: {
    defaultTimeout: parseInt(process.env.VUE_APP_API_DEFAULT_TIMEOUT) || 8000, // 8 seconds
    maxRetries: parseInt(process.env.VUE_APP_API_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.VUE_APP_API_RETRY_DELAY) || 1500, // 1.5 seconds
    exponentialBackoff: process.env.VUE_APP_API_EXPONENTIAL_BACKOFF === 'true' || true,
    maxRetryDelay: parseInt(process.env.VUE_APP_API_MAX_RETRY_DELAY) || 10000, // 10 seconds
  },

  // Circuit Breaker Configuration
  circuitBreaker: {
    enabled: process.env.VUE_APP_CIRCUIT_BREAKER_ENABLED !== 'false',
    failureThreshold: parseInt(process.env.VUE_APP_CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5,
    recoveryTimeout: parseInt(process.env.VUE_APP_CIRCUIT_BREAKER_RECOVERY_TIMEOUT) || 60000, // 1 minute
    monitoringPeriod: parseInt(process.env.VUE_APP_CIRCUIT_BREAKER_MONITORING_PERIOD) || 120000, // 2 minutes
  },

  // Health Check Configuration
  healthCheck: {
    enabled: process.env.VUE_APP_HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.VUE_APP_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    timeout: parseInt(process.env.VUE_APP_HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
    endpoints: {
      payment: '/health',
      database: '/db-health',
      api: '/status'
    }
  },

  // Logging Configuration
  logging: {
    logLevel: process.env.VUE_APP_LOG_LEVEL || 'INFO',
    logRetries: process.env.VUE_APP_LOG_RETRIES !== 'false',
    logTimeouts: process.env.VUE_APP_LOG_TIMEOUTS !== 'false',
    logCircuitBreaker: process.env.VUE_APP_LOG_CIRCUIT_BREAKER !== 'false',
    logPerformance: process.env.VUE_APP_LOG_PERFORMANCE !== 'false',
  }
};

export default serviceConfig;