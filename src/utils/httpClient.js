/**
 * Enhanced HTTP Client with retry logic, timeout handling, and circuit breaker pattern
 * Addresses payment service timeouts and connection pool exhaustion issues
 */

import { cloudWatchLogger } from './cloudWatchLogger';

// Configuration for different service types
const SERVICE_CONFIGS = {
  payment: {
    timeout: 10000, // 10 seconds (increased from 5000ms mentioned in error)
    retries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30000 // 30 seconds
  },
  database: {
    timeout: 8000,
    retries: 2,
    backoffMultiplier: 1.5,
    initialDelay: 500,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeout: 15000
  },
  api: {
    timeout: 5000,
    retries: 2,
    backoffMultiplier: 2,
    initialDelay: 1000,
    circuitBreakerThreshold: 4,
    circuitBreakerTimeout: 20000
  }
};

// Circuit breaker state management
const circuitBreakers = new Map();

class CircuitBreaker {
  constructor(config) {
    this.failureCount = 0;
    this.threshold = config.circuitBreakerThreshold;
    this.timeout = config.circuitBreakerTimeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN' && Date.now() >= this.nextAttempt) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced HTTP client with retry logic and circuit breaker
 */
export class HttpClient {
  constructor(serviceType = 'api') {
    this.config = SERVICE_CONFIGS[serviceType] || SERVICE_CONFIGS.api;
    this.serviceType = serviceType;
    
    // Initialize circuit breaker for this service type
    if (!circuitBreakers.has(serviceType)) {
      circuitBreakers.set(serviceType, new CircuitBreaker(this.config));
    }
    this.circuitBreaker = circuitBreakers.get(serviceType);
  }

  /**
   * Execute HTTP request with retry logic and circuit breaker
   */
  async request(url, options = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      const error = new Error(`Service ${this.serviceType} is currently unavailable (circuit breaker open)`);
      await cloudWatchLogger.error(`Circuit breaker open for ${this.serviceType}`, {
        serviceType: this.serviceType,
        requestId,
        url
      });
      throw error;
    }

    let lastError;
    
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        // Add timeout to request options
        const requestOptions = {
          ...options,
          signal: AbortSignal.timeout(this.config.timeout)
        };

        await cloudWatchLogger.info(`HTTP request attempt ${attempt + 1}`, {
          serviceType: this.serviceType,
          requestId,
          url,
          attempt: attempt + 1,
          maxAttempts: this.config.retries + 1
        });

        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Success - reset circuit breaker
        this.circuitBreaker.onSuccess();
        
        const duration = Date.now() - startTime;
        await cloudWatchLogger.info(`HTTP request successful`, {
          serviceType: this.serviceType,
          requestId,
          url,
          duration,
          status: response.status,
          attempt: attempt + 1
        });

        return response;

      } catch (error) {
        lastError = error;
        const duration = Date.now() - startTime;

        // Log the error
        await cloudWatchLogger.error(`HTTP request failed (attempt ${attempt + 1})`, {
          serviceType: this.serviceType,
          requestId,
          url,
          attempt: attempt + 1,
          maxAttempts: this.config.retries + 1,
          error: error.message,
          duration,
          isTimeout: error.name === 'TimeoutError' || error.message.includes('timeout'),
          isConnectionError: error.message.includes('connection') || error.message.includes('network')
        });

        // If this is the last attempt, break
        if (attempt === this.config.retries) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);
        await sleep(delay);
      }
    }

    // All attempts failed - update circuit breaker
    this.circuitBreaker.onFailure();

    // Log final failure
    const totalDuration = Date.now() - startTime;
    await cloudWatchLogger.error(`HTTP request failed after all retries`, {
      serviceType: this.serviceType,
      requestId,
      url,
      totalAttempts: this.config.retries + 1,
      totalDuration,
      finalError: lastError.message,
      circuitBreakerState: this.circuitBreaker.state
    });

    throw lastError;
  }

  /**
   * Convenience method for GET requests
   */
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * Convenience method for POST requests
   */
  async post(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  }

  /**
   * Convenience method for PUT requests
   */
  async put(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  }

  /**
   * Generate unique request ID for tracking
   */
  generateRequestId() {
    return `${this.serviceType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.state,
      failureCount: this.circuitBreaker.failureCount,
      threshold: this.circuitBreaker.threshold,
      nextAttempt: this.circuitBreaker.nextAttempt
    };
  }
}

/**
 * Pre-configured HTTP clients for different services
 */
export const paymentClient = new HttpClient('payment');
export const databaseClient = new HttpClient('database');
export const apiClient = new HttpClient('api');

/**
 * Health check utility
 */
export async function healthCheck(services = ['payment', 'database', 'api']) {
  const results = {};
  
  for (const service of services) {
    const client = new HttpClient(service);
    results[service] = {
      circuitBreaker: client.getCircuitBreakerStatus(),
      timestamp: new Date().toISOString()
    };
  }
  
  await cloudWatchLogger.info('Service health check completed', {
    type: 'health_check',
    results
  });
  
  return results;
}

export default HttpClient;