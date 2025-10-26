/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs with timeout and retry settings
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey,
  httpOptions: {
    timeout: 10000, // 10 second timeout
    connectTimeout: 5000 // 5 second connection timeout
  },
  maxRetries: 3,
  retryDelayOptions: {
    customBackoff: function(retryCount) {
      // Exponential backoff: 1s, 2s, 4s
      return Math.pow(2, retryCount) * 1000;
    }
  }
});

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      return; // Success, exit retry loop
      
    } catch (err) {
      lastError = err;
      
      if (attempt === maxRetries) {
        break; // Final attempt failed
      }

      // Check if error is retryable
      const isRetryable = err.code === 'NetworkingError' || 
                         err.code === 'TimeoutError' ||
                         err.code === 'RequestTimeout' ||
                         err.statusCode >= 500;

      if (!isRetryable) {
        break; // Don't retry non-retryable errors
      }

      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.warn(`CloudWatch logging attempt ${attempt} failed, retrying in ${delay}ms:`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  console.error('Failed to log to CloudWatch after all retries:', lastError);
  
  // Enhanced fallback logging with error categorization
  const fallbackContext = {
    ...context,
    cloudWatchError: lastError.message,
    cloudWatchErrorCode: lastError.code,
    retryAttempts: maxRetries,
    timestamp: new Date().toISOString()
  };

  if (lastError.message.includes('timeout') || lastError.code === 'TimeoutError') {
    console.error(`${level} (CloudWatch timeout fallback):`, message, fallbackContext);
  } else if (lastError.message.includes('connection') || lastError.code === 'NetworkingError') {
    console.error(`${level} (CloudWatch connection fallback):`, message, fallbackContext);
  } else {
    console.error(`${level} (CloudWatch fallback):`, message, fallbackContext);
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
    const errorContext = {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown'
    };

    // Add specific context for connection pool and timeout errors
    if (error.message.includes('connection pool exhausted')) {
      errorContext.errorSubtype = 'CONNECTION_POOL_EXHAUSTED';
    } else if (error.message.includes('timeout')) {
      errorContext.errorSubtype = 'TIMEOUT';
      errorContext.timeoutDuration = error.message.match(/(\d+)ms/) ? error.message.match(/(\d+)ms/)[1] : 'unknown';
    } else if (error.message.includes('connection')) {
      errorContext.errorSubtype = 'CONNECTION_ERROR';
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

  // Payment errors
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown'
    };

    // Add specific context for timeout errors
    if (error.message.includes('timeout')) {
      errorContext.errorSubtype = 'TIMEOUT';
      errorContext.timeoutDuration = error.message.match(/(\d+)ms/) ? error.message.match(/(\d+)ms/)[1] : 'unknown';
    } else if (error.message.includes('Connection pool exhausted')) {
      errorContext.errorSubtype = 'CONNECTION_POOL_EXHAUSTED';
    } else if (error.message.includes('HTTPSConnectionPool')) {
      errorContext.errorSubtype = 'HTTPS_CONNECTION_ERROR';
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
  }
};

export default cloudWatchLogger;
