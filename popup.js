// Helper function to show status messages
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.display = 'block';
    status.className = isError ? 'error' : 'success';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
}

// Helper function to log removal information
function showRemovalLog(removedItems) {
    const log = document.getElementById('removal-log');
    if (removedItems.length > 0) {
      log.innerHTML = '<strong>Removed sections:</strong><br>' + 
        removedItems.map(item => `- ${item}`).join('<br>');
      log.style.display = 'block';
    } else {
      log.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generate-toc');
    const removeBlanksButton = document.getElementById('remove-blanks');
    const wordpressButton = document.getElementById('post-wordpress');
    const linkifyButton = document.getElementById('linkify');

    if (generateButton) {
        generateButton.addEventListener('click', async () => {
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
                showStatus('Error: ' + error.message, true);
            }
        });
    }

    if (removeBlanksButton) {
        removeBlanksButton.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                console.log("Executing removeBlanks");
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: removeBlanks
                });
                
                console.log("Got results:", results);
                const removedSections = results?.[0]?.result?.removedSections;
                console.log("Removed sections from results:", removedSections);
                
                if (removedSections && removedSections.length > 0) {
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
                console.log("Error in click handler:", error);
                showStatus('Error removing blank sections: ' + error.message, true);
            }
        });
    }

    if (wordpressButton) {
        wordpressButton.addEventListener('click', async () => {
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
                console.log("Format result:", formatResult);
                if (!formatResult?.[0]?.result?.success) {
                    throw new Error(formatResult?.[0]?.result?.error || 'Failed to format content');
                }

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
                        })
                        if (wpTab) {
                            console.log("Found WordPress tab, waiting for ready state...");
                            let readyStateChecks = 0;
                            while (readyStateChecks < 20) {
                                const currentTab = await chrome.tabs.get(wpTab.id);
                                console.log(`Tab status check ${readyStateChecks + 1}:`, currentTab.status);
                                if (currentTab.status === 'complete') {
                                    break;
                                }
                                await new Promise(resolve => setTimeout(resolve, 500));
                                readyStateChecks++;
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
                        console.error("WordPress tab never reached ready state");
                        showStatus('WordPress tab not ready', true);
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
    } else {
        console.error("WordPress button not found in popup");
    }
  
    if (linkifyButton) {
        linkifyButton.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (!tab.url.includes('substack.com')) {
                    showStatus('This feature only works on Substack pages', true);
                    return;
                }
    
                // Clean up previous script
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    function: () => {
                        window.linkifyContent = undefined;
                        window.linkRules = undefined;
                        window.linkResults = undefined;
                        // Also remove the observer if it exists
                        if (window._linkifyObserver) {
                            window._linkifyObserver.disconnect();
                            window._linkifyObserver = null;
                        }

                        // Clean up the style
                        document.querySelector('#linkify-hover-style')?.remove();
                    }
                });
    
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
    
                // Then inject and run
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['linkify/linkify-controller.js']
                });
    
                // Then call the function
                const results = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    function: async () => {
                        if (typeof window.linkifyContent !== 'function') {
                            console.error('Linkify content function not found');
                            return { success: false, error: 'Linkify functionality not initialized' };
                        }
                        return await window.linkifyContent();
                    }
                });
    
                // ... rest of handler ...

                const result = results?.[0]?.result;
                if (result?.success) {
                    const linkCount = result.results.length;
                    if (linkCount > 0) {
                        showStatus(`Added ${linkCount} link${linkCount === 1 ? '' : 's'}`);
                        const logDiv = document.getElementById('linkify-log');
                        logDiv.innerHTML = '<strong>Links added:</strong><br>' + 
                            result.results.map(item => 
                                `- "${item.text}" ${item.location}`
                            ).join('<br>');
                        logDiv.style.display = 'block';
                    } else {
                        showStatus('No matching text found to link');
                    }
                } else {
                    showStatus(result?.error || 'Error adding links', true);
                }
            } catch (error) {
                console.error('Error in linkify handler:', error);
                showStatus('Error: ' + error.message, true);
            }
        });
    }

    const manageLinkifyRulesButton = document.getElementById('manage-linkify-rules');
    if (manageLinkifyRulesButton) {
        manageLinkifyRulesButton.addEventListener('click', () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL('linkify/ui/manage-linkify-rules.html')
        });
    });
// API Key Management
const apiKeyInput = document.getElementById('claude-api-key');
const saveKeyButton = document.getElementById('save-api-key');
const showKeyButton = document.getElementById('show-key');
const statusDiv = document.getElementById('api-key-status');

// Load existing API key if any
chrome.storage.local.get('llmApiKeys', function(data) {
    if (data.llmApiKeys?.ClaudeApi) {
        apiKeyInput.value = data.llmApiKeys.ClaudeApi;
        showStatus('API key loaded', false);
    }
});

// Toggle key visibility
showKeyButton.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        showKeyButton.textContent = '🔒';
    } else {
        apiKeyInput.type = 'password';
        showKeyButton.textContent = '👁️';
    }
});

// Save API key
saveKeyButton.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    
    try {
        if (!key.startsWith('sk-') || key.length < 10) {
            throw new Error('Invalid API key format. Should start with "sk-"');
        }

        const llmApiKeys = (await chrome.storage.local.get('llmApiKeys')).llmApiKeys || {};
        llmApiKeys.ClaudeApi = key;
        await chrome.storage.local.set({ llmApiKeys });
        
        // After saving, retrieve and show the stored key
        const stored = await chrome.storage.local.get('llmApiKeys');
        const storedKey = stored.llmApiKeys.ClaudeApi;
        showStatus(`API key saved successfully. First 10 chars: ${storedKey.substring(0, 10)}`, false);

    } catch (error) {
        console.error('API key error:', error);
        showStatus(error.message, true);
    }
});

    function showStatus(message, isError = false) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + (isError ? 'error' : 'success');
    }

}
});

function generateTOC(postUrl) {
    try {
        console.log("Starting TOC generation");
        
        const headers = document.querySelectorAll('h1, h2, h3, h4');
        let headersArray = Array.from(headers)
            .filter(header => header.textContent.trim() !== "");
        
        const cutoffTitles = ["Preview post", "Post info", "Post settings", "Publish", "Heads up!"];
        const cutoffIndex = headersArray.findIndex(header => 
            cutoffTitles.includes(header.textContent.trim())
        );
        if (cutoffIndex !== -1) {
            headersArray = headersArray.slice(0, cutoffIndex);
        }
        
        if (headersArray.length === 0) {
            return { success: false, error: "No headers found to generate TOC" };
        }
        
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
        
        let tocList = document.createElement('ol');
        headersArray.forEach((header, index) => {
            let id = header.id || `section-${index}`;
            header.id = id;
            
            let isEmpty = true;
            let nextSibling = header.nextElementSibling;
            while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
                if (nextSibling.textContent.trim() !== "") {
                    isEmpty = false;
                    break;
                }
                nextSibling = nextSibling.nextElementSibling;
            }
            
            let tocItem = document.createElement('li');
            let tocLink = document.createElement('a');
            tocLink.textContent = header.textContent.trim() + 
                               (header.textContent.trim().endsWith('.') ? '' : '.') +
                               (isEmpty ? labelAsBlank : '');
            
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

async function removeBlanks() {
    try {
        console.log("Starting removeBlanks");
        const removedSections = [];
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
        console.log("Removed sections length:", removedSections.length);
        
        return { removedSections };
    } catch (e) {
        console.error("Error in removeBlanks:", e);
        return { removedSections: [] };
    }
}