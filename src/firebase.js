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

firebase.initializeApp(firebaseConfig);

const { Timestamp, GeoPoint } = firebase.firestore
export { Timestamp, GeoPoint }

export const db = firebase.firestore();
export const auth = firebase.auth();
export const storage = firebase.storage();
export const functions = firebase.functions();

// Database connection health check
export const checkDatabaseConnection = async () => {
  try {
    // Try to read from a minimal collection to test connectivity
    await db.collection('_health_check').limit(1).get();
    return { connected: true, error: null };
  } catch (error) {
    console.error('Database connection check failed:', error);
    
    // Log database connection failure to CloudWatch
    try {
      const { cloudWatchLogger } = await import('./utils/cloudWatchLogger');
      await cloudWatchLogger.databaseError(error, 'connectionCheck');
    } catch (logError) {
      console.error('Failed to log database connection error to CloudWatch:', logError);
    }
    
    return { connected: false, error: error };
  }
};

// Monitor database connection status
let connectionStatus = { connected: true, lastCheck: Date.now() };

// Periodic connection health check (every 5 minutes)
setInterval(async () => {
  const result = await checkDatabaseConnection();
  const wasConnected = connectionStatus.connected;
  connectionStatus = { ...result, lastCheck: Date.now() };
  
  // Log connection state changes
  if (wasConnected !== result.connected) {
    try {
      const { cloudWatchLogger } = await import('./utils/cloudWatchLogger');
      if (result.connected) {
        await cloudWatchLogger.info('Database connection restored', {
          type: 'database_connection',
          status: 'restored'
        });
      } else {
        await cloudWatchLogger.error('Database connection lost', {
          type: 'database_connection',
          status: 'lost',
          error: result.error?.message
        });
      }
    } catch (logError) {
      console.error('Failed to log connection status change:', logError);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

export const getDatabaseConnectionStatus = () => connectionStatus;

// if (location.hostname === "localhost") {
//   db.useEmulator("localhost", 8080);
//   auth.useEmulator("http://localhost:9099");
//   functions.useEmulator("localhost",5001);
//   storage.useEmulator("localhost",9199)
// }

// Enable offline persistence with error handling
db.enablePersistence()
  .catch(async (err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn('Firebase persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn('Firebase persistence failed: Browser not supported');
    } else {
      console.error('Firebase persistence failed:', err);
      
      // Log critical database connection issues to CloudWatch
      try {
        // Dynamically import cloudWatchLogger to avoid circular dependencies
        const { cloudWatchLogger } = await import('./utils/cloudWatchLogger');
        await cloudWatchLogger.databaseError(err, 'enablePersistence');
      } catch (logError) {
        console.error('Failed to log Firebase persistence error to CloudWatch:', logError);
      }
    }
    // Continue without persistence - the app will still work
  });