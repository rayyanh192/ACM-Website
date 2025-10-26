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
                color="orange" 
                class="ma-2" 
                @click="testConnectionTimeout"
                :loading="loading.timeout"
              >
                Test Connection Timeout
              </v-btn>

              <v-btn 
                color="purple" 
                class="ma-2" 
                @click="testConnectionPoolExhaustion"
                :loading="loading.poolExhaustion"
              >
                Test Pool Exhaustion
              </v-btn>

              <v-btn 
                color="teal" 
                class="ma-2" 
                @click="testPaymentServiceTimeout"
                :loading="loading.paymentTimeout"
              >
                Test Payment Timeout
              </v-btn>

              <v-btn 
                color="indigo" 
                class="ma-2" 
                @click="testHealthMonitoring"
                :loading="loading.healthCheck"
              >
                Test Health Monitoring
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
import { paymentService } from '@/services/paymentService';
import { databaseService } from '@/services/databaseService';
import { systemHealthMonitor } from '@/utils/systemHealthMonitor';
import { HttpClient } from '@/utils/httpClient';

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
        timeout: false,
        poolExhaustion: false,
        paymentTimeout: false,
        healthCheck: false
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

    async testConnectionTimeout() {
      this.loading.timeout = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Connection Timeout', {
          component: 'TestCloudWatch',
          testType: 'connection_timeout'
        });
        
        // Simulate the "Payment service connection failed - timeout after 5000ms" error
        const timeoutError = new Error('Payment service connection failed - timeout after 5000ms');
        timeoutError.name = 'TimeoutError';
        
        await cloudWatchLogger.paymentError(timeoutError, 'test_txn_timeout_123');
        
        // Also log timeout specifically
        await cloudWatchLogger.logTimeout('payment_service_connection', 5000, 5001, {
          service: 'payment',
          operation: 'connection'
        });
        
        this.lastResult = {
          success: true,
          message: 'Connection timeout error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log timeout error: ${error.message}`
        };
      } finally {
        this.loading.timeout = false;
      }
    },

    async testConnectionPoolExhaustion() {
      this.loading.poolExhaustion = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Connection Pool Exhaustion', {
          component: 'TestCloudWatch',
          testType: 'pool_exhaustion'
        });
        
        // Simulate the "Database query failed: connection pool exhausted" error
        const poolError = new Error('Database query failed: connection pool exhausted');
        await cloudWatchLogger.databaseError(poolError, 'user_query');
        
        // Log connection pool status
        await cloudWatchLogger.logConnectionPoolStatus('database', {
          active: 10,
          waiting: 5,
          max: 10,
          utilization: 100
        });
        
        this.lastResult = {
          success: true,
          message: 'Connection pool exhaustion error logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log pool exhaustion error: ${error.message}`
        };
      } finally {
        this.loading.poolExhaustion = false;
      }
    },

    async testPaymentServiceTimeout() {
      this.loading.paymentTimeout = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Payment Service Timeout', {
          component: 'TestCloudWatch',
          testType: 'payment_service_timeout'
        });
        
        // Test the actual payment service with a mock timeout scenario
        try {
          await paymentService.processPayment({
            amount: 100,
            currency: 'USD',
            paymentMethod: 'test_card'
          });
        } catch (paymentError) {
          // This will trigger the enhanced error handling in paymentService
          console.log('Payment service error handled:', paymentError);
        }
        
        this.lastResult = {
          success: true,
          message: 'Payment service timeout test completed with enhanced error handling!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to test payment service: ${error.message}`
        };
      } finally {
        this.loading.paymentTimeout = false;
      }
    },

    async testHealthMonitoring() {
      this.loading.healthCheck = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Health Monitoring', {
          component: 'TestCloudWatch',
          testType: 'health_monitoring'
        });
        
        // Start health monitoring if not already running
        if (!systemHealthMonitor.isRunning) {
          systemHealthMonitor.start();
        }
        
        // Perform a manual health check
        await systemHealthMonitor.performHealthCheck();
        
        // Get current health status
        const healthStatus = systemHealthMonitor.getHealthStatus();
        
        // Log health status
        await cloudWatchLogger.logServiceHealth('system_test', 'healthy', null, {
          healthStatus,
          testType: 'manual_health_check'
        });
        
        this.lastResult = {
          success: true,
          message: `Health monitoring test completed! Overall status: ${healthStatus.overall}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to test health monitoring: ${error.message}`
        };
      } finally {
        this.loading.healthCheck = false;
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
