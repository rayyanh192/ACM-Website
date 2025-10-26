// Simple logger that sends button clicks to server (which nginx will log)
export const serverLogger = {
  async logButtonClick(buttonName) {
    try {
      // Send request to a fake endpoint - nginx will log this in access.log
      await fetch(`/api/log-click?button=${encodeURIComponent(buttonName)}&timestamp=${Date.now()}`, {
        method: 'GET'
      });
    } catch (error) {
      // This will create a 404 error in nginx error.log - perfect for testing!
      console.log('Button click logged (404 expected):', buttonName);
    }
  }
};
