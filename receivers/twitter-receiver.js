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

// ============================================================================
// Content Insertion Functions
// ============================================================================

/**
 * Find the title input - could be input OR contenteditable div
 */
function findTitleInput() {
    // First try input elements
    const inputSelectors = [
        'input[placeholder*="Title"]',
        'input[placeholder*="title"]',
        'input[aria-label*="Title"]',
        'input[aria-label*="title"]',
        '[data-testid*="title"] input',
        '[data-testid*="Title"] input',
        'input[name="title"]'
    ];

    for (const selector of inputSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            console.log("Found title input:", selector);
            return { element: el, type: 'input' };
        }
    }

    // Try contenteditable divs for title
    const editableSelectors = [
        '[data-testid*="title"][contenteditable="true"]',
        '[data-testid*="Title"][contenteditable="true"]',
        '[aria-label*="Title"][contenteditable="true"]',
        '[aria-label*="title"][contenteditable="true"]',
        '[placeholder*="Title"][contenteditable="true"]',
        '[data-placeholder*="Title"][contenteditable="true"]',
        '[data-placeholder*="title"][contenteditable="true"]'
    ];

    for (const selector of editableSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            console.log("Found title contenteditable:", selector);
            return { element: el, type: 'contenteditable' };
        }
    }

    // Fallback: find the first/smaller contenteditable (title is usually smaller than body)
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    if (editables.length >= 2) {
        // Sort by area, title is usually smaller
        editables.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return (aRect.width * aRect.height) - (bRect.width * bRect.height);
        });
        // The smaller one is likely the title
        console.log("Found title by size (smallest contenteditable)");
        return { element: editables[0], type: 'contenteditable' };
    }

    // Last resort: first input
    const firstInput = document.querySelector('input[type="text"]');
    if (firstInput) {
        console.log("Found title as first text input");
        return { element: firstInput, type: 'input' };
    }

    return null;
}

/**
 * Find the main body editor element
 */
function findBodyEditor() {
    const selectors = [
        '[data-testid*="body"] [contenteditable="true"]',
        '[data-testid*="Body"] [contenteditable="true"]',
        '[data-testid*="editor"] [contenteditable="true"]',
        '[aria-label*="body"] [contenteditable="true"]',
        '[aria-label*="Body"] [contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"]:not([aria-label*="title"])'
    ];

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
    const titleResult = findTitleInput();
    if (!titleResult) {
        console.error("Could not find title input");
        return false;
    }

    const { element, type } = titleResult;
    element.focus();
    await sleep(100);

    if (type === 'input') {
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.value = title;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        // Contenteditable
        element.textContent = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Try multiple methods
        element.textContent = title;
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Also try execCommand
        element.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, title);
    }

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

    // Clear and insert
    bodyEditor.innerHTML = '';
    bodyEditor.innerHTML = content;
    bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));

    console.log("Body content inserted");
    return true;
}

// ============================================================================
// Content Fixing Functions
// ============================================================================

/**
 * Fix all formatting markers in the content
 */
function fixAllFormatting() {
    console.log("Fixing all formatting markers");
    const bodyEditor = findBodyEditor();
    if (!bodyEditor) {
        console.error("Could not find body editor for fixing");
        return;
    }

    let html = bodyEditor.innerHTML;
    console.log("Original HTML length:", html.length);

    // Fix headers: |||H1||| text |||/H1||| -> <h1>text</h1>
    html = html.replace(/\|\|\|H1\|\|\|\s*(.*?)\s*\|\|\|\/H1\|\|\|/g, '<h1>$1</h1>');
    html = html.replace(/\|\|\|H2\|\|\|\s*(.*?)\s*\|\|\|\/H2\|\|\|/g, '<h2>$1</h2>');
    html = html.replace(/\|\|\|H3\|\|\|\s*(.*?)\s*\|\|\|\/H3\|\|\|/g, '<h3>$1</h3>');
    html = html.replace(/\|\|\|H4\|\|\|\s*(.*?)\s*\|\|\|\/H4\|\|\|/g, '<h4>$1</h4>');

    // Fix blockquotes: |||QUOTE||| text |||/QUOTE||| -> <blockquote>text</blockquote>
    // Also convert |||BR||| to <br> within quotes
    html = html.replace(/\|\|\|QUOTE\|\|\|\s*(.*?)\s*\|\|\|\/QUOTE\|\|\|/g, (match, content) => {
        const fixedContent = content.replace(/\s*\|\|\|BR\|\|\|\s*/g, '<br>');
        return `<blockquote>${fixedContent}</blockquote>`;
    });

    // Fix images: |||IMAGE||| description: url |||/IMAGE||| -> [IMAGE: description - url]
    // Leave as visible text so user can manually add
    html = html.replace(/\|\|\|IMAGE\|\|\|\s*(.*?)\s*\|\|\|\/IMAGE\|\|\|/g,
        '<p style="color: #666; font-style: italic;">[IMAGE: $1]</p>');

    // Clean up any leftover old-style markers
    html = html.replace(/<!--BQBREAK-->/g, '<br>');
    html = html.replace(/&lt;!--BQBREAK--&gt;/g, '<br>');

    console.log("Fixed HTML length:", html.length);
    bodyEditor.innerHTML = html;
    bodyEditor.dispatchEvent(new Event('input', { bubbles: true }));
    console.log("Formatting fixed");
}

// ============================================================================
// Main Orchestration
// ============================================================================

async function insertTwitterContent() {
    console.log("Starting Twitter content insertion");

    try {
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
            console.log("Pencil click failed or editor already open, continuing...");
        }

        await sleep(CONFIG.pencilClickDelay);

        // Step 2: Insert title
        console.log("Step 2: Inserting title");
        const titleInserted = await insertTitle(title);

        // Step 3: Insert body content
        console.log("Step 3: Inserting body");
        await sleep(CONFIG.contentInsertDelay);
        const bodyInserted = await insertBody(content);

        // Step 4: Fix all formatting markers
        console.log("Step 4: Fixing formatting");
        await sleep(CONFIG.contentInsertDelay);
        fixAllFormatting();

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
            await sleep(2000);
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

console.log("Twitter receiver loaded");
