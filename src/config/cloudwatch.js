export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream',
  
  // Check if CloudWatch is properly configured
  isConfigured() {
    return !!(this.accessKeyId && this.secretAccessKey);
  },
  
  // Get configuration status for debugging
  getStatus() {
    return {
      region: this.region,
      hasAccessKey: !!this.accessKeyId,
      hasSecretKey: !!this.secretAccessKey,
      logGroupName: this.logGroupName,
      logStreamName: this.logStreamName,
      activityStreamName: this.activityStreamName,
      isConfigured: this.isConfigured()
    };
  }
};
