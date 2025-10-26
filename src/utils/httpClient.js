/**
 * HTTP Client with timeout and retry capabilities
 * Addresses payment service connection timeouts and database connection pool exhaustion
 */

class HttpClient {
  constructor(options = {}) {
    this.defaultTimeout = options.timeout || 5000; // 5 seconds default
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
    this.connectionPoolSize = options.connectionPoolSize || 10;
    this.activeConnections = 0;
  }

  /**
   * Create a fetch request with timeout
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise} - Fetch promise with timeout
   */
  async fetchWithTimeout(url, options = {}, timeout = this.defaultTimeout) {
    // Check connection pool limit
    if (this.activeConnections >= this.connectionPoolSize) {
      throw new Error('Connection pool exhausted - too many active connections');
    }

    this.activeConnections++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      this.activeConnections--;
    }
  }

  /**
   * Retry logic with exponential backoff
   * @param {Function} operation - Function to retry
   * @param {number} retries - Number of retries remaining
   * @returns {Promise} - Result of operation
   */
  async retry(operation, retries = this.maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(2, this.maxRetries - retries);
        console.warn(`Request failed, retrying in ${delay}ms. Retries left: ${retries - 1}`);
        await this.sleep(delay);
        return this.retry(operation, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} - Whether error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'Request timeout',
      'Connection pool exhausted',
      'Network error',
      'ECONNRESET',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    ) || (error.status >= 500 && error.status < 600);
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request with timeout and retry
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise} - Response promise
   */
  async get(url, options = {}) {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    });
  }

  /**
   * POST request with timeout and retry
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise} - Response promise
   */
  async post(url, data = null, options = {}) {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: data ? JSON.stringify(data) : null,
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    });
  }

  /**
   * PUT request with timeout and retry
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} options - Request options
   * @returns {Promise} - Response promise
   */
  async put(url, data = null, options = {}) {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: data ? JSON.stringify(data) : null,
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    });
  }

  /**
   * DELETE request with timeout and retry
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise} - Response promise
   */
  async delete(url, options = {}) {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(url, {
        method: 'DELETE',
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    });
  }

  /**
   * Get connection pool status
   * @returns {Object} - Connection pool information
   */
  getConnectionStatus() {
    return {
      activeConnections: this.activeConnections,
      maxConnections: this.connectionPoolSize,
      availableConnections: this.connectionPoolSize - this.activeConnections
    };
  }
}

// Create default instance with production-ready settings
const httpClient = new HttpClient({
  timeout: 10000, // 10 seconds for external services
  maxRetries: 3,
  retryDelay: 1000,
  connectionPoolSize: 15
});

export { HttpClient };
export default httpClient;