/**
 * Service Layer Index - Centralized Export for All Services
 * Provides easy access to all enhanced services and utilities
 */

// Core Services
export { paymentService } from './PaymentService';
export { databaseService } from './DatabaseService';
export { monitoringService } from './MonitoringService';

// HTTP Clients
export { 
  paymentClient, 
  databaseClient, 
  apiClient, 
  EnhancedHttpClient 
} from '../utils/httpClient';

// Configuration
export { serviceConfig } from '../config/serviceConfig';
export { cloudWatchConfig } from '../config/cloudwatch';

// Enhanced CloudWatch Logger
export { cloudWatchLogger } from '../utils/cloudWatchLogger';

// Service Status Constants
export const SERVICE_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown'
};

// Error Types Constants
export const ERROR_TYPES = {
  TIMEOUT: 'timeout',
  CONNECTION: 'connection',
  PAYMENT_TIMEOUT: 'payment_timeout',
  CONNECTION_POOL_EXHAUSTED: 'connection_pool_exhausted',
  HTTPS_CONNECTION_TIMEOUT: 'https_connection_timeout',
  CIRCUIT_BREAKER: 'circuit_breaker',
  RETRY_EXHAUSTED: 'retry_exhausted'
};

// Circuit Breaker States
export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Initialize all services with proper error handling
 * Call this function during application startup
 */
export async function initializeServices() {
  try {
    await cloudWatchLogger.info('Initializing enhanced services', {
      type: 'service_initialization',
      timestamp: new Date().toISOString()
    });

    // Start monitoring service
    monitoringService.startMonitoring();

    await cloudWatchLogger.info('Services initialized successfully', {
      type: 'service_initialization_success',
      services: ['payment', 'database', 'monitoring']
    });

    return { success: true };
  } catch (error) {
    await cloudWatchLogger.error('Service initialization failed', {
      type: 'service_initialization_error',
      error: error.message
    });

    return { success: false, error: error.message };
  }
}

/**
 * Gracefully shutdown all services
 * Call this function during application shutdown
 */
export async function shutdownServices() {
  try {
    await cloudWatchLogger.info('Shutting down services', {
      type: 'service_shutdown'
    });

    // Stop monitoring service
    monitoringService.stopMonitoring();

    await cloudWatchLogger.info('Services shutdown completed', {
      type: 'service_shutdown_success'
    });

    return { success: true };
  } catch (error) {
    await cloudWatchLogger.error('Service shutdown failed', {
      type: 'service_shutdown_error',
      error: error.message
    });

    return { success: false, error: error.message };
  }
}

/**
 * Get overall system health status
 */
export async function getSystemHealth() {
  try {
    return await monitoringService.getSystemMetrics();
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Handle service errors with proper classification and logging
 */
export async function handleServiceError(serviceName, error, operation, context = {}) {
  return await monitoringService.handleServiceError(serviceName, error, operation, context);
}

export default {
  // Services
  paymentService,
  databaseService,
  monitoringService,
  
  // Clients
  paymentClient,
  databaseClient,
  apiClient,
  
  // Configuration
  serviceConfig,
  cloudWatchConfig,
  
  // Logger
  cloudWatchLogger,
  
  // Constants
  SERVICE_STATUS,
  ERROR_TYPES,
  CIRCUIT_BREAKER_STATES,
  
  // Utilities
  initializeServices,
  shutdownServices,
  getSystemHealth,
  handleServiceError
};