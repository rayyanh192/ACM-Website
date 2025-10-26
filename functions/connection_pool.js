/**
 * Connection Pool - JavaScript equivalent of connection_pool.py
 * Manages database connection pooling with proper error handling and monitoring
 */

const mysql = require('mysql2/promise');
const { databaseConfig, getPoolConfig, getRetryConfig } = require('./database_config');

class ConnectionPool {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
    this.healthCheckInterval = null;
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      queuedRequests: 0,
      errors: 0,
      timeouts: 0,
      lastHealthCheck: null
    };
  }

  /**
   * Initialize the connection pool
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing database connection pool...');
      
      const poolConfig = getPoolConfig();
      this.pool = mysql.createPool(poolConfig);
      
      // Set up event listeners for monitoring
      this.setupEventListeners();
      
      // Start health check monitoring
      this.startHealthCheck();
      
      // Test initial connection
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`Database connection pool initialized with ${poolConfig.connectionLimit} connections`);
      
    } catch (error) {
      console.error('Failed to initialize connection pool:', error);
      throw new Error(`Connection pool initialization failed: ${error.message}`);
    }
  }

  /**
   * Set up event listeners for pool monitoring
   */
  setupEventListeners() {
    if (!this.pool) return;

    this.pool.on('connection', (connection) => {
      this.stats.totalConnections++;
      console.log(`New database connection established (ID: ${connection.threadId})`);
    });

    this.pool.on('acquire', (connection) => {
      this.stats.activeConnections++;
      if (databaseConfig.debug) {
        console.log(`Connection acquired (ID: ${connection.threadId})`);
      }
    });

    this.pool.on('release', (connection) => {
      this.stats.activeConnections--;
      if (databaseConfig.debug) {
        console.log(`Connection released (ID: ${connection.threadId})`);
      }
    });

    this.pool.on('enqueue', () => {
      this.stats.queuedRequests++;
      console.warn('Connection request queued - pool may be exhausted');
    });
  }

  /**
   * Get a connection from the pool with retry logic
   * @returns {Promise<Connection>} Database connection
   */
  async getConnection() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const retryConfig = getRetryConfig();
    let lastError;

    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const connection = await this.pool.getConnection();
        
        // Wrap connection to track usage
        return this.wrapConnection(connection);
        
      } catch (error) {
        lastError = error;
        this.stats.errors++;
        
        console.error(`Connection attempt ${attempt} failed:`, error.message);
        
        // Check if this is a pool exhaustion error
        if (error.message.includes('Too many connections') || 
            error.message.includes('connection pool exhausted') ||
            error.code === 'POOL_CLOSED' ||
            error.code === 'POOL_ENQUEUELIMIT') {
          
          console.error('Database query failed: connection pool exhausted');
          
          // If pool is exhausted, wait longer before retry
          if (attempt < retryConfig.maxRetries) {
            const waitTime = retryConfig.retryDelay * attempt * 2; // Exponential backoff
            console.log(`Waiting ${waitTime}ms before retry due to pool exhaustion...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          continue;
        }
        
        // Check if this is a retryable error
        if (!retryConfig.retryCondition(error)) {
          throw error;
        }
        
        // Wait before retry
        if (attempt < retryConfig.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryConfig.retryDelay * attempt));
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to get database connection after ${retryConfig.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Wrap connection to add monitoring and automatic release
   * @param {Connection} connection - Raw database connection
   * @returns {Object} Wrapped connection
   */
  wrapConnection(connection) {
    const startTime = Date.now();
    let isReleased = false;

    return {
      // Proxy all connection methods
      ...connection,
      
      // Override query method to add timeout handling
      query: async (sql, params) => {
        try {
          const queryStartTime = Date.now();
          const result = await connection.query(sql, params);
          
          if (databaseConfig.logQueries) {
            const queryTime = Date.now() - queryStartTime;
            console.log(`Query executed in ${queryTime}ms: ${sql.substring(0, 100)}...`);
          }
          
          return result;
          
        } catch (error) {
          if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
            this.stats.timeouts++;
            console.error('Database query timeout:', error.message);
          }
          throw error;
        }
      },
      
      // Override release method to track stats
      release: () => {
        if (!isReleased) {
          const connectionTime = Date.now() - startTime;
          if (databaseConfig.debug) {
            console.log(`Connection used for ${connectionTime}ms`);
          }
          connection.release();
          isReleased = true;
        }
      },
      
      // Add destroy method for cleanup
      destroy: () => {
        if (!isReleased) {
          connection.destroy();
          isReleased = true;
        }
      }
    };
  }

  /**
   * Release a connection back to the pool
   * @param {Object} connection - Wrapped connection object
   */
  releaseConnection(connection) {
    if (connection && typeof connection.release === 'function') {
      connection.release();
    }
  }

  /**
   * Execute a query with automatic connection management
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      const [rows] = await connection.query(sql, params);
      return rows;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Test database connection
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      const connection = await this.getConnection();
      await connection.query('SELECT 1 as test');
      this.releaseConnection(connection);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const isHealthy = await this.testConnection();
        this.stats.lastHealthCheck = new Date().toISOString();
        
        if (!isHealthy) {
          console.error('Database health check failed');
        } else if (databaseConfig.debug) {
          console.log('Database health check passed');
        }
        
      } catch (error) {
        console.error('Health check error:', error.message);
      }
    }, databaseConfig.healthCheckInterval);
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    const poolStats = this.pool ? {
      allConnections: this.pool.pool._allConnections.length,
      freeConnections: this.pool.pool._freeConnections.length,
      connectionQueue: this.pool.pool._connectionQueue.length,
      acquiringConnections: this.pool.pool._acquiringConnections.length
    } : {};

    return {
      ...this.stats,
      pool: poolStats,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Close all connections and clean up
   */
  async close() {
    console.log('Closing database connection pool...');
    
    this.stopHealthCheck();
    
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    
    this.isInitialized = false;
    console.log('Database connection pool closed');
  }

  /**
   * Handle pool exhaustion by attempting recovery
   */
  async handlePoolExhaustion() {
    console.warn('Attempting to recover from pool exhaustion...');
    
    try {
      // Log current pool stats
      const stats = this.getStats();
      console.log('Pool stats:', stats);
      
      // Force close idle connections if possible
      if (this.pool && this.pool.pool._freeConnections) {
        const idleConnections = this.pool.pool._freeConnections.length;
        console.log(`Found ${idleConnections} idle connections`);
      }
      
      // Wait a bit for connections to be released
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Test if pool is recovered
      const isRecovered = await this.testConnection();
      if (isRecovered) {
        console.log('Pool exhaustion recovery successful');
      } else {
        console.error('Pool exhaustion recovery failed');
      }
      
      return isRecovered;
      
    } catch (error) {
      console.error('Error during pool exhaustion recovery:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const connectionPool = new ConnectionPool();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing connection pool...');
  await connectionPool.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing connection pool...');
  await connectionPool.close();
  process.exit(0);
});

module.exports = {
  connectionPool,
  ConnectionPool
};