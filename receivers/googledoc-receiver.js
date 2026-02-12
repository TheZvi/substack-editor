// receivers/googledoc-receiver.js
// Shows notification to paste content into Google Docs
// Also handles browser automation for adding comments
// Note: Programmatic paste is blocked by browser security - user must press Ctrl+V

console.log("[Google Doc Receiver] Loading...");

// Listen for messages from popup/background to add comments
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'add-comment-via-browser') {
        console.log('[Google Doc Receiver] Received add-comment request:', message);
        addCommentViaBrowser(message.searchText, message.commentText)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }
});

/**
 * Simulate a real mouse click with coordinates
 */
function simulateRealClick(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    console.log('[Google Doc Receiver] Simulating click at', x, y, 'on', element.className || element.id);

    const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons: 1
    };

    // Full mouse event sequence
    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));

    // Also try pointer events
    element.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
    element.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));

    return true;
}

// Note: Keyboard shortcuts (Ctrl+Alt+M) don't work reliably for adding comments in Google Docs
// because the Find dialog captures keyboard input. We use the sidebar button approach instead.

/**
 * Simulate triple-click at specific coordinates to select a paragraph
 * This is the key discovery: triple-click creates REAL selection (not just highlight)
 */
function simulateTripleClick(x, y) {
    const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons: 1,
        detail: 1 // Click count
    };

    // Get the element at the coordinates
    const target = document.elementFromPoint(x, y) || document.body;
    console.log('[Google Doc Receiver] Triple-clicking at', x, y, 'on element:', target.className || target.tagName);

    // First click
    target.dispatchEvent(new MouseEvent('mousedown', { ...eventOptions, detail: 1 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, detail: 1 }));
    target.dispatchEvent(new MouseEvent('click', { ...eventOptions, detail: 1 }));

    // Second click (double-click)
    target.dispatchEvent(new MouseEvent('mousedown', { ...eventOptions, detail: 2 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, detail: 2 }));
    target.dispatchEvent(new MouseEvent('click', { ...eventOptions, detail: 2 }));
    target.dispatchEvent(new MouseEvent('dblclick', { ...eventOptions, detail: 2 }));

    // Third click (triple-click - selects paragraph)
    target.dispatchEvent(new MouseEvent('mousedown', { ...eventOptions, detail: 3 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, detail: 3 }));
    target.dispatchEvent(new MouseEvent('click', { ...eventOptions, detail: 3 }));
}

/**
 * Find the sidebar "Add comment" button
 * This button appears when text is selected in Google Docs
 */
function findAddCommentButton() {
    // Look for the comment button in the sidebar/margins
    // It typically has aria-label containing "Add comment" or similar
    const selectors = [
        '[aria-label*="Add comment"]',
        '[aria-label*="add comment"]',
        '[data-tooltip*="Add comment"]',
        '[data-tooltip*="Comment"]',
        '.docos-anchoreddocoview-add-button',
        '.docs-comment-button'
    ];

    for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn) {
            console.log('[Google Doc Receiver] Found comment button with selector:', selector);
            return btn;
        }
    }

    // Also search by icon/content - the button often shows a comment icon
    const allButtons = document.querySelectorAll('[role="button"], button');
    for (const btn of allButtons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const tooltip = btn.getAttribute('data-tooltip') || '';
        if (ariaLabel.toLowerCase().includes('comment') || tooltip.toLowerCase().includes('comment')) {
            // Make sure it's in the sidebar area (right side of page)
            const rect = btn.getBoundingClientRect();
            if (rect.left > window.innerWidth * 0.6) { // Right 40% of screen
                console.log('[Google Doc Receiver] Found sidebar comment button');
                return btn;
            }
        }
    }

    return null;
}

