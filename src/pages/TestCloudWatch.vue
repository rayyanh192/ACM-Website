<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card>
            <v-card-title>CloudWatch Integration Test & Diagnostics</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration and provides comprehensive diagnostics for monitoring system health.</p>
              
              <!-- Configuration Status -->
              <v-card class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Configuration Status</v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="12" md="6">
                      <v-chip 
                        :color="configStatus.color" 
                        :prepend-icon="configStatus.icon"
                        class="mb-2"
                      >
                        {{ configStatus.text }}
                      </v-chip>
                      <div v-if="cloudWatchStatus">
                        <p><strong>Region:</strong> {{ cloudWatchStatus.config.region }}</p>
                        <p><strong>Log Group:</strong> {{ cloudWatchStatus.config.logGroupName }}</p>
                        <p><strong>Has Credentials:</strong> {{ cloudWatchStatus.config.hasCredentials ? 'Yes' : 'No' }}</p>
                        <p><strong>CloudWatch Available:</strong> {{ cloudWatchStatus.isAvailable ? 'Yes' : 'No' }}</p>
                      </div>
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-btn 
                        color="info" 
                        @click="runDiagnostics"
                        :loading="loading.diagnostics"
                        class="mb-2"
                      >
                        Run Full Diagnostics
                      </v-btn>
                      <v-btn 
                        color="secondary" 
                        @click="checkHealth"
                        :loading="loading.health"
                        class="mb-2 ml-2"
                      >
                        Check Health
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Error Testing Buttons -->
              <v-card class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Error Testing</v-card-title>
                <v-card-text>
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

              <!-- Health Status -->
              <v-card v-if="healthStatus" class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Health Monitor Status</v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="12" md="6">
                      <p><strong>CloudWatch Health:</strong> 
                        <v-chip :color="getHealthColor(healthStatus.cloudWatch)" size="small">
                          {{ healthStatus.cloudWatch }}
                        </v-chip>
                      </p>
                      <p><strong>Last Check:</strong> {{ formatDate(healthStatus.lastCheck) }}</p>
                      <p><strong>Fallback Errors:</strong> {{ healthStatus.fallbackErrorCount }}</p>
                      <p><strong>Initialized:</strong> {{ healthStatus.isInitialized ? 'Yes' : 'No' }}</p>
                    </v-col>
                    <v-col cols="12" md="6">
                      <div v-if="healthStatus.errors && healthStatus.errors.length > 0">
                        <p><strong>Errors:</strong></p>
                        <v-alert 
                          v-for="error in healthStatus.errors" 
                          :key="error"
                          type="error" 
                          density="compact"
                          class="mb-1"
                        >
                          {{ error }}
                        </v-alert>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Diagnostics Results -->
              <v-card v-if="diagnosticsResults" class="mb-4" variant="outlined">
                <v-card-title class="text-h6">Diagnostics Results</v-card-title>
                <v-card-text>
                  <v-expansion-panels>
                    <v-expansion-panel>
                      <v-expansion-panel-title>Configuration Validation</v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <pre>{{ JSON.stringify(diagnosticsResults.configValidation, null, 2) }}</pre>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                    
                    <v-expansion-panel>
                      <v-expansion-panel-title>CloudWatch Health</v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-chip :color="diagnosticsResults.cloudWatchHealth ? 'success' : 'error'">
                          {{ diagnosticsResults.cloudWatchHealth ? 'Healthy' : 'Unhealthy' }}
                        </v-chip>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                    
                    <v-expansion-panel>
                      <v-expansion-panel-title>Server Endpoints</v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <p><strong>Heartbeat:</strong> 
                          <v-chip :color="getEndpointColor(diagnosticsResults.serverEndpoints.heartbeat)" size="small">
                            {{ getEndpointStatus(diagnosticsResults.serverEndpoints.heartbeat) }}
                          </v-chip>
                        </p>
                        <p><strong>Error Logging:</strong> 
                          <v-chip :color="getEndpointColor(diagnosticsResults.serverEndpoints.errorLogging)" size="small">
                            {{ getEndpointStatus(diagnosticsResults.serverEndpoints.errorLogging) }}
                          </v-chip>
                        </p>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                    
                    <v-expansion-panel>
                      <v-expansion-panel-title>Full Results</v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <pre>{{ JSON.stringify(diagnosticsResults, null, 2) }}</pre>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </v-card-text>
              </v-card>
              
              <!-- Test Results -->
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
import { validateCloudWatchConfig } from '@/config/cloudwatch';

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
        diagnostics: false,
        health: false
      },
      lastResult: null,
      healthStatus: null,
      diagnosticsResults: null,
      cloudWatchStatus: null
    };
  },

  computed: {
    configStatus() {
      const validation = validateCloudWatchConfig();
      
      if (validation.status === 'valid') {
        return {
          text: 'Configuration Valid',
          color: 'success',
          icon: 'mdi-check-circle'
        };
      } else if (validation.status === 'warning') {
        return {
          text: 'Configuration Warnings',
          color: 'warning',
          icon: 'mdi-alert'
        };
      } else {
        return {
          text: 'Configuration Invalid',
          color: 'error',
          icon: 'mdi-close-circle'
        };
      }
    }
  },

  async mounted() {
    // Get initial status
    this.cloudWatchStatus = cloudWatchLogger.getStatus();
    await this.checkHealth();
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

    async checkHealth() {
      this.loading.health = true;
      try {
        if (window.healthMonitor) {
          this.healthStatus = window.healthMonitor.getHealthStatus();
          await window.healthMonitor.checkCloudWatchHealth();
          this.healthStatus = window.healthMonitor.getHealthStatus();
        } else {
          this.healthStatus = {
            cloudWatch: 'unknown',
            lastCheck: null,
            errors: ['Health monitor not available'],
            fallbackErrorCount: 0,
            isInitialized: false
          };
        }
      } catch (error) {
        console.error('Health check failed:', error);
        this.lastResult = {
          success: false,
          message: `Health check failed: ${error.message}`
        };
      } finally {
        this.loading.health = false;
      }
    },

    async runDiagnostics() {
      this.loading.diagnostics = true;
      try {
        if (window.healthMonitor) {
          this.diagnosticsResults = await window.healthMonitor.runDiagnostics();
          this.lastResult = {
            success: true,
            message: 'Diagnostics completed successfully!'
          };
        } else {
          this.lastResult = {
            success: false,
            message: 'Health monitor not available for diagnostics'
          };
        }
      } catch (error) {
        console.error('Diagnostics failed:', error);
        this.lastResult = {
          success: false,
          message: `Diagnostics failed: ${error.message}`
        };
      } finally {
        this.loading.diagnostics = false;
      }
    },

    getHealthColor(status) {
      switch (status) {
        case 'healthy': return 'success';
        case 'unhealthy': return 'error';
        case 'warning': return 'warning';
        case 'disabled': return 'grey';
        default: return 'info';
      }
    },

    getEndpointColor(status) {
      if (status === true) return 'success';
      if (status === false) return 'error';
      return 'grey';
    },

    getEndpointStatus(status) {
      if (status === true) return 'Available';
      if (status === false) return 'Unavailable';
      return 'Unknown';
    },

    formatDate(dateString) {
      if (!dateString) return 'Never';
      return new Date(dateString).toLocaleString();
    }
  }
};
</script>

<style scoped>
.test-cloudwatch {
  padding: 20px 0;
}
</style>
