// ============================================================================
// Status and Logging Utilities
// ============================================================================

// Track the current status timeout so we can cancel it when showing new status
let currentStatusTimeout = null;

/**
 * Shows a status message in the main status div
 * @param {string} message - The message to display
 * @param {boolean} isError - Whether this is an error message
 * @param {number} duration - How long to show the message (ms), default 3000 (errors: 30000)
 */
function showStatus(message, isError = false, duration = null) {
    console.log(`Status: ${message}${isError ? ' (ERROR)' : ''}`);
    const status = document.getElementById('status');
    if (!status) {
        console.error('Status element not found!');
        return;
    }

    // Cancel any existing timeout so new messages aren't hidden prematurely
    if (currentStatusTimeout) {
        clearTimeout(currentStatusTimeout);
        currentStatusTimeout = null;
    }

    // Use 30 seconds for errors, 3 seconds for success (unless overridden)
    const actualDuration = duration !== null ? duration : (isError ? 30000 : 3000);

    status.textContent = message;
    status.style.display = 'block';
    status.className = isError ? 'error' : 'success';

    currentStatusTimeout = setTimeout(() => {
        status.style.display = 'none';
        currentStatusTimeout = null;
    }, actualDuration);
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
        postWorkup: document.getElementById('post-workup'),
        generateToc: document.getElementById('generate-toc'),
        removeBlanks: document.getElementById('remove-blanks'),
        wordpress: document.getElementById('post-wordpress'),
        twitter: document.getElementById('post-twitter'),
        copyToGoogleDoc: document.getElementById('copy-to-googledoc'),
        reviewGoogleDoc: document.getElementById('review-googledoc'),
        linkify: document.getElementById('linkify'),
        manageLinkifyRules: document.getElementById('manage-linkify-rules'),
        manageAuthorAnnotations: document.getElementById('manage-author-annotations'),
        cleanLinkSources: document.getElementById('clean-link-sources')
    };

    // Verify all buttons exist
    Object.entries(buttons).forEach(([name, button]) => {
        if (!button) {
            console.error(`Button not found: ${name}`);
        }
    });

    // Post Workup Button Handler - runs Linkify, Clean Link Sources, and Remove Blank Sections
    if (buttons.postWorkup) {
        buttons.postWorkup.addEventListener('click', async () => {
            console.log("Post Workup button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                let results = { linkified: 0, cleaned: 0, sections: 0, whitespace: 0 };

                // Step 1: Linkify Content
                showStatus('Running linkify...');
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['linkify/linkify-controller.js']
                });
                const linkifyResult = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => window.linkifyContent()
                });
                results.linkified = linkifyResult?.[0]?.result?.results?.length || 0;
                console.log("Linkify done:", results.linkified);

                // Step 2: Clean Link Sources
                showStatus('Cleaning link sources...');
                const cleanResult = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: cleanLinkSources
                });
                results.cleaned = cleanResult?.[0]?.result?.count || 0;
                console.log("Clean done:", results.cleaned);

                // Step 3: Remove Blank Sections
                showStatus('Removing blank sections...');
                const removeResult = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: removeBlanks
                });
                results.sections = removeResult?.[0]?.result?.removedSections?.length || 0;
                results.whitespace = removeResult?.[0]?.result?.trailingWhitespaceRemoved || 0;
                console.log("Remove blanks done:", results.sections, results.whitespace);

                // Build summary message for steps 1-3
                let parts = [];
                if (results.linkified > 0) parts.push(`${results.linkified} link${results.linkified > 1 ? 's' : ''} added`);
                if (results.cleaned > 0) parts.push(`${results.cleaned} link${results.cleaned > 1 ? 's' : ''} cleaned`);
                if (results.sections > 0) parts.push(`${results.sections} blank section${results.sections > 1 ? 's' : ''} removed`);
                if (results.whitespace > 0) parts.push(`${results.whitespace} empty paragraph${results.whitespace > 1 ? 's' : ''} removed`);

                if (parts.length > 0) {
                    showStatus(`Post workup: ${parts.join(', ')}`);
                }

                // Step 4: Generate TOC (must happen BEFORE Google Doc copy)
                showStatus('Generating Table of Contents...');
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: generateTOC,
                    args: [tab.url]
                });
                console.log("TOC generated");

                // Brief delay to ensure DOM is fully updated with TOC
                await new Promise(resolve => setTimeout(resolve, 100));

                // Scroll to top
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => window.scrollTo(0, 0)
                });

                // Step 5: Copy to Google Doc (after TOC is created)
                showStatus('Copying to Google Doc...');
                await copyToGoogleDoc(showStatus);

            } catch (error) {
                console.error("Post workup error:", error);
                showStatus('Error: ' + error.message, true);
            }
        });
    }

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
                    // Scroll to top of page
                    await chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: () => window.scrollTo(0, 0)
                    });
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
                
                const removedSections = results?.[0]?.result?.removedSections || [];
                const trailingWhitespaceRemoved = results?.[0]?.result?.trailingWhitespaceRemoved || 0;
                console.log("Removed sections:", removedSections, "Trailing whitespace:", trailingWhitespaceRemoved);

                if (removedSections.length > 0 || trailingWhitespaceRemoved > 0) {
                    // Update TOC after removing sections
                    await chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: generateTOC,
                        args: [tab.url]
                    });

                    // Scroll to top of page
                    await chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: () => window.scrollTo(0, 0)
                    });

                    // Build status message
                    let statusParts = [];
                    if (removedSections.length > 0) {
                        statusParts.push(`${removedSections.length} blank section${removedSections.length > 1 ? 's' : ''}`);
                    }
                    if (trailingWhitespaceRemoved > 0) {
                        statusParts.push(`${trailingWhitespaceRemoved} empty paragraph${trailingWhitespaceRemoved > 1 ? 's' : ''}`);
                    }
                    showStatus(`Removed ${statusParts.join(' and ')}`);
                    showRemovalLog(removedSections);
                } else {
                    showStatus('No blank sections or trailing whitespace found');
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

            // Verify the formatter stored content before opening WordPress
            const storedContent = await chrome.storage.local.get('wordpress_formatted_content');
            console.log("Stored content check:", {
                hasData: !!storedContent.wordpress_formatted_content,
                titleLength: storedContent.wordpress_formatted_content?.title?.length,
                contentLength: storedContent.wordpress_formatted_content?.content?.length
            });

            // Step 3: Open WordPress and monitor tab
            const wordpressDomain = `${new URL(tab.url).hostname.split('.')[0]}.wordpress.com`;
            const wordpressUrl = `https://${wordpressDomain}/wp-admin/post-new.php?classic-editor`;
            showStatus('Opening WordPress...');
            console.log("Opening WordPress URL:", wordpressUrl);
            window.open(wordpressUrl, '_blank');

            await new Promise(resolve => setTimeout(resolve, 2000));

            const allTabs = await chrome.tabs.query({});

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
                const allTabs = await chrome.tabs.query({});
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
                            showStatus('Content copied - paste with Ctrl+V, then headers will be fixed');

                            // Note: The newline fix will be called by twitter-receiver.js
                            // after it detects the paste and fixes headers
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

    // Copy to Google Doc Button Handler
    if (buttons.copyToGoogleDoc) {
        buttons.copyToGoogleDoc.addEventListener('click', async () => {
            console.log("Copy to Google Doc button clicked");
            await copyToGoogleDoc(showStatus);
        });
    }

    // Review Google Doc Button Handler
    if (buttons.reviewGoogleDoc) {
        console.log("[Popup] Review Google Doc button found, adding handler");
        buttons.reviewGoogleDoc.addEventListener('click', async () => {
            console.log("[Popup] Review Google Doc button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                console.log("[Popup] Current tab:", tab?.url);

                // Check if we're on a Google Doc
                if (!tab.url || !tab.url.includes('docs.google.com/document/')) {
                    console.log("[Popup] Not on a Google Doc");
                    showStatus('Please open a Google Doc first', true);
                    return;
                }

                // Check if GoogleDocsReview is loaded
                console.log("[Popup] Checking GoogleDocsReview:", typeof window.GoogleDocsReview);
                if (!window.GoogleDocsReview) {
                    console.error("[Popup] GoogleDocsReview not loaded!");
                    showStatus('Error: Review module not loaded. Reload extension.', true);
                    return;
                }

                // Extract document ID from URL
                const docId = window.GoogleDocsReview.extractDocId(tab.url);
                console.log("[Popup] Extracted doc ID:", docId);
                if (!docId) {
                    showStatus('Could not extract document ID from URL', true);
                    return;
                }

                console.log("[Popup] Reviewing document:", docId);
                showStatus('Starting AI review...');

                // Perform the review
                console.log("[Popup] Calling GoogleDocsReview.review...");
                const result = await window.GoogleDocsReview.review(docId, showStatus);
                console.log("[Popup] Review result:", result);

                if (result && result.success) {
                    showStatus(result.message, false, 10000);
                } else if (result) {
                    showStatus('Error: ' + (result.error || 'Unknown error'), true);
                } else {
                    showStatus('Error: No result returned from review', true);
                }

            } catch (error) {
                console.error("[Popup] Review Google Doc error:", error);
                console.error("[Popup] Error stack:", error.stack);
                showStatus('Error: ' + (error.message || 'Unknown error'), true);
            }
        });
    } else {
        console.error("[Popup] Review Google Doc button NOT found!");
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
                    const linkCount = linkifyResults.results?.length || 0;
                    if (linkCount > 0) {
                        const linkedTexts = linkifyResults.results.map(r => `"${r.text}"`).join(', ');
                        showStatus(`Linkified ${linkCount} link${linkCount === 1 ? '' : 's'}: ${linkedTexts}`, false, 8000);
                    } else {
                        showStatus('No links added (no matches found)');
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

    // Manage Author Annotations Button Handler
    if (buttons.manageAuthorAnnotations) {
        buttons.manageAuthorAnnotations.addEventListener('click', () => {
            const url = chrome.runtime.getURL('author-annotations/ui/manage-annotations.html');
            chrome.tabs.create({ url });
        });
    }

    // Clean Link Sources Button Handler
    if (buttons.cleanLinkSources) {
        buttons.cleanLinkSources.addEventListener('click', async () => {
            console.log("Clean link sources button clicked");
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: cleanLinkSources
                });

                const result = results?.[0]?.result;
                console.log("Clean link sources result:", result);

                if (result?.success) {
                    if (result.count > 0) {
                        showStatus(`Cleaned ${result.count} link${result.count === 1 ? '' : 's'}`);
                    } else {
                        showStatus('No links with query parameters found');
                    }
                } else {
                    showStatus(result?.error || 'Error cleaning links', true);
                }
            } catch (error) {
                console.error("Clean link sources error:", error);
                showStatus('Error: ' + error.message, true);
            }
        });
    }

    // Twitter List Sync handlers
    initializeTwitterListSync();

    // Before initializing API Key Management
    console.log("About to call initializeApiKeyManagement");
    initializeApiKeyManagement();
    console.log("Finished calling initializeApiKeyManagement");
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Copies Substack content to a new Google Doc
 * @param {Function} showStatus - Status display function
 */
