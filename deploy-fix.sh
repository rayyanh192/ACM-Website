#!/bin/bash

# Deployment Fix Script
# This script helps deploy the fixes for payment and database connection errors

set -e

echo "🚀 Starting deployment fix for payment and database errors..."

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo "❌ Error: firebase.json not found. Please run this script from the project root."
    exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI not found. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Navigate to functions directory
cd functions

echo "📦 Installing new dependencies..."
npm install

echo "✅ Dependencies installed successfully"

# Go back to root
cd ..

echo "🔧 Setting up Firebase Functions configuration..."

# Check if user wants to configure environment variables
read -p "Do you want to configure Firebase Functions environment variables now? (y/n): " configure_env

if [ "$configure_env" = "y" ] || [ "$configure_env" = "Y" ]; then
    echo "Please provide the following configuration values (press Enter to skip):"
    
    read -p "Stripe Secret Key (sk_test_...): " stripe_key
    if [ ! -z "$stripe_key" ]; then
        firebase functions:config:set stripe.secret_key="$stripe_key"
    fi
    
    read -p "Stripe Timeout (default 30000ms): " stripe_timeout
    stripe_timeout=${stripe_timeout:-30000}
    firebase functions:config:set stripe.timeout="$stripe_timeout"
    
    read -p "Payment Max Retries (default 3): " payment_retries
    payment_retries=${payment_retries:-3}
    firebase functions:config:set payment.max_retries="$payment_retries"
    
    read -p "MySQL Connection Limit (default 10): " mysql_limit
    mysql_limit=${mysql_limit:-10}
    firebase functions:config:set mysql.connection_limit="$mysql_limit"
    
    echo "✅ Environment variables configured"
else
    echo "⚠️  Skipping environment configuration. You can set these later with:"
    echo "firebase functions:config:set stripe.secret_key=\"your_key\""
fi

echo "🚀 Deploying Firebase Functions..."
firebase deploy --only functions

echo "✅ Deployment completed successfully!"

echo ""
echo "🧪 Testing the deployment..."
echo "You can now test the fixes by:"
echo "1. Opening your website"
echo "2. Navigating to the CloudWatch test page"
echo "3. Testing payment and database error handling"
echo ""
echo "📊 Monitor the deployment:"
echo "- Firebase Functions logs: firebase functions:log"
echo "- CloudWatch logs: Check your AWS CloudWatch console"
echo ""
echo "📚 For detailed information, see DEPLOYMENT_FIX_README.md"

# Check if the health check function is working
echo "🏥 Running health check..."
if firebase functions:shell --non-interactive <<< "healthCheck().then(console.log)" 2>/dev/null; then
    echo "✅ Health check function is accessible"
else
    echo "⚠️  Health check function may need a few minutes to be available"
fi

echo ""
echo "🎉 Deployment fix completed!"
echo "The following errors should now be resolved:"
echo "- Payment service connection timeout (increased from 5s to 30s)"
echo "- HTTPSConnectionPool timeout (proper retry logic added)"
echo "- Database connection pool exhausted (connection pooling implemented)"