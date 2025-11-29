// VERSION 1.5.0 - Clean rebuild of header auto-formatting
const TWITTER_RECEIVER_VERSION = "1.5.0";
console.log(`%c[Twitter Receiver v${TWITTER_RECEIVER_VERSION}] Loading...`, 'color: #1DA1F2; font-weight: bold');

// Guard against multiple insertions
let insertionInProgress = false;
let insertionCompleted = false;

// Store header info for post-paste fixing
let pendingHeaderFixes = [];

// Configuration
const CONFIG = {
    maxRetries: 10,
    retryDelay: 500,
    pencilClickDelay: 1500
};

// ============================================================================
// Pencil Icon Click Strategies
// ============================================================================

const pencilClickStrategies = [
    // Strategy 1: Look for button with aria-label
    async function findByAriaLabel() {
        console.log("Strategy 1: Looking for pencil by aria-label");
        const selectors = [
            'button[aria-label*="New"]',
            'button[aria-label*="new"]',
            'button[aria-label*="Create"]',
            'button[aria-label*="create"]',
            'button[aria-label*="Compose"]',
            'button[aria-label*="compose"]',
            'button[aria-label*="Write"]',
            'button[aria-label*="write"]',
            '[role="button"][aria-label*="New"]',
            '[role="button"][aria-label*="Create"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                console.log("Found by aria-label:", selector);
                return el;
            }
        }
        return null;
    },

    // Strategy 2: Look for button with data-testid
    async function findByTestId() {
        console.log("Strategy 2: Looking for pencil by data-testid");
        const selectors = [
            '[data-testid*="new"]',
            '[data-testid*="create"]',
            '[data-testid*="compose"]',
            '[data-testid*="write"]',
            '[data-testid*="SideNav_NewArticle"]',
            '[data-testid="FloatingActionButton"]',
            '[data-testid="FAB"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                console.log("Found by data-testid:", selector);
                return el;
            }
        }
        return null;
    },

    // Strategy 3: Look for SVG pencil icon within buttons
    async function findBySvgPath() {
        console.log("Strategy 3: Looking for pencil SVG icon");
        const buttons = document.querySelectorAll('button, [role="button"], a[href*="compose"]');
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (svg) {
                const paths = svg.querySelectorAll('path');
                for (const path of paths) {
                    const d = path.getAttribute('d') || '';
                    if (d.includes('M') && (d.includes('l') || d.includes('L'))) {
                        if (d.length > 20 && d.length < 500) {
                            console.log("Found potential pencil icon button");
                            return btn;
                        }
                    }
                }
            }
        }
        return null;
    },

    // Strategy 4: Look for floating action button (FAB)
    async function findFAB() {
        console.log("Strategy 4: Looking for floating action button");
        const selectors = [
            '[class*="FloatingAction"]',
            '[class*="floating-action"]',
            '[class*="fab"]',
            '[class*="FAB"]',
            'button[class*="compose"]',
            'button[class*="Compose"]',
            'a[class*="compose"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                console.log("Found FAB:", selector);
                return el;
            }
        }
        const allButtons = document.querySelectorAll('button, [role="button"]');
        for (const btn of allButtons) {
            const style = window.getComputedStyle(btn);
            if (style.position === 'fixed' &&
                parseInt(style.right) < 100 &&
                parseInt(style.bottom) < 100) {
                console.log("Found fixed position button in corner");
                return btn;
            }
        }
        return null;
    },

    // Strategy 5: Look by class patterns common in X/Twitter
    async function findByClassPattern() {
        console.log("Strategy 5: Looking by class patterns");
        const buttons = document.querySelectorAll('button, [role="button"], div[role="button"]');
        for (const btn of buttons) {
            const className = btn.className || '';
            if (className.includes('css-') && btn.querySelector('svg')) {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 40 && rect.width < 80 &&
                    Math.abs(rect.width - rect.height) < 10) {
                    console.log("Found potential circular icon button");
                    return btn;
                }
            }
        }
        return null;
    },

    // Strategy 6: Look for any clickable element with "new" or "create" text
    async function findByText() {
        console.log("Strategy 6: Looking by text content");
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        let node;
        while (node = walker.nextNode()) {
            const text = node.nodeValue.toLowerCase().trim();
            if (text === 'new' || text === 'create' || text === 'new article') {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'BUTTON' ||
                    parent.getAttribute('role') === 'button' ||
                    parent.closest('button'))) {
                    console.log("Found button with text:", text);
                    return parent.closest('button') || parent;
                }
            }
        }
        return null;
    }
];

