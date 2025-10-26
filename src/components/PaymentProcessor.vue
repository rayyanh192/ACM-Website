<template>
  <div class="payment-processor">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>Payment Processing</v-card-title>
            <v-card-text>
              <v-form ref="paymentForm" v-model="formValid">
                <v-text-field
                  v-model="paymentData.amount"
                  label="Amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  :rules="amountRules"
                  required
                  prepend-icon="mdi-currency-usd"
                ></v-text-field>
                
                <v-select
                  v-model="paymentData.currency"
                  :items="currencies"
                  label="Currency"
                  :rules="currencyRules"
                  required
                ></v-select>
                
                <v-text-field
                  v-model="paymentData.paymentMethod"
                  label="Payment Method"
                  :rules="paymentMethodRules"
                  required
                  prepend-icon="mdi-credit-card"
                ></v-text-field>
                
                <v-btn
                  :disabled="!formValid || processing"
                  :loading="processing"
                  color="primary"
                  @click="processPayment"
                  block
                  large
                >
                  <v-icon left>mdi-credit-card-outline</v-icon>
                  Process Payment
                </v-btn>
              </v-form>
              
              <!-- Payment Status -->
              <div v-if="paymentStatus" class="mt-4">
                <v-alert
                  :type="paymentStatus.type"
                  :text="paymentStatus.message"
                  dismissible
                  @input="paymentStatus = null"
                >
                  <template v-if="paymentStatus.details">
                    <div class="mt-2">
                      <strong>Transaction ID:</strong> {{ paymentStatus.details.transactionId }}<br>
                      <strong>Status:</strong> {{ paymentStatus.details.status }}<br>
                      <strong>Timestamp:</strong> {{ formatTimestamp(paymentStatus.timestamp) }}
                    </div>
                  </template>
                </v-alert>
              </div>
              
              <!-- Connection Status -->
              <div v-if="connectionStatus" class="mt-2">
                <v-chip
                  :color="connectionStatus.healthy ? 'success' : 'error'"
                  small
                  outlined
                >
                  <v-icon left small>
                    {{ connectionStatus.healthy ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                  </v-icon>
                  {{ connectionStatus.healthy ? 'Service Online' : 'Service Issues' }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default {
  name: 'PaymentProcessor',
  
  data() {
    return {
      formValid: false,
      processing: false,
      paymentData: {
        amount: '',
        currency: 'USD',
        paymentMethod: ''
      },
      paymentStatus: null,
      connectionStatus: null,
      
      currencies: ['USD', 'EUR', 'GBP', 'CAD'],
      
      amountRules: [
        v => !!v || 'Amount is required',
        v => v > 0 || 'Amount must be greater than 0',
        v => /^\d+(\.\d{1,2})?$/.test(v) || 'Amount must be a valid currency value'
      ],
      
      currencyRules: [
        v => !!v || 'Currency is required'
      ],
      
      paymentMethodRules: [
        v => !!v || 'Payment method is required',
        v => v.length >= 4 || 'Payment method must be at least 4 characters'
      ]
    };
  },
  
  mounted() {
    this.checkServiceHealth();
    // Check service health every 30 seconds
    this.healthCheckInterval = setInterval(this.checkServiceHealth, 30000);
  },
  
  beforeDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  },
  
  methods: {
    async processPayment() {
      if (!this.formValid) {
        return;
      }
      
      this.processing = true;
      this.paymentStatus = null;
      
      try {
        // Log payment attempt
        await cloudWatchLogger.logUserAction('payment_attempt', {
          amount: this.paymentData.amount,
          currency: this.paymentData.currency
        });
        
        // Call Firebase function
        const functions = getFunctions();
        const processPaymentFunction = httpsCallable(functions, 'processPayment');
        
        const startTime = Date.now();
        const result = await processPaymentFunction({
          amount: parseFloat(this.paymentData.amount),
          currency: this.paymentData.currency,
          paymentMethod: this.paymentData.paymentMethod
        });
        
        const processingTime = Date.now() - startTime;
        
        // Log successful payment
        await cloudWatchLogger.info('Payment processed successfully', {
          transactionId: result.data.transactionId,
          amount: this.paymentData.amount,
          currency: this.paymentData.currency,
          processingTime
        });
        
        this.paymentStatus = {
          type: 'success',
          message: 'Payment processed successfully!',
          details: result.data,
          timestamp: new Date()
        };
        
        // Reset form
        this.resetForm();
        
      } catch (error) {
        console.error('Payment processing failed:', error);
        
        // Determine error type and message
        let errorMessage = 'Payment processing failed. Please try again.';
        let errorType = 'error';
        
        if (error.code === 'functions/deadline-exceeded' || 
            error.message.includes('timeout')) {
          errorMessage = 'Payment service timeout. Please try again in a few moments.';
          await cloudWatchLogger.connectionTimeout('payment-service', 5000, error);
        } else if (error.message.includes('connection pool exhausted')) {
          errorMessage = 'Service temporarily unavailable. Please try again later.';
          await cloudWatchLogger.poolExhaustion('database', { error: error.message });
        } else if (error.code === 'functions/unauthenticated') {
          errorMessage = 'Please sign in to process payments.';
          errorType = 'warning';
        } else if (error.code === 'functions/invalid-argument') {
          errorMessage = 'Invalid payment information. Please check your details.';
          errorType = 'warning';
        }
        
        // Log payment error
        await cloudWatchLogger.paymentError(error, null);
        
        this.paymentStatus = {
          type: errorType,
          message: errorMessage,
          timestamp: new Date()
        };
        
        // Update connection status
        this.connectionStatus = {
          healthy: false,
          lastError: error.message
        };
      } finally {
        this.processing = false;
      }
    },
    
    async checkServiceHealth() {
      try {
        const functions = getFunctions();
        const healthCheck = httpsCallable(functions, 'paymentHealthCheck');
        
        const result = await healthCheck();
        
        this.connectionStatus = {
          healthy: result.data.status === 'healthy',
          lastCheck: new Date(),
          details: result.data
        };
        
        // Log health status
        await cloudWatchLogger.serviceHealth('payment-service', result.data.status, {
          database: result.data.database,
          paymentService: result.data.paymentService
        });
        
      } catch (error) {
        console.error('Health check failed:', error);
        
        this.connectionStatus = {
          healthy: false,
          lastCheck: new Date(),
          error: error.message
        };
        
        await cloudWatchLogger.serviceHealth('payment-service', 'unhealthy', {
          error: error.message
        });
      }
    },
    
    resetForm() {
      this.paymentData = {
        amount: '',
        currency: 'USD',
        paymentMethod: ''
      };
      this.$refs.paymentForm.resetValidation();
    },
    
    formatTimestamp(timestamp) {
      return new Date(timestamp).toLocaleString();
    }
  }
};
</script>

<style scoped>
.payment-processor {
  padding: 20px 0;
}

.v-chip {
  margin-top: 8px;
}
</style>