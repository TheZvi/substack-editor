console.log("Content extractor loading");

window.extractSubstackContent = async function() {
    console.log("=== EXTRACTING SUBSTACK CONTENT ===");
    console.log("Current URL:", window.location.href);

    try {
        // IMPORTANT: Clear old content first to prevent stale data
        console.log("Clearing old extracted content from storage...");
        await chrome.storage.local.remove(['extracted_content', 'wordpress_formatted_content', 'twitter_formatted_content']);

        // Get title from title tag and remove " - Substack" suffix
        const titleElement = document.querySelector('title');
        if (!titleElement) throw new Error("Could not find title element");
        const title = titleElement.textContent.replace(" - Substack", "");
        console.log("Extracted title:", title);

        // Get content using the editor selector
        const contentElement = document.querySelector('div[contenteditable="true"][data-testid="editor"]');
        console.log("Found content element:", !!contentElement);

        if (!contentElement) {
            throw new Error("Could not find content element");
        }

        const rawContent = contentElement.innerHTML;
        console.log("Raw content length:", rawContent?.length);
        console.log("Raw content preview:", rawContent?.substring(0, 200));

        // Process content to clean up Substack-specific elements while preserving structure
        const processedContent = cleanupContent(rawContent);
        console.log("Processed content length:", processedContent?.length);

        // Store in a standardized format
        const extractedContent = {
            title: title,
            content: processedContent,
            metadata: {
                source: 'substack',
                sourceUrl: window.location.href,
                extractionDate: Date.now(),
                contentType: 'article'
            }
        };

        // Store for use by any platform formatter
        await chrome.storage.local.set({
            'extracted_content': extractedContent
        });

        // Verify storage was updated
        const verification = await chrome.storage.local.get('extracted_content');
        console.log("Storage verification - stored title:", verification.extracted_content?.title);
        console.log("Storage verification - stored URL:", verification.extracted_content?.metadata?.sourceUrl);

        return {
            success: true,
            contentInfo: {
                title: title,
                titleLength: title.length,
                contentLength: processedContent.length,
                hasHeadings: processedContent.includes('</h'),
                hasImages: processedContent.includes('<img'),
                sourceUrl: window.location.href
            }
        };
    } catch (error) {
        console.error('Error extracting content:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to clean up content
function cleanupContent(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Remove Substack-specific classes and attributes while preserving structure
    function cleanNode(element) {
        if (!element) return;

        // Keep only essential attributes
        const keepAttrs = ['href', 'src', 'alt'];
        Array.from(element.attributes || []).forEach(attr => {
            if (!keepAttrs.includes(attr.name)) {
                element.removeAttribute(attr.name);
            }
        });

        // Clean child nodes
        Array.from(element.children).forEach(cleanNode);
    }

    cleanNode(tempDiv);
    
    return tempDiv.innerHTML;
}

console.log("Content extractor loaded");