# CloudWatch Integration Setup Guide

This guide walks you through setting up CloudWatch logging for your Vue.js ACM website.

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

### Quick Setup
1. Copy the environment template: `cp .env.example .env`
2. Edit `.env` and fill in your AWS credentials
3. Restart your development server: `npm run dev`

### Option A: Local Development (.env file)
Use the provided template file:
```bash
cp .env.example .env
# Then edit .env with your actual values
```

Required variables in your `.env` file:
```bash
VUE_APP_AWS_ACCESS_KEY_ID=your_access_key_here
VUE_APP_AWS_SECRET_ACCESS_KEY=your_secret_key_here
VUE_APP_AWS_REGION=us-east-1
VUE_APP_LOG_GROUP_NAME=acm-website-logs
VUE_APP_LOG_STREAM_NAME=error-stream
VUE_APP_ACTIVITY_STREAM_NAME=activity-stream
```

### Option B: EC2 Server Environment
Add to your EC2 instance environment:
```bash
export VUE_APP_AWS_ACCESS_KEY_ID=your_access_key_here
export VUE_APP_AWS_SECRET_ACCESS_KEY=your_secret_key_here
export VUE_APP_AWS_REGION=us-east-1
```

### Option C: Hosting Platform (Vercel/Netlify)
Add in your hosting platform's environment variables section:
- VUE_APP_AWS_ACCESS_KEY_ID
- VUE_APP_AWS_SECRET_ACCESS_KEY
- VUE_APP_AWS_REGION

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

The integration will automatically log:

**Error Logs (website-errors stream):**
- Vue component errors
- Firebase operation failures
- Unhandled JavaScript errors
- Unhandled promise rejections
- Custom errors from your components

**Activity Logs (website-activity stream):**
- Page views and navigation
- Button clicks
- Form submissions
- User authentication events
- Link clicks
- Form field interactions
- All user actions with context

## Troubleshooting

### Common Issues

1. **"CloudWatch logging disabled" warnings**
   - Check that all required environment variables are set
   - Copy `.env.example` to `.env` and fill in your values
   - Verify variable names start with `VUE_APP_`
   - Restart your development server after changes

2. **"Failed to log to CloudWatch" errors**
   - Check AWS credentials are correct
   - Verify IAM permissions (see Step 3)
   - Ensure log group exists or will be auto-created
   - Check AWS region is correct

3. **Environment variables not loading**
   - Restart your development server
   - Check variable names start with `VUE_APP_`
   - Verify .env file is in project root (not in src/ folder)
   - Ensure .env file is not committed to git (.gitignore should exclude it)

4. **CORS errors**
   - CloudWatch API calls are made from browser
   - Ensure your AWS credentials allow browser access
   - Consider using Firebase Functions as proxy for production

5. **"CloudWatch credentials may be invalid" warnings**
   - Double-check your AWS Access Key ID and Secret Access Key
   - Ensure the IAM user has the required CloudWatch permissions
   - Try regenerating your AWS credentials if they're old

### Debug Mode
Set `NODE_ENV=development` to see detailed console logs.

## Security Notes

- Never commit AWS credentials to version control
- Use environment variables for all sensitive data
- Consider using AWS IAM roles for EC2 instances
- Regularly rotate your AWS access keys

## Next Steps

1. Set up CloudWatch alarms for error spikes
2. Create dashboards for monitoring
3. Add more specific error logging to critical components
4. Set up automated notifications for critical errors
