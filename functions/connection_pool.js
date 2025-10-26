const axios = require('axios');
const https = require('https');
const functions = require("firebase-functions");

// Connection pool configuration
const CONNECTION_POOL_CONFIG = {
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 5000,
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxRedirects: 5,
  retryAttempts: 3,
  retryDelay: 1000,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 30000,
  healthCheckInterval: 60000
};

// Circuit breaker for service resilience
class CircuitBreaker {
  constructor(serviceName, threshold = CONNECTION_POOL_CONFIG.circuitBreakerThreshold) {
    this.serviceName = serviceName;
    this.threshold = threshold;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > CONNECTION_POOL_CONFIG.circuitBreakerTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`Circuit breaker for ${this.serviceName} is now HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error(`Circuit breaker OPENED for ${this.serviceName} after ${this.failureCount} failures`);
    }
  }

  getStatus() {
    return {
      serviceName: this.serviceName,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// HTTPS Agent with connection pooling
const httpsAgent = new https.Agent({
  maxSockets: CONNECTION_POOL_CONFIG.maxSockets,
  maxFreeSockets: CONNECTION_POOL_CONFIG.maxFreeSockets,
  timeout: CONNECTION_POOL_CONFIG.timeout,
  keepAlive: CONNECTION_POOL_CONFIG.keepAlive,
  keepAliveMsecs: CONNECTION_POOL_CONFIG.keepAliveMsecs
});

// Connection pool manager
class ConnectionPoolManager {
  constructor() {
    this.pools = new Map();
    this.circuitBreakers = new Map();
    this.healthChecks = new Map();
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      circuitBreakerTrips: 0
    };

    this.startHealthChecks();
  }

  createHttpClient(serviceName, baseURL, customConfig = {}) {
    const config = {
      baseURL,
      timeout: CONNECTION_POOL_CONFIG.timeout,
      maxRedirects: CONNECTION_POOL_CONFIG.maxRedirects,
      httpsAgent: httpsAgent,
      headers: {
        'Connection': 'keep-alive',
        'User-Agent': 'ACM-Website-ConnectionPool/1.0'
      },
      ...customConfig
    };

    const client = axios.create(config);
    
    // Add request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        this.stats.totalRequests++;
        console.log(`HTTP request to ${serviceName}: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.stats.failedRequests++;
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    client.interceptors.response.use(
      (response) => {
        this.stats.successfulRequests++;
        return response;
      },
      (error) => {
        this.stats.failedRequests++;
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          this.stats.timeoutRequests++;
          console.error(`[ERROR] HTTPSConnectionPool timeout for ${serviceName}`);
        }
        
        return Promise.reject(error);
      }
    );

    this.pools.set(serviceName, client);
    this.circuitBreakers.set(serviceName, new CircuitBreaker(serviceName));
    
    return client;
  }

  async makeRequest(serviceName, requestConfig) {
    const client = this.pools.get(serviceName);
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!client) {
      throw new Error(`No connection pool found for service: ${serviceName}`);
    }

    if (!circuitBreaker) {
      throw new Error(`No circuit breaker found for service: ${serviceName}`);
    }

    return circuitBreaker.execute(async () => {
      let lastError;
      
      for (let attempt = 1; attempt <= CONNECTION_POOL_CONFIG.retryAttempts; attempt++) {
        try {
          console.log(`Request attempt ${attempt} to ${serviceName}`);
          const response = await client(requestConfig);
          return response;
        } catch (error) {
          lastError = error;
          console.error(`Request attempt ${attempt} to ${serviceName} failed:`, error.message);
          
          if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            console.error(`[ERROR] HTTPSConnectionPool timeout for ${serviceName} after ${CONNECTION_POOL_CONFIG.timeout}ms`);
          }
          
          if (attempt < CONNECTION_POOL_CONFIG.retryAttempts) {
            const delay = CONNECTION_POOL_CONFIG.retryDelay * Math.pow(2, attempt - 1);
            console.log(`Retrying request to ${serviceName} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    });
  }

  addHealthCheck(serviceName, healthCheckUrl, interval = CONNECTION_POOL_CONFIG.healthCheckInterval) {
    const healthCheck = setInterval(async () => {
      try {
        const client = this.pools.get(serviceName);
        if (client) {
          await client.get(healthCheckUrl, { timeout: 5000 });
          console.log(`Health check passed for ${serviceName}`);
        }
      } catch (error) {
        console.warn(`Health check failed for ${serviceName}:`, error.message);
      }
    }, interval);

    this.healthChecks.set(serviceName, healthCheck);
  }

  startHealthChecks() {
    // Add default health checks for common services
    setTimeout(() => {
      // Example health checks - these would be configured based on actual services
      this.addHealthCheck('payment-service', '/health');
      this.addHealthCheck('user-service', '/health');
    }, 5000);
  }

  getPoolStats() {
    const circuitBreakerStats = Array.from(this.circuitBreakers.values()).map(cb => cb.getStatus());
    
    return {
      ...this.stats,
      activeConnections: this.pools.size,
      circuitBreakers: circuitBreakerStats,
      agentStats: {
        maxSockets: CONNECTION_POOL_CONFIG.maxSockets,
        maxFreeSockets: CONNECTION_POOL_CONFIG.maxFreeSockets,
        timeout: CONNECTION_POOL_CONFIG.timeout
      }
    };
  }

  closeAllConnections() {
    // Clear health checks
    for (const healthCheck of this.healthChecks.values()) {
      clearInterval(healthCheck);
    }
    
    // Destroy HTTPS agent
    httpsAgent.destroy();
    
    console.log('All connection pools closed');
  }
}

// Singleton instance
const connectionPoolManager = new ConnectionPoolManager();

// Pre-configured clients for common services
const paymentServiceClient = connectionPoolManager.createHttpClient(
  'payment-service',
  process.env.PAYMENT_SERVICE_URL || 'https://api.payment-service.com',
  {
    headers: {
      'Authorization': `Bearer ${process.env.PAYMENT_API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
);

const userServiceClient = connectionPoolManager.createHttpClient(
  'user-service',
  process.env.USER_SERVICE_URL || 'https://api.user-service.com',
  {
    headers: {
      'Authorization': `Bearer ${process.env.USER_API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
);

// Firebase function to get connection pool statistics
exports.getConnectionPoolStats = functions.https.onCall(async (data, context) => {
  // Verify admin access
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  return connectionPoolManager.getPoolStats();
});

// Firebase function to reset circuit breakers
exports.resetCircuitBreakers = functions.https.onCall(async (data, context) => {
  // Verify admin access
  const isAdmin = context.auth?.token?.admin || false;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { serviceName } = data;
  
  if (serviceName) {
    const circuitBreaker = connectionPoolManager.circuitBreakers.get(serviceName);
    if (circuitBreaker) {
      circuitBreaker.failureCount = 0;
      circuitBreaker.state = 'CLOSED';
      return { message: `Circuit breaker reset for ${serviceName}` };
    } else {
      throw new functions.https.HttpsError('not-found', `Service ${serviceName} not found`);
    }
  } else {
    // Reset all circuit breakers
    for (const circuitBreaker of connectionPoolManager.circuitBreakers.values()) {
      circuitBreaker.failureCount = 0;
      circuitBreaker.state = 'CLOSED';
    }
    return { message: 'All circuit breakers reset' };
  }
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('Shutting down connection pools...');
  connectionPoolManager.closeAllConnections();
});

module.exports = {
  ConnectionPoolManager,
  connectionPoolManager,
  paymentServiceClient,
  userServiceClient,
  CircuitBreaker
};