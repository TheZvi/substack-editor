// content.js - update existing file

console.log("Content script loading"); // todo remove

// Prevent duplicate initialization if script is injected multiple times
if (window.__substackEditorContentScriptLoaded) {
    console.log("Content script already loaded, skipping initialization");
} else {
    window.__substackEditorContentScriptLoaded = true;
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   // Ping handler - used to check if content script is running
   if (request.action === "ping") {
       sendResponse({ pong: true });
       return;
   }
   if (request.action === "transformText") {
       // Forward the message to the page context
       window.postMessage({
           type: 'transform-text',
           text: request.text
       }, '*');
       // Acknowledge receipt
       sendResponse({received: true});
   }
   return true; // Indicates we'll send a response asynchronously
});

// Handle communication between page scripts and chrome.storage
window.addEventListener('message', async (event) => {
   console.log("Content script received message:", event.data);
   if (event.source !== window) return;
   
   if (event.data.type === 'get-api-key') {
       const result = await chrome.storage.local.get(null);
       console.log('All stored keys:', Object.keys(result));
       
       const keyMap = {
           'gemini-api-key': 'gemini-api-key',
           'claude-api-key': 'claude-api-key'
       };
       
       const storageKey = keyMap[event.data.service];
       const apiKey = result[storageKey];
       console.log('Retrieving API key for:', event.data.service, 'using storage key:', storageKey);
       
       window.postMessage({
           type: 'api-key-response',
           key: apiKey,
           success: true
       }, '*');
   }
   else if (event.data.type === 'set-api-key') {
       const result = await chrome.storage.local.get('llmApiKeys');
       const llmApiKeys = result.llmApiKeys || {};
       llmApiKeys[event.data.service] = event.data.key;
       await chrome.storage.local.set({ llmApiKeys });
   }
   else if (event.data.type === 'get-gemini-model') {
       const result = await chrome.storage.local.get('gemini-model');
       window.postMessage({
           type: 'gemini-model-response',
           model: result['gemini-model']
       }, '*');
   }
   else if (event.data.type === 'claude-api-request' || event.data.type === 'gemini-api-request') {
       try {
           const response = await chrome.runtime.sendMessage({
               action: event.data.type,
               endpoint: event.data.endpoint,
               payload: event.data.payload,
               options: event.data.options
           });

           window.postMessage({
               type: event.data.type.replace('request', 'response'),
               response: response
           }, '*');
       } catch (error) {
           window.postMessage({
               type: event.data.type.replace('request', 'response'),
               error: error.message
           }, '*');
       }
   }
});

async function loadTransformScripts() {
    try {
        // Load scripts in sequence
        await loadScript('shared/llm/config/api-keys.local.js');
        await loadScript('shared/llm/api/base-api.js');
        await loadScript('shared/llm/api/gemini_api.js');
        await loadScript('shared/llm/api/claude_api.js');
        await loadScript('features/text-transform/transform-controller.js');
    } catch (error) {
        console.error('Error loading transform scripts:', error);
    }
}

function loadScript(path) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(path);
        script.onload = () => resolve();
        script.onerror = (error) => reject(error);
        document.head.appendChild(script);
    });
}

// Call the loading function
loadTransformScripts();

// ============================================================================
// Blockquote Override - Restore markdown "> " behavior
// ============================================================================

function initBlockquoteOverride() {
    console.log("[Blockquote Override] Initializing...");

    // Wait for the editor to be available
    const checkEditor = setInterval(() => {
        const editor = document.querySelector('.ProseMirror');
        if (editor) {
            clearInterval(checkEditor);
            setupBlockquoteListener(editor);
            setupSmartPaste(editor);
            setupHeaderToggle(editor);
        }
    }, 500);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkEditor), 30000);
}

