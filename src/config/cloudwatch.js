// Validate required environment variables
const validateConfig = () => {
  const missing = [];
  if (!process.env.VUE_APP_AWS_ACCESS_KEY_ID) missing.push('VUE_APP_AWS_ACCESS_KEY_ID');
  if (!process.env.VUE_APP_AWS_SECRET_ACCESS_KEY) missing.push('VUE_APP_AWS_SECRET_ACCESS_KEY');
  
  if (missing.length > 0) {
    console.warn('CloudWatch logging disabled - missing environment variables:', missing.join(', '));
    return false;
  }
  return true;
};

export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  isConfigured: validateConfig()
};
