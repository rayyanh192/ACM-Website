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

              <v-divider class="my-4"></v-divider>
              <h3 class="mb-3">Deploy Error Simulation</h3>
              <p class="text-caption mb-3">Test the specific errors from the deploy logs</p>
              
              <v-btn 
                color="error" 
                class="ma-2" 
                @click="testPaymentTimeout"
                :loading="loading.paymentTimeout"
              >
                Test Payment Timeout (5000ms)
              </v-btn>
              
              <v-btn 
                color="error" 
                class="ma-2" 
                @click="testConnectionPoolExhaustion"
                :loading="loading.connectionPool"
              >
                Test Connection Pool Exhaustion
              </v-btn>
              
              <v-btn 
                color="error" 
                class="ma-2" 
                @click="testHttpsConnectionTimeout"
                :loading="loading.httpsTimeout"
              >
                Test HTTPS Connection Timeout
              </v-btn>

              <v-btn 
                color="warning" 
                class="ma-2" 
                @click="simulateAllDeployErrors"
                :loading="loading.deployErrors"
              >
                Simulate All Deploy Errors
              </v-btn>

              <v-divider class="my-4"></v-divider>
              <h3 class="mb-3">Service Health Monitoring</h3>
              
              <v-btn 
                color="info" 
                class="ma-2" 
                @click="checkServiceHealth"
                :loading="loading.healthCheck"
              >
                Check Service Health
              </v-btn>
              
              <v-btn 
                color="success" 
                class="ma-2" 
                @click="getSystemMetrics"
                :loading="loading.metrics"
              >
                Get System Metrics
              </v-btn>
              
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                  :text="lastResult.message"
                ></v-alert>
              </div>

              <div v-if="healthStatus" class="mt-4">
                <v-card>
                  <v-card-title>Service Health Status</v-card-title>
                  <v-card-text>
                    <pre>{{ JSON.stringify(healthStatus, null, 2) }}</pre>
                  </v-card-text>
                </v-card>
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
import { monitoringService } from '@/services/MonitoringService';
import { paymentService } from '@/services/PaymentService';
import { databaseService } from '@/services/DatabaseService';

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
        paymentTimeout: false,
        connectionPool: false,
        httpsTimeout: false,
        deployErrors: false,
        healthCheck: false,
        metrics: false
      },
      lastResult: null,
      healthStatus: null
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

    // New methods for deploy error simulation
    async testPaymentTimeout() {
      this.loading.paymentTimeout = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Payment Timeout', {
          component: 'TestCloudWatch',
          testType: 'payment_timeout'
        });
        
        // Simulate the exact error from the logs
        await cloudWatchLogger.paymentServiceTimeout(5000, {
          testSimulation: true,
          originalError: '[ERROR] Payment service connection failed - timeout after 5000ms'
        });
        
        this.lastResult = {
          success: true,
          message: 'Payment timeout error (5000ms) logged successfully! This matches the deploy error.'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log payment timeout: ${error.message}`
        };
      } finally {
        this.loading.paymentTimeout = false;
      }
    },

    async testConnectionPoolExhaustion() {
      this.loading.connectionPool = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Connection Pool Exhaustion', {
          component: 'TestCloudWatch',
          testType: 'connection_pool_exhaustion'
        });
        
        // Simulate the exact error from the logs
        await cloudWatchLogger.connectionPoolExhausted('database', {
          testSimulation: true,
          originalError: '[ERROR] Database query failed: connection pool exhausted'
        });
        
        this.lastResult = {
          success: true,
          message: 'Connection pool exhaustion error logged successfully! This matches the deploy error.'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log connection pool error: ${error.message}`
        };
      } finally {
        this.loading.connectionPool = false;
      }
    },

    async testHttpsConnectionTimeout() {
      this.loading.httpsTimeout = true;
      try {
        await cloudWatchLogger.logButtonClick('Test HTTPS Connection Timeout', {
          component: 'TestCloudWatch',
          testType: 'https_connection_timeout'
        });
        
        // Simulate the exact error from the logs
        await cloudWatchLogger.httpsConnectionPoolTimeout('/app/payment_handler.py', {
          testSimulation: true,
          originalError: 'Traceback (most recent call last):\n  File "/app/payment_handler.py", line 67, in process_payment\n    response = payment_client.charge(amount)\nConnectionError: HTTPSConnectionPool timeout'
        });
        
        this.lastResult = {
          success: true,
          message: 'HTTPS connection timeout error logged successfully! This matches the deploy error traceback.'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to log HTTPS timeout: ${error.message}`
        };
      } finally {
        this.loading.httpsTimeout = false;
      }
    },

    async simulateAllDeployErrors() {
      this.loading.deployErrors = true;
      try {
        await cloudWatchLogger.logButtonClick('Simulate All Deploy Errors', {
          component: 'TestCloudWatch',
          testType: 'all_deploy_errors'
        });
        
        const result = await monitoringService.simulateDeployErrors();
        
        if (result.success) {
          this.lastResult = {
            success: true,
            message: `All deploy errors simulated successfully! Errors: ${result.errorsSimulated.join(', ')}`
          };
        } else {
          this.lastResult = {
            success: false,
            message: `Failed to simulate deploy errors: ${result.error}`
          };
        }
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to simulate deploy errors: ${error.message}`
        };
      } finally {
        this.loading.deployErrors = false;
      }
    },

    async checkServiceHealth() {
      this.loading.healthCheck = true;
      try {
        await cloudWatchLogger.logButtonClick('Check Service Health', {
          component: 'TestCloudWatch',
          testType: 'health_check'
        });
        
        const healthStatus = await monitoringService.performHealthChecks();
        this.healthStatus = healthStatus;
        
        this.lastResult = {
          success: healthStatus.healthy,
          message: `Service health check completed. Overall status: ${healthStatus.healthy ? 'HEALTHY' : 'UNHEALTHY'}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to check service health: ${error.message}`
        };
      } finally {
        this.loading.healthCheck = false;
      }
    },

    async getSystemMetrics() {
      this.loading.metrics = true;
      try {
        await cloudWatchLogger.logButtonClick('Get System Metrics', {
          component: 'TestCloudWatch',
          testType: 'system_metrics'
        });
        
        const metrics = await monitoringService.getSystemMetrics();
        this.healthStatus = metrics;
        
        this.lastResult = {
          success: true,
          message: 'System metrics retrieved successfully! Check the status panel below.'
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to get system metrics: ${error.message}`
        };
      } finally {
        this.loading.metrics = false;
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
