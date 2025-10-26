/**
 * Database Service with connection pool management and retry logic
 * Addresses the "Database query failed: connection pool exhausted" error
 */

import { databaseClient } from '../utils/httpClient';
import { cloudWatchLogger } from '../utils/cloudWatchLogger';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot
} from 'firebase/firestore';

// Database configuration
const DB_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  connectionTimeout: 8000,
  queryTimeout: 10000,
  maxConcurrentOperations: 10
};

/**
 * Database operation errors
 */
export class DatabaseError extends Error {
  constructor(message, code, operation = null, originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Connection pool manager to prevent exhaustion
 */
class ConnectionPoolManager {
  constructor(maxConnections = DB_CONFIG.maxConcurrentOperations) {
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
    this.waitingQueue = [];
  }

  async acquire() {
    return new Promise((resolve, reject) => {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        resolve();
      } else {
        this.waitingQueue.push({ resolve, reject });
      }
    });
  }

  release() {
    this.activeConnections--;
    if (this.waitingQueue.length > 0) {
      const { resolve } = this.waitingQueue.shift();
      this.activeConnections++;
      resolve();
    }
  }

  getStatus() {
    return {
      active: this.activeConnections,
      waiting: this.waitingQueue.length,
      max: this.maxConnections,
      utilization: (this.activeConnections / this.maxConnections) * 100
    };
  }
}

/**
 * Database Service with enhanced error handling and connection management
 */
export class DatabaseService {
  constructor() {
    this.connectionPool = new ConnectionPoolManager();
    this.client = databaseClient;
  }

  /**
   * Execute database operation with connection pool management and retry logic
   */
  async executeOperation(operation, operationName, retries = DB_CONFIG.maxRetries) {
    const operationId = this.generateOperationId();
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Acquire connection from pool
        await this.connectionPool.acquire();

        await cloudWatchLogger.info(`Database operation started`, {
          type: 'database_operation_start',
          operationId,
          operationName,
          attempt: attempt + 1,
          poolStatus: this.connectionPool.getStatus()
        });

        // Execute the operation with timeout
        const result = await Promise.race([
          operation(),
          this.createTimeoutPromise(DB_CONFIG.queryTimeout, `Database operation '${operationName}' timed out`)
        ]);

        // Release connection
        this.connectionPool.release();

        await cloudWatchLogger.info(`Database operation successful`, {
          type: 'database_operation_success',
          operationId,
          operationName,
          attempt: attempt + 1
        });

        return result;

      } catch (error) {
        // Release connection on error
        this.connectionPool.release();
        
        lastError = error;

        await cloudWatchLogger.error(`Database operation failed (attempt ${attempt + 1})`, {
          type: 'database_operation_error',
          operationId,
          operationName,
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          error: error.message,
          isTimeout: error.message.includes('timeout') || error.message.includes('timed out'),
          isConnectionError: error.message.includes('connection') || error.message.includes('pool'),
          poolStatus: this.connectionPool.getStatus()
        });

        // If this is the last attempt, break
        if (attempt === retries) {
          break;
        }

        // Wait before retry with exponential backoff
        const delay = DB_CONFIG.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All attempts failed
    await cloudWatchLogger.databaseError(lastError, operationName);
    throw new DatabaseError(
      `Database operation '${operationName}' failed after ${retries + 1} attempts: ${lastError.message}`,
      'OPERATION_FAILED',
      operationName,
      lastError
    );
  }

  /**
   * Get document with retry logic
   */
  async getDocument(collectionName, documentId) {
    return this.executeOperation(async () => {
      const docRef = doc(db, collectionName, documentId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        throw new DatabaseError('Document not found', 'NOT_FOUND', 'getDocument');
      }
    }, `getDocument(${collectionName}/${documentId})`);
  }