/**
 * Check if the editor has appeared after clicking
 */
async function checkEditorAppeared() {
    const editorSelectors = [
        '[contenteditable="true"]',
        'textarea',
        '[data-testid*="editor"]',
        '[data-testid*="Editor"]',
        '[role="textbox"]',
        '[class*="editor"]',
        '[class*="Editor"]',
        'div[class*="DraftEditor"]'
    ];

    for (const selector of editorSelectors) {
        const editors = document.querySelectorAll(selector);
        for (const editor of editors) {
            const rect = editor.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50) {
                console.log("Found visible editor:", selector);
                return true;
            }
        }
    }
    return false;
}

/**
 * Try all strategies to find and click the pencil icon
 */
async function clickPencilIcon() {
    console.log("Attempting to click pencil icon...");

    for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
        console.log(`Pencil click attempt ${attempt + 1}/${CONFIG.maxRetries}`);

        for (const strategy of pencilClickStrategies) {
            try {
                const element = await strategy();
                if (element) {
                    console.log("Found pencil element, clicking...");
                    element.focus();
                    await sleep(100);
                    element.click();
                    await sleep(300);

                    if (await checkEditorAppeared()) {
                        console.log("Editor appeared after click!");
                        return true;
                    }

                    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await sleep(300);

                    if (await checkEditorAppeared()) {
                        console.log("Editor appeared after mouse events!");
                        return true;
                    }
                }
            } catch (e) {
                console.log("Strategy error:", e.message);
            }
        }
        await sleep(CONFIG.retryDelay);
    }

    console.error("Failed to click pencil icon after all attempts");
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPERIMENTAL: Title Insertion Strategies
// ============================================================================

/**
 * Explore the DOM to find potential title fields and log detailed info
 */
function exploreTitleFields() {
    console.log("=== EXPLORING DOM FOR TITLE FIELDS ===");

    const candidates = [];

    // Look for inputs and textareas
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach((el, i) => {
        const info = {
            type: 'input/textarea',
            index: i,
            tagName: el.tagName,
            inputType: el.type,
            placeholder: el.placeholder,
            ariaLabel: el.getAttribute('aria-label'),
            dataTestId: el.getAttribute('data-testid'),
            className: el.className?.substring(0, 100),
            id: el.id,
            name: el.name,
            rect: el.getBoundingClientRect(),
            isVisible: el.offsetParent !== null,
            value: el.value?.substring(0, 50)
        };
        console.log(`Input/Textarea ${i}:`, info);
        if (info.isVisible && info.rect.width > 100) {
            candidates.push({ el, info, score: 0 });
        }
    });

    // Look for contenteditable elements
    const editables = document.querySelectorAll('[contenteditable="true"]');
    editables.forEach((el, i) => {
        const info = {
            type: 'contenteditable',
            index: i,
            tagName: el.tagName,
            role: el.getAttribute('role'),
            ariaLabel: el.getAttribute('aria-label'),
            dataTestId: el.getAttribute('data-testid'),
            className: el.className?.substring(0, 100),
            rect: el.getBoundingClientRect(),
            isVisible: el.offsetParent !== null,
            textContent: el.textContent?.substring(0, 50)
        };
        console.log(`Contenteditable ${i}:`, info);
        if (info.isVisible && info.rect.width > 100) {
            candidates.push({ el, info, score: 0 });
        }
    });

    // Look for elements with role="textbox"
    const textboxes = document.querySelectorAll('[role="textbox"]');
    textboxes.forEach((el, i) => {
        if (!el.getAttribute('contenteditable')) {
            const info = {
                type: 'role-textbox',
                index: i,
                tagName: el.tagName,
                ariaLabel: el.getAttribute('aria-label'),
                dataTestId: el.getAttribute('data-testid'),
                className: el.className?.substring(0, 100),
                rect: el.getBoundingClientRect(),
                isVisible: el.offsetParent !== null
            };
            console.log(`Role textbox ${i}:`, info);
            if (info.isVisible && info.rect.width > 100) {
                candidates.push({ el, info, score: 0 });
            }
        }
    });

    // Score candidates - higher score = more likely to be title
    candidates.forEach(c => {
        const { el, info } = c;
        // Title fields are usually near the top
        if (info.rect.top < 300) c.score += 10;
        if (info.rect.top < 200) c.score += 5;

        // Title fields are usually wider
        if (info.rect.width > 400) c.score += 5;

        // Check for title-related attributes
        const allText = (info.placeholder || '') + (info.ariaLabel || '') + (info.dataTestId || '') + (info.className || '');
        if (/title/i.test(allText)) c.score += 20;
        if (/headline/i.test(allText)) c.score += 15;
        if (/heading/i.test(allText)) c.score += 10;

        // Inputs with type="text" are more likely title fields than textareas
        if (el.tagName === 'INPUT' && el.type === 'text') c.score += 5;

        // First editable element is often the title
        if (info.index === 0) c.score += 5;
    });

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    console.log("=== TITLE FIELD CANDIDATES (sorted by score) ===");
    candidates.forEach((c, i) => {
        console.log(`Candidate ${i + 1} (score: ${c.score}):`, c.info);
    });

    return candidates;
}

