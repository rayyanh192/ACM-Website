/**
 * Connection Pool Manager - JavaScript equivalent of connection_pool.py
 * Manages HTTP connection pools for external services to prevent exhaustion
 */

import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class ConnectionPool {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || 10;
    this.timeout = options.timeout || 5000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Track active connections
    this.activeConnections = new Set();
    this.connectionQueue = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutErrors: 0,
      poolExhaustedErrors: 0
    };
  }

  /**
   * Acquire a connection from the pool
   * @returns {Promise<string>} Connection ID
   */
  async acquireConnection() {
    return new Promise((resolve, reject) => {
      if (this.activeConnections.size < this.maxConnections) {
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.activeConnections.add(connectionId);
        resolve(connectionId);
      } else {
        // Pool is exhausted, add to queue
        this.connectionQueue.push({ resolve, reject, timestamp: Date.now() });
        
        // Log pool exhaustion error
        this.stats.poolExhaustedErrors++;
        cloudWatchLogger.databaseError(
          new Error('Database query failed: connection pool exhausted'),
          'acquire_connection'
        );
        
        // Reject after timeout if still in queue
        setTimeout(() => {
          const queueIndex = this.connectionQueue.findIndex(item => item.resolve === resolve);
          if (queueIndex !== -1) {
            this.connectionQueue.splice(queueIndex, 1);
            reject(new Error('Connection pool timeout: no connections available'));
          }
        }, this.timeout);
      }
    });
  }

  /**
   * Release a connection back to the pool
   * @param {string} connectionId - Connection ID to release
   */
  releaseConnection(connectionId) {
    if (this.activeConnections.has(connectionId)) {
      this.activeConnections.delete(connectionId);
      
      // Process queue if there are waiting requests
      if (this.connectionQueue.length > 0) {
        const { resolve } = this.connectionQueue.shift();
        const newConnectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.activeConnections.add(newConnectionId);
        resolve(newConnectionId);
      }
    }
  }

  /**
   * Execute a request with connection pooling and retry logic
   * @param {Function} requestFn - Function that performs the actual request
   * @param {Object} options - Request options
   * @returns {Promise} Request result
   */
  async executeRequest(requestFn, options = {}) {
    const maxRetries = options.retries || this.retryAttempts;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let connectionId;
      
      try {
        this.stats.totalRequests++;
        
        // Acquire connection
        connectionId = await this.acquireConnection();
        
        // Execute request with timeout
        const result = await Promise.race([
          requestFn(connectionId, options),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.timeout)
          )
        ]);
        
        this.stats.successfulRequests++;
        return result;
        
      } catch (error) {
        lastError = error;
        this.stats.failedRequests++;
        
        if (error.message.includes('timeout')) {
          this.stats.timeoutErrors++;
        }
        
        // Log error
        await cloudWatchLogger.error(`Connection pool request failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`, {
          type: 'connection_pool',
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          connectionId,
          error: error.message
        });
        
        // Wait before retry (except on last attempt)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempt + 1)));
        }
        
      } finally {
        // Always release connection
        if (connectionId) {
          this.releaseConnection(connectionId);
        }
      }
    }
    
    // All retries exhausted
    throw lastError;
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.activeConnections.size,
      queuedRequests: this.connectionQueue.length,
      maxConnections: this.maxConnections,
      poolUtilization: (this.activeConnections.size / this.maxConnections) * 100
    };
  }

  /**
   * Health check for the connection pool
   * @returns {Object} Health status
   */
  healthCheck() {
    const stats = this.getStats();
    const isHealthy = stats.poolUtilization < 90 && stats.queuedRequests < 5;
    
    return {
      healthy: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      utilization: stats.poolUtilization,
      queuedRequests: stats.queuedRequests,
      activeConnections: stats.activeConnections,
      maxConnections: stats.maxConnections
    };
  }

  /**
   * Clear all connections and reset pool
   */
  reset() {
    this.activeConnections.clear();
    this.connectionQueue.forEach(({ reject }) => {
      reject(new Error('Connection pool reset'));
    });
    this.connectionQueue = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutErrors: 0,
      poolExhaustedErrors: 0
    };
  }
}

// Create default connection pools for different services
export const paymentConnectionPool = new ConnectionPool({
  maxConnections: 5,
  timeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000
});

export const databaseConnectionPool = new ConnectionPool({
  maxConnections: 10,
  timeout: 3000,
  retryAttempts: 2,
  retryDelay: 500
});

export default ConnectionPool;