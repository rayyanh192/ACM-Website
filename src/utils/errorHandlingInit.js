/**
 * Error Handling Initialization
 * Initializes all error handling and monitoring services
 */

import { cloudWatchLogger } from './cloudWatchLogger';
import { systemHealthMonitor } from './systemHealthMonitor';

/**
 * Initialize error handling and monitoring systems
 */
export async function initializeErrorHandling() {
  try {
    // Log initialization start
    await cloudWatchLogger.info('Initializing error handling systems', {
      type: 'system_initialization',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });

    // Start system health monitoring
    systemHealthMonitor.start();

    // Set up global error handlers
    setupGlobalErrorHandlers();

    // Set up unhandled promise rejection handler
    setupUnhandledRejectionHandler();

    // Log successful initialization
    await cloudWatchLogger.info('Error handling systems initialized successfully', {
      type: 'system_initialization_success',
      healthMonitorRunning: systemHealthMonitor.isRunning
    });

    console.log('✅ Error handling and monitoring systems initialized');

  } catch (error) {
    console.error('❌ Failed to initialize error handling systems:', error);
    
    // Try to log the initialization error
    try {
      await cloudWatchLogger.error('Failed to initialize error handling systems', {
        type: 'system_initialization_error',
        error: error.message,
        stack: error.stack
      });
    } catch (logError) {
      console.error('Failed to log initialization error:', logError);
    }
  }
}

/**
 * Set up global error handler for uncaught JavaScript errors
 */
function setupGlobalErrorHandlers() {
  window.addEventListener('error', async (event) => {
    try {
      await cloudWatchLogger.error('Uncaught JavaScript error', {
        type: 'uncaught_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent
      });
    } catch (logError) {
      console.error('Failed to log uncaught error:', logError);
    }
  });

  console.log('✅ Global error handler set up');
}

/**
 * Set up handler for unhandled promise rejections
 */
function setupUnhandledRejectionHandler() {
  window.addEventListener('unhandledrejection', async (event) => {
    try {
      await cloudWatchLogger.error('Unhandled promise rejection', {
        type: 'unhandled_rejection',
        reason: event.reason?.message || event.reason,
        stack: event.reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent
      });
    } catch (logError) {
      console.error('Failed to log unhandled rejection:', logError);
    }
  });

  console.log('✅ Unhandled rejection handler set up');
}

/**
 * Cleanup function to stop monitoring when app is destroyed
 */
export function cleanupErrorHandling() {
  try {
    systemHealthMonitor.stop();
    
    cloudWatchLogger.info('Error handling systems cleaned up', {
      type: 'system_cleanup'
    });

    console.log('✅ Error handling systems cleaned up');
  } catch (error) {
    console.error('❌ Failed to cleanup error handling systems:', error);
  }
}

/**
 * Get current system status
 */
export function getSystemStatus() {
  return {
    healthMonitor: systemHealthMonitor.getHealthStatus(),
    metrics: systemHealthMonitor.getMetrics(),
    timestamp: new Date().toISOString()
  };
}

export default {
  initializeErrorHandling,
  cleanupErrorHandling,
  getSystemStatus
};