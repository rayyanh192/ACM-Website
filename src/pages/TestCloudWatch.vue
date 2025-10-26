<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration. Click the buttons below to trigger different types of errors.</p>
              
              <!-- Configuration Status -->
              <v-card class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Configuration Status</v-card-title>
                <v-card-text>
                  <div v-if="configStatus">
                    <v-chip 
                      :color="configStatus.healthy ? 'success' : 'error'" 
                      class="mb-2"
                    >
                      {{ configStatus.healthy ? 'Healthy' : 'Unhealthy' }}
                    </v-chip>
                    
                    <div class="text-body-2">
                      <strong>Configured:</strong> {{ configStatus.isConfigured ? 'Yes' : 'No' }}<br>
                      <strong>Connection:</strong> {{ configStatus.connectionStatus }}<br>
                      <strong>Queued Errors:</strong> {{ configStatus.queuedErrors }}<br>
                      <strong>Region:</strong> {{ configStatus.config.region }}<br>
                      <strong>Log Group:</strong> {{ configStatus.config.logGroupName }}<br>
                      <div v-if="configStatus.configurationError" class="text-error mt-2">
                        <strong>Error:</strong> {{ configStatus.configurationError }}
                      </div>
                    </div>
                  </div>
                  <v-progress-circular v-else indeterminate size="20"></v-progress-circular>
                </v-card-text>
              </v-card>
              
              <!-- Test Buttons -->
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
              
              <!-- Diagnostic Buttons -->
              <v-divider class="my-4"></v-divider>
              
              <v-btn 
                color="success" 
                class="ma-2" 
                @click="testConnection"
                :loading="loading.connection"
              >
                Test Connection
              </v-btn>
              
              <v-btn 
                color="orange" 
                class="ma-2" 
                @click="processQueue"
                :loading="loading.queue"
              >
                Process Queue ({{ configStatus?.queuedErrors || 0 }})
              </v-btn>
              
              <v-btn 
                color="purple" 
                class="ma-2" 
                @click="refreshStatus"
                :loading="loading.status"
              >
                Refresh Status
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
        connection: false,
        queue: false,
        status: false
      },
      lastResult: null,
      configStatus: null
    };
  },
  
  async mounted() {
    await this.refreshStatus();
  },
  
  methods: {
    async refreshStatus() {
      this.loading.status = true;
      try {
        this.configStatus = await cloudWatchLogger.healthCheck();
      } catch (error) {
        console.error('Failed to get CloudWatch status:', error);
        this.configStatus = {
          healthy: false,
          isConfigured: false,
          connectionStatus: 'error',
          configurationError: error.message
        };
      } finally {
        this.loading.status = false;
      }
    },

    async testConnection() {
      this.loading.connection = true;
      try {
        const result = await cloudWatchLogger.testConnection();
        this.lastResult = {
          success: result,
          message: result ? 'Connection test successful!' : 'Connection test failed - check configuration'
        };
        await this.refreshStatus();
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Connection test failed: ${error.message}`
        };
      } finally {
        this.loading.connection = false;
      }
    },

    async processQueue() {
      this.loading.queue = true;
      try {
        await cloudWatchLogger.processQueue();
        this.lastResult = {
          success: true,
          message: 'Error queue processed successfully!'
        };
        await this.refreshStatus();
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to process queue: ${error.message}`
        };
      } finally {
        this.loading.queue = false;
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
        await this.refreshStatus();
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
        await this.refreshStatus();
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
        await this.refreshStatus();
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
        await this.refreshStatus();
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
        await this.refreshStatus();
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