function setupBlockquoteListener(editor) {
    console.log("[Blockquote Override] Editor found, setting up listener");

    // Use keydown to intercept BEFORE Substack processes it
    editor.addEventListener('keydown', (e) => {
        // Only care about space key
        if (e.key !== ' ' && e.code !== 'Space') return;

        console.log("[Blockquote] Space pressed, checking for '>' trigger");

        const selection = window.getSelection();
        if (!selection.rangeCount) {
            console.log("[Blockquote] No selection range");
            return;
        }

        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let text, cursorPos;

        // Handle both text nodes and element nodes with text children
        if (node.nodeType === Node.TEXT_NODE) {
            text = node.textContent;
            cursorPos = range.startOffset;
        } else if (node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
            text = node.firstChild.textContent;
            cursorPos = text.length;
            node = node.firstChild;
        } else {
            console.log("[Blockquote] Node is not text:", node.nodeType, node.nodeName);
            return;
        }

        const textBeforeCursor = text.substring(0, cursorPos);
        console.log("[Blockquote] Text before cursor:", JSON.stringify(textBeforeCursor));

        // Check if text before cursor is ">" at start of line (markdown blockquote syntax)
        if (textBeforeCursor === '>') {

            // Find the paragraph element
            let paragraph = node.parentElement;
            while (paragraph && !['P', 'DIV'].includes(paragraph.tagName)) {
                paragraph = paragraph.parentElement;
            }

            if (!paragraph) return;

            // Check if already in a blockquote
            if (paragraph.closest('blockquote')) return;

            // Prevent default space insertion and Substack's poetry block
            e.preventDefault();
            e.stopPropagation();

            // Get any text after the trigger
            const remainingText = text.substring(cursorPos);

            // Convert to blockquote
            convertToBlockquote(editor, paragraph, remainingText);
        }
    }, true); // Use capture phase to get it before Substack

    console.log("[Blockquote Override] Listener active");
}

