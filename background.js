// background.js

// Handle context menu creation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
      id: "transformText",
      title: "Reformat Selected Text",
      contexts: ["selection"]
  });
  chrome.contextMenus.create({
      id: "coverage-check",
      title: "Check coverage on this page",
      contexts: ["page", "selection"]
  });
});

// Menu clicker
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "transformText") {
      chrome.tabs.sendMessage(tab.id, {
          action: "transformText",
          text: info.selectionText
      }, (response) => {
          if (chrome.runtime.lastError) {
              console.error("Error sending transform message:", chrome.runtime.lastError);
          }
      });
  }
});

// Handle keyboard command
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "transform-text") {
      try {
          await sendTransformCommand(tab.id);
      } catch (error) {
          console.error("[Background] Transform command failed:", error);
      }
  }
});

/**
 * Send the transformText message, injecting content.js first if the content
 * script is not running (e.g. after an extension reload, or an SPA navigation
 * that the webNavigation handler missed).
 */
async function sendTransformCommand(tabId) {
  // Check the content script is alive with a ping
  let alive = false;
  try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      alive = true;
  } catch (e) {
      console.log('[Background] Content script not responding, injecting...');
  }

  if (!alive) {
      await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
      });
      // Give the content script a moment to register listeners and start
      // loading the page-context transform scripts
      await new Promise(resolve => setTimeout(resolve, 300));
  }

  await chrome.tabs.sendMessage(tabId, { action: 'transformText' });
}

// ============================================================================
// SPA Navigation Detection - Inject content scripts on client-side navigation
// ============================================================================

// Listen for SPA-style navigation (history state changes without full page reload)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  // Only care about main frame navigation
  if (details.frameId !== 0) return;

  const url = details.url;

  // Check if this is a Substack editor page
  if (url.match(/https:\/\/[^/]+\.substack\.com\/publish\/post\//)) {
    console.log('[Background] SPA navigation to Substack editor:', url);

    // Check if content script is already running by sending a ping
    try {
      await chrome.tabs.sendMessage(details.tabId, { action: 'ping' });
      console.log('[Background] Content script already running');
    } catch (e) {
      // Content script not running, inject it
      console.log('[Background] Injecting content script for SPA navigation');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          files: ['content.js']
        });
        console.log('[Background] Content script injected successfully');
      } catch (err) {
        console.error('[Background] Failed to inject content script:', err);
      }
    }
  }
}, {
  url: [{ hostSuffix: '.substack.com' }]
}); 

