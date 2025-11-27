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
        const processedContent = processForTwitter(content);
        console.log("Processed content length:", processedContent.html?.length);

        // Store Twitter-specific formatted version
        await chrome.storage.local.set({
            'twitter_formatted_content': {
                title: cleanTitle,
                content: processedContent.html,
                plainText: processedContent.plainText,
                images: processedContent.images,
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

function processForTwitter(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    const images = [];

    // Collect image information and remove them (user will add manually)
    const imgs = tempDiv.querySelectorAll('img');
    imgs.forEach((img, index) => {
        const src = img.getAttribute('src');
        const alt = img.getAttribute('alt') || '';
        if (src) {
            images.push({
                index: index,
                src: src,
                alt: alt
            });
            // Remove images - they can't be pasted
            img.remove();
        }
    });

    // Keep headers, blockquotes, and paragraphs as-is
    // The HTML should paste reasonably well

    return {
        html: tempDiv.innerHTML,
        plainText: tempDiv.innerText,
        images: images
    };
}

console.log("Twitter formatter loaded");
