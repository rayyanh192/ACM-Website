/**
 * Secure CloudWatch Logger for Vue.js Application
 * Uses Firebase Functions as a proxy to avoid exposing AWS credentials in frontend
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { cloudWatchConfig } from '../config/cloudwatch';

// Initialize Firebase Functions
const functions = getFunctions();
const logToCloudWatchFunction = httpsCallable(functions, 'logToCloudWatch');

/**
 * Fallback logging to console with structured format
 */
function fallbackLog(message, level = 'INFO', context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    source: window.location.host,
    context
  };
  
  console.log(`[${level}] ${message}`, logEntry);
}

/**
 * Log any message to CloudWatch via Firebase Functions
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  // Always log to console as fallback
  fallbackLog(message, level, context);
  
  // Skip CloudWatch if not enabled
  if (!cloudWatchConfig.enabled) {
    return;
  }

  try {
    await logToCloudWatchFunction({
      message,
      level,
      context,
      streamName,
      source: window.location.host
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`${level} logged to CloudWatch via Firebase Function:`, message);
    }
  } catch (err) {
    console.warn('Failed to log to CloudWatch via Firebase Function:', err.message);
    // Firebase Function failed, but we already logged to console as fallback
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
 * Secure CloudWatch Logger with Firebase Functions proxy
 */
export const secureCloudWatchLogger = {
  // Configuration status
  isAvailable() {
    return cloudWatchConfig.enabled;
  },

  getStatus() {
    return {
      available: cloudWatchConfig.enabled,
      config: cloudWatchConfig.getStatus(),
      proxy: 'Firebase Functions'
    };
  },

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

  // Activity logging with rate limiting
  async logPageView(pageName, context = {}) {
    // Rate limit page view logging to prevent spam
    if (this._lastPageView === pageName && Date.now() - this._lastPageViewTime < 1000) {
      return;
    }
    this._lastPageView = pageName;
    this._lastPageViewTime = Date.now();

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
  },

  // Private properties for rate limiting
  _lastPageView: null,
  _lastPageViewTime: 0
};

export default secureCloudWatchLogger;