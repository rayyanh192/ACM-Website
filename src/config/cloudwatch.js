export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  
  // Timeout and retry configurations
  httpOptions: {
    timeout: 3000, // 3 second timeout instead of default 120s
    connectTimeout: 2000, // 2 second connection timeout
  },
  
  // Retry configuration with exponential backoff
  retryDelayOptions: {
    customBackoff: function(retryCount) {
      return Math.pow(2, retryCount) * 100; // 100ms, 200ms, 400ms, 800ms
    }
  },
  
  maxRetries: 3,
  
  // Connection pool settings
  maxSockets: 10,
  keepAlive: true,
  keepAliveMsecs: 1000,
  
  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: 5, // Number of failures before opening circuit
    resetTimeout: 30000, // 30 seconds before attempting to close circuit
    monitoringPeriod: 60000 // 1 minute monitoring window
  },
  
  // Batching configuration
  batching: {
    enabled: true,
    maxBatchSize: 10,
    maxWaitTime: 2000, // 2 seconds max wait before sending batch
    maxRetainedLogs: 100 // Maximum logs to retain if CloudWatch is unavailable
  }
};
