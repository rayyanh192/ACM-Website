# Enhanced CloudWatch Integration Setup Guide

This guide walks you through setting up the enhanced CloudWatch logging system for your Vue.js ACM website with robust error handling, health monitoring, and fallback mechanisms.

## Prerequisites

1. AWS Account with CloudWatch Logs permissions
2. AWS Access Key ID and Secret Access Key
3. Your website deployed and accessible

## Step 1: Get AWS Credentials

```bash
# Get your AWS access keys
aws configure list
# Note down: AWS Access Key ID and Secret Access Key
```

## Step 2: Set Environment Variables

### Option A: Local Development (.env file)
Create a `.env` file in your project root:
```bash
VUE_APP_AWS_ACCESS_KEY_ID=your_access_key_here
VUE_APP_AWS_SECRET_ACCESS_KEY=your_secret_key_here
VUE_APP_AWS_REGION=us-east-1
VUE_APP_LOG_GROUP_NAME=/aws/lambda/checkout-api
VUE_APP_LOG_STREAM_NAME=website-errors
VUE_APP_ACTIVITY_STREAM_NAME=website-activity
VUE_APP_ENABLE_CLOUDWATCH_DEV=true
```

### Option B: EC2 Server Environment
Add to your EC2 instance environment:
```bash
export VUE_APP_AWS_ACCESS_KEY_ID=your_access_key_here
export VUE_APP_AWS_SECRET_ACCESS_KEY=your_secret_key_here
export VUE_APP_AWS_REGION=us-east-1
export VUE_APP_LOG_GROUP_NAME=/aws/lambda/checkout-api
export VUE_APP_LOG_STREAM_NAME=website-errors
export VUE_APP_ACTIVITY_STREAM_NAME=website-activity
```

### Option C: Hosting Platform (Vercel/Netlify)
Add in your hosting platform's environment variables section:
- VUE_APP_AWS_ACCESS_KEY_ID
- VUE_APP_AWS_SECRET_ACCESS_KEY
- VUE_APP_AWS_REGION
- VUE_APP_LOG_GROUP_NAME
- VUE_APP_LOG_STREAM_NAME
- VUE_APP_ACTIVITY_STREAM_NAME

## Step 3: AWS IAM Permissions

Your AWS credentials need these CloudWatch Logs permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

## Step 4: Deploy Your Website

```bash
# Build and deploy your updated website
npm run build
# Deploy to your hosting platform
```

## Step 5: Test the Integration

### Test via Enhanced Test Page
Visit: `https://your-website.com/test-cloudwatch`

The enhanced test page now includes:
- **Configuration Status**: Shows if CloudWatch is properly configured
- **Health Check**: Tests the connection and logging functionality
- **Fallback Logs**: View logs stored locally when CloudWatch is unavailable
- **Error Testing**: Test different types of errors with detailed results

### Test via Health Check Endpoint
Visit: `https://your-website.com/health`

This endpoint provides a simple status check for monitoring systems:
- Returns `HEALTHY`, `DEGRADED`, `UNHEALTHY`, or `ERROR`
- Shows configuration status and any errors
- Can be used by external monitoring tools

### Test via Command Line
```bash
# Test health check endpoint
curl "https://your-website.com/health"

# Test general error logging
curl "https://your-website.com/test-cloudwatch"
```

## Step 6: Verify CloudWatch Logs

### Check if logs arrived (wait 1-2 minutes)
```bash
# Check error logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/checkout-api \
  --log-stream-name website-errors \
  --start-time $(date -v-5M +%s000)

# Check activity logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/checkout-api \
  --log-stream-name website-activity \
  --start-time $(date -v-5M +%s000)
```

### Check if alarm triggered
```bash
aws cloudwatch describe-alarms --alarm-names QuietOps-ErrorSpike
```

## Step 7: Monitor Real Errors

The enhanced integration automatically logs:

**Error Logs (website-errors stream):**
- Vue component errors with stack traces
- Firebase operation failures
- Unhandled JavaScript errors
- Unhandled promise rejections
- Custom errors from your components
- Enhanced context information

**Activity Logs (website-activity stream):**
- Page views and navigation
- Button clicks
- Form submissions
- User authentication events
- Application lifecycle events
- Health check results

**Fallback Logging:**
- When CloudWatch is unavailable, logs are stored in localStorage
- Fallback logs can be viewed and cleared via the test page
- Automatic retry mechanisms for transient failures

## New Features

### Health Monitoring
- Automatic health checks every 5 minutes in production
- Comprehensive testing of configuration, connection, logging, and fallback systems
- Health status available at `/health` endpoint

### Enhanced Error Handling
- Retry logic with exponential backoff for transient failures
- Graceful degradation when CloudWatch is unavailable
- Detailed error reporting and debugging information

### Configuration Validation
- Automatic validation of environment variables
- Environment-aware logging (development vs production)
- Clear error messages for configuration issues

## Troubleshooting

### Common Issues

1. **"Failed to log to CloudWatch" errors**
   - Check AWS credentials are correct
   - Verify IAM permissions
   - Ensure log group exists
   - Check the health endpoint: `/health`

2. **Environment variables not loading**
   - Restart your development server
   - Check variable names start with `VUE_APP_`
   - Verify .env file is in project root
   - Check configuration status on test page

3. **CORS errors**
   - CloudWatch API calls are made from browser
   - Ensure your AWS credentials allow browser access
   - Consider using Firebase Functions as proxy

4. **Health check failures**
   - Visit `/health` to see detailed status
   - Check fallback logs on test page
   - Verify environment variables are set correctly

### Debug Mode
- Set `NODE_ENV=development` to see detailed console logs
- Set `VUE_APP_ENABLE_CLOUDWATCH_DEV=true` to enable CloudWatch in development
- Use the enhanced test page for comprehensive debugging

### Monitoring Integration
- Use `/health` endpoint for external monitoring
- Set up alerts based on health check results
- Monitor fallback log accumulation

## Security Notes

- Never commit AWS credentials to version control
- Use environment variables for all sensitive data
- Consider using AWS IAM roles for EC2 instances
- Regularly rotate your AWS access keys
- Fallback logs in localStorage don't contain sensitive data

## Next Steps

1. Set up CloudWatch alarms for error spikes
2. Create dashboards for monitoring
3. Configure automated notifications for critical errors
4. Set up log retention policies
5. Monitor health check endpoint with external tools

## API Reference

### Health Check Endpoint
- **URL**: `/health`
- **Method**: GET
- **Response**: Plain text status (HEALTHY/DEGRADED/UNHEALTHY/ERROR)

### Test Page
- **URL**: `/test-cloudwatch`
- **Features**: Configuration status, health checks, error testing, fallback log management

### CloudWatch Logger API
```javascript
import { cloudWatchLogger } from '@/utils/cloudWatchLogger';

// Health check
const health = await cloudWatchLogger.healthCheck();

// Get configuration status
const config = cloudWatchLogger.getConfig();

// Enhanced error logging with stack traces
await cloudWatchLogger.error('Error message', { context: 'data' });

// View/clear fallback logs
const logs = await cloudWatchLogger.getFallbackLogs();
await cloudWatchLogger.clearFallbackLogs();
```
