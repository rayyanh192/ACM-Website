<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration. Click the buttons below to trigger different types of errors.</p>
              
              <v-btn 
                color="error" 
                class="ma-2" 
                @click="testPaymentError"
                :loading="loading.payment"
              >
                Test Payment Error
              </v-btn>
              
              <v-btn 
                color="warning" 
                class="ma-2" 
                @click="testDatabaseError"
                :loading="loading.database"
              >
                Test Database Error
              </v-btn>
              
              <v-btn 
                color="info" 
                class="ma-2" 
                @click="testApiError"
                :loading="loading.api"
              >
                Test API Error
              </v-btn>
              
              <v-btn 
                color="secondary" 
                class="ma-2" 
                @click="testFirebaseError"
                :loading="loading.firebase"
              >
                Test Firebase Error
              </v-btn>
              
              <v-btn 
                color="primary" 
                class="ma-2" 
                @click="testGeneralError"
                :loading="loading.general"
              >
                Test General Error
              </v-btn>
              
              <v-btn 
                color="success" 
                class="ma-2" 
                @click="testHealthCheck"
                :loading="loading.health"
              >
                Test Health Check
              </v-btn>
              
              <v-btn 
                color="purple" 
                class="ma-2" 
                @click="testPaymentProcessing"
                :loading="loading.paymentProcess"
              >
                Test Payment Processing
              </v-btn>
              
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                  :text="lastResult.message"
                ></v-alert>
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

export default {
  name: 'TestCloudWatch',
  
  data() {
    return {
      loading: {
        payment: false,
        database: false,
        api: false,
        firebase: false,
        general: false,
        health: false,
        paymentProcess: false
      },
      lastResult: null
    };
  },
  
  methods: {
    async testPaymentError() {
      this.loading.payment = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Payment Error', {
          component: 'TestCloudWatch',
          testType: 'payment_error'
        });
        
        // Call the new Firebase function to simulate payment error
        const simulatePaymentError = this.$firebase.functions().httpsCallable('simulatePaymentError');
        await simulatePaymentError({ errorType: 'timeout' });
        
        this.lastResult = {
          success: true,
          message: 'Payment error logged to CloudWatch successfully!'
        };
      } catch (error) {
        // This is expected when simulating errors
        if (error.code === 'functions/deadline-exceeded') {
          this.lastResult = {
            success: true,
            message: 'Payment timeout error simulated and logged successfully!'
          };
        } else {
          this.lastResult = {
            success: false,
            message: `Failed to simulate payment error: ${error.message}`
          };
        }
      } finally {
        this.loading.payment = false;
      }
    },
    
    async testDatabaseError() {
      this.loading.database = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Database Error', {
          component: 'TestCloudWatch',
          testType: 'database_error'
        });
        
        // Call the new Firebase function to simulate database error
        const simulateDatabaseError = this.$firebase.functions().httpsCallable('simulateDatabaseError');
        await simulateDatabaseError({ errorType: 'pool_exhausted' });
        
        this.lastResult = {
          success: true,
          message: 'Database error logged to CloudWatch successfully!'
        };
      } catch (error) {
        // This is expected when simulating errors
        if (error.code === 'functions/resource-exhausted') {
          this.lastResult = {
            success: true,
            message: 'Database connection pool exhausted error simulated and logged successfully!'
          };
        } else {
          this.lastResult = {
            success: false,
            message: `Failed to simulate database error: ${error.message}`
          };
        }
      } finally {
        this.loading.database = false;
      }
    },
    
    async testApiError() {
      this.loading.api = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test API Error', {
          component: 'TestCloudWatch',
          testType: 'api_error'
        });
        
        await cloudWatchLogger.apiError(
          new Error('External API returned 500 error'),
          '/api/external-service'
        );
        this.lastResult = {
          success: true,
          message: 'API error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log API error: ${error.message}`
        };
      } finally {
        this.loading.api = false;
      }
    },
    
    async testFirebaseError() {
      this.loading.firebase = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Firebase Error', {
          component: 'TestCloudWatch',
          testType: 'firebase_error'
        });
        
        await cloudWatchLogger.firebaseError(
          new Error('Firebase authentication failed'),
          'signIn'
        );
        this.lastResult = {
          success: true,
          message: 'Firebase error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log Firebase error: ${error.message}`
        };
      } finally {
        this.loading.firebase = false;
      }
    },
    
    async testGeneralError() {
      this.loading.general = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test General Error', {
          component: 'TestCloudWatch',
          testType: 'general_error'
        });
        
        await cloudWatchLogger.error(
          'General system error - website crash simulation',
          { 
            component: 'TestCloudWatch',
            action: 'testGeneralError',
            timestamp: new Date().toISOString()
          }
        );
        this.lastResult = {
          success: true,
          message: 'General error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log general error: ${error.message}`
        };
      } finally {
        this.loading.general = false;
      }
    },
    
    async testHealthCheck() {
      this.loading.health = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Health Check', {
          component: 'TestCloudWatch',
          testType: 'health_check'
        });
        
        // Call the health check Firebase function
        const healthCheck = this.$firebase.functions().httpsCallable('healthCheck');
        const result = await healthCheck();
        
        this.lastResult = {
          success: result.data.healthy,
          message: result.data.healthy 
            ? 'Health check passed - all systems operational!' 
            : `Health check failed: ${result.data.error || 'Some systems are unhealthy'}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Health check failed: ${error.message}`
        };
      } finally {
        this.loading.health = false;
      }
    },
    
    async testPaymentProcessing() {
      this.loading.paymentProcess = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Payment Processing', {
          component: 'TestCloudWatch',
          testType: 'payment_processing'
        });
        
        // Test payment processing with mock data
        const processPayment = this.$firebase.functions().httpsCallable('processPayment');
        const result = await processPayment({
          provider: 'stripe',
          amount: 10.00,
          currency: 'usd',
          paymentMethodId: 'pm_test_card_visa',
          description: 'Test payment from CloudWatch test page'
        });
        
        this.lastResult = {
          success: result.data.success,
          message: result.data.success 
            ? `Payment processed successfully! Payment ID: ${result.data.paymentId}` 
            : 'Payment processing failed'
        };
      } catch (error) {
        // Handle expected payment errors
        if (error.code === 'functions/failed-precondition') {
          this.lastResult = {
            success: true,
            message: 'Payment processing test completed - Stripe not configured (expected in test environment)'
          };
        } else {
          this.lastResult = {
            success: false,
            message: `Payment processing failed: ${error.message}`
          };
        }
      } finally {
        this.loading.paymentProcess = false;
      }
    }
  }
};
</script>

<style scoped>
.test-cloudwatch {
  padding: 20px 0;
}
</style>
