<template>
  <div class="payment-handler">
    <v-card>
      <v-card-title>Payment Processing</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="processPayment">
          <v-text-field
            v-model="paymentData.amount"
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            required
            :disabled="processing"
          ></v-text-field>
          
          <v-text-field
            v-model="paymentData.cardNumber"
            label="Card Number"
            placeholder="1234 5678 9012 3456"
            :disabled="processing"
          ></v-text-field>
          
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model="paymentData.expiryDate"
                label="Expiry Date"
                placeholder="MM/YY"
                :disabled="processing"
              ></v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="paymentData.cvv"
                label="CVV"
                placeholder="123"
                :disabled="processing"
              ></v-text-field>
            </v-col>
          </v-row>
          
          <v-btn
            type="submit"
            color="primary"
            :loading="processing"
            :disabled="!isFormValid"
            block
          >
            Process Payment
          </v-btn>
        </v-form>
        
        <v-divider class="my-4"></v-divider>
        
        <div class="test-section">
          <h3>Test Error Scenarios</h3>
          <p class="text-caption">Simulate the errors from the deployment logs</p>
          
          <v-btn
            color="error"
            class="ma-2"
            @click="simulatePaymentTimeout"
            :loading="testLoading.timeout"
          >
            Simulate Payment Timeout (5000ms)
          </v-btn>
          
          <v-btn
            color="warning"
            class="ma-2"
            @click="simulateConnectionPoolExhaustion"
            :loading="testLoading.pool"
          >
            Simulate DB Pool Exhaustion
          </v-btn>
          
          <v-btn
            color="info"
            class="ma-2"
            @click="simulateConnectionError"
            :loading="testLoading.connection"
          >
            Simulate HTTPSConnectionPool Error
          </v-btn>
        </div>
        
        <v-alert
          v-if="result"
          :type="result.success ? 'success' : 'error'"
          :text="result.message"
          class="mt-4"
        ></v-alert>
        
        <v-card v-if="transactionHistory.length > 0" class="mt-4">
          <v-card-title>Transaction History</v-card-title>
          <v-card-text>
            <v-list>
              <v-list-item
                v-for="transaction in transactionHistory"
                :key="transaction.id"
              >
                <v-list-item-content>
                  <v-list-item-title>{{ transaction.id }}</v-list-item-title>
                  <v-list-item-subtitle>
                    ${{ transaction.amount }} - {{ transaction.status }} - {{ transaction.timestamp }}
                  </v-list-item-subtitle>
                </v-list-item-content>
                <v-list-item-action>
                  <v-chip
                    :color="transaction.status === 'success' ? 'green' : 'red'"
                    small
                  >
                    {{ transaction.status }}
                  </v-chip>
                </v-list-item-action>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </div>
</template>

