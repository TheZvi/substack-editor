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
        twitter: document.getElementById('post-twitter'),
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
            if (!tab.url.includes('substack.com')) {
                showStatus('This feature only works on Substack pages', true);
                return;
            }

            // Step 1: Extract content
            showStatus('Extracting content...');
            console.log("Injecting content extractor");
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                files: ['extractContents.js']
            });

            console.log("Calling content extraction");
            const extractResult = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () => {
                    if (typeof window.extractSubstackContent !== 'function') {
                        throw new Error('Content extractor not initialized');
                    }
                    return window.extractSubstackContent();
                }
            });

            console.log("Extract result:", extractResult);
            if (!extractResult?.[0]?.result?.success) {
                throw new Error(extractResult?.[0]?.result?.error || 'Failed to extract content');
            }

            // Step 2: Format for WordPress
            showStatus('Formatting for WordPress...');
            console.log("Injecting WordPress formatter");
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                files: ['formatters/wordpress-formatter.js']
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            console.log("Calling WordPress formatter");
            const formatResult = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () => {
                    if (typeof window.formatForWordPress !== 'function') {
                        throw new Error('WordPress formatter not initialized');
                    }
                    return window.formatForWordPress();
                }
            });

            console.log("Format result:", formatResult);
            if (!formatResult?.[0]?.result?.success) {
                throw new Error(formatResult?.[0]?.result?.error || 'Failed to format content');
            }

            // Add this debug section
            console.log("Verifying stored content before opening WordPress");
            const storedContent = await chrome.storage.local.get('wordpress_formatted_content');
            console.log("Stored content check:", {
                hasData: !!storedContent.wordpress_formatted_content,
                dataKeys: storedContent.wordpress_formatted_content ? Object.keys(storedContent.wordpress_formatted_content) : null
            });

            // Add this verification
            console.log("Verifying content before opening WordPress");
            const verifyContent = await chrome.storage.local.get('wordpress_formatted_content');
            console.log("Content verification:", {
                hasData: !!verifyContent.wordpress_formatted_content,
                dataKeys: verifyContent.wordpress_formatted_content ? Object.keys(verifyContent.wordpress_formatted_content) : null,
                titleLength: verifyContent.wordpress_formatted_content?.title?.length,
                contentLength: verifyContent.wordpress_formatted_content?.content?.length
            });

            // Step 3: Open WordPress and monitor tab
            const wordpressDomain = `${new URL(tab.url).hostname.split('.')[0]}.wordpress.com`;
            const wordpressUrl = `https://${wordpressDomain}/wp-admin/post-new.php?classic-editor`;
            showStatus('Opening WordPress...');
            console.log("Opening WordPress URL:", wordpressUrl);
            window.open(wordpressUrl, '_blank');

            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log("About to query for WordPress tab");
            const allTabs = await chrome.tabs.query({});
            console.log("All tabs after opening WordPress:", allTabs.map(t => ({
                url: t.url,
                active: t.active,
                status: t.status
            })));

            // Try to find WordPress tab
            const wpTab = allTabs.find(t =>
                t.url &&
                t.url.includes('wordpress.com') &&
                t.url.includes('post-new.php')
            );

            if (wpTab) {
                console.log("Found WordPress tab:", {
                    id: wpTab.id,
                    url: wpTab.url,
                    status: wpTab.status
                });

                let tabReady = false;
                let attempts = 0;
                while (!tabReady && attempts < 20) {
                    const currentTab = await chrome.tabs.get(wpTab.id);
                    console.log(`Tab status check ${attempts + 1}:`, currentTab.status);
                    if (currentTab.status === 'complete') {
                        tabReady = true;
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        attempts++;
                    }
                }

                console.log("WordPress tab is ready, verifying content still exists");
                const finalCheck = await chrome.storage.local.get('wordpress_formatted_content');
                console.log("Final content check:", {
                    hasData: !!finalCheck.wordpress_formatted_content,
                    dataKeys: finalCheck.wordpress_formatted_content ? Object.keys(finalCheck.wordpress_formatted_content) : null,
                    titleLength: finalCheck.wordpress_formatted_content?.title?.length,
                    contentLength: finalCheck.wordpress_formatted_content?.content?.length
                });

                try {
                    console.log("Injecting receiver script into WordPress tab");
                    await chrome.scripting.executeScript({
                        target: {tabId: wpTab.id},
                        files: ['receivers/wordpress-receiver.js']
                    });
                    console.log("Receiver script injected, waiting 1 second...");
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    console.log("Verifying receiver function exists");
                    const checkResult = await chrome.scripting.executeScript({
                        target: {tabId: wpTab.id},
                        func: () => ({
                            hasFunction: typeof window.insertWordPressContent === 'function',
                            documentReady: document.readyState,
                            hasTitle: !!document.getElementById('title'),
                            hasContent: !!document.getElementById('content')
                        })
                    });
                    console.log("Function check result:", checkResult?.[0]?.result);

                    console.log("Attempting to call insertWordPressContent");
                    const insertResult = await chrome.scripting.executeScript({
                        target: {tabId: wpTab.id},
                        func: () => {
                            console.log("Starting content insertion");
                            if (typeof window.insertWordPressContent !== 'function') {
                                console.error("Function not found!");
                                return { success: false, error: "Function not found" };
                            }
                            return window.insertWordPressContent();
                        }
                    });

                    console.log("Insert result:", insertResult);
                    if (insertResult?.[0]?.result?.success) {
                        showStatus('Content inserted successfully');
                    } else {
                        showStatus('Error inserting content', true);
                    }
                } catch (error) {
                    console.error("Script injection error:", error);
                    showStatus('Error injecting WordPress receiver: ' + error.message, true);
                }
            } else {
                console.error("Could not find WordPress tab");
                showStatus('Could not find WordPress tab', true);
            }
        } catch (error) {
            console.error('Error:', error);
            showStatus('Error: ' + error.message, true);
        }
    });
}

    // Twitter Article Button Handler
    if (buttons.twitter) {
        buttons.twitter.addEventListener('click', async () => {
            console.log("Twitter button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (!tab.url.includes('substack.com')) {
                    showStatus('This feature only works on Substack pages', true);
                    return;
                }

                // Step 1: Extract content
                showStatus('Extracting content...');
                console.log("Injecting content extractor");
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['extractContents.js']
                });

                console.log("Calling content extraction");
                const extractResult = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        if (typeof window.extractSubstackContent !== 'function') {
                            throw new Error('Content extractor not initialized');
                        }
                        return window.extractSubstackContent();
                    }
                });

                console.log("Extract result:", extractResult);
                if (!extractResult?.[0]?.result?.success) {
                    throw new Error(extractResult?.[0]?.result?.error || 'Failed to extract content');
                }

                // Step 2: Format for Twitter Articles
                showStatus('Formatting for Twitter...');
                console.log("Injecting Twitter formatter");
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['formatters/twitter-formatter.js']
                });

                await new Promise(resolve => setTimeout(resolve, 100));

                console.log("Calling Twitter formatter");
                const formatResult = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        if (typeof window.formatForTwitter !== 'function') {
                            throw new Error('Twitter formatter not initialized');
                        }
                        return window.formatForTwitter();
                    }
                });

                console.log("Format result:", formatResult);
                if (!formatResult?.[0]?.result?.success) {
                    throw new Error(formatResult?.[0]?.result?.error || 'Failed to format content');
                }

                // Verify stored content
                console.log("Verifying stored content before opening Twitter");
                const storedContent = await chrome.storage.local.get('twitter_formatted_content');
                console.log("Stored content check:", {
                    hasData: !!storedContent.twitter_formatted_content,
                    dataKeys: storedContent.twitter_formatted_content ? Object.keys(storedContent.twitter_formatted_content) : null
                });

                // Step 3: Open Twitter Articles compose page
                const twitterUrl = 'https://x.com/compose/articles';
                showStatus('Opening Twitter Articles...');
                console.log("Opening Twitter URL:", twitterUrl);
                window.open(twitterUrl, '_blank');

                await new Promise(resolve => setTimeout(resolve, 2000));

                // Find the Twitter tab
                console.log("Looking for Twitter tab");
                const allTabs = await chrome.tabs.query({});
                console.log("All tabs after opening Twitter:", allTabs.map(t => ({
                    url: t.url,
                    active: t.active,
                    status: t.status
                })));

                const twitterTab = allTabs.find(t =>
                    t.url &&
                    t.url.includes('x.com') &&
                    t.url.includes('compose/articles')
                );

                if (twitterTab) {
                    console.log("Found Twitter tab:", {
                        id: twitterTab.id,
                        url: twitterTab.url,
                        status: twitterTab.status
                    });

                    // Wait for tab to be ready
                    let tabReady = false;
                    let attempts = 0;
                    while (!tabReady && attempts < 20) {
                        const currentTab = await chrome.tabs.get(twitterTab.id);
                        console.log(`Tab status check ${attempts + 1}:`, currentTab.status);
                        if (currentTab.status === 'complete') {
                            tabReady = true;
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            attempts++;
                        }
                    }

                    console.log("Twitter tab is ready");

                    // Wait additional time for React app to initialize
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    try {
                        console.log("Injecting receiver script into Twitter tab");
                        await chrome.scripting.executeScript({
                            target: {tabId: twitterTab.id},
                            files: ['receivers/twitter-receiver.js']
                        });
                        console.log("Receiver script injected, waiting...");
                        await new Promise(resolve => setTimeout(resolve, 1500));

                        console.log("Attempting to call insertTwitterContent");
                        const insertResult = await chrome.scripting.executeScript({
                            target: {tabId: twitterTab.id},
                            func: () => {
                                console.log("Starting Twitter content insertion");
                                if (typeof window.insertTwitterContent !== 'function') {
                                    console.error("Function not found!");
                                    return { success: false, error: "Function not found" };
                                }
                                return window.insertTwitterContent();
                            }
                        });

                        console.log("Insert result:", insertResult);
                        if (insertResult?.[0]?.result?.success) {
                            showStatus('Content inserted - please review before posting');
                        } else {
                            showStatus('Content may need manual adjustment', true);
                        }
                    } catch (error) {
                        console.error("Script injection error:", error);
                        showStatus('Error: ' + error.message, true);
                    }
                } else {
                    console.error("Could not find Twitter tab");
                    showStatus('Could not find Twitter tab', true);
                }
            } catch (error) {
                console.error('Twitter posting error:', error);
                showStatus('Error: ' + error.message, true);
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
                const rulesUrl = chrome.runtime.getURL('linkify/ui/manage-linkify-rules.html');
                chrome.tabs.create({ url: rulesUrl });
            } catch (error) {
                console.error("Error opening rules page:", error);
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