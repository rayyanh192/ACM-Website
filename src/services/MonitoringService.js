/**
 * Monitoring Service for System Health and Error Tracking
 * Provides centralized monitoring for payment and database services
 */

import { paymentService } from './PaymentService';
import { databaseService } from './DatabaseService';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';
import { serviceConfig } from '@/config/serviceConfig';

class MonitoringService {
  constructor() {
    this.services = {
      payment: paymentService,
      database: databaseService
    };
    
    this.healthStatus = {
      payment: { healthy: true, lastCheck: null, consecutiveFailures: 0 },
      database: { healthy: true, lastCheck: null, consecutiveFailures: 0 },
      overall: { healthy: true, lastCheck: null }
    };
    
    this.alertThresholds = {
      consecutiveFailures: 3,
      responseTimeWarning: 5000, // 5 seconds
      responseTimeCritical: 10000, // 10 seconds
      connectionPoolWarning: 0.8, // 80% of max connections
      connectionPoolCritical: 0.95 // 95% of max connections
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    
    // Start monitoring if enabled
    if (serviceConfig.healthCheck.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    cloudWatchLogger.info('Monitoring service started', {
      type: 'monitoring_start',
      interval: serviceConfig.healthCheck.interval,
      services: Object.keys(this.services)
    });
    
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, serviceConfig.healthCheck.interval);
  }

  /**
   * Stop continuous health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    cloudWatchLogger.info('Monitoring service stopped', {
      type: 'monitoring_stop'
    });
  }

  /**
   * Perform health checks on all services
   */
  async performHealthChecks() {
    const startTime = Date.now();
    const results = {};
    
    try {
      // Check each service
      for (const [serviceName, service] of Object.entries(this.services)) {
        results[serviceName] = await this.checkServiceHealth(serviceName, service);
      }
      
      // Update overall health status
      const overallHealthy = Object.values(results).every(result => result.healthy);
      this.healthStatus.overall = {
        healthy: overallHealthy,
        lastCheck: Date.now(),
        services: results
      };
      
      // Log health check results
      await cloudWatchLogger.serviceHealth('overall', overallHealthy, {
        duration: Date.now() - startTime,
        services: results
      });
      
      // Check for alerts
      await this.checkAlertConditions(results);
      
      return this.healthStatus.overall;
      
    } catch (error) {
      await cloudWatchLogger.error('Health check failed', {
        type: 'health_check_error',
        error: error.message,
        duration: Date.now() - startTime
      });
      
      return {
        healthy: false,
        error: error.message,
        lastCheck: Date.now()
      };
    }
  }

  /**
   * Check health of individual service
   */
  async checkServiceHealth(serviceName, service) {
    const startTime = Date.now();
    
    try {
      const healthResult = await service.healthCheck();
      const duration = Date.now() - startTime;
      
      // Update service health status
      if (healthResult.healthy) {
        this.healthStatus[serviceName].consecutiveFailures = 0;
      } else {
        this.healthStatus[serviceName].consecutiveFailures++;
      }
      
      this.healthStatus[serviceName] = {
        ...this.healthStatus[serviceName],
        healthy: healthResult.healthy,
        lastCheck: Date.now(),
        responseTime: duration,
        details: healthResult
      };
      
      // Log service-specific health
      await cloudWatchLogger.serviceHealth(serviceName, healthResult.healthy, {
        responseTime: duration,
        consecutiveFailures: this.healthStatus[serviceName].consecutiveFailures,
        details: healthResult
      });
      
      return {
        healthy: healthResult.healthy,
        responseTime: duration,
        consecutiveFailures: this.healthStatus[serviceName].consecutiveFailures,
        details: healthResult
      };
      
    } catch (error) {
      this.healthStatus[serviceName].consecutiveFailures++;
      
      await cloudWatchLogger.error(`Health check failed for ${serviceName}`, {
        type: 'service_health_check_error',
        service: serviceName,
        error: error.message,
        consecutiveFailures: this.healthStatus[serviceName].consecutiveFailures
      });
      
      return {
        healthy: false,
        error: error.message,
        consecutiveFailures: this.healthStatus[serviceName].consecutiveFailures
      };
    }
  }

  /**
   * Check for alert conditions and trigger notifications
   */
  async checkAlertConditions(healthResults) {
    for (const [serviceName, result] of Object.entries(healthResults)) {
      // Check consecutive failures
      if (result.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
        await this.triggerAlert('consecutive_failures', serviceName, {
          consecutiveFailures: result.consecutiveFailures,
          threshold: this.alertThresholds.consecutiveFailures
        });
      }
      
      // Check response time
      if (result.responseTime > this.alertThresholds.responseTimeCritical) {
        await this.triggerAlert('response_time_critical', serviceName, {
          responseTime: result.responseTime,
          threshold: this.alertThresholds.responseTimeCritical
        });
      } else if (result.responseTime > this.alertThresholds.responseTimeWarning) {
        await this.triggerAlert('response_time_warning', serviceName, {
          responseTime: result.responseTime,
          threshold: this.alertThresholds.responseTimeWarning
        });
      }
      
      // Check connection pool status for database service
      if (serviceName === 'database' && result.details?.connectionPool) {
        const poolStats = result.details.connectionPool.stats;
        const poolUtilization = poolStats.activeConnections / poolStats.maxConnections;
        
        if (poolUtilization >= this.alertThresholds.connectionPoolCritical) {
          await this.triggerAlert('connection_pool_critical', serviceName, {
            utilization: poolUtilization,
            activeConnections: poolStats.activeConnections,
            maxConnections: poolStats.maxConnections
          });
        } else if (poolUtilization >= this.alertThresholds.connectionPoolWarning) {
          await this.triggerAlert('connection_pool_warning', serviceName, {
            utilization: poolUtilization,
            activeConnections: poolStats.activeConnections,
            maxConnections: poolStats.maxConnections
          });
        }
      }
    }
  }

  /**
   * Trigger alert for specific condition
   */
  async triggerAlert(alertType, serviceName, context = {}) {
    const alertMessage = this.getAlertMessage(alertType, serviceName, context);
    
    await cloudWatchLogger.error(alertMessage, {
      type: 'alert_triggered',
      alertType,
      service: serviceName,
      ...context
    });
    
    // Here you could integrate with external alerting systems
    // like PagerDuty, Slack, email notifications, etc.
    console.warn(`ALERT: ${alertMessage}`, context);
  }

  /**
   * Get human-readable alert message
   */
  getAlertMessage(alertType, serviceName, context) {
    switch (alertType) {
      case 'consecutive_failures':
        return `Service ${serviceName} has failed ${context.consecutiveFailures} consecutive health checks`;
      case 'response_time_critical':
        return `Service ${serviceName} response time (${context.responseTime}ms) exceeds critical threshold`;
      case 'response_time_warning':
        return `Service ${serviceName} response time (${context.responseTime}ms) exceeds warning threshold`;
      case 'connection_pool_critical':
        return `Database connection pool utilization (${Math.round(context.utilization * 100)}%) is critically high`;
      case 'connection_pool_warning':
        return `Database connection pool utilization (${Math.round(context.utilization * 100)}%) is high`;
      default:
        return `Alert triggered for ${serviceName}: ${alertType}`;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      ...this.healthStatus,
      isMonitoring: this.isMonitoring,
      monitoringInterval: serviceConfig.healthCheck.interval
    };
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics() {
    const metrics = {
      timestamp: Date.now(),
      services: {},
      overall: this.healthStatus.overall
    };
    
    // Get service-specific metrics
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        if (serviceName === 'database') {
          metrics.services[serviceName] = {
            health: this.healthStatus[serviceName],
            connectionPool: service.getPoolStats()
          };
        } else {
          metrics.services[serviceName] = {
            health: this.healthStatus[serviceName]
          };
        }
      } catch (error) {
        metrics.services[serviceName] = {
          error: error.message
        };
      }
    }
    
    // Log system metrics
    await cloudWatchLogger.resourceUsage(metrics);
    
    return metrics;
  }

