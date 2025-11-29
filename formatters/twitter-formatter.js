console.log("Twitter formatter loading");

window.formatForTwitter = async function() {
    console.log("Formatting content for Twitter Articles");
    try {
        // Get the platform-agnostic content
        const data = await chrome.storage.local.get('extracted_content');
        if (!data.extracted_content) {
            throw new Error("No extracted content found");
        }

        const { title, content, metadata } = data.extracted_content;

        // Clean title - remove Substack editing cruft
        const cleanTitle = title
            .replace(/^.*?Editing\s*"/i, '')
            .replace(/"$/, '')
            .trim();

        console.log("Processing content with length:", content?.length);

        // Process content - keep it clean HTML, no markers
        const processedContent = await processForTwitter(content);
        console.log("Processed content length:", processedContent.html?.length);

        // Store Twitter-specific formatted version
        await chrome.storage.local.set({
            'twitter_formatted_content': {
                title: cleanTitle,
                content: processedContent.html,
                plainText: processedContent.plainText,
                images: processedContent.images,
                headers: processedContent.headers,
                originalMetadata: metadata,
                formatTimestamp: Date.now()
            }
        });

        console.log("Twitter formatted content stored:", {
            titleLength: cleanTitle?.length,
            contentLength: processedContent.html?.length,
            imageCount: processedContent.images?.length
        });

        return { success: true };
    } catch (error) {
        console.error('Error formatting for Twitter:', error);
        return { success: false, error: error.message };
    }
}

async function processForTwitter(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    const images = [];
    const headers = [];

    // Collect image information with position context, then remove them
    // We fetch images NOW while we're on Substack (same origin) and convert to base64
    const imgs = tempDiv.querySelectorAll('img');

    for (let index = 0; index < imgs.length; index++) {
        const img = imgs[index];
        // Try multiple sources - Substack may use different attributes
        let src = img.getAttribute('src') ||
                  img.getAttribute('data-src') ||
                  img.dataset.src ||
                  img.currentSrc;  // For responsive images
        const alt = img.getAttribute('alt') || '';

        console.log(`[Twitter Formatter] Image ${index} sources:`, {
            src: img.getAttribute('src')?.substring(0, 50),
            dataSrc: img.getAttribute('data-src')?.substring(0, 50),
            currentSrc: img.currentSrc?.substring(0, 50),
            srcset: img.getAttribute('srcset')?.substring(0, 50)
        });

        if (src) {
            // Find text before this image by walking backwards through ALL preceding content
            let positionMarker = '';

            // Get all text content before this image in document order
            // Create a TreeWalker to find all text nodes
            const allText = [];
            const walker = document.createTreeWalker(
                tempDiv,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            let foundImg = false;
            const imgParents = [];
            let parent = img;
            while (parent && parent !== tempDiv) {
                imgParents.push(parent);
                parent = parent.parentElement;
            }

            // Collect all text that comes before this image in the DOM
            walker.currentNode = tempDiv;
            while (node = walker.nextNode()) {
                // Check if this text node is before the image
                // A text node is "before" if it's not inside the image's ancestor chain
                // and comes before in document order
                let isBeforeImg = true;
                let textParent = node.parentElement;

                // Check if we've passed the image
                if (imgParents.includes(textParent)) {
                    isBeforeImg = false;
                }

                // Simple check: is this node before img in the DOM?
                if (isBeforeImg && node.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    const text = node.textContent.trim();
                    if (text) {
                        allText.push(text);
                    }
                }
            }

            // Use the last chunk of text before the image
            if (allText.length > 0) {
                const lastText = allText[allText.length - 1];
                positionMarker = lastText.length > 50 ? lastText.slice(-50) : lastText;
            }

            // Debug: show what we found
            if (index < 3) {
                console.log(`[Twitter Formatter] Image ${index} debug:`, {
                    parent: img.parentElement?.tagName,
                    grandparent: img.parentElement?.parentElement?.tagName,
                    textChunksFound: allText.length,
                    lastChunk: allText.length > 0 ? allText[allText.length - 1].substring(0, 50) : 'none'
                });
            }

            console.log(`[Twitter Formatter] Image ${index} position marker: "${positionMarker ? positionMarker.substring(0, 30) + '...' : 'NONE'}"`);

            // Fetch image via background script (bypasses CORS restrictions)
            let imageData = null;
            try {
                console.log(`[Twitter Formatter] Fetching image ${index} via background script...`);

                const response = await chrome.runtime.sendMessage({
                    action: 'fetch-image',
                    url: src
                });

                if (response && response.success) {
                    imageData = {
                        base64: response.base64,
                        mimeType: response.mimeType
                    };
                    const sizeKB = Math.round((response.base64.length * 3/4) / 1024);
                    console.log(`[Twitter Formatter] Image ${index} fetched: ${response.mimeType}, ~${sizeKB}KB`);
                } else {
                    console.error(`[Twitter Formatter] Image ${index} fetch failed:`, response?.error || 'Unknown error');
                }
            } catch (err) {
                console.error(`[Twitter Formatter] Failed to fetch image ${index}:`, err.message || err);
            }

            images.push({
                index: index,
                src: src,
                alt: alt,
                positionMarker: positionMarker,
                imageData: imageData  // base64 data for later use
            });
            console.log(`[Twitter Formatter] Image ${index}: positioned after "...${positionMarker}"`);

            // Remove images - they'll be inserted via clipboard after paste
            img.remove();
        }
    }

    // Collect header text for post-paste formatting
    const headerElements = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headerElements.forEach((header, index) => {
        const text = header.textContent.trim();
        if (text) {
            headers.push({
                index: index,
                level: parseInt(header.tagName.charAt(1)),
                text: text
            });
            console.log(`[Twitter Formatter] Found header: "${text.substring(0, 50)}"`);
        }
    });

    console.log(`[Twitter Formatter] Collected ${headers.length} headers`);

    return {
        html: tempDiv.innerHTML,
        plainText: tempDiv.innerText,
        images: images,
        headers: headers
    };
}

console.log("Twitter formatter loaded");