<script>
import paymentService from '@/services/paymentService';
import databaseService from '@/services/databaseService';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'PaymentHandler',
  
  data() {
    return {
      processing: false,
      paymentData: {
        amount: '',
        cardNumber: '',
        expiryDate: '',
        cvv: ''
      },
      result: null,
      transactionHistory: [],
      testLoading: {
        timeout: false,
        pool: false,
        connection: false
      }
    };
  },
  
  computed: {
    isFormValid() {
      return this.paymentData.amount && 
             this.paymentData.cardNumber && 
             this.paymentData.expiryDate && 
             this.paymentData.cvv;
    }
  },
  
  methods: {
    async processPayment() {
      this.processing = true;
      this.result = null;
      
      try {
        await cloudWatchLogger.logUserAction('payment_initiated', {
          amount: this.paymentData.amount,
          component: 'PaymentHandler'
        });
        
        // Process payment using the payment service
        const result = await paymentService.charge(
          parseFloat(this.paymentData.amount),
          {
            cardNumber: this.paymentData.cardNumber,
            expiryDate: this.paymentData.expiryDate,
            cvv: this.paymentData.cvv
          }
        );
        
        // Store transaction in database
        await this.storeTransaction(result);
        
        this.result = {
          success: true,
          message: `Payment processed successfully! Transaction ID: ${result.transactionId}`
        };
        
        this.addToHistory(result);
        this.resetForm();
        
      } catch (error) {
        await cloudWatchLogger.paymentError(error);
        
        this.result = {
          success: false,
          message: `Payment failed: ${error.message}`
        };
        
        // Add failed transaction to history
        this.addToHistory({
          transactionId: `failed_${Date.now()}`,
          amount: this.paymentData.amount,
          status: 'failed',
          error: error.message
        });
        
      } finally {
        this.processing = false;
      }
    },
    
    async storeTransaction(transactionData) {
      try {
        await databaseService.insert('transactions', {
          transaction_id: transactionData.transactionId,
          amount: transactionData.amount,
          status: transactionData.success ? 'completed' : 'failed',
          created_at: new Date().toISOString(),
          metadata: JSON.stringify(transactionData)
        });
      } catch (error) {
        await cloudWatchLogger.databaseError(error, 'insert_transaction');
        // Don't fail the payment if database storage fails
        console.warn('Failed to store transaction in database:', error.message);
      }
    },
    
    async simulatePaymentTimeout() {
      this.testLoading.timeout = true;
      
      try {
        // Create a timeout error that matches the logs
        const timeoutError = new Error('Payment service connection failed - timeout after 5000ms');
        timeoutError.code = 'TIMEOUT';
        
        await cloudWatchLogger.paymentError(timeoutError, 'test_timeout_simulation');
        
        // Also log the specific format from the error logs
        await cloudWatchLogger.serviceTimeoutError('Payment', 5000, {
          simulation: true,
          component: 'PaymentHandler'
        });
        
        this.result = {
          success: true,
          message: 'Payment timeout error logged successfully (simulation)'
        };
        
      } catch (error) {
        this.result = {
          success: false,
          message: `Failed to simulate timeout: ${error.message}`
        };
      } finally {
        this.testLoading.timeout = false;
      }
    },
    
    async simulateConnectionPoolExhaustion() {
      this.testLoading.pool = true;
      
      try {
        // Create a connection pool exhaustion error
        const poolError = new Error('Database query failed: connection pool exhausted');
        poolError.code = 'POOL_EXHAUSTED';
        
        await cloudWatchLogger.databaseError(poolError, 'user_query');
        
        // Log connection pool status
        await cloudWatchLogger.connectionPoolStatus({
          maxConnections: 20,
          currentConnections: 20,
          idleConnections: 0,
          busyConnections: 20,
          waitingQueue: 5
        });
        
        this.result = {
          success: true,
          message: 'Database connection pool exhaustion error logged successfully (simulation)'
        };
        
      } catch (error) {
        this.result = {
          success: false,
          message: `Failed to simulate pool exhaustion: ${error.message}`
        };
      } finally {
        this.testLoading.pool = false;
      }
    },
    
    async simulateConnectionError() {
      this.testLoading.connection = true;
      
      try {
        // Create HTTPSConnectionPool timeout error matching the traceback
        const connectionError = new Error('HTTPSConnectionPool timeout');
        connectionError.code = 'CONNECTION_ERROR';
        
        await cloudWatchLogger.paymentError(connectionError, 'test_connection_simulation');
        
        this.result = {
          success: true,
          message: 'HTTPSConnectionPool timeout error logged successfully (simulation)'
        };
        
      } catch (error) {
        this.result = {
          success: false,
          message: `Failed to simulate connection error: ${error.message}`
        };
      } finally {
        this.testLoading.connection = false;
      }
    },
    
    addToHistory(transaction) {
      this.transactionHistory.unshift({
        id: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.success ? 'success' : 'failed',
        timestamp: new Date().toLocaleString(),
        error: transaction.error || null
      });
      
      // Keep only last 10 transactions
      if (this.transactionHistory.length > 10) {
        this.transactionHistory = this.transactionHistory.slice(0, 10);
      }
    },
    
    resetForm() {
      this.paymentData = {
        amount: '',
        cardNumber: '',
        expiryDate: '',
        cvv: ''
      };
    }
  },
  
  async mounted() {
    await cloudWatchLogger.logPageView('PaymentHandler', {
      component: 'PaymentHandler'
    });
    
    // Check service health on component mount
    try {
      const paymentHealthy = await paymentService.healthCheck();
      const databaseHealthy = await databaseService.healthCheck();
      
      if (!paymentHealthy) {
        await cloudWatchLogger.warn('Payment service health check failed', {
          type: 'health_check',
          service: 'payment'
        });
      }
      
      if (!databaseHealthy) {
        await cloudWatchLogger.warn('Database service health check failed', {
          type: 'health_check',
          service: 'database'
        });
      }
    } catch (error) {
      await cloudWatchLogger.error('Service health check error', {
        type: 'health_check_error',
        error: error.message
      });
    }
  }
};
</script>

<style scoped>
.payment-handler {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.test-section {
  background-color: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  margin-top: 16px;
}

.test-section h3 {
  margin-bottom: 8px;
}
</style>