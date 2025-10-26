<template>
  <div class="payment-processing">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8">
          <h1>Payment Processing</h1>
          <p class="text-subtitle-1 mb-4">
            This page demonstrates the payment processing functionality with proper error handling
            for the issues identified in the deployment logs.
          </p>
          
          <PaymentHandler />
          
          <v-card class="mt-6">
            <v-card-title>Service Status</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="6">
                  <v-card outlined>
                    <v-card-text>
                      <div class="d-flex align-center">
                        <v-icon 
                          :color="serviceStatus.payment ? 'green' : 'red'"
                          class="mr-2"
                        >
                          {{ serviceStatus.payment ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                        </v-icon>
                        <div>
                          <div class="font-weight-bold">Payment Service</div>
                          <div class="text-caption">
                            {{ serviceStatus.payment ? 'Healthy' : 'Unhealthy' }}
                          </div>
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
                
                <v-col cols="6">
                  <v-card outlined>
                    <v-card-text>
                      <div class="d-flex align-center">
                        <v-icon 
                          :color="serviceStatus.database ? 'green' : 'red'"
                          class="mr-2"
                        >
                          {{ serviceStatus.database ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                        </v-icon>
                        <div>
                          <div class="font-weight-bold">Database Service</div>
                          <div class="text-caption">
                            {{ serviceStatus.database ? 'Healthy' : 'Unhealthy' }}
                          </div>
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
              
              <v-btn 
                color="primary" 
                class="mt-4"
                @click="checkServiceHealth"
                :loading="checkingHealth"
              >
                Refresh Service Status
              </v-btn>
            </v-card-text>
          </v-card>
          
          <v-card class="mt-6">
            <v-card-title>Connection Pool Status</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="12" md="6">
                  <div class="text-h6">Database Connections</div>
                  <v-progress-linear
                    :value="poolUtilization"
                    :color="poolUtilization > 80 ? 'red' : poolUtilization > 60 ? 'orange' : 'green'"
                    height="20"
                    class="mb-2"
                  >
                    <template v-slot:default="{ value }">
                      <strong>{{ Math.ceil(value) }}%</strong>
                    </template>
                  </v-progress-linear>
                  <div class="text-caption">
                    {{ poolStats.currentConnections }}/{{ poolStats.maxConnections }} connections used
                  </div>
                </v-col>
                
                <v-col cols="12" md="6">
                  <div class="text-body-2">
                    <div>Active: {{ poolStats.busyConnections }}</div>
                    <div>Idle: {{ poolStats.idleConnections }}</div>
                    <div>Waiting: {{ poolStats.waitingQueue }}</div>
                  </div>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import PaymentHandler from '@/components/PaymentHandler.vue';
import paymentService from '@/services/paymentService';
import databaseService from '@/services/databaseService';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'PaymentProcessing',
  
  components: {
    PaymentHandler
  },
  
  data() {
    return {
      serviceStatus: {
        payment: false,
        database: false
      },
      poolStats: {
        maxConnections: 20,
        currentConnections: 0,
        busyConnections: 0,
        idleConnections: 0,
        waitingQueue: 0
      },
      checkingHealth: false,
      healthCheckInterval: null
    };
  },
  
  computed: {
    poolUtilization() {
      return (this.poolStats.currentConnections / this.poolStats.maxConnections) * 100;
    }
  },
  
  methods: {
    async checkServiceHealth() {
      this.checkingHealth = true;
      
      try {
        // Check payment service health
        this.serviceStatus.payment = await paymentService.healthCheck();
        
        // Check database service health
        this.serviceStatus.database = await databaseService.healthCheck();
        
        // Get database pool statistics
        this.poolStats = databaseService.getPoolStats();
        
        await cloudWatchLogger.info('Service health check completed', {
          type: 'health_check',
          paymentService: this.serviceStatus.payment,
          databaseService: this.serviceStatus.database,
          poolStats: this.poolStats
        });
        
      } catch (error) {
        await cloudWatchLogger.error('Service health check failed', {
          type: 'health_check_error',
          error: error.message
        });
      } finally {
        this.checkingHealth = false;
      }
    },
    
    startHealthMonitoring() {
      // Check service health every 30 seconds
      this.healthCheckInterval = setInterval(() => {
        this.checkServiceHealth();
      }, 30000);
    },
    
    stopHealthMonitoring() {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
    }
  },
  
  async mounted() {
    await cloudWatchLogger.logPageView('PaymentProcessing', {
      component: 'PaymentProcessing'
    });
    
    // Initial health check
    await this.checkServiceHealth();
    
    // Start continuous monitoring
    this.startHealthMonitoring();
  },
  
  beforeDestroy() {
    this.stopHealthMonitoring();
  }
};
</script>

<style scoped>
.payment-processing {
  padding: 20px 0;
}
</style>