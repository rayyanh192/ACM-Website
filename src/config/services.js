/**
 * Service Configuration
 * Centralized configuration for all external services
 */

export const serviceConfig = {
  // Payment Service Configuration
  payment: {
    baseUrl: process.env.VUE_APP_PAYMENT_SERVICE_URL || 'https://api.payment-service.com',
    apiKey: process.env.VUE_APP_PAYMENT_API_KEY,
    timeout: parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 5000,
    retryAttempts: parseInt(process.env.VUE_APP_PAYMENT_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.VUE_APP_PAYMENT_RETRY_DELAY) || 1000,
    circuitBreaker: {
      threshold: parseInt(process.env.VUE_APP_PAYMENT_CB_THRESHOLD) || 5,
      resetTimeout: parseInt(process.env.VUE_APP_PAYMENT_CB_RESET_TIMEOUT) || 30000
    }
  },

  // Database Service Configuration
  database: {
    baseUrl: process.env.VUE_APP_DATABASE_SERVICE_URL || 'https://api.database-service.com',
    apiKey: process.env.VUE_APP_DATABASE_API_KEY,
    timeout: parseInt(process.env.VUE_APP_DATABASE_TIMEOUT) || 10000,
    maxRetries: parseInt(process.env.VUE_APP_DATABASE_MAX_RETRIES) || 3,
    connectionPool: {
      maxConnections: parseInt(process.env.VUE_APP_DB_MAX_CONNECTIONS) || 20,
      connectionTimeout: parseInt(process.env.VUE_APP_DB_CONNECTION_TIMEOUT) || 30000,
      idleTimeout: parseInt(process.env.VUE_APP_DB_IDLE_TIMEOUT) || 300000
    },
    circuitBreaker: {
      threshold: parseInt(process.env.VUE_APP_DATABASE_CB_THRESHOLD) || 5,
      resetTimeout: parseInt(process.env.VUE_APP_DATABASE_CB_RESET_TIMEOUT) || 60000
    }
  },

  // General Service Configuration
  general: {
    defaultTimeout: parseInt(process.env.VUE_APP_DEFAULT_SERVICE_TIMEOUT) || 10000,
    defaultRetries: parseInt(process.env.VUE_APP_DEFAULT_SERVICE_RETRIES) || 3,
    healthCheckInterval: parseInt(process.env.VUE_APP_HEALTH_CHECK_INTERVAL) || 60000
  }
};

export default serviceConfig;