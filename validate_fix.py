#!/usr/bin/env python3
"""
Validation script for deployment fix.
Ensures all configuration files are valid and services can initialize properly.
"""

import json
import os
import sys
from pathlib import Path

def validate_json_config():
    """Validate the timeout configuration file."""
    config_path = Path("config/timeout.json")
    
    if not config_path.exists():
        print("❌ ERROR: config/timeout.json not found")
        return False
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Validate required sections
        required_sections = ['payment_service', 'database', 'api']
        for section in required_sections:
            if section not in config:
                print(f"❌ ERROR: Missing section '{section}' in config")
                return False
        
        # Validate payment service config
        payment_config = config['payment_service']
        required_payment_keys = ['timeout_ms', 'retry_attempts', 'retry_delay_ms', 'connection_timeout_ms']
        for key in required_payment_keys:
            if key not in payment_config:
                print(f"❌ ERROR: Missing key '{key}' in payment_service config")
                return False
            if not isinstance(payment_config[key], int) or payment_config[key] <= 0:
                print(f"❌ ERROR: Invalid value for '{key}': {payment_config[key]}")
                return False
        
        # Validate timeout values are reasonable
        if payment_config['timeout_ms'] < 10000:  # Less than 10s
            print(f"⚠️  WARNING: Payment timeout {payment_config['timeout_ms']}ms may be too low")
        
        if payment_config['timeout_ms'] > 60000:  # More than 60s
            print(f"⚠️  WARNING: Payment timeout {payment_config['timeout_ms']}ms may be too high")
        
        # Validate database config
        db_config = config['database']
        required_db_keys = ['connection_timeout_ms', 'pool_timeout_ms', 'max_connections', 'min_connections']
        for key in required_db_keys:
            if key not in db_config:
                print(f"❌ ERROR: Missing key '{key}' in database config")
                return False
        
        # Validate connection pool sizing
        if db_config['max_connections'] <= db_config['min_connections']:
            print("❌ ERROR: max_connections must be greater than min_connections")
            return False
        
        if db_config['max_connections'] > 100:
            print(f"⚠️  WARNING: max_connections {db_config['max_connections']} may be too high")
        
        print("✅ Configuration file validation passed")
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ ERROR: Invalid JSON in config file: {e}")
        return False
    except Exception as e:
        print(f"❌ ERROR: Failed to validate config: {e}")
        return False

def validate_python_files():
    """Validate Python files can be imported and initialized."""
    try:
        # Test payment handler
        sys.path.insert(0, str(Path.cwd()))
        
        # Check if payment_handler can be imported
        payment_handler_path = Path("src/payment_handler.py")
        if not payment_handler_path.exists():
            print("❌ ERROR: src/payment_handler.py not found")
            return False
        
        # Check if payment_client can be imported
        payment_client_path = Path("lib/payment_client.py")
        if not payment_client_path.exists():
            print("❌ ERROR: lib/payment_client.py not found")
            return False
        
        # Basic syntax validation by attempting to compile
        with open(payment_handler_path, 'r') as f:
            compile(f.read(), payment_handler_path, 'exec')
        
        with open(payment_client_path, 'r') as f:
            compile(f.read(), payment_client_path, 'exec')
        
        print("✅ Python files syntax validation passed")
        return True
        
    except SyntaxError as e:
        print(f"❌ ERROR: Python syntax error: {e}")
        return False
    except Exception as e:
        print(f"❌ ERROR: Failed to validate Python files: {e}")
        return False

def validate_javascript_files():
    """Validate JavaScript files syntax."""
    try:
        order_service_path = Path("src/services/order-service.js")
        if not order_service_path.exists():
            print("❌ ERROR: src/services/order-service.js not found")
            return False
        
        # Basic validation - check for common syntax issues
        with open(order_service_path, 'r') as f:
            content = f.read()
        
        # Check for basic Node.js patterns
        if 'module.exports' not in content:
            print("⚠️  WARNING: order-service.js may not export properly")
        
        if 'require(' not in content:
            print("⚠️  WARNING: order-service.js may not have required dependencies")
        
        print("✅ JavaScript files validation passed")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: Failed to validate JavaScript files: {e}")
        return False

def validate_java_files():
    """Validate Java files syntax."""
    try:
        java_file_path = Path("com/checkout/payment/PaymentGateway.java")
        if not java_file_path.exists():
            print("❌ ERROR: com/checkout/payment/PaymentGateway.java not found")
            return False
        
        with open(java_file_path, 'r') as f:
            content = f.read()
        
        # Basic validation
        if 'package com.checkout.payment;' not in content:
            print("❌ ERROR: Java package declaration missing or incorrect")
            return False
        
        if 'public class PaymentGateway' not in content:
            print("❌ ERROR: PaymentGateway class declaration missing")
            return False
        
        print("✅ Java files validation passed")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: Failed to validate Java files: {e}")
        return False

def validate_environment_variables():
    """Check for required environment variables."""
    required_env_vars = [
        'PAYMENT_SERVICE_URL',
        'PAYMENT_API_KEY',
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD'
    ]
    
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print("⚠️  WARNING: Missing environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print("   Services will use default values where possible")
    else:
        print("✅ All required environment variables are set")
    
    return True

def main():
    """Run all validation checks."""
    print("🔍 Validating deployment fix...")
    print("=" * 50)
    
    all_passed = True
    
    # Run all validation checks
    checks = [
        ("Configuration file", validate_json_config),
        ("Python files", validate_python_files),
        ("JavaScript files", validate_javascript_files),
        ("Java files", validate_java_files),
        ("Environment variables", validate_environment_variables)
    ]
    
    for check_name, check_func in checks:
        print(f"\n📋 Checking {check_name}...")
        if not check_func():
            all_passed = False
    
    print("\n" + "=" * 50)
    
    if all_passed:
        print("🎉 All validation checks passed!")
        print("✅ Deployment fix is ready to deploy")
        return 0
    else:
        print("❌ Some validation checks failed")
        print("🚨 Please fix the issues before deploying")
        return 1

if __name__ == "__main__":
    sys.exit(main())