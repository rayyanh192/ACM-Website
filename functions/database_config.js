const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Database configuration for connection management
const DATABASE_CONFIG = {
  maxConnections: 10,
  connectionTimeout: 30000, // 30 seconds
  queryTimeout: 10000, // 10 seconds
  retryAttempts: 3,
  retryDelay: 1000,
  maxRetryDelay: 5000,
  poolCheckInterval: 60000, // 1 minute
  maxIdleTime: 300000 // 5 minutes
};

// Connection pool manager for Firestore
class DatabaseConnectionManager {
  constructor() {
    this.activeConnections = new Map();
    this.connectionCount = 0;
    this.maxConnections = DATABASE_CONFIG.maxConnections;
    this.waitingQueue = [];
    this.lastCleanup = Date.now();
    
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  async getConnection(operationId = null) {
    const connectionId = operationId || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if we've exceeded max connections
    if (this.connectionCount >= this.maxConnections) {
      console.warn(`[WARNING] Connection pool near capacity: ${this.connectionCount}/${this.maxConnections}`);
      
      // Wait for available connection
      await this.waitForAvailableConnection();
    }

    try {
      // Create new connection
      const connection = {
        id: connectionId,
        db: admin.firestore(),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        inUse: true
      };

      this.activeConnections.set(connectionId, connection);
      this.connectionCount++;
      
      console.log(`Database connection created: ${connectionId} (${this.connectionCount}/${this.maxConnections})`);
      return connection;
    } catch (error) {
      console.error(`[ERROR] Database query failed: connection pool exhausted`);
      throw new Error('Database query failed: connection pool exhausted');
    }
  }

  async releaseConnection(connectionId) {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();
      console.log(`Database connection released: ${connectionId}`);
      
      // Notify waiting operations
      if (this.waitingQueue.length > 0) {
        const waitingOperation = this.waitingQueue.shift();
        waitingOperation.resolve();
      }
    }
  }

  async closeConnection(connectionId) {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      this.activeConnections.delete(connectionId);
      this.connectionCount--;
      console.log(`Database connection closed: ${connectionId} (${this.connectionCount}/${this.maxConnections})`);
    }
  }

  async waitForAvailableConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database query failed: connection pool exhausted'));
      }, DATABASE_CONFIG.connectionTimeout);

      this.waitingQueue.push({
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: () => {
          clearTimeout(timeout);
          reject(new Error('Database query failed: connection pool exhausted'));
        }
      });
    });
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanupIdleConnections();
    }, DATABASE_CONFIG.poolCheckInterval);
  }

  cleanupIdleConnections() {
    const now = Date.now();
    const connectionsToClose = [];

    for (const [connectionId, connection] of this.activeConnections) {
      if (!connection.inUse && (now - connection.lastUsed) > DATABASE_CONFIG.maxIdleTime) {
        connectionsToClose.push(connectionId);
      }
    }

    for (const connectionId of connectionsToClose) {
      this.closeConnection(connectionId);
    }

    if (connectionsToClose.length > 0) {
      console.log(`Cleaned up ${connectionsToClose.length} idle database connections`);
    }
  }

  getPoolStatus() {
    const inUseCount = Array.from(this.activeConnections.values()).filter(conn => conn.inUse).length;
    return {
      total: this.connectionCount,
      inUse: inUseCount,
      idle: this.connectionCount - inUseCount,
      waiting: this.waitingQueue.length,
      maxConnections: this.maxConnections
    };
  }
}

// Singleton instance
const connectionManager = new DatabaseConnectionManager();

// Database query wrapper with connection management
class DatabaseManager {
  constructor() {
    this.connectionManager = connectionManager;
  }

  async executeQuery(operation, operationName = 'unknown') {
    let connection = null;
    let lastError = null;

    for (let attempt = 1; attempt <= DATABASE_CONFIG.retryAttempts; attempt++) {
      try {
        console.log(`Database ${operationName} attempt ${attempt}`);
        
        // Get connection from pool
        connection = await this.connectionManager.getConnection(`${operationName}_${attempt}`);
        
        // Execute operation with timeout
        const result = await Promise.race([
          operation(connection.db),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), DATABASE_CONFIG.queryTimeout)
          )
        ]);

        console.log(`Database ${operationName} completed successfully`);
        return result;

      } catch (error) {
        lastError = error;
        console.error(`Database ${operationName} attempt ${attempt} failed:`, error.message);
        
        if (error.message.includes('timeout') || error.message.includes('pool exhausted')) {
          console.error(`[ERROR] Database query failed: connection pool exhausted`);
        }

        if (attempt < DATABASE_CONFIG.retryAttempts) {
          const delay = Math.min(
            DATABASE_CONFIG.retryDelay * Math.pow(2, attempt - 1),
            DATABASE_CONFIG.maxRetryDelay
          );
          console.log(`Retrying database operation in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } finally {
        if (connection) {
          await this.connectionManager.releaseConnection(connection.id);
        }
      }
    }

    // All attempts failed
    console.error(`Database ${operationName} failed after ${DATABASE_CONFIG.retryAttempts} attempts`);
    throw lastError || new Error('Database query failed: connection pool exhausted');
  }

  async getDocument(collection, docId) {
    return this.executeQuery(async (db) => {
      const doc = await db.collection(collection).doc(docId).get();
      return doc.exists ? doc.data() : null;
    }, `getDocument_${collection}_${docId}`);
  }

  async setDocument(collection, docId, data) {
    return this.executeQuery(async (db) => {
      await db.collection(collection).doc(docId).set(data);
      return { success: true };
    }, `setDocument_${collection}_${docId}`);
  }

  async queryCollection(collection, filters = []) {
    return this.executeQuery(async (db) => {
      let query = db.collection(collection);
      
      for (const filter of filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, `queryCollection_${collection}`);
  }

  getPoolStatus() {
    return this.connectionManager.getPoolStatus();
  }
}

// Export database manager instance
const databaseManager = new DatabaseManager();

// Firebase function to check database pool status
exports.getDatabasePoolStatus = functions.https.onCall(async (data, context) => {
  // Verify admin access
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  return databaseManager.getPoolStatus();
});

module.exports = { 
  DatabaseManager, 
  databaseManager, 
  DATABASE_CONFIG 
};