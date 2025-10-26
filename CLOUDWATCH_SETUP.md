# CloudWatch Integration Setup Guide

This guide walks you through setting up CloudWatch logging for your Vue.js ACM website using Firebase Functions for secure logging.

## Architecture Overview

The CloudWatch integration uses a secure architecture:
- Frontend logs errors via Firebase Functions (no AWS credentials exposed)
- Firebase Functions securely send logs to CloudWatch using server-side credentials
- AWS credentials are stored as Firebase Function secrets

## Prerequisites

1. AWS Account with CloudWatch Logs permissions
2. AWS Access Key ID and Secret Access Key
3. Firebase project with Functions enabled
4. Your website deployed and accessible

## Step 1: Get AWS Credentials

```bash
# Get your AWS access keys
aws configure list
# Note down: AWS Access Key ID and Secret Access Key
```

## Step 2: Configure Firebase Function Secrets

### Set up CloudWatch secrets for Firebase Functions
```bash
# Navigate to your functions directory
cd functions

# Set the CloudWatch secrets (replace with your actual values)
firebase functions:secrets:set cloudWatchSecrets --data '{
  "AWS_ACCESS_KEY_ID": "your_access_key_here",
  "AWS_SECRET_ACCESS_KEY": "your_secret_key_here", 
  "AWS_REGION": "us-east-1",
  "LOG_GROUP_NAME": "acm-website-logs",
  "ERROR_STREAM_NAME": "error-stream",
  "ACTIVITY_STREAM_NAME": "activity-stream"
}'
```

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

## Step 4: Deploy Firebase Functions

```bash
# Install dependencies
cd functions
npm install

# Deploy the CloudWatch logging function
firebase deploy --only functions:logToCloudWatch
```

## Step 5: Deploy Your Website

```bash
# Build and deploy your updated website
npm run build
# Deploy to your hosting platform
```

## Step 6: Test the Integration

### Test via Browser
Visit: `https://your-website.com/test-cloudwatch`

Click the test buttons to trigger different error types:
- Test Payment Error
- Test Database Error  
- Test API Error
- Test Firebase Error
- Test General Error

### Test via Command Line
```bash
# Test general error logging
curl "https://your-website.com/test-cloudwatch"
```

## Step 7: Verify CloudWatch Logs

### Check if logs arrived (wait 1-2 minutes)
```bash
# Check error logs
aws logs filter-log-events \
  --log-group-name acm-website-logs \
  --log-stream-name error-stream \
  --start-time $(date -v-5M +%s000)

# Check activity logs
aws logs filter-log-events \
  --log-group-name acm-website-logs \
  --log-stream-name activity-stream \
  --start-time $(date -v-5M +%s000)
```

### Check if alarm triggered
```bash
aws cloudwatch describe-alarms --alarm-names QuietOps-ErrorSpike
```

## Step 8: Monitor Real Errors

The integration will automatically log:

**Error Logs (error-stream):**
- Vue component errors
- Firebase operation failures
- Unhandled JavaScript errors
- Unhandled promise rejections
- Custom errors from your components

**Activity Logs (activity-stream):**
- Page views and navigation
- Button clicks
- Form submissions
- User authentication events
- Link clicks
- Form field interactions
- All user actions with context

## Troubleshooting

### Common Issues

1. **"Failed to log to CloudWatch" errors**
   - Check Firebase Function secrets are set correctly
   - Verify AWS credentials have proper IAM permissions
   - Ensure CloudWatch log group exists
   - Check Firebase Functions deployment status

2. **Firebase Function errors**
   - Check function logs: `firebase functions:log`
   - Verify secrets are properly configured
   - Ensure AWS SDK is installed in functions

3. **Frontend connection issues**
   - Verify Firebase Functions are deployed
   - Check browser console for Firebase errors
   - Ensure Firebase project is properly configured

### Debug Mode
Set `NODE_ENV=development` to see detailed console logs.

### Check Firebase Function Status
```bash
# View function logs
firebase functions:log --only logToCloudWatch

# Check function deployment
firebase functions:list
```

## Security Notes

- ✅ AWS credentials are securely stored as Firebase Function secrets
- ✅ No sensitive credentials exposed to frontend/browser
- ✅ All logging goes through secure Firebase Functions
- ✅ Frontend cannot directly access AWS services
- Never commit AWS credentials to version control
- Regularly rotate your AWS access keys
- Monitor Firebase Function usage and costs

## Next Steps

1. Set up CloudWatch alarms for error spikes
2. Create dashboards for monitoring
3. Add more specific error logging to critical components
4. Set up automated notifications for critical errors
5. Configure log retention policies in CloudWatch
