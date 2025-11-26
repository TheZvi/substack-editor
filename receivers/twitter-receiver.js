console.log("Twitter receiver loading");

// Configuration
const CONFIG = {
    maxRetries: 10,
    retryDelay: 500,
    pencilClickDelay: 1000,
    contentInsertDelay: 500
};

// Check storage immediately
chrome.storage.local.get('twitter_formatted_content', function(data) {
    console.log("Initial storage check:", {
        hasData: !!data.twitter_formatted_content,
        dataKeys: data.twitter_formatted_content ? Object.keys(data.twitter_formatted_content) : null,
        titleLength: data.twitter_formatted_content?.title?.length,
        contentLength: data.twitter_formatted_content?.content?.length
    });
});

// ============================================================================
// Pencil Icon Click Strategies - The Tricky Part
// ============================================================================

/**
 * Multiple strategies to find and click the pencil/compose icon
 * This is documented as "remarkably tricky" - using several fallback approaches
 */
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
                // Check for pencil-like paths (common pencil icon patterns)
                const paths = svg.querySelectorAll('path');
                for (const path of paths) {
                    const d = path.getAttribute('d') || '';
                    // Pencil icons often have diagonal lines
                    if (d.includes('M') && (d.includes('l') || d.includes('L'))) {
                        // Check if it looks like a pencil (diagonal strokes)
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
        // Also look for fixed position buttons in bottom-right
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
            // Look for common Twitter UI patterns
            if (className.includes('css-') && btn.querySelector('svg')) {
                // This might be a styled button with icon
                const rect = btn.getBoundingClientRect();
                // FABs are typically circular and in viewport
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

                    // Try multiple click methods
                    element.focus();
                    await sleep(100);

                    // Method 1: Direct click
                    element.click();
                    await sleep(300);

                    // Check if editor appeared
                    if (await checkEditorAppeared()) {
                        console.log("Editor appeared after click!");
                        return true;
                    }

                    // Method 2: Dispatch mouse events
                    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await sleep(300);

                    if (await checkEditorAppeared()) {
                        console.log("Editor appeared after mouse events!");
                        return true;
                    }

                    // Method 3: Keyboard activation
                    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                    await sleep(300);

                    if (await checkEditorAppeared()) {
                        console.log("Editor appeared after keyboard!");
                        return true;
                    }
                }
            } catch (e) {
                console.log("Strategy error:", e.message);
            }
        }

        // Wait before retrying
        await sleep(CONFIG.retryDelay);
    }

    console.error("Failed to click pencil icon after all attempts");
    return false;
}

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
        // Look for a newly visible editor (not just any contenteditable)
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

// ============================================================================
// Content Insertion Functions
// ============================================================================

/**
 * Find and return the title input element
 */
function findTitleInput() {
    const selectors = [
        'input[placeholder*="Title"]',
        'input[placeholder*="title"]',
        'input[aria-label*="Title"]',
        'input[aria-label*="title"]',
        '[data-testid*="title"] input',
        '[data-testid*="Title"] input',
        'input[name="title"]',
        // Fallback: first prominent input
        'input[type="text"]'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            console.log("Found title input:", selector);
            return el;
        }
    }
    return null;
}

/**
 * Find and return the main body editor element
 */
function findBodyEditor() {
    const selectors = [
        '[data-testid*="body"] [contenteditable="true"]',
        '[data-testid*="Body"] [contenteditable="true"]',
        '[data-testid*="editor"] [contenteditable="true"]',
        '[aria-label*="body"] [contenteditable="true"]',
        '[aria-label*="Body"] [contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"]:not([aria-label*="title"])',
        // May need to find the larger contenteditable
    ];

    // First try specific selectors
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            console.log("Found body editor:", selector);
            return el;
        }
    }

    // Fallback: find largest contenteditable
    const editables = document.querySelectorAll('[contenteditable="true"]');
    let largest = null;
    let maxArea = 0;
    for (const el of editables) {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) {
            maxArea = area;
            largest = el;
        }
    }
    if (largest) {
        console.log("Found body editor by size");
        return largest;
    }

    return null;
}

/**
 * Insert title into the title field
 */
async function insertTitle(title) {
    console.log("Inserting title:", title);
    const titleInput = findTitleInput();
    if (!titleInput) {
        console.error("Could not find title input");
        return false;
    }

    titleInput.focus();
    await sleep(100);

    // Clear existing content
    titleInput.value = '';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Insert new title
    titleInput.value = title;
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log("Title inserted");
    return true;
}

/**
 * Insert content into the body editor
 */
async function insertBody(content) {
    console.log("Inserting body content, length:", content?.length);
    const bodyEditor = findBodyEditor();
    if (!bodyEditor) {
        console.error("Could not find body editor");
        return false;
    }

    bodyEditor.focus();
    await sleep(100);

    // Clear existing content
    bodyEditor.innerHTML = '';

    // Insert HTML content
    bodyEditor.innerHTML = content;

    // Dispatch events to trigger React state updates
    bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));
    bodyEditor.dispatchEvent(new Event('change', { bubbles: true }));

    // Try using execCommand as alternative
    document.execCommand('selectAll', false, null);
    document.execCommand('insertHTML', false, content);

    console.log("Body content inserted");
    return true;
}

