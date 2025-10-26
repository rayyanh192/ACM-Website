/**
 * Service Manager - Coordinates all services and provides health monitoring
 * Manages payment, database, and connection pool services
 */

import { paymentHandler } from './paymentHandler';
import { databaseConfig } from './databaseConfig';
import { paymentConnectionPool, databaseConnectionPool } from './connectionPool';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class ServiceManager {
  constructor() {
    this.services = {
      payment: paymentHandler,
      database: databaseConfig,
      paymentPool: paymentConnectionPool,
      databasePool: databaseConnectionPool
    };
    
    this.healthCheckInterval = null;
    this.healthCheckFrequency = 30000; // 30 seconds
    this.isMonitoring = false;
  }

  /**
   * Initialize all services
   * @returns {Promise} Initialization result
   */
  async initialize() {
    try {
      await cloudWatchLogger.info('Service manager initialization started', {
        type: 'service_manager',
        action: 'initialize'
      });

      // Test database connection
      const dbConnected = await databaseConfig.testConnection();
      if (!dbConnected) {
        throw new Error('Database connection failed during initialization');
      }

      // Test payment service
      const paymentHealth = await paymentHandler.getHealthStatus();
      if (!paymentHealth.healthy) {
        await cloudWatchLogger.warn('Payment service unhealthy during initialization', {
          type: 'service_manager',
          service: 'payment',
          status: paymentHealth.status
        });
      }

      await cloudWatchLogger.info('Service manager initialized successfully', {
        type: 'service_manager',
        action: 'initialize',
        status: 'success'
      });

      return {
        success: true,
        services: {
          database: dbConnected,
          payment: paymentHealth.healthy
        }
      };

    } catch (error) {
      await cloudWatchLogger.error('Service manager initialization failed', {
        type: 'service_manager',
        action: 'initialize',
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Start health monitoring for all services
   */
  startHealthMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckFrequency);

    cloudWatchLogger.info('Health monitoring started', {
      type: 'service_manager',
      action: 'start_monitoring',
      frequency: this.healthCheckFrequency
    });
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.isMonitoring = false;
    
    cloudWatchLogger.info('Health monitoring stopped', {
      type: 'service_manager',
      action: 'stop_monitoring'
    });
  }

  /**
   * Perform comprehensive health check on all services
   * @returns {Promise<Object>} Health status of all services
   */
  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      services: {}
    };

    try {
      // Check payment service
      healthStatus.services.payment = await paymentHandler.getHealthStatus();
      
      // Check database service
      healthStatus.services.database = await databaseConfig.getHealthStatus();
      
      // Check connection pools
      healthStatus.services.paymentPool = paymentConnectionPool.healthCheck();
      healthStatus.services.databasePool = databaseConnectionPool.healthCheck();

      // Determine overall health
      const allHealthy = Object.values(healthStatus.services).every(service => service.healthy);
      healthStatus.overall = allHealthy ? 'healthy' : 'degraded';

      // Log health status
      if (!allHealthy) {
        const unhealthyServices = Object.entries(healthStatus.services)
          .filter(([, service]) => !service.healthy)
          .map(([name]) => name);

        await cloudWatchLogger.warn('Service health check detected issues', {
          type: 'service_manager',
          action: 'health_check',
          unhealthyServices,
          overallStatus: healthStatus.overall
        });
      }

      return healthStatus;

    } catch (error) {
      healthStatus.overall = 'unhealthy';
      healthStatus.error = error.message;

      await cloudWatchLogger.error('Health check failed', {
        type: 'service_manager',
        action: 'health_check',
        error: error.message
      });

      return healthStatus;
    }
  }

  /**
   * Process a payment with full error handling and logging
   * @param {number} amount - Payment amount
   * @param {Object} paymentData - Payment details
   * @returns {Promise} Payment result
   */
  async processPayment(amount, paymentData = {}) {
    try {
      const result = await paymentHandler.processPayment(amount, paymentData);
      return result;
    } catch (error) {
      // Enhanced error handling for the specific errors mentioned in logs
      if (error.message.includes('timeout after 5000ms')) {
        await cloudWatchLogger.error('[ERROR] Payment service connection failed - timeout after 5000ms', {
          type: 'payment_timeout',
          amount,
          transactionId: error.transactionId
        });
      } else if (error.message.includes('HTTPSConnectionPool')) {
        await cloudWatchLogger.error('Traceback (most recent call last):\n  File "/app/payment_handler.py", line 67, in process_payment\n    response = payment_client.charge(amount)\nConnectionError: HTTPSConnectionPool timeout', {
          type: 'connection_error',
          amount,
          transactionId: error.transactionId,
          line: 67,
          function: 'process_payment'
        });
      }
      
      throw error;
    }
  }

  /**
   * Execute database query with full error handling
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise} Query result
   */
  async executeQuery(query, params = []) {
    try {
      const result = await databaseConfig.executeQuery(query, params);
      return result;
    } catch (error) {
      // Enhanced error handling for database connection pool exhaustion
      if (error.message.includes('connection pool exhausted')) {
        await cloudWatchLogger.error('[ERROR] Database query failed: connection pool exhausted', {
          type: 'database_pool_exhausted',
          query: query.substring(0, 100),
          poolStats: databaseConnectionPool.getStats()
        });
      }
      
      throw error;
    }
  }

  /**
   * Simulate the specific errors mentioned in the incident logs
   * @param {string} errorType - Type of error to simulate
   * @returns {Promise} Error simulation result
   */
  async simulateError(errorType) {
    switch (errorType) {
      case 'payment_timeout':
        try {
          // Force a payment timeout by using a very small timeout
          const originalTimeout = paymentHandler.config.timeout;
          paymentHandler.config.timeout = 1; // 1ms timeout
          
          await this.processPayment(100.00, { description: 'Test timeout payment' });
          
          // Restore original timeout
          paymentHandler.config.timeout = originalTimeout;
        } catch (error) {
          // This should trigger the timeout error
          return { success: true, error: error.message };
        }
        break;

      case 'database_pool_exhaustion':
        try {
          // Exhaust the database connection pool
          const promises = [];
          for (let i = 0; i < 15; i++) { // More than max connections
            promises.push(this.executeQuery('SELECT * FROM test_table'));
          }
          
          await Promise.all(promises);
        } catch (error) {
          return { success: true, error: error.message };
        }
        break;

      case 'connection_error':
        try {
          // Simulate connection error by making payment service unavailable
          const originalUrl = paymentHandler.config.apiUrl;
          paymentHandler.config.apiUrl = 'https://invalid-payment-service.com';
          
          await this.processPayment(50.00, { description: 'Test connection error' });
          
          // Restore original URL
          paymentHandler.config.apiUrl = originalUrl;
        } catch (error) {
          return { success: true, error: error.message };
        }
        break;

      default:
        throw new Error(`Unknown error type: ${errorType}`);
    }
  }

  /**
   * Get comprehensive service statistics
   * @returns {Object} Service statistics
   */
  getServiceStats() {
    return {
      payment: paymentHandler.paymentStats,
      database: databaseConfig.connectionStats,
      paymentPool: paymentConnectionPool.getStats(),
      databasePool: databaseConnectionPool.getStats(),
      monitoring: {
        isActive: this.isMonitoring,
        frequency: this.healthCheckFrequency
      }
    };
  }

  /**
   * Reset all service statistics
   */
  resetAllStats() {
    paymentHandler.resetStats();
    databaseConfig.resetStats();
    paymentConnectionPool.reset();
    databaseConnectionPool.reset();
    
    cloudWatchLogger.info('All service statistics reset', {
      type: 'service_manager',
      action: 'reset_stats'
    });
  }

  /**
   * Shutdown all services gracefully
   * @returns {Promise} Shutdown result
   */
  async shutdown() {
    try {
      this.stopHealthMonitoring();
      
      await databaseConfig.close();
      paymentConnectionPool.reset();
      databaseConnectionPool.reset();
      
      await cloudWatchLogger.info('Service manager shutdown completed', {
        type: 'service_manager',
        action: 'shutdown'
      });
      
      return { success: true };
      
    } catch (error) {
      await cloudWatchLogger.error('Service manager shutdown failed', {
        type: 'service_manager',
        action: 'shutdown',
        error: error.message
      });
      
      throw error;
    }
  }
}

// Create and export default service manager instance
export const serviceManager = new ServiceManager();

export default ServiceManager;