/**
 * Payment Service with enhanced error handling and retry logic
 * Addresses the payment service connection timeout issues from the error logs
 */

import { paymentClient } from '../utils/httpClient';
import { cloudWatchLogger } from '../utils/cloudWatchLogger';

// Payment service configuration
const PAYMENT_CONFIG = {
  baseUrl: process.env.VUE_APP_PAYMENT_SERVICE_URL || 'https://api.payment-service.com',
  apiKey: process.env.VUE_APP_PAYMENT_API_KEY,
  version: 'v1'
};

/**
 * Payment processing errors
 */
export class PaymentError extends Error {
  constructor(message, code, transactionId = null, originalError = null) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.transactionId = transactionId;
    this.originalError = originalError;
  }
}

/**
 * Payment Service class with enhanced error handling
 */
export class PaymentService {
  constructor() {
    this.client = paymentClient;
    this.baseUrl = PAYMENT_CONFIG.baseUrl;
  }

  /**
   * Process a payment with retry logic and proper error handling
   * This addresses the "Payment service connection failed - timeout after 5000ms" error
   */
  async processPayment(paymentData) {
    const transactionId = this.generateTransactionId();
    
    try {
      await cloudWatchLogger.info('Starting payment processing', {
        type: 'payment_start',
        transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD'
      });

      // Validate payment data
      this.validatePaymentData(paymentData);

      // Prepare payment request
      const paymentRequest = {
        ...paymentData,
        transactionId,
        timestamp: new Date().toISOString(),
        source: 'web_frontend'
      };

      // Make payment request with retry logic
      const response = await this.client.post(
        `${this.baseUrl}/${PAYMENT_CONFIG.version}/payments`,
        paymentRequest,
        {
          headers: {
            'Authorization': `Bearer ${PAYMENT_CONFIG.apiKey}`,
            'X-Transaction-ID': transactionId
          }
        }
      );

      const result = await response.json();

      await cloudWatchLogger.info('Payment processing successful', {
        type: 'payment_success',
        transactionId,
        paymentId: result.paymentId,
        amount: paymentData.amount,
        status: result.status
      });

      return {
        success: true,
        transactionId,
        paymentId: result.paymentId,
        status: result.status,
        message: 'Payment processed successfully'
      };

    } catch (error) {
      // Enhanced error handling for different types of payment failures
      return this.handlePaymentError(error, transactionId, paymentData);
    }
  }

  /**
   * Handle payment errors with detailed logging and user-friendly messages
   */
  async handlePaymentError(error, transactionId, paymentData) {
    let errorCode = 'UNKNOWN_ERROR';
    let userMessage = 'Payment processing failed. Please try again.';
    
    // Categorize the error
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      errorCode = 'TIMEOUT_ERROR';
      userMessage = 'Payment service is currently slow. Please try again in a moment.';
    } else if (error.message.includes('connection') || error.message.includes('network')) {
      errorCode = 'CONNECTION_ERROR';
      userMessage = 'Unable to connect to payment service. Please check your connection and try again.';
    } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
      errorCode = 'AUTH_ERROR';
      userMessage = 'Payment authorization failed. Please contact support.';
    } else if (error.message.includes('400') || error.message.includes('bad request')) {
      errorCode = 'VALIDATION_ERROR';
      userMessage = 'Invalid payment information. Please check your details and try again.';
    } else if (error.message.includes('500') || error.message.includes('internal server')) {
      errorCode = 'SERVER_ERROR';
      userMessage = 'Payment service is temporarily unavailable. Please try again later.';
    }

    // Log detailed error information
    await cloudWatchLogger.paymentError(error, transactionId);
    
    // Additional context logging
    await cloudWatchLogger.error('Payment processing failed with details', {
      type: 'payment_failure',
      transactionId,
      errorCode,
      amount: paymentData.amount,
      currency: paymentData.currency || 'USD',
      errorMessage: error.message,
      isTimeout: error.name === 'TimeoutError' || error.message.includes('timeout'),
      isConnectionError: error.message.includes('connection') || error.message.includes('network'),
      circuitBreakerStatus: this.client.getCircuitBreakerStatus()
    });

    return {
      success: false,
      transactionId,
      errorCode,
      message: userMessage,
      technicalError: error.message
    };
  }

  /**
   * Validate payment data before processing
   */
  validatePaymentData(paymentData) {
    const required = ['amount', 'currency', 'paymentMethod'];
    const missing = required.filter(field => !paymentData[field]);
    
    if (missing.length > 0) {
      throw new PaymentError(
        `Missing required fields: ${missing.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    if (paymentData.amount <= 0) {
      throw new PaymentError('Amount must be greater than zero', 'VALIDATION_ERROR');
    }

    if (typeof paymentData.amount !== 'number') {
      throw new PaymentError('Amount must be a number', 'VALIDATION_ERROR');
    }
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `txn_${timestamp}_${random}`;
  }

  /**
   * Get payment status with retry logic
   */
  async getPaymentStatus(transactionId) {
    try {
      const response = await this.client.get(
        `${this.baseUrl}/${PAYMENT_CONFIG.version}/payments/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYMENT_CONFIG.apiKey}`
          }
        }
      );

      const result = await response.json();
      
      await cloudWatchLogger.info('Payment status retrieved', {
        type: 'payment_status_check',
        transactionId,
        status: result.status
      });

      return result;

    } catch (error) {
      await cloudWatchLogger.error('Failed to get payment status', {
        type: 'payment_status_error',
        transactionId,
        error: error.message
      });
      
      throw new PaymentError(
        'Unable to retrieve payment status',
        'STATUS_CHECK_ERROR',
        transactionId,
        error
      );
    }
  }

  /**
   * Refund a payment with proper error handling
   */
  async refundPayment(transactionId, amount = null, reason = 'Customer request') {
    try {
      const refundData = {
        transactionId,
        amount,
        reason,
        timestamp: new Date().toISOString()
      };

      const response = await this.client.post(
        `${this.baseUrl}/${PAYMENT_CONFIG.version}/refunds`,
        refundData,
        {
          headers: {
            'Authorization': `Bearer ${PAYMENT_CONFIG.apiKey}`,
            'X-Transaction-ID': transactionId
          }
        }
      );

      const result = await response.json();

      await cloudWatchLogger.info('Refund processed successfully', {
        type: 'refund_success',
        transactionId,
        refundId: result.refundId,
        amount: amount || 'full'
      });

      return {
        success: true,
        refundId: result.refundId,
        status: result.status,
        message: 'Refund processed successfully'
      };

    } catch (error) {
      await cloudWatchLogger.error('Refund processing failed', {
        type: 'refund_error',
        transactionId,
        error: error.message
      });

      throw new PaymentError(
        'Refund processing failed',
        'REFUND_ERROR',
        transactionId,
        error
      );
    }
  }

  /**
   * Health check for payment service
   */
  async healthCheck() {
    try {
      const response = await this.client.get(
        `${this.baseUrl}/health`,
        {
          headers: {
            'Authorization': `Bearer ${PAYMENT_CONFIG.apiKey}`
          }
        }
      );

      const result = await response.json();
      
      return {
        status: 'healthy',
        service: 'payment',
        timestamp: new Date().toISOString(),
        details: result
      };

    } catch (error) {
      await cloudWatchLogger.error('Payment service health check failed', {
        type: 'health_check_error',
        service: 'payment',
        error: error.message
      });

      return {
        status: 'unhealthy',
        service: 'payment',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();

export default paymentService;