/**
 * Insert title into the first valid input field found
 * Simple approach: just use .value assignment which works
 */
async function experimentalTitleInsertion(title) {
    console.log(`=== TITLE INSERTION v${TWITTER_RECEIVER_VERSION} ===`);
    console.log("Title to insert:", title);

    // Find candidates
    const candidates = exploreTitleFields();

    if (candidates.length === 0) {
        console.log("No title field candidates found!");
        return { success: false, reason: "No candidates found" };
    }

    // Try the top candidate only
    const { el, score } = candidates[0];
    console.log(`Trying top candidate (score: ${score})`);

    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';

    if (!isInput) {
        console.log("Top candidate is not an input/textarea, skipping title insertion");
        return { success: false, reason: "No input field found" };
    }

    try {
        // Simple and reliable: focus, select all, clear, set value
        el.focus();
        el.select();
        el.value = '';
        el.value = title;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Verify
        if (el.value === title) {
            console.log("=== TITLE INSERTION SUCCESSFUL ===");

            // Focus the editor body to save user a click
            await sleep(200);
            const editor = findEditorElement();
            if (editor) {
                editor.focus();
                simulateClick(editor);
                console.log("Focused editor body");
            }

            return { success: true, method: 'setValue' };
        } else {
            console.log("Title did not stick, value:", el.value);
            return { success: false, reason: "Value did not persist" };
        }
    } catch (e) {
        console.log("Title insertion error:", e.message);
        return { success: false, reason: e.message };
    }
}

// ============================================================================
// Post-Paste Header Fixing
// ============================================================================

/**
 * Find the main editor element
 */
function findEditorElement() {
    const selectors = [
        '[data-testid*="editor"] [contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 100) {
                return el;
            }
        }
    }
    return null;
}

/**
 * Find a text block by matching content
 */
function findBlockByText(editor, searchText) {
    const blocks = editor.querySelectorAll('.longform-unstyled, [data-block="true"]');
    const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();

    for (const block of blocks) {
        const blockText = block.textContent.trim().replace(/\s+/g, ' ');
        if (blockText === normalizedSearch) {
            return block;
        }
    }
    return null;
}

/**
 * Simulate a realistic mouse click
 */
function simulateClick(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX,
        screenY: centerY,
        button: 0,
        buttons: 1
    };

    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
    element.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
}

/**
 * Click Body dropdown and select Subheading
 */
async function clickBodyDropdownAndSelectSubheading() {
    // Find the Body/Subheading dropdown
    const allElements = document.querySelectorAll('button, [role="button"], div[class*="css-"]');
    let bodyDropdown = null;

    for (const el of allElements) {
        const text = el.textContent?.trim();
        if (text === 'Body' || text === 'Heading' || text === 'Subheading') {
            const rect = el.getBoundingClientRect();
            if (rect.top < 150) {
                console.log(`  Found dropdown: "${text}"`);
                bodyDropdown = el;
                break;
            }
        }
    }

    if (!bodyDropdown) {
        console.log("  Dropdown not found");
        return false;
    }

    // Click to open dropdown
    console.log("  Opening dropdown...");
    simulateClick(bodyDropdown);
    await sleep(300);

    // Find and click Subheading
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
        if (div.textContent?.trim() === 'Subheading' && div.offsetParent !== null) {
            const rect = div.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 20) {
                console.log("  Clicking Subheading...");
                simulateClick(div);
                await sleep(100);
                return true;
            }
        }
    }

    console.log("  Subheading option not found");
    return false;
}

