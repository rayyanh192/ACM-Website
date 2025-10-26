// Enhanced logger that creates multiple trackable requests
export const serverLogger = {
  async logButtonClick(buttonName) {
    try {
      const timestamp = Date.now();
      const sessionId = Math.random().toString(36).substring(7);
      
      // Create multiple requests to ensure logging
      const requests = [
        fetch(`/api/log-click?button=${encodeURIComponent(buttonName)}&timestamp=${timestamp}&session=${sessionId}`, { method: 'GET' }),
        fetch(`/api/button-track?name=${encodeURIComponent(buttonName)}&time=${timestamp}`, { method: 'GET' }),
        fetch(`/api/user-action?action=click&element=${encodeURIComponent(buttonName)}&ts=${timestamp}`, { method: 'GET' })
      ];
      
      // Send all requests (they'll all create 404s in nginx logs)
      await Promise.allSettled(requests);
      
      console.log(`Button click logged: ${buttonName} (${sessionId})`);
      
    } catch (error) {
      console.log('Logging failed:', error);
    }
  }
};
