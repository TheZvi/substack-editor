console.log("WordPress receiver loading (Classic Editor version)");

// Check storage immediately with more detail
chrome.storage.local.get('wordpress_formatted_content', function(data) {
    console.log("Initial storage check:", {
        hasData: !!data.wordpress_formatted_content,
        dataKeys: data.wordpress_formatted_content ? Object.keys(data.wordpress_formatted_content) : null,
        titleLength: data.wordpress_formatted_content?.title?.length,
        contentLength: data.wordpress_formatted_content?.content?.length,
        rawTitle: data.wordpress_formatted_content?.title, // Log the actual title
        contentPreview: data.wordpress_formatted_content?.content?.substring(0, 100) // Log start of content
    });
});

async function insertContent(data) {
    console.log("Attempting to insert content into Classic Editor (TinyMCE)");
    const { title, content } = data;

    // Handle title first (this was working)
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

        console.log("Content insertion complete");
        return true;
    } catch (error) {
        console.error("Error inserting content:", error);
        return false;
    }
}

// Attempt content insertion when Classic Editor is ready
function checkStorageAndInsert() {
    console.log("Checking storage for content");
    chrome.storage.local.get('wordpress_formatted_content', async function(data) {
        if (data.wordpress_formatted_content) {
            console.log("Found content to insert");
            await insertContent(data.wordpress_formatted_content);
        } else {
            console.log("No content found in storage");
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
    console.log("insertWordPressContent called directly");
    const data = await chrome.storage.local.get('wordpress_formatted_content');
    if (!data.wordpress_formatted_content) {
        console.error("No content found");
        return { success: false, error: "No content found" };
    }
    
    const result = await insertContent(data.wordpress_formatted_content);
    return { success: result, error: result ? null : "Failed to insert content" };
};

console.log("WordPress receiver loaded (Classic Editor version)");