<template>
  <div class="payment-processor">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8" lg="6">
          <v-card>
            <v-card-title>
              <v-icon left>mdi-credit-card</v-icon>
              Payment Processing
            </v-card-title>
            
            <v-card-text>
              <v-form ref="paymentForm" v-model="formValid" @submit.prevent="processPayment">
                <v-row>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="paymentData.amount"
                      label="Amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      prefix="$"
                      :rules="amountRules"
                      :disabled="processing"
                      required
                    ></v-text-field>
                  </v-col>
                  
                  <v-col cols="12" md="6">
                    <v-select
                      v-model="paymentData.currency"
                      :items="currencies"
                      label="Currency"
                      :rules="currencyRules"
                      :disabled="processing"
                      required
                    ></v-select>
                  </v-col>
                </v-row>
                
                <v-row>
                  <v-col cols="12">
                    <v-select
                      v-model="paymentData.provider"
                      :items="paymentProviders"
                      label="Payment Provider"
                      :rules="providerRules"
                      :disabled="processing"
                      required
                    ></v-select>
                  </v-col>
                </v-row>

                <!-- Development/Testing Options -->
                <v-row v-if="isDevelopment">
                  <v-col cols="12">
                    <v-expansion-panels>
                      <v-expansion-panel>
                        <v-expansion-panel-header>
                          <v-icon left>mdi-bug</v-icon>
                          Testing Options
                        </v-expansion-panel-header>
                        <v-expansion-panel-content>
                          <v-checkbox
                            v-model="paymentData.simulateTimeout"
                            label="Simulate Timeout (for testing)"
                            :disabled="processing"
                          ></v-checkbox>
                          
                          <v-checkbox
                            v-model="paymentData.simulateError"
                            label="Simulate Error (for testing)"
                            :disabled="processing"
                          ></v-checkbox>
                        </v-expansion-panel-content>
                      </v-expansion-panel>
                    </v-expansion-panels>
                  </v-col>
                </v-row>
              </v-form>
            </v-card-text>
            
            <v-card-actions>
              <v-spacer></v-spacer>
              
              <v-btn
                color="primary"
                :loading="processing"
                :disabled="!formValid || processing"
                @click="processPayment"
              >
                <v-icon left>mdi-credit-card-outline</v-icon>
                Process Payment
              </v-btn>
            </v-card-actions>
            
            <!-- Processing Status -->
            <v-card-text v-if="processing">
              <v-progress-linear
                :value="progressValue"
                color="primary"
                height="8"
                striped
              ></v-progress-linear>
              
              <div class="text-center mt-2">
                <v-chip
                  :color="getStatusColor()"
                  text-color="white"
                  small
                >
                  <v-icon left small>{{ getStatusIcon() }}</v-icon>
                  {{ processingStatus }}
                </v-chip>
                
                <div class="caption mt-1">
                  Processing time: {{ processingTime }}s
                  <span v-if="timeoutWarning" class="warning--text">
                    ({{ timeoutCountdown }}s remaining)
                  </span>
                </div>
              </div>
            </v-card-text>
            
            <!-- Results -->
            <v-card-text v-if="paymentResult">
              <v-alert
                :type="paymentResult.success ? 'success' : 'error'"
                :icon="paymentResult.success ? 'mdi-check-circle' : 'mdi-alert-circle'"
              >
                <div class="font-weight-bold">
                  {{ paymentResult.success ? 'Payment Successful!' : 'Payment Failed' }}
                </div>
                
                <div class="mt-2">
                  {{ paymentResult.message }}
                </div>
                
                <div v-if="paymentResult.details" class="mt-2">
                  <v-expansion-panels flat>
                    <v-expansion-panel>
                      <v-expansion-panel-header class="pa-0">
                        <small>View Details</small>
                      </v-expansion-panel-header>
                      <v-expansion-panel-content>
                        <pre class="caption">{{ JSON.stringify(paymentResult.details, null, 2) }}</pre>
                      </v-expansion-panel-content>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </div>
              </v-alert>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import paymentService from '@/services/paymentService';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'PaymentProcessor',
  
  data() {
    return {
      formValid: false,
      processing: false,
      processingStatus: 'Initializing...',
      processingTime: 0,
      progressValue: 0,
      timeoutWarning: false,
      timeoutCountdown: 0,
      
      paymentData: {
        amount: null,
        currency: 'USD',
        provider: 'stripe',
        simulateTimeout: false,
        simulateError: false
      },
      
      paymentResult: null,
      
      currencies: [
        { text: 'US Dollar (USD)', value: 'USD' },
        { text: 'Euro (EUR)', value: 'EUR' },
        { text: 'British Pound (GBP)', value: 'GBP' },
        { text: 'Canadian Dollar (CAD)', value: 'CAD' }
      ],
      
      paymentProviders: [
        { text: 'Stripe', value: 'stripe' },
        { text: 'PayPal', value: 'paypal' },
        { text: 'Square', value: 'square' }
      ],
      
      // Validation rules
      amountRules: [
        v => !!v || 'Amount is required',
        v => v > 0 || 'Amount must be greater than 0',
        v => v <= 10000 || 'Amount cannot exceed $10,000'
      ],
      
      currencyRules: [
        v => !!v || 'Currency is required'
      ],
      
      providerRules: [
        v => !!v || 'Payment provider is required'
      ],
      
      // Timers
      processingTimer: null,
      progressTimer: null,
      timeoutTimer: null
    };
  },
  
  computed: {
    isDevelopment() {
      return process.env.NODE_ENV === 'development';
    }
  },
  
  methods: {
    async processPayment() {
      if (!this.formValid) {
        return;
      }
      
      this.resetState();
      this.processing = true;
      this.processingStatus = 'Validating payment data...';
      
      const startTime = Date.now();
      
      try {
        // Log payment attempt
        await cloudWatchLogger.logUserAction('Payment Processing Started', {
          amount: this.paymentData.amount,
          currency: this.paymentData.currency,
          provider: this.paymentData.provider
        });
        
        // Start progress tracking
        this.startProgressTracking();
        
        // Validate payment first
        this.processingStatus = 'Validating payment...';
        await paymentService.validatePayment(this.paymentData);
        
        // Process payment
        this.processingStatus = 'Processing payment...';
        const result = await paymentService.processPayment(this.paymentData);
        
        // Success
        this.paymentResult = {
          success: true,
          message: `Payment of $${this.paymentData.amount} ${this.paymentData.currency} processed successfully!`,
          details: result
        };
        
        await cloudWatchLogger.logUserAction('Payment Processing Completed', {
          transactionId: result.transactionId,
          paymentId: result.paymentId,
          processingTime: result.processingTime
        });
        
      } catch (error) {
        console.error('Payment processing error:', error);
        
        // Handle different error types
        let errorMessage = 'Payment processing failed. Please try again.';
        let errorDetails = null;
        
        if (error.type === 'timeout') {
          errorMessage = 'Payment processing timed out. This may be due to network issues or high server load. Please try again.';
          this.processingStatus = 'Payment timed out';
        } else if (error.message) {
          errorMessage = error.originalError || error.message;
        }
        
        this.paymentResult = {
          success: false,
          message: errorMessage,
          details: this.isDevelopment ? error : null
        };
        
        // Log error to CloudWatch
        await cloudWatchLogger.paymentError(
          new Error(errorMessage), 
          error.transactionId || 'unknown',
          {
            amount: this.paymentData.amount,
            currency: this.paymentData.currency,
            provider: this.paymentData.provider,
            errorType: error.type || 'unknown',
            processingTime: Date.now() - startTime
          }
        );
        
      } finally {
        this.processing = false;
        this.stopProgressTracking();
      }
    },
    
    resetState() {
      this.paymentResult = null;
      this.processingTime = 0;
      this.progressValue = 0;
      this.timeoutWarning = false;
      this.timeoutCountdown = 0;
      this.stopProgressTracking();
    },
    
    startProgressTracking() {
      const startTime = Date.now();
      const timeoutThreshold = 25000; // Show warning at 25 seconds
      const maxTimeout = 30000; // Maximum expected timeout
      
      this.processingTimer = setInterval(() => {
        this.processingTime = Math.floor((Date.now() - startTime) / 1000);
        
        // Show timeout warning
        if (this.processingTime * 1000 >= timeoutThreshold) {
          this.timeoutWarning = true;
          this.timeoutCountdown = Math.max(0, Math.ceil((maxTimeout - (Date.now() - startTime)) / 1000));
        }
      }, 100);
      
      // Animate progress bar
      this.progressTimer = setInterval(() => {
        if (this.progressValue < 90) {
          this.progressValue += Math.random() * 5;
        }
      }, 500);
    },
    
    stopProgressTracking() {
      if (this.processingTimer) {
        clearInterval(this.processingTimer);
        this.processingTimer = null;
      }
      
      if (this.progressTimer) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
      }
      
      if (this.timeoutTimer) {
        clearInterval(this.timeoutTimer);
        this.timeoutTimer = null;
      }
      
      // Complete progress bar
      if (this.processing) {
        this.progressValue = 100;
      }
    },
    
    getStatusColor() {
      if (this.timeoutWarning) return 'warning';
      if (this.processingStatus.includes('timeout')) return 'error';
      return 'primary';
    },
    
    getStatusIcon() {
      if (this.timeoutWarning) return 'mdi-clock-alert';
      if (this.processingStatus.includes('timeout')) return 'mdi-clock-alert-outline';
      return 'mdi-loading';
    }
  },
  
  beforeDestroy() {
    this.stopProgressTracking();
  }
};
</script>

<style scoped>
.payment-processor {
  padding: 20px 0;
}

.v-progress-linear {
  margin: 16px 0;
}

.caption {
  font-size: 12px !important;
}

pre {
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  max-height: 200px;
  overflow-y: auto;
}
</style>