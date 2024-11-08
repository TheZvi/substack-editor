// ============================================================================
// Status and Logging Utilities
// ============================================================================

/**
 * Shows a status message in the main status div
 * @param {string} message - The message to display
 * @param {boolean} isError - Whether this is an error message
 * @param {number} duration - How long to show the message (ms), default 3000
 */
function showStatus(message, isError = false, duration = 3000) {
    console.log(`Status: ${message}${isError ? ' (ERROR)' : ''}`);
    const status = document.getElementById('status');
    if (!status) {
        console.error('Status element not found!');
        return;
    }
    
    status.textContent = message;
    status.style.display = 'block';
    status.className = isError ? 'error' : 'success';
    
    setTimeout(() => {
        status.style.display = 'none';
    }, duration);
}

/**
 * Shows API-specific status messages
 * @param {string} message - The message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showApiStatus(message, isError = false) {
    console.log(`API Status: ${message}${isError ? ' (ERROR)' : ''}`);
    const apiStatus = document.getElementById('api-key-status');
    if (!apiStatus) {
        console.error('API status element not found!');
        return;
    }
    
    apiStatus.textContent = message;
    apiStatus.className = `status ${isError ? 'error' : 'success'}`;
}

/**
 * Shows removal operation results
 * @param {string[]} removedItems - Array of removed section titles
 */
function showRemovalLog(removedItems) {
    console.log('Removal log:', removedItems);
    const log = document.getElementById('removal-log');
    if (!log) {
        console.error('Removal log element not found!');
        return;
    }
    
    if (removedItems.length > 0) {
        log.innerHTML = '<strong>Removed sections:</strong><br>' + 
            removedItems.map(item => `- ${item}`).join('<br>');
        log.style.display = 'block';
    } else {
        log.style.display = 'none';
    }
}

/**
 * Shows linkify operation results
 * @param {Array} results - Array of linkify results
 */
function showLinkifyLog(results) {
    console.log('Linkify results:', results);
    const logDiv = document.getElementById('linkify-log');
    if (!logDiv) {
        console.error('Linkify log element not found!');
        return;
    }
    
    if (results.length > 0) {
        logDiv.innerHTML = '<strong>Links added:</strong><br>' + 
            results.map(item => `- "${item.text}" ${item.location}`).join('<br>');
        logDiv.style.display = 'block';
    } else {
        logDiv.style.display = 'none';
    }
}

// ============================================================================
// Core Button Handlers
// ============================================================================

