<template>
  <v-card class="system-health-monitor">
    <v-card-title>
      <v-icon :color="overallHealthColor" class="mr-2">
        {{ overallHealthIcon }}
      </v-icon>
      System Health Monitor
      <v-spacer></v-spacer>
      <v-btn 
        icon 
        @click="refreshHealth" 
        :loading="refreshing"
        size="small"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-card-title>
    
    <v-card-text>
      <v-row>
        <!-- Payment Service Health -->
        <v-col cols="12" md="4">
          <v-card variant="outlined" :color="paymentHealth.color">
            <v-card-title class="text-subtitle-1">
              <v-icon :color="paymentHealth.color" class="mr-2">
                mdi-credit-card
              </v-icon>
              Payment Service
            </v-card-title>
            <v-card-text>
              <div class="text-body-2">
                <div>Status: <strong>{{ paymentHealth.status }}</strong></div>
                <div>Active Connections: {{ paymentHealth.activeConnections }}</div>
                <div>Pool Utilization: {{ paymentHealth.utilization }}%</div>
                <div>Timeout: {{ paymentHealth.timeout }}ms</div>
              </div>
              <v-progress-linear
                :model-value="paymentHealth.utilization"
                :color="paymentHealth.color"
                height="6"
                class="mt-2"
              ></v-progress-linear>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Database Health -->
        <v-col cols="12" md="4">
          <v-card variant="outlined" :color="databaseHealth.color">
            <v-card-title class="text-subtitle-1">
              <v-icon :color="databaseHealth.color" class="mr-2">
                mdi-database
              </v-icon>
              Database
            </v-card-title>
            <v-card-text>
              <div class="text-body-2">
                <div>Status: <strong>{{ databaseHealth.status }}</strong></div>
                <div>Active Queries: {{ databaseHealth.activeConnections }}</div>
                <div>Pool Utilization: {{ databaseHealth.utilization }}%</div>
                <div>Max Connections: {{ databaseHealth.maxConnections }}</div>
              </div>
              <v-progress-linear
                :model-value="databaseHealth.utilization"
                :color="databaseHealth.color"
                height="6"
                class="mt-2"
              ></v-progress-linear>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Connection Pool Health -->
        <v-col cols="12" md="4">
          <v-card variant="outlined" :color="connectionPoolHealth.color">
            <v-card-title class="text-subtitle-1">
              <v-icon :color="connectionPoolHealth.color" class="mr-2">
                mdi-network
              </v-icon>
              Connection Pool
            </v-card-title>
            <v-card-text>
              <div class="text-body-2">
                <div>Status: <strong>{{ connectionPoolHealth.status }}</strong></div>
                <div>Active Requests: {{ connectionPoolHealth.activeRequests }}</div>
                <div>Pool Utilization: {{ connectionPoolHealth.utilization }}%</div>
                <div>Failed Requests: {{ connectionPoolHealth.failedRequests }}</div>
              </div>
              <v-progress-linear
                :model-value="connectionPoolHealth.utilization"
                :color="connectionPoolHealth.color"
                height="6"
                class="mt-2"
              ></v-progress-linear>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Recent Alerts -->
      <v-row v-if="recentAlerts.length > 0" class="mt-4">
        <v-col cols="12">
          <v-card variant="outlined" color="warning">
            <v-card-title class="text-subtitle-1">
              <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
              Recent Alerts
            </v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item
                  v-for="alert in recentAlerts"
                  :key="alert.id"
                  :title="alert.message"
                  :subtitle="alert.timestamp"
                >
                  <template v-slot:prepend>
                    <v-icon :color="alert.severity === 'error' ? 'error' : 'warning'">
                      {{ alert.severity === 'error' ? 'mdi-alert-circle' : 'mdi-alert' }}
                    </v-icon>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
