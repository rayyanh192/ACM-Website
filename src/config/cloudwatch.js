// CloudWatch configuration with validation
const validateConfig = () => {
  const config = {
    region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
    accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
    logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
    logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
    activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
  };

  // Validate required credentials
  const missingVars = [];
  if (!config.accessKeyId) missingVars.push('VUE_APP_AWS_ACCESS_KEY_ID');
  if (!config.secretAccessKey) missingVars.push('VUE_APP_AWS_SECRET_ACCESS_KEY');

  if (missingVars.length > 0) {
    console.warn('CloudWatch logging disabled - Missing environment variables:', missingVars.join(', '));
    console.warn('Set these variables to enable CloudWatch integration');
    return { ...config, isValid: false, missingVars };
  }

  console.log('CloudWatch configuration validated successfully');
  return { ...config, isValid: true, missingVars: [] };
};

export const cloudWatchConfig = validateConfig();

// Helper function to check if CloudWatch is properly configured
export const isCloudWatchEnabled = () => cloudWatchConfig.isValid;

// Get configuration status for debugging
export const getConfigStatus = () => ({
  enabled: cloudWatchConfig.isValid,
  region: cloudWatchConfig.region,
  logGroupName: cloudWatchConfig.logGroupName,
  logStreamName: cloudWatchConfig.logStreamName,
  activityStreamName: cloudWatchConfig.activityStreamName,
  missingVars: cloudWatchConfig.missingVars
});
