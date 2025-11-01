import requests
import json
import logging
import time
import random
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class PaymentClient:
    def __init__(self):
        self.base_url = "https://api.payment-gateway.com"
        
        # Load timeout configuration
        try:
            with open('/workspace/config/timeout.json', 'r') as f:
                config = json.load(f)
                payment_config = config['payment']
                
                # FIXED: Increased timeout from 5s to 20s
                self.timeout = payment_config['timeout_ms'] / 1000  # 20 seconds
                self.max_retries = payment_config['max_retries']
                self.base_retry_delay = payment_config['retry_delay_ms'] / 1000  # 2 seconds
                self.backoff_multiplier = payment_config.get('retry_backoff_multiplier', 2.0)
                self.jitter_ms = payment_config.get('retry_jitter_ms', 500)
                
                # Circuit breaker configuration
                self.circuit_breaker_config = payment_config['circuit_breaker']
                self.failure_count = 0
                self.last_failure_time = None
                self.circuit_state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
                
        except Exception as e:
            logger.warning(f"Failed to load timeout config, using defaults: {e}")
            # Fallback to safer defaults
            self.timeout = 20  # 20 seconds
            self.max_retries = 3
            self.base_retry_delay = 2
            self.backoff_multiplier = 2.0
            self.jitter_ms = 500
            self.failure_count = 0
            self.circuit_state = 'CLOSED'
    
    def charge(self, amount: float, currency: str = 'USD', payment_method: str = None) -> Dict[str, Any]:
        """
        Charge payment method for specified amount
        """
        # Check circuit breaker state
        if self._is_circuit_open():
            logger.error("Circuit breaker is OPEN, rejecting payment request")
            return {
                'status': 'error',
                'error': 'Payment service temporarily unavailable (circuit breaker open)'
            }
        
        payload = {
            'amount': amount,
            'currency': currency,
            'payment_method': payment_method,
            'timestamp': int(time.time())
        }
        
        # This is line 88 mentioned in the error logs - now with better timeout handling
        return self._make_request(payload)
    
    def _is_circuit_open(self) -> bool:
        """
        Check if circuit breaker is open
        """
        if self.circuit_state == 'CLOSED':
            return False
        elif self.circuit_state == 'OPEN':
            # Check if recovery timeout has passed
            if (self.last_failure_time and 
                time.time() - self.last_failure_time > self.circuit_breaker_config['recovery_timeout_ms'] / 1000):
                self.circuit_state = 'HALF_OPEN'
                logger.info("Circuit breaker transitioning to HALF_OPEN state")
                return False
            return True
        else:  # HALF_OPEN
            return False
    
    def _record_success(self):
        """
        Record successful request - reset circuit breaker
        """
        if self.circuit_state != 'CLOSED':
            logger.info("Circuit breaker transitioning to CLOSED state after successful request")
            self.circuit_state = 'CLOSED'
        self.failure_count = 0
        self.last_failure_time = None
    
    def _record_failure(self):
        """
        Record failed request - update circuit breaker state
        """
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if (self.failure_count >= self.circuit_breaker_config['failure_threshold'] and 
            self.circuit_state == 'CLOSED'):
            self.circuit_state = 'OPEN'
            logger.error(f"Circuit breaker OPEN after {self.failure_count} failures")
        elif self.circuit_state == 'HALF_OPEN':
            self.circuit_state = 'OPEN'
            logger.error("Circuit breaker returning to OPEN state after failure in HALF_OPEN")
    
    def _make_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make HTTP request to payment gateway with improved retry logic
        """
        url = f"{self.base_url}/v1/charges"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_API_KEY'
        }
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Making payment request (attempt {attempt + 1}/{self.max_retries})")
                
                # FIXED: 20s timeout instead of 5s - allows payment processing to complete
                response = requests.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=self.timeout  # 20 seconds - much more reasonable
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info("Payment request successful")
                    self._record_success()
                    return result
                elif response.status_code == 429:  # Rate limited
                    logger.warning(f"Rate limited, retrying with backoff")
                    if attempt < self.max_retries - 1:
                        delay = self._calculate_retry_delay(attempt)
                        logger.info(f"Waiting {delay:.2f}s before retry")
                        time.sleep(delay)
                    continue
                else:
                    logger.error(f"Payment request failed: {response.status_code} - {response.text}")
                    self._record_failure()
                    return {
                        'status': 'error',
                        'error': f"HTTP {response.status_code}: {response.text}"
                    }
                    
            except requests.exceptions.Timeout:
                logger.error(f"Request timed out after {self.timeout}s (attempt {attempt + 1}/{self.max_retries})")
                self._record_failure()
                
                if attempt == self.max_retries - 1:
                    # This timeout error should be much less frequent now with 20s timeout
                    raise TimeoutError(f"Request timed out after {self.timeout * 1000}ms")
                
                # IMPROVED: Exponential backoff with jitter instead of fixed delay
                delay = self._calculate_retry_delay(attempt)
                logger.info(f"Waiting {delay:.2f}s before retry")
                time.sleep(delay)
                
            except requests.exceptions.ConnectionError as e:
                logger.error(f"Connection error: {str(e)} (attempt {attempt + 1}/{self.max_retries})")
                self._record_failure()
                
                if attempt == self.max_retries - 1:
                    raise Exception(f"Connection reset by peer")
                
                delay = self._calculate_retry_delay(attempt)
                logger.info(f"Waiting {delay:.2f}s before retry")
                time.sleep(delay)
                
            except Exception as e:
                logger.error(f"Unexpected error: {str(e)}")
                self._record_failure()
                raise
        
        return {
            'status': 'error',
            'error': 'Max retries exceeded'
        }
    
    def _calculate_retry_delay(self, attempt: int) -> float:
        """
        Calculate retry delay with exponential backoff and jitter
        """
        # Exponential backoff: base_delay * (multiplier ^ attempt)
        delay = self.base_retry_delay * (self.backoff_multiplier ** attempt)
        
        # Add jitter to prevent thundering herd
        jitter = random.uniform(0, self.jitter_ms / 1000)
        
        return delay + jitter