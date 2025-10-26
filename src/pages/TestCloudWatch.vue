<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration and database connection management. Click the buttons below to trigger different types of errors.</p>
              
              <!-- Connection Health Status -->
              <v-card class="mb-4" outlined>
                <v-card-subtitle>Connection Health Status</v-card-subtitle>
                <v-card-text>
                  <v-row>
                    <v-col cols="6">
                      <v-chip 
                        :color="getHealthColor(firebaseHealth.isHealthy)" 
                        small
                        class="mb-2"
                      >
                        Firebase: {{ firebaseHealth.isHealthy ? 'Healthy' : 'Degraded' }}
                      </v-chip>
                      <div class="text-caption">
                        Active Operations: {{ firebaseHealth.activeOperations }}<br>
                        Queued Operations: {{ firebaseHealth.queuedOperations }}<br>
                        Success Rate: {{ firebaseHealth.successRate || 'N/A' }}
                      </div>
                    </v-col>
                    <v-col cols="6">
                      <v-chip 
                        :color="getHealthColor(cloudWatchHealth.circuitBreakerState?.state === 'CLOSED')" 
                        small
                        class="mb-2"
                      >
                        CloudWatch: {{ cloudWatchHealth.circuitBreakerState?.state || 'Unknown' }}
                      </v-chip>
                      <div class="text-caption">
                        Active Requests: {{ cloudWatchHealth.activeRequests }}<br>
                        Batched Logs: {{ cloudWatchHealth.batchedLogs }}<br>
                        Success Rate: {{ cloudWatchHealth.successRate || 'N/A' }}
                      </div>
                    </v-col>
                  </v-row>
                  <v-btn 
                    small 
                    color="primary" 
                    @click="refreshHealthStatus"
                    class="mt-2"
                  >
                    Refresh Status
                  </v-btn>
                </v-card-text>
              </v-card>
              
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
                @click="testConnectionHealth"
                :loading="loading.health"
              >
                Test Connection Health
              </v-btn>

              <v-btn 
                color="orange" 
                class="ma-2" 
                @click="testDatabaseTimeout"
                :loading="loading.timeout"
              >
                Test Database Timeout
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
import { connectionManager, dbOperations, db } from '@/firebase';

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
        timeout: false
      },
      lastResult: null,
      firebaseHealth: {
        isHealthy: true,
        activeOperations: 0,
        queuedOperations: 0,
        successRate: 'N/A'
      },
      cloudWatchHealth: {
        circuitBreakerState: { state: 'CLOSED' },
        activeRequests: 0,
        batchedLogs: 0,
        successRate: 'N/A'
      },
      healthCheckInterval: null
    };
  },

  mounted() {
    this.refreshHealthStatus();
    // Set up periodic health status updates
    this.healthCheckInterval = setInterval(() => {
      this.refreshHealthStatus();
    }, 10000); // Update every 10 seconds
  },

  beforeDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  },
  
  methods: {
    getHealthColor(isHealthy) {
      return isHealthy ? 'success' : 'error';
    },

    refreshHealthStatus() {
      try {
        this.firebaseHealth = connectionManager.getConnectionHealth();
        this.cloudWatchHealth = cloudWatchLogger.getConnectionStatus();
      } catch (error) {
        console.warn('Failed to get health status:', error);
      }
    },

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
        this.refreshHealthStatus();
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
          new Error('Database connection timeout after 30 seconds'),
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
        this.refreshHealthStatus();
      }
    },

    async testDatabaseTimeout() {
      this.loading.timeout = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Database Timeout', {
          component: 'TestCloudWatch',
          testType: 'database_timeout'
        });

        // Simulate a database operation that might timeout
        const testRef = db.collection('test').doc('timeout-test');
        await dbOperations.set(testRef, {
          timestamp: new Date(),
          testType: 'timeout_simulation',
          message: 'Testing enhanced connection management'
        });

        this.lastResult = {
          success: true,
          message: 'Database operation completed successfully with enhanced connection management!'
        };
      } catch (error) {
        await cloudWatchLogger.databaseError(error, 'timeout_test');
        this.lastResult = {
          success: false,
          message: `Database operation failed: ${error.message}`
        };
      } finally {
        this.loading.timeout = false;
        this.refreshHealthStatus();
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
        this.refreshHealthStatus();
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
        this.refreshHealthStatus();
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
        this.refreshHealthStatus();
      }
    },

    async testConnectionHealth() {
      this.loading.health = true;
      try {
        // Log button click
        await cloudWatchLogger.logButtonClick('Test Connection Health', {
          component: 'TestCloudWatch',
          testType: 'connection_health'
        });

        // Log connection health to CloudWatch
        await cloudWatchLogger.logConnectionHealth();

        // Force flush any batched logs
        await cloudWatchLogger.flushLogs();

        this.lastResult = {
          success: true,
          message: 'Connection health logged to CloudWatch successfully!'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log connection health: ${error.message}`
        };
      } finally {
        this.loading.health = false;
        this.refreshHealthStatus();
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
