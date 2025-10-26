/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend with enhanced reliability
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Circuit breaker state management
class CircuitBreaker {
  constructor(config) {
    this.failureThreshold = config.failureThreshold;
    this.resetTimeout = config.resetTimeout;
    this.monitoringPeriod = config.monitoringPeriod;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    if (this.state === 'HALF_OPEN') return true;
    return false;
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }
}

// Initialize circuit breaker
const circuitBreaker = new CircuitBreaker(cloudWatchConfig.circuitBreaker);

// Log batching system
class LogBatcher {
  constructor(config) {
    this.enabled = config.enabled;
    this.maxBatchSize = config.maxBatchSize;
    this.maxWaitTime = config.maxWaitTime;
    this.maxRetainedLogs = config.maxRetainedLogs;
    this.pendingLogs = [];
    this.retainedLogs = [];
    this.batchTimer = null;
  }

  addLog(logEvent) {
    if (!this.enabled) {
      return this.sendImmediately(logEvent);
    }

    this.pendingLogs.push(logEvent);
    
    if (this.pendingLogs.length >= this.maxBatchSize) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.maxWaitTime);
    }
  }

  async flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingLogs.length === 0) return;

    const logsToSend = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      await this.sendBatch(logsToSend);
    } catch (error) {
      // Retain logs for retry if under limit
      if (this.retainedLogs.length + logsToSend.length <= this.maxRetainedLogs) {
        this.retainedLogs.push(...logsToSend);
      }
      throw error;
    }
  }

  async sendBatch(logEvents) {
    if (!circuitBreaker.canExecute()) {
      throw new Error('Circuit breaker is OPEN - CloudWatch logging temporarily disabled');
    }

    try {
      await logs.putLogEvents({
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: cloudWatchConfig.logStreamName,
        logEvents: logEvents
      }).promise();
      
      circuitBreaker.onSuccess();
      
      // Try to send any retained logs
      if (this.retainedLogs.length > 0) {
        const retainedToSend = this.retainedLogs.splice(0, this.maxBatchSize);
        setTimeout(() => this.sendBatch(retainedToSend), 1000);
      }
    } catch (error) {
      circuitBreaker.onFailure();
      throw error;
    }
  }

  async sendImmediately(logEvent) {
    return this.sendBatch([logEvent]);
  }
}

// Configure AWS CloudWatch Logs with enhanced settings
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey,
  httpOptions: cloudWatchConfig.httpOptions,
  retryDelayOptions: cloudWatchConfig.retryDelayOptions,
  maxRetries: cloudWatchConfig.maxRetries
});

// Initialize log batcher
const logBatcher = new LogBatcher(cloudWatchConfig.batching);

/**
 * Enhanced log function with timeout, retry, and circuit breaker
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  try {
    const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(context)}`;
    
    const logEvent = {
      timestamp: Date.now(),
      message: logMessage
    };

    // Use custom stream if provided, otherwise use batcher
    if (streamName && streamName !== cloudWatchConfig.logStreamName) {
      // For custom streams, send immediately with circuit breaker protection
      if (!circuitBreaker.canExecute()) {
        throw new Error('Circuit breaker is OPEN - CloudWatch logging temporarily disabled');
      }

      await logs.putLogEvents({
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: streamName,
        logEvents: [logEvent]
      }).promise();
      
      circuitBreaker.onSuccess();
    } else {
      // Use batcher for default stream
      await logBatcher.addLog(logEvent);
    }
    
    console.log(`${level} logged to CloudWatch:`, message);
  } catch (err) {
    console.warn('Failed to log to CloudWatch:', err.message);
    
    // Enhanced fallback logging with structured format
    const fallbackLog = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      context: context,
      source: 'cloudwatch-fallback',
      error: err.message
    };
    
    console.log(`${level} (fallback):`, JSON.stringify(fallbackLog));
    
    // Store in localStorage as additional fallback (with size limit)
    try {
      const storedLogs = JSON.parse(localStorage.getItem('cloudwatch-fallback-logs') || '[]');
      storedLogs.push(fallbackLog);
      
      // Keep only last 50 logs to prevent localStorage overflow
      if (storedLogs.length > 50) {
        storedLogs.splice(0, storedLogs.length - 50);
      }
      
      localStorage.setItem('cloudwatch-fallback-logs', JSON.stringify(storedLogs));
    } catch (storageError) {
      console.warn('Failed to store fallback log:', storageError.message);
    }
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
 * Comprehensive CloudWatch Logger with enhanced reliability
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

  // Enhanced error logging methods with better context
  async databaseError(error, operation = 'unknown') {
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  async apiError(error, endpoint = 'unknown') {
    return logError(`API call to ${endpoint} failed: ${error.message}`, {
      type: 'api',
      endpoint,
      status: error.status || 'unknown',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  async paymentError(error, transactionId = null) {
    return logError(`Payment processing failed: ${error.message}`, {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  async authError(error, action = 'unknown') {
    return logError(`Authentication ${action} failed: ${error.message}`, {
      type: 'authentication',
      action,
      errorCode: error.code || 'unknown',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  async componentError(error, componentName, method = 'unknown') {
    return logError(`Component ${componentName}.${method} error: ${error.message}`, {
      type: 'component',
      component: componentName,
      method,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  async firebaseError(error, operation = 'unknown') {
    return logError(`Firebase ${operation} failed: ${error.message}`, {
      type: 'firebase',
      operation,
      errorCode: error.code || 'unknown',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  // Utility methods for monitoring and debugging
  getCircuitBreakerState() {
    return {
      state: circuitBreaker.state,
      failureCount: circuitBreaker.failureCount,
      lastFailureTime: circuitBreaker.lastFailureTime,
      nextAttemptTime: circuitBreaker.nextAttemptTime
    };
  },

  getBatcherState() {
    return {
      pendingLogs: logBatcher.pendingLogs.length,
      retainedLogs: logBatcher.retainedLogs.length,
      batchingEnabled: logBatcher.enabled
    };
  },

  async flushPendingLogs() {
    return logBatcher.flushBatch();
  },

  getFallbackLogs() {
    try {
      return JSON.parse(localStorage.getItem('cloudwatch-fallback-logs') || '[]');
    } catch (error) {
      console.warn('Failed to retrieve fallback logs:', error.message);
      return [];
    }
  },

  clearFallbackLogs() {
    try {
      localStorage.removeItem('cloudwatch-fallback-logs');
    } catch (error) {
      console.warn('Failed to clear fallback logs:', error.message);
    }
  }
};

export default cloudWatchLogger;