/**
 * Fix headers after paste, then fix newlines
 */
async function fixHeadersAfterPaste() {
    console.log("%c[Header Fix] Starting...", 'color: #1DA1F2; font-weight: bold');

    const editor = findEditorElement();
    if (!editor) {
        console.log("Editor not found");
        return;
    }

    console.log(`Headers to fix: ${pendingHeaderFixes.length}`);

    let fixed = 0;
    for (const headerInfo of pendingHeaderFixes) {
        console.log(`Looking for: "${headerInfo.text.substring(0, 40)}..."`);

        const block = findBlockByText(editor, headerInfo.text);
        if (!block) {
            console.log("  Not found");
            continue;
        }

        // Select the block
        const textSpan = block.querySelector('[data-text="true"]') || block;
        const range = document.createRange();
        range.selectNodeContents(textSpan);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);

        await sleep(100);

        // Apply subheading format
        const success = await clickBodyDropdownAndSelectSubheading();
        if (success) {
            fixed++;
            console.log("  Formatted!");
        }

        await sleep(200);
    }

    console.log(`%c[Header Fix] Done: ${fixed}/${pendingHeaderFixes.length}`, 'color: #00aa00; font-weight: bold');

    // Now fix newlines in blockquotes
    console.log("%c[Header Fix] Waiting 1s before fixing newlines...", 'color: #1DA1F2');
    await sleep(1000);

    // Get the original content from storage to find blockquote structure
    const data = await chrome.storage.local.get('extracted_content');
    if (data.extracted_content && data.extracted_content.content) {
        console.log("%c[Newline Fix] Starting...", 'color: #657786; font-weight: bold');
        const result = await window.fixTwitterNewlines(data.extracted_content.content);
        console.log("[Newline Fix] Result:", result);
    } else {
        console.log("[Newline Fix] No extracted content found, skipping");
    }

    // Now handle images if there are any
    const imageData = await chrome.storage.local.get('twitter_pending_images');
    if (imageData.twitter_pending_images?.length > 0) {
        console.log("%c[Image Fix] Starting image insertion flow...", 'color: #E91E63; font-weight: bold');
        await startImageInsertionFlow(imageData.twitter_pending_images);
        // Clear images from storage after starting flow
        await chrome.storage.local.remove('twitter_pending_images');
    } else {
        console.log("[Image Fix] No images to insert");
    }
}

/**
 * Set up paste listener
 */
let pasteListenerActive = false;
let contentPasteProcessed = false;  // Guard against multiple content paste processing
let imageInsertionInProgress = false;  // Guard against processing during image insertion

function setupPasteListener() {
    if (pasteListenerActive) return;

    document.addEventListener('paste', (event) => {
        // Skip if we're in image insertion mode - those pastes are handled separately
        if (imageInsertionInProgress) {
            console.log("[Paste] Skipping - image insertion in progress");
            return;
        }

        // Skip if we already processed the content paste
        if (contentPasteProcessed) {
            console.log("[Paste] Skipping - content already processed");
            return;
        }

        console.log("%c[Paste detected] Will fix headers in 1s...", 'color: #1DA1F2');
        contentPasteProcessed = true;  // Mark as processed
        setTimeout(fixHeadersAfterPaste, 1000);
    }, true);

    pasteListenerActive = true;
    console.log("Paste listener ready");
}

// ============================================================================
// Clipboard Functions
// ============================================================================

/**
 * Copy HTML content to clipboard so user can paste it
 */
async function copyToClipboard(html, plainText) {
    try {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });

        const clipboardItem = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
        });

        await navigator.clipboard.write([clipboardItem]);
        console.log("Content copied to clipboard with HTML formatting");
        return true;
    } catch (error) {
        console.error("Clipboard API failed, trying fallback:", error);

        try {
            await navigator.clipboard.writeText(plainText);
            console.log("Plain text copied to clipboard");
            return true;
        } catch (e2) {
            console.error("Fallback clipboard also failed:", e2);
            return false;
        }
    }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main function - click pencil, then copy content to clipboard and notify user
 */
