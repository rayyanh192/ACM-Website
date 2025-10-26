# Deployment Checklist

## Pre-Deployment

### Environment Variables
- [ ] Copy `.env.example` to `.env` and configure values
- [ ] Verify AWS CloudWatch credentials (optional but recommended)
- [ ] Confirm Firebase project configuration
- [ ] Test environment variables in development

### Code Quality
- [ ] Run `npm run lint` to check for code issues
- [ ] Verify all Firebase functions are working correctly
- [ ] Test admin user management functionality
- [ ] Confirm timezone formatting is consistent

### Build Process
- [ ] Run `npm run build` successfully
- [ ] Verify `dist` folder is generated correctly
- [ ] Check that environment variables are properly injected

## Deployment

### Firebase Functions
- [ ] Deploy functions: `cd functions && npm run deploy`
- [ ] Verify functions are deployed and accessible
- [ ] Test critical functions (addAdmin, removeAdmin, etc.)

### Firebase Hosting
- [ ] Deploy hosting: `firebase deploy --only hosting`
- [ ] Verify website is accessible
- [ ] Test user authentication flow
- [ ] Confirm CloudWatch logging is working (if configured)

## Post-Deployment

### Verification
- [ ] Test user registration and login
- [ ] Verify admin functions work correctly
- [ ] Check event creation and management
- [ ] Confirm email notifications are working
- [ ] Test CloudWatch error logging

### Monitoring
- [ ] Check Firebase console for function errors
- [ ] Monitor CloudWatch logs for application errors
- [ ] Verify website performance and loading times
- [ ] Test on different devices and browsers

## Troubleshooting

### Common Issues

1. **CloudWatch Logging Fails**
   - Check AWS credentials in environment variables
   - Verify CloudWatch log group exists
   - Application will continue working with console logging

2. **Admin Functions Not Working**
   - Verify Firebase functions are deployed
   - Check user authentication and admin claims
   - Review function logs in Firebase console

3. **Build Failures**
   - Check for missing dependencies
   - Verify environment variable syntax
   - Clear node_modules and reinstall if needed

4. **Timezone Issues**
   - All timezone references now use "America/Los_Angeles"
   - Verify moment-timezone is properly installed
   - Check event display formatting

### Emergency Rollback
- Use Firebase console to rollback to previous deployment
- Revert git commits if needed
- Check function deployment history

## Fixed Issues in This Deployment

1. **Critical Security Fix**: Fixed `removeAdmin` function that was granting admin privileges instead of removing them
2. **Timezone Consistency**: Standardized timezone format to "America/Los_Angeles" throughout the application
3. **Environment Variable Handling**: Added proper Vite configuration for environment variables
4. **Error Handling**: Improved CloudWatch logger to handle missing credentials gracefully
5. **Deployment Reliability**: Added fallback mechanisms for missing configurations

## Contact

For deployment issues, check:
- Firebase console logs
- CloudWatch logs (if configured)
- Browser developer console
- This checklist for common solutions