async function copyToGoogleDoc(showStatus) {
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

        showStatus('Extracting content...');

        // Extract title and content from Substack editor
        const extractResult = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: () => {
                try {
                    // Get title from <title> element
                    // Format is: Editing "TITLE" - Substack
                    const titleElement = document.querySelector('title');
                    let title = '';
                    if (titleElement) {
                        const rawTitle = titleElement.textContent;
                        const match = rawTitle.match(/^Editing "(.+)" - Substack$/);
                        if (match) {
                            title = match[1];
                        } else {
                            title = rawTitle.replace(" - Substack", "").trim();
                        }
                    }

                    // Get editor content
                    const editor = document.querySelector('div[contenteditable="true"][data-testid="editor"]') ||
                                  document.querySelector('.ProseMirror') ||
                                  document.querySelector('[contenteditable="true"]');

                    if (!editor) {
                        return { success: false, error: "Could not find editor" };
                    }

                    return {
                        success: true,
                        title: title,
                        html: editor.innerHTML,
                        text: editor.innerText
                    };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        const content = extractResult?.[0]?.result;
        if (!content?.success) {
            showStatus(content?.error || 'Error extracting content', true);
            return { success: false };
        }

        console.log("[Google Doc] Title:", content.title);
        console.log("[Google Doc] Content length:", content.html?.length);

        showStatus('Creating Google Doc...');

        // Use Google Docs API to create document with title and content
        try {
            const result = await window.GoogleDocsAPI.createDocWithContent(
                content.title || 'Untitled',
                content.html
            );

            console.log("[Google Doc] Created:", result.url);

            // Open the new document in the AI Links tab group
            await chrome.runtime.sendMessage({
                action: 'open-url-in-group',
                url: result.url,
                tabGroupName: 'AI Links',
                active: true
            });

            showStatus(`Created: ${content.title || 'Untitled'}`);
            return { success: true, title: content.title, url: result.url };

        } catch (apiError) {
            console.error("[Google Doc] API Error:", apiError);

            // If API fails, fall back to clipboard method
            if (apiError.message.includes('not granted') || apiError.message.includes('OAuth')) {
                showStatus('Please authorize Google Docs access...', true);
                // Try again with interactive auth
                try {
                    const result = await window.GoogleDocsAPI.createDocWithContent(
                        content.title || 'Untitled',
                        content.html
                    );
                    await chrome.runtime.sendMessage({
                        action: 'open-url-in-group',
                        url: result.url,
                        tabGroupName: 'AI Links',
                        active: true
                    });
                    showStatus(`Created: ${content.title || 'Untitled'}`);
                    return { success: true, title: content.title, url: result.url };
                } catch (retryError) {
                    showStatus('Auth failed: ' + retryError.message, true);
                    return { success: false, error: retryError.message };
                }
            }

            showStatus('API Error: ' + apiError.message, true);
            return { success: false, error: apiError.message };
        }

    } catch (error) {
        console.error("Copy to Google Doc error:", error);
        showStatus('Error: ' + error.message, true);
        return { success: false, error: error.message };
    }
}

/**
 * Strips query parameters from all links in the Substack editor
 * @returns {Object} Result object with success status and count of cleaned links
 */
function cleanLinkSources() {
    try {
        console.log("Starting cleanLinkSources");

        // Find the editor - try multiple selectors used by Substack
        const editor = document.querySelector('.ProseMirror') ||
                      document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('div[role="article"]');

        if (!editor) {
            console.error("Could not find editor element");
            return { success: false, error: "Could not find editor" };
        }

        const links = editor.querySelectorAll('a[href]');
        console.log(`Found ${links.length} links to check`);

        let count = 0;
        links.forEach(link => {
            try {
                const url = new URL(link.href);
                if (url.search) {  // has query parameters
                    console.log(`Cleaning: ${link.href}`);
                    url.search = '';  // remove all query params
                    link.href = url.toString();
                    count++;
                }
            } catch (e) {
                // Skip invalid URLs
                console.log(`Skipping invalid URL: ${link.href}`);
            }
        });

        console.log(`Cleaned ${count} links`);
        return { success: true, count };

    } catch (e) {
        console.error("Error in cleanLinkSources:", e);
        return { success: false, error: e.message };
    }
}

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
        const cutoffTitles = ["Preview post", "Post info", "Post settings", "Publish", "Heads up!", "Media settings"];
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

        // Check for an existing TOC. The container div's id rarely survives
        // ProseMirror's normalization, so detect BOTH by id (fresh insert)
        // and structurally: a header titled "Table of Contents" plus the
        // list that follows it. Extract each entry's trailing content AS
        // HTML so hand-added words keep their formatting, then delete the
        // old TOC entirely.
        const tocContainerId = 'generated-toc';
        const TOC_TITLE_PATTERN = /^table of contents$/i;
        const existingEntryExtras = {};

        const collectEntryExtras = (scopeEl) => {
            if (!scopeEl) return;
            scopeEl.querySelectorAll('li').forEach(item => {
                const link = item.querySelector('a');
                if (!link) return;
                const linkText = link.textContent.trim();
                const normalizedTitle = linkText.replace(/[.!?]\s*$/, '').replace(/\s*\(Blank\)\s*$/, '').trim();
                if (!normalizedTitle || TOC_TITLE_PATTERN.test(normalizedTitle)) return;
                // Everything after the link, cloned as HTML, so bold/italics/
                // links in hand-edited annotations survive regeneration
                const extra = document.createElement('div');
                let node = link.nextSibling;
                while (node) {
                    extra.appendChild(node.cloneNode(true));
                    node = node.nextSibling;
                }
                if (extra.innerHTML.trim()) {
                    existingEntryExtras[normalizedTitle] = extra.innerHTML;
                    console.log(`Preserving TOC extra for "${normalizedTitle}":`, extra.innerHTML.substring(0, 80));
                }
            });
        };

        // Case 1: container still has its id (TOC inserted this session)
        const existingTocById = document.getElementById(tocContainerId);
        if (existingTocById) {
            collectEntryExtras(existingTocById);
            existingTocById.remove();
        }

        // Case 2: structural detection after ProseMirror stripped the id
        const tocHeader = headersArray.find(h =>
            h.isConnected && TOC_TITLE_PATTERN.test(h.textContent.trim()));
        if (tocHeader) {
            const toRemove = [];
            let n = tocHeader.nextElementSibling;
            while (n && !['H1', 'H2', 'H3', 'H4'].includes(n.tagName)) {
                const listEl = ['OL', 'UL'].includes(n.tagName) ? n : n.querySelector?.('ol, ul');
                if (listEl) {
                    collectEntryExtras(listEl);
                    toRemove.push(n);
                    break;
                }
                if (!n.textContent.trim()) {
                    // Empty filler between TOC title and list
                    toRemove.push(n);
                    n = n.nextElementSibling;
                    continue;
                }
                break; // real content — don't eat it
            }
            toRemove.forEach(el => el.remove());
            tocHeader.remove();
        }

        // Never list a TOC header as a TOC entry, and drop anything the
        // removal above disconnected
        headersArray = headersArray.filter(h =>
            h.isConnected && !TOC_TITLE_PATTERN.test(h.textContent.trim()));
        if (headersArray.length === 0) {
            return { success: false, error: "No headers found to generate TOC" };
        }

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
            const headerText = header.textContent.trim();
            const endsWithPunctuation = /[.!?]$/.test(headerText);
            const linkText = headerText +
                               (endsWithPunctuation ? '' : '.') +
                               (isEmpty ? labelAsBlank : '');
            // Special-case titles whose TOC entries render in italics
            const ITALIC_TOC_TITLES = ['people just say things'];
            const titleForItalics = headerText.replace(/[.!?]\s*$/, '').trim().toLowerCase();
            if (ITALIC_TOC_TITLES.includes(titleForItalics)) {
                const em = document.createElement('em');
                em.textContent = linkText;
                tocLink.appendChild(em);
            } else {
                tocLink.textContent = linkText;
            }

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

            // Re-attach any hand-added content from the old TOC entry,
            // formatting included
            const normalizedHeaderText = headerText.replace(/[.!?]\s*$/, '').trim();
            if (existingEntryExtras[normalizedHeaderText]) {
                tocItem.insertAdjacentHTML('beforeend', existingEntryExtras[normalizedHeaderText]);
            }

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
 * Removes blank sections and trailing whitespace from the document
 * @returns {Object} Object containing array of removed section titles
 */
function removeBlanks() {
    try {
        console.log("Starting removeBlanks");
        const removedSections = [];
        let trailingWhitespaceRemoved = 0;

        // A block is "visually empty" when it has no visible text and no
        // meaningful embedded content. Zero-width characters don't count as
        // text (trim() leaves them, and the blockquote shortcut inserts
        // U+200B placeholders). Blocks holding images/embeds/dividers are NOT empty
        // even though their textContent is '' — deleting them would eat
        // captionless images. Headers and dividers themselves are boundaries,
        // never whitespace. (Mirrored in tests/removeBlanks.test.js.)
        const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;
        const BOUNDARY_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR'];
        const isVisuallyEmpty = (el) => {
            if (!el) return false;
            if (BOUNDARY_TAGS.includes(el.tagName)) return false;
            if (el.querySelector('img, figure, iframe, video, audio, embed, object, hr')) return false;
            return el.textContent.replace(ZERO_WIDTH, '').trim() === '';
        };

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
            let isEmpty = true;
            let nextSibling = header.nextElementSibling;

            while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
                if (!isVisuallyEmpty(nextSibling)) {
                    isEmpty = false;
                    break;
                }
                nextSibling = nextSibling.nextElementSibling;
            }

            // Remove empty sections
            if (isEmpty) {
                console.log("Found empty section:", header.textContent);
                removedSections.push(header.textContent.trim());
                // Capture the section body BEFORE removing the header —
                // a detached header has no siblings
                let bodyEl = header.nextElementSibling;
                header.remove();
                while (bodyEl && !['H1', 'H2', 'H3', 'H4'].includes(bodyEl.tagName)) {
                    let toRemove = bodyEl;
                    bodyEl = bodyEl.nextElementSibling;
                    toRemove.remove();
                }
            }
        });

        // Remove dead whitespace at the end of sections: empty blocks
        // immediately before every section boundary (headers AND horizontal
        // rule dividers). Scoped to the editor so Substack UI is untouched.
        const boundaries = document.querySelectorAll(
            '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, ' +
            '.ProseMirror h5, .ProseMirror h6, .ProseMirror hr'
        );
        boundaries.forEach(boundary => {
            let prevSibling = boundary.previousElementSibling;
            while (isVisuallyEmpty(prevSibling)) {
                console.log("Removing trailing whitespace before:", boundary.textContent?.substring(0, 30) || boundary.tagName);
                let toRemove = prevSibling;
                prevSibling = prevSibling.previousElementSibling;
                toRemove.remove();
                trailingWhitespaceRemoved++;
            }
        });

        // Remove trailing empty paragraphs inside blockquotes — they render
        // as dead space at the end of the quote
        document.querySelectorAll('.ProseMirror blockquote').forEach(bq => {
            let last = bq.lastElementChild;
            while (isVisuallyEmpty(last)) {
                console.log("Removing trailing whitespace at end of blockquote");
                let toRemove = last;
                last = last.previousElementSibling;
                toRemove.remove();
                trailingWhitespaceRemoved++;
            }
        });

        // Remove trailing whitespace at end of document (in ProseMirror editor)
        const editor = document.querySelector('.ProseMirror');
        if (editor) {
            let lastChild = editor.lastElementChild;
            while (isVisuallyEmpty(lastChild)) {
                console.log("Removing trailing whitespace at end of document");
                let toRemove = lastChild;
                lastChild = lastChild.previousElementSibling;
                toRemove.remove();
                trailingWhitespaceRemoved++;
            }
        }

        console.log("Removed sections:", removedSections.length, "Trailing whitespace:", trailingWhitespaceRemoved);
        return { removedSections, trailingWhitespaceRemoved };

    } catch (e) {
        console.error("Error in removeBlanks:", e);
        return { removedSections: [], trailingWhitespaceRemoved: 0 };
    }
}

