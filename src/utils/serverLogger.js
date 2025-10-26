import httpClient from './httpClient.js';

// Enhanced logger that creates multiple trackable requests
export const serverLogger = {
  async logButtonClick(buttonName) {
    try {
      const timestamp = Date.now();
      const sessionId = Math.random().toString(36).substring(7);
      
      // Create multiple requests to ensure logging with timeout handling
      const requests = [
        httpClient.get(`/api/log-click?button=${encodeURIComponent(buttonName)}&timestamp=${timestamp}&session=${sessionId}`, { timeout: 3000 }),
        httpClient.get(`/api/button-track?name=${encodeURIComponent(buttonName)}&time=${timestamp}`, { timeout: 3000 }),
        httpClient.get(`/api/user-action?action=click&element=${encodeURIComponent(buttonName)}&ts=${timestamp}`, { timeout: 3000 })
      ];
      
      // Send all requests (they'll all create 404s in nginx logs)
      await Promise.allSettled(requests);
      
      console.log(`Button click logged: ${buttonName} (${sessionId})`);
      
    } catch (error) {
      if (error.message.includes('timeout')) {
        console.log('Button click logging timeout:', error.message);
      } else if (error.message.includes('Connection pool exhausted')) {
        console.log('Button click logging connection pool exhausted:', error.message);
      } else {
        console.log('Button click logging failed:', error.message);
      }
    }
  }
};
