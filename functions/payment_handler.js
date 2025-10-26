/**
 * Payment Handler - JavaScript equivalent of payment_handler.py
 * Handles payment processing with proper timeout and error handling
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { connectionPool } = require("./connection_pool");
const { databaseConfig } = require("./database_config");

// Payment service configuration
const PAYMENT_SERVICE_TIMEOUT = 5000; // 5 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Process payment with timeout and retry logic
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} Payment result
 */
async function processPayment(paymentData) {
  const { amount, currency, paymentMethod, transactionId } = paymentData;
  
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Payment attempt ${attempt} for transaction ${transactionId}`);
      
      // Get database connection from pool
      const dbConnection = await connectionPool.getConnection();
      
      try {
        // Create payment record in database
        await dbConnection.query(
          'INSERT INTO payments (transaction_id, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?)',
          [transactionId, amount, currency, 'processing', new Date()]
        );
        
        // Process payment with external service
        const paymentResponse = await axios.post(
          process.env.PAYMENT_SERVICE_URL || 'https://api.payment-service.com/charge',
          {
            amount,
            currency,
            payment_method: paymentMethod,
            transaction_id: transactionId
          },
          {
            timeout: PAYMENT_SERVICE_TIMEOUT,
            headers: {
              'Authorization': `Bearer ${process.env.PAYMENT_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Update payment status in database
        await dbConnection.query(
          'UPDATE payments SET status = ?, response_data = ?, updated_at = ? WHERE transaction_id = ?',
          ['completed', JSON.stringify(paymentResponse.data), new Date(), transactionId]
        );
        
        console.log(`Payment successful for transaction ${transactionId}`);
        return {
          success: true,
          transactionId,
          paymentId: paymentResponse.data.id,
          status: 'completed'
        };
        
      } finally {
        // Always return connection to pool
        connectionPool.releaseConnection(dbConnection);
      }
      
    } catch (error) {
      lastError = error;
      console.error(`Payment attempt ${attempt} failed for transaction ${transactionId}:`, error.message);
      
      // Log specific error types
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        console.error(`Payment service connection failed - timeout after ${PAYMENT_SERVICE_TIMEOUT}ms`);
      } else if (error.message.includes('connection pool exhausted')) {
        console.error('Database query failed: connection pool exhausted');
      }
      
      // Don't retry on certain errors
      if (error.response && error.response.status === 400) {
        throw new Error(`Payment failed: ${error.response.data.message}`);
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Payment processing failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Firebase function to handle payment processing
 */
exports.processPayment = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      // Validate authentication
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      // Validate input data
      const { amount, currency, paymentMethod } = data;
      if (!amount || !currency || !paymentMethod) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required payment data');
      }
      
      // Generate transaction ID
      const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Process payment
      const result = await processPayment({
        amount,
        currency,
        paymentMethod,
        transactionId,
        userId: context.auth.uid
      });
      
      return result;
      
    } catch (error) {
      console.error('Payment processing error:', error);
      
      // Log to CloudWatch if available
      if (global.cloudWatchLogger) {
        await global.cloudWatchLogger.paymentError(error, data.transactionId);
      }
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', 'Payment processing failed');
    }
  });

/**
 * Health check endpoint for payment service
 */
exports.paymentHealthCheck = functions.https.onRequest(async (req, res) => {
  try {
    // Check database connection
    const dbConnection = await connectionPool.getConnection();
    await dbConnection.query('SELECT 1');
    connectionPool.releaseConnection(dbConnection);
    
    // Check payment service connectivity
    const healthCheck = await axios.get(
      process.env.PAYMENT_SERVICE_HEALTH_URL || 'https://api.payment-service.com/health',
      { timeout: 3000 }
    );
    
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      paymentService: healthCheck.status === 200 ? 'connected' : 'degraded',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = {
  processPayment,
  PAYMENT_SERVICE_TIMEOUT,
  MAX_RETRIES
};