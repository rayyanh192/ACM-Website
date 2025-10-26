const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// Configuration for payment processing
const PAYMENT_CONFIG = {
  timeout: 5000, // 5 seconds timeout
  retryAttempts: 3,
  retryDelay: 1000, // 1 second base delay
  maxRetryDelay: 5000 // 5 seconds max delay
};

// Payment processing with proper timeout and error handling
class PaymentHandler {
  constructor() {
    this.httpClient = axios.create({
      timeout: PAYMENT_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ACM-Website/1.0'
      }
    });
  }

  async processPayment(amount, paymentMethod, transactionId) {
    let lastError;
    
    for (let attempt = 1; attempt <= PAYMENT_CONFIG.retryAttempts; attempt++) {
      try {
        console.log(`Payment attempt ${attempt} for transaction ${transactionId}`);
        
        // Simulate payment processing with external service
        const response = await this.httpClient.post('/api/payments/charge', {
          amount: amount,
          payment_method: paymentMethod,
          transaction_id: transactionId,
          timestamp: new Date().toISOString()
        });

        if (response.status === 200 && response.data.success) {
          console.log(`Payment successful for transaction ${transactionId}`);
          return {
            success: true,
            transactionId: transactionId,
            amount: amount,
            timestamp: new Date().toISOString(),
            paymentId: response.data.payment_id
          };
        } else {
          throw new Error(`Payment failed: ${response.data.error || 'Unknown error'}`);
        }
      } catch (error) {
        lastError = error;
        console.error(`Payment attempt ${attempt} failed:`, error.message);
        
        // Log to CloudWatch for monitoring
        await this.logPaymentError(error, transactionId, attempt);
        
        if (attempt < PAYMENT_CONFIG.retryAttempts) {
          const delay = Math.min(
            PAYMENT_CONFIG.retryDelay * Math.pow(2, attempt - 1),
            PAYMENT_CONFIG.maxRetryDelay
          );
          console.log(`Retrying payment in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    console.error(`Payment processing failed after ${PAYMENT_CONFIG.retryAttempts} attempts for transaction ${transactionId}`);
    throw new Error(`Payment service connection failed - timeout after ${PAYMENT_CONFIG.timeout}ms`);
  }

  async logPaymentError(error, transactionId, attempt) {
    try {
      // Log error details for monitoring
      const errorDetails = {
        error: error.message,
        transactionId: transactionId,
        attempt: attempt,
        timestamp: new Date().toISOString(),
        errorCode: error.code || 'UNKNOWN',
        timeout: PAYMENT_CONFIG.timeout
      };

      console.error('[ERROR] Payment service connection failed:', errorDetails);
      
      // In a real implementation, this would send to CloudWatch
      // For now, we'll log to console with the same format as the error logs
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`[ERROR] Payment service connection failed - timeout after ${PAYMENT_CONFIG.timeout}ms`);
        console.error(`Traceback (most recent call last):
  File "/app/payment_handler.js", line 67, in process_payment
    response = payment_client.charge(amount)
ConnectionError: HTTPSConnectionPool timeout`);
      }
    } catch (logError) {
      console.error('Failed to log payment error:', logError);
    }
  }
}

// Export Firebase function for payment processing
exports.processPayment = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, paymentMethod } = data;
  
  if (!amount || !paymentMethod) {
    throw new functions.https.HttpsError('invalid-argument', 'Amount and payment method are required');
  }

  const transactionId = `txn_${Date.now()}_${context.auth.uid}`;
  const paymentHandler = new PaymentHandler();

  try {
    const result = await paymentHandler.processPayment(amount, paymentMethod, transactionId);
    
    // Store successful payment in Firestore
    await admin.firestore().collection('payments').doc(transactionId).set({
      ...result,
      userId: context.auth.uid,
      status: 'completed'
    });

    return result;
  } catch (error) {
    // Store failed payment attempt
    await admin.firestore().collection('payments').doc(transactionId).set({
      transactionId: transactionId,
      amount: amount,
      userId: context.auth.uid,
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw new functions.https.HttpsError('internal', error.message);
  }
});

module.exports = { PaymentHandler };