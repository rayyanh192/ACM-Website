export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  
  // Enhanced configuration for connection management
  timeout: parseInt(process.env.VUE_APP_CLOUDWATCH_TIMEOUT) || 10000,
  retryAttempts: parseInt(process.env.VUE_APP_CLOUDWATCH_RETRY_ATTEMPTS) || 3,
  retryDelay: parseInt(process.env.VUE_APP_CLOUDWATCH_RETRY_DELAY) || 1000,
  
  // Connection pool settings
  maxConnections: parseInt(process.env.VUE_APP_MAX_CONNECTIONS) || 10,
  connectionTimeout: parseInt(process.env.VUE_APP_CONNECTION_TIMEOUT) || 30000,
  
  // Payment service settings
  paymentTimeout: parseInt(process.env.VUE_APP_PAYMENT_TIMEOUT) || 30000,
  paymentRetryAttempts: parseInt(process.env.VUE_APP_PAYMENT_RETRY_ATTEMPTS) || 3,
  
  // Database settings
  databaseTimeout: parseInt(process.env.VUE_APP_DATABASE_TIMEOUT) || 10000,
  databaseRetryAttempts: parseInt(process.env.VUE_APP_DATABASE_RETRY_ATTEMPTS) || 3,
  
  // Monitoring settings
  enableMetrics: process.env.VUE_APP_ENABLE_METRICS !== 'false',
  metricsInterval: parseInt(process.env.VUE_APP_METRICS_INTERVAL) || 60000
};
