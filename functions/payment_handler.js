/**
 * Payment Handler
 * Addresses "Payment service connection failed - timeout after 5000ms" errors
 * Implements proper timeout handling and retry logic for payment processing
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const Stripe = require("stripe");

// Payment service configuration
const paymentConfig = {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    timeout: parseInt(process.env.STRIPE_TIMEOUT) || 30000,
    retries: parseInt(process.env.STRIPE_RETRIES) || 3
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    environment: process.env.PAYPAL_ENVIRONMENT || "sandbox",
    timeout: parseInt(process.env.PAYPAL_TIMEOUT) || 30000,
    retries: parseInt(process.env.PAYPAL_RETRIES) || 3
  },
  general: {
    defaultTimeout: parseInt(process.env.PAYMENT_DEFAULT_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.PAYMENT_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.PAYMENT_RETRY_DELAY) || 1000
  }
};

// Initialize Stripe if configured
let stripe = null;
if (paymentConfig.stripe.secretKey) {
  stripe = new Stripe(paymentConfig.stripe.secretKey, {
    timeout: paymentConfig.stripe.timeout,
    maxNetworkRetries: paymentConfig.stripe.retries
  });
}

/**
 * HTTP client with timeout and retry configuration
 */
const httpClient = axios.create({
  timeout: paymentConfig.general.defaultTimeout,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'ACM-Website-Payment-Handler/1.0'
  }
});

