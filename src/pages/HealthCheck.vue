<template>
  <div class="health-check">
    <div v-if="healthStatus">
      <h1>{{ healthStatus.status.toUpperCase() }}</h1>
      <p>{{ healthStatus.message }}</p>
      <div v-if="healthStatus.errors && healthStatus.errors.length > 0">
        <h3>Errors:</h3>
        <ul>
          <li v-for="error in healthStatus.errors" :key="error">{{ error }}</li>
        </ul>
      </div>
    </div>
    <div v-else>
      <h1>CHECKING</h1>
      <p>Performing health check...</p>
    </div>
  </div>
</template>

<script>
import { healthMonitor } from '@/utils/healthMonitor';

export default {
  name: 'HealthCheck',
  
  data() {
    return {
      healthStatus: null
    };
  },

  async mounted() {
    try {
      // Perform health check
      const results = await healthMonitor.performHealthCheck();
      
      this.healthStatus = {
        status: results.overall,
        message: `Health check completed in ${results.duration}ms`,
        errors: results.errors,
        timestamp: results.timestamp
      };

      // Set appropriate HTTP status based on health
      if (results.overall === 'unhealthy' || results.overall === 'error') {
        // In a real implementation, you'd set HTTP status 503
        console.error('Health check failed:', results);
      }
    } catch (error) {
      this.healthStatus = {
        status: 'error',
        message: `Health check failed: ${error.message}`,
        errors: [error.message]
      };
    }
  }
};
</script>

<style scoped>
.health-check {
  font-family: monospace;
  padding: 20px;
  text-align: center;
}

h1 {
  font-size: 2em;
  margin-bottom: 10px;
}

ul {
  text-align: left;
  display: inline-block;
}
</style>