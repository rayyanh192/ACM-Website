/**
 * Secure CloudWatch Logger for Vue.js Application
 * Sends logs to CloudWatch via Firebase Functions proxy for security
 */

import { functions } from '../firebase';

/**
 * Log any message to CloudWatch via Firebase Functions proxy
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  try {
    const logToCloudWatchFunction = functions.httpsCallable('logToCloudWatch');
    
    await logToCloudWatchFunction({
      message,
      level,
      logContext: {
        ...context,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      },
      streamName
    });
    
    console.log(`${level} logged to CloudWatch via Firebase:`, message);
  } catch (err) {
    console.log('Failed to log to CloudWatch via Firebase:', err);
    // Fallback: log to console only
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
    return logToCloudWatch(message, 'INFO', {
      ...context,
      type: context.type || 'info'
    });
  },

  async warn(message, context = {}) {
    return logToCloudWatch(message, 'WARN', {
      ...context,
      type: context.type || 'warning'
    });
  },

  async debug(message, context = {}) {
    return logToCloudWatch(message, 'DEBUG', {
      ...context,
      type: context.type || 'debug'
    });
  },

  async error(message, context = {}) {
    return logError(message, {
      ...context,
      type: context.type || 'error'
    });
  },

  // Activity logging
  async logPageView(pageName, context = {}) {
    return logToCloudWatch(`Page viewed: ${pageName}`, 'INFO', {
      type: 'page_view',
      page: pageName,
      ...context
    });
  },

  async logButtonClick(buttonName, context = {}) {
    return logToCloudWatch(`Button clicked: ${buttonName}`, 'INFO', {
      type: 'button_click',
      button: buttonName,
      ...context
    });
  },

  async logUserAction(action, context = {}) {
    return logToCloudWatch(`User action: ${action}`, 'INFO', {
      type: 'user_action',
      action: action,
      ...context
    });
  },

  async logNavigation(from, to, context = {}) {
    return logToCloudWatch(`Navigation: ${from} → ${to}`, 'INFO', {
      type: 'navigation',
      from: from,
      to: to,
      ...context
    });
  },

  // Database errors
  async databaseError(error, operation = 'unknown') {
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  // API errors
  async apiError(error, endpoint = 'unknown') {
    return logError(`API call to ${endpoint} failed: ${error.message}`, {
      type: 'api',
      endpoint,
      status: error.status || 'unknown',
      stack: error.stack
    });
  },

  // Payment errors
  async paymentError(error, transactionId = null) {
    return logError(`Payment processing failed: ${error.message}`, {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  // Authentication errors
  async authError(error, action = 'unknown') {
    return logError(`Authentication ${action} failed: ${error.message}`, {
      type: 'authentication',
      action,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  // Component errors
  async componentError(error, componentName, method = 'unknown') {
    return logError(`Component ${componentName}.${method} error: ${error.message}`, {
      type: 'component',
      component: componentName,
      method,
      stack: error.stack
    });
  },

  // Firebase errors
  async firebaseError(error, operation = 'unknown') {
    return logError(`Firebase ${operation} failed: ${error.message}`, {
      type: 'firebase',
      operation,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  }
};

export default cloudWatchLogger;