// ============================================================================
// Settings Management
// ============================================================================

function initializeApiKeyManagement() {
    console.log("Inside initializeApiKeyManagement");

    // Load existing settings
    loadApiKeys();

    // Open Options button handler
    const openOptionsBtn = document.getElementById('open-options');
    if (openOptionsBtn) {
        openOptionsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }

    // Google Client Secret handlers
    const googleSecretInput = document.getElementById('google-client-secret');
    const saveGoogleSecretBtn = document.getElementById('save-google-secret');
    const showGoogleSecretBtn = document.getElementById('show-google-secret');

    if (saveGoogleSecretBtn && googleSecretInput) {
        saveGoogleSecretBtn.addEventListener('click', async () => {
            console.log("Saving Google client secret");
            try {
                const secret = googleSecretInput.value.trim();
                await chrome.storage.local.set({ 'google-client-secret': secret });
                showApiStatus('Google client secret saved');
            } catch (error) {
                console.error("Error saving Google secret:", error);
                showApiStatus('Error saving Google secret', true);
            }
        });
    }

    if (showGoogleSecretBtn && googleSecretInput) {
        showGoogleSecretBtn.addEventListener('click', () => {
            googleSecretInput.type = googleSecretInput.type === 'password' ? 'text' : 'password';
            showGoogleSecretBtn.textContent = googleSecretInput.type === 'password' ? 'Show' : 'Hide';
        });
    }
}