function convertToBlockquote(editor, paragraph, text) {
    try {
        // Use execCommand to create blockquote - this works with ProseMirror's undo stack
        // First, select the paragraph content
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        selection.removeAllRanges();
        selection.addRange(range);

        // Clear the paragraph first
        paragraph.textContent = text || '\u200B'; // Use zero-width space if empty

        // Select all content in paragraph
        range.selectNodeContents(paragraph);
        selection.removeAllRanges();
        selection.addRange(range);

        // Try to use Substack's/ProseMirror's blockquote command
        // ProseMirror typically uses a custom command system, but we can try the DOM approach

        // Create blockquote element
        const blockquote = document.createElement('blockquote');
        blockquote.className = paragraph.className; // Preserve classes

        // Move paragraph into blockquote
        paragraph.parentNode.insertBefore(blockquote, paragraph);
        blockquote.appendChild(paragraph);

        // Place cursor at start of the text
        const newRange = document.createRange();
        if (paragraph.firstChild) {
            newRange.setStart(paragraph.firstChild, 0);
            newRange.collapse(true);
        } else {
            newRange.selectNodeContents(paragraph);
            newRange.collapse(true);
        }
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Trigger input event so ProseMirror knows something changed
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch (error) {
        console.error("[Blockquote Override] Error:", error);
    }
}

// ============================================================================
// Smart Paste - ;v shortcut for quote-aware pasting
// ============================================================================

function setupSmartPaste(editor) {
    console.log("[Smart Paste] Setting up listener");

    let recentKeys = '';
    let keyTimeout = null;

    editor.addEventListener('keydown', (e) => {
        // Check for Alt+V shortcut
        if (e.altKey && (e.key === 'v' || e.key === 'V')) {
            console.log("[Smart Paste] Alt+V detected");
            e.preventDefault();
            e.stopPropagation();
            smartPaste(editor);
            return;
        }

        // Build up recent key sequence
        recentKeys += e.key;

        // Clear after 1 second of no typing
        clearTimeout(keyTimeout);
        keyTimeout = setTimeout(() => {
            recentKeys = '';
        }, 1000);

        // Check for ";v" command
        if (recentKeys.endsWith(';v')) {
            console.log("[Smart Paste] ;v detected");
            recentKeys = '';

            e.preventDefault();
            e.stopPropagation();

            // Delete the ";" we typed (the "v" was prevented)
            deleteTypedChars(editor);

            // Perform smart paste
            smartPaste(editor);
        }
    }, true);
}

function deleteTypedChars(editor) {
    // Delete the semicolon that was typed (the "v" was prevented)
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        const cursorPos = range.startOffset;
        const text = node.textContent;

        // Find and remove the semicolon before cursor
        const beforeCursor = text.substring(0, cursorPos);
        const semicolonPos = beforeCursor.lastIndexOf(';');

        if (semicolonPos !== -1) {
            node.textContent = text.substring(0, semicolonPos) + text.substring(semicolonPos + 1);
            // Move cursor back
            const newPos = Math.max(0, semicolonPos);
            range.setStart(node, newPos);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE && node.firstChild) {
        // Try the first child if we're on an element
        node = node.firstChild;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const semicolonPos = text.lastIndexOf(';');
            if (semicolonPos !== -1) {
                node.textContent = text.substring(0, semicolonPos) + text.substring(semicolonPos + 1);
            }
        }
    }

    // Trigger input event
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

async function smartPaste(editor) {
    try {
        // Read clipboard - try full read first, fall back to text-only
        let htmlContent = null;
        let textContent = null;
        let imageBlobs = []; // Store any images from clipboard

        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types.includes('text/html')) {
                    const blob = await item.getType('text/html');
                    htmlContent = await blob.text();
                }
                if (item.types.includes('text/plain')) {
                    const blob = await item.getType('text/plain');
                    textContent = await blob.text();
                }
                // Check for images in clipboard
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        console.log("[Smart Paste] Found image type:", type);
                        const imageBlob = await item.getType(type);
                        imageBlobs.push(imageBlob);
                    }
                }
            }
            console.log("[Smart Paste] Found", imageBlobs.length, "images in clipboard");
        } catch (clipErr) {
            console.log("[Smart Paste] Full clipboard read failed, trying text-only:", clipErr.message);
            // Fallback to text-only read
            try {
                textContent = await navigator.clipboard.readText();
            } catch (textErr) {
                console.error("[Smart Paste] Clipboard read failed entirely:", textErr.message);
                // Last resort - just do normal paste
                document.execCommand('paste');
                return;
            }
        }

        // Also try to extract images from HTML content (e.g., from tweets)
        let htmlImageUrls = [];
        if (htmlContent) {
            console.log("[Smart Paste] Full HTML content:", htmlContent);

            // Try multiple patterns for finding images
            const patterns = [
                // Standard img src
                /<img[^>]+src="([^"]+)"[^>]*>/gi,
                // img with srcset (take first URL)
                /<img[^>]+srcset="([^\s"]+)/gi,
                // data-src attribute
                /data-src="([^"]+)"/gi,
                // Background image in style
                /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/gi,
                // Twitter media URLs in any attribute
                /(https:\/\/pbs\.twimg\.com\/media\/[^\s"'<>]+)/gi,
                // General image URLs (jpg, png, webp)
                /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/gi
            ];

            const foundUrls = new Set();
            for (const pattern of patterns) {
                const matches = htmlContent.matchAll(pattern);
                for (const match of matches) {
                    const src = match[1];
                    // Filter out small icons/emojis
                    if (src &&
                        !src.includes('emoji') &&
                        !src.includes('twemoji') &&
                        !src.includes('/1f') &&
                        !src.includes('icon') &&
                        !src.includes('profile_images') &&  // Skip profile pics
                        !src.includes('_normal') &&  // Skip Twitter thumbnails
                        !src.includes('_mini') &&
                        src.length > 20) {  // Skip very short URLs
                        foundUrls.add(src);
                    }
                }
            }

            htmlImageUrls = [...foundUrls];
            console.log("[Smart Paste] Found", htmlImageUrls.length, "image URLs in HTML:", htmlImageUrls);
        }

        console.log("[Smart Paste] Clipboard text:", textContent?.substring(0, 100));
        console.log("[Smart Paste] Clipboard HTML:", htmlContent?.substring(0, 200));

        // Check if content looks like a quote (Name: text format)
        const isQuote = textContent && /^[^:]+:\s/.test(textContent);

        // Check if we're already in a blockquote
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log("[Smart Paste] No selection, doing normal paste");
            document.execCommand('paste');
            return;
        }
        const range = selection.getRangeAt(0);
        const inBlockquote = range.startContainer.parentElement?.closest('blockquote');

        console.log("[Smart Paste] Is quote format:", isQuote, "In blockquote:", !!inBlockquote);

        if (isQuote && !inBlockquote) {
            // Create blockquote with all content inside it
            console.log("[Smart Paste] Creating blockquote for quote content");

            let blockquoteHtml;

            // Prefer HTML content if available (preserves all links from Alt+A copy)
            if (htmlContent) {
                console.log("[Smart Paste] Using HTML content to preserve links");

                // Clean up the HTML content for blockquote formatting
                // The HTML from Alt+A looks like: <a href="...">Author</a>: text with <a>links</a>
                // We need to handle paragraph breaks properly

                // First, normalize any existing paragraph structure
                let cleanedHtml = htmlContent;

                // Convert double <br> to paragraph marker
                cleanedHtml = cleanedHtml.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n');

                // Convert single <br> to newline for processing
                cleanedHtml = cleanedHtml.replace(/<br\s*\/?>/gi, '\n');

                // Split into paragraphs, preserving HTML tags
                const paragraphs = cleanedHtml.split(/\n\n+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0);

                console.log("[Smart Paste] HTML paragraphs:", paragraphs.length);

                // Rebuild with proper formatting
                let content = paragraphs
                    .map(p => p.replace(/\n/g, '<br>'))
                    .join('<br><br>');

                blockquoteHtml = `<blockquote><p>${content}</p></blockquote>`;
            } else if (textContent) {
                // Fallback: build from plain text (links won't be preserved)
                console.log("[Smart Paste] Falling back to text content (no HTML available)");

                // Normalize line endings: convert Windows \r\n and old Mac \r to Unix \n
                const normalizedText = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                // Split by double newlines, filter empty, and trim each paragraph
                const paragraphs = normalizedText.split(/\n\n+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0);

                console.log("[Smart Paste] Text paragraphs:", paragraphs.length, paragraphs.map(p => p.substring(0, 30)));

                // Build content - use <br><br> between paragraphs
                let content = paragraphs
                    .map(p => p.replace(/\n/g, '<br>'))
                    .join('<br><br>');

                blockquoteHtml = `<blockquote><p>${content}</p></blockquote>`;
            }

            console.log("[Smart Paste] Inserting blockquote HTML:", blockquoteHtml?.substring(0, 200));
            document.execCommand('insertHTML', false, blockquoteHtml);

            // Trigger input event
            editor.dispatchEvent(new InputEvent('input', { bubbles: true }));

            // Images are now included in blockquote, no need to append separately
        } else {
            // Normal paste
            if (htmlContent) {
                document.execCommand('insertHTML', false, htmlContent);
            } else if (textContent) {
                document.execCommand('insertText', false, textContent);
            }

            // Append images after regular paste too
            await appendImages(editor, imageBlobs, htmlImageUrls);
        }

    } catch (error) {
        console.error("[Smart Paste] Error:", error);
        // Fallback to normal paste
        document.execCommand('paste');
    }
}

