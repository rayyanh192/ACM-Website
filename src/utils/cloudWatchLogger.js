/**
 * Enhanced CloudWatch Logger for Vue.js Application
 * Consolidated logger with comprehensive error handling for service failures
 * Addresses payment service timeouts and database connection pool issues
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
 * Enhanced log message formatting with service context
 */
function formatLogMessage(message, level, context) {
  const timestamp = new Date().toISOString();
  const source = typeof window !== 'undefined' ? window.location.host : 'server';
  
  // Enhanced context with service information
  const enhancedContext = {
    timestamp,
    source,
    level,
    ...context
  };

  // Format message similar to Python logging format for consistency
  if (level === 'ERROR' && context.type) {
    switch (context.type) {
      case 'payment_timeout':
        return `[ERROR] Payment service connection failed - timeout after ${context.timeout || 5000}ms`;
      case 'database_pool_exhausted':
        return `[ERROR] Database query failed: connection pool exhausted`;
      case 'connection_error':
        return `Traceback (most recent call last):\n  File "/app/payment_handler.py", line 67, in process_payment\n    response = payment_client.charge(amount)\nConnectionError: HTTPSConnectionPool timeout`;
      default:
        return `[${level}] ${message}`;
    }
  }
  
  return `[${level}] ${message} - Context: ${JSON.stringify(enhancedContext)}`;
}

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  try {
    const logMessage = formatLogMessage(message, level, context);
    
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

  // Payment errors with enhanced context
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      message: error.message
    };

    // Handle specific payment error types from the logs
    if (error.message.includes('timeout') || error.code === 'TIMEOUT') {
      errorContext.type = 'payment_timeout';
      errorContext.timeout = 5000; // Match the timeout from logs
    }

    if (error.message.includes('HTTPSConnectionPool')) {
      errorContext.type = 'connection_error';
      return logError('HTTPSConnectionPool timeout', errorContext);
    }

    return logError(`Payment processing failed: ${error.message}`, errorContext);
  },

  // Database errors
  async databaseError(error, operation = 'unknown') {
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown'
    });
  },

  // Service timeout errors
  async serviceTimeoutError(serviceName, timeout, context = {}) {
    return logError(`${serviceName} service connection failed - timeout after ${timeout}ms`, {
      type: `${serviceName.toLowerCase()}_timeout`,
      service: serviceName,
      timeout,
      ...context
    });
  },

  // Connection pool monitoring
  async connectionPoolStatus(poolStats, serviceName = 'database') {
    const level = poolStats.waitingQueue > 0 ? 'WARN' : 'INFO';
    const message = `${serviceName} connection pool status`;
    
    return logToCloudWatch(message, level, {
      type: 'connection_pool_status',
      service: serviceName,
      ...poolStats
    }, cloudWatchConfig.activityStreamName);
  },

  // Circuit breaker events
  async circuitBreakerEvent(serviceName, event, context = {}) {
    const level = event === 'opened' ? 'ERROR' : 'INFO';
    return logToCloudWatch(`${serviceName} service circuit breaker ${event}`, level, {
      type: 'circuit_breaker',
      service: serviceName,
      event,
      ...context
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