async function loadApiKeys() {
    console.log("Loading saved settings");
    try {
        const result = await chrome.storage.local.get(['twitter-username', 'twitter-list-id', 'twitter-source-list', 'twitter-tab-group-name', 'google-client-secret']);

        // Load Twitter List Sync settings
        const twitterUsernameInput = document.getElementById('twitter-username');
        if (twitterUsernameInput && result['twitter-username']) {
            twitterUsernameInput.value = result['twitter-username'];
            console.log("Twitter username loaded");
        }

        const twitterSourceListInput = document.getElementById('twitter-source-list');
        if (twitterSourceListInput) {
            twitterSourceListInput.value = result['twitter-source-list'] || '';
            console.log("Twitter source list loaded:", result['twitter-source-list'] || '(empty)');
        }

        const twitterListIdInput = document.getElementById('twitter-list-id');
        if (twitterListIdInput) {
            twitterListIdInput.value = result['twitter-list-id'] || '';
            console.log("Twitter dest list ID loaded:", result['twitter-list-id'] || '(empty)');
        }

        const twitterTabGroupInput = document.getElementById('twitter-tab-group');
        if (twitterTabGroupInput) {
            twitterTabGroupInput.value = result['twitter-tab-group-name'] || '';
            console.log("Twitter tab group loaded:", result['twitter-tab-group-name'] || '(default: AI Links)');
        }

        const googleSecretInput = document.getElementById('google-client-secret');
        if (googleSecretInput && result['google-client-secret']) {
            googleSecretInput.value = result['google-client-secret'];
            console.log("Google client secret loaded");
        }
    } catch (error) {
        console.error("Error loading API keys:", error);
        showApiStatus('Error loading API keys', true);
    }
}

