/**
 * CloudWatch Logger for Vue.js Application
 * Sends logs securely to CloudWatch via Firebase Functions
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

// Get Firebase Functions instance
const functions = getFunctions();
const logToCloudWatchFunction = httpsCallable(functions, 'logToCloudWatch');

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  try {
    // Add browser context
    const enrichedContext = {
      ...context,
      source: window.location.host,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };
    
    const result = await logToCloudWatchFunction({
      message,
      level,
      context: enrichedContext,
      streamName
    });
    
    if (result.data.success) {
      console.log(`${level} logged to CloudWatch:`, message);
    } else {
      throw new Error(result.data.error || 'Unknown error');
    }
  } catch (err) {
    console.warn('Failed to log to CloudWatch:', err);
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
  return logToCloudWatch(message, 'ERROR', context, 'error-stream');
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
    return logToCloudWatch(message, 'INFO', context, 'activity-stream');
  },

  async warn(message, context = {}) {
    return logToCloudWatch(message, 'WARN', context, 'activity-stream');
  },

  async debug(message, context = {}) {
    return logToCloudWatch(message, 'DEBUG', context, 'activity-stream');
  },

  async error(message, context = {}) {
    return logToCloudWatch(message, 'ERROR', context, 'error-stream');
  },

  // Activity logging
  async logPageView(pageName, context = {}) {
    return logToCloudWatch(`Page viewed: ${pageName}`, 'INFO', {
      type: 'page_view',
      page: pageName,
      ...context
    }, 'activity-stream');
  },

  async logButtonClick(buttonName, context = {}) {
    return logToCloudWatch(`Button clicked: ${buttonName}`, 'INFO', {
      type: 'button_click',
      button: buttonName,
      ...context
    }, 'activity-stream');
  },

  async logUserAction(action, context = {}) {
    return logToCloudWatch(`User action: ${action}`, 'INFO', {
      type: 'user_action',
      action: action,
      ...context
    }, 'activity-stream');
  },

  async logNavigation(from, to, context = {}) {
    return logToCloudWatch(`Navigation: ${from} → ${to}`, 'INFO', {
      type: 'navigation',
      from: from,
      to: to,
      ...context
    }, 'activity-stream');
  },

  // Database errors
  async databaseError(error, operation = 'unknown') {
    return logToCloudWatch(`Database ${operation} failed: ${error.message}`, 'ERROR', {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown'
    }, 'error-stream');
  },

  // API errors
  async apiError(error, endpoint = 'unknown') {
    return logToCloudWatch(`API call to ${endpoint} failed: ${error.message}`, 'ERROR', {
      type: 'api',
      endpoint,
      status: error.status || 'unknown'
    }, 'error-stream');
  },

  // Payment errors
  async paymentError(error, transactionId = null) {
    return logToCloudWatch(`Payment processing failed: ${error.message}`, 'ERROR', {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown'
    }, 'error-stream');
  },

  // Authentication errors
  async authError(error, action = 'unknown') {
    return logToCloudWatch(`Authentication ${action} failed: ${error.message}`, 'ERROR', {
      type: 'authentication',
      action,
      errorCode: error.code || 'unknown'
    }, 'error-stream');
  },

  // Component errors
  async componentError(error, componentName, method = 'unknown') {
    return logToCloudWatch(`Component ${componentName}.${method} error: ${error.message}`, 'ERROR', {
      type: 'component',
      component: componentName,
      method
    }, 'error-stream');
  },

  // Firebase errors
  async firebaseError(error, operation = 'unknown') {
    return logToCloudWatch(`Firebase ${operation} failed: ${error.message}`, 'ERROR', {
      type: 'firebase',
      operation,
      errorCode: error.code || 'unknown'
    }, 'error-stream');
  }
};

export default cloudWatchLogger;