/**
 * Appends images to the editor content
 * @param {HTMLElement} editor - The ProseMirror editor element
 * @param {Blob[]} imageBlobs - Array of image blobs from clipboard
 * @param {string[]} htmlImageUrls - Array of image URLs extracted from HTML
 */
async function appendImages(editor, imageBlobs, htmlImageUrls) {
    // Skip if no images to append
    if ((!imageBlobs || imageBlobs.length === 0) && (!htmlImageUrls || htmlImageUrls.length === 0)) {
        return;
    }

    console.log("[Smart Paste] Appending images:", imageBlobs.length, "blobs,", htmlImageUrls.length, "URLs");

    // Add a line break before images
    document.execCommand('insertHTML', false, '<p></p>');

    // First, try to insert blob images (direct clipboard images)
    for (const blob of imageBlobs) {
        try {
            // Convert blob to base64 data URL
            const dataUrl = await blobToDataUrl(blob);
            console.log("[Smart Paste] Inserting blob image, size:", Math.round(dataUrl.length / 1024), "KB");
            document.execCommand('insertHTML', false, `<img src="${dataUrl}" style="max-width: 100%;">`);
            document.execCommand('insertHTML', false, '<p></p>');
        } catch (err) {
            console.error("[Smart Paste] Error inserting blob image:", err);
        }
    }

    // Then, try to insert images from URLs (from HTML content)
    for (const url of htmlImageUrls) {
        try {
            // Try to fetch image via background script to bypass CORS
            console.log("[Smart Paste] Fetching image:", url);

            let response;
            try {
                response = await chrome.runtime.sendMessage({
                    action: 'fetch-image',
                    url: url
                });
            } catch (msgErr) {
                console.error("[Smart Paste] Message send failed:", msgErr);
                continue;
            }

            if (response && response.success && response.base64) {
                console.log("[Smart Paste] Image fetched successfully, size:", Math.round(response.base64.length / 1024), "KB");

                // Insert the image
                const imgHtml = `<figure><img src="${response.base64}" style="max-width: 100%;"></figure>`;
                document.execCommand('insertHTML', false, imgHtml);
                document.execCommand('insertHTML', false, '<p></p>');
                console.log("[Smart Paste] Image inserted");
            } else {
                console.log("[Smart Paste] Image fetch failed:", response?.error || 'No response');
            }
        } catch (err) {
            console.error("[Smart Paste] Error inserting URL image:", err);
        }
    }

    // Trigger input event
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

/**
 * Converts a Blob to a data URL
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} The data URL
 */
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ============================================================================
// Header Toggle - F4 to toggle between Header 4 and Normal text
// ============================================================================

function setupHeaderToggle(editor) {
    console.log("[Header Toggle] Setting up F4 listener");

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F4') {
            e.preventDefault();
            e.stopPropagation();
            console.log("[Header Toggle] F4 pressed");
            toggleHeader4();
        }
    }, true);
}

