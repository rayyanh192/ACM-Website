# Deployment Checklist - Security Fixes

## Pre-Deployment Verification

### 1. Code Review
- [ ] Verify AWS credentials removed from frontend (`package.json`)
- [ ] Confirm `src/config/cloudwatch.js` deleted
- [ ] Check Firebase Functions include AWS SDK dependency
- [ ] Validate `removeAdmin` function logic corrected
- [ ] Ensure timezone consistency in `formatDateTime`

### 2. Environment Setup
- [ ] Configure AWS credentials in Firebase Functions environment:
  ```bash
  firebase functions:config:set aws.region="us-east-1"
  firebase functions:config:set aws.access_key_id="YOUR_KEY"
  firebase functions:config:set aws.secret_access_key="YOUR_SECRET"
  firebase functions:config:set logging.group_name="acm-website-logs"
  firebase functions:config:set logging.stream_name="error-stream"
  firebase functions:config:set logging.activity_stream="activity-stream"
  ```

## Deployment Steps

### 1. Firebase Functions Deployment
```bash
cd functions
npm install
firebase deploy --only functions
```

**Verify**:
- [ ] `logToCloudWatch` function deployed successfully
- [ ] Updated admin functions deployed
- [ ] No deployment errors in console

### 2. Frontend Deployment
```bash
npm install
npm run build
# Deploy to your hosting platform
```

**Verify**:
- [ ] Build completes without AWS SDK errors
- [ ] Bundle size reduced (AWS SDK removed)
- [ ] No missing dependency warnings

## Post-Deployment Testing

### 1. CloudWatch Logging Test
- [ ] Navigate to `/test-cloudwatch`
- [ ] Test each error type button:
  - [ ] Payment Error
  - [ ] Database Error
  - [ ] API Error
  - [ ] Firebase Error
  - [ ] General Error
- [ ] Verify success messages appear
- [ ] Check CloudWatch logs for entries

### 2. Admin Functions Test
- [ ] Test `addRole` function
- [ ] Test `removeRole` function
- [ ] Test `removeAdmin` function (verify admin privileges actually removed)
- [ ] Verify error handling for invalid inputs

### 3. Security Verification
- [ ] Inspect frontend bundle for AWS credentials (should be none)
- [ ] Verify CloudWatch logging requires authentication
- [ ] Test logging while signed out (should fail gracefully)
- [ ] Check Firebase Functions logs for proper error handling

### 4. Functionality Verification
- [ ] Page navigation logging works
- [ ] Button click logging works
- [ ] Error logging works
- [ ] Authentication state changes logged
- [ ] Form submissions logged

## Rollback Plan

If issues are detected:

### 1. Immediate Rollback
```bash
# Rollback Firebase Functions
firebase functions:delete logToCloudWatch
# Redeploy previous version
git checkout <previous-commit>
firebase deploy --only functions
```

### 2. Frontend Rollback
```bash
# Restore previous frontend version
git checkout <previous-commit>
npm run build
# Redeploy frontend
```

## Monitoring

### 1. CloudWatch Metrics
- [ ] Monitor log ingestion rates
- [ ] Check for error spikes
- [ ] Verify log stream creation

### 2. Firebase Functions
- [ ] Monitor function execution count
- [ ] Check function error rates
- [ ] Verify function performance

### 3. Frontend Monitoring
- [ ] Check console for JavaScript errors
- [ ] Monitor fallback logging usage
- [ ] Verify user experience unchanged

## Success Criteria

- [ ] All CloudWatch logging functionality preserved
- [ ] No AWS credentials in frontend bundle
- [ ] Admin functions work correctly
- [ ] Error handling improved
- [ ] No breaking changes for users
- [ ] Performance maintained or improved

## Emergency Contacts

- **DevOps Team**: [Contact Info]
- **Security Team**: [Contact Info]
- **Firebase Admin**: [Contact Info]

## Documentation Updates

- [ ] Update README with new architecture
- [ ] Document environment variable requirements
- [ ] Update deployment procedures
- [ ] Create security incident report

---

**Deployment Date**: ___________
**Deployed By**: ___________
**Verified By**: ___________
**Status**: ⏳ Pending / ✅ Complete / ❌ Failed