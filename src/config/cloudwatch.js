// CloudWatch configuration with validation and fallback handling
const isProduction = process.env.NODE_ENV === 'production';
const isCloudWatchEnabled = process.env.VUE_APP_ENABLE_CLOUDWATCH === 'true';

// Validate required environment variables
function validateConfig() {
  const requiredVars = [
    'VUE_APP_AWS_REGION',
    'VUE_APP_LOG_GROUP_NAME'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0 && isCloudWatchEnabled) {
    console.warn('CloudWatch logging disabled - missing environment variables:', missing);
    return false;
  }
  
  return isCloudWatchEnabled;
}

const isConfigValid = validateConfig();

export const cloudWatchConfig = {
  enabled: isConfigValid,
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  
  // Configuration validation
  isValid() {
    return this.enabled && this.region && this.logGroupName;
  },
  
  // Get configuration status for debugging
  getStatus() {
    return {
      enabled: this.enabled,
      hasCredentials: !!(this.accessKeyId && this.secretAccessKey),
      region: this.region,
      logGroupName: this.logGroupName,
      isProduction,
      isValid: this.isValid()
    };
  }
};

// Log configuration status in development
if (!isProduction) {
  console.log('CloudWatch Configuration Status:', cloudWatchConfig.getStatus());
}
