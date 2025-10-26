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
                color="success" 
                class="ma-2" 
                @click="testPaymentProcessing"
                :loading="loading.paymentProcessing"
              >
                Test Payment Processing
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
                @click="testConnectionPoolStatus"
                :loading="loading.connectionPool"
              >
                Check Connection Pool
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
        paymentProcessing: false,
        database: false,
        connectionPool: false,
        firebase: false,
        general: false
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
        
        await cloudWatchLogger.paymentError(
          new Error('Payment processing failed - insufficient funds'),
          'txn_123456789'
        );
        this.lastResult = {
          success: true,
          message: 'Payment error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log payment error: ${error.message}`
        };
      } finally {
        this.loading.payment = false;
      }
    },
    
    async testPaymentProcessing() {
      this.loading.paymentProcessing = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Payment Processing', {
          component: 'TestCloudWatch',
          testType: 'payment_processing'
        });
        
        // Test actual payment processing with timeout handling
        const result = await cloudWatchLogger.processPayment(25.99, 'credit_card');
        
        this.lastResult = {
          success: true,
          message: `Payment processed successfully! Transaction ID: ${result.transactionId}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Payment processing failed: ${error.message}`
        };
      } finally {
        this.loading.paymentProcessing = false;
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
        
        await cloudWatchLogger.databaseError(
          new Error('Database connection timeout'),
          'user_query'
        );
        this.lastResult = {
          success: true,
          message: 'Database error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log database error: ${error.message}`
        };
      } finally {
        this.loading.database = false;
      }
    },
    
    async testConnectionPoolStatus() {
      this.loading.connectionPool = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Check Connection Pool Status', {
          component: 'TestCloudWatch',
          testType: 'connection_pool_status'
        });
        
        // Import Firebase functions
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        
        // Get connection pool status
        const getConnectionPoolStats = httpsCallable(functions, 'getConnectionPoolStats');
        const getDatabasePoolStatus = httpsCallable(functions, 'getDatabasePoolStatus');
        
        const [connectionStats, databaseStats] = await Promise.all([
          getConnectionPoolStats(),
          getDatabasePoolStatus()
        ]);
        
        this.lastResult = {
          success: true,
          message: `Connection Pool Status Retrieved Successfully!
Connection Pool: ${JSON.stringify(connectionStats.data, null, 2)}
Database Pool: ${JSON.stringify(databaseStats.data, null, 2)}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to get connection pool status: ${error.message}`
        };
      } finally {
        this.loading.connectionPool = false;
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
    }
  }
};
</script>

<style scoped>
.test-cloudwatch {
  padding: 20px 0;
}
</style>
