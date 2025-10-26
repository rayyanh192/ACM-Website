// CloudWatch Configuration with validation
export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
};

// Configuration validation
export const validateCloudWatchConfig = () => {
  const issues = [];
  
  if (!cloudWatchConfig.accessKeyId) {
    issues.push('VUE_APP_AWS_ACCESS_KEY_ID is not set');
  }
  
  if (!cloudWatchConfig.secretAccessKey) {
    issues.push('VUE_APP_AWS_SECRET_ACCESS_KEY is not set');
  }
  
  if (!cloudWatchConfig.region) {
    issues.push('VUE_APP_AWS_REGION is not set');
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues,
    config: {
      region: cloudWatchConfig.region,
      logGroupName: cloudWatchConfig.logGroupName,
      logStreamName: cloudWatchConfig.logStreamName,
      activityStreamName: cloudWatchConfig.activityStreamName,
      hasCredentials: !!(cloudWatchConfig.accessKeyId && cloudWatchConfig.secretAccessKey)
    }
  };
};

// Get configuration status for debugging
export const getConfigStatus = () => {
  const validation = validateCloudWatchConfig();
  return {
    ...validation,
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString()
  };
};
