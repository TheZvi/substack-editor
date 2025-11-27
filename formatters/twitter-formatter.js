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

    // Process headers - use visible markers that survive paste
    // Format: |||H2||| Header Text |||/H2|||
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((heading) => {
        const level = heading.tagName.toUpperCase();
        const text = heading.textContent.trim();
        const marker = document.createElement('p');
        marker.textContent = `|||${level}||| ${text} |||/${level}|||`;
        heading.replaceWith(marker);
    });

    // Process blockquotes - mark start and end, and preserve line breaks
    // Format: |||QUOTE||| content with |||BR||| for breaks |||/QUOTE|||
    const blockquotes = tempDiv.querySelectorAll('blockquote');
    blockquotes.forEach(bq => {
        // Get all the text content, preserving paragraph breaks
        const paragraphs = bq.querySelectorAll('p');
        let quoteContent = '';

        if (paragraphs.length > 0) {
            quoteContent = Array.from(paragraphs)
                .map(p => p.textContent.trim())
                .join(' |||BR||| ');
        } else {
            // Handle blockquotes without <p> tags
            quoteContent = bq.textContent.trim().replace(/\n+/g, ' |||BR||| ');
        }

        const marker = document.createElement('p');
        marker.textContent = `|||QUOTE||| ${quoteContent} |||/QUOTE|||`;
        bq.replaceWith(marker);
    });

    // Process images - replace with placeholder text containing URL
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
            // Replace image with placeholder
            const placeholder = document.createElement('p');
            placeholder.textContent = `|||IMAGE||| ${alt || 'Image ' + (index + 1)}: ${src} |||/IMAGE|||`;
            img.replaceWith(placeholder);
        }
    });

    return {
        html: tempDiv.innerHTML,
        images: images
    };
}

console.log("Twitter formatter loaded");
