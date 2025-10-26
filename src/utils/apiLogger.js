import httpClient from './httpClient.js';

// Logger that sends to your DevAngel Lambda functions
export const apiLogger = {
  async logButtonClick(buttonName, context = {}) {
    try {
      // Send to your DevAngel API Gateway endpoint with timeout handling
      await httpClient.post('https://your-api-gateway-url/log', {
        source: 'acm-website',
        eventType: 'user_interaction',
        severity: 'INFO',
        data: {
          type: 'button_click',
          button: buttonName,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          ...context
        }
      }, {
        timeout: 5000, // 5 second timeout for external API
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log('API button click logging timeout:', error.message);
      } else if (error.message.includes('Connection pool exhausted')) {
        console.log('API button click logging connection pool exhausted:', error.message);
      } else {
        console.log('API button click logging failed:', error.message);
      }
    }
  },

  async logError(message, context = {}) {
    try {
      await httpClient.post('https://your-api-gateway-url/log', {
        source: 'acm-website',
        eventType: 'error',
        severity: 'ERROR',
        data: {
          message: message,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          ...context
        }
      }, {
        timeout: 8000, // 8 second timeout for error logging
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log('API error logging timeout:', error.message);
      } else if (error.message.includes('Connection pool exhausted')) {
        console.log('API error logging connection pool exhausted:', error.message);
      } else {
        console.log('API error logging failed:', error.message);
      }
    }
  }
};
