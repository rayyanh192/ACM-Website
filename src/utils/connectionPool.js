/**
 * Connection Pool Manager - Manages HTTP connections and prevents pool exhaustion
 * Equivalent to connection_pool.py mentioned in error logs
 */

import { cloudWatchLogger } from './cloudWatchLogger';

class ConnectionPool {
  constructor(config = {}) {
    this.config = {
      maxConnections: config.maxConnections || 50,
      maxConnectionsPerHost: config.maxConnectionsPerHost || 10,
      connectionTimeout: config.connectionTimeout || 30000,
      requestTimeout: config.requestTimeout || 60000,
      keepAliveTimeout: config.keepAliveTimeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    this.connections = new Map(); // host -> Set of connections
    this.activeRequests = new Map(); // requestId -> request info
    this.hostStats = new Map(); // host -> stats
    this.globalStats = {
      totalRequests: 0,
      activeRequests: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      poolExhausted: 0
    };

    this.startCleanupInterval();
  }

  /**
   * Make HTTP request with connection pooling and timeout management
   */
  async makeRequest(url, options = {}) {
    const requestId = this.generateRequestId();
    const host = new URL(url).host;
    
    try {
      // Check if we can make the request
      await this.checkConnectionLimits(host);

      // Track the request
      this.trackRequest(requestId, host, url);

      // Execute request with timeout and retry logic
      const result = await this.executeRequestWithRetry(url, options, requestId, host);

      this.completeRequest(requestId, true);
      return result;

    } catch (error) {
      this.completeRequest(requestId, false);
      
      // Log specific connection pool errors
      if (error.name === 'PoolExhaustedError') {
        await cloudWatchLogger.error('Connection pool exhausted', {
          host,
          activeConnections: this.getActiveConnectionsForHost(host),
          maxConnections: this.config.maxConnectionsPerHost,
          requestId
        });
      } else if (error.name === 'TimeoutError') {
        await cloudWatchLogger.error('HTTPSConnectionPool timeout', {
          host,
          timeout: this.config.requestTimeout,
          requestId
        });
      }

      throw error;
    }
  }

  /**
   * Check connection limits before making request
   */
  async checkConnectionLimits(host) {
    const activeConnections = this.getActiveConnectionsForHost(host);
    const totalActiveRequests = this.activeRequests.size;

    // Check per-host limit
    if (activeConnections >= this.config.maxConnectionsPerHost) {
      this.globalStats.poolExhausted++;
      const error = new Error(`Connection pool exhausted for host ${host}`);
      error.name = 'PoolExhaustedError';
      error.code = 'POOL_EXHAUSTED';
      throw error;
    }

    // Check global limit
    if (totalActiveRequests >= this.config.maxConnections) {
      this.globalStats.poolExhausted++;
      const error = new Error('Global connection pool exhausted');
      error.name = 'PoolExhaustedError';
      error.code = 'GLOBAL_POOL_EXHAUSTED';
      throw error;
    }
  }

  /**
   * Execute request with retry logic
   */
  async executeRequestWithRetry(url, options, requestId, host, attempt = 1) {
    try {
      return await this.executeRequest(url, options, requestId);
    } catch (error) {
      if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        
        await cloudWatchLogger.warn(`Request failed, retrying (${attempt}/${this.config.retryAttempts})`, {
          url,
          host,
          requestId,
          attempt,
          error: error.message,
          delay
        });

        await this.sleep(delay);
        return this.executeRequestWithRetry(url, options, requestId, host, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Execute the actual HTTP request
   */
  async executeRequest(url, options, requestId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeout);

    try {
      const fetchOptions = {
        ...options,
        signal: controller.signal,
        // Add connection management headers
        headers: {
          'Connection': 'keep-alive',
          'Keep-Alive': `timeout=${this.config.keepAliveTimeout / 1000}`,
          ...options.headers
        }
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.name = 'HTTPError';
        error.status = response.status;
        error.statusText = response.statusText;
        throw error;
      }

      return response;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        this.globalStats.timeoutRequests++;
        const timeoutError = new Error(`HTTPSConnectionPool timeout after ${this.config.requestTimeout}ms`);
        timeoutError.name = 'TimeoutError';
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  }

  /**
   * Track active request
   */
  trackRequest(requestId, host, url) {
    this.globalStats.totalRequests++;
    this.globalStats.activeRequests++;

    this.activeRequests.set(requestId, {
      host,
      url,
      startTime: Date.now(),
      timeout: setTimeout(() => {
        this.handleRequestTimeout(requestId);
      }, this.config.requestTimeout)
    });

    // Initialize host connections if needed
    if (!this.connections.has(host)) {
      this.connections.set(host, new Set());
      this.hostStats.set(host, {
        totalRequests: 0,
        activeRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0
      });
    }

    // Add to host connections
    this.connections.get(host).add(requestId);
    
    // Update host stats
    const stats = this.hostStats.get(host);
    stats.totalRequests++;
    stats.activeRequests++;
  }

  /**
   * Complete request tracking
   */
  completeRequest(requestId, success = true) {
    const request = this.activeRequests.get(requestId);
    if (!request) return;

    const duration = Date.now() - request.startTime;
    
    // Clear timeout
    clearTimeout(request.timeout);
    
    // Remove from tracking
    this.activeRequests.delete(requestId);
    this.globalStats.activeRequests--;

    // Update host stats
    const hostConnections = this.connections.get(request.host);
    if (hostConnections) {
      hostConnections.delete(requestId);
      
      const stats = this.hostStats.get(request.host);
      stats.activeRequests--;
      
      if (success) {
        // Update average response time
        stats.avgResponseTime = (stats.avgResponseTime + duration) / 2;
      } else {
        stats.failedRequests++;
        this.globalStats.failedRequests++;
      }
    }
  }

  /**
   * Handle request timeout
   */
  async handleRequestTimeout(requestId) {
    const request = this.activeRequests.get(requestId);
    if (request) {
      await cloudWatchLogger.warn('Request timed out', {
        requestId,
        host: request.host,
        url: request.url,
        duration: Date.now() - request.startTime
      });
      
      this.completeRequest(requestId, false);
    }
  }

  /**
   * Get active connections for a specific host
   */
  getActiveConnectionsForHost(host) {
    const connections = this.connections.get(host);
    return connections ? connections.size : 0;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = ['TimeoutError', 'NetworkError', 'HTTPError'];
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    
    return retryableErrors.includes(error.name) ||
           (error.status && retryableStatuses.includes(error.status)) ||
           (error.code && ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code));
  }

  /**
   * Start cleanup interval for stale connections
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupStaleConnections();
      this.logPoolStats();
    }, 30000); // Every 30 seconds
  }

  /**
   * Cleanup stale connections
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const maxAge = this.config.connectionTimeout;
    const staleRequests = [];

    for (const [requestId, request] of this.activeRequests.entries()) {
      if (now - request.startTime > maxAge) {
        staleRequests.push(requestId);
      }
    }

    staleRequests.forEach(requestId => {
      cloudWatchLogger.warn('Cleaning up stale connection', {
        requestId,
        age: now - this.activeRequests.get(requestId).startTime
      });
      this.completeRequest(requestId, false);
    });
  }

  /**
   * Log connection pool statistics
   */
  async logPoolStats() {
    const stats = {
      ...this.globalStats,
      poolUtilization: (this.globalStats.activeRequests / this.config.maxConnections) * 100,
      hostsActive: this.connections.size,
      timestamp: new Date().toISOString()
    };

    await cloudWatchLogger.debug('Connection pool stats', stats);

    // Alert on high utilization
    if (stats.poolUtilization > 80) {
      await cloudWatchLogger.warn('High connection pool utilization', {
        utilization: stats.poolUtilization,
        activeRequests: this.globalStats.activeRequests,
        maxConnections: this.config.maxConnections
      });
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus() {
    const hostStats = {};
    for (const [host, stats] of this.hostStats.entries()) {
      hostStats[host] = {
        ...stats,
        activeConnections: this.getActiveConnectionsForHost(host),
        utilization: (this.getActiveConnectionsForHost(host) / this.config.maxConnectionsPerHost) * 100
      };
    }

    return {
      global: {
        ...this.globalStats,
        poolUtilization: (this.globalStats.activeRequests / this.config.maxConnections) * 100,
        maxConnections: this.config.maxConnections
      },
      hosts: hostStats,
      config: this.config
    };
  }

  /**
   * Health check for connection pool
   */
  async healthCheck() {
    try {
      const status = this.getPoolStatus();
      const isHealthy = status.global.poolUtilization < 90 && 
                       status.global.activeRequests < this.config.maxConnections;

      return {
        healthy: isHealthy,
        status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      await cloudWatchLogger.error('Connection pool health check failed', {
        error: error.message
      });
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance with optimized settings
export const connectionPool = new ConnectionPool({
  maxConnections: 100,
  maxConnectionsPerHost: 20,
  connectionTimeout: 30000,
  requestTimeout: 60000, // Increased from default to prevent timeouts
  keepAliveTimeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000
});

export default ConnectionPool;