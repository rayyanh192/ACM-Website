/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs only if configuration is valid
let logs = null;
let isCloudWatchAvailable = false;

if (cloudWatchConfig.isValid) {
  try {
    logs = new AWS.CloudWatchLogs({
      region: cloudWatchConfig.region,
      accessKeyId: cloudWatchConfig.accessKeyId,
      secretAccessKey: cloudWatchConfig.secretAccessKey
    });
    isCloudWatchAvailable = true;
  } catch (error) {
    console.warn('Failed to initialize CloudWatch:', error);
    isCloudWatchAvailable = false;
  }
} else {
  console.warn('CloudWatch logging disabled due to missing configuration');
}

// Fallback logging queue for when CloudWatch is unavailable
const logQueue = [];
const MAX_QUEUE_SIZE = 100;

/**
 * Fallback logging to console and local storage
 */
function fallbackLog(message, level, context) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    source: window.location.host
  };
  
  // Log to console
  console.log(`${level} (fallback):`, message, context);
  
  // Store in queue for potential retry
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    logQueue.shift(); // Remove oldest entry
  }
  logQueue.push(logEntry);
  
  // Store critical errors in localStorage for debugging
  if (level === 'ERROR') {
    try {
      const existingErrors = JSON.parse(localStorage.getItem('acm_error_logs') || '[]');
      existingErrors.push(logEntry);
      // Keep only last 50 errors
      if (existingErrors.length > 50) {
        existingErrors.splice(0, existingErrors.length - 50);
      }
      localStorage.setItem('acm_error_logs', JSON.stringify(existingErrors));
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e);
    }
  }
}

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  // If CloudWatch is not available, use fallback logging
  if (!isCloudWatchAvailable || !logs) {
    fallbackLog(message, level, context);
    return;
  }

  const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(context)}`;
  
  // Retry logic for CloudWatch API calls
  const maxRetries = 2;
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      await logs.putLogEvents({
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: streamName || cloudWatchConfig.logStreamName,
        logEvents: [{
          timestamp: Date.now(),
          message: logMessage
        }]
      }).promise();
      
      console.log(`${level} logged to CloudWatch:`, message);
      return; // Success, exit retry loop
      
    } catch (err) {
      retryCount++;
      console.warn(`CloudWatch logging attempt ${retryCount} failed:`, err);
      
      if (retryCount > maxRetries) {
        console.warn('CloudWatch logging failed after all retries, using fallback');
        fallbackLog(message, level, context);
        
        // Temporarily disable CloudWatch if we're getting consistent failures
        if (err.code === 'UnauthorizedOperation' || err.code === 'AccessDenied') {
          console.warn('CloudWatch access denied, disabling for this session');
          isCloudWatchAvailable = false;
        }
        return;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
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

  // Utility functions for debugging and monitoring
  getQueuedLogs() {
    return [...logQueue];
  },

  clearQueue() {
    logQueue.length = 0;
  },

  isCloudWatchEnabled() {
    return isCloudWatchAvailable;
  },

  getStoredErrors() {
    try {
      return JSON.parse(localStorage.getItem('acm_error_logs') || '[]');
    } catch (e) {
      console.warn('Failed to retrieve stored errors:', e);
      return [];
    }
  },

  clearStoredErrors() {
    try {
      localStorage.removeItem('acm_error_logs');
    } catch (e) {
      console.warn('Failed to clear stored errors:', e);
    }
  },

  // Health check function
  async healthCheck() {
    if (!isCloudWatchAvailable) {
      return { status: 'disabled', reason: 'Configuration invalid or initialization failed' };
    }

    try {
      // Try a simple operation to verify connectivity
      await this.info('CloudWatch health check', { type: 'health_check' });
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
};

export default cloudWatchLogger;
