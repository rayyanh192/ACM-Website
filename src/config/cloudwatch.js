// CloudWatch configuration with fallback handling
const config = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
};

// Validate required configuration
const isConfigValid = () => {
  return config.accessKeyId && config.secretAccessKey;
};

// Export configuration with validation helper
export const cloudWatchConfig = {
  ...config,
  isValid: isConfigValid()
};

// Log configuration status (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('CloudWatch Config Status:', {
    region: config.region,
    logGroupName: config.logGroupName,
    hasCredentials: !!config.accessKeyId && !!config.secretAccessKey,
    isValid: cloudWatchConfig.isValid
  });
}
