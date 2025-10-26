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

  // Payment errors
  async paymentError(error, transactionId = null) {
    return logError(`Payment processing failed: ${error.message}`, {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown'
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
  },

  // Enhanced timeout error logging
  async timeoutError(service, operation, timeout, context = {}) {
    return logError(`${service} ${operation} timeout after ${timeout}ms`, {
      type: 'timeout',
      service,
      operation,
      timeout,
      ...context
    });
  },

  // Connection pool monitoring
  async connectionPoolStatus(service, stats) {
    return logToCloudWatch(`Connection pool status for ${service}`, 'INFO', {
      type: 'connection_pool_status',
      service,
      activeConnections: stats.activeConnections,
      maxConnections: stats.maxConnections,
      waitingQueue: stats.waitingQueue,
      isHealthy: stats.isHealthy,
      ...stats
    }, cloudWatchConfig.activityStreamName);
  },

  // Connection pool exhaustion (matching the specific error from logs)
  async connectionPoolExhausted(service, context = {}) {
    return logError(`Database query failed: connection pool exhausted for ${service}`, {
      type: 'connection_pool_exhausted',
      service,
      ...context
    });
  },

  // Payment service connection timeout (matching the specific error from logs)
  async paymentServiceTimeout(timeout = 5000, context = {}) {
    return logError(`Payment service connection failed - timeout after ${timeout}ms`, {
      type: 'payment_service_timeout',
      timeout,
      service: 'payment',
      ...context
    });
  },

  // HTTPSConnectionPool timeout (matching the traceback from logs)
  async httpsConnectionPoolTimeout(endpoint, context = {}) {
    return logError(`HTTPSConnectionPool timeout for ${endpoint}`, {
      type: 'https_connection_pool_timeout',
      endpoint,
      service: 'payment',
      traceback: 'ConnectionError: HTTPSConnectionPool timeout',
      ...context
    });
  },

  // Service health monitoring
  async serviceHealth(service, isHealthy, metrics = {}) {
    const level = isHealthy ? 'INFO' : 'ERROR';
    const message = `Service ${service} health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`;
    
    return logToCloudWatch(message, level, {
      type: 'service_health',
      service,
      healthy: isHealthy,
      ...metrics
    }, cloudWatchConfig.activityStreamName);
  },

  // Circuit breaker state changes
  async circuitBreakerStateChange(service, oldState, newState, context = {}) {
    return logToCloudWatch(`Circuit breaker for ${service}: ${oldState} → ${newState}`, 'WARN', {
      type: 'circuit_breaker_state_change',
      service,
      oldState,
      newState,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Retry attempt logging
  async retryAttempt(service, operation, attempt, maxAttempts, delay, error) {
    return logToCloudWatch(`Retry ${attempt}/${maxAttempts} for ${service} ${operation} in ${delay}ms`, 'WARN', {
      type: 'retry_attempt',
      service,
      operation,
      attempt,
      maxAttempts,
      delay,
      error: error.message
    }, cloudWatchConfig.activityStreamName);
  },

  // Performance monitoring
  async performanceMetric(service, operation, duration, context = {}) {
    const level = duration > 5000 ? 'WARN' : 'INFO'; // Warn if operation takes more than 5 seconds
    
    return logToCloudWatch(`${service} ${operation} completed in ${duration}ms`, level, {
      type: 'performance_metric',
      service,
      operation,
      duration,
      slow: duration > 5000,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Batch error logging for multiple related errors
  async batchErrors(errors, context = {}) {
    const errorSummary = errors.map(err => ({
      message: err.message,
      type: err.type || 'unknown',
      timestamp: err.timestamp || Date.now()
    }));

    return logError(`Batch of ${errors.length} errors occurred`, {
      type: 'batch_errors',
      errorCount: errors.length,
      errors: errorSummary,
      ...context
    });
  },

  // System resource monitoring
  async resourceUsage(metrics) {
    return logToCloudWatch('System resource usage', 'INFO', {
      type: 'resource_usage',
      ...metrics
    }, cloudWatchConfig.activityStreamName);
  }
};

export default cloudWatchLogger;
