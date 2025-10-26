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

  // Database errors with enhanced context
  async databaseError(error, operation = 'unknown') {
    const errorContext = {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      timestamp: new Date().toISOString(),
      isTimeout: error.name === 'TimeoutError' || error.message.includes('timeout'),
      isConnectionError: error.message.includes('connection') || error.message.includes('pool'),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Add specific error categorization for database issues
    if (error.message.includes('connection pool exhausted')) {
      errorContext.category = 'CONNECTION_POOL_EXHAUSTED';
      errorContext.suggestedAction = 'Implement connection pooling and retry logic';
    } else if (error.message.includes('timeout')) {
      errorContext.category = 'DATABASE_TIMEOUT';
      errorContext.suggestedAction = 'Optimize query or increase timeout';
    } else if (error.message.includes('connection')) {
      errorContext.category = 'DATABASE_CONNECTION_ERROR';
      errorContext.suggestedAction = 'Check database connectivity';
    } else if (error.message.includes('permission')) {
      errorContext.category = 'DATABASE_PERMISSION_ERROR';
      errorContext.suggestedAction = 'Verify database permissions';
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

  // Payment errors with enhanced context
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      timestamp: new Date().toISOString(),
      isTimeout: error.name === 'TimeoutError' || error.message.includes('timeout'),
      isConnectionError: error.message.includes('connection') || error.message.includes('network'),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Add specific error categorization
    if (error.message.includes('timeout') || error.message.includes('5000ms')) {
      errorContext.category = 'TIMEOUT_ERROR';
      errorContext.suggestedAction = 'Retry with exponential backoff';
    } else if (error.message.includes('HTTPSConnectionPool')) {
      errorContext.category = 'CONNECTION_POOL_ERROR';
      errorContext.suggestedAction = 'Check connection pool configuration';
    } else if (error.message.includes('connection')) {
      errorContext.category = 'CONNECTION_ERROR';
      errorContext.suggestedAction = 'Verify network connectivity';
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

  // Performance monitoring
  async logPerformanceMetric(metricName, value, unit = 'ms', context = {}) {
    return logToCloudWatch(`Performance metric: ${metricName} = ${value}${unit}`, 'INFO', {
      type: 'performance_metric',
      metricName,
      value,
      unit,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Service health monitoring
  async logServiceHealth(serviceName, status, responseTime = null, context = {}) {
    const healthData = {
      type: 'service_health',
      service: serviceName,
      status, // 'healthy', 'unhealthy', 'degraded'
      timestamp: new Date().toISOString(),
      ...context
    };

    if (responseTime !== null) {
      healthData.responseTime = responseTime;
    }

    return logToCloudWatch(`Service health: ${serviceName} is ${status}`, 'INFO', healthData, cloudWatchConfig.activityStreamName);
  },

  // Connection pool monitoring
  async logConnectionPoolStatus(poolName, status, context = {}) {
    return logToCloudWatch(`Connection pool status: ${poolName}`, 'INFO', {
      type: 'connection_pool_status',
      poolName,
      ...status,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Error rate monitoring
  async logErrorRate(service, errorCount, totalRequests, timeWindow = '1m') {
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    
    return logToCloudWatch(`Error rate: ${service} - ${errorRate.toFixed(2)}%`, 'WARN', {
      type: 'error_rate',
      service,
      errorCount,
      totalRequests,
      errorRate,
      timeWindow,
      timestamp: new Date().toISOString()
    }, cloudWatchConfig.activityStreamName);
  },

  // Circuit breaker status
  async logCircuitBreakerStatus(serviceName, state, context = {}) {
    const level = state === 'OPEN' ? 'ERROR' : 'INFO';
    
    return logToCloudWatch(`Circuit breaker: ${serviceName} is ${state}`, level, {
      type: 'circuit_breaker_status',
      service: serviceName,
      state,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Timeout monitoring
  async logTimeout(operation, timeout, actualDuration, context = {}) {
    return logError(`Operation timeout: ${operation} exceeded ${timeout}ms (took ${actualDuration}ms)`, {
      type: 'timeout',
      operation,
      configuredTimeout: timeout,
      actualDuration,
      timestamp: new Date().toISOString(),
      ...context
    });
  },

  // Retry attempt logging
  async logRetryAttempt(operation, attempt, maxAttempts, error, context = {}) {
    const level = attempt === maxAttempts ? 'ERROR' : 'WARN';
    
    return logToCloudWatch(`Retry attempt ${attempt}/${maxAttempts} for ${operation}: ${error.message}`, level, {
      type: 'retry_attempt',
      operation,
      attempt,
      maxAttempts,
      error: error.message,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  }
};

export default cloudWatchLogger;
