/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig, validateCloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs
let logs = null;
let isConfigured = false;
let configurationError = null;
let connectionTested = false;
let connectionStatus = 'unknown';

// Error queue for when CloudWatch is unavailable
let errorQueue = [];
const MAX_QUEUE_SIZE = 100;

// Initialize CloudWatch configuration
function initializeCloudWatch() {
  try {
    const validation = validateCloudWatchConfig();
    
    if (!validation.isValid) {
      configurationError = `CloudWatch configuration invalid: ${validation.issues.join(', ')}`;
      console.warn('CloudWatch Logger:', configurationError);
      return false;
    }

    logs = new AWS.CloudWatchLogs({
      region: cloudWatchConfig.region,
      accessKeyId: cloudWatchConfig.accessKeyId,
      secretAccessKey: cloudWatchConfig.secretAccessKey
    });

    isConfigured = true;
    configurationError = null;
    return true;
  } catch (error) {
    configurationError = `CloudWatch initialization failed: ${error.message}`;
    console.error('CloudWatch Logger:', configurationError);
    return false;
  }
}

// Test CloudWatch connection
async function testConnection() {
  if (!isConfigured) {
    connectionStatus = 'not_configured';
    return false;
  }

  try {
    // Try to describe log groups to test connection
    await logs.describeLogGroups({ limit: 1 }).promise();
    connectionStatus = 'connected';
    connectionTested = true;
    return true;
  } catch (error) {
    connectionStatus = `connection_failed: ${error.message}`;
    console.warn('CloudWatch connection test failed:', error.message);
    return false;
  }
}

// Initialize on module load
initializeCloudWatch();

/**
 * Log any message to CloudWatch with specified level
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  const logEntry = {
    message,
    level,
    context,
    streamName: streamName || cloudWatchConfig.logStreamName,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : 'server',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
  };

  // If not configured, queue the error and try to log locally
  if (!isConfigured) {
    queueError(logEntry);
    console.log(`${level} (CloudWatch not configured):`, message, context);
    return;
  }

  // Test connection if not tested yet
  if (!connectionTested) {
    await testConnection();
  }

  // If connection failed, queue the error
  if (connectionStatus !== 'connected') {
    queueError(logEntry);
    console.log(`${level} (CloudWatch unavailable):`, message, context);
    return;
  }

  try {
    const logMessage = `${level}: ${message} - Source: ${logEntry.url} - Context: ${JSON.stringify(context)}`;
    
    await logs.putLogEvents({
      logGroupName: cloudWatchConfig.logGroupName,
      logStreamName: logEntry.streamName,
      logEvents: [{
        timestamp: logEntry.timestamp,
        message: logMessage
      }]
    }).promise();
    
    console.log(`${level} logged to CloudWatch:`, message);
    
    // Process any queued errors on successful log
    await processErrorQueue();
    
  } catch (err) {
    console.log('Failed to log to CloudWatch:', err);
    
    // Queue this error for retry
    queueError(logEntry);
    
    // Fallback: log to console
    console.log(`${level} (fallback):`, message, context);
    
    // Update connection status
    connectionStatus = `error: ${err.message}`;
    connectionTested = false;
  }
}

// Queue errors when CloudWatch is unavailable
function queueError(logEntry) {
  if (errorQueue.length >= MAX_QUEUE_SIZE) {
    errorQueue.shift(); // Remove oldest entry
  }
  errorQueue.push(logEntry);
}

// Process queued errors
async function processErrorQueue() {
  if (errorQueue.length === 0) return;
  
  const batch = errorQueue.splice(0, Math.min(10, errorQueue.length)); // Process up to 10 at a time
  
  for (const entry of batch) {
    try {
      const logMessage = `${entry.level}: ${entry.message} - Source: ${entry.url} - Context: ${JSON.stringify(entry.context)}`;
      
      await logs.putLogEvents({
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: entry.streamName,
        logEvents: [{
          timestamp: entry.timestamp,
          message: logMessage
        }]
      }).promise();
      
    } catch (err) {
      // Re-queue failed entries
      queueError(entry);
      break; // Stop processing if we hit an error
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

  // Diagnostic methods
  getStatus() {
    return {
      isConfigured,
      configurationError,
      connectionStatus,
      connectionTested,
      queuedErrors: errorQueue.length,
      maxQueueSize: MAX_QUEUE_SIZE,
      config: {
        region: cloudWatchConfig.region,
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: cloudWatchConfig.logStreamName,
        activityStreamName: cloudWatchConfig.activityStreamName
      }
    };
  },

  async testConnection() {
    return await testConnection();
  },

  async healthCheck() {
    const status = this.getStatus();
    const testResult = await this.testConnection();
    
    return {
      ...status,
      connectionTest: testResult,
      healthy: isConfigured && testResult,
      timestamp: new Date().toISOString()
    };
  },

  // Force process queued errors
  async processQueue() {
    return await processErrorQueue();
  },

  // Clear error queue (for testing)
  clearQueue() {
    errorQueue = [];
  },

  // Activity logging
  async logPageView(pageName, context = {}) {
    return logToCloudWatch(`Page viewed: ${pageName}`, 'INFO', {
      type: 'page_view',
      page: pageName,
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logButtonClick(buttonName, context = {}) {
    return logToCloudWatch(`Button clicked: ${buttonName}`, 'INFO', {
      type: 'button_click',
      button: buttonName,
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      ...context
    }, cloudWatchConfig.activityStreamName);
  },

  async logUserAction(action, context = {}) {
    return logToCloudWatch(`User action: ${action}`, 'INFO', {
      type: 'user_action',
      action: action,
      url: typeof window !== 'undefined' ? window.location.href : 'server',
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
  }
};

export default cloudWatchLogger;