async function insertTwitterContent() {
    console.log(`%c[Twitter Receiver v${TWITTER_RECEIVER_VERSION}] Starting content preparation`, 'color: #1DA1F2');

    // Guard against duplicate insertions
    if (insertionInProgress) {
        console.log("[Twitter Receiver] Insertion already in progress, skipping");
        return { success: false, error: "Insertion already in progress" };
    }
    if (insertionCompleted) {
        console.log("[Twitter Receiver] Insertion already completed, skipping");
        return { success: true, message: "Already inserted" };
    }
    insertionInProgress = true;

    try {
        const data = await chrome.storage.local.get('twitter_formatted_content');
        if (!data.twitter_formatted_content) {
            console.error("[Twitter Receiver] No content found in storage");
            insertionInProgress = false;
            return { success: false, error: "No content found" };
        }

        const { title, content, plainText, images, headers } = data.twitter_formatted_content;
        console.log("Content loaded:", {
            titleLength: title?.length,
            contentLength: content?.length,
            imageCount: images?.length,
            headerCount: headers?.length
        });

        // Store headers for post-paste fixing
        pendingHeaderFixes = headers || [];
        console.log(`Stored ${pendingHeaderFixes.length} headers for fixing after paste`);

        // Step 1: Try to click the pencil icon to open new article
        console.log("Step 1: Clicking pencil icon");
        const pencilClicked = await clickPencilIcon();
        if (pencilClicked) {
            console.log("Pencil clicked successfully, waiting for editor...");
            await sleep(CONFIG.pencilClickDelay);
        } else {
            console.log("Pencil click failed, editor may already be open");
        }

        // Step 2: EXPERIMENTAL - Try to insert title automatically
        console.log("Step 2: Attempting experimental title insertion");
        const titleResult = await experimentalTitleInsertion(title);
        console.log("Title insertion result:", titleResult);

        // Step 3: Log images for user to add manually
        if (images && images.length > 0) {
            console.log("=== IMAGES TO ADD MANUALLY ===");
            images.forEach((img, i) => {
                console.log(`Image ${i + 1}: ${img.alt || 'No alt text'}`);
                console.log(`  URL: ${img.src}`);
            });
            console.log("==============================");
        }

        // Step 4: Copy content to clipboard
        console.log("Step 4: Copying content to clipboard");
        const copied = await copyToClipboard(content, plainText);

        // Step 5: Set up paste listener for header fixing
        if (copied && pendingHeaderFixes.length > 0) {
            setupPasteListener();
        }

        if (copied) {
            if (titleResult.success) {
                console.log(`%c[Twitter Receiver v${TWITTER_RECEIVER_VERSION}] ✓ Title inserted successfully!`, 'color: #00aa00; font-weight: bold');
            } else {
                console.log("=== TITLE (copy this manually) ===");
                console.log(title);
                console.log("==================================");
            }
            console.log("Content copied to clipboard. Press Ctrl+V (or Cmd+V) in the editor body to paste.");

            // Mark as completed but keep images for later insertion flow
            insertionCompleted = true;
            insertionInProgress = false;

            // Save images separately before clearing main content
            if (images && images.length > 0) {
                const imagesWithData = images.filter(img => img.imageData && img.imageData.base64);
                console.log(`[Twitter Receiver] Images: ${images.length} total, ${imagesWithData.length} with data`);
                if (imagesWithData.length > 0) {
                    await chrome.storage.local.set({ 'twitter_pending_images': imagesWithData });
                    console.log(`[Twitter Receiver] Saved ${imagesWithData.length} images for post-paste insertion`);
                } else {
                    console.log(`[Twitter Receiver] No images have data - skipping image save`);
                }
            }

            await chrome.storage.local.remove('twitter_formatted_content');
            console.log(`%c[Twitter Receiver v${TWITTER_RECEIVER_VERSION}] Storage cleared, insertion complete`, 'color: #1DA1F2');

            return {
                success: true,
                titleInserted: titleResult.success,
                message: titleResult.success
                    ? "Title inserted and content copied to clipboard"
                    : "Content copied to clipboard (title needs manual entry)"
            };
        } else {
            insertionInProgress = false;
            return { success: false, error: "Failed to copy to clipboard" };
        }

    } catch (error) {
        console.error("[Twitter Receiver] Error preparing content:", error);
        insertionInProgress = false;
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Auto-run on Page Load
// ============================================================================

function checkStorageAndInsert() {
    console.log("Checking storage for Twitter content");
    chrome.storage.local.get('twitter_formatted_content', async function(data) {
        if (data.twitter_formatted_content) {
            console.log("Found content to prepare...");
            await sleep(1500);
            await insertTwitterContent();
        } else {
            console.log("No Twitter content found in storage");
        }
    });
}

if (document.readyState === 'complete') {
    checkStorageAndInsert();
} else {
    window.addEventListener('load', checkStorageAndInsert);
}

window.insertTwitterContent = insertTwitterContent;

// ============================================================================
// Newline Fixer (called separately via popup button)
// ============================================================================

/**
 * Find text in editor and position cursor at the end of it
 */
function findTextAndPositionCursorForNewline(editor, searchText) {
    const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    let node;
    while (node = walker.nextNode()) {
        const nodeText = node.textContent;
        const index = nodeText.indexOf(searchText);
        if (index !== -1) {
            const range = document.createRange();
            range.setStart(node, index + searchText.length);
            range.setEnd(node, index + searchText.length);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
    }
    return false;
}

/**
 * Simulate pressing the Enter key
 */
function simulateEnterKey(element) {
    const keyboardEventInit = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
    };
    element.dispatchEvent(new KeyboardEvent('keydown', keyboardEventInit));
    element.dispatchEvent(new KeyboardEvent('keypress', keyboardEventInit));
    element.dispatchEvent(new KeyboardEvent('keyup', keyboardEventInit));
}

/**
 * Fix newlines in blockquotes - called from popup with original HTML content
 */
window.fixTwitterNewlines = async function(htmlContent) {
    console.log("%c[Newline Fixer] Starting...", 'color: #657786; font-weight: bold');

    const editor = findEditorElement();
    if (!editor) {
        console.log("Editor not found");
        return { success: false, error: "Editor not found" };
    }

    // Parse content and find line break markers
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const markers = [];
    const blockquotes = tempDiv.querySelectorAll('blockquote');

    blockquotes.forEach((bq, bqIndex) => {
        const paragraphs = bq.querySelectorAll('p');
        console.log(`[Newline Fixer] Blockquote ${bqIndex + 1} has ${paragraphs.length} paragraphs`);

        paragraphs.forEach((p, pIndex) => {
            if (pIndex < paragraphs.length - 1) {
                const currentText = p.textContent.trim();
                const nextText = paragraphs[pIndex + 1].textContent.trim();
                if (currentText && nextText) {
                    // Get end of current paragraph and start of next
                    // Use last 30 chars of current + first 15 chars of next as junction marker
                    const endPart = currentText.length > 30 ? currentText.slice(-30) : currentText;
                    const startPart = nextText.length > 15 ? nextText.slice(0, 15) : nextText;

                    markers.push({
                        endOfCurrent: endPart,
                        startOfNext: startPart,
                        junction: endPart + startPart  // What it looks like when merged
                    });
                    console.log(`[Newline Fixer] Need break between: "...${endPart}" and "${startPart}..."`);
                }
            }
        });
    });

    if (markers.length === 0) {
        console.log("No line breaks needed");
        return { success: true, count: 0, message: "No line breaks needed" };
    }

    console.log(`Found ${markers.length} line breaks to insert`);

    let inserted = 0;
    for (const marker of markers) {
        console.log(`Looking for junction: "...${marker.endOfCurrent}|${marker.startOfNext}..."`);

        // Strategy 1: Look for the junction (merged text)
        let found = findJunctionAndPositionCursor(editor, marker.endOfCurrent, marker.startOfNext);

        if (!found) {
            // Strategy 2: Fall back to just finding end of current paragraph
            console.log("  Junction not found, trying end-of-paragraph match...");
            found = findTextAndPositionCursorForNewline(editor, marker.endOfCurrent);
        }

        if (!found) {
            console.log("  Text not found, skipping");
            continue;
        }

        console.log("  Found! Pressing Enter...");
        await sleep(100);
        simulateEnterKey(editor);
        inserted++;
        await sleep(200);
    }

    console.log(`%c[Newline Fixer] Done: ${inserted}/${markers.length}`, 'color: #00aa00; font-weight: bold');
    return { success: true, count: inserted };
};

/**
 * Find the junction between two merged paragraphs and position cursor there
 * This handles the case where "text.Next" got turned into a link
 */
function findJunctionAndPositionCursor(editor, endOfCurrent, startOfNext) {
    // Get all text content from editor, flattening any link elements
    const fullText = editor.textContent;

    // Look for the junction point
    const junctionPattern = endOfCurrent + startOfNext;
    const junctionIndex = fullText.indexOf(junctionPattern);

    if (junctionIndex === -1) {
        return false;
    }

    // Found it! Now we need to position cursor right after endOfCurrent
    const targetPosition = junctionIndex + endOfCurrent.length;

    // Walk through text nodes to find the right position
    const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let currentPos = 0;
    let node;
    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (currentPos + nodeLength >= targetPosition) {
            // Target is in this node
            const offsetInNode = targetPosition - currentPos;
            const range = document.createRange();
            range.setStart(node, offsetInNode);
            range.setEnd(node, offsetInNode);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            console.log(`  Found junction at position ${targetPosition}, node offset ${offsetInNode}`);
            return true;
        }
        currentPos += nodeLength;
    }

    return false;
}

// ============================================================================
// Image Insertion Flow
// ============================================================================

let pendingImages = [];
let currentImageIndex = 0;
let imageIndicator = null;
let imagePasteListener = null;

/**
 * Create a visual indicator for image paste prompts
 */
function createImageIndicator() {
    // Remove existing indicator if any
    removeImageIndicator();

    const indicator = document.createElement('div');
    indicator.id = 'twitter-image-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #E91E63, #9C27B0);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 16px;
        font-weight: 600;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        text-align: center;
        min-width: 300px;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; opacity: 0.9; margin-bottom: 8px;';
    title.textContent = 'Image Insertion';

    const message = document.createElement('div');
    message.id = 'twitter-image-message';
    message.style.cssText = 'font-size: 18px;';

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 12px; opacity: 0.8; margin-top: 8px;';
    hint.textContent = 'Cursor positioned. Press Ctrl+V to insert.';

    indicator.appendChild(title);
    indicator.appendChild(message);
    indicator.appendChild(hint);
    document.body.appendChild(indicator);

    imageIndicator = indicator;
    return indicator;
}

/**
 * Update the indicator message
 */
function updateImageIndicator(current, total, altText) {
    const message = document.getElementById('twitter-image-message');
    if (message) {
        const displayAlt = altText ? ` "${altText.substring(0, 30)}${altText.length > 30 ? '...' : ''}"` : '';
        message.textContent = `Image ${current} of ${total}${displayAlt}`;
    }
}

/**
 * Remove the indicator
 */
function removeImageIndicator() {
    if (imageIndicator) {
        imageIndicator.remove();
        imageIndicator = null;
    }
    const existing = document.getElementById('twitter-image-indicator');
    if (existing) existing.remove();
}

/**
 * Show completion message
 */
function showImageComplete(count) {
    removeImageIndicator();

    const indicator = document.createElement('div');
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #4CAF50, #2E7D32);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 18px;
        font-weight: 600;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    indicator.textContent = `✓ All ${count} images inserted!`;
    document.body.appendChild(indicator);

    setTimeout(() => indicator.remove(), 3000);
}

/**
 * Copy pre-fetched image data to clipboard
 * imageData contains base64 string and mimeType from formatter
 * Note: Clipboard API only supports PNG, so we convert if needed
 */
async function copyImageToClipboard(imageData) {
    if (!imageData || !imageData.base64) {
        console.error('[Image Fix] No image data available');
        return false;
    }

    console.log(`[Image Fix] Copying image: ${imageData.mimeType}`);

    try {
        // Convert base64 data URL to blob
        const response = await fetch(imageData.base64);
        let blob = await response.blob();

        console.log(`[Image Fix] Blob created: ${blob.type}, ${blob.size} bytes`);

        // Clipboard API only supports PNG - convert JPEG/other formats
        if (blob.type !== 'image/png') {
            console.log(`[Image Fix] Converting ${blob.type} to PNG for clipboard...`);
            blob = await convertToPng(blob);
            console.log(`[Image Fix] Converted to PNG: ${blob.size} bytes`);
        }

        // Copy to clipboard
        const clipboardItem = new ClipboardItem({
            'image/png': blob
        });

        await navigator.clipboard.write([clipboardItem]);
        console.log(`[Image Fix] Image copied to clipboard`);
        return true;
    } catch (error) {
        console.error('[Image Fix] Failed to copy image:', error);
        return false;
    }
}

/**
 * Convert any image blob to PNG using canvas
 */
async function convertToPng(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(resolve, 'image/png');
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}

/**
 * Position cursor after the marker text
 */
function positionCursorForImage(editor, positionMarker) {
    if (!positionMarker) {
        // No marker - position at end of content
        console.log('[Image Fix] No position marker, positioning at end');
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false); // Collapse to end
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    }

    // Find the marker text and position after it
    const fullText = editor.textContent;
    const markerIndex = fullText.indexOf(positionMarker);

    if (markerIndex === -1) {
        console.log(`[Image Fix] Position marker not found: "${positionMarker.substring(0, 30)}..."`);
        return false;
    }

    const targetPosition = markerIndex + positionMarker.length;

    // Walk through text nodes to find position
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let currentPos = 0;
    let node;

    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (currentPos + nodeLength >= targetPosition) {
            const offsetInNode = targetPosition - currentPos;
            const range = document.createRange();
            range.setStart(node, offsetInNode);
            range.setEnd(node, offsetInNode);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            console.log(`[Image Fix] Cursor positioned after marker`);
            return true;
        }
        currentPos += nodeLength;
    }

    return false;
}

