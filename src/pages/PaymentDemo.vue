<template>
  <div class="payment-demo">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card>
            <v-card-title>
              <v-icon left color="primary">mdi-credit-card-multiple</v-icon>
              Payment Processing Demo
            </v-card-title>
            
            <v-card-text>
              <v-alert
                type="info"
                outlined
                class="mb-4"
              >
                <div class="font-weight-bold">Payment Service Demo</div>
                <div class="mt-2">
                  This demo showcases the payment processing system with comprehensive timeout handling, 
                  retry logic, and error management. All payment operations are logged to CloudWatch 
                  for monitoring and debugging.
                </div>
              </v-alert>

              <v-row>
                <v-col cols="12" md="6">
                  <v-card outlined>
                    <v-card-title class="subtitle-1">
                      <v-icon left>mdi-feature-search</v-icon>
                      Features
                    </v-card-title>
                    <v-card-text>
                      <v-list dense>
                        <v-list-item>
                          <v-list-item-icon>
                            <v-icon color="success">mdi-clock-check</v-icon>
                          </v-list-item-icon>
                          <v-list-item-content>
                            <v-list-item-title>Timeout Management</v-list-item-title>
                            <v-list-item-subtitle>30-second payment processing timeout</v-list-item-subtitle>
                          </v-list-item-content>
                        </v-list-item>
                        
                        <v-list-item>
                          <v-list-item-icon>
                            <v-icon color="info">mdi-refresh</v-icon>
                          </v-list-item-icon>
                          <v-list-item-content>
                            <v-list-item-title>Retry Logic</v-list-item-title>
                            <v-list-item-subtitle>Automatic retry with exponential backoff</v-list-item-subtitle>
                          </v-list-item-content>
                        </v-list-item>
                        
                        <v-list-item>
                          <v-list-item-icon>
                            <v-icon color="warning">mdi-shield-check</v-icon>
                          </v-list-item-icon>
                          <v-list-item-content>
                            <v-list-item-title>Circuit Breaker</v-list-item-title>
                            <v-list-item-subtitle>Service resilience and failure protection</v-list-item-subtitle>
                          </v-list-item-content>
                        </v-list-item>
                        
                        <v-list-item>
                          <v-list-item-icon>
                            <v-icon color="primary">mdi-cloud-upload</v-icon>
                          </v-list-item-icon>
                          <v-list-item-content>
                            <v-list-item-title>CloudWatch Integration</v-list-item-title>
                            <v-list-item-subtitle>Comprehensive logging and monitoring</v-list-item-subtitle>
                          </v-list-item-content>
                        </v-list-item>
                      </v-list>
                    </v-card-text>
                  </v-card>
                </v-col>
                
                <v-col cols="12" md="6">
                  <v-card outlined>
                    <v-card-title class="subtitle-1">
                      <v-icon left>mdi-information</v-icon>
                      Service Status
                    </v-card-title>
                    <v-card-text>
                      <div v-if="serviceHealth">
                        <v-chip
                          :color="getHealthColor(serviceHealth.circuitBreaker.state)"
                          text-color="white"
                          small
                          class="mb-2"
                        >
                          Circuit Breaker: {{ serviceHealth.circuitBreaker.state }}
                        </v-chip>
                        
                        <div class="caption mb-2">
                          <strong>Active Requests:</strong> {{ serviceHealth.activeRequests }}
                        </div>
                        
                        <div class="caption mb-2">
                          <strong>Payment Timeout:</strong> {{ serviceHealth.config.timeouts.payment / 1000 }}s
                        </div>
                        
                        <div class="caption mb-2">
                          <strong>Max Retry Attempts:</strong> {{ serviceHealth.config.retry.maxAttempts }}
                        </div>
                        
                        <div class="caption">
                          <strong>Default Provider:</strong> {{ serviceHealth.config.provider }}
                        </div>
                      </div>
                      
                      <v-btn
                        color="primary"
                        small
                        outlined
                        @click="refreshServiceHealth"
                        :loading="loadingHealth"
                        class="mt-2"
                      >
                        <v-icon left small>mdi-refresh</v-icon>
                        Refresh Status
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      
      <!-- Payment Processor Component -->
      <v-row justify="center" class="mt-4">
        <v-col cols="12">
          <PaymentProcessor />
        </v-col>
      </v-row>
      
      <!-- Additional Testing Options -->
      <v-row justify="center" class="mt-4">
        <v-col cols="12" md="8">
          <v-card>
            <v-card-title>
              <v-icon left>mdi-test-tube</v-icon>
              Additional Testing
            </v-card-title>
            
            <v-card-text>
              <v-row>
                <v-col cols="12" md="6">
                  <v-btn
                    color="warning"
                    block
                    @click="testTimeoutScenario"
                    :loading="testingTimeout"
                  >
                    <v-icon left>mdi-clock-alert</v-icon>
                    Test Timeout Scenario
                  </v-btn>
                </v-col>
                
                <v-col cols="12" md="6">
                  <v-btn
                    color="info"
                    block
                    @click="viewCloudWatchLogs"
                  >
                    <v-icon left>mdi-cloud-search</v-icon>
                    View CloudWatch Logs
                  </v-btn>
                </v-col>
              </v-row>
              
              <v-alert
                v-if="testResult"
                :type="testResult.success ? 'success' : 'error'"
                class="mt-4"
              >
                {{ testResult.message }}
              </v-alert>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import PaymentProcessor from '@/components/PaymentProcessor.vue';
