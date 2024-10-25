console.log("WordPress formatter loading");

window.formatForWordPress = async function() {
    console.log("Formatting content for WordPress");
    try {
        // Get the platform-agnostic content
        const data = await chrome.storage.local.get('extracted_content');
        if (!data.extracted_content) {
            throw new Error("No extracted content found");
        }

        const { title, content, metadata } = data.extracted_content;
        const cleanTitle = title
        .replace(/^.*?Editing\s*"/i, '')  // Remove everything up to and including 'Editing "'
        .replace(/"$/, '');               // Remove trailing quote mark
        console.log("Formatting content with length:", content?.length);

        // Convert to WordPress blocks format
        const wpContent = convertToBlocks(content);
        console.log("Converted to blocks format");

        // Add read more tag
        const wpContentWithMore = addReadMoreTag(wpContent);
        console.log("Added read more tag");

        // Store WordPress-specific formatted version
        await chrome.storage.local.set({
            'wordpress_formatted_content': {
                title: cleanTitle,
                content: wpContentWithMore,
                originalMetadata: metadata,
                formatTimestamp: Date.now()
            }
        });
        console.log("Verifying storage after formatting:", {
            titleLength: cleanTitle?.length,
            titleFull: cleanTitle,
            unformattedTitle: title,
            content: content?.length
        });
        chrome.storage.local.get('wordpress_formatted_content', function(data) {
            console.log("Immediate storage verification:", {
                hasData: !!data.wordpress_formatted_content,
                dataKeys: data.wordpress_formatted_content ? Object.keys(data.wordpress_formatted_content) : null,
                titleLength: data.wordpress_formatted_content?.title?.length,
                contentLength: data.wordpress_formatted_content?.content?.length
            });
        });
        return { success: true };
    } catch (error) {
        console.error('Error formatting for WordPress:', error);
        return { success: false, error: error.message };
    }
}

function convertToBlocks(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Convert headings to WordPress blocks
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4');
    headings.forEach(heading => {
        const level = heading.tagName.toLowerCase();
        const text = heading.textContent;
        heading.outerHTML = `<!-- wp:heading {"level":${level.slice(-1)}} -->
<${level}>${text}</${level}>
<!-- /wp:heading -->`;
    });

    // Convert images to WordPress blocks
    const images = tempDiv.querySelectorAll('img');
    images.forEach(img => {
        img.outerHTML = `<!-- wp:image -->
<figure class="wp-block-image">${img.outerHTML}</figure>
<!-- /wp:image -->`;
    });

    return tempDiv.innerHTML;
}

function addReadMoreTag(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    let wordCount = 0;
    let insertPoint = null;
    
    for (const paragraph of tempDiv.getElementsByTagName('p')) {
        wordCount += paragraph.textContent.trim().split(/\s+/).length;
        if (wordCount >= 100 && !insertPoint) {
            insertPoint = paragraph;
            break;
        }
    }
    
    if (insertPoint) {
        const moreTag = document.createElement('div');
        moreTag.innerHTML = '<!-- wp:more -->\n<!--more-->\n<!-- /wp:more -->';
        insertPoint.after(moreTag);
    }
    
    return tempDiv.innerHTML;
}

console.log("WordPress formatter loaded");