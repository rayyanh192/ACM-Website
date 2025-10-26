/**
 * Enhanced CloudWatch Logger for Vue.js Application
 * Robust error handling with fallback mechanisms and retry logic
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// CloudWatch Logs client (initialized only if configured)
let logs = null;
let initializationError = null;

// Initialize CloudWatch client with error handling
const initializeCloudWatch = () => {
  if (!cloudWatchConfig.shouldLog()) {
    return false;
  }

  try {
    logs = new AWS.CloudWatchLogs({
      region: cloudWatchConfig.region,
      accessKeyId: cloudWatchConfig.accessKeyId,
      secretAccessKey: cloudWatchConfig.secretAccessKey,
      maxRetries: 3,
      retryDelayOptions: {
        customBackoff: function(retryCount) {
          return Math.pow(2, retryCount) * 100; // Exponential backoff
        }
      }
    });
    return true;
  } catch (error) {
    initializationError = error;
    console.warn('CloudWatch initialization failed:', error.message);
    return false;
  }
};

// Initialize on module load
const isInitialized = initializeCloudWatch();

// Fallback logging strategies
const fallbackStrategies = {
  console: (level, message, context) => {
    const logMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[logMethod](`[${level}] ${message}`, context);
  },
  
  localStorage: (level, message, context) => {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
        url: window.location.href
      };
      
      const existingLogs = JSON.parse(localStorage.getItem('cloudwatch_fallback_logs') || '[]');
      existingLogs.push(logEntry);
      
      // Keep only last 100 entries
      if (existingLogs.length > 100) {
        existingLogs.splice(0, existingLogs.length - 100);
      }
      
      localStorage.setItem('cloudwatch_fallback_logs', JSON.stringify(existingLogs));
    } catch (error) {
      // localStorage might be full or unavailable
      console.warn('Failed to store log in localStorage:', error);
    }
  }
};

/**
 * Enhanced logging function with retry logic and fallback strategies
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 * @param {number} retryCount - Current retry attempt
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null, retryCount = 0) {
  // If CloudWatch is not configured or initialized, use fallback
  if (!isInitialized || !logs) {
    fallbackStrategies.console(level, message, context);
    fallbackStrategies.localStorage(level, message, context);
    return { success: false, error: initializationError?.message || 'CloudWatch not configured' };
  }

  try {
    const enhancedContext = {
      ...context,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      environment: cloudWatchConfig.isDevelopment ? 'development' : 'production'
    };

    const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(enhancedContext)}`;
    
    const result = await logs.putLogEvents({
      logGroupName: cloudWatchConfig.logGroupName,
      logStreamName: streamName || cloudWatchConfig.logStreamName,
      logEvents: [{
        timestamp: Date.now(),
        message: logMessage
      }]
    }).promise();
    
    if (cloudWatchConfig.isDevelopment) {
      console.log(`${level} logged to CloudWatch:`, message);
    }
    
    return { success: true, result };
    
  } catch (error) {
    // Handle specific AWS errors
    const shouldRetry = retryCount < 2 && (
      error.code === 'ThrottlingException' ||
      error.code === 'ServiceUnavailable' ||
      error.code === 'InternalFailure' ||
      error.statusCode >= 500
    );

    if (shouldRetry) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      return logToCloudWatch(message, level, context, streamName, retryCount + 1);
    }

    // Log error details for debugging
    console.warn(`CloudWatch logging failed (attempt ${retryCount + 1}):`, {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode
    });

    // Use fallback strategies
    fallbackStrategies.console(level, message, context);
    fallbackStrategies.localStorage(level, message, context);
    
    return { success: false, error: error.message };
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
 * Health check functionality
 */
const healthCheck = {
  async testConnection() {
    if (!isInitialized || !logs) {
      return {
        success: false,
        error: 'CloudWatch not initialized',
        details: cloudWatchConfig.getStatus()
      };
    }

    try {
      // Test with a simple log entry
      const result = await logToCloudWatch('Health check test', 'INFO', {
        type: 'health_check',
        timestamp: new Date().toISOString()
      });
      
      return {
        success: result.success,
        message: 'CloudWatch connection successful',
        details: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: { error: error.code || 'unknown' }
      };
    }
  },

  async getFallbackLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem('cloudwatch_fallback_logs') || '[]');
      return { success: true, logs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async clearFallbackLogs() {
    try {
      localStorage.removeItem('cloudwatch_fallback_logs');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

/**
 * Comprehensive CloudWatch Logger with enhanced error handling
 */
export const cloudWatchLogger = {
  // Configuration and health
  getConfig() {
    return cloudWatchConfig.getStatus();
  },

  async healthCheck() {
    return healthCheck.testConnection();
  },

  async getFallbackLogs() {
    return healthCheck.getFallbackLogs();
  },

  async clearFallbackLogs() {
    return healthCheck.clearFallbackLogs();
  },

  // Main logging function for all levels
  async logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
    return logToCloudWatch(message, level, context, streamName);
  },

  // Log level shortcuts with enhanced error handling
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

  // Activity logging with success tracking
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

  // Specialized error logging with enhanced context
  async databaseError(error, operation = 'unknown') {
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  async apiError(error, endpoint = 'unknown') {
    return logError(`API call to ${endpoint} failed: ${error.message}`, {
      type: 'api',
      endpoint,
      status: error.status || 'unknown',
      stack: error.stack
    });
  },

  async paymentError(error, transactionId = null) {
    return logError(`Payment processing failed: ${error.message}`, {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  async authError(error, action = 'unknown') {
    return logError(`Authentication ${action} failed: ${error.message}`, {
      type: 'authentication',
      action,
      errorCode: error.code || 'unknown',
      stack: error.stack
    });
  },

  async componentError(error, componentName, method = 'unknown') {
    return logError(`Component ${componentName}.${method} error: ${error.message}`, {
      type: 'component',
      component: componentName,
      method,
      stack: error.stack
    });
  },

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
