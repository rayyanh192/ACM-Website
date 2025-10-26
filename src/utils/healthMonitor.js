/**
 * Health Monitor for Application Monitoring and Error Reporting
 * Provides health checks, connectivity validation, and fallback error reporting
 */

import AWS from 'aws-sdk';
import { cloudWatchConfig, validateCloudWatchConfig, getSafeConfig } from '../config/cloudwatch';

class HealthMonitor {
  constructor() {
    this.healthStatus = {
      cloudWatch: 'unknown',
      lastCheck: null,
      errors: [],
      warnings: []
    };
    this.fallbackErrors = [];
    this.maxFallbackErrors = 100;
    this.healthCheckInterval = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the health monitor
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('🏥 Initializing Health Monitor...');
    
    // Validate configuration
    const configValidation = validateCloudWatchConfig();
    this.healthStatus.configValidation = configValidation;

    if (configValidation.isValid) {
      // Test CloudWatch connectivity
      await this.checkCloudWatchHealth();
      
      // Start periodic health checks (every 5 minutes)
      this.startPeriodicHealthChecks();
    } else {
      console.warn('⚠️ CloudWatch configuration invalid, running in fallback mode');
      this.healthStatus.cloudWatch = 'disabled';
    }

    this.isInitialized = true;
    this.reportHealthStatus();
  }

  /**
   * Check CloudWatch connectivity and permissions
   */
  async checkCloudWatchHealth() {
    try {
      const logs = new AWS.CloudWatchLogs({
        region: cloudWatchConfig.region,
        accessKeyId: cloudWatchConfig.accessKeyId,
        secretAccessKey: cloudWatchConfig.secretAccessKey
      });

      // Test 1: Check if we can describe log groups
      await logs.describeLogGroups({
        logGroupNamePrefix: cloudWatchConfig.logGroupName,
        limit: 1
      }).promise();

      // Test 2: Try to put a test log event
      const testMessage = `Health check - ${new Date().toISOString()}`;
      await logs.putLogEvents({
        logGroupName: cloudWatchConfig.logGroupName,
        logStreamName: 'health-check-stream',
        logEvents: [{
          timestamp: Date.now(),
          message: testMessage
        }]
      }).promise();

      this.healthStatus.cloudWatch = 'healthy';
      this.healthStatus.lastCheck = new Date().toISOString();
      this.healthStatus.errors = [];
      
      console.log('✅ CloudWatch health check passed');
      return true;

    } catch (error) {
      this.healthStatus.cloudWatch = 'unhealthy';
      this.healthStatus.lastCheck = new Date().toISOString();
      this.healthStatus.errors = [error.message];
      
      console.error('❌ CloudWatch health check failed:', error.message);
      
      // Log to fallback system
      this.logToFallback('CloudWatch health check failed', {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
      
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      await this.checkCloudWatchHealth();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Log error to fallback system when CloudWatch is unavailable
   */
  logToFallback(message, context = {}) {
    const fallbackEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: message,
      context: context,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Add to fallback array
    this.fallbackErrors.push(fallbackEntry);

    // Keep only the most recent errors
    if (this.fallbackErrors.length > this.maxFallbackErrors) {
      this.fallbackErrors = this.fallbackErrors.slice(-this.maxFallbackErrors);
    }

    // Log to console as backup
    console.error('📝 Fallback Error Log:', fallbackEntry);

    // Try to send to server endpoint if available
    this.sendToServerFallback(fallbackEntry);
  }

  /**
   * Send error to server-side logging endpoint
   */
  async sendToServerFallback(errorEntry) {
    try {
      await fetch('/api/log-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorEntry)
      });
    } catch (error) {
      // Server fallback failed, just log to console
      console.warn('Server fallback logging failed:', error.message);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      ...this.healthStatus,
      fallbackErrorCount: this.fallbackErrors.length,
      isInitialized: this.isInitialized,
      config: getSafeConfig()
    };
  }

  /**
   * Get fallback errors
   */
  getFallbackErrors() {
    return [...this.fallbackErrors];
  }

  /**
   * Clear fallback errors
   */
  clearFallbackErrors() {
    this.fallbackErrors = [];
  }

  /**
   * Report health status to monitoring systems
   */
  reportHealthStatus() {
    const status = this.getHealthStatus();
    
    console.log('🏥 Health Monitor Status:', {
      cloudWatch: status.cloudWatch,
      configValid: status.configValidation?.isValid,
      lastCheck: status.lastCheck,
      fallbackErrors: status.fallbackErrorCount,
      config: status.config
    });

    // Send heartbeat to monitoring endpoint
    this.sendHeartbeat(status);
  }

  /**
   * Send heartbeat to monitoring systems
   */
  async sendHeartbeat(status) {
    try {
      await fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'acm-website',
          status: status.cloudWatch,
          details: {
            cloudWatchHealth: status.cloudWatch,
            configValid: status.configValidation?.isValid,
            fallbackErrorCount: status.fallbackErrorCount,
            lastHealthCheck: status.lastCheck
          }
        })
      });
    } catch (error) {
      console.warn('Failed to send heartbeat:', error.message);
    }
  }

  /**
   * Test all monitoring systems
   */
  async runDiagnostics() {
    console.log('🔍 Running comprehensive diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      config: getSafeConfig(),
      configValidation: validateCloudWatchConfig(),
      cloudWatchHealth: null,
      fallbackSystem: {
        errorCount: this.fallbackErrors.length,
        working: true
      },
      serverEndpoints: {
        heartbeat: null,
        errorLogging: null
      }
    };

    // Test CloudWatch
    diagnostics.cloudWatchHealth = await this.checkCloudWatchHealth();

    // Test server endpoints
    try {
      const heartbeatResponse = await fetch('/api/heartbeat', { method: 'POST' });
      diagnostics.serverEndpoints.heartbeat = heartbeatResponse.ok;
    } catch (error) {
      diagnostics.serverEndpoints.heartbeat = false;
    }

    try {
      const errorLogResponse = await fetch('/api/log-error', { method: 'POST' });
      diagnostics.serverEndpoints.errorLogging = errorLogResponse.ok;
    } catch (error) {
      diagnostics.serverEndpoints.errorLogging = false;
    }

    console.log('🔍 Diagnostics Results:', diagnostics);
    return diagnostics;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopPeriodicHealthChecks();
    this.clearFallbackErrors();
    this.isInitialized = false;
  }
}

// Create singleton instance
export const healthMonitor = new HealthMonitor();

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  // Initialize after a short delay to allow other systems to load
  setTimeout(() => {
    healthMonitor.initialize().catch(error => {
      console.error('Failed to initialize health monitor:', error);
    });
  }, 1000);
}

export default healthMonitor;