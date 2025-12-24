// content.js - update existing file

console.log("Content script loading"); // todo remove

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

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
            return;
        }

        const textBeforeCursor = text.substring(0, cursorPos);

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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlockquoteOverride);
} else {
    initBlockquoteOverride();
}

console.log("Content script loaded"); // todo remove