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

// Handle context menu creation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
      id: "transformText",
      title: "Reformat Selected Text",
      contexts: ["selection"]
  });
});

// Menu clicker
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "transformText") {
      console.log("Context menu clicked, transforming text."); // todo remove
      chrome.tabs.sendMessage(tab.id, {
          action: "transformText",
          text: info.selectionText
      }, () => {
          if (chrome.runtime.lastError) {
              console.log("Message sent to tab"); // todo remove
          }
      });
  }
});

// Handle keyboard command
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "transform-text") {
      console.log("Keyboard command detected, transforming text."); // todo remove
      chrome.tabs.sendMessage(tab.id, {
          action: "transformText"
      }, () => {
          // Ignore any response errors
          if (chrome.runtime.lastError) {
              // This prevents the "Could not establish connection" error from appearing
              console.log("Message sent to tab"); // todo remove
          }
      });
  }
}); 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showNotification") {
      chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',  // Make sure this icon exists
          title: 'API Key Required',
          message: request.message
      });
  }
});

// Add this as a new listener at the end of background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'claude-api-request') {
      (async () => {
          try {
              console.log("Headers received in background.js:", request.options.headers);
              
              const response = await fetch(request.endpoint, {
                  method: 'POST',
                  headers: request.options.headers,
                  body: JSON.stringify(request.payload)
              });

              // Log the actual response for debugging
              console.log("Raw API response:", {
                  status: response.status,
                  statusText: response.statusText
              }); // todo remove

              if (!response.ok) {
                const errorText = await response.text();
                console.log("Full error response details:", JSON.stringify({
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    headers: Object.fromEntries(response.headers.entries())
                }, null, 2));
                sendResponse({ 
                    success: false, 
                    error: `API request failed: ${response.status} ${errorText}`
                });
                return;
            }

              const data = await response.json();
              console.log("Parsed API response:", data); // todo remove
              sendResponse({ success: true, data });
          } catch (error) {
              console.error("Claude API error in background:", error); // todo remove
              sendResponse({ 
                  success: false, 
                  error: error.message || 'Unknown error occurred'
              });
          }
      })();
      return true;
  }
});