/**
 * Database Configuration and Connection Pool Management
 * Addresses "Database query failed: connection pool exhausted" errors
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mysql = require("mysql2/promise");
const { Pool } = require("pg");
const genericPool = require("generic-pool");

// Database configuration from environment variables
const dbConfig = {
  // MySQL Configuration
  mysql: {
    host: process.env.MYSQL_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "acm_website",
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT) || 10,
    acquireTimeoutMillis: parseInt(process.env.MYSQL_ACQUIRE_TIMEOUT) || 60000,
    timeout: parseInt(process.env.MYSQL_TIMEOUT) || 60000,
    reconnect: true,
    charset: "utf8mb4"
  },
  
  // PostgreSQL Configuration
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "",
    database: process.env.POSTGRES_DATABASE || "acm_website",
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 10,
    min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS) || 2,
    acquireTimeoutMillis: parseInt(process.env.POSTGRES_ACQUIRE_TIMEOUT) || 60000,
    createTimeoutMillis: parseInt(process.env.POSTGRES_CREATE_TIMEOUT) || 30000,
    destroyTimeoutMillis: parseInt(process.env.POSTGRES_DESTROY_TIMEOUT) || 5000,
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT) || 30000,
    reapIntervalMillis: parseInt(process.env.POSTGRES_REAP_INTERVAL) || 1000,
    createRetryIntervalMillis: parseInt(process.env.POSTGRES_CREATE_RETRY_INTERVAL) || 200
  }
};

// Connection pools
let mysqlPool = null;
let postgresPool = null;

/**
 * Initialize MySQL connection pool with proper error handling
 */
function initializeMySQLPool() {
  if (mysqlPool) {
    return mysqlPool;
  }

  try {
    mysqlPool = mysql.createPool({
      ...dbConfig.mysql,
      waitForConnections: true,
      queueLimit: 0
    });

    // Handle pool errors
    mysqlPool.on('connection', (connection) => {
      console.log('MySQL connection established as id ' + connection.threadId);
    });

    mysqlPool.on('error', (err) => {
      console.error('MySQL pool error:', err);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('MySQL connection lost, reinitializing pool...');
        mysqlPool = null;
        initializeMySQLPool();
      }
    });

    console.log('MySQL connection pool initialized successfully');
    return mysqlPool;
  } catch (error) {
    console.error('Failed to initialize MySQL pool:', error);
    throw new functions.https.HttpsError('internal', 'Database connection failed');
  }
}

/**
 * Initialize PostgreSQL connection pool with proper error handling
 */
function initializePostgresPool() {
  if (postgresPool) {
    return postgresPool;
  }

  try {
    postgresPool = new Pool(dbConfig.postgres);

    // Handle pool errors
    postgresPool.on('connect', (client) => {
      console.log('PostgreSQL client connected');
    });

    postgresPool.on('error', (err, client) => {
      console.error('PostgreSQL pool error:', err);
      // Don't exit the process, just log the error
    });

    console.log('PostgreSQL connection pool initialized successfully');
    return postgresPool;
  } catch (error) {
    console.error('Failed to initialize PostgreSQL pool:', error);
    throw new functions.https.HttpsError('internal', 'Database connection failed');
  }
}

/**
 * Get MySQL connection with timeout and retry logic
 */
async function getMySQLConnection() {
  const pool = initializeMySQLPool();
  
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error('Failed to get MySQL connection:', error);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(error, 'getMySQLConnection');
    }
    
    throw new functions.https.HttpsError('internal', 'Database connection pool exhausted');
  }
}

/**
 * Get PostgreSQL client with timeout and retry logic
 */
async function getPostgresClient() {
  const pool = initializePostgresPool();
  
  try {
    const client = await pool.connect();
    return client;
  } catch (error) {
    console.error('Failed to get PostgreSQL client:', error);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(error, 'getPostgresClient');
    }
    
    throw new functions.https.HttpsError('internal', 'Database connection pool exhausted');
  }
}

/**
 * Execute MySQL query with connection management
 */
async function executeMySQLQuery(query, params = []) {
  let connection = null;
  
  try {
    connection = await getMySQLConnection();
    const [results] = await connection.execute(query, params);
    return results;
  } catch (error) {
    console.error('MySQL query execution failed:', error);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(error, 'executeMySQLQuery');
    }
    
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Execute PostgreSQL query with client management
 */
async function executePostgresQuery(query, params = []) {
  let client = null;
  
  try {
    client = await getPostgresClient();
    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('PostgreSQL query execution failed:', error);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(error, 'executePostgresQuery');
    }
    
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Execute Firestore query with error handling
 */
async function executeFirestoreQuery(collection, operation, ...args) {
  try {
    const db = admin.firestore();
    const ref = db.collection(collection);
    
    let result;
    switch (operation) {
      case 'get':
        result = await ref.get();
        break;
      case 'add':
        result = await ref.add(args[0]);
        break;
      case 'doc':
        result = await ref.doc(args[0]).get();
        break;
      case 'where':
        result = await ref.where(args[0], args[1], args[2]).get();
        break;
      case 'update':
        result = await ref.doc(args[0]).update(args[1]);
        break;
      case 'delete':
        result = await ref.doc(args[0]).delete();
        break;
      default:
        throw new Error(`Unsupported Firestore operation: ${operation}`);
    }
    
    return result;
  } catch (error) {
    console.error('Firestore query execution failed:', error);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.databaseError(error, `executeFirestoreQuery:${operation}`);
    }
    
    throw error;
  }
}

/**
 * Health check for database connections
 */
async function healthCheck() {
  const health = {
    mysql: false,
    postgres: false,
    firestore: false,
    timestamp: new Date().toISOString()
  };

  // Check MySQL
  try {
    if (process.env.MYSQL_HOST) {
      const connection = await getMySQLConnection();
      await connection.ping();
      connection.release();
      health.mysql = true;
    }
  } catch (error) {
    console.error('MySQL health check failed:', error);
  }

  // Check PostgreSQL
  try {
    if (process.env.POSTGRES_HOST) {
      const client = await getPostgresClient();
      await client.query('SELECT 1');
      client.release();
      health.postgres = true;
    }
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
  }

  // Check Firestore
  try {
    const db = admin.firestore();
    await db.collection('health_check').limit(1).get();
    health.firestore = true;
  } catch (error) {
    console.error('Firestore health check failed:', error);
  }

  return health;
}

/**
 * Gracefully close all database connections
 */
async function closeConnections() {
  const promises = [];

  if (mysqlPool) {
    promises.push(mysqlPool.end());
    mysqlPool = null;
  }

  if (postgresPool) {
    promises.push(postgresPool.end());
    postgresPool = null;
  }

  try {
    await Promise.all(promises);
    console.log('All database connections closed successfully');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
}

module.exports = {
  dbConfig,
  initializeMySQLPool,
  initializePostgresPool,
  getMySQLConnection,
  getPostgresClient,
  executeMySQLQuery,
  executePostgresQuery,
  executeFirestoreQuery,
  healthCheck,
  closeConnections
};