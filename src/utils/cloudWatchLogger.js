/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey
});

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  try {
    const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(context)}`;
    
    await logs.putLogEvents({
      logGroupName: cloudWatchConfig.logGroupName,
      logStreamName: streamName || cloudWatchConfig.logStreamName,
      logEvents: [{
        timestamp: Date.now(),
        message: logMessage
      }]
    }).promise();
    
    console.log(`${level} logged to CloudWatch:`, message);
  } catch (err) {
    console.log('Failed to log to CloudWatch:', err);
    // Fallback: log to console
    console.log(`${level} (fallback):`, message, context);
  }
}

/**
 * Log an error to CloudWatch (backwards compatibility)
 * @param {string} message - Error message to log
 * @param {Object} context - Additional context information
 */
async function logError(message, context = {}) {
  return logToCloudWatch(message, 'ERROR', context);
}

/**
 * Comprehensive CloudWatch Logger with all log levels
 */
export const cloudWatchLogger = {
  // Main logging function for all levels
  async logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
    return logToCloudWatch(message, level, context, streamName);
  },

  // Log level shortcuts
  async info(message, context = {}) {
    return logToCloudWatch(message, 'INFO', context, cloudWatchConfig.activityStreamName);
  },

  async warn(message, context = {}) {
    return logToCloudWatch(message, 'WARN', context, cloudWatchConfig.activityStreamName);
  },

  async debug(message, context = {}) {
    return logToCloudWatch(message, 'DEBUG', context, cloudWatchConfig.activityStreamName);
  },

  async error(message, context = {}) {
    return logError(message, context);
  },

  // Activity logging
  async logPageView(pageName, context = {}) {
    return logToCloudWatch(`Page viewed: ${pageName}`, 'INFO', {
      type: 'page_view',
      page: pageName,
      url: window.location.href,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logButtonClick(buttonName, context = {}) {
    return logToCloudWatch(`Button clicked: ${buttonName}`, 'INFO', {
      type: 'button_click',
      button: buttonName,
      url: window.location.href,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logUserAction(action, context = {}) {
    return logToCloudWatch(`User action: ${action}`, 'INFO', {
      type: 'user_action',
      action: action,
      url: window.location.href,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logNavigation(from, to, context = {}) {
    return logToCloudWatch(`Navigation: ${from} → ${to}`, 'INFO', {
      type: 'navigation',
      from: from,
      to: to,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Database errors
  async databaseError(error, operation = 'unknown') {
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown'
    });
  },

  // API errors
  async apiError(error, endpoint = 'unknown') {
    return logError(`API call to ${endpoint} failed: ${error.message}`, {
      type: 'api',
      endpoint,
      status: error.status || 'unknown'
    });
  },

  // Payment errors with enhanced timeout handling
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      timeout: error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT',
      connectionError: error.message.includes('connection') || error.message.includes('timeout')
    };
    
    // Enhanced error message for payment timeouts
    let errorMessage = `Payment processing failed: ${error.message}`;
    if (errorContext.timeout) {
      errorMessage = `Payment service connection failed - timeout after 5000ms: ${error.message}`;
    }
    
    return logError(errorMessage, errorContext);
  },

  // Database errors with connection pool monitoring
  async databaseError(error, operation = 'unknown') {
    const errorContext = {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      poolExhausted: error.message.includes('connection pool exhausted') || 
                     error.message.includes('Too many connections') ||
                     error.code === 'POOL_CLOSED',
      timeout: error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.message.includes('timeout')
    };
    
    // Enhanced error message for pool exhaustion
    let errorMessage = `Database ${operation} failed: ${error.message}`;
    if (errorContext.poolExhausted) {
      errorMessage = `Database query failed: connection pool exhausted - ${error.message}`;
    }
    
    return logError(errorMessage, errorContext);
  },

  // Connection timeout specific logging
  async connectionTimeout(service, timeout, error = null) {
    return logError(`${service} connection timeout after ${timeout}ms`, {
      type: 'connection_timeout',
      service,
      timeout,
      error: error ? error.message : null
    });
  },

  // Pool exhaustion specific logging
  async poolExhaustion(poolType, stats = {}) {
    return logError(`${poolType} connection pool exhausted`, {
      type: 'pool_exhaustion',
      poolType,
      stats
    });
  },

  // Service health monitoring
  async serviceHealth(serviceName, status, metrics = {}) {
    const level = status === 'healthy' ? 'INFO' : 'ERROR';
    return logToCloudWatch(`Service ${serviceName} health: ${status}`, level, {
      type: 'service_health',
      service: serviceName,
      status,
      metrics
    });
  },

  // Authentication errors
  async authError(error, action = 'unknown') {
    return logError(`Authentication ${action} failed: ${error.message}`, {
      type: 'authentication',
      action,
      errorCode: error.code || 'unknown'
    });
  },

  // Component errors
  async componentError(error, componentName, method = 'unknown') {
    return logError(`Component ${componentName}.${method} error: ${error.message}`, {
      type: 'component',
      component: componentName,
      method
    });
  },

  // Firebase errors
  async firebaseError(error, operation = 'unknown') {
    return logError(`Firebase ${operation} failed: ${error.message}`, {
      type: 'firebase',
      operation,
      errorCode: error.code || 'unknown'
    });
  }
};

export default cloudWatchLogger;