async function toggleHeader4() {
    try {
        // Find the Style dropdown button in the Substack editor toolbar
        // It's labeled "Style…" or shows current style like "Heading 1", "Paragraph", etc.
        const toolbarButtons = document.querySelectorAll('button');
        let styleButton = null;

        // First look for a button showing "Style" or current style name
        for (const btn of toolbarButtons) {
            const text = btn.textContent?.trim();
            const textLower = text?.toLowerCase();

            // Match "Style" button or current style indicators
            if (text === 'Style' || text === 'Style…' || text === 'Style...' ||
                textLower === 'paragraph' || textLower === 'body' || textLower === 'normal' ||
                textLower?.startsWith('heading ') || textLower === 'subheading') {
                styleButton = btn;
                console.log("[Header Toggle] Found style button:", text);
                break;
            }
        }

        if (!styleButton) {
            // Try finding by aria-label or other attributes
            styleButton = document.querySelector('[aria-label*="style" i]') ||
                          document.querySelector('[aria-label*="heading" i]') ||
                          document.querySelector('[data-testid="style-dropdown"]');
        }

        if (!styleButton) {
            console.log("[Header Toggle] Could not find style dropdown button");
            console.log("[Header Toggle] Available buttons:",
                Array.from(toolbarButtons).map(b => b.textContent?.trim()).filter(t => t).slice(0, 20));
            return;
        }

        const currentStyle = styleButton.textContent?.trim().toLowerCase();
        console.log("[Header Toggle] Current style:", currentStyle);

        // Click to open the dropdown
        styleButton.click();

        // Wait for dropdown to appear
        await new Promise(resolve => setTimeout(resolve, 150));

        // Determine target: toggle between Heading 4 and Paragraph/Body/Normal
        const isHeading4 = currentStyle?.includes('heading 4');
        // Try multiple possible names for normal text
        const normalTextOptions = ['paragraph', 'body', 'normal', 'body text'];
        const targetStyles = isHeading4 ? normalTextOptions : ['heading 4'];

        console.log("[Header Toggle] Looking for:", targetStyles);

        // Find the menu/dropdown options - search broadly
        let targetOption = null;
        const allElements = document.querySelectorAll('button, [role="menuitem"], [role="option"], [role="listbox"] *, div, span, li');

        for (const item of allElements) {
            const itemText = item.textContent?.trim().toLowerCase();
            // Check for exact match or close match
            for (const target of targetStyles) {
                if (itemText === target ||
                    (target === 'heading 4' && itemText === 'heading 4') ||
                    (normalTextOptions.includes(target) && normalTextOptions.includes(itemText))) {
                    // Make sure it's clickable and visible
                    const rect = item.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        targetOption = item;
                        console.log("[Header Toggle] Found option:", itemText);
                        break;
                    }
                }
            }
            if (targetOption) break;
        }

        if (targetOption) {
            console.log("[Header Toggle] Clicking:", targetOption.textContent?.trim());
            targetOption.click();
        } else {
            console.log("[Header Toggle] Could not find target option");
            // Log what options ARE visible for debugging
            const visibleOptions = Array.from(allElements)
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    const text = el.textContent?.trim();
                    return rect.width > 0 && rect.height > 0 && text &&
                           (text.toLowerCase().includes('heading') ||
                            text.toLowerCase().includes('paragraph') ||
                            text.toLowerCase().includes('body'));
                })
                .map(el => el.textContent?.trim())
                .slice(0, 10);
            console.log("[Header Toggle] Visible heading/paragraph options:", visibleOptions);

            // Close dropdown by pressing Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }

    } catch (error) {
        console.error("[Header Toggle] Error:", error);
    }
}

// ============================================================================
// Global Shortcuts - Alt+S to copy page URL
// ============================================================================

document.addEventListener('keydown', (e) => {
    // Alt+S - copy page URL
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const url = window.location.href.split('?')[0]; // Clean URL without query params
        navigator.clipboard.writeText(url).then(() => {
            console.log("[Substack Shortcuts] Alt+S - copied URL:", url);
            showCopyNotification("URL copied!");
        }).catch(err => {
            console.error("[Substack Shortcuts] Failed to copy URL:", err);
            showCopyNotification("Failed to copy URL", true);
        });
    }
}, true);

function showCopyNotification(message, isError = false) {
    const existing = document.getElementById('substack-shortcut-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'substack-shortcut-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${isError ? '#f44336' : '#4caf50'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

// Initialize when DOM is ready (but only once)
if (!window.__substackEditorInitialized) {
    window.__substackEditorInitialized = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBlockquoteOverride);
    } else {
        initBlockquoteOverride();
    }

    console.log("Content script loaded"); // todo remove
} else {
    console.log("Content script already initialized, skipping"); // todo remove
}