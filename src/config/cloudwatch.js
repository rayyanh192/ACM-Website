// Validate required environment variables
function validateCloudWatchConfig() {
  const requiredVars = [
    'VUE_APP_AWS_ACCESS_KEY_ID',
    'VUE_APP_AWS_SECRET_ACCESS_KEY'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`CloudWatch configuration incomplete. Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('CloudWatch logging will be disabled. Set these variables to enable logging.');
    return false;
  }
  
  return true;
}

const isConfigValid = validateCloudWatchConfig();

export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  isValid: isConfigValid
};
