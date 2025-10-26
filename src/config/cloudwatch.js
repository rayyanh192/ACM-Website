export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  
  // Connection management settings
  connectionTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_TIMEOUT) || 30000, // 30 seconds
  maxRetries: parseInt(process.env.VUE_APP_CLOUDWATCH_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.VUE_APP_CLOUDWATCH_RETRY_DELAY) || 1000, // 1 second
  maxConcurrentRequests: parseInt(process.env.VUE_APP_CLOUDWATCH_MAX_CONCURRENT) || 5,
  
  // AWS SDK HTTP options for connection pooling
  httpOptions: {
    timeout: parseInt(process.env.VUE_APP_CLOUDWATCH_TIMEOUT) || 30000,
    connectTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_CONNECT_TIMEOUT) || 5000,
    agent: {
      maxSockets: parseInt(process.env.VUE_APP_CLOUDWATCH_MAX_SOCKETS) || 50,
      keepAlive: true,
      keepAliveMsecs: 1000
    }
  },
  
  // Batch logging settings
  batchSize: parseInt(process.env.VUE_APP_CLOUDWATCH_BATCH_SIZE) || 10,
  batchTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_BATCH_TIMEOUT) || 5000, // 5 seconds
  
  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: parseInt(process.env.VUE_APP_CLOUDWATCH_FAILURE_THRESHOLD) || 5,
    resetTimeout: parseInt(process.env.VUE_APP_CLOUDWATCH_RESET_TIMEOUT) || 60000, // 1 minute
    monitoringPeriod: parseInt(process.env.VUE_APP_CLOUDWATCH_MONITORING_PERIOD) || 10000 // 10 seconds
  }
};