  /**
   * Handle service errors and determine if they match known error patterns
   */
  async handleServiceError(serviceName, error, operation, context = {}) {
    const errorInfo = {
      service: serviceName,
      operation,
      error: error.message,
      timestamp: Date.now(),
      ...context
    };
    
    // Check for specific error patterns from the original logs
    if (error.message.includes('timeout after 5000ms') || 
        error.message.includes('Payment service connection failed')) {
      await cloudWatchLogger.paymentServiceTimeout(5000, errorInfo);
      return 'payment_timeout';
    }
    
    if (error.message.includes('HTTPSConnectionPool timeout')) {
      await cloudWatchLogger.httpsConnectionPoolTimeout(context.endpoint || 'unknown', errorInfo);
      return 'https_connection_timeout';
    }
    
    if (error.message.includes('connection pool exhausted')) {
      await cloudWatchLogger.connectionPoolExhausted(serviceName, errorInfo);
      return 'connection_pool_exhausted';
    }
    
    // Generic error handling
    await cloudWatchLogger.error(`Service error in ${serviceName}`, {
      type: 'service_error',
      ...errorInfo
    });
    
    return 'generic_error';
  }

  /**
   * Simulate the specific errors from the logs for testing
   */
  async simulateDeployErrors() {
    const errors = [];
    
    try {
      // Simulate payment service timeout
      await cloudWatchLogger.paymentServiceTimeout(5000, {
        simulatedError: true,
        originalLog: '[ERROR] Payment service connection failed - timeout after 5000ms'
      });
      errors.push('payment_timeout_simulated');
      
      // Simulate HTTPSConnectionPool timeout
      await cloudWatchLogger.httpsConnectionPoolTimeout('/app/payment_handler.py', {
        simulatedError: true,
        originalLog: 'Traceback (most recent call last):\n  File "/app/payment_handler.py", line 67, in process_payment\n    response = payment_client.charge(amount)\nConnectionError: HTTPSConnectionPool timeout'
      });
      errors.push('https_connection_timeout_simulated');
      
      // Simulate database connection pool exhaustion
      await cloudWatchLogger.connectionPoolExhausted('database', {
        simulatedError: true,
        originalLog: '[ERROR] Database query failed: connection pool exhausted'
      });
      errors.push('connection_pool_exhausted_simulated');
      
      await cloudWatchLogger.info('Deploy error simulation completed', {
        type: 'error_simulation',
        errorsSimulated: errors.length,
        errors
      });
      
      return {
        success: true,
        errorsSimulated: errors
      };
      
    } catch (error) {
      await cloudWatchLogger.error('Error simulation failed', {
        type: 'error_simulation_failure',
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();
export default monitoringService;