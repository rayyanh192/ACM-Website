/**
 * Database Service Client
 * Handles database connections with connection pooling and timeout management
 * Addresses the "Database query failed: connection pool exhausted" error from logs
 */

import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class DatabaseService {
  constructor() {
    this.baseUrl = process.env.VUE_APP_DATABASE_SERVICE_URL || 'https://api.database-service.com';
    this.timeout = parseInt(process.env.VUE_APP_DATABASE_TIMEOUT) || 10000; // 10 second timeout
    this.maxRetries = parseInt(process.env.VUE_APP_DATABASE_MAX_RETRIES) || 3;
    
    // Connection pool configuration
    this.connectionPool = {
      maxConnections: parseInt(process.env.VUE_APP_DB_MAX_CONNECTIONS) || 20,
      currentConnections: 0,
      waitingQueue: [],
      idleConnections: [],
      busyConnections: new Set(),
      connectionTimeout: parseInt(process.env.VUE_APP_DB_CONNECTION_TIMEOUT) || 30000,
      idleTimeout: parseInt(process.env.VUE_APP_DB_IDLE_TIMEOUT) || 300000 // 5 minutes
    };

    // Circuit breaker for database
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 5,
      resetTimeout: 60000 // 1 minute for database
    };

    // Start connection pool monitoring
    this.startPoolMonitoring();
  }

  /**
   * Monitor connection pool health
   */
  startPoolMonitoring() {
    setInterval(() => {
      this.cleanupIdleConnections();
      this.logPoolStatus();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Log connection pool status
   */
  async logPoolStatus() {
    const poolStatus = {
      maxConnections: this.connectionPool.maxConnections,
      currentConnections: this.connectionPool.currentConnections,
      idleConnections: this.connectionPool.idleConnections.length,
      busyConnections: this.connectionPool.busyConnections.size,
      waitingQueue: this.connectionPool.waitingQueue.length
    };

    // Log warning if pool is getting full
    if (this.connectionPool.currentConnections > this.connectionPool.maxConnections * 0.8) {
      await cloudWatchLogger.warn('Database connection pool nearing capacity', {
        type: 'database_pool_warning',
        ...poolStatus
      });
    }

    // Log error if pool is exhausted
    if (this.connectionPool.currentConnections >= this.connectionPool.maxConnections) {
      await cloudWatchLogger.error('Database query failed: connection pool exhausted', {
        type: 'database_pool_exhausted',
        ...poolStatus
      });
    }
  }

  /**
   * Clean up idle connections
   */
  cleanupIdleConnections() {
    const now = Date.now();
    this.connectionPool.idleConnections = this.connectionPool.idleConnections.filter(conn => {
      if (now - conn.lastUsed > this.connectionPool.idleTimeout) {
        this.releaseConnection(conn.id);
        return false;
      }
      return true;
    });
  }

  /**
   * Check circuit breaker status
   */
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    if (timeSinceLastFailure > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failureCount = 0;
      return false;
    }

    return true;
  }

  /**
   * Record database failure
   */
  recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      cloudWatchLogger.error('Database service circuit breaker opened', {
        type: 'circuit_breaker',
        service: 'database',
        failureCount: this.circuitBreaker.failureCount
      });
    }
  }

  /**
   * Record database success
   */
  recordSuccess() {
    this.circuitBreaker.failureCount = 0;
    if (this.circuitBreaker.isOpen) {
      this.circuitBreaker.isOpen = false;
      cloudWatchLogger.info('Database service circuit breaker closed', {
        type: 'circuit_breaker',
        service: 'database'
      });
    }
  }

  /**
   * Acquire connection from pool
   */
  async acquireConnection() {
    return new Promise((resolve, reject) => {
      // Check if pool is exhausted
      if (this.connectionPool.currentConnections >= this.connectionPool.maxConnections) {
        // Add to waiting queue
        const timeout = setTimeout(() => {
          const index = this.connectionPool.waitingQueue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.connectionPool.waitingQueue.splice(index, 1);
          }
          reject(new Error('Database query failed: connection pool exhausted'));
        }, this.connectionPool.connectionTimeout);

        this.connectionPool.waitingQueue.push({
          resolve,
          reject,
          timeout,
          timestamp: Date.now()
        });
        return;
      }

      // Check for idle connection
      if (this.connectionPool.idleConnections.length > 0) {
        const connection = this.connectionPool.idleConnections.pop();
        connection.lastUsed = Date.now();
        this.connectionPool.busyConnections.add(connection.id);
        resolve(connection);
        return;
      }

      // Create new connection
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const connection = {
        id: connectionId,
        created: Date.now(),
        lastUsed: Date.now()
      };

      this.connectionPool.currentConnections++;
      this.connectionPool.busyConnections.add(connectionId);
      resolve(connection);
    });
  }

  /**
   * Release connection back to pool
   */
  releaseConnection(connectionId) {
    this.connectionPool.busyConnections.delete(connectionId);

    // Check if there are waiting requests
    if (this.connectionPool.waitingQueue.length > 0) {
      const waiting = this.connectionPool.waitingQueue.shift();
      clearTimeout(waiting.timeout);
      
      const connection = {
        id: connectionId,
        lastUsed: Date.now()
      };
      
      this.connectionPool.busyConnections.add(connectionId);
      waiting.resolve(connection);
    } else {
      // Return to idle pool
      this.connectionPool.idleConnections.push({
        id: connectionId,
        lastUsed: Date.now()
      });
    }
  }

  /**
   * Execute database query with connection pooling
   */
  async executeQuery(query, params = [], operation = 'query') {
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Database service circuit breaker is open');
    }

    let connection = null;
    const startTime = Date.now();

    try {
      // Acquire connection from pool
      connection = await this.acquireConnection();

      await cloudWatchLogger.info('Database query started', {
        type: 'database_query',
        operation,
        connectionId: connection.id,
        poolStatus: {
          current: this.connectionPool.currentConnections,
          busy: this.connectionPool.busyConnections.size,
          idle: this.connectionPool.idleConnections.length,
          waiting: this.connectionPool.waitingQueue.length
        }
      });

      // Execute the actual query
      const result = await this.performQuery(connection, query, params);
      
      const duration = Date.now() - startTime;
      
      await cloudWatchLogger.info('Database query completed', {
        type: 'database_query_success',
        operation,
        connectionId: connection.id,
        duration,
        rowCount: result.rowCount || 0
      });

      this.recordSuccess();
      return result;

    } catch (error) {
      this.recordFailure();
      
      const duration = Date.now() - startTime;
      
      await cloudWatchLogger.databaseError(error, operation);
      
      // Log specific error patterns from the logs
      if (error.message.includes('connection pool exhausted')) {
        await cloudWatchLogger.error('Database query failed: connection pool exhausted', {
          type: 'database_pool_exhausted',
          operation,
          duration,
          poolStatus: {
            current: this.connectionPool.currentConnections,
            max: this.connectionPool.maxConnections,
            waiting: this.connectionPool.waitingQueue.length
          }
        });
      }

      throw error;

    } finally {
      // Always release the connection
      if (connection) {
        this.releaseConnection(connection.id);
      }
    }
  }

  /**
   * Perform the actual database query
   * This would be implemented based on your database type (PostgreSQL, MySQL, etc.)
   */
  async performQuery(connection, query, params) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Simulate database query - replace with actual database client
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VUE_APP_DATABASE_API_KEY}`,
          'Connection-ID': connection.id
        },
        body: JSON.stringify({
          query,
          params,
          connectionId: connection.id
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Database error: ${response.status} ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Database connection timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Execute SELECT query
   */
  async select(table, conditions = {}, options = {}) {
    const query = this.buildSelectQuery(table, conditions, options);
    return this.executeQuery(query.sql, query.params, 'select');
  }

  /**
   * Execute INSERT query
   */
  async insert(table, data) {
    const query = this.buildInsertQuery(table, data);
    return this.executeQuery(query.sql, query.params, 'insert');
  }

  /**
   * Execute UPDATE query
   */
  async update(table, data, conditions = {}) {
    const query = this.buildUpdateQuery(table, data, conditions);
    return this.executeQuery(query.sql, query.params, 'update');
  }

  /**
   * Execute DELETE query
   */
  async delete(table, conditions = {}) {
    const query = this.buildDeleteQuery(table, conditions);
    return this.executeQuery(query.sql, query.params, 'delete');
  }

  /**
   * Build SELECT query
   */
  buildSelectQuery(table, conditions, options) {
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions).map((key, index) => {
        params.push(conditions[key]);
        return `${key} = $${index + 1}`;
      }).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }
    
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    return { sql, params };
  }

  /**
   * Build INSERT query
   */
  buildInsertQuery(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    return { sql, params: values };
  }

  /**
   * Build UPDATE query
   */
  buildUpdateQuery(table, data, conditions) {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const conditionKeys = Object.keys(conditions);
    const conditionValues = Object.values(conditions);
    
    const setClause = dataKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const whereClause = conditionKeys.map((key, index) => `${key} = $${dataKeys.length + index + 1}`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    
    return { sql, params: [...dataValues, ...conditionValues] };
  }

  /**
   * Build DELETE query
   */
  buildDeleteQuery(table, conditions) {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    
    return { sql, params: values };
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return {
      maxConnections: this.connectionPool.maxConnections,
      currentConnections: this.connectionPool.currentConnections,
      idleConnections: this.connectionPool.idleConnections.length,
      busyConnections: this.connectionPool.busyConnections.size,
      waitingQueue: this.connectionPool.waitingQueue.length,
      circuitBreakerOpen: this.circuitBreaker.isOpen,
      failureCount: this.circuitBreaker.failureCount
    };
  }

  /**
   * Health check for database service
   */
  async healthCheck() {
    try {
      const result = await this.executeQuery('SELECT 1 as health_check', [], 'health_check');
      return result && result.rows && result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

export { DatabaseService };
export default databaseService;