/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 * Enhanced with connection pool management and timeout handling
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs with enhanced timeout settings
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey,
  httpOptions: {
    timeout: 30000, // 30 second timeout
    connectTimeout: 10000 // 10 second connection timeout
  },
  maxRetries: 3,
  retryDelayOptions: {
    customBackoff: function(retryCount) {
      return Math.pow(2, retryCount) * 1000; // Exponential backoff
    }
  }
});

/**
 * Log any message to CloudWatch with specified level
 * Enhanced with better error handling and timeout management
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  const startTime = Date.now();
  
  try {
    const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(context)}`;
    
    const params = {
      logGroupName: cloudWatchConfig.logGroupName,
      logStreamName: streamName || cloudWatchConfig.logStreamName,
      logEvents: [{
        timestamp: Date.now(),
        message: logMessage
      }]
    };

    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('CloudWatch logging timeout')), 15000);
    });

    await Promise.race([
      logs.putLogEvents(params).promise(),
      timeoutPromise
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`${level} logged to CloudWatch in ${duration}ms:`, message);
    
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Failed to log to CloudWatch after ${duration}ms:`, err);
    
    // Enhanced fallback logging with error details
    console.log(`${level} (fallback):`, message, {
      ...context,
      cloudWatchError: err.message,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Don't throw the error to prevent cascading failures
    // Just log it for monitoring
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

  // Database errors - Enhanced with connection pool monitoring
  async databaseError(error, operation = 'unknown') {
    const errorContext = {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      errorName: error.name || 'unknown'
    };

    // Add specific handling for connection pool errors
    if (error.message.includes('pool exhausted') || error.message.includes('connection pool')) {
      errorContext.poolStatus = 'exhausted';
      errorContext.errorType = 'connection_pool';
    } else if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      errorContext.errorType = 'timeout';
      errorContext.timeoutType = 'database_connection';
    }

    return logError(`Database ${operation} failed: ${error.message}`, errorContext);
  },

  // API errors
  async apiError(error, endpoint = 'unknown') {
    return logError(`API call to ${endpoint} failed: ${error.message}`, {
      type: 'api',
      endpoint,
      status: error.status || 'unknown'
    });
  },

  // Payment errors - Enhanced with connection timeout handling
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      errorName: error.name || 'unknown'
    };

    // Add specific handling for payment timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      errorContext.timeoutType = 'payment_service';
      errorContext.originalTimeout = error.timeout || 'unknown';
    }

    return logError(`Payment processing failed: ${error.message}`, errorContext);
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
  },

  // Connection pool errors - New method for connection pool monitoring
  async connectionPoolError(error, poolType = 'http', poolStats = {}) {
    return logError(`Connection pool ${poolType} error: ${error.message}`, {
      type: 'connection_pool',
      poolType,
      poolStats,
      errorCode: error.code || 'unknown',
      errorName: error.name || 'unknown'
    });
  },

  // System health monitoring
  async systemHealth(component, status, metrics = {}) {
    const level = status === 'healthy' ? 'INFO' : 'WARN';
    return logToCloudWatch(`System health check: ${component} is ${status}`, level, {
      type: 'health_check',
      component,
      status,
      metrics,
      timestamp: new Date().toISOString()
    });
  }
};

export default cloudWatchLogger;
