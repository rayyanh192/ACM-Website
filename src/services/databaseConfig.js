/**
 * Database Configuration - JavaScript equivalent of database_config.py
 * Manages database connections and configuration
 */

import { databaseConnectionPool } from './connectionPool';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class DatabaseConfig {
  constructor() {
    this.config = {
      host: process.env.VUE_APP_DB_HOST || 'localhost',
      port: process.env.VUE_APP_DB_PORT || 5432,
      database: process.env.VUE_APP_DB_NAME || 'app_db',
      username: process.env.VUE_APP_DB_USER || 'app_user',
      password: process.env.VUE_APP_DB_PASSWORD || '',
      ssl: process.env.VUE_APP_DB_SSL === 'true',
      connectionTimeout: parseInt(process.env.VUE_APP_DB_TIMEOUT) || 3000,
      maxRetries: parseInt(process.env.VUE_APP_DB_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.VUE_APP_DB_RETRY_DELAY) || 1000
    };
    
    this.isConnected = false;
    this.lastHealthCheck = null;
    this.connectionStats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageResponseTime: 0,
      lastError: null
    };
  }

  /**
   * Get database connection string
   * @returns {string} Connection string
   */
  getConnectionString() {
    const { host, port, database, username, password, ssl } = this.config;
    return `postgresql://${username}:${password}@${host}:${port}/${database}${ssl ? '?ssl=true' : ''}`;
  }

  /**
   * Test database connection
   * @returns {Promise<boolean>} Connection success
   */
  async testConnection() {
    try {
      const startTime = Date.now();
      
      // Simulate database connection test
      await databaseConnectionPool.executeRequest(async (connectionId) => {
        // Simulate connection test delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Simulate potential connection failure
        if (Math.random() < 0.1) { // 10% chance of failure for testing
          throw new Error('Database connection test failed');
        }
        
        return { status: 'connected', connectionId };
      });
      
      const responseTime = Date.now() - startTime;
      this.isConnected = true;
      this.lastHealthCheck = new Date();
      
      await cloudWatchLogger.info('Database connection test successful', {
        type: 'database_connection',
        responseTime,
        host: this.config.host,
        database: this.config.database
      });
      
      return true;
      
    } catch (error) {
      this.isConnected = false;
      this.connectionStats.lastError = error.message;
      
      await cloudWatchLogger.databaseError(error, 'connection_test');
      
      return false;
    }
  }

  /**
   * Execute a database query with connection pooling
   * @param {string} query - SQL query to execute
   * @param {Array} params - Query parameters
   * @returns {Promise} Query result
   */
  async executeQuery(query, params = []) {
    const startTime = Date.now();
    this.connectionStats.totalQueries++;
    
    try {
      const result = await databaseConnectionPool.executeRequest(async (connectionId) => {
        // Simulate query execution
        await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));
        
        // Simulate potential query failures
        if (query.toLowerCase().includes('error_test')) {
          throw new Error('Simulated database query error');
        }
        
        // Simulate connection pool exhaustion
        if (Math.random() < 0.05) { // 5% chance
          throw new Error('Database query failed: connection pool exhausted');
        }
        
        return {
          rows: [],
          rowCount: 0,
          query,
          params,
          connectionId,
          executionTime: Date.now() - startTime
        };
      });
      
      const responseTime = Date.now() - startTime;
      this.connectionStats.successfulQueries++;
      this.updateAverageResponseTime(responseTime);
      
      await cloudWatchLogger.info('Database query executed successfully', {
        type: 'database_query',
        query: query.substring(0, 100), // Log first 100 chars of query
        responseTime,
        rowCount: result.rowCount
      });
      
      return result;
      
    } catch (error) {
      this.connectionStats.failedQueries++;
      this.connectionStats.lastError = error.message;
      
      await cloudWatchLogger.databaseError(error, 'query_execution');
      
      throw error;
    }
  }

  /**
   * Update average response time
   * @param {number} responseTime - Latest response time
   */
  updateAverageResponseTime(responseTime) {
    const totalQueries = this.connectionStats.successfulQueries;
    const currentAverage = this.connectionStats.averageResponseTime;
    
    this.connectionStats.averageResponseTime = 
      ((currentAverage * (totalQueries - 1)) + responseTime) / totalQueries;
  }

  /**
   * Get database health status
   * @returns {Object} Health status
   */
  async getHealthStatus() {
    const poolHealth = databaseConnectionPool.healthCheck();
    const connectionTest = await this.testConnection();
    
    const isHealthy = connectionTest && poolHealth.healthy && 
                     this.connectionStats.averageResponseTime < 1000;
    
    return {
      healthy: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      connection: {
        connected: this.isConnected,
        lastCheck: this.lastHealthCheck,
        host: this.config.host,
        database: this.config.database
      },
      pool: poolHealth,
      performance: {
        averageResponseTime: this.connectionStats.averageResponseTime,
        totalQueries: this.connectionStats.totalQueries,
        successRate: this.connectionStats.totalQueries > 0 ? 
          (this.connectionStats.successfulQueries / this.connectionStats.totalQueries) * 100 : 0
      },
      lastError: this.connectionStats.lastError
    };
  }

  /**
   * Reset connection statistics
   */
  resetStats() {
    this.connectionStats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageResponseTime: 0,
      lastError: null
    };
  }

  /**
   * Close all database connections
   */
  async close() {
    try {
      databaseConnectionPool.reset();
      this.isConnected = false;
      
      await cloudWatchLogger.info('Database connections closed', {
        type: 'database_connection',
        action: 'close'
      });
      
    } catch (error) {
      await cloudWatchLogger.databaseError(error, 'connection_close');
      throw error;
    }
  }
}

// Create and export default database configuration instance
export const databaseConfig = new DatabaseConfig();

export default DatabaseConfig;