/**
 * Process next image in queue
 */
async function processNextImage() {
    if (currentImageIndex >= pendingImages.length) {
        // All done!
        console.log('%c[Image Fix] All images processed!', 'color: #4CAF50; font-weight: bold');
        showImageComplete(pendingImages.length);
        cleanupImageFlow();
        return;
    }

    const image = pendingImages[currentImageIndex];
    console.log(`[Image Fix] Processing image ${currentImageIndex + 1}/${pendingImages.length}`);

    // Skip images that failed to fetch during formatting
    if (!image.imageData) {
        console.log('[Image Fix] Image has no data (failed during extraction), skipping...');
        currentImageIndex++;
        await processNextImage();
        return;
    }

    // Update indicator
    updateImageIndicator(currentImageIndex + 1, pendingImages.length, image.alt);

    // Find editor and position cursor
    const editor = findEditorElement();
    if (editor) {
        positionCursorForImage(editor, image.positionMarker);
        editor.focus();
    }

    // Copy pre-fetched image to clipboard
    const success = await copyImageToClipboard(image.imageData);
    if (!success) {
        console.log('[Image Fix] Failed to copy image, skipping...');
        currentImageIndex++;
        await processNextImage();
    }
    // Otherwise, wait for user to paste
}

/**
 * Handle paste event during image insertion
 */
