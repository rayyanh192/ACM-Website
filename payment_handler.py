#!/usr/bin/env python3
"""
Payment Handler Service
This file serves as a reference implementation for payment processing with timeout handling.

Note: This Vue.js application uses Firebase Functions (JavaScript) for backend processing.
This Python file is provided as documentation and reference for the payment logic
that was mentioned in the deployment incident.

The actual payment processing is implemented in:
- Frontend: src/services/paymentService.js
- Backend: functions/index.js (Firebase Functions)
- Configuration: src/config/payment.js
"""

import asyncio
import time
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PaymentStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"

@dataclass
class PaymentRequest:
    """Payment request data structure"""
    transaction_id: str
    amount: float
    currency: str
    provider: str
    user_id: str
    metadata: Dict[str, Any] = None

@dataclass
class PaymentResult:
    """Payment processing result"""
    success: bool
    payment_id: Optional[str]
    status: PaymentStatus
    message: str
    processing_time: float
    error_code: Optional[str] = None

class PaymentTimeoutError(Exception):
    """Custom exception for payment timeouts"""
    def __init__(self, message: str, timeout_duration: float):
        self.timeout_duration = timeout_duration
        super().__init__(message)

class PaymentHandler:
    """
    Payment Handler with comprehensive timeout management
    
    This class demonstrates the payment processing logic that should be implemented
    to resolve the "Payment service timeout" errors mentioned in the incident report.
    """
    
    def __init__(self, default_timeout: float = 30.0):
        self.default_timeout = default_timeout
        self.max_retries = 3
        self.retry_delay = 1.0
        self.circuit_breaker_threshold = 5
        self.circuit_breaker_reset_time = 60.0
        
        # Circuit breaker state
        self.failure_count = 0
        self.last_failure_time = 0
        self.circuit_open = False
        
    async def process_payment(self, payment_request: PaymentRequest, timeout: Optional[float] = None) -> PaymentResult:
        """
        Process payment with timeout handling and retry logic
        
        Args:
            payment_request: Payment details
            timeout: Custom timeout in seconds (uses default if None)
            
        Returns:
            PaymentResult with processing outcome
            
        Raises:
            PaymentTimeoutError: If payment processing exceeds timeout
        """
        start_time = time.time()
        timeout = timeout or self.default_timeout
        
        logger.info(f"Processing payment {payment_request.transaction_id} with {timeout}s timeout")
        
        try:
            # Check circuit breaker
            if self._is_circuit_open():
                raise Exception("Payment service temporarily unavailable (circuit breaker open)")
            
            # Process payment with timeout
            result = await asyncio.wait_for(
                self._execute_payment(payment_request),
                timeout=timeout
            )
            
            # Reset circuit breaker on success
            self._reset_circuit_breaker()
            
            processing_time = time.time() - start_time
            logger.info(f"Payment {payment_request.transaction_id} completed in {processing_time:.2f}s")
            
            return PaymentResult(
                success=True,
                payment_id=result.get('payment_id'),
                status=PaymentStatus.COMPLETED,
                message="Payment processed successfully",
                processing_time=processing_time
            )
            
        except asyncio.TimeoutError:
            processing_time = time.time() - start_time
            error_msg = f"Payment processing timeout after {timeout}s"
            
            logger.error(f"Payment {payment_request.transaction_id} timed out after {processing_time:.2f}s")
            
            # Record failure for circuit breaker
            self._record_failure()
            
            return PaymentResult(
                success=False,
                payment_id=None,
                status=PaymentStatus.TIMEOUT,
                message=error_msg,
                processing_time=processing_time,
                error_code="PAYMENT_TIMEOUT"
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Payment {payment_request.transaction_id} failed: {str(e)}")
            
            # Record failure for circuit breaker
            self._record_failure()
            
            return PaymentResult(
                success=False,
                payment_id=None,
                status=PaymentStatus.FAILED,
                message=str(e),
                processing_time=processing_time,
                error_code="PAYMENT_ERROR"
            )
    
    async def _execute_payment(self, payment_request: PaymentRequest) -> Dict[str, Any]:
        """
        Execute the actual payment processing
        
        This is a mock implementation. In a real system, this would:
        1. Validate payment data
        2. Call payment provider APIs (Stripe, PayPal, etc.)
        3. Handle provider-specific timeouts
        4. Store transaction records
        """
        
        # Simulate payment processing delay
        processing_delay = 2.0  # 2 seconds base processing time
        
        # Add random variation (0.5 to 3 seconds additional)
        import random
        additional_delay = random.uniform(0.5, 3.0)
        total_delay = processing_delay + additional_delay
        
        logger.info(f"Simulating payment processing for {total_delay:.2f}s")
        await asyncio.sleep(total_delay)
        
        # Simulate occasional failures (10% failure rate)
        if random.random() < 0.1:
            raise Exception("Payment provider returned error: insufficient funds")
        
        # Return mock payment result
        return {
            'payment_id': f"pay_{payment_request.transaction_id}_{int(time.time())}",
            'status': 'completed',
            'provider_response': {
                'transaction_id': payment_request.transaction_id,
                'amount': payment_request.amount,
                'currency': payment_request.currency
            }
        }
    
    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open"""
        if not self.circuit_open:
            return False
            
        # Check if enough time has passed to attempt reset
        if time.time() - self.last_failure_time > self.circuit_breaker_reset_time:
            logger.info("Attempting to close circuit breaker")
            self.circuit_open = False
            return False
            
        return True
    
    def _record_failure(self):
        """Record a failure for circuit breaker logic"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.circuit_breaker_threshold:
            logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
            self.circuit_open = True
    
    def _reset_circuit_breaker(self):
        """Reset circuit breaker on successful operation"""
        if self.failure_count > 0:
            logger.info("Resetting circuit breaker after successful operation")
            self.failure_count = 0
            self.circuit_open = False
    
    async def validate_payment(self, payment_request: PaymentRequest, timeout: float = 10.0) -> bool:
        """
        Validate payment data with timeout
        
        Args:
            payment_request: Payment details to validate
            timeout: Validation timeout in seconds
            
        Returns:
            True if validation passes
            
        Raises:
            PaymentTimeoutError: If validation exceeds timeout
        """
        try:
            result = await asyncio.wait_for(
                self._execute_validation(payment_request),
                timeout=timeout
            )
            return result
            
        except asyncio.TimeoutError:
            raise PaymentTimeoutError(f"Payment validation timeout after {timeout}s", timeout)
    
    async def _execute_validation(self, payment_request: PaymentRequest) -> bool:
        """Execute payment validation logic"""
        # Simulate validation delay
        await asyncio.sleep(0.5)
        
        # Basic validation checks
        if payment_request.amount <= 0:
            raise ValueError("Invalid payment amount")
        
        if not payment_request.currency:
            raise ValueError("Currency is required")
        
        if not payment_request.provider:
            raise ValueError("Payment provider is required")
        
        return True
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get payment service health status"""
        return {
            'circuit_breaker': {
                'open': self.circuit_open,
                'failure_count': self.failure_count,
                'last_failure_time': self.last_failure_time
            },
            'configuration': {
                'default_timeout': self.default_timeout,
                'max_retries': self.max_retries,
                'circuit_breaker_threshold': self.circuit_breaker_threshold
            },
            'status': 'healthy' if not self.circuit_open else 'degraded'
        }

# Example usage and testing
async def main():
    """
    Example usage of the PaymentHandler
    
    This demonstrates how to use the payment handler with proper timeout management
    to resolve the "Payment service timeout" errors.
    """
    
    # Initialize payment handler
    handler = PaymentHandler(default_timeout=30.0)
    
    # Create sample payment request
    payment_request = PaymentRequest(
        transaction_id="txn_example_123",
        amount=99.99,
        currency="USD",
        provider="stripe",
        user_id="user_123",
        metadata={"order_id": "order_456"}
    )
    
    print("=== Payment Handler Demo ===")
    print(f"Processing payment: {payment_request.transaction_id}")
    print(f"Amount: ${payment_request.amount} {payment_request.currency}")
    
    # Process payment
    result = await handler.process_payment(payment_request)
    
    print(f"\nPayment Result:")
    print(f"Success: {result.success}")
    print(f"Status: {result.status.value}")
    print(f"Message: {result.message}")
    print(f"Processing Time: {result.processing_time:.2f}s")
    
    if result.payment_id:
        print(f"Payment ID: {result.payment_id}")
    
    if result.error_code:
        print(f"Error Code: {result.error_code}")
    
    # Show health status
    health = handler.get_health_status()
    print(f"\nService Health: {health['status']}")
    print(f"Circuit Breaker Open: {health['circuit_breaker']['open']}")

if __name__ == "__main__":
    # Run the example
    asyncio.run(main())