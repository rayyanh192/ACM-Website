<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card>
            <v-card-title>CloudWatch Integration Test & Health Check</v-card-title>
            <v-card-text>
              <!-- Configuration Status -->
              <v-alert 
                :type="configStatus.configured ? 'success' : 'warning'"
                class="mb-4"
              >
                <strong>Configuration Status:</strong> {{ configStatus.configured ? 'Configured' : 'Not Configured' }}
                <br>
                <strong>Environment:</strong> {{ configStatus.environment }}
                <div v-if="configStatus.errors.length > 0" class="mt-2">
                  <strong>Errors:</strong>
                  <ul>
                    <li v-for="error in configStatus.errors" :key="error">{{ error }}</li>
                  </ul>
                </div>
                <div v-if="configStatus.warnings.length > 0" class="mt-2">
                  <strong>Warnings:</strong>
                  <ul>
                    <li v-for="warning in configStatus.warnings" :key="warning">{{ warning }}</li>
                  </ul>
                </div>
              </v-alert>

              <!-- Health Check Section -->
              <v-card class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Health Check</v-card-title>
                <v-card-text>
                  <v-btn 
                    color="primary" 
                    class="ma-2" 
                    @click="runHealthCheck"
                    :loading="loading.healthCheck"
                  >
                    Run Health Check
                  </v-btn>
                  
                  <v-btn 
                    color="info" 
                    class="ma-2" 
                    @click="viewFallbackLogs"
                    :loading="loading.fallbackLogs"
                  >
                    View Fallback Logs
                  </v-btn>
                  
                  <v-btn 
                    color="warning" 
                    class="ma-2" 
                    @click="clearFallbackLogs"
                    :loading="loading.clearLogs"
                  >
                    Clear Fallback Logs
                  </v-btn>

                  <div v-if="healthCheckResult" class="mt-4">
                    <v-alert 
                      :type="healthCheckResult.success ? 'success' : 'error'"
                    >
                      <strong>Health Check Result:</strong> {{ healthCheckResult.message || healthCheckResult.error }}
                      <div v-if="healthCheckResult.details" class="mt-2">
                        <pre>{{ JSON.stringify(healthCheckResult.details, null, 2) }}</pre>
                      </div>
                    </v-alert>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Error Testing Section -->
              <v-card variant="outlined">
                <v-card-title class="text-h6">Error Testing</v-card-title>
                <v-card-text>
                  <p>Click the buttons below to trigger different types of errors and test CloudWatch logging.</p>
                  
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
                </v-card-text>
              </v-card>
              
              <!-- Results Section -->
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                >
                  <strong>{{ lastResult.title }}:</strong> {{ lastResult.message }}
                  <div v-if="lastResult.details" class="mt-2">
                    <pre>{{ JSON.stringify(lastResult.details, null, 2) }}</pre>
                  </div>
                </v-alert>
              </div>

              <!-- Fallback Logs Display -->
              <div v-if="fallbackLogs && fallbackLogs.length > 0" class="mt-4">
                <v-card variant="outlined">
                  <v-card-title class="text-h6">Fallback Logs ({{ fallbackLogs.length }})</v-card-title>
                  <v-card-text>
                    <div v-for="(log, index) in fallbackLogs.slice(-10)" :key="index" class="mb-2">
                      <v-chip :color="getLogColor(log.level)" small class="mr-2">{{ log.level }}</v-chip>
                      <strong>{{ log.timestamp }}:</strong> {{ log.message }}
                      <div v-if="log.context" class="ml-4 mt-1">
                        <small>{{ JSON.stringify(log.context) }}</small>
                      </div>
                    </div>
                    <div v-if="fallbackLogs.length > 10" class="text-center mt-2">
                      <small>Showing last 10 of {{ fallbackLogs.length }} logs</small>
                    </div>
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
        healthCheck: false,
        fallbackLogs: false,
        clearLogs: false
      },
      lastResult: null,
      healthCheckResult: null,
      fallbackLogs: [],
      configStatus: {}
    };
  },

  mounted() {
    this.loadConfigStatus();
  },
  
  methods: {
    loadConfigStatus() {
      this.configStatus = cloudWatchLogger.getConfig();
    },

    async runHealthCheck() {
      this.loading.healthCheck = true;
      try {
        this.healthCheckResult = await cloudWatchLogger.healthCheck();
      } catch (error) {
        this.healthCheckResult = {
          success: false,
          error: error.message,
          details: { stack: error.stack }
        };
      } finally {
        this.loading.healthCheck = false;
      }
    },

    async viewFallbackLogs() {
      this.loading.fallbackLogs = true;
      try {
        const result = await cloudWatchLogger.getFallbackLogs();
        if (result.success) {
          this.fallbackLogs = result.logs;
          this.lastResult = {
            success: true,
            title: 'Fallback Logs',
            message: `Retrieved ${result.logs.length} fallback log entries`
          };
        } else {
          this.lastResult = {
            success: false,
            title: 'Fallback Logs Error',
            message: result.error
          };
        }
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'Fallback Logs Error',
          message: error.message
        };
      } finally {
        this.loading.fallbackLogs = false;
      }
    },

    async clearFallbackLogs() {
      this.loading.clearLogs = true;
      try {
        const result = await cloudWatchLogger.clearFallbackLogs();
        if (result.success) {
          this.fallbackLogs = [];
          this.lastResult = {
            success: true,
            title: 'Clear Logs',
            message: 'Fallback logs cleared successfully'
          };
        } else {
          this.lastResult = {
            success: false,
            title: 'Clear Logs Error',
            message: result.error
          };
        }
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'Clear Logs Error',
          message: error.message
        };
      } finally {
        this.loading.clearLogs = false;
      }
    },

    getLogColor(level) {
      switch (level) {
        case 'ERROR': return 'error';
        case 'WARN': return 'warning';
        case 'INFO': return 'info';
        case 'DEBUG': return 'secondary';
        default: return 'primary';
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
        
        const result = await cloudWatchLogger.paymentError(
          new Error('Payment processing failed - insufficient funds'),
          'txn_123456789'
        );
        
        this.lastResult = {
          success: result.success,
          title: 'Payment Error Test',
          message: result.success ? 'Payment error logged to CloudWatch successfully!' : `Failed to log payment error: ${result.error}`,
          details: result
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'Payment Error Test',
          message: `Failed to log payment error: ${error.message}`,
          details: { stack: error.stack }
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
        
        const result = await cloudWatchLogger.databaseError(
          new Error('Database connection timeout'),
          'user_query'
        );
        
        this.lastResult = {
          success: result.success,
          title: 'Database Error Test',
          message: result.success ? 'Database error logged to CloudWatch successfully!' : `Failed to log database error: ${result.error}`,
          details: result
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'Database Error Test',
          message: `Failed to log database error: ${error.message}`,
          details: { stack: error.stack }
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
        
        const result = await cloudWatchLogger.apiError(
          new Error('External API returned 500 error'),
          '/api/external-service'
        );
        
        this.lastResult = {
          success: result.success,
          title: 'API Error Test',
          message: result.success ? 'API error logged to CloudWatch successfully!' : `Failed to log API error: ${result.error}`,
          details: result
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'API Error Test',
          message: `Failed to log API error: ${error.message}`,
          details: { stack: error.stack }
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
        
        const result = await cloudWatchLogger.firebaseError(
          new Error('Firebase authentication failed'),
          'signIn'
        );
        
        this.lastResult = {
          success: result.success,
          title: 'Firebase Error Test',
          message: result.success ? 'Firebase error logged to CloudWatch successfully!' : `Failed to log Firebase error: ${result.error}`,
          details: result
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'Firebase Error Test',
          message: `Failed to log Firebase error: ${error.message}`,
          details: { stack: error.stack }
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
        
        const result = await cloudWatchLogger.error(
          'General system error - website crash simulation',
          { 
            component: 'TestCloudWatch',
            action: 'testGeneralError',
            timestamp: new Date().toISOString()
          }
        );
        
        this.lastResult = {
          success: result.success,
          title: 'General Error Test',
          message: result.success ? 'General error logged to CloudWatch successfully!' : `Failed to log general error: ${result.error}`,
          details: result
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          title: 'General Error Test',
          message: `Failed to log general error: ${error.message}`,
          details: { stack: error.stack }
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