  /**
   * Get collection with retry logic and connection management
   */
  async getCollection(collectionName, queryOptions = {}) {
    return this.executeOperation(async () => {
      let q = collection(db, collectionName);
      
      // Apply query options
      if (queryOptions.where) {
        for (const whereClause of queryOptions.where) {
          q = query(q, where(...whereClause));
        }
      }
      
      if (queryOptions.orderBy) {
        q = query(q, orderBy(...queryOptions.orderBy));
      }
      
      if (queryOptions.limit) {
        q = query(q, limit(queryOptions.limit));
      }

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, `getCollection(${collectionName})`);
  }

  /**
   * Create document with retry logic
   */
  async createDocument(collectionName, documentId, data) {
    return this.executeOperation(async () => {
      const docRef = doc(db, collectionName, documentId);
      await setDoc(docRef, {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return { id: documentId, ...data };
    }, `createDocument(${collectionName}/${documentId})`);
  }

  /**
   * Update document with retry logic
   */
  async updateDocument(collectionName, documentId, data) {
    return this.executeOperation(async () => {
      const docRef = doc(db, collectionName, documentId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date()
      });
      return { id: documentId, ...data };
    }, `updateDocument(${collectionName}/${documentId})`);
  }

  /**
   * Delete document with retry logic
   */
  async deleteDocument(collectionName, documentId) {
    return this.executeOperation(async () => {
      const docRef = doc(db, collectionName, documentId);
      await deleteDoc(docRef);
      return { id: documentId, deleted: true };
    }, `deleteDocument(${collectionName}/${documentId})`);
  }

  /**
   * Batch operations with connection pool management
   */
  async batchOperation(operations) {
    const batchId = this.generateOperationId();
    
    try {
      await cloudWatchLogger.info('Starting batch database operation', {
        type: 'database_batch_start',
        batchId,
        operationCount: operations.length,
        poolStatus: this.connectionPool.getStatus()
      });

      // Execute operations in chunks to prevent pool exhaustion
      const chunkSize = Math.min(5, this.connectionPool.maxConnections);
      const results = [];
      
      for (let i = 0; i < operations.length; i += chunkSize) {
        const chunk = operations.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(op => this.executeOperation(op.operation, op.name));
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      await cloudWatchLogger.info('Batch database operation completed', {
        type: 'database_batch_success',
        batchId,
        operationCount: operations.length,
        successCount: results.length
      });

      return results;

    } catch (error) {
      await cloudWatchLogger.error('Batch database operation failed', {
        type: 'database_batch_error',
        batchId,
        operationCount: operations.length,
        error: error.message
      });
      
      throw new DatabaseError(
        `Batch operation failed: ${error.message}`,
        'BATCH_FAILED',
        'batchOperation',
        error
      );
    }
  }

  /**
   * Real-time listener with error handling
   */
  setupRealtimeListener(collectionName, callback, errorCallback) {
    const listenerId = this.generateOperationId();
    
    try {
      const q = collection(db, collectionName);
      
      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          try {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
            
            cloudWatchLogger.info('Realtime listener update', {
              type: 'database_realtime_update',
              listenerId,
              collectionName,
              documentCount: data.length
            });
          } catch (error) {
            cloudWatchLogger.error('Realtime listener callback error', {
              type: 'database_realtime_callback_error',
              listenerId,
              collectionName,
              error: error.message
            });
            if (errorCallback) errorCallback(error);
          }
        },
        (error) => {
          cloudWatchLogger.error('Realtime listener error', {
            type: 'database_realtime_error',
            listenerId,
            collectionName,
            error: error.message
          });
          if (errorCallback) errorCallback(error);
        }
      );

      cloudWatchLogger.info('Realtime listener established', {
        type: 'database_realtime_start',
        listenerId,
        collectionName
      });

      return unsubscribe;

    } catch (error) {
      cloudWatchLogger.error('Failed to setup realtime listener', {
        type: 'database_realtime_setup_error',
        listenerId,
        collectionName,
        error: error.message
      });
      
      if (errorCallback) errorCallback(error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  /**
   * Database health check
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      
      // Simple read operation to test connectivity
      await this.executeOperation(async () => {
        const testCollection = collection(db, 'health_check');
        const testQuery = query(testCollection, limit(1));
        await getDocs(testQuery);
      }, 'healthCheck');

      const duration = Date.now() - startTime;
      const poolStatus = this.connectionPool.getStatus();

      await cloudWatchLogger.info('Database health check successful', {
        type: 'database_health_check',
        duration,
        poolStatus
      });

      return {
        status: 'healthy',
        service: 'database',
        timestamp: new Date().toISOString(),
        responseTime: duration,
        connectionPool: poolStatus
      };

    } catch (error) {
      await cloudWatchLogger.error('Database health check failed', {
        type: 'database_health_check_error',
        error: error.message,
        poolStatus: this.connectionPool.getStatus()
      });

      return {
        status: 'unhealthy',
        service: 'database',
        timestamp: new Date().toISOString(),
        error: error.message,
        connectionPool: this.connectionPool.getStatus()
      };
    }
  }

  /**
   * Get connection pool status
   */
  getConnectionPoolStatus() {
    return this.connectionPool.getStatus();
  }

  /**
   * Utility methods
   */
  generateOperationId() {
    return `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  createTimeoutPromise(timeout, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();

export default databaseService;