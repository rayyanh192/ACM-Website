/**
 * Enhanced HTTP Client with Timeout, Retry, and Circuit Breaker Support
 * Addresses payment service timeout and connection pool exhaustion issues
 */

import axios from 'axios';
import { serviceConfig } from '@/config/serviceConfig';
import { cloudWatchLogger } from './cloudWatchLogger';

// Circuit Breaker State Management
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || serviceConfig.circuitBreaker.failureThreshold;
    this.recoveryTimeout = options.recoveryTimeout || serviceConfig.circuitBreaker.recoveryTimeout;
    this.monitoringPeriod = options.monitoringPeriod || serviceConfig.circuitBreaker.monitoringPeriod;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Next attempt at ${new Date(this.nextAttemptTime)}`);
      }
      this.state = 'HALF_OPEN';
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
    this.nextAttemptTime = null;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
      
      cloudWatchLogger.error(`Circuit breaker opened for ${this.name}`, {
        type: 'circuit_breaker',
        service: this.name,
        failureCount: this.failureCount,
        nextAttemptTime: this.nextAttemptTime
      });
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

// Circuit Breaker instances for different services
const circuitBreakers = {
  payment: new CircuitBreaker('payment', serviceConfig.payment),
  database: new CircuitBreaker('database', serviceConfig.database),
  api: new CircuitBreaker('api', serviceConfig.api)
};

// Retry utility with exponential backoff
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = serviceConfig.api.maxRetries,
    baseDelay = serviceConfig.api.retryDelay,
    maxDelay = serviceConfig.api.maxRetryDelay,
    exponentialBackoff = serviceConfig.api.exponentialBackoff,
    serviceName = 'unknown'
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 0) {
        cloudWatchLogger.info(`Retry successful for ${serviceName}`, {
          type: 'retry_success',
          service: serviceName,
          attempt: attempt,
          totalAttempts: attempt + 1
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        cloudWatchLogger.error(`All retry attempts failed for ${serviceName}`, {
          type: 'retry_exhausted',
          service: serviceName,
          totalAttempts: attempt + 1,
          finalError: error.message
        });
        break;
      }

      const delay = exponentialBackoff 
        ? Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
        : baseDelay;
      
      cloudWatchLogger.warn(`Retry attempt ${attempt + 1} failed for ${serviceName}, retrying in ${delay}ms`, {
        type: 'retry_attempt',
        service: serviceName,
        attempt: attempt + 1,
        delay: delay,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Enhanced HTTP Client Class
class EnhancedHttpClient {
  constructor(baseConfig = {}) {
    this.client = axios.create({
      timeout: baseConfig.timeout || serviceConfig.api.defaultTimeout,
      ...baseConfig
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor for logging and timing
    this.client.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        
        if (serviceConfig.logging.logPerformance) {
          cloudWatchLogger.info(`HTTP Request started: ${config.method?.toUpperCase()} ${config.url}`, {
            type: 'http_request_start',
            method: config.method,
            url: config.url,
            timeout: config.timeout
          });
        }
        
        return config;
      },
      (error) => {
        cloudWatchLogger.error('HTTP Request setup failed', {
          type: 'http_request_setup_error',
          error: error.message
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        if (serviceConfig.logging.logPerformance) {
          cloudWatchLogger.info(`HTTP Request completed: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            type: 'http_request_success',
            method: response.config.method,
            url: response.config.url,
            status: response.status,
            duration: duration
          });
        }
        
        return response;
      },
      (error) => {
        const duration = error.config?.metadata ? Date.now() - error.config.metadata.startTime : 0;
        
        // Classify error types
        let errorType = 'http_error';
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          errorType = 'http_timeout';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          errorType = 'http_connection_error';
        } else if (error.response?.status >= 500) {
          errorType = 'http_server_error';
        } else if (error.response?.status >= 400) {
          errorType = 'http_client_error';
        }

        cloudWatchLogger.error(`HTTP Request failed: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
          type: errorType,
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          duration: duration,
          error: error.message,
          code: error.code
        });
        
        return Promise.reject(error);
      }
    );
  }

  // Enhanced request method with circuit breaker and retry logic
  async request(config, options = {}) {
    const {
      serviceName = 'api',
      useCircuitBreaker = serviceConfig.circuitBreaker.enabled,
      useRetry = true,
      retryOptions = {}
    } = options;

    const operation = async () => {
      return await this.client.request(config);
    };

    if (useCircuitBreaker && circuitBreakers[serviceName]) {
      const circuitBreakerOperation = async () => {
        if (useRetry) {
          return await retryWithBackoff(operation, {
            serviceName,
            ...retryOptions
          });
        }
        return await operation();
      };

      return await circuitBreakers[serviceName].execute(circuitBreakerOperation);
    } else if (useRetry) {
      return await retryWithBackoff(operation, {
        serviceName,
        ...retryOptions
      });
    }

    return await operation();
  }

  // Convenience methods
  async get(url, config = {}, options = {}) {
    return this.request({ ...config, method: 'GET', url }, options);
  }

  async post(url, data = {}, config = {}, options = {}) {
    return this.request({ ...config, method: 'POST', url, data }, options);
  }

  async put(url, data = {}, config = {}, options = {}) {
    return this.request({ ...config, method: 'PUT', url, data }, options);
  }

  async delete(url, config = {}, options = {}) {
    return this.request({ ...config, method: 'DELETE', url }, options);
  }

  // Health check method
  async healthCheck(serviceName, endpoint = '/health') {
    try {
      const response = await this.get(endpoint, {
        timeout: serviceConfig.healthCheck.timeout
      }, {
        serviceName: `${serviceName}_health`,
        useCircuitBreaker: false,
        useRetry: false
      });

      cloudWatchLogger.info(`Health check passed for ${serviceName}`, {
        type: 'health_check_success',
        service: serviceName,
        status: response.status
      });

      return { healthy: true, status: response.status };
    } catch (error) {
      cloudWatchLogger.error(`Health check failed for ${serviceName}`, {
        type: 'health_check_failure',
        service: serviceName,
        error: error.message
      });

      return { healthy: false, error: error.message };
    }
  }

  // Get circuit breaker status
  getCircuitBreakerStatus() {
    return Object.keys(circuitBreakers).reduce((status, name) => {
      status[name] = circuitBreakers[name].getState();
      return status;
    }, {});
  }
}

// Create default instances for different services
export const paymentClient = new EnhancedHttpClient({
  baseURL: serviceConfig.payment.baseUrl,
  timeout: serviceConfig.payment.timeout,
  headers: {
    'Content-Type': 'application/json',
    'X-Service': 'payment'
  }
});

export const databaseClient = new EnhancedHttpClient({
  timeout: serviceConfig.database.queryTimeout,
  headers: {
    'Content-Type': 'application/json',
    'X-Service': 'database'
  }
});

export const apiClient = new EnhancedHttpClient({
  timeout: serviceConfig.api.defaultTimeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Export the class for custom instances
export { EnhancedHttpClient };

// Export default client
export default apiClient;