import paymentService from '@/services/paymentService';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'PaymentDemo',
  
  components: {
    PaymentProcessor
  },
  
  data() {
    return {
      serviceHealth: null,
      loadingHealth: false,
      testingTimeout: false,
      testResult: null
    };
  },
  
  async mounted() {
    await this.refreshServiceHealth();
    
    // Log page view
    await cloudWatchLogger.logPageView('Payment Demo', {
      component: 'PaymentDemo',
      timestamp: new Date().toISOString()
    });
  },
  
  methods: {
    async refreshServiceHealth() {
      this.loadingHealth = true;
      try {
        this.serviceHealth = paymentService.getHealthStatus();
      } catch (error) {
        console.error('Failed to get service health:', error);
      } finally {
        this.loadingHealth = false;
      }
    },
    
    getHealthColor(state) {
      switch (state) {
        case 'CLOSED': return 'success';
        case 'HALF_OPEN': return 'warning';
        case 'OPEN': return 'error';
        default: return 'grey';
      }
    },
    
    async testTimeoutScenario() {
      this.testingTimeout = true;
      this.testResult = null;
      
      try {
        // Log the timeout test
        await cloudWatchLogger.logUserAction('Timeout Test Started', {
          component: 'PaymentDemo',
          testType: 'timeout_scenario'
        });
        
        // Simulate a payment timeout error
        await cloudWatchLogger.paymentError(
          new Error('Payment service timeout - simulated for testing'),
          'test_timeout_' + Date.now(),
          {
            type: 'timeout',
            operation: 'payment_processing',
            timeout: 30000,
            processingTime: 31500,
            simulatedTest: true
          }
        );
        
        this.testResult = {
          success: true,
          message: 'Timeout scenario test completed successfully! Check CloudWatch logs for the timeout error entry.'
        };
        
      } catch (error) {
        this.testResult = {
          success: false,
          message: `Timeout test failed: ${error.message}`
        };
      } finally {
        this.testingTimeout = false;
      }
    },
    
    viewCloudWatchLogs() {
      // Open CloudWatch test page
      this.$router.push('/test-cloudwatch');
    }
  }
};
</script>

<style scoped>
.payment-demo {
  padding: 20px 0;
}

.v-list-item-subtitle {
  font-size: 12px !important;
}

.caption {
  font-size: 12px !important;
  line-height: 1.4;
}
</style>