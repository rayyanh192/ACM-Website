import requests
import json
import logging
from typing import Dict, Any, Optional
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

class PaymentClient:
    def __init__(self, config: Dict[str, Any]):
        """Initialize payment client with configuration."""
        self.config = config
        self.payment_config = config.get("payment_service", {})
        self.base_url = self._get_payment_service_url()
        self.session = self._create_session()
        
    def _get_payment_service_url(self) -> str:
        """Get payment service URL from environment or config."""
        import os
        return os.getenv("PAYMENT_SERVICE_URL", "https://api.payment-service.internal")
    
    def _create_session(self) -> requests.Session:
        """Create HTTP session with proper timeout and retry configuration."""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            method_whitelist=["HEAD", "GET", "POST"],
            backoff_factor=1
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        return session
    
    def charge(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process payment charge with proper timeout handling.
        
        Args:
            payload: Payment payload containing amount, payment_method, etc.
            
        Returns:
            Dict containing payment response
            
        Raises:
            TimeoutError: If request times out
            Exception: For other payment processing errors
        """
        timeout_ms = self.payment_config.get("timeout_ms", 30000)
        connection_timeout_ms = self.payment_config.get("connection_timeout_ms", 10000)
        
        # Convert to seconds for requests library
        timeout = (connection_timeout_ms / 1000.0, timeout_ms / 1000.0)
        
        url = f"{self.base_url}/v1/charges"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._get_api_key()}",
            "User-Agent": "checkout-processor/1.0"
        }
        
        try:
            logger.info(f"Making payment request to {url} with timeout {timeout}")
            response = self._make_request(payload, url, headers, timeout)
            return response
            
        except requests.exceptions.Timeout as e:
            logger.error(f"Payment request timed out: {str(e)}")
            raise TimeoutError(f"Request timed out after {timeout_ms}ms")
            
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Payment service connection error: {str(e)}")
            raise Exception("Payment gateway unreachable")
            
        except Exception as e:
            logger.error(f"Payment request failed: {str(e)}")
            raise
    
    def _make_request(self, payload: Dict[str, Any], url: str, headers: Dict[str, str], timeout: tuple) -> Dict[str, Any]:
        """Make HTTP request to payment service."""
        try:
            response = self.session.post(
                url,
                json=payload,
                headers=headers,
                timeout=timeout
            )
            
            # Log response for debugging
            logger.info(f"Payment service response: {response.status_code}")
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 400:
                error_data = response.json() if response.content else {}
                raise Exception(f"Bad request: {error_data.get('message', 'Invalid payment data')}")
            elif response.status_code == 401:
                raise Exception("Authentication failed - invalid API key")
            elif response.status_code == 429:
                raise Exception("Rate limit exceeded - too many requests")
            elif response.status_code >= 500:
                raise Exception(f"Payment service error: {response.status_code}")
            else:
                raise Exception(f"Unexpected response: {response.status_code}")
                
        except requests.exceptions.Timeout:
            raise TimeoutError("Request timed out")
        except requests.exceptions.ConnectionError as e:
            if "Connection reset by peer" in str(e):
                raise Exception("Connection reset by peer")
            raise Exception("Payment gateway unreachable")
    
    def _get_api_key(self) -> str:
        """Get API key from environment variables."""
        import os
        api_key = os.getenv("PAYMENT_API_KEY")
        if not api_key:
            logger.warning("PAYMENT_API_KEY not set, using default")
            return "test_key_12345"
        return api_key
    
    def health_check(self) -> Dict[str, Any]:
        """Check payment service health."""
        try:
            url = f"{self.base_url}/health"
            response = self.session.get(url, timeout=5.0)
            
            return {
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "response_time_ms": response.elapsed.total_seconds() * 1000,
                "status_code": response.status_code
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }