/**
 * Enhanced CloudWatch Logger for Vue.js Application
 * Includes connection pooling, retry logic, circuit breaker, and batch logging
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig } from '../config/cloudwatch';

// Configure AWS CloudWatch Logs with enhanced connection settings
const logs = new AWS.CloudWatchLogs({
  region: cloudWatchConfig.region,
  accessKeyId: cloudWatchConfig.accessKeyId,
  secretAccessKey: cloudWatchConfig.secretAccessKey,
  httpOptions: cloudWatchConfig.httpOptions,
  maxRetries: cloudWatchConfig.maxRetries,
  retryDelayOptions: {
    customBackoff: function(retryCount) {
      return Math.pow(2, retryCount) * cloudWatchConfig.retryDelay;
    }
  }
});

// Circuit Breaker implementation
class CircuitBreaker {
  constructor(config) {
    this.failureThreshold = config.failureThreshold;
    this.resetTimeout = config.resetTimeout;
    this.monitoringPeriod = config.monitoringPeriod;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN - CloudWatch logging temporarily disabled');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }
}

// Connection pool manager
class CloudWatchConnectionManager {
  constructor() {
    this.activeRequests = 0;
    this.maxConcurrentRequests = cloudWatchConfig.maxConcurrentRequests;
    this.requestQueue = [];
    this.logBatch = [];
    this.batchTimer = null;
    this.circuitBreaker = new CircuitBreaker(cloudWatchConfig.circuitBreaker);
    this.connectionHealth = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastSuccessfulRequest: Date.now()
    };
  }

  async executeRequest(operation, context = 'unknown') {
    return new Promise((resolve, reject) => {
      const executeOperation = async () => {
        if (this.activeRequests >= this.maxConcurrentRequests) {
          this.requestQueue.push(() => executeOperation());
          return;
        }

        this.activeRequests++;
        const startTime = Date.now();

        try {
          const result = await this.circuitBreaker.execute(operation);
          
          // Update connection health metrics
          const responseTime = Date.now() - startTime;
          this.connectionHealth.totalRequests++;
          this.connectionHealth.successfulRequests++;
          this.connectionHealth.lastSuccessfulRequest = Date.now();
          this.connectionHealth.averageResponseTime = 
            (this.connectionHealth.averageResponseTime * (this.connectionHealth.totalRequests - 1) + responseTime) / 
            this.connectionHealth.totalRequests;

          resolve(result);
        } catch (error) {
          this.connectionHealth.totalRequests++;
          this.connectionHealth.failedRequests++;
          
          console.warn(`CloudWatch operation failed (${context}):`, error);
          reject(error);
        } finally {
          this.activeRequests--;
          
          // Process queued requests
          if (this.requestQueue.length > 0) {
            const nextRequest = this.requestQueue.shift();
            setTimeout(nextRequest, 0);
          }
        }
      };

      executeOperation();
    });
  }

  addToBatch(logEvent) {
    this.logBatch.push(logEvent);
    
    if (this.logBatch.length >= cloudWatchConfig.batchSize) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, cloudWatchConfig.batchTimeout);
    }
  }

  async flushBatch() {
    if (this.logBatch.length === 0) return;

    const batchToSend = [...this.logBatch];
    this.logBatch = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.executeRequest(async () => {
        return logs.putLogEvents({
          logGroupName: cloudWatchConfig.logGroupName,
          logStreamName: cloudWatchConfig.logStreamName,
          logEvents: batchToSend
        }).promise();
      }, 'batch_flush');
      
      console.log(`Batch of ${batchToSend.length} log events sent to CloudWatch`);
    } catch (error) {
      console.error('Failed to send batch to CloudWatch:', error);
      // Re-queue failed logs for retry (with limit to prevent memory issues)
      if (this.logBatch.length < 100) {
        this.logBatch.unshift(...batchToSend);
      }
    }
  }

  getConnectionHealth() {
    return {
      ...this.connectionHealth,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      batchedLogs: this.logBatch.length,
      circuitBreakerState: this.circuitBreaker.getState(),
      successRate: this.connectionHealth.totalRequests > 0 ? 
        (this.connectionHealth.successfulRequests / this.connectionHealth.totalRequests * 100).toFixed(2) + '%' : 'N/A'
    };
  }
}

// Initialize connection manager
const connectionManager = new CloudWatchConnectionManager();

/**
 * Enhanced log function with connection management and batching
 */
async function logToCloudWatch(message, level = 'INFO', context = {}, streamName = null, forceSingle = false) {
  try {
    const logMessage = `${level}: ${message} - Source: ${window.location.host} - Context: ${JSON.stringify(context)}`;
    
    const logEvent = {
      timestamp: Date.now(),
      message: logMessage
    };

    if (forceSingle) {
      // Send immediately for critical errors
      await connectionManager.executeRequest(async () => {
        return logs.putLogEvents({
          logGroupName: cloudWatchConfig.logGroupName,
          logStreamName: streamName || cloudWatchConfig.logStreamName,
          logEvents: [logEvent]
        }).promise();
      }, `single_${level.toLowerCase()}`);
    } else {
      // Add to batch for efficiency
      connectionManager.addToBatch(logEvent);
    }
    
    console.log(`${level} logged to CloudWatch:`, message);
  } catch (err) {
    console.log('Failed to log to CloudWatch:', err);
    // Fallback: log to console
    console.log(`${level} (fallback):`, message, context);
  }
}

/**
 * Log an error to CloudWatch (backwards compatibility)
 */
async function logError(message, context = {}) {
  return logToCloudWatch(message, 'ERROR', context, null, true); // Force single for errors
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

  // Enhanced database errors with connection context
  async databaseError(error, operation = 'unknown') {
    const connectionHealth = connectionManager.getConnectionHealth();
    return logError(`Database ${operation} failed: ${error.message}`, {
      type: 'database',
      operation,
      errorCode: error.code || 'unknown',
      connectionHealth: connectionHealth
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

  // Firebase errors with enhanced context
  async firebaseError(error, operation = 'unknown') {
    return logError(`Firebase ${operation} failed: ${error.message}`, {
      type: 'firebase',
      operation,
      errorCode: error.code || 'unknown'
    });
  },

  // Connection health monitoring
  async logConnectionHealth() {
    const health = connectionManager.getConnectionHealth();
    return logToCloudWatch('Connection health check', 'INFO', {
      type: 'connection_health',
      ...health
    }, cloudWatchConfig.activityStreamName);
  },

  // Manual batch flush
  async flushLogs() {
    return connectionManager.flushBatch();
  },

  // Get connection status
  getConnectionStatus() {
    return connectionManager.getConnectionHealth();
  }
};

// Auto-flush logs on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    connectionManager.flushBatch();
  });
}

export default cloudWatchLogger;
