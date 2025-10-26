/**
 * Database Configuration - JavaScript equivalent of database_config.py
 * Manages database connection settings and configuration
 */

const functions = require("firebase-functions");

/**
 * Database configuration with environment variable support
 */
const databaseConfig = {
  // Primary database connection
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'acm_website',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  
  // Connection pool settings
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000, // 60 seconds
  timeout: parseInt(process.env.DB_TIMEOUT) || 60000, // 60 seconds
  reconnect: process.env.DB_RECONNECT !== 'false',
  
  // Connection pool behavior
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0, // unlimited
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 300000, // 5 minutes
  maxRetries: parseInt(process.env.DB_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.DB_RETRY_DELAY) || 2000, // 2 seconds
  
  // SSL configuration
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_SSL_CA || null,
    cert: process.env.DB_SSL_CERT || null,
    key: process.env.DB_SSL_KEY || null
  },
  
  // Health check settings
  healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
  healthCheckTimeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
  
  // Logging settings
  debug: process.env.DB_DEBUG === 'true',
  logQueries: process.env.DB_LOG_QUERIES === 'true',
  logErrors: process.env.DB_LOG_ERRORS !== 'false'
};

/**
 * Validate database configuration
 * @returns {Object} Validation result
 */
function validateConfig() {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!databaseConfig.host) {
    errors.push('Database host is required');
  }
  
  if (!databaseConfig.database) {
    errors.push('Database name is required');
  }
  
  if (!databaseConfig.user) {
    errors.push('Database user is required');
  }
  
  // Validate numeric values
  if (databaseConfig.connectionLimit <= 0) {
    errors.push('Connection limit must be greater than 0');
  }
  
  if (databaseConfig.acquireTimeout <= 0) {
    errors.push('Acquire timeout must be greater than 0');
  }
  
  if (databaseConfig.timeout <= 0) {
    errors.push('Query timeout must be greater than 0');
  }
  
  // Warnings for potentially problematic settings
  if (databaseConfig.connectionLimit > 50) {
    warnings.push('Connection limit is very high, consider reducing to avoid overwhelming the database');
  }
  
  if (databaseConfig.acquireTimeout > 120000) {
    warnings.push('Acquire timeout is very high, consider reducing to fail faster');
  }
  
  if (!databaseConfig.ssl.rejectUnauthorized && process.env.NODE_ENV === 'production') {
    warnings.push('SSL certificate validation is disabled in production');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get connection string for logging (without password)
 * @returns {string} Safe connection string
 */
function getConnectionString() {
  return `mysql://${databaseConfig.user}:***@${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`;
}

/**
 * Get database configuration for connection pool
 * @returns {Object} Configuration object for mysql2 pool
 */
function getPoolConfig() {
  const config = {
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.database,
    user: databaseConfig.user,
    password: databaseConfig.password,
    connectionLimit: databaseConfig.connectionLimit,
    acquireTimeout: databaseConfig.acquireTimeout,
    timeout: databaseConfig.timeout,
    reconnect: databaseConfig.reconnect,
    queueLimit: databaseConfig.queueLimit,
    idleTimeout: databaseConfig.idleTimeout,
    debug: databaseConfig.debug
  };
  
  // Add SSL configuration if provided
  if (databaseConfig.ssl.ca || databaseConfig.ssl.cert || databaseConfig.ssl.key) {
    config.ssl = {
      rejectUnauthorized: databaseConfig.ssl.rejectUnauthorized,
      ca: databaseConfig.ssl.ca,
      cert: databaseConfig.ssl.cert,
      key: databaseConfig.ssl.key
    };
  }
  
  return config;
}

/**
 * Initialize database configuration and validate
 */
function initializeConfig() {
  console.log('Initializing database configuration...');
  console.log(`Connection string: ${getConnectionString()}`);
  console.log(`Connection limit: ${databaseConfig.connectionLimit}`);
  console.log(`Acquire timeout: ${databaseConfig.acquireTimeout}ms`);
  console.log(`Query timeout: ${databaseConfig.timeout}ms`);
  
  const validation = validateConfig();
  
  if (!validation.valid) {
    console.error('Database configuration validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid database configuration');
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Database configuration warnings:');
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  console.log('Database configuration initialized successfully');
}

/**
 * Get retry configuration for database operations
 * @returns {Object} Retry configuration
 */
function getRetryConfig() {
  return {
    maxRetries: databaseConfig.maxRetries,
    retryDelay: databaseConfig.retryDelay,
    retryCondition: (error) => {
      // Retry on connection errors, timeouts, and temporary failures
      const retryableCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ER_LOCK_WAIT_TIMEOUT',
        'ER_LOCK_DEADLOCK'
      ];
      
      return retryableCodes.includes(error.code) || 
             error.message.includes('connection pool exhausted') ||
             error.message.includes('timeout');
    }
  };
}

/**
 * Log database configuration (for debugging)
 */
function logConfig() {
  if (databaseConfig.debug) {
    console.log('Database Configuration:', {
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database,
      user: databaseConfig.user,
      connectionLimit: databaseConfig.connectionLimit,
      acquireTimeout: databaseConfig.acquireTimeout,
      timeout: databaseConfig.timeout,
      ssl: !!databaseConfig.ssl.ca
    });
  }
}

// Initialize configuration on module load
try {
  initializeConfig();
} catch (error) {
  console.error('Failed to initialize database configuration:', error.message);
  // Don't throw here to allow the module to load, but log the error
}

module.exports = {
  databaseConfig,
  validateConfig,
  getConnectionString,
  getPoolConfig,
  getRetryConfig,
  logConfig,
  initializeConfig
};