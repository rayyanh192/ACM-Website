/**
 * Payment Service with Enhanced Error Handling and Timeout Management
 * Addresses the payment_handler.py timeout issues mentioned in the error logs
 */

import { paymentClient } from '@/utils/httpClient';
import { serviceConfig } from '@/config/serviceConfig';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

class PaymentService {
  constructor() {
    this.client = paymentClient;
    this.config = serviceConfig.payment;
  }

  /**
   * Process payment with enhanced error handling and retry logic
   * Equivalent to the process_payment function mentioned in payment_handler.py line 67
   * @param {Object} paymentData - Payment information
   * @param {number} paymentData.amount - Payment amount
   * @param {string} paymentData.currency - Currency code
   * @param {string} paymentData.paymentMethod - Payment method ID
   * @param {string} paymentData.customerId - Customer ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Payment result
   */
  async processPayment(paymentData, options = {}) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    try {
      // Validate payment data
      this.validatePaymentData(paymentData);

      // Log payment attempt
      await cloudWatchLogger.info('Payment processing started', {
        type: 'payment_start',
        transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        customerId: paymentData.customerId
      });

      // Prepare payment request
      const paymentRequest = {
        transaction_id: transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        payment_method: paymentData.paymentMethod,
        customer_id: paymentData.customerId,
        metadata: {
          source: 'vue_frontend',
          timestamp: new Date().toISOString(),
          ...options.metadata
        }
      };

      // Make payment request with enhanced error handling
      const response = await this.client.post('/charge', paymentRequest, {
        timeout: this.config.timeout,
        headers: {
          'X-Transaction-ID': transactionId,
          'X-Idempotency-Key': this.generateIdempotencyKey(paymentData)
        }
      }, {
        serviceName: 'payment',
        retryOptions: {
          maxRetries: this.config.retryAttempts,
          baseDelay: this.config.retryDelay,
          serviceName: 'payment'
        }
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      // Log successful payment
      await cloudWatchLogger.info('Payment processed successfully', {
        type: 'payment_success',
        transactionId,
        paymentId: result.payment_id,
        amount: paymentData.amount,
        duration,
        status: result.status
      });

      return {
        success: true,
        transactionId,
        paymentId: result.payment_id,
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enhanced error handling based on error type
      const errorInfo = this.classifyPaymentError(error);
      
      await cloudWatchLogger.paymentError(error, transactionId);
      
      // Log detailed error information
      await cloudWatchLogger.error('Payment processing failed', {
        type: 'payment_failure',
        transactionId,
        amount: paymentData.amount,
        duration,
        errorType: errorInfo.type,
        errorCode: errorInfo.code,
        retryable: errorInfo.retryable,
        error: error.message
      });

      // Return structured error response
      return {
        success: false,
        transactionId,
        error: {
          type: errorInfo.type,
          code: errorInfo.code,
          message: errorInfo.userMessage,
          retryable: errorInfo.retryable,
          technicalDetails: error.message
        },
        processingTime: duration
      };
    }
  }

  /**
   * Refund payment with proper error handling
   * @param {string} paymentId - Original payment ID
   * @param {number} amount - Refund amount (optional, defaults to full refund)
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund result
   */
  async refundPayment(paymentId, amount = null, reason = 'Customer request') {
    const refundId = this.generateTransactionId();
    const startTime = Date.now();

    try {
      await cloudWatchLogger.info('Refund processing started', {
        type: 'refund_start',
        refundId,
        paymentId,
        amount,
        reason
      });

      const refundRequest = {
        refund_id: refundId,
        payment_id: paymentId,
        amount: amount,
        reason: reason,
        metadata: {
          source: 'vue_frontend',
          timestamp: new Date().toISOString()
        }
      };

      const response = await this.client.post('/refund', refundRequest, {
        timeout: this.config.timeout,
        headers: {
          'X-Refund-ID': refundId,
          'X-Idempotency-Key': this.generateIdempotencyKey({ paymentId, amount, reason })
        }
      }, {
        serviceName: 'payment',
        retryOptions: {
          maxRetries: this.config.retryAttempts,
          baseDelay: this.config.retryDelay,
          serviceName: 'payment_refund'
        }
      });

      const duration = Date.now() - startTime;
      const result = response.data;

      await cloudWatchLogger.info('Refund processed successfully', {
        type: 'refund_success',
        refundId,
        paymentId,
        amount: result.amount,
        duration,
        status: result.status
      });

      return {
        success: true,
        refundId,
        paymentId,
        status: result.status,
        amount: result.amount,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      await cloudWatchLogger.error('Refund processing failed', {
        type: 'refund_failure',
        refundId,
        paymentId,
        amount,
        duration,
        error: error.message
      });

      return {
        success: false,
        refundId,
        paymentId,
        error: {
          message: 'Refund processing failed',
          technicalDetails: error.message
        },
        processingTime: duration
      };
    }
  }

  /**
   * Get payment status with retry logic
   * @param {string} paymentId - Payment ID to check
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await this.client.get(`/payment/${paymentId}/status`, {
        timeout: this.config.timeout / 2 // Use shorter timeout for status checks
      }, {
        serviceName: 'payment',
        retryOptions: {
          maxRetries: 2, // Fewer retries for status checks
          baseDelay: 500,
          serviceName: 'payment_status'
        }
      });

      return {
        success: true,
        paymentId,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at
      };

    } catch (error) {
      await cloudWatchLogger.error('Payment status check failed', {
        type: 'payment_status_failure',
        paymentId,
        error: error.message
      });

      return {
        success: false,
        paymentId,
        error: {
          message: 'Unable to retrieve payment status',
          technicalDetails: error.message
        }
      };
    }
  }

  /**
   * Health check for payment service
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return await this.client.healthCheck('payment', '/health');
  }

  /**
   * Validate payment data before processing
   * @param {Object} paymentData - Payment data to validate
   * @throws {Error} If validation fails
   */
  validatePaymentData(paymentData) {
    const required = ['amount', 'paymentMethod', 'customerId'];
    const missing = required.filter(field => !paymentData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required payment fields: ${missing.join(', ')}`);
    }

    if (paymentData.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    if (paymentData.amount > 999999.99) {
      throw new Error('Payment amount exceeds maximum limit');
    }
  }

  /**
   * Classify payment errors for better handling
   * @param {Error} error - The error to classify
   * @returns {Object} Error classification
   */
  classifyPaymentError(error) {
    // Timeout errors (matching the original error log)
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        type: 'timeout',
        code: 'PAYMENT_TIMEOUT',
        userMessage: 'Payment processing is taking longer than expected. Please try again.',
        retryable: true
      };
    }

    // Connection errors (matching HTTPSConnectionPool timeout)
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || 
        error.message.includes('HTTPSConnectionPool')) {
      return {
        type: 'connection',
        code: 'PAYMENT_CONNECTION_ERROR',
        userMessage: 'Unable to connect to payment service. Please try again later.',
        retryable: true
      };
    }

    // Server errors
    if (error.response?.status >= 500) {
      return {
        type: 'server_error',
        code: 'PAYMENT_SERVER_ERROR',
        userMessage: 'Payment service is temporarily unavailable. Please try again later.',
        retryable: true
      };
    }

    // Client errors (card declined, insufficient funds, etc.)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return {
        type: 'client_error',
        code: error.response.data?.error_code || 'PAYMENT_CLIENT_ERROR',
        userMessage: error.response.data?.message || 'Payment was declined. Please check your payment information.',
        retryable: false
      };
    }

    // Unknown errors
    return {
      type: 'unknown',
      code: 'PAYMENT_UNKNOWN_ERROR',
      userMessage: 'An unexpected error occurred during payment processing. Please try again.',
      retryable: true
    };
  }

  /**
   * Generate unique transaction ID
   * @returns {string} Transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate idempotency key for duplicate prevention
   * @param {Object} data - Data to generate key from
   * @returns {string} Idempotency key
   */
  generateIdempotencyKey(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `idem_${Math.abs(hash)}_${Date.now()}`;
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
export default paymentService;