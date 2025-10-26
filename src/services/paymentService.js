/**
 * Payment Service Client
 * Handles payment processing with proper timeout and error handling
 * Addresses the payment service connection timeout errors from the logs
 */

import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class PaymentService {
  constructor() {
    this.baseUrl = process.env.VUE_APP_PAYMENT_SERVICE_URL || 'https://api.payment-service.com';
    this.timeout = parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 5000; // 5000ms as mentioned in error logs
    this.retryAttempts = parseInt(process.env.VUE_APP_PAYMENT_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.VUE_APP_PAYMENT_RETRY_DELAY) || 1000;
    
    // Circuit breaker state
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 5, // Open circuit after 5 consecutive failures
      resetTimeout: 30000 // Reset after 30 seconds
    };
  }

  /**
   * Check if circuit breaker should allow requests
   */
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    // Check if we should reset the circuit breaker
    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    if (timeSinceLastFailure > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failureCount = 0;
      return false;
    }

    return true;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      cloudWatchLogger.error('Payment service circuit breaker opened', {
        type: 'circuit_breaker',
        service: 'payment',
        failureCount: this.circuitBreaker.failureCount
      });
    }
  }

  /**
   * Record a success for circuit breaker
   */
  recordSuccess() {
    this.circuitBreaker.failureCount = 0;
    if (this.circuitBreaker.isOpen) {
      this.circuitBreaker.isOpen = false;
      cloudWatchLogger.info('Payment service circuit breaker closed', {
        type: 'circuit_breaker',
        service: 'payment'
      });
    }
  }

  /**
   * Make HTTP request with timeout and retry logic
   */
  async makeRequest(url, options = {}) {
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Payment service circuit breaker is open');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VUE_APP_PAYMENT_API_KEY}`,
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.recordSuccess();
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Payment service connection failed - timeout after ${this.timeout}ms`);
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      
      throw error;
    }
  }

  /**
   * Process payment with retry logic
   * Matches the error pattern from logs: "response = payment_client.charge(amount)"
   */
  async charge(amount, paymentData = {}) {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await cloudWatchLogger.info('Payment processing started', {
          type: 'payment',
          transactionId,
          amount,
          attempt
        });

        const response = await this.makeRequest(`${this.baseUrl}/charge`, {
          method: 'POST',
          body: JSON.stringify({
            amount,
            transactionId,
            ...paymentData
          })
        });

        const result = await response.json();
        
        await cloudWatchLogger.info('Payment processing completed', {
          type: 'payment',
          transactionId,
          amount,
          status: 'success'
        });

        return {
          success: true,
          transactionId,
          ...result
        };

      } catch (error) {
        this.recordFailure();
        
        await cloudWatchLogger.paymentError(error, transactionId);
        
        // Log the specific error pattern from the logs
        if (error.code === 'TIMEOUT') {
          await cloudWatchLogger.error(`Payment service connection failed - timeout after ${this.timeout}ms`, {
            type: 'payment_timeout',
            transactionId,
            attempt,
            timeout: this.timeout
          });
        }

        // If this is the last attempt, throw the error
        if (attempt === this.retryAttempts) {
          // Create error matching the traceback pattern from logs
          const connectionError = new Error('HTTPSConnectionPool timeout');
          connectionError.code = 'CONNECTION_ERROR';
          connectionError.originalError = error;
          throw connectionError;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }
    }
  }

  /**
   * Refund payment
   */
  async refund(transactionId, amount = null) {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          transactionId,
          amount
        })
      });

      const result = await response.json();
      
      await cloudWatchLogger.info('Payment refund completed', {
        type: 'payment_refund',
        transactionId,
        amount,
        status: 'success'
      });

      return result;

    } catch (error) {
      this.recordFailure();
      await cloudWatchLogger.paymentError(error, transactionId);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getStatus(transactionId) {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/status/${transactionId}`);
      const result = await response.json();
      
      return result;

    } catch (error) {
      this.recordFailure();
      await cloudWatchLogger.paymentError(error, transactionId);
      throw error;
    }
  }

  /**
   * Health check for payment service
   */
  async healthCheck() {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Create singleton instance
const paymentService = new PaymentService();

export { PaymentService };
export default paymentService;