/**
 * Payment Handler - Manages payment processing with proper timeout and retry logic
 * Equivalent to payment_handler.py mentioned in error logs
 */

import { cloudWatchLogger } from './cloudWatchLogger';

class PaymentHandler {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 10000, // Increased from 5000ms to 10000ms
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      maxRetryDelay: config.maxRetryDelay || 5000,
      ...config
    };
    
    this.activeConnections = new Map();
    this.connectionPool = new Set();
    this.maxPoolSize = config.maxPoolSize || 10;
  }

  /**
   * Process payment with improved error handling and timeout management
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment result
   */
  async processPayment(paymentData) {
    const transactionId = this.generateTransactionId();
    
    try {
      await cloudWatchLogger.info('Payment processing started', {
        transactionId,
        amount: paymentData.amount,
        type: 'payment_start'
      });

      // Validate payment data
      this.validatePaymentData(paymentData);

      // Process payment with retry logic
      const result = await this.executePaymentWithRetry(paymentData, transactionId);

      await cloudWatchLogger.info('Payment processed successfully', {
        transactionId,
        amount: paymentData.amount,
        type: 'payment_success'
      });

      return result;

    } catch (error) {
      await cloudWatchLogger.paymentError(error, transactionId);
      
      // Log specific error details for debugging
      if (error.name === 'TimeoutError') {
        await cloudWatchLogger.error(`Payment service connection failed - timeout after ${this.config.timeout}ms`, {
          transactionId,
          errorType: 'timeout',
          timeout: this.config.timeout
        });
      } else if (error.name === 'ConnectionError') {
        await cloudWatchLogger.error(`HTTPSConnectionPool timeout`, {
          transactionId,
          errorType: 'connection_pool',
          activeConnections: this.activeConnections.size
        });
      }
      
      throw error;
    }
  }

  /**
   * Execute payment with retry logic and proper timeout handling
   */
  async executePaymentWithRetry(paymentData, transactionId, attempt = 1) {
    try {
      return await this.executePayment(paymentData, transactionId);
    } catch (error) {
      if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
        const delay = Math.min(
          this.config.retryDelay * Math.pow(2, attempt - 1),
          this.config.maxRetryDelay
        );
        
        await cloudWatchLogger.warn(`Payment attempt ${attempt} failed, retrying in ${delay}ms`, {
          transactionId,
          attempt,
          error: error.message
        });
        
        await this.sleep(delay);
        return this.executePaymentWithRetry(paymentData, transactionId, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Execute the actual payment request with timeout control
   */
  async executePayment(paymentData, transactionId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout);

    try {
      // Simulate payment processing (replace with actual payment gateway integration)
      const response = await this.makePaymentRequest(paymentData, {
        signal: controller.signal,
        timeout: this.config.timeout
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Payment service connection failed - timeout after ${this.config.timeout}ms`);
        timeoutError.name = 'TimeoutError';
        timeoutError.code = 'PAYMENT_TIMEOUT';
        throw timeoutError;
      }
      
      throw error;
    }
  }

  /**
   * Make the actual payment request (to be implemented with specific payment gateway)
   */
  async makePaymentRequest(paymentData, options = {}) {
    // This would be replaced with actual payment gateway integration
    // For now, simulate the request
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      this.activeConnections.set(requestId, {
        startTime: Date.now(),
        transactionId: paymentData.transactionId
      });

      // Simulate network request
      const simulatedDelay = Math.random() * 2000 + 500; // 500-2500ms
      
      const timer = setTimeout(() => {
        this.activeConnections.delete(requestId);
        
        // Simulate occasional failures for testing
        if (Math.random() < 0.1) { // 10% failure rate
          const error = new Error('Payment gateway returned error');
          error.name = 'PaymentGatewayError';
          error.code = 'GATEWAY_ERROR';
          reject(error);
        } else {
          resolve({
            success: true,
            transactionId: paymentData.transactionId,
            amount: paymentData.amount,
            timestamp: new Date().toISOString(),
            gatewayResponse: 'approved'
          });
        }
      }, simulatedDelay);

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          this.activeConnections.delete(requestId);
          const error = new Error('Request aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }
    });
  }

  /**
   * Validate payment data
   */
  validatePaymentData(paymentData) {
    if (!paymentData) {
      throw new Error('Payment data is required');
    }
    
    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new Error('Valid payment amount is required');
    }
    
    if (!paymentData.currency) {
      throw new Error('Currency is required');
    }
    
    // Add more validation as needed
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = ['TimeoutError', 'ConnectionError', 'NetworkError'];
    return retryableErrors.includes(error.name) || 
           (error.code && ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code));
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get connection pool status
   */
  getConnectionStatus() {
    return {
      activeConnections: this.activeConnections.size,
      maxPoolSize: this.maxPoolSize,
      poolUtilization: (this.activeConnections.size / this.maxPoolSize) * 100
    };
  }

  /**
   * Cleanup expired connections
   */
  cleanupConnections() {
    const now = Date.now();
    const maxAge = this.config.timeout * 2; // Cleanup connections older than 2x timeout
    
    for (const [id, connection] of this.activeConnections.entries()) {
      if (now - connection.startTime > maxAge) {
        this.activeConnections.delete(id);
        cloudWatchLogger.warn('Cleaned up expired connection', {
          connectionId: id,
          age: now - connection.startTime
        });
      }
    }
  }
}

// Create singleton instance
export const paymentHandler = new PaymentHandler({
  timeout: 10000, // Increased timeout to prevent the 5000ms timeout error
  retryAttempts: 3,
  retryDelay: 1000,
  maxPoolSize: 10
});

export default PaymentHandler;