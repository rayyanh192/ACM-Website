/**
 * Health Check Utility for CloudWatch Integration
 * Provides automated health monitoring and status reporting
 */

import { cloudWatchLogger } from './cloudWatchLogger';

export class CloudWatchHealthMonitor {
  constructor() {
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    this.isMonitoring = false;
  }

  /**
   * Perform a comprehensive health check
   * @returns {Object} Health check results
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      checks: {},
      duration: 0,
      errors: []
    };

    try {
      // 1. Configuration Check
      results.checks.configuration = await this.checkConfiguration();
      
      // 2. Connection Test
      results.checks.connection = await this.testConnection();
      
      // 3. Logging Test
      results.checks.logging = await this.testLogging();
      
      // 4. Fallback System Test
      results.checks.fallback = await this.testFallbackSystem();

      // Determine overall health
      const allChecks = Object.values(results.checks);
      const failedChecks = allChecks.filter(check => !check.success);
      
      if (failedChecks.length === 0) {
        results.overall = 'healthy';
      } else if (failedChecks.length < allChecks.length) {
        results.overall = 'degraded';
      } else {
        results.overall = 'unhealthy';
      }

      results.duration = Date.now() - startTime;
      this.lastHealthCheck = results;
      
      return results;

    } catch (error) {
      results.overall = 'error';
      results.errors.push(error.message);
      results.duration = Date.now() - startTime;
      this.lastHealthCheck = results;
      
      return results;
    }
  }

  /**
   * Check CloudWatch configuration
   */
  async checkConfiguration() {
    try {
      const config = cloudWatchLogger.getConfig();
      
      return {
        success: config.configured,
        message: config.configured ? 'Configuration valid' : 'Configuration invalid',
        details: {
          environment: config.environment,
          errors: config.errors,
          warnings: config.warnings
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Configuration check failed: ${error.message}`,
        details: { error: error.stack }
      };
    }
  }

  /**
   * Test CloudWatch connection
   */
  async testConnection() {
    try {
      const result = await cloudWatchLogger.healthCheck();
      
      return {
        success: result.success,
        message: result.success ? 'Connection successful' : `Connection failed: ${result.error}`,
        details: result.details
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
        details: { error: error.stack }
      };
    }
  }

  /**
   * Test logging functionality
   */
  async testLogging() {
    try {
      const testMessage = `Health check test log - ${new Date().toISOString()}`;
      const result = await cloudWatchLogger.info(testMessage, {
        type: 'health_check',
        test: true
      });

      return {
        success: result.success,
        message: result.success ? 'Logging test successful' : `Logging test failed: ${result.error}`,
        details: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Logging test failed: ${error.message}`,
        details: { error: error.stack }
      };
    }
  }

  /**
   * Test fallback logging system
   */
  async testFallbackSystem() {
    try {
      // Get current fallback logs
      const logsResult = await cloudWatchLogger.getFallbackLogs();
      
      if (!logsResult.success) {
        return {
          success: false,
          message: `Fallback system test failed: ${logsResult.error}`,
          details: logsResult
        };
      }

      return {
        success: true,
        message: `Fallback system operational (${logsResult.logs.length} logs stored)`,
        details: {
          logCount: logsResult.logs.length,
          recentLogs: logsResult.logs.slice(-3)
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Fallback system test failed: ${error.message}`,
        details: { error: error.stack }
      };
    }
  }

  /**
   * Start periodic health monitoring
   * @param {number} intervalMs - Monitoring interval in milliseconds
   */
  startMonitoring(intervalMs = 300000) { // Default: 5 minutes
    if (this.isMonitoring) {
      console.warn('Health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.healthCheckInterval = setInterval(async () => {
      try {
        const results = await this.performHealthCheck();
        
        // Log health status
        if (results.overall === 'healthy') {
          console.log('CloudWatch health check: All systems operational');
        } else {
          console.warn('CloudWatch health check:', results.overall, results.errors);
          
          // Log degraded/unhealthy status to CloudWatch if possible
          try {
            await cloudWatchLogger.warn(`CloudWatch health status: ${results.overall}`, {
              type: 'health_monitor',
              results: results
            });
          } catch (logError) {
            console.error('Failed to log health status:', logError);
          }
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, intervalMs);

    console.log(`CloudWatch health monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic health monitoring
   */
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isMonitoring = false;
    console.log('CloudWatch health monitoring stopped');
  }

  /**
   * Get the last health check results
   */
  getLastHealthCheck() {
    return this.lastHealthCheck;
  }

  /**
   * Get a simple health status for external monitoring
   * @returns {Object} Simple status object
   */
  getSimpleStatus() {
    if (!this.lastHealthCheck) {
      return {
        status: 'unknown',
        message: 'No health check performed yet'
      };
    }

    return {
      status: this.lastHealthCheck.overall,
      message: `Last check: ${this.lastHealthCheck.timestamp}`,
      duration: this.lastHealthCheck.duration,
      errors: this.lastHealthCheck.errors
    };
  }
}

// Create a singleton instance
export const healthMonitor = new CloudWatchHealthMonitor();

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  // Start monitoring after a short delay to allow app initialization
  setTimeout(() => {
    healthMonitor.startMonitoring();
  }, 10000); // 10 seconds delay
}

export default healthMonitor;