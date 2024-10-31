// background.js
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
      console.log('First install - initializing storage');
      // Set up initial storage if needed
  } else if (details.reason === 'update') {
      console.log('Extension updated - checking if storage needs migration');
      // Handle any needed storage format changes
  }
});