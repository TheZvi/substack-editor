console.log("Twitter receiver loading");

// Configuration
const CONFIG = {
    maxRetries: 10,
    retryDelay: 500
};

/**
 * Copy HTML content to clipboard so user can paste it
 */
async function copyToClipboard(html, plainText) {
    try {
        // Try using the Clipboard API with HTML
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

        // Fallback: copy plain text
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
    // Create a floating notification
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

    // Remove any existing notification
    const existing = document.getElementById('substack-helper-notification');
    if (existing) existing.remove();

    document.body.appendChild(notification);

    // Auto-remove after 15 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 15000);
}

/**
 * Main function - copy content to clipboard and notify user
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

        // Log images for user to add manually
        if (images && images.length > 0) {
            console.log("=== IMAGES TO ADD MANUALLY ===");
            images.forEach((img, i) => {
                console.log(`Image ${i + 1}: ${img.alt || 'No alt text'}`);
                console.log(`  URL: ${img.src}`);
            });
            console.log("==============================");
        }

        // Copy content to clipboard
        const copied = await copyToClipboard(content, plainText);

        if (copied) {
            showNotification(
                `<strong>Title:</strong> ${title}<br><br>` +
                `Press <strong>Ctrl+V</strong> (or Cmd+V) in the article body to paste your content.` +
                `<br><br>Then manually add the title above.`,
                images?.length || 0
            );

            // Also log the title for easy copying
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
            // Wait for page to be fully ready
            await new Promise(resolve => setTimeout(resolve, 1500));
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
