export const cloudWatchConfig = {
  region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
  accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
  logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || 'acm-website-logs',
  logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'error-stream',
  activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'activity-stream'
};

/**
 * Validates CloudWatch configuration and credentials
 * @returns {Object} Validation result with status and details
 */
export function validateCloudWatchConfig() {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    status: 'unknown'
  };

  // Check required environment variables
  if (!cloudWatchConfig.accessKeyId) {
    validation.errors.push('Missing VUE_APP_AWS_ACCESS_KEY_ID environment variable');
    validation.isValid = false;
  }

  if (!cloudWatchConfig.secretAccessKey) {
    validation.errors.push('Missing VUE_APP_AWS_SECRET_ACCESS_KEY environment variable');
    validation.isValid = false;
  }

  if (!cloudWatchConfig.region) {
    validation.warnings.push('AWS region not specified, using default: us-east-1');
  }

  if (!cloudWatchConfig.logGroupName) {
    validation.warnings.push('Log group name not specified, using default: acm-website-logs');
  }

  // Validate credential format
  if (cloudWatchConfig.accessKeyId && !cloudWatchConfig.accessKeyId.match(/^AKIA[0-9A-Z]{16}$/)) {
    validation.warnings.push('AWS Access Key ID format appears invalid');
  }

  if (cloudWatchConfig.secretAccessKey && cloudWatchConfig.secretAccessKey.length !== 40) {
    validation.warnings.push('AWS Secret Access Key length appears invalid');
  }

  // Set overall status
  if (validation.errors.length > 0) {
    validation.status = 'invalid';
  } else if (validation.warnings.length > 0) {
    validation.status = 'warning';
  } else {
    validation.status = 'valid';
  }

  return validation;
}

/**
 * Gets a safe version of the config for logging (without sensitive data)
 * @returns {Object} Safe configuration object
 */
export function getSafeConfig() {
  return {
    region: cloudWatchConfig.region,
    logGroupName: cloudWatchConfig.logGroupName,
    logStreamName: cloudWatchConfig.logStreamName,
    activityStreamName: cloudWatchConfig.activityStreamName,
    hasAccessKey: !!cloudWatchConfig.accessKeyId,
    hasSecretKey: !!cloudWatchConfig.secretAccessKey,
    accessKeyPrefix: cloudWatchConfig.accessKeyId ? cloudWatchConfig.accessKeyId.substring(0, 8) + '...' : 'missing'
  };
}
