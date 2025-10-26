/**
 * CloudWatch Configuration with validation and environment detection
 */

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Configuration validation
const validateConfig = () => {
  const config = {
    region: process.env.VUE_APP_AWS_REGION || 'us-east-1',
    accessKeyId: process.env.VUE_APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VUE_APP_AWS_SECRET_ACCESS_KEY,
    logGroupName: process.env.VUE_APP_LOG_GROUP_NAME || '/aws/lambda/checkout-api',
    logStreamName: process.env.VUE_APP_LOG_STREAM_NAME || 'website-errors',
    activityStreamName: process.env.VUE_APP_ACTIVITY_STREAM_NAME || 'website-activity'
  };

  // Validation results
  const validation = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Check required credentials
  if (!config.accessKeyId) {
    validation.errors.push('VUE_APP_AWS_ACCESS_KEY_ID is required');
    validation.isValid = false;
  }

  if (!config.secretAccessKey) {
    validation.errors.push('VUE_APP_AWS_SECRET_ACCESS_KEY is required');
    validation.isValid = false;
  }

  // Development warnings
  if (isDevelopment && validation.isValid) {
    validation.warnings.push('CloudWatch logging is enabled in development mode');
  }

  // Production validation
  if (isProduction && !validation.isValid) {
    validation.errors.push('CloudWatch credentials are required in production');
  }

  return { config, validation };
};

const { config, validation } = validateConfig();

// Export configuration with validation results
export const cloudWatchConfig = {
  ...config,
  // Configuration status
  isConfigured: validation.isValid,
  isDevelopment,
  isProduction,
  validation,
  
  // Helper methods
  getStatus() {
    return {
      configured: this.isConfigured,
      environment: isDevelopment ? 'development' : isProduction ? 'production' : 'unknown',
      errors: validation.errors,
      warnings: validation.warnings
    };
  },

  // Check if logging should be enabled
  shouldLog() {
    // Always log in production if configured
    if (isProduction) {
      return this.isConfigured;
    }
    
    // In development, only log if explicitly configured
    if (isDevelopment) {
      return this.isConfigured && process.env.VUE_APP_ENABLE_CLOUDWATCH_DEV === 'true';
    }
    
    // Default to configured status
    return this.isConfigured;
  }
};

// Log configuration status on import (development only)
if (isDevelopment) {
  console.log('CloudWatch Configuration Status:', cloudWatchConfig.getStatus());
}
