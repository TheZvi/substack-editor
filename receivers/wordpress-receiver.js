// VERSION 2.0 - With duplicate insertion prevention
const SCRIPT_VERSION = "2.0";
console.log(`WordPress receiver loading (Classic Editor version) - v${SCRIPT_VERSION}`);

// Guard against duplicate insertions using DOM marker (works across script versions)
const INSERTION_MARKER_ID = '__wp_content_inserted__';
const INSERTION_TIMEOUT_MS = 30000; // Only accept content formatted within last 30 seconds

// Check if insertion was already done (by any version of this script)
function isInsertionDone() {
    return document.getElementById(INSERTION_MARKER_ID) !== null;
}

// Mark insertion as done (visible to all script versions)
function markInsertionDone() {
    if (!document.getElementById(INSERTION_MARKER_ID)) {
        const marker = document.createElement('div');
        marker.id = INSERTION_MARKER_ID;
        marker.style.display = 'none';
        document.body.appendChild(marker);
    }
}

// Check storage immediately with more detail
chrome.storage.local.get('wordpress_formatted_content', function(data) {
    console.log(`=== INITIAL STORAGE CHECK (v${SCRIPT_VERSION}) ===`);
    console.log("Already inserted:", isInsertionDone());
    console.log("Has data:", !!data.wordpress_formatted_content);
    if (data.wordpress_formatted_content) {
        console.log("Title:", data.wordpress_formatted_content.title);
        console.log("Content length:", data.wordpress_formatted_content.content?.length);
        console.log("Content preview:", data.wordpress_formatted_content.content?.substring(0, 150));
        console.log("Format timestamp:", data.wordpress_formatted_content.formatTimestamp);
        console.log("Source URL:", data.wordpress_formatted_content.originalMetadata?.sourceUrl);

        // Check if content is fresh
        const age = Date.now() - (data.wordpress_formatted_content.formatTimestamp || 0);
        console.log("Content age (ms):", age);
        console.log("Content is fresh:", age < INSERTION_TIMEOUT_MS);
    }
    console.log("=============================");
});

async function insertContent(data) {
    // Guard: check DOM marker first (works across all script versions)
    if (isInsertionDone()) {
        console.log(`⚠️ [v${SCRIPT_VERSION}] Insertion already done (DOM marker found), skipping`);
        return false;
    }

    // Guard: check timestamp to reject stale content
    const formatTimestamp = data.formatTimestamp || 0;
    const age = Date.now() - formatTimestamp;
    if (age > INSERTION_TIMEOUT_MS) {
        console.log(`⚠️ [v${SCRIPT_VERSION}] Content is stale (${age}ms old, max ${INSERTION_TIMEOUT_MS}ms), skipping insertion`);
        return false;
    }

    // Mark as done IMMEDIATELY to prevent race conditions
    markInsertionDone();

    console.log(`=== INSERTING CONTENT (v${SCRIPT_VERSION}) ===`);
    console.log("Title being inserted:", data.title);
    console.log("Content length:", data.content?.length);
    console.log("Source URL:", data.originalMetadata?.sourceUrl);
    console.log("Content age (ms):", age);

    const { title, content } = data;

    // Handle title first
    const titleInput = document.getElementById('title');
    if (titleInput) {
        const cleanTitle = title.replace(/^.*?Editing\s*"/i, '').replace(/"$/, '');
        titleInput.value = cleanTitle;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Handle content through TinyMCE
    console.log("Looking for TinyMCE editor");
    const editorFrame = document.getElementById('content_ifr');
    if (!editorFrame) {
        console.error("Could not find TinyMCE iframe");
        return false;
    }

    try {
        // Get the editor document inside the iframe
        const editorDocument = editorFrame.contentDocument || editorFrame.contentWindow.document;
        const editorBody = editorDocument.body;

        console.log("Found editor body:", {
            hasBody: !!editorBody,
            initialContent: editorBody?.innerHTML?.length
        });

        // Set content in TinyMCE
        editorBody.innerHTML = content;

        // Also try to update through tinyMCE API if available
        if (window.tinyMCE && window.tinyMCE.get('content')) {
            console.log("Using tinyMCE API");
            window.tinyMCE.get('content').setContent(content);
        }

        // Clear storage to prevent any other scripts from re-inserting
        console.log("Clearing storage after successful insertion");
        await chrome.storage.local.remove('wordpress_formatted_content');

        console.log(`✓ Content insertion complete (v${SCRIPT_VERSION})`);
        return true;
    } catch (error) {
        console.error("Error inserting content:", error);
        return false;
    }
}

// Attempt content insertion when Classic Editor is ready
function checkStorageAndInsert() {
    if (isInsertionDone()) {
        console.log(`[v${SCRIPT_VERSION}] Insertion already done, skipping checkStorageAndInsert`);
        return;
    }

    console.log(`[v${SCRIPT_VERSION}] Checking storage for content`);
    chrome.storage.local.get('wordpress_formatted_content', async function(data) {
        if (data.wordpress_formatted_content) {
            console.log(`[v${SCRIPT_VERSION}] Found content to insert`);
            await insertContent(data.wordpress_formatted_content);
        } else {
            console.log(`[v${SCRIPT_VERSION}] No content found in storage`);
        }
    });
}

// Wait for page to be ready
if (document.readyState === 'complete') {
    checkStorageAndInsert();
} else {
    window.addEventListener('load', checkStorageAndInsert);
}

// Expose function for direct calling
window.insertWordPressContent = async function() {
    console.log(`[v${SCRIPT_VERSION}] insertWordPressContent called directly`);

    if (isInsertionDone()) {
        console.log(`[v${SCRIPT_VERSION}] Insertion already completed`);
        return { success: true, message: "Already inserted" };
    }

    const data = await chrome.storage.local.get('wordpress_formatted_content');
    if (!data.wordpress_formatted_content) {
        console.error(`[v${SCRIPT_VERSION}] No content found`);
        return { success: false, error: "No content found" };
    }

    const result = await insertContent(data.wordpress_formatted_content);
    return { success: result, error: result ? null : "Failed to insert content" };
};

console.log(`WordPress receiver loaded (Classic Editor version) - v${SCRIPT_VERSION}`);
