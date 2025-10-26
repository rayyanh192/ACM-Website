/**
 * Payment Service Handler
 * Addresses payment service connection timeouts and implements circuit breaker pattern
 */

import httpClient from './httpClient.js';
import { cloudWatchLogger } from './cloudWatchLogger.js';

class PaymentService {
  constructor() {
    this.baseUrl = process.env.VUE_APP_PAYMENT_SERVICE_URL || 'https://api.payment-service.com';
    this.timeout = parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 15000; // 15 seconds for payments
    this.circuitBreakerThreshold = 5; // Number of failures before opening circuit
    this.circuitBreakerTimeout = 30000; // 30 seconds before trying again
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  /**
   * Check if circuit breaker allows requests
   * @returns {boolean} - Whether requests are allowed
   */
  isCircuitOpen() {
    if (this.circuitState === 'CLOSED') {
      return false;
    }

    if (this.circuitState === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.circuitBreakerTimeout) {
        this.circuitState = 'HALF_OPEN';
        return false;
      }
      return true;
    }

    // HALF_OPEN state allows one request to test the service
    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    this.failureCount = 0;
    this.circuitState = 'CLOSED';
    this.lastFailureTime = null;
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.circuitBreakerThreshold) {
      this.circuitState = 'OPEN';
      console.warn(`Payment service circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Process a payment with timeout and retry logic
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} - Payment result
   */
  async processPayment(paymentData) {
    if (this.isCircuitOpen()) {
      const error = new Error('Payment service circuit breaker is open - service temporarily unavailable');
      await cloudWatchLogger.paymentError(error, paymentData.transactionId);
      throw error;
    }

    try {
      const startTime = Date.now();
      
      // Log payment attempt
      await cloudWatchLogger.info('Payment processing started', {
        transactionId: paymentData.transactionId,
        amount: paymentData.amount,
        timeout: this.timeout
      });

      const response = await httpClient.post(
        `${this.baseUrl}/charge`,
        paymentData,
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${process.env.VUE_APP_PAYMENT_API_KEY}`,
            'X-Request-ID': paymentData.transactionId
          }
        }
      );

      const result = await response.json();
      const processingTime = Date.now() - startTime;

      // Record success
      this.recordSuccess();

      // Log successful payment
      await cloudWatchLogger.info('Payment processed successfully', {
        transactionId: paymentData.transactionId,
        amount: paymentData.amount,
        processingTime,
        paymentId: result.paymentId
      });

      return result;

    } catch (error) {
      this.recordFailure();
      
      // Enhanced error logging with specific error types
      const errorContext = {
        transactionId: paymentData.transactionId,
        amount: paymentData.amount,
        circuitState: this.circuitState,
        failureCount: this.failureCount,
        timeout: this.timeout
      };

      if (error.message.includes('timeout')) {
        errorContext.errorType = 'TIMEOUT';
        await cloudWatchLogger.paymentError(
          new Error(`Payment service connection failed - timeout after ${this.timeout}ms`),
          paymentData.transactionId
        );
      } else if (error.message.includes('Connection pool exhausted')) {
        errorContext.errorType = 'CONNECTION_POOL_EXHAUSTED';
        await cloudWatchLogger.paymentError(
          new Error('Payment service connection pool exhausted'),
          paymentData.transactionId
        );
      } else {
        errorContext.errorType = 'GENERAL_ERROR';
        await cloudWatchLogger.paymentError(error, paymentData.transactionId);
      }

      // Log additional context
      await cloudWatchLogger.error('Payment processing failed', errorContext);

      throw error;
    }
  }

  /**
   * Refund a payment with timeout handling
   * @param {string} paymentId - Payment ID to refund
   * @param {number} amount - Refund amount
   * @returns {Promise<Object>} - Refund result
   */
  async refundPayment(paymentId, amount) {
    if (this.isCircuitOpen()) {
      const error = new Error('Payment service circuit breaker is open - refund temporarily unavailable');
      await cloudWatchLogger.paymentError(error, paymentId);
      throw error;
    }

    try {
      const response = await httpClient.post(
        `${this.baseUrl}/refund`,
        { paymentId, amount },
        {
          timeout: this.timeout,
          headers: {
            'Authorization': `Bearer ${process.env.VUE_APP_PAYMENT_API_KEY}`,
            'X-Request-ID': `refund-${paymentId}-${Date.now()}`
          }
        }
      );

      const result = await response.json();
      this.recordSuccess();

      await cloudWatchLogger.info('Payment refunded successfully', {
        paymentId,
        refundAmount: amount,
        refundId: result.refundId
      });

      return result;

    } catch (error) {
      this.recordFailure();
      await cloudWatchLogger.paymentError(error, paymentId);
      throw error;
    }
  }

  /**
   * Check payment status with timeout handling
   * @param {string} paymentId - Payment ID to check
   * @returns {Promise<Object>} - Payment status
   */
  async getPaymentStatus(paymentId) {
    if (this.isCircuitOpen()) {
      const error = new Error('Payment service circuit breaker is open - status check temporarily unavailable');
      await cloudWatchLogger.paymentError(error, paymentId);
      throw error;
    }

    try {
      const response = await httpClient.get(
        `${this.baseUrl}/payment/${paymentId}`,
        {
          timeout: 5000, // Shorter timeout for status checks
          headers: {
            'Authorization': `Bearer ${process.env.VUE_APP_PAYMENT_API_KEY}`
          }
        }
      );

      const result = await response.json();
      this.recordSuccess();

      return result;

    } catch (error) {
      this.recordFailure();
      await cloudWatchLogger.paymentError(error, paymentId);
      throw error;
    }
  }

  /**
   * Health check for payment service
   * @returns {Promise<Object>} - Service health status
   */
  async healthCheck() {
    try {
      const response = await httpClient.get(
        `${this.baseUrl}/health`,
        { timeout: 3000 } // Short timeout for health checks
      );

      const result = await response.json();
      
      await cloudWatchLogger.info('Payment service health check passed', {
        status: result.status,
        responseTime: result.responseTime
      });

      return result;

    } catch (error) {
      await cloudWatchLogger.error('Payment service health check failed', {
        error: error.message,
        circuitState: this.circuitState
      });
      throw error;
    }
  }

  /**
   * Get circuit breaker status
   * @returns {Object} - Circuit breaker information
   */
  getCircuitStatus() {
    return {
      state: this.circuitState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      threshold: this.circuitBreakerThreshold
    };
  }
}

// Create singleton instance
const paymentService = new PaymentService();

export { PaymentService };
export default paymentService;