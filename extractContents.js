console.log("Content extractor loading");

window.extractSubstackContent = async function() {
    console.log("Extracting Substack content");
    try {
        // Get title from title tag and remove " - Substack" suffix
        const titleElement = document.querySelector('title');
        if (!titleElement) throw new Error("Could not find title element");
        const title = titleElement.textContent.replace(" - Substack", "");
        
        // Get content using the editor selector
        const contentElement = document.querySelector('div[contenteditable="true"][data-testid="editor"]');
        console.log("Found content element:", !!contentElement);
        
        if (!contentElement) {
            throw new Error("Could not find content element");
        }

        const rawContent = contentElement.innerHTML;
        console.log("Raw content length:", rawContent?.length);

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

        return { 
            success: true, 
            contentInfo: {
                titleLength: title.length,
                contentLength: processedContent.length,
                hasHeadings: processedContent.includes('</h'),
                hasImages: processedContent.includes('<img')
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