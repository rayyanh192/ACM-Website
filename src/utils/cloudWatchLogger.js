/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend with health monitoring and fallback support
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig, validateCloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs
let logs = null;
let isCloudWatchAvailable = false;

// Initialize CloudWatch client
function initializeCloudWatch() {
  const validation = validateCloudWatchConfig();
  
  if (validation.isValid) {
    logs = new AWS.CloudWatchLogs({
      region: cloudWatchConfig.region,
      accessKeyId: cloudWatchConfig.accessKeyId,
      secretAccessKey: cloudWatchConfig.secretAccessKey
    });
    isCloudWatchAvailable = true;
  } else {
    console.warn('CloudWatch not available:', validation.errors);
    isCloudWatchAvailable = false;
  }
}

// Initialize on module load
initializeCloudWatch();

/**
 * Log any message to CloudWatch with specified level and fallback support
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    context: context,
    source: window.location.host,
    url: window.location.href
  };

  // Try CloudWatch first if available
  if (isCloudWatchAvailable && logs) {
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
      
      console.log(`✅ ${level} logged to CloudWatch:`, message);
      return true;
      
    } catch (err) {
      console.warn('❌ CloudWatch logging failed:', err.message);
      isCloudWatchAvailable = false; // Mark as unavailable for future attempts
      
      // Fall through to fallback logging
    }
  }

  // Fallback logging
  await logToFallback(logEntry);
  return false;
}

/**
 * Fallback logging when CloudWatch is unavailable
 * @param {Object} logEntry - Log entry object
 */
async function logToFallback(logEntry) {
  // Log to console
  console.log(`📝 ${logEntry.level} (fallback):`, logEntry.message, logEntry.context);
  
  // Try to use health monitor fallback if available
  if (typeof window !== 'undefined' && window.healthMonitor) {
    window.healthMonitor.logToFallback(logEntry.message, logEntry.context);
  }
  
  // Try server-side logging endpoint
  try {
    await fetch('/api/log-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logEntry)
    });
  } catch (error) {
    console.warn('Server fallback logging failed:', error.message);
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
 * Comprehensive CloudWatch Logger with all log levels and health monitoring
 */
export const cloudWatchLogger = {
  // Configuration and health methods
  getStatus() {
    return {
      isAvailable: isCloudWatchAvailable,
      config: {
        region: cloudWatchConfig.region,
        logGroupName: cloudWatchConfig.logGroupName,
        hasCredentials: !!(cloudWatchConfig.accessKeyId && cloudWatchConfig.secretAccessKey)
      }
    };
  },

  async reinitialize() {
    initializeCloudWatch();
    return this.getStatus();
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

  // Activity logging with enhanced context
  async logPageView(pageName, context = {}) {
    return logToCloudWatch(`Page viewed: ${pageName}`, 'INFO', {
      type: 'page_view',
      page: pageName,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logButtonClick(buttonName, context = {}) {
    return logToCloudWatch(`Button clicked: ${buttonName}`, 'INFO', {
      type: 'button_click',
      button: buttonName,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logUserAction(action, context = {}) {
    return logToCloudWatch(`User action: ${action}`, 'INFO', {
      type: 'user_action',
      action: action,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logNavigation(from, to, context = {}) {
    return logToCloudWatch(`Navigation: ${from} → ${to}`, 'INFO', {
      type: 'navigation',
      from: from,
      to: to,
      timestamp: new Date().toISOString(),
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  // Enhanced error logging with better context
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

  // Health monitoring integration
  async logHealthStatus(status, details = {}) {
    return logToCloudWatch(`Health Status: ${status}`, 'INFO', {
      type: 'health_status',
      status,
      details,
      timestamp: new Date().toISOString()
    }, 'health-stream');
  },

  async logSystemEvent(event, details = {}) {
    return logToCloudWatch(`System Event: ${event}`, 'INFO', {
      type: 'system_event',
      event,
      details,
      timestamp: new Date().toISOString()
    }, cloudWatchConfig.activityStreamName);
  }
};

export default cloudWatchLogger;
