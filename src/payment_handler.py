import json
import time
import logging
from typing import Dict, Any, Optional
from lib.payment_client import PaymentClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PaymentHandler:
    def __init__(self, config_path: str = "config/timeout.json"):
        """Initialize payment handler with configuration."""
        self.config = self._load_config(config_path)
        self.payment_client = PaymentClient(self.config)
        
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load timeout configuration from JSON file."""
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.warning(f"Config file {config_path} not found, using defaults")
            return {
                "payment_service": {
                    "timeout_ms": 30000,
                    "retry_attempts": 3,
                    "retry_delay_ms": 1000
                }
            }
    
    def process_payment(self, amount: float, payment_method: str, **kwargs) -> Dict[str, Any]:
        """
        Process payment with proper timeout handling and retry logic.
        
        Args:
            amount: Payment amount
            payment_method: Payment method identifier
            **kwargs: Additional payment parameters
            
        Returns:
            Dict containing payment result
        """
        payment_config = self.config.get("payment_service", {})
        max_retries = payment_config.get("retry_attempts", 3)
        retry_delay = payment_config.get("retry_delay_ms", 1000) / 1000.0
        
        for attempt in range(max_retries + 1):
            try:
                logger.info(f"Processing payment attempt {attempt + 1}/{max_retries + 1}")
                
                # Prepare payment payload
                payload = {
                    "amount": amount,
                    "payment_method": payment_method,
                    "timestamp": int(time.time() * 1000),
                    **kwargs
                }
                
                # Process payment through client
                response = self.payment_client.charge(payload)
                
                if response.get("status") == "success":
                    logger.info("Payment processed successfully")
                    return {
                        "success": True,
                        "transaction_id": response.get("transaction_id"),
                        "amount": amount,
                        "status": "completed"
                    }
                else:
                    raise Exception(f"Payment failed: {response.get('error', 'Unknown error')}")
                    
            except TimeoutError as e:
                logger.warning(f"Payment timeout on attempt {attempt + 1}: {str(e)}")
                if attempt < max_retries:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    # Exponential backoff
                    retry_delay *= 1.5
                else:
                    logger.error("Max retries exceeded for payment processing")
                    return {
                        "success": False,
                        "error": "Payment timeout - max retries exceeded",
                        "attempts": attempt + 1
                    }
                    
            except Exception as e:
                logger.error(f"Payment processing failed on attempt {attempt + 1}: {str(e)}")
                if attempt < max_retries:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5
                else:
                    logger.error("Max retries exceeded for payment processing")
                    return {
                        "success": False,
                        "error": str(e),
                        "attempts": attempt + 1
                    }
        
        return {
            "success": False,
            "error": "Payment processing failed after all retries",
            "attempts": max_retries + 1
        }

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for payment processing."""
    try:
        handler = PaymentHandler()
        
        # Extract payment details from event
        amount = event.get("amount")
        payment_method = event.get("payment_method")
        
        if not amount or not payment_method:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": "Missing required fields: amount, payment_method"
                })
            }
        
        # Process payment
        result = handler.process_payment(
            amount=float(amount),
            payment_method=payment_method,
            **{k: v for k, v in event.items() if k not in ["amount", "payment_method"]}
        )
        
        status_code = 200 if result.get("success") else 500
        
        return {
            "statusCode": status_code,
            "body": json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Internal server error",
                "details": str(e)
            })
        }