import { paymentHandler } from '@/utils/paymentHandler';
import { databaseConfig } from '@/config/databaseConfig';
import { connectionPool } from '@/utils/connectionPool';
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'SystemHealthMonitor',
  
  data() {
    return {
      refreshing: false,
      healthData: {
        payment: { healthy: true, stats: {} },
        database: { healthy: true, stats: {} },
        connectionPool: { healthy: true, stats: {} }
      },
      recentAlerts: [],
      healthCheckInterval: null
    };
  },

  computed: {
    paymentHealth() {
      const stats = this.healthData.payment.stats;
      const healthy = this.healthData.payment.healthy;
      const utilization = stats.poolUtilization || 0;
      
      return {
        status: healthy ? 'Healthy' : 'Unhealthy',
        color: healthy ? (utilization > 80 ? 'warning' : 'success') : 'error',
        activeConnections: stats.activeConnections || 0,
        utilization: Math.round(utilization),
        timeout: 10000 // From payment handler config
      };
    },

    databaseHealth() {
      const stats = this.healthData.database.stats;
      const healthy = this.healthData.database.healthy;
      const utilization = stats.poolUtilization || 0;
      
      return {
        status: healthy ? 'Healthy' : 'Unhealthy',
        color: healthy ? (utilization > 80 ? 'warning' : 'success') : 'error',
        activeConnections: stats.activeConnections || 0,
        utilization: Math.round(utilization),
        maxConnections: stats.maxConnections || 20
      };
    },

    connectionPoolHealth() {
      const stats = this.healthData.connectionPool.stats;
      const healthy = this.healthData.connectionPool.healthy;
      const utilization = stats.global?.poolUtilization || 0;
      
      return {
        status: healthy ? 'Healthy' : 'Unhealthy',
        color: healthy ? (utilization > 80 ? 'warning' : 'success') : 'error',
        activeRequests: stats.global?.activeRequests || 0,
        utilization: Math.round(utilization),
        failedRequests: stats.global?.failedRequests || 0
      };
    },

    overallHealthColor() {
      const healths = [this.paymentHealth, this.databaseHealth, this.connectionPoolHealth];
      
      if (healths.some(h => h.color === 'error')) return 'error';
      if (healths.some(h => h.color === 'warning')) return 'warning';
      return 'success';
    },

    overallHealthIcon() {
      switch (this.overallHealthColor) {
        case 'error': return 'mdi-alert-circle';
        case 'warning': return 'mdi-alert';
        default: return 'mdi-check-circle';
      }
    }
  },

  async mounted() {
    await this.refreshHealth();
    this.startHealthMonitoring();
  },

  beforeUnmount() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  },

  methods: {
    async refreshHealth() {
      this.refreshing = true;
      
      try {
        // Check payment handler health
        const paymentStats = paymentHandler.getConnectionStatus();
        this.healthData.payment = {
          healthy: paymentStats.poolUtilization < 90,
          stats: paymentStats
        };

        // Check database health
        const dbHealthCheck = await databaseConfig.healthCheck();
        const dbStats = databaseConfig.getConnectionStats();
        this.healthData.database = {
          healthy: dbHealthCheck.healthy,
          stats: dbStats
        };

        // Check connection pool health
        const poolHealthCheck = await connectionPool.healthCheck();
        this.healthData.connectionPool = {
          healthy: poolHealthCheck.healthy,
          stats: poolHealthCheck.status
        };

        // Log health status to CloudWatch
        await cloudWatchLogger.systemHealth('payment_service', 
          this.healthData.payment.healthy ? 'healthy' : 'unhealthy', 
          paymentStats
        );
        
        await cloudWatchLogger.systemHealth('database', 
          this.healthData.database.healthy ? 'healthy' : 'unhealthy', 
          dbStats
        );
        
        await cloudWatchLogger.systemHealth('connection_pool', 
          this.healthData.connectionPool.healthy ? 'healthy' : 'unhealthy', 
          poolHealthCheck.status
        );

        // Check for alerts
        this.checkForAlerts();

      } catch (error) {
        console.error('Health check failed:', error);
        await cloudWatchLogger.error('System health check failed', {
          error: error.message,
          component: 'SystemHealthMonitor'
        });
      } finally {
        this.refreshing = false;
      }
    },

    checkForAlerts() {
      const alerts = [];
      
      // Check payment service alerts
      if (this.paymentHealth.utilization > 80) {
        alerts.push({
          id: `payment_${Date.now()}`,
          message: `Payment service pool utilization high: ${this.paymentHealth.utilization}%`,
          severity: this.paymentHealth.utilization > 90 ? 'error' : 'warning',
          timestamp: new Date().toLocaleString()
        });
      }

      // Check database alerts
      if (this.databaseHealth.utilization > 80) {
        alerts.push({
          id: `database_${Date.now()}`,
          message: `Database connection pool utilization high: ${this.databaseHealth.utilization}%`,
          severity: this.databaseHealth.utilization > 90 ? 'error' : 'warning',
          timestamp: new Date().toLocaleString()
        });
      }

      // Check connection pool alerts
      if (this.connectionPoolHealth.utilization > 80) {
        alerts.push({
          id: `connection_${Date.now()}`,
          message: `HTTP connection pool utilization high: ${this.connectionPoolHealth.utilization}%`,
          severity: this.connectionPoolHealth.utilization > 90 ? 'error' : 'warning',
          timestamp: new Date().toLocaleString()
        });
      }

      // Add new alerts and keep only recent ones
      this.recentAlerts = [...alerts, ...this.recentAlerts].slice(0, 5);
    },

    startHealthMonitoring() {
      // Refresh health every 30 seconds
      this.healthCheckInterval = setInterval(() => {
        this.refreshHealth();
      }, 30000);
    }
  }
};
</script>

<style scoped>
.system-health-monitor {
  margin: 20px 0;
}

.text-subtitle-1 {
  font-weight: 600;
}

.v-progress-linear {
  border-radius: 4px;
}
</style>