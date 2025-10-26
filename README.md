# ACM Website with Enhanced Error Handling

This Vue.js application includes comprehensive error handling and monitoring for payment processing and database operations, addressing the deployment issues identified in the CloudWatch logs.

## Recent Updates

### Error Handling Improvements
- **Payment Service Integration**: Added robust payment processing with timeout handling (5000ms) and circuit breaker pattern
- **Database Connection Pooling**: Implemented connection pool management to prevent exhaustion errors
- **Enhanced CloudWatch Logging**: Consolidated logging with specific error patterns matching deployment logs
- **Service Health Monitoring**: Added real-time health checks for external services

### New Components
- `PaymentHandler.vue`: Complete payment processing interface with error simulation
- `PaymentProcessing.vue`: Service status monitoring and connection pool visualization
- `paymentService.js`: Payment service client with timeout and retry logic
- `databaseService.js`: Database service with connection pooling and circuit breaker

### Error Patterns Addressed
1. **Payment Service Timeout**: `[ERROR] Payment service connection failed - timeout after 5000ms`
2. **Database Pool Exhaustion**: `[ERROR] Database query failed: connection pool exhausted`
3. **Connection Errors**: `HTTPSConnectionPool timeout` with proper traceback logging

## Environment Configuration

Copy `.env.example` to `.env` and configure your service endpoints:

```bash
cp .env.example .env
```

### Required Environment Variables

#### CloudWatch Configuration
```
VUE_APP_AWS_ACCESS_KEY_ID=your_access_key_here
VUE_APP_AWS_SECRET_ACCESS_KEY=your_secret_key_here
VUE_APP_AWS_REGION=us-east-1
```

#### Payment Service Configuration
```
VUE_APP_PAYMENT_SERVICE_URL=https://api.payment-service.com
VUE_APP_PAYMENT_API_KEY=your_payment_api_key
VUE_APP_PAYMENT_TIMEOUT=5000
```

#### Database Service Configuration
```
VUE_APP_DATABASE_SERVICE_URL=https://api.database-service.com
VUE_APP_DATABASE_API_KEY=your_database_api_key
VUE_APP_DB_MAX_CONNECTIONS=20
```

## Testing Error Scenarios

### 1. Payment Processing Page
Visit `/payment-processing` to:
- Process actual payments with error handling
- Monitor service health status
- View connection pool utilization
- Test error scenarios that match deployment logs

### 2. CloudWatch Test Page
Visit `/test-cloudwatch` to:
- Simulate payment timeout errors (5000ms)
- Test database connection pool exhaustion
- Generate HTTPSConnectionPool timeout errors
- Verify CloudWatch logging integration

## Service Architecture

### Payment Service (`src/services/paymentService.js`)
- **Timeout Handling**: 5000ms timeout matching error logs
- **Circuit Breaker**: Prevents cascade failures
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Health Monitoring**: Regular health checks

### Database Service (`src/services/databaseService.js`)
- **Connection Pooling**: Prevents pool exhaustion
- **Queue Management**: Handles connection waiting queue
- **Idle Connection Cleanup**: Automatic cleanup of unused connections
- **Pool Monitoring**: Real-time pool status tracking

### Enhanced CloudWatch Logger (`src/utils/cloudWatchLogger.js`)
- **Consolidated Logging**: Single logger replacing multiple implementations
- **Error Pattern Matching**: Formats logs to match Python backend patterns
- **Service-Specific Logging**: Dedicated methods for payment and database errors
- **Circuit Breaker Events**: Logs circuit breaker state changes

## Project Setup

```bash
# Install dependencies
npm install
```

### Compiles and hot-reloads for development
```bash
npm run dev
```

### Compiles and minifies for production
```bash
npm run build
```

### Lints and fixes files
```bash
npm run lint
```

## Monitoring and Alerting

### CloudWatch Integration
- **Error Logs**: Sent to configured log stream with proper formatting
- **Activity Logs**: User interactions and service events
- **Health Checks**: Service availability monitoring
- **Pool Status**: Connection pool utilization metrics

### Circuit Breaker Monitoring
- **Payment Service**: Opens after 5 consecutive failures, resets after 30 seconds
- **Database Service**: Opens after 5 consecutive failures, resets after 60 seconds
- **Automatic Recovery**: Services automatically recover when healthy

## Deployment Notes

### Service Dependencies
- Ensure payment service endpoint is configured and accessible
- Database service must support connection pooling
- CloudWatch credentials must have proper permissions

### Error Monitoring
- Monitor CloudWatch logs for the specific error patterns
- Set up alarms for circuit breaker events
- Track connection pool utilization metrics

### Performance Considerations
- Payment timeout set to 5000ms (configurable)
- Database connection pool limited to 20 connections (configurable)
- Health checks run every 30 seconds (configurable)

## Troubleshooting

### Common Issues

1. **Payment Timeout Errors**
   - Check `VUE_APP_PAYMENT_TIMEOUT` configuration
   - Verify payment service endpoint accessibility
   - Monitor circuit breaker status

2. **Database Pool Exhaustion**
   - Increase `VUE_APP_DB_MAX_CONNECTIONS` if needed
   - Check for connection leaks in application code
   - Monitor idle connection cleanup

3. **CloudWatch Logging Failures**
   - Verify AWS credentials and permissions
   - Check log group and stream configuration
   - Ensure network connectivity to CloudWatch

### Debug Mode
Set `NODE_ENV=development` to enable detailed console logging for all service interactions.

## Security Notes

- Never commit AWS credentials to version control
- Use environment variables for all sensitive configuration
- Regularly rotate API keys and access credentials
- Monitor for unusual error patterns that might indicate attacks

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
