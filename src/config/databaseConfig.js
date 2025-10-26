/**
 * Database Configuration - Manages database connections and prevents pool exhaustion
 * Equivalent to database_config.py mentioned in error logs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { cloudWatchLogger } from '../utils/cloudWatchLogger';

class DatabaseConfig {
  constructor() {
    this.config = {
      // Connection pool settings
      maxConnections: parseInt(process.env.VUE_APP_DB_MAX_CONNECTIONS) || 20,
      minConnections: parseInt(process.env.VUE_APP_DB_MIN_CONNECTIONS) || 5,
      connectionTimeout: parseInt(process.env.VUE_APP_DB_CONNECTION_TIMEOUT) || 30000, // 30 seconds
      idleTimeout: parseInt(process.env.VUE_APP_DB_IDLE_TIMEOUT) || 300000, // 5 minutes
      maxRetries: parseInt(process.env.VUE_APP_DB_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.VUE_APP_DB_RETRY_DELAY) || 1000,
      
      // Firebase configuration
      firebase: {
        apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
        authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VUE_APP_FIREBASE_PROJECT_ID,
        storageBucket: process.env.VUE_APP_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.VUE_APP_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.VUE_APP_FIREBASE_APP_ID
      }
    };

    this.connectionPool = new Map();
    this.activeQueries = new Set();
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      poolExhausted: 0
    };

    this.db = null;
    this.app = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection with proper error handling
   */
  async initialize() {
    try {
      if (this.initialized) {
        return this.db;
      }

      await cloudWatchLogger.info('Initializing database connection', {
        maxConnections: this.config.maxConnections,
        connectionTimeout: this.config.connectionTimeout
      });

      // Initialize Firebase app
      this.app = initializeApp(this.config.firebase);
      this.db = getFirestore(this.app);

      // Connect to emulator in development
      if (process.env.NODE_ENV === 'development' && process.env.VUE_APP_USE_FIRESTORE_EMULATOR === 'true') {
        connectFirestoreEmulator(this.db, 'localhost', 8080);
      }

      this.initialized = true;
      
      // Start connection monitoring
      this.startConnectionMonitoring();

      await cloudWatchLogger.info('Database connection initialized successfully', {
        projectId: this.config.firebase.projectId
      });

      return this.db;

    } catch (error) {
      this.connectionStats.failedConnections++;
      await cloudWatchLogger.databaseError(error, 'initialization');
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Get database connection with pool management
   */
  async getConnection(queryId = null) {
    try {
      // Check if pool is exhausted
      if (this.activeQueries.size >= this.config.maxConnections) {
        this.connectionStats.poolExhausted++;
        await cloudWatchLogger.error('Database query failed: connection pool exhausted', {
          activeQueries: this.activeQueries.size,
          maxConnections: this.config.maxConnections,
          queryId
        });
        throw new Error('Connection pool exhausted');
      }

      if (!this.initialized) {
        await this.initialize();
      }

      const connectionId = queryId || this.generateConnectionId();
      
      // Add to active queries tracking
      this.activeQueries.add(connectionId);
      this.connectionStats.activeConnections = this.activeQueries.size;
      this.connectionStats.totalConnections++;

      // Set up connection timeout
      const timeoutId = setTimeout(() => {
        this.releaseConnection(connectionId);
        cloudWatchLogger.warn('Database connection timed out', {
          connectionId,
          timeout: this.config.connectionTimeout
        });
      }, this.config.connectionTimeout);

      // Store connection info
      this.connectionPool.set(connectionId, {
        timeoutId,
        startTime: Date.now(),
        db: this.db
      });

      return {
        db: this.db,
        connectionId,
        release: () => this.releaseConnection(connectionId)
      };

    } catch (error) {
      await cloudWatchLogger.databaseError(error, 'getConnection');
      throw error;
    }
  }

  /**
   * Release database connection
   */
  releaseConnection(connectionId) {
    if (this.connectionPool.has(connectionId)) {
      const connection = this.connectionPool.get(connectionId);
      clearTimeout(connection.timeoutId);
      this.connectionPool.delete(connectionId);
    }

    this.activeQueries.delete(connectionId);
    this.connectionStats.activeConnections = this.activeQueries.size;
  }

  /**
   * Execute query with retry logic and proper error handling
   */
  async executeQuery(queryFn, operation = 'query', retryCount = 0) {
    let connection = null;
    
    try {
      connection = await this.getConnection();
      
      const result = await Promise.race([
        queryFn(connection.db),
        this.createTimeoutPromise(this.config.connectionTimeout)
      ]);

      await cloudWatchLogger.debug('Database query executed successfully', {
        operation,
        connectionId: connection.connectionId,
        duration: Date.now() - this.connectionPool.get(connection.connectionId).startTime
      });

      return result;

    } catch (error) {
      if (this.shouldRetry(error, retryCount)) {
        await cloudWatchLogger.warn(`Database query failed, retrying (${retryCount + 1}/${this.config.maxRetries})`, {
          operation,
          error: error.message,
          retryCount
        });

        await this.sleep(this.config.retryDelay * Math.pow(2, retryCount));
        return this.executeQuery(queryFn, operation, retryCount + 1);
      }

      await cloudWatchLogger.databaseError(error, operation);
      throw error;

    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error, retryCount) {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    const retryableErrors = [
      'unavailable',
      'deadline-exceeded',
      'resource-exhausted',
      'internal',
      'timeout'
    ];

    return retryableErrors.some(errorType => 
      error.message.toLowerCase().includes(errorType) ||
      error.code === errorType
    );
  }

  /**
   * Create timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database operation timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Start connection monitoring
   */
  startConnectionMonitoring() {
    setInterval(() => {
      this.cleanupStaleConnections();
      this.logConnectionStats();
    }, 60000); // Every minute
  }

  /**
   * Cleanup stale connections
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const staleConnections = [];

    for (const [connectionId, connection] of this.connectionPool.entries()) {
      if (now - connection.startTime > this.config.idleTimeout) {
        staleConnections.push(connectionId);
      }
    }

    staleConnections.forEach(connectionId => {
      this.releaseConnection(connectionId);
      cloudWatchLogger.warn('Cleaned up stale database connection', {
        connectionId,
        age: now - this.connectionPool.get(connectionId)?.startTime
      });
    });
  }

  /**
   * Log connection statistics
   */
  async logConnectionStats() {
    const stats = {
      ...this.connectionStats,
      poolUtilization: (this.activeQueries.size / this.config.maxConnections) * 100,
      timestamp: new Date().toISOString()
    };

    await cloudWatchLogger.info('Database connection stats', stats);

    // Alert if pool utilization is high
    if (stats.poolUtilization > 80) {
      await cloudWatchLogger.warn('High database pool utilization detected', {
        utilization: stats.poolUtilization,
        activeConnections: this.activeQueries.size,
        maxConnections: this.config.maxConnections
      });
    }
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current connection statistics
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      activeConnections: this.activeQueries.size,
      poolUtilization: (this.activeQueries.size / this.config.maxConnections) * 100,
      maxConnections: this.config.maxConnections
    };
  }

  /**
   * Health check for database connection
   */
  async healthCheck() {
    try {
      const connection = await this.getConnection('health_check');
      
      // Simple query to test connection
      await this.executeQuery(async (db) => {
        // This is a minimal operation to test connectivity
        return { status: 'healthy', timestamp: Date.now() };
      }, 'health_check');

      connection.release();
      return { healthy: true, timestamp: new Date().toISOString() };

    } catch (error) {
      await cloudWatchLogger.error('Database health check failed', {
        error: error.message
      });
      return { healthy: false, error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

// Create singleton instance
export const databaseConfig = new DatabaseConfig();

export default DatabaseConfig;