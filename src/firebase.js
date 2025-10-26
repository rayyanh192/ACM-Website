import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import 'firebase/compat/functions';

const firebaseConfig = {
    apiKey: "AIzaSyDTCNXN1akZ6DEWKLGyOp2JZvAworux9jI",
    authDomain: "scu-acm.firebaseapp.com",
    projectId: "scu-acm",
    storageBucket: "scu-acm.appspot.com",
    messagingSenderId: "561382074280",
    appId: "1:561382074280:web:e3e8ca43e1a5270b519f9d",
    measurementId: "G-9ELQ4BE3XH"
  };

// Connection management configuration
const connectionConfig = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
  timeout: 30000, // 30 second timeout
  maxConcurrentOperations: 10
};

firebase.initializeApp(firebaseConfig);

const { Timestamp, GeoPoint } = firebase.firestore
export { Timestamp, GeoPoint }

// Initialize Firebase services with enhanced connection handling
export const db = firebase.firestore();
export const auth = firebase.auth();
export const storage = firebase.storage();
export const functions = firebase.functions();

// Configure Firestore settings for better connection management
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  merge: true
});

// if (location.hostname === "localhost") {
//   db.useEmulator("localhost", 8080);
//   auth.useEmulator("http://localhost:9099");
//   functions.useEmulator("localhost",5001);
//   storage.useEmulator("localhost",9199)
// }

// Enhanced persistence with error handling
db.enablePersistence({
  synchronizeTabs: true
}).catch((err) => {
  console.warn('Firebase persistence failed:', err);
  // Continue without persistence if it fails
});

// Connection pool management
class FirebaseConnectionManager {
  constructor() {
    this.activeOperations = 0;
    this.maxConcurrentOperations = connectionConfig.maxConcurrentOperations;
    this.operationQueue = [];
    this.connectionHealth = {
      lastSuccessfulOperation: Date.now(),
      consecutiveFailures: 0,
      isHealthy: true
    };
  }

  async executeWithRetry(operation, context = 'unknown') {
    return new Promise((resolve, reject) => {
      const executeOperation = async (attempt = 1) => {
        try {
          // Check if we're at max concurrent operations
          if (this.activeOperations >= this.maxConcurrentOperations) {
            // Queue the operation
            this.operationQueue.push(() => executeOperation(attempt));
            return;
          }

          this.activeOperations++;
          
          // Set timeout for the operation
          const timeoutPromise = new Promise((_, timeoutReject) => {
            setTimeout(() => {
              timeoutReject(new Error(`Firebase operation timeout after ${connectionConfig.timeout}ms`));
            }, connectionConfig.timeout);
          });

          const result = await Promise.race([operation(), timeoutPromise]);
          
          // Operation successful
          this.connectionHealth.lastSuccessfulOperation = Date.now();
          this.connectionHealth.consecutiveFailures = 0;
          this.connectionHealth.isHealthy = true;
          
          resolve(result);
        } catch (error) {
          this.connectionHealth.consecutiveFailures++;
          this.connectionHealth.isHealthy = this.connectionHealth.consecutiveFailures < 5;
          
          console.warn(`Firebase operation failed (attempt ${attempt}/${connectionConfig.maxRetries}):`, error);
          
          if (attempt < connectionConfig.maxRetries) {
            // Exponential backoff
            const delay = connectionConfig.retryDelay * Math.pow(2, attempt - 1);
            setTimeout(() => executeOperation(attempt + 1), delay);
          } else {
            reject(new Error(`Firebase operation failed after ${connectionConfig.maxRetries} attempts: ${error.message}`));
          }
        } finally {
          this.activeOperations--;
          
          // Process queued operations
          if (this.operationQueue.length > 0) {
            const nextOperation = this.operationQueue.shift();
            setTimeout(nextOperation, 0);
          }
        }
      };

      executeOperation();
    });
  }

  getConnectionHealth() {
    return {
      ...this.connectionHealth,
      activeOperations: this.activeOperations,
      queuedOperations: this.operationQueue.length,
      timeSinceLastSuccess: Date.now() - this.connectionHealth.lastSuccessfulOperation
    };
  }
}

// Export connection manager instance
export const connectionManager = new FirebaseConnectionManager();

// Enhanced database operations with connection management
export const dbOperations = {
  async get(ref) {
    return connectionManager.executeWithRetry(() => ref.get(), 'get');
  },

  async set(ref, data) {
    return connectionManager.executeWithRetry(() => ref.set(data), 'set');
  },

  async update(ref, data) {
    return connectionManager.executeWithRetry(() => ref.update(data), 'update');
  },

  async delete(ref) {
    return connectionManager.executeWithRetry(() => ref.delete(), 'delete');
  },

  async add(ref, data) {
    return connectionManager.executeWithRetry(() => ref.add(data), 'add');
  },

  async transaction(updateFunction) {
    return connectionManager.executeWithRetry(() => db.runTransaction(updateFunction), 'transaction');
  },

  async batch(operations) {
    return connectionManager.executeWithRetry(() => {
      const batch = db.batch();
      operations.forEach(op => {
        switch (op.type) {
          case 'set':
            batch.set(op.ref, op.data);
            break;
          case 'update':
            batch.update(op.ref, op.data);
            break;
          case 'delete':
            batch.delete(op.ref);
            break;
        }
      });
      return batch.commit();
    }, 'batch');
  }
};

// Export connection configuration for other modules
export { connectionConfig };