console.log("Popup script loading...");

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded, about to initialize API management");

    // Initialize button references
    const buttons = {
        generateToc: document.getElementById('generate-toc'),
        removeBlanks: document.getElementById('remove-blanks'),
        wordpress: document.getElementById('post-wordpress'),
        linkify: document.getElementById('linkify'),
        manageLinkifyRules: document.getElementById('manage-linkify-rules')
    };

    // Verify all buttons exist
    Object.entries(buttons).forEach(([name, button]) => {
        if (!button) {
            console.error(`Button not found: ${name}`);
        }
    });

    // Generate TOC Button Handler
    if (buttons.generateToc) {
        buttons.generateToc.addEventListener('click', async () => {
            console.log("TOC button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: generateTOC,
                    args: [tab.url]
                });
                
                const result = results?.[0]?.result;
                if (result?.success) {
                    showStatus('TOC successfully updated');
                } else {
                    showStatus(result?.error || 'Error generating TOC', true);
                }
            } catch (error) {
                console.error('TOC generation error:', error);
                showStatus('Error: ' + error.message, true);
            }
        });
    }

    // Remove Blanks Button Handler
    if (buttons.removeBlanks) {
        buttons.removeBlanks.addEventListener('click', async () => {
            console.log("Remove blanks button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: removeBlanks
                });
                
                const removedSections = results?.[0]?.result?.removedSections;
                console.log("Removed sections:", removedSections);
                
                if (removedSections && removedSections.length > 0) {
                    // Update TOC after removing sections
                    await chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: generateTOC,
                        args: [tab.url]
                    });
                    
                    showStatus(`Removed ${removedSections.length} blank sections`);
                    showRemovalLog(removedSections);
                } else {
                    showStatus('No blank sections found');
                }
            } catch (error) {
                console.error("Remove blanks error:", error);
                showStatus('Error removing blank sections: ' + error.message, true);
            }
        });
    }

    // WordPress Button Handler
    if (buttons.wordpress) {
        buttons.wordpress.addEventListener('click', async () => {
            console.log("WordPress button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        // Get the content
                        const editor = document.querySelector('div[role="article"]') || 
                                     document.querySelector('[contenteditable="true"]');
                        if (!editor) {
                            throw new Error('Could not find editor content');
                        }
                        return editor.innerHTML;
                    }
                });

                const content = results?.[0]?.result;
                if (!content) {
                    throw new Error('No content found to post');
                }

                // TODO: Add WordPress posting logic here
                console.log("Content ready for WordPress:", content.substring(0, 100) + "...");
                showStatus('Content ready for WordPress');
                
            } catch (error) {
                console.error("WordPress posting error:", error);
                showStatus('Error preparing WordPress post: ' + error.message, true);
            }
        });
    }

    // Linkify Button Handler
    if (buttons.linkify) {
        buttons.linkify.addEventListener('click', async () => {
            console.log("Linkify button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                // First inject the linkify controller script
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['linkify/linkify-controller.js']
                });
                
                // Then execute linkifyContent
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => window.linkifyContent()
                });
                
                const linkifyResults = results?.[0]?.result;
                console.log("Linkify results:", linkifyResults);
                
                if (linkifyResults?.success) {
                    showStatus('Content linkified successfully');
                    if (linkifyResults.links) {
                        showLinkifyLog(linkifyResults.links);
                    }
                } else {
                    showStatus(linkifyResults?.error || 'Error linkifying content', true);
                }
            } catch (error) {
                console.error("Linkify error:", error);
                showStatus('Error: ' + error.message, true);
            }
        });
    }

    // Manage Linkify Rules Button Handler
    if (buttons.manageLinkifyRules) {
        buttons.manageLinkifyRules.addEventListener('click', () => {
            console.log("Manage rules button clicked");
            try {
                chrome.runtime.openOptionsPage();
            } catch (error) {
                console.error("Error opening options page:", error);
                showStatus('Error opening rules manager: ' + error.message, true);
            }
        });
    }

    // Before initializing API Key Management
    console.log("About to call initializeApiKeyManagement");
    initializeApiKeyManagement();
    console.log("Finished calling initializeApiKeyManagement");
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a Table of Contents for the current document
 * @param {string} postUrl - The URL of the current post
 * @returns {Object} Result object with success status and error message if applicable
 */
