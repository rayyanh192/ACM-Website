<template>
  <div class="test-cloudwatch">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>CloudWatch Integration Test</v-card-title>
            <v-card-text>
              <p>This page tests the CloudWatch logging integration and service functionality. Click the buttons below to trigger different types of errors and test service health.</p>
              
              <div class="mb-4">
                <h3>Incident-Specific Error Tests</h3>
                <p class="text-caption">These tests reproduce the specific errors from the incident logs:</p>
                
                <v-btn 
                  color="error" 
                  class="ma-2" 
                  @click="testPaymentTimeout"
                  :loading="loading.paymentTimeout"
                  :disabled="!servicesInitialized"
                >
                  Test Payment Timeout (5000ms)
                </v-btn>
                
                <v-btn 
                  color="error" 
                  class="ma-2" 
                  @click="testDatabasePoolExhaustion"
                  :loading="loading.databasePool"
                  :disabled="!servicesInitialized"
                >
                  Test DB Pool Exhaustion
                </v-btn>
                
                <v-btn 
                  color="error" 
                  class="ma-2" 
                  @click="testConnectionError"
                  :loading="loading.connectionError"
                  :disabled="!servicesInitialized"
                >
                  Test HTTPSConnectionPool Error
                </v-btn>
              </div>

              <div class="mb-4">
                <h3>Service Tests</h3>
                
                <v-btn 
                  color="success" 
                  class="ma-2" 
                  @click="testRealPaymentProcessing"
                  :loading="loading.payment"
                  :disabled="!servicesInitialized"
                >
                  Test Real Payment Processing
                </v-btn>
                
                <v-btn 
                  color="info" 
                  class="ma-2" 
                  @click="checkServiceHealth"
                  :loading="loading.serviceHealth"
                  :disabled="!servicesInitialized"
                >
                  Check Service Health
                </v-btn>
              </div>

              <div class="mb-4">
                <h3>Original CloudWatch Tests</h3>
              
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
              
              <div v-if="lastResult" class="mt-4">
                <v-alert 
                  :type="lastResult.success ? 'success' : 'error'"
                  :text="lastResult.message"
                ></v-alert>
              </div>

              <!-- Service Statistics -->
              <div v-if="servicesInitialized && serviceStats" class="mt-6">
                <h3>Service Statistics</h3>
                <v-row>
                  <v-col cols="12" md="6">
                    <v-card outlined>
                      <v-card-title class="text-h6">Payment Service</v-card-title>
                      <v-card-text>
                        <div><strong>Total Payments:</strong> {{ serviceStats.payment.totalPayments }}</div>
                        <div><strong>Success Rate:</strong> {{ getSuccessRate(serviceStats.payment) }}%</div>
                        <div><strong>Avg Processing Time:</strong> {{ serviceStats.payment.averageProcessingTime.toFixed(0) }}ms</div>
                        <div><strong>Timeout Errors:</strong> {{ serviceStats.payment.timeoutErrors }}</div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-card outlined>
                      <v-card-title class="text-h6">Database Service</v-card-title>
                      <v-card-text>
                        <div><strong>Total Queries:</strong> {{ serviceStats.database.totalQueries }}</div>
                        <div><strong>Success Rate:</strong> {{ getSuccessRate(serviceStats.database) }}%</div>
                        <div><strong>Avg Response Time:</strong> {{ serviceStats.database.averageResponseTime.toFixed(0) }}ms</div>
                        <div><strong>Failed Queries:</strong> {{ serviceStats.database.failedQueries }}</div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
                
                <v-row class="mt-2">
                  <v-col cols="12" md="6">
                    <v-card outlined>
                      <v-card-title class="text-h6">Payment Connection Pool</v-card-title>
                      <v-card-text>
                        <div><strong>Active Connections:</strong> {{ serviceStats.paymentPool.activeConnections }}/{{ serviceStats.paymentPool.maxConnections }}</div>
                        <div><strong>Pool Utilization:</strong> {{ serviceStats.paymentPool.poolUtilization.toFixed(1) }}%</div>
                        <div><strong>Queued Requests:</strong> {{ serviceStats.paymentPool.queuedRequests }}</div>
                        <div><strong>Pool Exhausted Errors:</strong> {{ serviceStats.paymentPool.poolExhaustedErrors }}</div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-card outlined>
                      <v-card-title class="text-h6">Database Connection Pool</v-card-title>
                      <v-card-text>
                        <div><strong>Active Connections:</strong> {{ serviceStats.databasePool.activeConnections }}/{{ serviceStats.databasePool.maxConnections }}</div>
                        <div><strong>Pool Utilization:</strong> {{ serviceStats.databasePool.poolUtilization.toFixed(1) }}%</div>
                        <div><strong>Queued Requests:</strong> {{ serviceStats.databasePool.queuedRequests }}</div>
                        <div><strong>Pool Exhausted Errors:</strong> {{ serviceStats.databasePool.poolExhaustedErrors }}</div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <!-- Health Status -->
              <div v-if="healthStatus" class="mt-4">
                <h3>Service Health Status</h3>
                <v-alert 
                  :type="healthStatus.overall === 'healthy' ? 'success' : 'warning'"
                  :text="`Overall Status: ${healthStatus.overall.toUpperCase()}`"
                ></v-alert>
                
                <v-row>
                  <v-col v-for="(service, name) in healthStatus.services" :key="name" cols="12" md="3">
                    <v-card :color="service.healthy ? 'success' : 'error'" dark>
                      <v-card-title class="text-h6">{{ name }}</v-card-title>
                      <v-card-text>
                        <div>{{ service.healthy ? 'Healthy' : 'Unhealthy' }}</div>
                        <div v-if="service.status">Status: {{ service.status }}</div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
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
import { serviceManager } from '@/services/serviceManager';

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
        databasePool: false,
        connectionError: false,
        serviceHealth: false
      },
      lastResult: null,
      serviceStats: null,
      healthStatus: null,
      servicesInitialized: false
    };
  },

  async mounted() {
    try {
      await serviceManager.initialize();
      this.servicesInitialized = true;
      serviceManager.startHealthMonitoring();
      
      // Get initial stats
      this.updateServiceStats();
      
      // Update stats every 10 seconds
      this.statsInterval = setInterval(() => {
        this.updateServiceStats();
      }, 10000);
      
    } catch (error) {
      console.error('Failed to initialize services:', error);
      this.lastResult = {
        success: false,
        message: `Failed to initialize services: ${error.message}`
      };
    }
  },

  beforeDestroy() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    serviceManager.stopHealthMonitoring();
  },
  
  methods: {
    updateServiceStats() {
      this.serviceStats = serviceManager.getServiceStats();
    },

    async updateHealthStatus() {
      this.healthStatus = await serviceManager.performHealthCheck();
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
      }
    },

    // New method to test the specific payment timeout error from the incident
    async testPaymentTimeout() {
      this.loading.paymentTimeout = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Payment Timeout', {
          component: 'TestCloudWatch',
          testType: 'payment_timeout'
        });
        
        const result = await serviceManager.simulateError('payment_timeout');
        this.lastResult = {
          success: true,
          message: `Payment timeout error simulated successfully: ${result.error}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to simulate payment timeout: ${error.message}`
        };
      } finally {
        this.loading.paymentTimeout = false;
      }
    },

    // New method to test database connection pool exhaustion
    async testDatabasePoolExhaustion() {
      this.loading.databasePool = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Database Pool Exhaustion', {
          component: 'TestCloudWatch',
          testType: 'database_pool_exhaustion'
        });
        
        const result = await serviceManager.simulateError('database_pool_exhaustion');
        this.lastResult = {
          success: true,
          message: `Database pool exhaustion simulated successfully: ${result.error}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to simulate database pool exhaustion: ${error.message}`
        };
      } finally {
        this.loading.databasePool = false;
      }
    },

    // New method to test connection errors
    async testConnectionError() {
      this.loading.connectionError = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Connection Error', {
          component: 'TestCloudWatch',
          testType: 'connection_error'
        });
        
        const result = await serviceManager.simulateError('connection_error');
        this.lastResult = {
          success: true,
          message: `Connection error simulated successfully: ${result.error}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Failed to simulate connection error: ${error.message}`
        };
      } finally {
        this.loading.connectionError = false;
      }
    },

    // New method to test actual payment processing
    async testRealPaymentProcessing() {
      this.loading.payment = true;
      try {
        await cloudWatchLogger.logButtonClick('Test Real Payment Processing', {
          component: 'TestCloudWatch',
          testType: 'real_payment_processing'
        });
        
        const result = await serviceManager.processPayment(10.00, {
          currency: 'USD',
          description: 'Test payment from CloudWatch test page'
        });
        
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
        this.loading.payment = false;
      }
    },

    // Method to check service health
    async checkServiceHealth() {
      this.loading.serviceHealth = true;
      try {
        await this.updateHealthStatus();
        
        const overallHealthy = this.healthStatus.overall === 'healthy';
        this.lastResult = {
          success: overallHealthy,
          message: `Service health check completed. Overall status: ${this.healthStatus.overall}`
        };
      } catch (error) {
        this.lastResult = {
          success: false,
          message: `Health check failed: ${error.message}`
        };
      } finally {
        this.loading.serviceHealth = false;
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

    getSuccessRate(stats) {
      if (stats.totalPayments > 0) {
        return ((stats.successfulPayments / stats.totalPayments) * 100).toFixed(1);
      } else if (stats.totalQueries > 0) {
        return ((stats.successfulQueries / stats.totalQueries) * 100).toFixed(1);
      }
      return 0;
    }
  }
};
</script>

<style scoped>
.test-cloudwatch {
  padding: 20px 0;
}
</style>
