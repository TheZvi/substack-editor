// Twitter Newline Fixer - Standalone script to fix missing newlines in blockquotes
// This runs separately from the main twitter-receiver to avoid interference
// It reads the original extracted content to find where line breaks should go

console.log("%c[Twitter Newline Fixer] Loading...", 'color: #657786; font-weight: bold');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
 * Find text in editor and position cursor at the end of it
 */
function findTextAndPositionCursor(editor, searchText) {
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
 * Extract line break markers from original content
 */
function extractLineBreakMarkers(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const markers = [];
    const blockquotes = tempDiv.querySelectorAll('blockquote');

    blockquotes.forEach((bq, bqIndex) => {
        const paragraphs = bq.querySelectorAll('p');
        console.log(`[Newline Fixer] Blockquote ${bqIndex + 1} has ${paragraphs.length} paragraphs`);

        paragraphs.forEach((p, pIndex) => {
            // For all paragraphs except the last, we need a line break after them
            if (pIndex < paragraphs.length - 1) {
                const text = p.textContent.trim();
                if (text) {
                    // Use last 40 chars as marker
                    const marker = text.length > 40 ? text.slice(-40) : text;
                    markers.push({
                        blockquoteIndex: bqIndex,
                        paragraphIndex: pIndex,
                        textEndsWith: marker
                    });
                    console.log(`[Newline Fixer] Need break after: "...${marker}"`);
                }
            }
        });
    });

    return markers;
}

/**
 * Main function - reads original content and inserts line breaks
 */
window.fixTwitterNewlines = async function() {
    console.log("%c[Twitter Newline Fixer] Starting...", 'color: #657786; font-weight: bold');

    const editor = findEditorElement();
    if (!editor) {
        console.log("Editor not found");
        return { success: false, error: "Editor not found" };
    }

    // Get the original extracted content from storage
    const data = await chrome.storage.local.get('extracted_content');
    if (!data.extracted_content || !data.extracted_content.content) {
        console.log("No original content found in storage");
        return { success: false, error: "No original content in storage - extract from Substack first" };
    }

    console.log("Found original content, analyzing blockquotes...");

    // Extract line break markers from the original HTML
    const markers = extractLineBreakMarkers(data.extracted_content.content);

    if (markers.length === 0) {
        console.log("No line breaks needed (no multi-paragraph blockquotes found)");
        return { success: true, count: 0, message: "No line breaks needed" };
    }

    console.log(`Found ${markers.length} line breaks to insert`);

    // Insert line breaks
    let inserted = 0;
    for (const marker of markers) {
        console.log(`Looking for: "...${marker.textEndsWith}"`);

        const found = findTextAndPositionCursor(editor, marker.textEndsWith);
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

    console.log(`%c[Twitter Newline Fixer] Done: ${inserted}/${markers.length} line breaks inserted`, 'color: #00aa00; font-weight: bold');
    return { success: true, count: inserted };
};

console.log("%c[Twitter Newline Fixer] Ready", 'color: #657786; font-weight: bold');