// ============================================================================
// Twitter List Sync
// ============================================================================

function showTwitterSyncStatus(message, type = 'info') {
    const statusEl = document.getElementById('twitter-sync-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = type;
        statusEl.style.display = 'block';
    }
}

function initializeTwitterListSync() {
    console.log("Initializing Twitter List Sync");

    // Save username button
    const saveUsernameBtn = document.getElementById('save-twitter-username');
    if (saveUsernameBtn) {
        saveUsernameBtn.addEventListener('click', async () => {
            const input = document.getElementById('twitter-username');
            let username = input.value.trim();
            // Remove @ if present
            if (username.startsWith('@')) {
                username = username.substring(1);
            }
            await chrome.storage.local.set({ 'twitter-username': username });
            showTwitterSyncStatus('Username saved', 'success');
        });
    }

    // Save source list ID button
    const saveSourceListBtn = document.getElementById('save-source-list');
    if (saveSourceListBtn) {
        saveSourceListBtn.addEventListener('click', async () => {
            const input = document.getElementById('twitter-source-list');
            const listId = input.value.trim();
            await chrome.storage.local.set({ 'twitter-source-list': listId });
            showTwitterSyncStatus(listId ? 'Source list saved' : 'Source cleared (will use Following)', 'success');
        });
    }

    // Save dest list ID button
    const saveListBtn = document.getElementById('save-twitter-list');
    if (saveListBtn) {
        saveListBtn.addEventListener('click', async () => {
            const input = document.getElementById('twitter-list-id');
            const listId = input.value.trim();
            await chrome.storage.local.set({ 'twitter-list-id': listId });
            showTwitterSyncStatus('Destination list saved', 'success');
        });
    }

    // Save tab group name button
    const saveTabGroupBtn = document.getElementById('save-tab-group');
    if (saveTabGroupBtn) {
        saveTabGroupBtn.addEventListener('click', async () => {
            const input = document.getElementById('twitter-tab-group');
            const groupName = input.value.trim();
            await chrome.storage.local.set({ 'twitter-tab-group-name': groupName || 'AI Links' });
            showTwitterSyncStatus(groupName ? `Tab group set to "${groupName}"` : 'Tab group reset to "AI Links"', 'success');
        });
    }

    // Add Only button
    const addOnlyBtn = document.getElementById('sync-add-only');
    if (addOnlyBtn) {
        addOnlyBtn.addEventListener('click', () => performTwitterSync('add'));
    }

    // Remove Only button
    const removeOnlyBtn = document.getElementById('sync-remove-only');
    if (removeOnlyBtn) {
        removeOnlyBtn.addEventListener('click', () => performTwitterSync('remove'));
    }

    // Full Sync button
    const fullSyncBtn = document.getElementById('sync-full');
    if (fullSyncBtn) {
        fullSyncBtn.addEventListener('click', () => performTwitterSync('full'));
    }

    // Reset Google Auth button
    const resetGoogleAuthBtn = document.getElementById('reset-google-auth');
    if (resetGoogleAuthBtn) {
        resetGoogleAuthBtn.addEventListener('click', async () => {
            await chrome.storage.local.remove([
                'google-access-token',
                'google-token-expiry',
                'google-refresh-token'
            ]);
            showStatus('Google auth reset - will re-authorize on next use', false);
        });
    }
}

