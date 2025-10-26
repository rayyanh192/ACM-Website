import json
import logging
from lib.payment_client import PaymentClient
from typing import Dict, Any

logger = logging.getLogger(__name__)

class PaymentHandler:
    def __init__(self):
        self.payment_client = PaymentClient()
    
    def lambda_handler(self, event: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """
        AWS Lambda handler for payment processing
        """
        try:
            # Extract payment details from event
            payment_data = json.loads(event.get('body', '{}'))
            amount = payment_data.get('amount')
            currency = payment_data.get('currency', 'USD')
            payment_method = payment_data.get('payment_method')
            
            if not amount or not payment_method:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'Missing required payment data'})
                }
            
            # Process payment
            result = self.process_payment(amount, currency, payment_method)
            
            return {
                'statusCode': 200,
                'body': json.dumps(result)
            }
            
        except Exception as e:
            logger.error(f"Payment processing failed: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Payment processing failed'})
            }
    
    def process_payment(self, amount: float, currency: str, payment_method: str) -> Dict[str, Any]:
        """
        Process payment using payment client
        """
        try:
            logger.info(f"Processing payment: amount={amount}, currency={currency}")
            
            # This is line 45 mentioned in the error logs
            response = self.payment_client.charge(amount, currency, payment_method)
            
            if response.get('status') == 'success':
                logger.info(f"Payment successful: transaction_id={response.get('transaction_id')}")
                return {
                    'status': 'success',
                    'transaction_id': response.get('transaction_id'),
                    'amount': amount,
                    'currency': currency
                }
            else:
                logger.error(f"Payment failed: {response.get('error')}")
                raise Exception(f"Payment failed: {response.get('error')}")
                
        except Exception as e:
            logger.error(f"Payment processing error: {str(e)}")
            raise