/**
 * Database Service Handler
 * Addresses database connection pool exhaustion and implements connection management
 */

import httpClient from './httpClient.js';
import { cloudWatchLogger } from './cloudWatchLogger.js';

class DatabaseService {
  constructor() {
    this.baseUrl = process.env.VUE_APP_DATABASE_SERVICE_URL || 'https://api.database-service.com';
    this.timeout = parseInt(process.env.VUE_APP_DATABASE_TIMEOUT) || 10000; // 10 seconds for DB operations
    this.maxConnections = parseInt(process.env.VUE_APP_DB_MAX_CONNECTIONS) || 20;
    this.connectionRetryDelay = 2000; // 2 seconds between connection retries
    this.activeConnections = 0;
    this.connectionQueue = [];
    this.healthCheckInterval = 30000; // 30 seconds
    this.lastHealthCheck = null;
    this.isHealthy = true;
  }

  /**
   * Acquire a database connection from the pool
   * @returns {Promise<string>} - Connection ID
   */
  async acquireConnection() {
    return new Promise((resolve, reject) => {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        cloudWatchLogger.debug('Database connection acquired', {
          connectionId,
          activeConnections: this.activeConnections,
          maxConnections: this.maxConnections
        });
        
        resolve(connectionId);
      } else {
        // Add to queue if pool is full
        this.connectionQueue.push({ resolve, reject, timestamp: Date.now() });
        
        cloudWatchLogger.warn('Database connection pool exhausted, queuing request', {
          queueLength: this.connectionQueue.length,
          activeConnections: this.activeConnections,
          maxConnections: this.maxConnections
        });

        // Set timeout for queued connection
        setTimeout(() => {
          const index = this.connectionQueue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.connectionQueue.splice(index, 1);
            reject(new Error('Database query failed: connection pool exhausted - timeout waiting for connection'));
          }
        }, this.timeout);
      }
    });
  }

  /**
   * Release a database connection back to the pool
   * @param {string} connectionId - Connection ID to release
   */
  releaseConnection(connectionId) {
    this.activeConnections--;
    
    cloudWatchLogger.debug('Database connection released', {
      connectionId,
      activeConnections: this.activeConnections,
      queueLength: this.connectionQueue.length
    });

    // Process queued connections
    if (this.connectionQueue.length > 0) {
      const { resolve } = this.connectionQueue.shift();
      this.activeConnections++;
      const newConnectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      resolve(newConnectionId);
    }
  }

  /**
   * Execute a database query with connection management
   * @param {string} query - SQL query or operation name
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - Query result
   */
  async executeQuery(query, params = {}) {
    let connectionId = null;

    try {
      // Check service health before executing query
      await this.ensureHealthy();

      // Acquire connection
      connectionId = await this.acquireConnection();

      const startTime = Date.now();

      // Log query start
      await cloudWatchLogger.debug('Database query started', {
        query: query.substring(0, 100), // Truncate long queries
        connectionId,
        activeConnections: this.activeConnections
      });

      // Execute query via HTTP API
      const response = await httpClient.post(
        `${this.baseUrl}/query`,
        {
          query,
          params,
          connectionId
        },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${process.env.VUE_APP_DATABASE_API_KEY}`,
            'X-Connection-ID': connectionId
          }
        }
      );

      const result = await response.json();
      const executionTime = Date.now() - startTime;

      // Log successful query
      await cloudWatchLogger.debug('Database query completed', {
        query: query.substring(0, 100),
        connectionId,
        executionTime,
        rowsAffected: result.rowsAffected || 0
      });

      return result;

    } catch (error) {
      // Enhanced error logging for database issues
      const errorContext = {
        query: query.substring(0, 100),
        connectionId,
        activeConnections: this.activeConnections,
        queueLength: this.connectionQueue.length,
        maxConnections: this.maxConnections
      };

      if (error.message.includes('connection pool exhausted')) {
        errorContext.errorType = 'CONNECTION_POOL_EXHAUSTED';
        await cloudWatchLogger.databaseError(
          new Error('Database query failed: connection pool exhausted'),
          'query_execution'
        );
      } else if (error.message.includes('timeout')) {
        errorContext.errorType = 'TIMEOUT';
        await cloudWatchLogger.databaseError(
          new Error(`Database query timeout after ${this.timeout}ms`),
          'query_execution'
        );
      } else {
        errorContext.errorType = 'GENERAL_ERROR';
        await cloudWatchLogger.databaseError(error, 'query_execution');
      }

      await cloudWatchLogger.error('Database query failed', errorContext);
      throw error;

    } finally {
      // Always release connection
      if (connectionId) {
        this.releaseConnection(connectionId);
      }
    }
  }

  /**
   * Execute a transaction with proper connection management
   * @param {Array} queries - Array of queries to execute in transaction
   * @returns {Promise<Object>} - Transaction result
   */
  async executeTransaction(queries) {
    let connectionId = null;

    try {
      await this.ensureHealthy();
      connectionId = await this.acquireConnection();

      const startTime = Date.now();

      await cloudWatchLogger.info('Database transaction started', {
        queryCount: queries.length,
        connectionId
      });

      const response = await httpClient.post(
        `${this.baseUrl}/transaction`,
        {
          queries,
          connectionId
        },
        {
          timeout: this.timeout * 2, // Double timeout for transactions
          headers: {
            'Authorization': `Bearer ${process.env.VUE_APP_DATABASE_API_KEY}`,
            'X-Connection-ID': connectionId
          }
        }
      );

      const result = await response.json();
      const executionTime = Date.now() - startTime;

      await cloudWatchLogger.info('Database transaction completed', {
        queryCount: queries.length,
        connectionId,
        executionTime,
        transactionId: result.transactionId
      });

      return result;

    } catch (error) {
      await cloudWatchLogger.databaseError(error, 'transaction_execution');
      throw error;
    } finally {
      if (connectionId) {
        this.releaseConnection(connectionId);
      }
    }
  }

  /**
   * Perform database health check
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const response = await httpClient.get(
        `${this.baseUrl}/health`,
        { timeout: 5000 }
      );

      const result = await response.json();
      this.isHealthy = result.status === 'healthy';
      this.lastHealthCheck = Date.now();

      await cloudWatchLogger.info('Database health check completed', {
        status: result.status,
        connectionPoolStatus: result.connectionPool,
        responseTime: result.responseTime
      });

      return result;

    } catch (error) {
      this.isHealthy = false;
      await cloudWatchLogger.databaseError(error, 'health_check');
      throw error;
    }
  }

  /**
   * Ensure database service is healthy
   * @returns {Promise<void>}
   */
  async ensureHealthy() {
    const now = Date.now();
    
    // Check if we need to perform health check
    if (!this.lastHealthCheck || (now - this.lastHealthCheck) > this.healthCheckInterval) {
      try {
        await this.healthCheck();
      } catch (error) {
        // Health check failed, but don't block operations unless service is known to be unhealthy
        console.warn('Database health check failed:', error.message);
      }
    }

    if (!this.isHealthy) {
      throw new Error('Database service is currently unhealthy');
    }
  }

  /**
   * Get connection pool status
   * @returns {Object} - Connection pool information
   */
  getConnectionPoolStatus() {
    return {
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      availableConnections: this.maxConnections - this.activeConnections,
      queueLength: this.connectionQueue.length,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  /**
   * Force close all connections (emergency use)
   * @returns {Promise<void>}
   */
  async closeAllConnections() {
    try {
      await cloudWatchLogger.warn('Forcing closure of all database connections', {
        activeConnections: this.activeConnections,
        queueLength: this.connectionQueue.length
      });

      // Clear the queue
      this.connectionQueue.forEach(({ reject }) => {
        reject(new Error('Database connection forcibly closed'));
      });
      this.connectionQueue = [];

      // Reset connection count
      this.activeConnections = 0;

      await cloudWatchLogger.info('All database connections closed');

    } catch (error) {
      await cloudWatchLogger.error('Failed to close database connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Retry database operation with exponential backoff
   * @param {Function} operation - Database operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<any>} - Operation result
   */
  async retryOperation(operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }

        const delay = this.connectionRetryDelay * Math.pow(2, attempt - 1);
        
        await cloudWatchLogger.warn(`Database operation failed, retrying in ${delay}ms`, {
          attempt,
          maxRetries,
          error: error.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

export { DatabaseService };
export default databaseService;