/**
 * CloudWatch Logger for Vue.js Application
 * Sends errors directly to CloudWatch from the frontend
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Enhanced configuration with timeout and retry settings
const LOGGER_CONFIG = {
  timeout: 10000, // 10 seconds timeout for CloudWatch operations
  retryAttempts: 3,
  retryDelay: 1000,
  maxRetryDelay: 5000
};

// Configure AWS CloudWatch Logs with timeout
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey,
  httpOptions: {
    timeout: LOGGER_CONFIG.timeout
  }
});

/**
 * Log any message to CloudWatch with specified level and retry logic
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, ERROR, DEBUG, WARN)
 * @param {Object} context - Additional context information
 * @param {string} streamName - Optional custom stream name
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null) {
  let lastError;
  
  for (let attempt = 1; attempt <= LOGGER_CONFIG.retryAttempts; attempt++) {
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
      console.warn(`CloudWatch logging attempt ${attempt} failed:`, err.message);
      
      if (attempt < LOGGER_CONFIG.retryAttempts) {
        const delay = Math.min(
          LOGGER_CONFIG.retryDelay * Math.pow(2, attempt - 1),
          LOGGER_CONFIG.maxRetryDelay
        );
        console.log(`Retrying CloudWatch logging in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All attempts failed
  console.error('Failed to log to CloudWatch after all attempts:', lastError);
  // Fallback: log to console
  console.log(`${level} (fallback):`, message, context);
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

  // Payment errors with enhanced timeout handling
  async paymentError(error, transactionId = null) {
    const errorContext = {
      type: 'payment',
      transactionId,
      errorCode: error.code || 'unknown',
      timeout: error.timeout || 'unknown',
      timestamp: new Date().toISOString()
    };

    // Check for specific timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      await logError(`Payment service connection failed - timeout after ${error.timeout || 5000}ms`, errorContext);
      
      // Log additional context for timeout errors
      await logError(`HTTPSConnectionPool timeout in payment processing`, {
        ...errorContext,
        details: 'Connection pool timeout during payment processing',
        userAgent: navigator.userAgent,
        url: window.location.href
      });
    } else {
      await logError(`Payment processing failed: ${error.message}`, errorContext);
    }
  },

  // Enhanced payment processing with Firebase function integration
  async processPayment(amount, paymentMethod) {
    try {
      // Import Firebase functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const processPaymentFunction = httpsCallable(functions, 'processPayment');

      console.log('Initiating payment processing...', { amount, paymentMethod });
      
      // Call Firebase function with timeout handling
      const result = await Promise.race([
        processPaymentFunction({ amount, paymentMethod }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Payment request timeout after 30000ms')), 30000)
        )
      ]);

      await this.info('Payment processed successfully', {
        type: 'payment_success',
        amount,
        transactionId: result.data.transactionId
      });

      return result.data;
    } catch (error) {
      await this.paymentError(error);
      throw error;
    }
  },

  // Database errors with connection pool monitoring
  async databaseError(error, operation = 'unknown') {
    const errorContext = {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      timestamp: new Date().toISOString()
    };

    // Check for connection pool exhaustion
    if (error.message.includes('connection pool exhausted') || error.message.includes('pool exhausted')) {
      await logError(`Database query failed: connection pool exhausted`, errorContext);
      
      // Try to get pool status for additional context
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const getPoolStatus = httpsCallable(functions, 'getDatabasePoolStatus');
        const poolStatus = await getPoolStatus();
        
        await logError('Database connection pool status', {
          ...errorContext,
          poolStatus: poolStatus.data
        });
      } catch (statusError) {
        console.warn('Could not retrieve database pool status:', statusError);
      }
    } else {
      await logError(`Database ${operation} failed: ${error.message}`, errorContext);
    }
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