function handleImagePaste(event) {
    console.log('[Image Fix] Paste detected during image flow');

    // Small delay to let Twitter process the image
    setTimeout(async () => {
        currentImageIndex++;
        await sleep(2000); // Wait for Twitter's processing (the dark screen)
        await processNextImage();
    }, 500);
}

/**
 * Clean up image insertion flow
 */
function cleanupImageFlow() {
    if (imagePasteListener) {
        document.removeEventListener('paste', imagePasteListener, true);
        imagePasteListener = null;
    }
    pendingImages = [];
    currentImageIndex = 0;
    imageInsertionInProgress = false;  // Reset flag
    removeImageIndicator();
}

/**
 * Start the image insertion flow
 */
async function startImageInsertionFlow(images) {
    if (!images || images.length === 0) {
        console.log('[Image Fix] No images to insert');
        return;
    }

    // Filter out images that don't have data
    const validImages = images.filter(img => img.imageData && img.imageData.base64);
    if (validImages.length === 0) {
        console.log('[Image Fix] No valid images with data to insert');
        return;
    }

    console.log(`%c[Image Fix] Starting flow for ${validImages.length} images (${images.length - validImages.length} skipped - no data)`, 'color: #E91E63; font-weight: bold');

    imageInsertionInProgress = true;  // Set flag to prevent content paste handler
    pendingImages = validImages;
    currentImageIndex = 0;

    // Create indicator
    createImageIndicator();

    // Set up paste listener for image flow
    imagePasteListener = handleImagePaste;
    document.addEventListener('paste', imagePasteListener, true);

    // Wait a moment for UI to settle
    await sleep(500);

    // Start with first image
    await processNextImage();
}

console.log(`%c[Twitter Receiver v${TWITTER_RECEIVER_VERSION}] Ready`, 'color: #1DA1F2; font-weight: bold');
