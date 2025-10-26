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

// Configure timeout settings to prevent hanging operations
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  merge: true
});

// Utility function to add timeout to any Firebase operation
export function withTimeout(promise, timeoutMs = 10000, operation = 'Firebase operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Configure network timeout for better error handling
const originalGet = db.collection.bind(db);
db.collection = function(path) {
  const collection = originalGet(path);
  const originalDoc = collection.doc.bind(collection);
  
  collection.doc = function(docId) {
    const doc = originalDoc(docId);
    const originalGet = doc.get.bind(doc);
    
    doc.get = function(options = {}) {
      // Add timeout wrapper for document get operations
      return withTimeout(originalGet(options), 10000, 'Firestore document get');
    };
    
    return doc;
  };
  
  // Add timeout to collection queries
  const originalGet2 = collection.get.bind(collection);
  collection.get = function(options = {}) {
    return withTimeout(originalGet2(options), 15000, 'Firestore collection get');
  };
  
  return collection;
};

// if (location.hostname === "localhost") {
//   db.useEmulator("localhost", 8080);
//   auth.useEmulator("http://localhost:9099");
//   functions.useEmulator("localhost",5001);
//   storage.useEmulator("localhost",9199)
// }

db.enablePersistence();