// Add request interceptor for logging
httpClient.interceptors.request.use(
  (config) => {
    console.log(`Payment API request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Payment API request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
httpClient.interceptors.response.use(
  (response) => {
    console.log(`Payment API response: ${response.status} ${response.statusText}`);
    return response;
  },
  (error) => {
    console.error('Payment API response error:', error.message);
    
    // Log to CloudWatch if available
    if (global.cloudWatchLogger) {
      global.cloudWatchLogger.apiError(error, error.config?.url || 'unknown');
    }
    
    return Promise.reject(error);
  }
);

/**
 * Retry wrapper for payment operations
 */
async function retryPaymentOperation(operation, maxRetries = paymentConfig.general.maxRetries) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Payment operation attempt ${attempt} failed:`, error.message);
      
      // Don't retry on certain error types
      if (error.type === 'card_error' || error.code === 'payment_intent_authentication_failure') {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = paymentConfig.general.retryDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying payment operation in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Log final failure to CloudWatch
  if (global.cloudWatchLogger) {
    await global.cloudWatchLogger.paymentError(lastError, 'retry_exhausted');
  }
  
  throw lastError;
}

/**
 * Process payment with Stripe
 * Addresses the timeout issues mentioned in error logs
 */
async function processStripePayment(paymentData) {
  if (!stripe) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
  }

  const { amount, currency = 'usd', paymentMethodId, customerId, description } = paymentData;

  try {
    const paymentIntent = await retryPaymentOperation(async () => {
      return await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        payment_method: paymentMethodId,
        customer: customerId,
        description,
        confirmation_method: 'manual',
        confirm: true,
        return_url: process.env.STRIPE_RETURN_URL || 'https://acm.scu.edu/payment/return'
      });
    });

    // Log successful payment
    console.log(`Stripe payment successful: ${paymentIntent.id}`);
    
    // Store payment record in Firestore
    await admin.firestore().collection('payments').add({
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      status: paymentIntent.status,
      customerId,
      description,
      provider: 'stripe',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      paymentId: paymentIntent.id,
      status: paymentIntent.status,
      amount,
      currency
    };

  } catch (error) {
    console.error('Stripe payment failed:', error);
    
    // Log to CloudWatch
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.paymentError(error, paymentIntent?.id || 'unknown');
    }
    
    // Store failed payment record
    try {
      await admin.firestore().collection('payment_failures').add({
        amount,
        currency,
        customerId,
        description,
        provider: 'stripe',
        error: error.message,
        errorCode: error.code,
        errorType: error.type,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (dbError) {
      console.error('Failed to store payment failure record:', dbError);
    }

    throw new functions.https.HttpsError('internal', `Payment processing failed: ${error.message}`);
  }
}

/**
 * Process payment with PayPal
 */
async function processPayPalPayment(paymentData) {
  const { amount, currency = 'USD', orderId, description } = paymentData;

  try {
    // Get PayPal access token
    const tokenResponse = await retryPaymentOperation(async () => {
      return await httpClient.post(`https://api-m.${paymentConfig.paypal.environment}.paypal.com/v1/oauth2/token`, 
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: paymentConfig.paypal.clientId,
            password: paymentConfig.paypal.clientSecret
          },
          timeout: paymentConfig.paypal.timeout
        }
      );
    });

    const accessToken = tokenResponse.data.access_token;

    // Capture the payment
    const captureResponse = await retryPaymentOperation(async () => {
      return await httpClient.post(
        `https://api-m.${paymentConfig.paypal.environment}.paypal.com/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: paymentConfig.paypal.timeout
        }
      );
    });

    const captureData = captureResponse.data;
    
    // Log successful payment
    console.log(`PayPal payment successful: ${orderId}`);
    
    // Store payment record in Firestore
    await admin.firestore().collection('payments').add({
      orderId,
      amount,
      currency,
      status: captureData.status,
      description,
      provider: 'paypal',
      captureId: captureData.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      paymentId: orderId,
      captureId: captureData.id,
      status: captureData.status,
      amount,
      currency
    };

  } catch (error) {
    console.error('PayPal payment failed:', error);
    
    // Log to CloudWatch
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.paymentError(error, orderId || 'unknown');
    }
    
    // Store failed payment record
    try {
      await admin.firestore().collection('payment_failures').add({
        orderId,
        amount,
        currency,
        description,
        provider: 'paypal',
        error: error.message,
        errorCode: error.response?.status,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (dbError) {
      console.error('Failed to store payment failure record:', dbError);
    }

    throw new functions.https.HttpsError('internal', `PayPal payment processing failed: ${error.message}`);
  }
}

/**
 * Generic payment processor that handles different providers
 * This is the main function that addresses the timeout issues in the error logs
 */
async function processPayment(paymentData) {
  const { provider = 'stripe', ...data } = paymentData;

  // Validate required fields
  if (!data.amount || data.amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amount');
  }

  try {
    let result;
    
    switch (provider.toLowerCase()) {
      case 'stripe':
        result = await processStripePayment(data);
        break;
      case 'paypal':
        result = await processPayPalPayment(data);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', `Unsupported payment provider: ${provider}`);
    }

    // Log successful payment to CloudWatch
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.info(`Payment processed successfully`, {
        provider,
        paymentId: result.paymentId,
        amount: result.amount,
        currency: result.currency
      });
    }

    return result;

  } catch (error) {
    // This addresses the specific error mentioned in the logs:
    // "Payment service connection failed - timeout after 5000ms"
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      const timeoutError = new Error(`Payment service connection failed - timeout after ${paymentConfig.general.defaultTimeout}ms`);
      
      if (global.cloudWatchLogger) {
        await global.cloudWatchLogger.paymentError(timeoutError, data.paymentMethodId || data.orderId || 'unknown');
      }
      
      throw new functions.https.HttpsError('deadline-exceeded', timeoutError.message);
    }

    throw error;
  }
}

/**
 * Refund payment
 */
async function refundPayment(refundData) {
  const { paymentId, amount, reason, provider = 'stripe' } = refundData;

  try {
    let result;

    switch (provider.toLowerCase()) {
      case 'stripe':
        if (!stripe) {
          throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
        }
        
        result = await retryPaymentOperation(async () => {
          return await stripe.refunds.create({
            payment_intent: paymentId,
            amount: amount ? Math.round(amount * 100) : undefined,
            reason: reason || 'requested_by_customer'
          });
        });
        break;
        
      default:
        throw new functions.https.HttpsError('invalid-argument', `Refund not supported for provider: ${provider}`);
    }

    // Store refund record
    await admin.firestore().collection('refunds').add({
      paymentId,
      refundId: result.id,
      amount: result.amount / 100,
      currency: result.currency,
      status: result.status,
      reason,
      provider,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      refundId: result.id,
      amount: result.amount / 100,
      currency: result.currency,
      status: result.status
    };

  } catch (error) {
    console.error('Refund failed:', error);
    
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.paymentError(error, paymentId);
    }
    
    throw new functions.https.HttpsError('internal', `Refund processing failed: ${error.message}`);
  }
}

/**
 * Get payment status
 */
async function getPaymentStatus(paymentId, provider = 'stripe') {
  try {
    let paymentData;

    switch (provider.toLowerCase()) {
      case 'stripe':
        if (!stripe) {
          throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
        }
        paymentData = await stripe.paymentIntents.retrieve(paymentId);
        break;
        
      default:
        throw new functions.https.HttpsError('invalid-argument', `Status check not supported for provider: ${provider}`);
    }

    return {
      paymentId,
      status: paymentData.status,
      amount: paymentData.amount / 100,
      currency: paymentData.currency,
      provider
    };

  } catch (error) {
    console.error('Payment status check failed:', error);
    
    if (global.cloudWatchLogger) {
      await global.cloudWatchLogger.paymentError(error, paymentId);
    }
    
    throw new functions.https.HttpsError('internal', `Payment status check failed: ${error.message}`);
  }
}

module.exports = {
  processPayment,
  refundPayment,
  getPaymentStatus,
  processStripePayment,
  processPayPalPayment,
  paymentConfig
};