// Handle image fetch requests from content scripts (bypasses CORS)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch-image') {
    (async () => {
      try {
        console.log('[Background] Fetching image:', request.url.substring(0, 100));

        // Determine if this is a Twitter image
        const isTwitterImage = request.url.includes('pbs.twimg.com') || request.url.includes('twimg.com');

        // Build fetch options - include credentials for Twitter to use session cookies
        const fetchOptions = {
          method: 'GET',
          credentials: isTwitterImage ? 'include' : 'omit',
          headers: {}
        };

        // Add referrer for Twitter images
        if (isTwitterImage) {
          fetchOptions.referrer = 'https://x.com/';
          fetchOptions.referrerPolicy = 'strict-origin-when-cross-origin';
        }

        const response = await fetch(request.url, fetchOptions);

        if (!response.ok) {
          console.error('[Background] Image fetch failed:', response.status, response.statusText);
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          return;
        }

        const blob = await response.blob();
        console.log('[Background] Image blob received, size:', Math.round(blob.size / 1024), 'KB, type:', blob.type);

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

// ============================================================================
// Twitter Pro - Open Tweet in Tab Group
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open-tweet-in-group') {
    openUrlInTabGroup(request.tweetUrl, request.tabGroupName, sender.tab?.windowId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
  if (request.action === 'open-url-in-group') {
    openUrlInTabGroup(request.url, request.tabGroupName, request.windowId, request.active)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
  if (request.action === 'open-author-annotations') {
    const url = chrome.runtime.getURL('author-annotations/ui/manage-annotations.html');
    chrome.tabs.create({ url, active: true });
  }
  if (request.action === 'get-last-closed-tab-url') {
    chrome.sessions.getRecentlyClosed({ maxResults: 10 }, (sessions) => {
      // Find the first closed tab (not window)
      for (const session of sessions) {
        if (session.tab && session.tab.url) {
          sendResponse({ success: true, url: session.tab.url, title: session.tab.title });
          return;
        }
      }
      sendResponse({ success: false, error: 'No recently closed tabs found' });
    });
    return true; // Keep channel open for async
  }
});

// ============================================================================
// Google Docs Comment API
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'create-googledoc-comment') {
    createGoogleDocComment(request.documentId, request.commentText)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
});

/**
 * Get Google OAuth token from storage (cached from popup auth)
 */
async function getGoogleToken() {
  const cached = await chrome.storage.local.get([
    'google-access-token',
    'google-token-expiry'
  ]);

  if (cached['google-access-token'] && cached['google-token-expiry']) {
    if (Date.now() < cached['google-token-expiry']) {
      return cached['google-access-token'];
    }
  }

  throw new Error('No valid Google token. Please use the extension popup to authenticate with Google first.');
}

/**
 * Create an unanchored comment on a Google Doc via Drive API
 * @param {string} documentId - The Google Doc ID
 * @param {string} commentText - The comment content (should include quoted text for Ctrl+F)
 */
async function createGoogleDocComment(documentId, commentText) {
  console.log('[Background] Creating Google Doc comment on:', documentId);

  const token = await getGoogleToken();

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}/comments?fields=*`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: commentText
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Background] Comment creation failed:', response.status, error);
    throw new Error(`Failed to create comment: ${response.status} - ${error}`);
  }

  const comment = await response.json();
  console.log('[Background] Created comment:', comment.id);

  return { success: true, commentId: comment.id };
}

// ============================================================================
// Tab Group Helper
// ============================================================================

async function openUrlInTabGroup(url, tabGroupName, originalWindowId, active = false) {
  try {
    console.log(`[Background] Opening URL in tab group "${tabGroupName}":`, url);

    // Get the configured tab group name from storage, or use the provided one
    const settings = await chrome.storage.local.get('twitter-tab-group-name');
    const groupName = settings['twitter-tab-group-name'] || tabGroupName || 'AI Links';

    // Search ALL windows for an existing tab group with this name
    const allGroups = await chrome.tabGroups.query({});
    let targetGroup = allGroups.find(g => g.title === groupName);

    let targetWindowId = originalWindowId;

    if (targetGroup) {
      // Found existing group - use its window
      targetWindowId = targetGroup.windowId;
      console.log(`[Background] Found existing "${groupName}" group in window ${targetWindowId}`);
    }

    // Create the new tab in the target window
    const createOptions = {
      url: url,
      active: active
    };
    if (targetWindowId) {
      createOptions.windowId = targetWindowId;
    }
    const newTab = await chrome.tabs.create(createOptions);

    if (targetGroup) {
      // Add tab to existing group
      await chrome.tabs.group({ tabIds: newTab.id, groupId: targetGroup.id });
    } else {
      // Create new group with this tab
      const groupId = await chrome.tabs.group({ tabIds: newTab.id });
      await chrome.tabGroups.update(groupId, { title: groupName, color: 'blue' });
    }

    console.log(`[Background] URL opened in group "${groupName}"`);
    return { success: true, tabId: newTab.id };

  } catch (error) {
    console.error('[Background] Error opening URL in tab group:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Coverage Check ("Have I covered this?") - side panel + local server proxy
// ============================================================================

// Local covered_web.py server (in the writing folder). The extension talks to
// it from here because content scripts on https pages can't fetch http://
// localhost (mixed content), while the service worker can (host permission).
const COVERED_API_BASE = 'http://127.0.0.1:8377';

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'coverage-check' || !tab?.id) return;
  // Must be called synchronously in the click handler to count as a user gesture
  chrome.sidePanel.open({ tabId: tab.id })
    .catch(err => console.error('[Coverage] sidePanel.open failed:', err));
  startCoverageRun(tab.id, false)
    .catch(err => console.error('[Coverage] Failed to start analysis:', err));
});

/**
 * Inject the coverage content script (if not already present) and kick off
 * page analysis.
 */
async function startCoverageRun(tabId, verify) {
  let alive = false;
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'coverage-ping' });
    alive = true;
  } catch (e) {
    console.log('[Coverage] Content script not present, injecting...');
  }

  if (!alive) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['coverage/coverage-content.js']
    });
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await chrome.tabs.sendMessage(tabId, { action: 'coverage-run', verify: !!verify });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Generic proxy to the covered server for content script + side panel
  if (request.action === 'covered-api') {
    (async () => {
      try {
        const options = { method: request.method || 'GET', headers: {} };
        if (request.body !== undefined) {
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(request.body);
        }
        const response = await fetch(COVERED_API_BASE + request.path, options);
        if (!response.ok) {
          const errorText = await response.text();
          sendResponse({ success: false, error: `covered server ${response.status}: ${errorText.slice(0, 300)}` });
          return;
        }
        sendResponse({ success: true, data: await response.json() });
      } catch (error) {
        // fetch() rejects (TypeError) when the server isn't running
        sendResponse({
          success: false,
          connectionFailed: true,
          error: `Could not reach the covered server at ${COVERED_API_BASE}`
        });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Side panel "Analyze page" button
  if (request.action === 'coverage-run-request') {
    startCoverageRun(request.tabId, request.verify)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

// ============================================================================
// Universal Quote Copy - LLM Author Detection
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detect-author-llm') {
    detectAuthorWithLLM(request.context)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
});

/**
 * Use LLM to detect author from page context
 * @param {Object} context - Contains selectedText, surroundingHtml, pageTitle, pageUrl
 */
async function detectAuthorWithLLM(context) {
  console.log('[Background] Detecting author with LLM for:', context.pageTitle);

  // Get API key from storage
  const stored = await chrome.storage.local.get('gemini-api-key');
  const apiKey = stored['gemini-api-key'];

  if (!apiKey) {
    console.log('[Background] No Gemini API key configured');
    return { success: false, error: 'No API key configured' };
  }

  // Get configured model or use default
  const modelStored = await chrome.storage.local.get('gemini-model');
  const model = modelStored['gemini-model'] || 'gemini-3.1-flash-lite';

  // Build a focused prompt
  const prompt = `Analyze this web page content and determine who wrote or said the selected text.

Page title: ${context.pageTitle}
Page URL: ${context.pageUrl}

Selected text (excerpt): "${context.selectedText}"

Surrounding HTML context:
${context.surroundingHtml}

Instructions:
1. Identify the author or speaker of the selected text
2. If it's a quote from someone, identify who is being quoted
3. If it's article content, identify the article author
4. If it's a comment, identify the commenter
5. Return ONLY the author/speaker name, nothing else
6. If you cannot determine the author, return "Unknown"

Author name:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 50,
            temperature: 0.1
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] Gemini API error:', response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const authorText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!authorText || authorText.toLowerCase() === 'unknown') {
      return { success: false, error: 'Could not determine author' };
    }

    // Clean up the response
    const author = authorText
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/^Author:\s*/i, '') // Remove prefix if LLM added it
      .trim();

    console.log('[Background] LLM detected author:', author);
    return { success: true, author: author };

  } catch (error) {
    console.error('[Background] LLM author detection failed:', error);
    return { success: false, error: error.message };
  }
}