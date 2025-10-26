/**
 * Database Configuration for Enhanced Connection Management
 * Provides centralized settings for Firebase and CloudWatch connections
 */

export const databaseConfig = {
  // Firebase connection settings
  firebase: {
    maxRetries: parseInt(process.env.VUE_APP_FIREBASE_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.VUE_APP_FIREBASE_RETRY_DELAY) || 1000,
    timeout: parseInt(process.env.VUE_APP_FIREBASE_TIMEOUT) || 30000,
    maxConcurrentOperations: parseInt(process.env.VUE_APP_FIREBASE_MAX_CONCURRENT) || 10,
    
    // Connection pool settings
    connectionPool: {
      maxConnections: parseInt(process.env.VUE_APP_FIREBASE_MAX_CONNECTIONS) || 50,
      idleTimeout: parseInt(process.env.VUE_APP_FIREBASE_IDLE_TIMEOUT) || 60000,
      connectionTimeout: parseInt(process.env.VUE_APP_FIREBASE_CONNECTION_TIMEOUT) || 10000
    },
    
    // Health check settings
    healthCheck: {
      interval: parseInt(process.env.VUE_APP_FIREBASE_HEALTH_CHECK_INTERVAL) || 30000,
      timeout: parseInt(process.env.VUE_APP_FIREBASE_HEALTH_CHECK_TIMEOUT) || 5000,
      maxFailures: parseInt(process.env.VUE_APP_FIREBASE_MAX_HEALTH_FAILURES) || 3
    }
  },
  
  // CloudWatch connection settings
  cloudWatch: {
    maxRetries: parseInt(process.env.VUE_APP_CLOUDWATCH_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.VUE_APP_CLOUDWATCH_RETRY_DELAY) || 1000,
    timeout: parseInt(process.env.VUE_APP_CLOUDWATCH_TIMEOUT) || 30000,
    maxConcurrentRequests: parseInt(process.env.VUE_APP_CLOUDWATCH_MAX_CONCURRENT) || 5,
    
    // Batch processing settings
    batchSize: parseInt(process.env.VUE_APP_CLOUDWATCH_BATCH_SIZE) || 10,
    batchTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_BATCH_TIMEOUT) || 5000,
    
    // Circuit breaker settings
    circuitBreaker: {
      failureThreshold: parseInt(process.env.VUE_APP_CLOUDWATCH_FAILURE_THRESHOLD) || 5,
      resetTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_RESET_TIMEOUT) || 60000,
      monitoringPeriod: parseInt(process.env.VUE_APP_CLOUDWATCH_MONITORING_PERIOD) || 10000
    }
  },
  
  // General connection settings
  general: {
    // Default timeout for all operations
    defaultTimeout: parseInt(process.env.VUE_APP_DEFAULT_TIMEOUT) || 30000,
    
    // Connection monitoring
    monitoring: {
      enabled: process.env.VUE_APP_CONNECTION_MONITORING === 'true',
      logInterval: parseInt(process.env.VUE_APP_MONITORING_LOG_INTERVAL) || 60000,
      alertThreshold: parseFloat(process.env.VUE_APP_MONITORING_ALERT_THRESHOLD) || 0.95
    },
    
    // Error handling
    errorHandling: {
      maxConsecutiveFailures: parseInt(process.env.VUE_APP_MAX_CONSECUTIVE_FAILURES) || 5,
      backoffMultiplier: parseFloat(process.env.VUE_APP_BACKOFF_MULTIPLIER) || 2,
      maxBackoffDelay: parseInt(process.env.VUE_APP_MAX_BACKOFF_DELAY) || 30000
    }
  }
};

// Connection status constants
export const CONNECTION_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  DISCONNECTED: 'disconnected'
};

// Error types for better categorization
export const ERROR_TYPES = {
  TIMEOUT: 'timeout',
  CONNECTION_REFUSED: 'connection_refused',
  NETWORK_ERROR: 'network_error',
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT: 'rate_limit',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  UNKNOWN: 'unknown'
};

// Helper function to get environment-specific configuration
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  const envConfigs = {
    development: {
      firebase: {
        ...databaseConfig.firebase,
        timeout: 10000, // Shorter timeout for development
        maxConcurrentOperations: 5
      },
      cloudWatch: {
        ...databaseConfig.cloudWatch,
        batchSize: 5, // Smaller batches for development
        timeout: 10000
      }
    },
    production: {
      firebase: {
        ...databaseConfig.firebase,
        maxConcurrentOperations: 20, // Higher concurrency for production
        timeout: 45000 // Longer timeout for production
      },
      cloudWatch: {
        ...databaseConfig.cloudWatch,
        batchSize: 25, // Larger batches for production
        maxConcurrentRequests: 10
      }
    }
  };
  
  return envConfigs[env] || databaseConfig;
}

export default databaseConfig;