// ============================================================================
// Content Fixing Functions
// ============================================================================

/**
 * Fix headers that lost their formatting after paste
 */
function fixHeaders() {
    console.log("Fixing header formatting");
    const bodyEditor = findBodyEditor();
    if (!bodyEditor) return;

    let html = bodyEditor.innerHTML;

    // Find and replace header markers
    const headerRegex = /<!--HEADER:(H[1-4]):START-->(.*?)<!--HEADER:H[1-4]:END-->/g;
    html = html.replace(headerRegex, (match, level, text) => {
        const tag = level.toLowerCase();
        console.log(`Restoring header ${tag}: ${text.substring(0, 30)}...`);
        return `<${tag}>${text}</${tag}>`;
    });

    // Also remove the bold wrapper if present
    html = html.replace(/<strong>(<h[1-4]>.*?<\/h[1-4]>)<\/strong>/g, '$1');

    bodyEditor.innerHTML = html;
    bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Fix blockquote line breaks that were removed
 */
function fixBlockquoteBreaks() {
    console.log("Fixing blockquote line breaks");
    const bodyEditor = findBodyEditor();
    if (!bodyEditor) return;

    let html = bodyEditor.innerHTML;

    // Replace our markers with actual line breaks
    html = html.replace(/<!--BQBREAK-->/g, '<br>');

    bodyEditor.innerHTML = html;
    bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Fix images that became camera icons
 * This stores info for manual fixing if needed
 */
async function fixImages(imageData) {
    console.log("Checking images, count:", imageData?.length);
    const bodyEditor = findBodyEditor();
    if (!bodyEditor || !imageData || imageData.length === 0) return;

    // Find image placeholders or broken images
    const images = bodyEditor.querySelectorAll('img');
    const placeholders = bodyEditor.querySelectorAll('[data-twitter-img-index]');

    console.log("Found images:", images.length, "placeholders:", placeholders.length);

    // For each original image, try to restore it
    for (const imgInfo of imageData) {
        console.log("Image to restore:", imgInfo.src?.substring(0, 50));
        // Note: Actual image re-upload would require complex interaction
        // with X's upload mechanism. For now, we log the info.
    }

    // If images are missing, add a note
    if (images.length < imageData.length) {
        console.warn(`Missing ${imageData.length - images.length} images. User may need to re-add manually.`);
    }
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Main function to insert content into Twitter Articles
 */
async function insertTwitterContent() {
    console.log("Starting Twitter content insertion");

    try {
        // Get formatted content
        const data = await chrome.storage.local.get('twitter_formatted_content');
        if (!data.twitter_formatted_content) {
            console.error("No content found in storage");
            return { success: false, error: "No content found" };
        }

        const { title, content, images } = data.twitter_formatted_content;
        console.log("Content loaded:", { titleLength: title?.length, contentLength: content?.length });

        // Step 1: Click pencil icon to open editor
        console.log("Step 1: Opening editor");
        const pencilClicked = await clickPencilIcon();
        if (!pencilClicked) {
            // Editor might already be open, continue anyway
            console.log("Pencil click failed or editor already open, continuing...");
        }

        // Wait for editor to fully load
        await sleep(CONFIG.pencilClickDelay);

        // Step 2: Insert title
        console.log("Step 2: Inserting title");
        const titleInserted = await insertTitle(title);

        // Step 3: Insert body content
        console.log("Step 3: Inserting body");
        await sleep(CONFIG.contentInsertDelay);
        const bodyInserted = await insertBody(content);

        // Step 4: Fix formatting issues
        console.log("Step 4: Fixing formatting");
        await sleep(CONFIG.contentInsertDelay);

        fixHeaders();
        fixBlockquoteBreaks();
        await fixImages(images);

        console.log("Content insertion complete");
        return {
            success: true,
            details: { titleInserted, bodyInserted }
        };

    } catch (error) {
        console.error("Error inserting content:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Auto-run on Page Load
// ============================================================================

function checkStorageAndInsert() {
    console.log("Checking storage for Twitter content");
    chrome.storage.local.get('twitter_formatted_content', async function(data) {
        if (data.twitter_formatted_content) {
            console.log("Found content to insert, waiting for page...");
            // Wait a bit for the page to fully initialize
            await sleep(2000);
            await insertTwitterContent();
        } else {
            console.log("No Twitter content found in storage");
        }
    });
}

// Wait for page to be ready
if (document.readyState === 'complete') {
    checkStorageAndInsert();
} else {
    window.addEventListener('load', checkStorageAndInsert);
}

// Expose function for direct calling from popup
window.insertTwitterContent = insertTwitterContent;

console.log("Twitter receiver loaded");
