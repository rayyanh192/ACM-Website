/**
 * Payment Service
 * Handles payment processing with timeout management, retry logic, and error handling
 */

import { paymentConfig } from '@/config/payment';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

/**
 * Circuit Breaker implementation for payment service resilience
 */
class CircuitBreaker {
  constructor(config) {
    this.failureThreshold = config.failureThreshold;
    this.resetTimeout = config.resetTimeout;
    this.monitoringWindow = config.monitoringWindow;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = [];
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  async execute(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = [];
    this.state = 'CLOSED';
  }

  onFailure() {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Remove failures outside monitoring window
    this.failures = this.failures.filter(
      failureTime => now - failureTime < this.monitoringWindow
    );

    if (this.failures.length >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = now + this.resetTimeout;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures.length,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

/**
 * Payment Service Class
 */
class PaymentService {
  constructor() {
    this.config = paymentConfig;
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    this.activeRequests = new Map();
    
    // Initialize Firebase functions
    this.functions = getFunctions();
    this.auth = getAuth();
    
    // Initialize callable functions
    this.processPaymentFunction = httpsCallable(this.functions, 'processPayment');
    this.validatePaymentFunction = httpsCallable(this.functions, 'validatePayment');
    this.checkPaymentStatusFunction = httpsCallable(this.functions, 'checkPaymentStatus');
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   */
  createTimeoutPromise(timeout, operation = 'Payment operation') {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Execute operation with timeout
   */
  async withTimeout(operation, timeout, operationName = 'Payment operation') {
    const timeoutPromise = this.createTimeoutPromise(timeout, operationName);
    
    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      if (error.message.includes('timed out')) {
        await cloudWatchLogger.paymentError(error, null, {
          operation: operationName,
          timeout: timeout,
          type: 'timeout'
        });
      }
      throw error;
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  async withRetry(operation, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt === this.config.retry.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, attempt - 1),
          this.config.retry.maxDelay
        );

        await cloudWatchLogger.paymentError(error, context.transactionId, {
          attempt,
          maxAttempts: this.config.retry.maxAttempts,
          retryDelay: delay,
          type: 'retry_attempt'
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error should not be retried
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      'invalid',
      'unauthorized',
      'forbidden',
      'not found',
      'bad request',
      'validation'
    ];

    const errorMessage = error.message.toLowerCase();
    return nonRetryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process payment with comprehensive error handling and timeout management
   */
  async processPayment(paymentData) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    try {
      await cloudWatchLogger.info('Payment processing started', {
        transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        provider: paymentData.provider || this.config.providers.default
      });

      const result = await this.circuitBreaker.execute(async () => {
        return await this.withRetry(async () => {
          return await this.withTimeout(
            () => this.executePayment(paymentData, transactionId),
            this.config.timeouts.payment,
            'Payment processing'
          );
        }, { transactionId });
      });

      const processingTime = Date.now() - startTime;
      
      await cloudWatchLogger.info('Payment processed successfully', {
        transactionId,
        processingTime,
        paymentId: result.paymentId,
        status: result.status
      });

      return {
        success: true,
        transactionId,
        paymentId: result.paymentId,
        status: result.status,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await cloudWatchLogger.paymentError(error, transactionId, {
        processingTime,
        amount: paymentData.amount,
        provider: paymentData.provider,
        circuitBreakerState: this.circuitBreaker.getState()
      });

      throw this.formatError(error, transactionId);
    }
  }

  /**
   * Execute the actual payment using Firebase functions
   */
  async executePayment(paymentData, transactionId) {
    try {
      // Check authentication
      if (!this.auth.currentUser) {
        throw new Error('User must be authenticated to process payments');
      }

      // Call Firebase function
      const result = await this.processPaymentFunction({
        ...paymentData,
        transactionId
      });

      return result.data;
    } catch (error) {
      // Handle Firebase function errors
      if (error.code === 'functions/deadline-exceeded') {
        throw new Error('Payment processing timeout - please try again');
      } else if (error.code === 'functions/unauthenticated') {
        throw new Error('Authentication required for payment processing');
      } else if (error.code === 'functions/invalid-argument') {
        throw new Error(`Invalid payment data: ${error.message}`);
      } else if (error.code === 'functions/internal') {
        throw new Error('Payment service temporarily unavailable');
      }
      
      throw error;
    }
  }

  /**
   * Mock payment processing for development/testing
   */
  async mockPaymentProcessing(paymentData, transactionId) {
    // Simulate processing delay
    await this.sleep(this.config.development.mockDelay);

    // Simulate random failures for testing
    if (Math.random() < 0.1) { // 10% failure rate
      throw new Error('Mock payment processing failed - insufficient funds');
    }

    // Simulate timeout scenarios for testing
    if (paymentData.simulateTimeout) {
      await this.sleep(this.config.timeouts.payment + 1000);
    }

    return {
      paymentId: `pay_${transactionId}`,
      status: 'completed',
      amount: paymentData.amount,
      currency: paymentData.currency
    };
  }

  /**
   * Validate payment data with timeout
   */
  async validatePayment(paymentData) {
    const transactionId = this.generateTransactionId();

    try {
      return await this.withTimeout(
        () => this.executeValidation(paymentData, transactionId),
        this.config.timeouts.validation,
        'Payment validation'
      );
    } catch (error) {
      await cloudWatchLogger.paymentError(error, transactionId, {
        operation: 'validation',
        type: 'validation_error'
      });
      throw this.formatError(error, transactionId);
    }
  }

  /**
   * Execute payment validation using Firebase functions
   */
  async executeValidation(paymentData, transactionId) {
    try {
      if (!this.auth.currentUser) {
        throw new Error('User must be authenticated to validate payments');
      }

      const result = await this.validatePaymentFunction({
        ...paymentData,
        transactionId
      });

      return result.data;
    } catch (error) {
      if (error.code === 'functions/deadline-exceeded') {
        throw new Error('Payment validation timeout');
      } else if (error.code === 'functions/unauthenticated') {
        throw new Error('Authentication required for payment validation');
      }
      
      throw error;
    }
  }

  /**
   * Check payment status with timeout
   */
  async checkPaymentStatus(paymentId) {
    try {
      return await this.withTimeout(
        () => this.executeStatusCheck(paymentId),
        this.config.timeouts.statusCheck,
        'Payment status check'
      );
    } catch (error) {
      await cloudWatchLogger.paymentError(error, paymentId, {
        operation: 'status_check',
        type: 'status_check_error'
      });
      throw this.formatError(error, paymentId);
    }
  }

  /**
   * Execute payment status check using Firebase functions
   */
  async executeStatusCheck(paymentId) {
    try {
      if (!this.auth.currentUser) {
        throw new Error('User must be authenticated to check payment status');
      }

      const result = await this.checkPaymentStatusFunction({ paymentId });
      return result.data;
    } catch (error) {
      if (error.code === 'functions/deadline-exceeded') {
        throw new Error('Payment status check timeout');
      } else if (error.code === 'functions/not-found') {
        throw new Error('Payment not found');
      } else if (error.code === 'functions/permission-denied') {
        throw new Error('Access denied to payment information');
      }
      
      throw error;
    }
  }

  /**
   * Process refund with timeout
   */
  async processRefund(paymentId, amount = null) {
    const transactionId = this.generateTransactionId();

    try {
      return await this.withTimeout(
        () => this.executeRefund(paymentId, amount, transactionId),
        this.config.timeouts.refund,
        'Refund processing'
      );
    } catch (error) {
      await cloudWatchLogger.paymentError(error, transactionId, {
        operation: 'refund',
        originalPaymentId: paymentId,
        refundAmount: amount,
        type: 'refund_error'
      });
      throw this.formatError(error, transactionId);
    }
  }

  /**
   * Execute refund processing
   */
  async executeRefund(paymentId, amount, transactionId) {
    if (this.config.development.enableMockPayments) {
      await this.sleep(1000); // Mock refund delay
      return { 
        refundId: `ref_${transactionId}`, 
        status: 'completed',
        amount: amount,
        originalPaymentId: paymentId
      };
    }

    const response = await fetch(this.config.endpoints.refund, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentId, amount, transactionId })
    });

    if (!response.ok) {
      throw new Error(`Refund API returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Format error for user consumption
   */
  formatError(error, transactionId) {
    const isTimeout = error.message.includes('timed out') || 
                     this.config.errors.timeoutErrorCodes.some(code => 
                       error.message.toUpperCase().includes(code));

    if (isTimeout) {
      return {
        type: 'timeout',
        message: this.config.errors.enableUserFriendlyMessages 
          ? 'Payment processing is taking longer than expected. Please try again.'
          : error.message,
        transactionId,
        originalError: this.config.development.enableVerboseLogging ? error.message : undefined
      };
    }

    return {
      type: 'error',
      message: this.config.errors.enableUserFriendlyMessages 
        ? 'Payment processing failed. Please check your payment details and try again.'
        : error.message,
      transactionId,
      originalError: this.config.development.enableVerboseLogging ? error.message : undefined
    };
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      activeRequests: this.activeRequests.size,
      config: {
        timeouts: this.config.timeouts,
        retry: this.config.retry,
        provider: this.config.providers.default
      }
    };
  }
}

// Create singleton instance
const paymentService = new PaymentService();

export default paymentService;
export { PaymentService };