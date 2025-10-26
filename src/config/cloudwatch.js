// CloudWatch configuration with validation and fallbacks
const validateConfig = () => {
  const config = {
    region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
    accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
    logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
    logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
    activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
  };

  // Check if CloudWatch is properly configured
  config.isConfigured = !!(config.accessKeyId && config.secretAccessKey);
  
  if (!config.isConfigured) {
    console.warn('CloudWatch logging is not configured. Missing AWS credentials. Logs will fallback to console.');
  }

  return config;
};

export const cloudWatchConfig = validateConfig();