/**
 * Add a comment by automating the Google Docs UI
 *
 * VERIFIED WORKING APPROACH (discovered through MCP testing):
 * 1. Use Find to scroll to and highlight the target text
 * 2. Triple-click to select the paragraph (creates REAL selection, not just highlight)
 * 3. Click the sidebar "Add comment" button
 * 4. Type comment text
 * 5. Click "Comment" button to submit
 *
 * Key insight: Find & Replace only HIGHLIGHTS text, it doesn't SELECT it.
 * Comments can only anchor to SELECTIONS, not highlights.
 * Triple-click is the reliable way to create a selection.
 */
async function addCommentViaBrowser(searchText, commentText) {
    console.log('[Google Doc Receiver] Adding anchored comment for:', searchText);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    try {
        // Step 1: Open Find dialog via Edit menu (keyboard shortcuts don't work from content scripts)
        console.log('[Google Doc Receiver] Step 1: Opening Find dialog via menu...');

        const editMenu = document.querySelector('#docs-edit-menu');
        if (!editMenu) {
            console.error('[Google Doc Receiver] Could not find Edit menu');
            return { success: false, error: 'Could not find Edit menu' };
        }

        simulateRealClick(editMenu);
        await sleep(400);

        // Find "Find and replace" menu item
        let findMenuItem = null;
        const menuItems = document.querySelectorAll('.goog-menuitem, [role="menuitem"]');
        for (const item of menuItems) {
            const text = item.textContent || '';
            if (text.includes('Find and replace') || text.includes('Find & replace')) {
                findMenuItem = item;
                break;
            }
        }

        if (!findMenuItem) {
            // Try escape to close menu and report error
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            console.error('[Google Doc Receiver] Could not find "Find and replace" menu item');
            return { success: false, error: 'Could not find Find and replace menu item' };
        }

        simulateRealClick(findMenuItem);
        await sleep(500);

        // Step 2: Type search text to find and scroll to it
        console.log('[Google Doc Receiver] Step 2: Searching for text...');

        // Wait a bit more for dialog to fully open
        await sleep(300);

        const findInput = document.querySelector('.docs-findinput-input') ||
                         document.querySelector('input[aria-label="Find"]') ||
                         document.querySelector('input[type="text"][aria-label*="ind"]') ||
                         document.querySelector('.docs-findandreplacedialog input');

        if (!findInput) {
            console.error('[Google Doc Receiver] Could not find search input');
            // List all inputs for debugging
            const allInputs = document.querySelectorAll('input');
            console.log('[Google Doc Receiver] Available inputs:', Array.from(allInputs).map(i => ({
                class: i.className,
                aria: i.getAttribute('aria-label'),
                type: i.type
            })));
            return { success: false, error: 'Could not find search input after opening Find dialog' };
        }

        findInput.focus();
        findInput.value = searchText;
        findInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);

        // Click the "Next" button to find the text (more reliable than Enter key)
        // This should scroll to and highlight the match
        let foundMatch = false;
        const nextButton = document.querySelector('.docs-findandreplacedialog [data-tooltip="Next"]') ||
                          document.querySelector('.docs-findandreplacedialog button[aria-label="Next"]');

        if (nextButton) {
            console.log('[Google Doc Receiver] Clicking Next button to find text');
            simulateRealClick(nextButton);
            foundMatch = true;
        } else {
            // Fallback to Enter key
            console.log('[Google Doc Receiver] No Next button found, using Enter key');
            findInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        await sleep(600);

        // Log the current scroll position to help debug
        const scrollContainer = document.querySelector('.kix-appview-editor');
        console.log('[Google Doc Receiver] Scroll position after Find:',
            scrollContainer ? scrollContainer.scrollTop : 'unknown');

        // Step 3: Close Find dialog - try multiple methods since synthetic events are unreliable
        console.log('[Google Doc Receiver] Step 3: Closing Find dialog...');

        const dialog = document.querySelector('.docs-findandreplacedialog');

        // Method 1: Try to find and click the actual X/close button
        const closeSelectors = [
            '.docs-findandreplacedialog .modal-dialog-title-close',
            '.docs-findandreplacedialog [aria-label="Close"]',
            '.docs-findandreplacedialog .goog-flat-button',
            '.modal-dialog-title-close'
        ];

        let closed = false;
        for (const selector of closeSelectors) {
            const closeBtn = document.querySelector(selector);
            if (closeBtn) {
                console.log('[Google Doc Receiver] Trying close button:', selector);
                closeBtn.click(); // Try native click
                simulateRealClick(closeBtn);
                await sleep(200);
                if (!document.querySelector('.docs-findandreplacedialog[style*="display: block"]')) {
                    closed = true;
                    break;
                }
            }
        }

        // Method 2: Try to hide the dialog directly via DOM manipulation
        if (!closed && dialog) {
            console.log('[Google Doc Receiver] Trying to hide dialog via DOM');
            dialog.style.display = 'none';
            dialog.style.visibility = 'hidden';
            // Also try removing it from tab order
            dialog.setAttribute('aria-hidden', 'true');
        }

        // Method 3: Click on document title to shift focus away from dialog
        const docTitle = document.querySelector('.docs-title-input') ||
                        document.querySelector('[aria-label="Document title"]') ||
                        document.querySelector('.docs-title');
        if (docTitle) {
            console.log('[Google Doc Receiver] Clicking document title to shift focus');
            simulateRealClick(docTitle);
            await sleep(200);
        }

        await sleep(400);

        // Log final dialog state
        const dialogAfter = document.querySelector('.docs-findandreplacedialog');
        console.log('[Google Doc Receiver] Dialog after close attempts:',
            dialogAfter ? `visible=${dialogAfter.offsetParent !== null}, display=${dialogAfter.style.display}` : 'not found');

        // Step 4: Select the found text using KEYBOARD SELECTION
        // Instead of trying to click at unknown coordinates, use keyboard shortcuts
        // After Find, focus should be near the found text
        console.log('[Google Doc Receiver] Step 4: Selecting text via keyboard...');

        // First, click somewhere in the document to ensure it has focus (not the dialog)
        const pagesContainer = document.querySelector('.kix-paginateddocumentplugin') ||
                               document.querySelector('.kix-page-paginated') ||
                               document.querySelector('.kix-page');

        if (pagesContainer) {
            const rect = pagesContainer.getBoundingClientRect();
            const clickX = rect.left + rect.width * 0.35;
            const clickY = window.innerHeight / 2;
            console.log('[Google Doc Receiver] Clicking document to focus:', clickX, clickY);

            // Single click to position cursor in document
            const target = document.elementFromPoint(clickX, clickY) || document.body;
            const clickOpts = {
                bubbles: true, cancelable: true, view: window,
                clientX: clickX, clientY: clickY, button: 0, buttons: 1
            };
            target.dispatchEvent(new MouseEvent('mousedown', clickOpts));
            target.dispatchEvent(new MouseEvent('mouseup', clickOpts));
            target.dispatchEvent(new MouseEvent('click', clickOpts));
            await sleep(200);
        }

        // Now try keyboard selection - select current line/paragraph
        // Method 1: Ctrl+A in Google Docs with text cursor selects the paragraph (not all)
        // Actually, let's try Home then Shift+End to select current line
        const editorIframe = document.querySelector('iframe.docs-texteventtarget-iframe');
        let keyTarget = document.body;
        if (editorIframe && editorIframe.contentDocument) {
            keyTarget = editorIframe.contentDocument.body;
        }

        console.log('[Google Doc Receiver] Sending keyboard selection commands...');

        // Try Ctrl+Shift+Down to select paragraph, or Home + Shift+End for line
        // In Google Docs: Ctrl+Shift+E selects current paragraph? Let's try multiple approaches

        // Approach A: Triple-click simulation at viewport center (keep this as backup)
        const clickY = window.innerHeight / 2;
        const clickX = pagesContainer ?
            pagesContainer.getBoundingClientRect().left + pagesContainer.getBoundingClientRect().width * 0.35 :
            window.innerWidth * 0.35;

        console.log('[Google Doc Receiver] Triple-clicking at:', clickX, clickY);
        simulateTripleClick(clickX, clickY);
        await sleep(500);

        // Step 5: Look for and click the sidebar "Add comment" button
        console.log('[Google Doc Receiver] Step 5: Looking for Add comment button...');

        let commentButton = findAddCommentButton();

        // If not found, try clicking in the right margin area where the button typically appears
        if (!commentButton) {
            console.log('[Google Doc Receiver] Comment button not found directly, trying right margin click...');
            // The "Add comment" button typically appears in the right margin when text is selected
            // Try clicking at approximately x=757 (right margin) and the same y as our text
            const marginX = Math.min(window.innerWidth - 100, 757);
            simulateRealClick(document.elementFromPoint(marginX, clickY));
            await sleep(300);

            // Check again for the comment button
            commentButton = findAddCommentButton();
        }

        if (!commentButton) {
            console.error('[Google Doc Receiver] Could not find Add comment button');
            return { success: false, error: 'Could not find Add comment button - is text selected?' };
        }

        console.log('[Google Doc Receiver] Clicking Add comment button...');
        simulateRealClick(commentButton);
        await sleep(500);

        // Step 6: Find and fill the comment input
        console.log('[Google Doc Receiver] Step 6: Finding comment input...');
        const commentInput = document.querySelector('.docos-input-textarea') ||
                            document.querySelector('[contenteditable="true"][aria-label*="omment"]') ||
                            document.querySelector('.docos-replyview-input') ||
                            document.querySelector('[aria-label*="Add a comment"]');

        if (!commentInput) {
            console.error('[Google Doc Receiver] Could not find comment input');
            return { success: false, error: 'Could not find comment input field' };
        }

        console.log('[Google Doc Receiver] Typing comment...');
        commentInput.focus();

        // For contenteditable elements
        if (commentInput.isContentEditable) {
            commentInput.textContent = commentText;
            commentInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            commentInput.value = commentText;
            commentInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await sleep(300);

        // Step 7: Click the "Comment" submit button
        console.log('[Google Doc Receiver] Step 7: Submitting comment...');
        const submitButton = document.querySelector('.docos-input-buttons-post') ||
                            document.querySelector('[data-tooltip="Comment"]') ||
                            document.querySelector('[aria-label="Comment"]');

        if (submitButton) {
            simulateRealClick(submitButton);
            await sleep(500);
        } else {
            // Try pressing Enter/Ctrl+Enter to submit
            commentInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                ctrlKey: true,
                bubbles: true
            }));
            await sleep(300);
        }

        console.log('[Google Doc Receiver] Comment added successfully!');
        return { success: true };

    } catch (error) {
        console.error('[Google Doc Receiver] Error:', error);
        return { success: false, error: error.message };
    }
}

(async function() {
    try {
        // Check if we have content waiting to be pasted
        const data = await chrome.storage.local.get(['googledoc-pending-paste', 'googledoc-pending-title']);

        if (!data['googledoc-pending-paste']) {
            console.log("[Google Doc Receiver] No pending content to paste");
            return;
        }

        console.log("[Google Doc Receiver] Found pending content");
        const title = data['googledoc-pending-title'] || '';

        // Clear the pending flags
        await chrome.storage.local.remove(['googledoc-pending-paste', 'googledoc-pending-title']);

        // Wait a moment for the page to stabilize
        await new Promise(r => setTimeout(r, 2000));

        // Show notification prompting user to paste, including title
        const titlePart = title ? `Set title to "${title}" then ` : '';
        showNotification(`${titlePart}Press Ctrl+V to paste content`, false, 15000);

    } catch (error) {
        console.error("[Google Doc Receiver] Error:", error);
    }
})();

function showNotification(message, isError = false, duration = 3000) {
    const existing = document.getElementById('googledoc-receiver-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'googledoc-receiver-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
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
    setTimeout(() => notification.remove(), duration);
}
