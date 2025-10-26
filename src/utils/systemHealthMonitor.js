/**
 * System Health Monitor
 * Monitors service health, connection pools, and error rates to prevent issues
 * like those mentioned in the error logs
 */

import { cloudWatchLogger } from './cloudWatchLogger';
import { paymentService } from '../services/paymentService';
import { databaseService } from '../services/databaseService';
import { healthCheck } from './httpClient';

// Health monitoring configuration
const HEALTH_CONFIG = {
  checkInterval: 30000, // 30 seconds
  errorRateThreshold: 5, // 5% error rate threshold
  responseTimeThreshold: 5000, // 5 seconds
  connectionPoolThreshold: 80, // 80% utilization threshold
  alertCooldown: 300000, // 5 minutes between alerts
};

/**
 * System Health Monitor class
 */
export class SystemHealthMonitor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.lastAlerts = new Map();
    this.metrics = {
      payment: { requests: 0, errors: 0, totalResponseTime: 0 },
      database: { requests: 0, errors: 0, totalResponseTime: 0 },
      api: { requests: 0, errors: 0, totalResponseTime: 0 }
    };
    this.healthStatus = {
      payment: 'unknown',
      database: 'unknown',
      api: 'unknown',
      overall: 'unknown'
    };
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.isRunning) {
      console.warn('Health monitor is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, HEALTH_CONFIG.checkInterval);

    cloudWatchLogger.info('System health monitor started', {
      type: 'health_monitor_start',
      checkInterval: HEALTH_CONFIG.checkInterval
    });

    // Perform initial health check
    this.performHealthCheck();
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    cloudWatchLogger.info('System health monitor stopped', {
      type: 'health_monitor_stop'
    });
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const healthResults = await Promise.allSettled([
        this.checkPaymentService(),
        this.checkDatabaseService(),
        this.checkConnectionPools(),
        this.checkErrorRates()
      ]);

      // Process results and update overall health
      this.updateOverallHealth();

      // Log health status
      await cloudWatchLogger.logServiceHealth('system', this.healthStatus.overall, null, {
        services: this.healthStatus,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await cloudWatchLogger.error('Health check failed', {
        type: 'health_check_error',
        error: error.message
      });
    }
  }

  /**
   * Check payment service health
   */
  async checkPaymentService() {
    try {
      const startTime = Date.now();
      const result = await paymentService.healthCheck();
      const responseTime = Date.now() - startTime;

      this.healthStatus.payment = result.status;

      await cloudWatchLogger.logServiceHealth('payment', result.status, responseTime, {
        details: result.details || {}
      });

      // Check for slow response times
      if (responseTime > HEALTH_CONFIG.responseTimeThreshold) {
        await this.alertSlowResponse('payment', responseTime);
      }

      return result;

    } catch (error) {
      this.healthStatus.payment = 'unhealthy';
      
      await cloudWatchLogger.error('Payment service health check failed', {
        type: 'payment_health_error',
        error: error.message
      });

      await this.alertServiceDown('payment', error.message);
      throw error;
    }
  }

  /**
   * Check database service health
   */
  async checkDatabaseService() {
    try {
      const startTime = Date.now();
      const result = await databaseService.healthCheck();
      const responseTime = Date.now() - startTime;

      this.healthStatus.database = result.status;

      await cloudWatchLogger.logServiceHealth('database', result.status, responseTime, {
        connectionPool: result.connectionPool || {}
      });

      // Check connection pool utilization
      if (result.connectionPool && result.connectionPool.utilization > HEALTH_CONFIG.connectionPoolThreshold) {
        await this.alertHighConnectionPoolUsage('database', result.connectionPool);
      }

      return result;

    } catch (error) {
      this.healthStatus.database = 'unhealthy';
      
      await cloudWatchLogger.error('Database service health check failed', {
        type: 'database_health_error',
        error: error.message
      });

      await this.alertServiceDown('database', error.message);
      throw error;
    }
  }

  /**
   * Check connection pools across all services
   */
  async checkConnectionPools() {
    try {
      // Check HTTP client connection pools
      const httpHealthResults = await healthCheck(['payment', 'database', 'api']);
      
      for (const [service, result] of Object.entries(httpHealthResults)) {
        await cloudWatchLogger.logConnectionPoolStatus(`http_${service}`, result.circuitBreaker, {
          service
        });

        // Alert if circuit breaker is open
        if (result.circuitBreaker.state === 'OPEN') {
          await this.alertCircuitBreakerOpen(service, result.circuitBreaker);
        }
      }

      // Check database connection pool
      const dbPoolStatus = databaseService.getConnectionPoolStatus();
      await cloudWatchLogger.logConnectionPoolStatus('database', dbPoolStatus);

      if (dbPoolStatus.utilization > HEALTH_CONFIG.connectionPoolThreshold) {
        await this.alertHighConnectionPoolUsage('database', dbPoolStatus);
      }

    } catch (error) {
      await cloudWatchLogger.error('Connection pool check failed', {
        type: 'connection_pool_check_error',
        error: error.message
      });
    }
  }

  /**
   * Check error rates for all services
   */
  async checkErrorRates() {
    try {
      for (const [service, metrics] of Object.entries(this.metrics)) {
        if (metrics.requests > 0) {
          const errorRate = (metrics.errors / metrics.requests) * 100;
          const avgResponseTime = metrics.totalResponseTime / metrics.requests;

          await cloudWatchLogger.logErrorRate(service, metrics.errors, metrics.requests);

          // Alert if error rate is too high
          if (errorRate > HEALTH_CONFIG.errorRateThreshold) {
            await this.alertHighErrorRate(service, errorRate, metrics);
          }

          // Log performance metrics
          await cloudWatchLogger.logPerformanceMetric(`${service}_avg_response_time`, avgResponseTime, 'ms', {
            service,
            requests: metrics.requests,
            errors: metrics.errors
          });
        }
      }

      // Reset metrics for next interval
      this.resetMetrics();

    } catch (error) {
      await cloudWatchLogger.error('Error rate check failed', {
        type: 'error_rate_check_error',
        error: error.message
      });
    }
  }

  /**
   * Update overall system health based on individual service health
   */
  updateOverallHealth() {
    const services = Object.values(this.healthStatus).filter(status => status !== 'unknown');
    
    if (services.length === 0) {
      this.healthStatus.overall = 'unknown';
    } else if (services.every(status => status === 'healthy')) {
      this.healthStatus.overall = 'healthy';
    } else if (services.some(status => status === 'unhealthy')) {
      this.healthStatus.overall = 'unhealthy';
    } else {
      this.healthStatus.overall = 'degraded';
    }
  }

  /**
   * Record service metrics
   */
  recordMetric(service, isError = false, responseTime = 0) {
    if (this.metrics[service]) {
      this.metrics[service].requests++;
      if (isError) {
        this.metrics[service].errors++;
      }
      this.metrics[service].totalResponseTime += responseTime;
    }
  }

  /**
   * Reset metrics for next monitoring interval
   */
  resetMetrics() {
    for (const service of Object.keys(this.metrics)) {
      this.metrics[service] = { requests: 0, errors: 0, totalResponseTime: 0 };
    }
  }

  /**
   * Alert methods with cooldown to prevent spam
   */
  async alertServiceDown(service, error) {
    const alertKey = `service_down_${service}`;
    if (this.shouldAlert(alertKey)) {
      await cloudWatchLogger.error(`ALERT: ${service} service is down`, {
        type: 'service_down_alert',
        service,
        error,
        severity: 'critical'
      });
      this.lastAlerts.set(alertKey, Date.now());
    }
  }

  async alertSlowResponse(service, responseTime) {
    const alertKey = `slow_response_${service}`;
    if (this.shouldAlert(alertKey)) {
      await cloudWatchLogger.warn(`ALERT: ${service} service slow response`, {
        type: 'slow_response_alert',
        service,
        responseTime,
        threshold: HEALTH_CONFIG.responseTimeThreshold,
        severity: 'warning'
      });
      this.lastAlerts.set(alertKey, Date.now());
    }
  }

  async alertHighConnectionPoolUsage(service, poolStatus) {
    const alertKey = `high_pool_usage_${service}`;
    if (this.shouldAlert(alertKey)) {
      await cloudWatchLogger.warn(`ALERT: ${service} connection pool high utilization`, {
        type: 'high_pool_usage_alert',
        service,
        utilization: poolStatus.utilization,
        threshold: HEALTH_CONFIG.connectionPoolThreshold,
        poolStatus,
        severity: 'warning'
      });
      this.lastAlerts.set(alertKey, Date.now());
    }
  }

  async alertCircuitBreakerOpen(service, circuitBreakerStatus) {
    const alertKey = `circuit_breaker_open_${service}`;
    if (this.shouldAlert(alertKey)) {
      await cloudWatchLogger.error(`ALERT: ${service} circuit breaker is open`, {
        type: 'circuit_breaker_open_alert',
        service,
        circuitBreakerStatus,
        severity: 'critical'
      });
      this.lastAlerts.set(alertKey, Date.now());
    }
  }

  async alertHighErrorRate(service, errorRate, metrics) {
    const alertKey = `high_error_rate_${service}`;
    if (this.shouldAlert(alertKey)) {
      await cloudWatchLogger.error(`ALERT: ${service} high error rate`, {
        type: 'high_error_rate_alert',
        service,
        errorRate,
        threshold: HEALTH_CONFIG.errorRateThreshold,
        metrics,
        severity: 'critical'
      });
      this.lastAlerts.set(alertKey, Date.now());
    }
  }

  /**
   * Check if we should send an alert (respects cooldown period)
   */
  shouldAlert(alertKey) {
    const lastAlert = this.lastAlerts.get(alertKey);
    if (!lastAlert) {
      return true;
    }
    return (Date.now() - lastAlert) > HEALTH_CONFIG.alertCooldown;
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      ...this.healthStatus,
      isMonitoring: this.isRunning,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

// Export singleton instance
export const systemHealthMonitor = new SystemHealthMonitor();

export default systemHealthMonitor;