function generateTOC(postUrl) {
    try {
        console.log("Starting TOC generation");
        
        // Get and filter headers
        const headers = document.querySelectorAll('h1, h2, h3, h4');
        let headersArray = Array.from(headers)
            .filter(header => header.textContent.trim() !== "");
        
        // Filter out interface titles
        const cutoffTitles = ["Preview post", "Post info", "Post settings", "Publish", "Heads up!"];
        const cutoffIndex = headersArray.findIndex(header => 
            cutoffTitles.includes(header.textContent.trim())
        );
        if (cutoffIndex !== -1) {
            headersArray = headersArray.slice(0, cutoffIndex);
        }
        
        if (headersArray.length === 0) {
            console.log("No headers found");
            return { success: false, error: "No headers found to generate TOC" };
        }
        
        // Create TOC container
        const tocContainerId = 'generated-toc';
        const labelAsBlank = ' (Blank)';
        
        let tocContainer = document.createElement('div');
        tocContainer.id = tocContainerId;
        tocContainer.style.border = '1px solid #ccc';
        tocContainer.style.padding = '10px';
        tocContainer.style.marginBottom = '20px';
        
        let tocTitle = document.createElement('h4');
        tocTitle.textContent = 'Table of Contents';
        tocContainer.appendChild(tocTitle);
        
        // Generate TOC entries
        let tocList = document.createElement('ol');
        headersArray.forEach((header, index) => {
            let id = header.id || `section-${index}`;
            header.id = id;
            
            // Check if section is empty
            let isEmpty = true;
            let nextSibling = header.nextElementSibling;
            while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
                if (nextSibling.textContent.trim() !== "") {
                    isEmpty = false;
                    break;
                }
                nextSibling = nextSibling.nextElementSibling;
            }
            
            // Create TOC entry
            let tocItem = document.createElement('li');
            let tocLink = document.createElement('a');
            tocLink.textContent = header.textContent.trim() + 
                               (header.textContent.trim().endsWith('.') ? '' : '.') +
                               (isEmpty ? labelAsBlank : '');
            
            // Handle URLs
            const urlMatch = postUrl.match(/^(https:\/\/[^\/]+)\/publish\/post\/(\d+)/);
            if (urlMatch) {
                let slug = header.textContent.trim().toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                tocLink.href = `${urlMatch[1]}/i/${urlMatch[2]}/${slug}`;
            } else {
                tocLink.href = `#${id}`;
            }
            
            tocItem.appendChild(tocLink);
            tocList.appendChild(tocItem);
        });
        
        tocContainer.appendChild(tocList);
        
        // Insert TOC
        console.log("Inserting new TOC");
        const firstHeader = headersArray[0];
        if (firstHeader && firstHeader.parentNode) {
            firstHeader.parentNode.insertBefore(tocContainer, firstHeader);
        } else {
            const editor = document.querySelector('div[role="article"]') || 
                          document.querySelector('[contenteditable="true"]') || 
                          document.querySelector('div[role="main"]');
            if (editor) {
                editor.prepend(tocContainer);
            } else {
                console.error("Could not find location to insert TOC");
                return { success: false, error: "Could not find location to insert TOC" };
            }
        }
        
        console.log("TOC generation complete");
        return { success: true };
        
    } catch (e) {
        console.error("Critical error in generateTOC:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Removes blank sections from the document
 * @returns {Object} Object containing array of removed section titles
 */
function removeBlanks() {
    try {
        console.log("Starting removeBlanks");
        const removedSections = [];
        
        // Get and filter headers
        const headers = document.querySelectorAll('h1, h2, h3, h4');
        console.log("Found headers:", headers.length);
        
        const interfaceTitles = [
            "Preview post", "Post info", "Post settings", "Publish", "Heads up!",
            "Search images", "Generate image", "Secret draft link", "Send test email",
            "Heads up!", "Preview post"
        ];
        
        let headersArray = Array.from(headers)
            .filter(header => header.textContent.trim() !== "" && 
                    !interfaceTitles.includes(header.textContent.trim()));
                    
        console.log("Filtered headers:", headersArray.length);
    
        // Check each section for content
        headersArray.forEach(header => {
            console.log("Checking header:", header.textContent);
            let isEmpty = true;
            let nextSibling = header.nextElementSibling;
            
            while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
                if (nextSibling.textContent.trim() !== "") {
                    isEmpty = false;
                    break;
                }
                nextSibling = nextSibling.nextElementSibling;
            }
    
            // Remove empty sections
            if (isEmpty) {
                console.log("Found empty section:", header.textContent);
                removedSections.push(header.textContent.trim());
                header.remove();
                nextSibling = header.nextElementSibling;
                while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
                    let toRemove = nextSibling;
                    nextSibling = nextSibling.nextElementSibling;
                    toRemove.remove();
                }
            }
        });
    
        console.log("Removed sections:", removedSections);
        return { removedSections };
        
    } catch (e) {
        console.error("Error in removeBlanks:", e);
        return { removedSections: [] };
    }
}

// ============================================================================
// API Key Management
// ============================================================================

