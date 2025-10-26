// CloudWatch configuration with validation and fallback handling
const validateCloudWatchConfig = () => {
  const config = {
    region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
    accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
    logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
    logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
    activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
  };

  // Check if CloudWatch is properly configured
  const isConfigured = config.accessKeyId && config.secretAccessKey;
  
  if (!isConfigured) {
    console.warn('CloudWatch logging is not properly configured. Missing AWS credentials. Logging will be disabled.');
  }

  return {
    ...config,
    isEnabled: isConfigured
  };
};

export const cloudWatchConfig = validateCloudWatchConfig();
