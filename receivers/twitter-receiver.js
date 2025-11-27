console.log("Twitter receiver loading");

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

/**
 * Show a notification to the user
 */
function showNotification(message, imageCount) {
    const notification = document.createElement('div');
    notification.id = 'substack-helper-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1DA1F2;
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 999999;
            max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 10px;">
                Content Ready to Paste!
            </div>
            <div style="font-size: 14px; line-height: 1.5;">
                ${message}
            </div>
            ${imageCount > 0 ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 13px;">
                    <strong>${imageCount} image(s)</strong> need to be added manually.
                    URLs are in the console (F12).
                </div>
            ` : ''}
            <button onclick="this.parentElement.parentElement.remove()" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: transparent;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
            ">&times;</button>
        </div>
    `;

    const existing = document.getElementById('substack-helper-notification');
    if (existing) existing.remove();

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 15000);
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main function - click pencil, then copy content to clipboard and notify user
 */
async function insertTwitterContent() {
    console.log("Starting Twitter content preparation");

    try {
        const data = await chrome.storage.local.get('twitter_formatted_content');
        if (!data.twitter_formatted_content) {
            console.error("No content found in storage");
            return { success: false, error: "No content found" };
        }

        const { title, content, plainText, images } = data.twitter_formatted_content;
        console.log("Content loaded:", {
            titleLength: title?.length,
            contentLength: content?.length,
            imageCount: images?.length
        });

        // Step 1: Try to click the pencil icon to open new article
        console.log("Step 1: Clicking pencil icon");
        const pencilClicked = await clickPencilIcon();
        if (pencilClicked) {
            console.log("Pencil clicked successfully, waiting for editor...");
            await sleep(CONFIG.pencilClickDelay);
        } else {
            console.log("Pencil click failed, editor may already be open");
        }

        // Step 2: Log images for user to add manually
        if (images && images.length > 0) {
            console.log("=== IMAGES TO ADD MANUALLY ===");
            images.forEach((img, i) => {
                console.log(`Image ${i + 1}: ${img.alt || 'No alt text'}`);
                console.log(`  URL: ${img.src}`);
            });
            console.log("==============================");
        }

        // Step 3: Copy content to clipboard
        console.log("Step 2: Copying content to clipboard");
        const copied = await copyToClipboard(content, plainText);

        if (copied) {
            showNotification(
                `<strong>Title:</strong> ${title}<br><br>` +
                `Press <strong>Ctrl+V</strong> (or Cmd+V) in the article body to paste your content.` +
                `<br><br>Then manually add the title above.`,
                images?.length || 0
            );

            console.log("=== TITLE (copy this) ===");
            console.log(title);
            console.log("=========================");

            return { success: true, message: "Content copied to clipboard" };
        } else {
            return { success: false, error: "Failed to copy to clipboard" };
        }

    } catch (error) {
        console.error("Error preparing content:", error);
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

console.log("Twitter receiver loaded");
