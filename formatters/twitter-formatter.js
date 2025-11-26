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

        // Process content for Twitter Articles
        const processedContent = processForTwitter(content);
        console.log("Processed content length:", processedContent.html?.length);

        // Store Twitter-specific formatted version
        await chrome.storage.local.set({
            'twitter_formatted_content': {
                title: cleanTitle,
                content: processedContent.html,
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

    // Process headers - mark with tokens for restoration after paste
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((heading, index) => {
        const level = heading.tagName.toLowerCase();
        const text = heading.textContent.trim();
        // Use special markers that will survive paste
        const marker = document.createElement('p');
        marker.innerHTML = `<strong><!--HEADER:${level.toUpperCase()}:START-->${text}<!--HEADER:${level.toUpperCase()}:END--></strong>`;
        heading.replaceWith(marker);
    });

    // Process blockquotes - preserve line breaks
    const blockquotes = tempDiv.querySelectorAll('blockquote');
    blockquotes.forEach(bq => {
        // Find all paragraphs or text content within blockquote
        const paragraphs = bq.querySelectorAll('p');
        if (paragraphs.length > 1) {
            // Mark line breaks between paragraphs
            paragraphs.forEach((p, index) => {
                if (index < paragraphs.length - 1) {
                    // Add marker after each paragraph except the last
                    const marker = document.createTextNode('<!--BQBREAK-->');
                    p.after(marker);
                }
            });
        }
        // Also handle direct text content with newlines
        const walker = document.createTreeWalker(bq, NodeFilter.SHOW_TEXT);
        let textNode;
        while (textNode = walker.nextNode()) {
            if (textNode.nodeValue.includes('\n')) {
                textNode.nodeValue = textNode.nodeValue.replace(/\n/g, '<!--BQBREAK-->');
            }
        }
    });

    // Collect image information for potential re-upload
    const imgs = tempDiv.querySelectorAll('img');
    imgs.forEach((img, index) => {
        const src = img.getAttribute('src');
        if (src) {
            images.push({
                index: index,
                src: src,
                alt: img.getAttribute('alt') || ''
            });
            // Mark images for identification after paste
            img.setAttribute('data-twitter-img-index', index);
        }
    });

    return {
        html: tempDiv.innerHTML,
        images: images
    };
}

console.log("Twitter formatter loaded");
