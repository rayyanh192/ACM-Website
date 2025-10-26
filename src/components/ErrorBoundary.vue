<template>
  <div v-if="hasError" class="error-boundary">
    <v-alert
      type="error"
      variant="tonal"
      class="ma-4"
      :closable="true"
      @click:close="resetError"
    >
      <v-alert-title>Something went wrong</v-alert-title>
      <div class="mt-2">
        <p>{{ errorMessage }}</p>
        <v-btn
          variant="outlined"
          size="small"
          class="mt-2"
          @click="resetError"
        >
          Try Again
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          class="mt-2 ml-2"
          @click="showDetails = !showDetails"
        >
          {{ showDetails ? 'Hide' : 'Show' }} Details
        </v-btn>
      </div>
      <v-expand-transition>
        <div v-show="showDetails" class="mt-3">
          <v-code class="error-details">
            {{ errorDetails }}
          </v-code>
        </div>
      </v-expand-transition>
    </v-alert>
  </div>
  <slot v-else />
</template>

<script>
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

export default {
  name: 'ErrorBoundary',
  data() {
    return {
      hasError: false,
      errorMessage: '',
      errorDetails: '',
      showDetails: false
    };
  },
  errorCaptured(err, instance, info) {
    this.hasError = true;
    this.errorMessage = err.message || 'An unexpected error occurred';
    this.errorDetails = `Error: ${err.message}\nComponent: ${instance?.$options?.name || 'Unknown'}\nInfo: ${info}`;
    
    // Log to CloudWatch
    cloudWatchLogger.componentError(
      err,
      instance?.$options?.name || 'Unknown',
      info
    ).catch(logError => {
      console.error('Failed to log component error to CloudWatch:', logError);
    });
    
    // Prevent the error from propagating further
    return false;
  },
  methods: {
    resetError() {
      this.hasError = false;
      this.errorMessage = '';
      this.errorDetails = '';
      this.showDetails = false;
    }
  }
};
</script>

<style scoped>
.error-boundary {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-details {
  white-space: pre-wrap;
  font-size: 0.875rem;
  background-color: rgba(0, 0, 0, 0.05);
  padding: 12px;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}
</style>