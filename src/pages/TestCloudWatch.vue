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
                @click="showSystemStatus"
                :loading="loading.status"
              >
                Show System Status
              </v-btn>
              
              <v-btn 
                color="orange" 
                class="ma-2" 
                @click="flushLogs"
                :loading="loading.flush"
              >
                Flush Pending Logs
              </v-btn>
              
              <div v-if="systemStatus" class="mt-4">
                <v-card>
                  <v-card-title>CloudWatch Logger System Status</v-card-title>
                  <v-card-text>
                    <div class="mb-2">
                      <strong>Circuit Breaker:</strong> 
                      <v-chip 
                        :color="systemStatus.circuitBreaker.state === 'CLOSED' ? 'green' : 
                               systemStatus.circuitBreaker.state === 'OPEN' ? 'red' : 'orange'"
                        small
                      >
                        {{ systemStatus.circuitBreaker.state }}
                      </v-chip>
                      <span class="ml-2">Failures: {{ systemStatus.circuitBreaker.failureCount }}</span>
                    </div>
                    <div class="mb-2">
                      <strong>Log Batcher:</strong> 
                      Pending: {{ systemStatus.batcher.pendingLogs }}, 
                      Retained: {{ systemStatus.batcher.retainedLogs }},
                      Enabled: {{ systemStatus.batcher.batchingEnabled }}
                    </div>
                    <div class="mb-2">
                      <strong>Fallback Logs:</strong> {{ systemStatus.fallbackLogs }} stored locally
                    </div>
                  </v-card-text>
                </v-card>
              </div>
              
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
        status: false,
        flush: false
      },
      lastResult: null,
      systemStatus: null
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
        
        // Simulate the actual payment timeout error from the incident
        const paymentTimeoutError = new Error('Payment service connection failed - timeout after 5000ms');
        paymentTimeoutError.code = 'PAYMENT_TIMEOUT';
        paymentTimeoutError.status = 408;
        
        await cloudWatchLogger.paymentError(
          paymentTimeoutError,
          'txn_123456789'
        );
        
        // Also simulate the HTTPSConnectionPool timeout
        const connectionError = new Error('HTTPSConnectionPool timeout');
        connectionError.code = 'CONNECTION_TIMEOUT';
        
        await cloudWatchLogger.apiError(
          connectionError,
          '/api/payment/charge'
        );
        
        this.lastResult = {
          success: true,
          message: 'Payment timeout errors logged to CloudWatch successfully!'
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
        
        // Simulate the actual database connection pool exhaustion from the incident
        const dbPoolError = new Error('Database query failed: connection pool exhausted');
        dbPoolError.code = 'CONNECTION_POOL_EXHAUSTED';
        
        await cloudWatchLogger.databaseError(
          dbPoolError,
          'user_query'
        );
        
        // Also simulate connection timeout
        const dbTimeoutError = new Error('Database connection timeout');
        dbTimeoutError.code = 'DB_TIMEOUT';
        
        await cloudWatchLogger.databaseError(
          dbTimeoutError,
          'connection_attempt'
        );
        
        this.lastResult = {
          success: true,
          message: 'Database connection pool errors logged to CloudWatch successfully!'
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
    
    async showSystemStatus() {
      this.loading.status = true;
      try {
        this.systemStatus = {
          circuitBreaker: cloudWatchLogger.getCircuitBreakerState(),
          batcher: cloudWatchLogger.getBatcherState(),
          fallbackLogs: cloudWatchLogger.getFallbackLogs().length
        };
        
        this.lastResult = {
          success: true,
          message: 'System status retrieved successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to get system status: ${error.message}`
        };
      } finally {
        this.loading.status = false;
      }
    },
    
    async flushLogs() {
      this.loading.flush = true;
      try {
        await cloudWatchLogger.flushPendingLogs();
        
        // Refresh system status after flushing
        this.systemStatus = {
          circuitBreaker: cloudWatchLogger.getCircuitBreakerState(),
          batcher: cloudWatchLogger.getBatcherState(),
          fallbackLogs: cloudWatchLogger.getFallbackLogs().length
        };
        
        this.lastResult = {
          success: true,
          message: 'Pending logs flushed successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to flush logs: ${error.message}`
        };
      } finally {
        this.loading.flush = false;
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