function initializeApiKeyManagement() {
    console.log("Inside initializeApiKeyManagement");
    console.log("Looking for elements:", {
        claudeKey: !!document.getElementById('claude-api-key'),
        geminiKey: !!document.getElementById('gemini-api-key'),
        testButton: !!document.getElementById('test-gemini-key')
    });

    // Claude API Key Management
    const claudeElements = {
        input: document.getElementById('claude-api-key'),
        saveButton: document.getElementById('save-api-key'),
        showButton: document.getElementById('show-key')
    };

    // Gemini API Key Management
    const geminiElements = {
        input: document.getElementById('gemini-api-key'),
        saveButton: document.getElementById('save-gemini-key'),
        showButton: document.getElementById('show-gemini-key'),
        testButton: document.getElementById('test-gemini-key')
    };

    // Verify all elements exist
    ['Claude', 'Gemini'].forEach(api => {
        const elements = api === 'Claude' ? claudeElements : geminiElements;
        Object.entries(elements).forEach(([name, element]) => {
            if (!element) {
                console.error(`${api} ${name} element not found!`);
            }
        });
    });

    // Load existing API keys
    loadApiKeys();

    // Claude API Event Listeners
    if (claudeElements.saveButton) {
        claudeElements.saveButton.addEventListener('click', async () => {
            console.log("Saving Claude API key");
            try {
                const key = claudeElements.input.value.trim();
                await chrome.storage.local.set({ 'claude-api-key': key });
                showApiStatus('Claude API key saved successfully');
            } catch (error) {
                console.error("Error saving Claude API key:", error);
                showApiStatus('Error saving Claude API key', true);
            }
        });
    }

    if (claudeElements.showButton) {
        claudeElements.showButton.addEventListener('click', () => {
            console.log("Toggling Claude API key visibility");
            const input = claudeElements.input;
            input.type = input.type === 'password' ? 'text' : 'password';
            claudeElements.showButton.textContent = input.type === 'password' ? 'Show' : 'Hide';
        });
    }

    // Gemini API Event Listeners
    if (geminiElements.saveButton) {
        geminiElements.saveButton.addEventListener('click', async () => {
            console.log("Saving Gemini API key");
            try {
                const key = geminiElements.input.value.trim();
                await chrome.storage.local.set({ 'gemini-api-key': key });
                showApiStatus('Gemini API key saved successfully');
            } catch (error) {
                console.error("Error saving Gemini API key:", error);
                showApiStatus('Error saving Gemini API key', true);
            }
        });
    }

    if (geminiElements.showButton) {
        geminiElements.showButton.addEventListener('click', () => {
            console.log("Toggling Gemini API key visibility");
            const input = geminiElements.input;
            input.type = input.type === 'password' ? 'text' : 'password';
            geminiElements.showButton.textContent = input.type === 'password' ? 'Show' : 'Hide';
        });
    }

    if (geminiElements.testButton) {
        geminiElements.testButton.addEventListener('click', async () => {
            console.log("Test button clicked");
            try {
                console.log("Testing Gemini API connection");
                showApiStatus('Testing Gemini API connection...');
                console.log("LLMApi available?", typeof window.LLMApi);
                console.log("GeminiApi available?", typeof window.GeminiApi);
                const geminiApi = new GeminiApi();
                console.log("GeminiApi instance created");
                const result = await geminiApi.testConnection();
                console.log("Test connection result:", result);
                
                if (result.success) {
                    showApiStatus('Gemini API connection successful!');
                } else {
                    showApiStatus(`Gemini API test failed: ${result.error}`, true);
                }
            } catch (error) {
                console.error('Error testing Gemini API:', error);
                showApiStatus(`Error: ${error.message}`, true);
            }
        });
    }
}

async function loadApiKeys() {
    console.log("Loading saved API keys");
    try {
        const result = await chrome.storage.local.get(['claude-api-key', 'gemini-api-key']);
        
        const claudeInput = document.getElementById('claude-api-key');
        if (claudeInput && result['claude-api-key']) {
            claudeInput.value = result['claude-api-key'];
            console.log("Claude API key loaded");
        }

        const geminiInput = document.getElementById('gemini-api-key');
        if (geminiInput && result['gemini-api-key']) {
            geminiInput.value = result['gemini-api-key'];
            console.log("Gemini API key loaded");
        }
    } catch (error) {
        console.error("Error loading API keys:", error);
        showApiStatus('Error loading API keys', true);
    }
}