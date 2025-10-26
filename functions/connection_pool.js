/**
 * Connection Pool Manager
 * Advanced connection pooling to prevent "connection pool exhausted" errors
 */

const functions = require("firebase-functions");
const genericPool = require("generic-pool");
const { dbConfig } = require("./database_config");

class ConnectionPoolManager {
  constructor() {
    this.pools = new Map();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      waitingRequests: 0,
      errors: 0,
      lastError: null
    };
  }

  /**
   * Create a generic connection pool with advanced configuration
   */
  createPool(name, factory, options = {}) {
    const defaultOptions = {
      max: 10,
      min: 2,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      maxWaitingClients: 50,
      testOnBorrow: true,
      testOnReturn: false,
      ...options
    };

    const pool = genericPool.createPool(factory, defaultOptions);

    // Add event listeners for monitoring
    pool.on('factoryCreateError', (err) => {
      console.error(`Pool ${name} factory create error:`, err);
      this.metrics.errors++;
      this.metrics.lastError = err;
      
      // Log to CloudWatch if available
      if (global.cloudWatchLogger) {
        global.cloudWatchLogger.databaseError(err, `pool_${name}_create_error`);
      }
    });

    pool.on('factoryDestroyError', (err) => {
      console.error(`Pool ${name} factory destroy error:`, err);
      this.metrics.errors++;
      this.metrics.lastError = err;
    });

    this.pools.set(name, pool);
    console.log(`Connection pool '${name}' created successfully`);
    
    return pool;
  }

  /**
   * Get connection from pool with retry logic
   */
  async getConnection(poolName, retries = 3) {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new functions.https.HttpsError('internal', `Pool '${poolName}' not found`);
    }

    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.metrics.waitingRequests++;
        const connection = await pool.acquire();
        this.metrics.waitingRequests--;
        this.metrics.activeConnections++;
        
        return {
          connection,
          release: () => {
            this.metrics.activeConnections--;
            return pool.release(connection);
          }
        };
      } catch (error) {
        this.metrics.waitingRequests--;
        this.metrics.errors++;
        lastError = error;
        
        console.error(`Pool ${poolName} acquire attempt ${attempt} failed:`, error);
        
        if (attempt < retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Log final failure to CloudWatch
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(lastError, `pool_${poolName}_exhausted`);
    }

    throw new functions.https.HttpsError('resource-exhausted', 
      `Connection pool '${poolName}' exhausted after ${retries} attempts`);
  }

  /**
   * Execute operation with automatic connection management
   */
  async executeWithConnection(poolName, operation) {
    let connectionWrapper = null;
    
    try {
      connectionWrapper = await this.getConnection(poolName);
      const result = await operation(connectionWrapper.connection);
      return result;
    } catch (error) {
      console.error(`Operation failed on pool ${poolName}:`, error);
      throw error;
    } finally {
      if (connectionWrapper) {
        connectionWrapper.release();
      }
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(poolName) {
    const pool = this.pools.get(poolName);
    if (!pool) {
      return null;
    }

    return {
      size: pool.size,
      available: pool.available,
      borrowed: pool.borrowed,
      invalid: pool.invalid,
      pending: pool.pending,
      max: pool.max,
      min: pool.min,
      ...this.metrics
    };
  }

  /**
   * Get all pools statistics
   */
  getAllStats() {
    const stats = {};
    for (const [name, pool] of this.pools) {
      stats[name] = this.getPoolStats(name);
    }
    return stats;
  }

  /**
   * Drain and close a specific pool
   */
  async closePool(poolName) {
    const pool = this.pools.get(poolName);
    if (!pool) {
      return;
    }

    try {
      await pool.drain();
      await pool.clear();
      this.pools.delete(poolName);
      console.log(`Pool '${poolName}' closed successfully`);
    } catch (error) {
      console.error(`Error closing pool '${poolName}':`, error);
      throw error;
    }
  }

  /**
   * Close all pools
   */
  async closeAllPools() {
    const closePromises = [];
    
    for (const poolName of this.pools.keys()) {
      closePromises.push(this.closePool(poolName));
    }

    try {
      await Promise.all(closePromises);
      console.log('All connection pools closed successfully');
    } catch (error) {
      console.error('Error closing connection pools:', error);
      throw error;
    }
  }

  /**
   * Health check for all pools
   */
  async healthCheck() {
    const health = {
      pools: {},
      overall: true,
      timestamp: new Date().toISOString()
    };

    for (const [name, pool] of this.pools) {
      try {
        const stats = this.getPoolStats(name);
        health.pools[name] = {
          healthy: stats.available > 0 || stats.size < stats.max,
          stats
        };
        
        if (!health.pools[name].healthy) {
          health.overall = false;
        }
      } catch (error) {
        health.pools[name] = {
          healthy: false,
          error: error.message
        };
        health.overall = false;
      }
    }

    return health;
  }
}

// Singleton instance
const poolManager = new ConnectionPoolManager();

module.exports = {
  ConnectionPoolManager,
  poolManager
};