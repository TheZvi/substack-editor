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
      }, (response) => {
          if (chrome.runtime.lastError) {
              console.log("Error sending message:", chrome.runtime.lastError);
              return;
          }
          console.log("Transform message sent successfully:", response);
      });
  }
});

// Handle keyboard command
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "transform-text") {
      console.log("Keyboard command detected, transforming text."); // todo remove
      chrome.tabs.sendMessage(tab.id, {
          action: "transformText"
      }, (response) => {
          if (chrome.runtime.lastError) {
              console.log("Error sending message:", chrome.runtime.lastError);
              return;
          }
          console.log("Transform message sent successfully:", response);
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
  if (request.action === 'claude-api-request' || request.action === 'gemini-api-request') {
      (async () => {
          try {
              const response = await fetch(request.endpoint, {
                  method: 'POST',
                  headers: request.options.headers,
                  body: JSON.stringify(request.payload)
              });

              if (!response.ok) {
                  const errorText = await response.text();
                  console.error("API error:", errorText);
                  sendResponse({ success: false, error: `API request failed: ${response.status} ${errorText}` });
                  return;
              }

              const data = await response.json();
              sendResponse({ success: true, data });
          } catch (error) {
              console.error("API error in background:", error);
              sendResponse({ 
                  success: false, 
                  error: error.message || 'Unknown error occurred'
              });
          }
      })();
      return true;
  }
});