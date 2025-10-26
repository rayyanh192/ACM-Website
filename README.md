# ACM Website

A Vue.js application with Firebase backend for the ACM organization, featuring payment processing, database connection management, and comprehensive CloudWatch logging.

## Recent Updates - Payment & Database Fixes

### Issues Resolved
- **Payment service connection timeouts** - Fixed timeout handling after 5000ms
- **Database connection pool exhaustion** - Implemented proper connection pooling
- **HTTPSConnectionPool timeout errors** - Added retry logic and circuit breaker patterns

### New Features Added
1. **Payment Processing System** (`functions/payment_handler.js`)
   - Timeout handling with 5-second limit
   - Retry logic with exponential backoff
   - Connection pool integration
   - Health check endpoints

2. **Database Connection Management** (`functions/connection_pool.js`)
   - Connection pooling with configurable limits
   - Pool exhaustion detection and recovery
   - Health monitoring and statistics
   - Automatic connection cleanup

3. **Enhanced Configuration** (`functions/database_config.js`)
   - Environment-based configuration
   - SSL support
   - Timeout and retry settings
   - Configuration validation

4. **Improved CloudWatch Logging** (`src/utils/cloudWatchLogger.js`)
   - Enhanced payment error tracking
   - Connection timeout monitoring
   - Pool exhaustion alerts
   - Service health logging

5. **Frontend Payment Component** (`src/components/PaymentProcessor.vue`)
   - User-friendly payment interface
   - Real-time connection status
   - Error handling and retry logic
   - Service health monitoring

## Project Setup

### Environment Configuration
1. Copy `.env.example` to `.env`
2. Configure your environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

### Frontend Setup
```bash
npm install
```

### Firebase Functions Setup
```bash
cd functions
npm install
```

### Development
```bash
# Frontend development server
npm run dev

# Firebase functions emulator
cd functions
npm run serve
```

### Production Build
```bash
# Build frontend
npm run build

# Deploy Firebase functions
cd functions
npm run deploy
```

## Configuration

### Database Configuration
Set these environment variables for database connection:
- `DB_HOST` - Database host
- `DB_PORT` - Database port (default: 3306)
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_CONNECTION_LIMIT` - Max connections (default: 10)
- `DB_ACQUIRE_TIMEOUT` - Connection timeout (default: 60000ms)

### Payment Service Configuration
- `PAYMENT_SERVICE_URL` - Payment API endpoint
- `PAYMENT_API_KEY` - Payment service API key
- `PAYMENT_SERVICE_HEALTH_URL` - Health check endpoint

### CloudWatch Configuration
- `VUE_APP_AWS_REGION` - AWS region
- `VUE_APP_AWS_ACCESS_KEY_ID` - AWS access key
- `VUE_APP_AWS_SECRET_ACCESS_KEY` - AWS secret key
- `VUE_APP_LOG_GROUP_NAME` - CloudWatch log group

## API Endpoints

### Firebase Functions
- `processPayment` - Process payment with timeout handling
- `paymentHealthCheck` - Check payment service health
- `databaseHealthCheck` - Check database connection status

### Health Monitoring
- Payment service health: `/paymentHealthCheck`
- Database health: `/databaseHealthCheck`

## Error Handling

The application now properly handles:
- Payment service timeouts (5000ms limit)
- Database connection pool exhaustion
- Network connectivity issues
- Service degradation scenarios

All errors are logged to CloudWatch with detailed context for monitoring and debugging.

## Testing

Use the CloudWatch test page (`/test-cloudwatch`) to simulate:
- Payment timeout errors
- Database pool exhaustion
- Connection failures
- Service health checks

## Monitoring

CloudWatch logs include:
- Payment processing metrics
- Database connection statistics
- Service health status
- Error rates and patterns
- Performance metrics

## Linting and Code Quality
```bash
npm run lint
```

## Customize Configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
