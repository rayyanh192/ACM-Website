<template>
  <v-card class="ma-4">
    <v-card-title>
      <v-icon :color="statusColor" class="mr-2">
        {{ statusIcon }}
      </v-icon>
      Application Health Status
    </v-card-title>
    
    <v-card-text>
      <v-row>
        <v-col cols="12" md="6">
          <h4>Frontend Configuration</h4>
          <v-list dense>
            <v-list-item>
              <v-list-item-content>
                <v-list-item-title>Firebase</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip :color="firebaseStatus.color" small>
                    {{ firebaseStatus.text }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
            
            <v-list-item>
              <v-list-item-content>
                <v-list-item-title>CloudWatch Logging</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip :color="cloudWatchStatus.color" small>
                    {{ cloudWatchStatus.text }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-col>
        
        <v-col cols="12" md="6">
          <h4>Backend Services</h4>
          <v-list dense>
            <v-list-item v-if="backendHealth">
              <v-list-item-content>
                <v-list-item-title>Functions Health</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip :color="getServiceColor(backendHealth.status)" small>
                    {{ backendHealth.status }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
            
            <v-list-item v-if="backendHealth?.services">
              <v-list-item-content>
                <v-list-item-title>Firestore</v-list-item-title>
                <v-list-item-subtitle>
                  <v-chip :color="getServiceColor(backendHealth.services.firestore)" small>
                    {{ backendHealth.services.firestore }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
      
      <v-row class="mt-4">
        <v-col cols="12">
          <v-btn @click="checkHealth" :loading="loading" color="primary">
            Refresh Health Check
          </v-btn>
        </v-col>
      </v-row>
      
      <v-row v-if="lastChecked" class="mt-2">
        <v-col cols="12">
          <small class="text-muted">
            Last checked: {{ lastChecked }}
          </small>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script>
import { auth, functions } from '@/firebase';
import { cloudWatchConfig } from '@/config/cloudwatch';

export default {
  name: 'HealthCheck',
  data() {
    return {
      loading: false,
      backendHealth: null,
      lastChecked: null
    };
  },
  
  computed: {
    firebaseStatus() {
      try {
        if (auth.currentUser !== undefined) {
          return { color: 'success', text: 'Connected' };
        }
        return { color: 'warning', text: 'Not Authenticated' };
      } catch (error) {
        return { color: 'error', text: 'Connection Error' };
      }
    },
    
    cloudWatchStatus() {
      if (cloudWatchConfig.isConfigured) {
        return { color: 'success', text: 'Configured' };
      }
      return { color: 'warning', text: 'Not Configured' };
    },
    
    statusColor() {
      if (this.backendHealth?.status === 'healthy' && this.firebaseStatus.color === 'success') {
        return 'success';
      } else if (this.backendHealth?.status === 'degraded' || this.cloudWatchStatus.color === 'warning') {
        return 'warning';
      }
      return 'error';
    },
    
    statusIcon() {
      switch (this.statusColor) {
        case 'success': return 'mdi-check-circle';
        case 'warning': return 'mdi-alert-circle';
        default: return 'mdi-close-circle';
      }
    }
  },
  
  methods: {
    async checkHealth() {
      this.loading = true;
      try {
        const healthCheck = functions.httpsCallable('healthCheck');
        const result = await healthCheck();
        this.backendHealth = result.data;
        this.lastChecked = new Date().toLocaleString();
      } catch (error) {
        console.error('Health check failed:', error);
        this.backendHealth = {
          status: 'error',
          services: {
            firebase: 'error',
            functions: 'error',
            firestore: 'error'
          }
        };
      } finally {
        this.loading = false;
      }
    },
    
    getServiceColor(status) {
      switch (status) {
        case 'operational':
        case 'healthy':
          return 'success';
        case 'degraded':
          return 'warning';
        default:
          return 'error';
      }
    }
  },
  
  mounted() {
    this.checkHealth();
  }
};
</script>