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

// Handle image fetch requests from content scripts (bypasses CORS)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch-image') {
    (async () => {
      try {
        console.log('[Background] Fetching image:', request.url.substring(0, 80));
        const response = await fetch(request.url);

        if (!response.ok) {
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          return;
        }

        const blob = await response.blob();

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log('[Background] Image converted, size:', Math.round(reader.result.length / 1024), 'KB');
          sendResponse({
            success: true,
            base64: reader.result,
            mimeType: blob.type || 'image/jpeg'
          });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'FileReader error' });
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('[Background] Image fetch error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
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

// ============================================================================
// Twitter List Sync - Background Script Handler
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'twitter-list-sync') {
    performTwitterListSync(request.username, request.destListId, request.sourceListId, request.mode, request.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
});

async function performTwitterListSync(username, destListId, sourceListId, mode, currentTabId) {
  console.log(`[Background] Starting Twitter sync: ${mode} for @${username}`);
  console.log(`[Background] Source: ${sourceListId || 'Following'}, Dest: ${destListId}`);

  try {
    let sourceAccounts = [];

    // Step 1: Get source accounts (either from Following or from a source list)
    if (!sourceListId) {
      // Source is Following - open the following page
      console.log(`[Background] Step 1: Opening Following page for @${username}...`);
      const followingUrl = `https://x.com/${username}/following`;
      const followingTab = await chrome.tabs.create({ url: followingUrl, active: true });

      await waitForTabComplete(followingTab.id);
      await sleep(3000);

      // Scrape following from the page
      console.log('[Background] Step 2: Scraping Following list (auto-scrolling)...');
      await chrome.scripting.executeScript({
        target: { tabId: followingTab.id },
        files: ['twitter/twitter-list-sync.js']
      });

      await sleep(1000);

      const followingResult = await chrome.scripting.executeScript({
        target: { tabId: followingTab.id },
        func: () => window.scrapeFollowingList()
      });

      sourceAccounts = followingResult?.[0]?.result?.usernames || [];
      console.log(`[Background] Found ${sourceAccounts.length} following`);

      // Close following tab
      await chrome.tabs.remove(followingTab.id);

    } else {
      // Source is another list - open it and scrape
      console.log(`[Background] Step 1: Opening source list ${sourceListId}...`);
      const sourceListUrl = `https://x.com/i/lists/${sourceListId}/members`;
      const sourceTab = await chrome.tabs.create({ url: sourceListUrl, active: true });

      await waitForTabComplete(sourceTab.id);
      await sleep(3000);

      await chrome.scripting.executeScript({
        target: { tabId: sourceTab.id },
        files: ['twitter/twitter-list-sync.js']
      });

      await sleep(1000);

      console.log('[Background] Step 2: Scraping source list...');
      const sourceResult = await chrome.scripting.executeScript({
        target: { tabId: sourceTab.id },
        func: () => window.scrapeListMembers()
      });

      sourceAccounts = sourceResult?.[0]?.result?.usernames || [];
      console.log(`[Background] Found ${sourceAccounts.length} accounts in source list`);

      // Close source tab
      await chrome.tabs.remove(sourceTab.id);
    }

    if (sourceAccounts.length === 0) {
      return { success: false, error: 'Could not find any accounts in source. Check browser console for details.' };
    }

    // Step 3: Open destination list members page and scrape
    console.log('[Background] Step 3: Opening destination list members page...');
    const listMembersUrl = `https://x.com/i/lists/${destListId}/members`;
    const listTab = await chrome.tabs.create({ url: listMembersUrl, active: true });

    await waitForTabComplete(listTab.id);
    await sleep(3000);

    await chrome.scripting.executeScript({
      target: { tabId: listTab.id },
      files: ['twitter/twitter-list-sync.js']
    });

    await sleep(1000);

    const listResult = await chrome.scripting.executeScript({
      target: { tabId: listTab.id },
      func: () => window.scrapeListMembers()
    });

    const listMembers = listResult?.[0]?.result?.usernames || [];
    console.log(`[Background] Found ${listMembers.length} members in destination list`);

    // Step 4: Perform sync
    console.log('[Background] Step 4: Performing sync...');
    console.log(`[Background] Source: ${sourceAccounts.length}, Dest: ${listMembers.length}, Mode: ${mode}`);

    const syncResult = await chrome.scripting.executeScript({
      target: { tabId: listTab.id },
      func: (listId, sourceAccounts, listMembers, mode) => {
        return window.performListSync(listId, sourceAccounts, listMembers, mode);
      },
      args: [destListId, sourceAccounts, listMembers, mode]
    });

    const result = syncResult?.[0]?.result;
    console.log('[Background] Sync result:', result);

    // Close list tab after delay
    setTimeout(() => chrome.tabs.remove(listTab.id), 5000);

    return result || { success: false, error: 'No result from sync' };

  } catch (error) {
    console.error('[Background] Twitter sync error:', error);
    return { success: false, error: error.message };
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout fallback
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}