async function performTwitterSync(mode) {
    console.log(`Starting Twitter sync: ${mode}`);

    // Get saved settings
    const settings = await chrome.storage.local.get(['twitter-username', 'twitter-list-id', 'twitter-source-list']);
    const username = settings['twitter-username'];
    const destListId = settings['twitter-list-id'];
    const sourceListId = settings['twitter-source-list'];

    if (!username) {
        showTwitterSyncStatus('Please enter your Twitter username first', 'error');
        return;
    }

    if (!destListId) {
        showTwitterSyncStatus('Please enter a destination List ID first', 'error');
        return;
    }

    // Get current tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Show status based on source
    if (!sourceListId) {
        showTwitterSyncStatus('Opening Following page and syncing...', 'info');
    } else {
        showTwitterSyncStatus(`Syncing from list ${sourceListId}...`, 'info');
    }

    // Send to background script (which stays alive when popup closes)
    chrome.runtime.sendMessage({
        action: 'twitter-list-sync',
        username: username,
        destListId: destListId,
        sourceListId: sourceListId || null,
        mode: mode,
        tabId: currentTab.id
    }, (result) => {
        if (chrome.runtime.lastError) {
            console.error('Sync message error:', chrome.runtime.lastError);
            return;
        }
        console.log('Sync result:', result);

        if (result?.success) {
            showTwitterSyncStatus(`Done! Added: ${result.added}, Removed: ${result.removed}`, 'success');
        } else {
            showTwitterSyncStatus('Error: ' + (result?.error || 'Unknown'), 'error');
        }
    });
}