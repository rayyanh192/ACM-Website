// Logger that sends to your DevAngel Lambda functions
export const apiLogger = {
  async logButtonClick(buttonName, context = {}) {
    try {
      // Send to your DevAngel API Gateway endpoint
      await fetch('https://your-api-gateway-url/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });
    } catch (error) {
      console.log('API logging failed:', error);
    }
  },

  async logError(message, context = {}) {
    try {
      await fetch('https://your-api-gateway-url/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'acm-website',
          eventType: 'error',
          severity: 'ERROR',
          data: {
            message: message,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            ...context
          }
        })
      });
    } catch (error) {
      console.log('API logging failed:', error);
    }
  }
};
