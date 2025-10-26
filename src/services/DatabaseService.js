/**
 * Database Service with Connection Pool Management
 * Addresses the "database connection pool exhausted" error from the logs
 */

import { databaseClient } from '@/utils/httpClient';
import { serviceConfig } from '@/config/serviceConfig';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class ConnectionPool {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || serviceConfig.database.maxConnections;
    this.minConnections = options.minConnections || serviceConfig.database.minConnections;
    this.idleTimeout = options.idleTimeout || serviceConfig.database.idleTimeout;
    
    this.activeConnections = 0;
    this.idleConnections = 0;
    this.waitingQueue = [];
    this.connectionStats = {
      created: 0,
      destroyed: 0,
      timeouts: 0,
      errors: 0
    };
    
    this.lastHealthCheck = null;
    this.isHealthy = true;
  }

  async acquireConnection() {
    return new Promise((resolve, reject) => {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        this.connectionStats.created++;
        
        cloudWatchLogger.info('Database connection acquired', {
          type: 'db_connection_acquired',
          activeConnections: this.activeConnections,
          maxConnections: this.maxConnections,
          waitingQueue: this.waitingQueue.length
        });
        
        resolve(this.createConnection());
      } else {
        // Add to waiting queue
        this.waitingQueue.push({ resolve, reject, timestamp: Date.now() });
        
        cloudWatchLogger.warn('Database connection pool exhausted, queuing request', {
          type: 'db_connection_queued',
          activeConnections: this.activeConnections,
          maxConnections: this.maxConnections,
          waitingQueue: this.waitingQueue.length
        });
        
        // Set timeout for queued requests
        setTimeout(() => {
          const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            this.connectionStats.timeouts++;
            
            cloudWatchLogger.error('Database connection request timed out', {
              type: 'db_connection_timeout',
              waitTime: Date.now() - this.waitingQueue[index]?.timestamp,
              queueLength: this.waitingQueue.length
            });
            
            reject(new Error('Database connection request timed out'));
          }
        }, serviceConfig.database.connectionTimeout);
      }
    });
  }

  releaseConnection(connection) {
    this.activeConnections--;
    
    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      this.activeConnections++;
      resolve(this.createConnection());
    }
    
    cloudWatchLogger.info('Database connection released', {
      type: 'db_connection_released',
      activeConnections: this.activeConnections,
      waitingQueue: this.waitingQueue.length
    });
  }

  createConnection() {
    return {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };
  }

  getStats() {
    return {
      activeConnections: this.activeConnections,
      idleConnections: this.idleConnections,
      maxConnections: this.maxConnections,
      waitingQueue: this.waitingQueue.length,
      stats: this.connectionStats,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  async healthCheck() {
    try {
      this.lastHealthCheck = Date.now();
      
      // Simulate connection health check
      const testConnection = await this.acquireConnection();
      this.releaseConnection(testConnection);
      
      this.isHealthy = true;
      
      cloudWatchLogger.info('Database connection pool health check passed', {
        type: 'db_pool_health_check',
        ...this.getStats()
      });
      
      return { healthy: true, stats: this.getStats() };
    } catch (error) {
      this.isHealthy = false;
      this.connectionStats.errors++;
      
      cloudWatchLogger.error('Database connection pool health check failed', {
        type: 'db_pool_health_check_failed',
        error: error.message,
        ...this.getStats()
      });
      
      return { healthy: false, error: error.message, stats: this.getStats() };
    }
  }
}

class DatabaseService {
  constructor() {
    this.client = databaseClient;
    this.config = serviceConfig.database;
    this.connectionPool = new ConnectionPool(this.config);
    
    // Start periodic health checks
    this.startHealthMonitoring();
  }

  /**
   * Execute database query with connection pool management
   * @param {string} query - SQL query or operation name
   * @param {Object} params - Query parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = {}, options = {}) {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    let connection = null;

    try {
      // Acquire connection from pool
      connection = await this.connectionPool.acquireConnection();
      
      await cloudWatchLogger.info('Database query started', {
        type: 'db_query_start',
        queryId,
        query: this.sanitizeQuery(query),
        connectionId: connection.id
      });

      // Execute query with timeout
      const response = await this.client.post('/query', {
        query_id: queryId,
        query: query,
        params: params,
        connection_id: connection.id,
        options: {
          timeout: this.config.queryTimeout,
          ...options
        }
      }, {
        timeout: this.config.queryTimeout,
        headers: {
          'X-Query-ID': queryId,
          'X-Connection-ID': connection.id
        }
      }, {
        serviceName: 'database',
        retryOptions: {
          maxRetries: this.config.retryAttempts,
          baseDelay: this.config.retryDelay,
          serviceName: 'database_query'
        }
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      await cloudWatchLogger.info('Database query completed', {
        type: 'db_query_success',
        queryId,
        duration,
        rowsAffected: result.rows_affected,
        connectionId: connection.id
      });

      return {
        success: true,
        queryId,
        data: result.data,
        rowsAffected: result.rows_affected,
        executionTime: duration,
        connectionId: connection.id
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enhanced error handling for database issues
      const errorInfo = this.classifyDatabaseError(error);
      
      await cloudWatchLogger.databaseError(error, query);
      
      await cloudWatchLogger.error('Database query failed', {
        type: 'db_query_failure',
        queryId,
        query: this.sanitizeQuery(query),
        duration,
        errorType: errorInfo.type,
        errorCode: errorInfo.code,
        connectionId: connection?.id,
        error: error.message
      });

      return {
        success: false,
        queryId,
        error: {
          type: errorInfo.type,
          code: errorInfo.code,
          message: errorInfo.userMessage,
          technicalDetails: error.message
        },
        executionTime: duration,
        connectionId: connection?.id
      };

    } finally {
      // Always release connection back to pool
      if (connection) {
        this.connectionPool.releaseConnection(connection);
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Array} queries - Array of query objects
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} Transaction result
   */
  async executeTransaction(queries, options = {}) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();
    let connection = null;

    try {
      connection = await this.connectionPool.acquireConnection();
      
      await cloudWatchLogger.info('Database transaction started', {
        type: 'db_transaction_start',
        transactionId,
        queryCount: queries.length,
        connectionId: connection.id
      });

      const response = await this.client.post('/transaction', {
        transaction_id: transactionId,
        queries: queries,
        connection_id: connection.id,
        options: {
          isolation_level: options.isolationLevel || 'READ_COMMITTED',
          timeout: this.config.queryTimeout,
          ...options
        }
      }, {
        timeout: this.config.queryTimeout * queries.length, // Scale timeout with query count
        headers: {
          'X-Transaction-ID': transactionId,
          'X-Connection-ID': connection.id
        }
      }, {
        serviceName: 'database',
        retryOptions: {
          maxRetries: 1, // Fewer retries for transactions
          baseDelay: this.config.retryDelay,
          serviceName: 'database_transaction'
        }
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      await cloudWatchLogger.info('Database transaction completed', {
        type: 'db_transaction_success',
        transactionId,
        duration,
        queriesExecuted: result.queries_executed,
        connectionId: connection.id
      });

      return {
        success: true,
        transactionId,
        results: result.results,
        queriesExecuted: result.queries_executed,
        executionTime: duration,
        connectionId: connection.id
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      await cloudWatchLogger.error('Database transaction failed', {
        type: 'db_transaction_failure',
        transactionId,
        queryCount: queries.length,
        duration,
        connectionId: connection?.id,
        error: error.message
      });

      return {
        success: false,
        transactionId,
        error: {
          message: 'Transaction failed',
          technicalDetails: error.message
        },
        executionTime: duration,
        connectionId: connection?.id
      };

    } finally {
      if (connection) {
        this.connectionPool.releaseConnection(connection);
      }
    }
  }

  /**
   * Get connection pool statistics
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    return this.connectionPool.getStats();
  }

  /**
   * Perform database health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const poolHealth = await this.connectionPool.healthCheck();
      const dbHealth = await this.client.healthCheck('database', '/db-health');
      
      return {
        healthy: poolHealth.healthy && dbHealth.healthy,
        connectionPool: poolHealth,
        database: dbHealth
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring() {
    if (serviceConfig.healthCheck.enabled) {
      setInterval(async () => {
        await this.connectionPool.healthCheck();
      }, serviceConfig.healthCheck.interval);
    }
  }

  /**
   * Classify database errors for better handling
   * @param {Error} error - The error to classify
   * @returns {Object} Error classification
   */
  classifyDatabaseError(error) {
    // Connection pool exhaustion (matching the original error)
    if (error.message.includes('connection pool exhausted') || 
        error.message.includes('too many connections')) {
      return {
        type: 'connection_pool_exhausted',
        code: 'DB_POOL_EXHAUSTED',
        userMessage: 'Database is currently busy. Please try again in a moment.'
      };
    }

    // Connection timeout
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        type: 'timeout',
        code: 'DB_TIMEOUT',
        userMessage: 'Database operation timed out. Please try again.'
      };
    }

    // Connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        type: 'connection',
        code: 'DB_CONNECTION_ERROR',
        userMessage: 'Unable to connect to database. Please try again later.'
      };
    }

    // Query errors
    if (error.response?.status === 400) {
      return {
        type: 'query_error',
        code: 'DB_QUERY_ERROR',
        userMessage: 'Invalid database operation. Please check your input.'
      };
    }

    // Server errors
    if (error.response?.status >= 500) {
      return {
        type: 'server_error',
        code: 'DB_SERVER_ERROR',
        userMessage: 'Database service is temporarily unavailable.'
      };
    }

    return {
      type: 'unknown',
      code: 'DB_UNKNOWN_ERROR',
      userMessage: 'An unexpected database error occurred.'
    };
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   * @param {string} query - Original query
   * @returns {string} Sanitized query
   */
  sanitizeQuery(query) {
    if (typeof query !== 'string') return '[Non-string query]';
    
    // Remove potential sensitive data patterns
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/secret\s*=\s*'[^']*'/gi, "secret='***'")
      .substring(0, 200); // Limit length
  }

  /**
   * Generate unique query ID
   * @returns {string} Query ID
   */
  generateQueryId() {
    return `qry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique transaction ID
   * @returns {string} Transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export default databaseService;