// twitter/twitter-shortcuts.js
// Keyboard shortcuts for Twitter/X pages

console.log("[Twitter Shortcuts] Loading...");

let recentKeys = '';
let keyTimeout = null;

// Track mouse position for finding tweet under cursor
let lastMouseX = 0;
let lastMouseY = 0;

document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

// Listen for keystrokes to detect ";c" and ";a" sequences
document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input field
    const activeEl = document.activeElement;
    const isTyping = activeEl.tagName === 'INPUT' ||
                     activeEl.tagName === 'TEXTAREA' ||
                     activeEl.getAttribute('contenteditable') === 'true' ||
                     activeEl.closest('[contenteditable="true"]');

    if (isTyping) return;

    // Build up recent key sequence
    recentKeys += e.key;

    // Clear after 1 second of no typing
    clearTimeout(keyTimeout);
    keyTimeout = setTimeout(() => {
        recentKeys = '';
    }, 1000);

    // Check for ";c" command - copy current tweet text only
    if (recentKeys.endsWith(';c')) {
        console.log("[Twitter Shortcuts] ;c detected - copying current tweet");
        recentKeys = '';
        copyCurrentTweet(false);
    }

    // Check for ";a" command - copy current tweet with author name
    if (recentKeys.endsWith(';a')) {
        console.log("[Twitter Shortcuts] ;a detected - copying current tweet with author");
        recentKeys = '';
        copyCurrentTweet(true);
    }

    // Check for ";s" command - copy thread
    if (recentKeys.endsWith(';s')) {
        console.log("[Twitter Shortcuts] ;s detected - copying thread");
        recentKeys = '';
        copyThread();
    }

    // Check for ";q" command - copy tweet URL only
    if (recentKeys.endsWith(';q')) {
        console.log("[Twitter Shortcuts] ;q detected - copying tweet URL");
        recentKeys = '';
        copyTweetUrl();
    }

    // Check for ";t" command - open annotation page prefilled with current tweet author
    if (recentKeys.endsWith(';t')) {
        console.log("[Twitter Shortcuts] ;t detected - opening annotation for current tweet");
        recentKeys = '';
        openAnnotationForCurrentTweet();
    }
});

// Alt+A, Alt+C, and Alt+S shortcuts
document.addEventListener('keydown', (e) => {
    // Alt+C - copy tweet text only (current tweet, not OP)
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+C detected - copying current tweet");
        copyCurrentTweet(false);
    }

    // Alt+A - copy current tweet with author name (not OP)
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+A detected - copying current tweet with author");
        copyCurrentTweet(true);
    }

    // Alt+S - copy entire thread (OP + replies) with smart author handling
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+S detected - copying thread");
        copyThread();
    }

    // Alt+Q - copy tweet URL only
    if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+Q detected - copying tweet URL");
        copyTweetUrl();
    }

    // Alt+T - open annotation page prefilled with current tweet author
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+T detected - opening annotation for current tweet");
        openAnnotationForCurrentTweet();
    }

    // Alt+Z - copy URL of last closed tab
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        console.log("[Twitter Shortcuts] Alt+Z detected - getting last closed tab URL");
        copyLastClosedTabUrl();
    }
}, true);

// Listen for Alt+Click on Twitter Pro (pro.x.com) to open tweet in tab group
document.addEventListener('click', (e) => {
    // Only on pro.x.com
    if (!window.location.hostname.includes('pro.x.com')) return;

    // Check for Alt+Click
    if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        // Update mouse position to click location
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        console.log("[Twitter Shortcuts] Alt+Click detected on Twitter Pro");
        openHoveredTweetInGroup();
    }
}, true);

async function openHoveredTweetInGroup() {
    try {
        // Find the tweet element under the cursor
        const tweetUrl = findTweetUrlUnderCursor();

        if (!tweetUrl) {
            console.log("[Twitter Shortcuts] No tweet found under cursor");
            showNotification("No tweet found under cursor", true);
            return;
        }

        console.log("[Twitter Shortcuts] Opening tweet:", tweetUrl);

        // Send message to background script to open in tab group
        chrome.runtime.sendMessage({
            action: 'open-tweet-in-group',
            tweetUrl: tweetUrl,
            tabGroupName: 'AI Links' // Default, can be overridden by settings
        }, (response) => {
            if (response?.success) {
                showNotification("Tweet opened in tab group");
            } else {
                showNotification("Error: " + (response?.error || "Unknown"), true);
            }
        });

    } catch (error) {
        console.error("[Twitter Shortcuts] Error opening tweet:", error);
        showNotification("Error opening tweet", true);
    }
}

function findTweetUrlUnderCursor() {
    // Get the element under the cursor
    const elementUnderCursor = document.elementFromPoint(lastMouseX, lastMouseY);

    if (!elementUnderCursor) return null;

    // Find the closest tweet article
    const tweetArticle = elementUnderCursor.closest('article[data-testid="tweet"]');

    if (!tweetArticle) {
        // Maybe we're over a different part - try to find any tweet nearby
        console.log("[Twitter Shortcuts] No tweet article found directly under cursor");
        return null;
    }

    // Find the tweet's permalink - usually in a link with a time element
    const timeLink = tweetArticle.querySelector('a time')?.parentElement;
    if (timeLink && timeLink.href) {
        return timeLink.href.split('?')[0]; // Remove query params
    }

    // Fallback: look for any status link
    const statusLink = tweetArticle.querySelector('a[href*="/status/"]');
    if (statusLink) {
        return statusLink.href.split('?')[0];
    }

    return null;
}

// Labels that indicate a link follows (case-insensitive matching)
// These will be transformed: "Label: url" → "Label [here]."
const URL_LABEL_PATTERNS = [
    'more', 'read more', 'see more', 'full article', 'full thread',
    'link', 'article', 'source', 'via', 'github', 'repo', 'code',
    'blog', 'post', 'thread', 'paper', 'study', 'video', 'watch',
    'listen', 'podcast', 'newsletter', 'substack', 'details', 'info'
];

/**
 * Processes URLs in tweet text:
 * 1. Joins URLs broken across lines (Twitter's DOM inserts newlines in long URLs)
 * 2. Removes "..." or "…" truncation indicators
 * 3. Converts "Label: url" patterns to "Label [here]."
 * 4. Makes remaining URLs into clickable <a> links
 *
 * @param {string} text - The tweet text
 * @param {Map<string, string>} urlMap - Map of displayed URL text → full href
 * @returns {{text: string, html: string}} - Processed text and HTML versions
 */
function processUrlsInText(text, urlMap) {
    if (!text) return { text: '', html: '' };

    let processedText = text;

    // Step 1: Join "https://" or "http://" that got separated from domain by newline/space
    // Twitter's DOM sometimes renders protocol and domain as separate elements
    processedText = processedText.replace(/(https?:\/\/)\s*\n\s*/gi, '$1');

    // Step 2: Join URL path segments broken across lines
    // Pattern: domain/path ending with letter/number/slash/hyphen, newline, then continuation
    // Repeat multiple times to handle URLs broken across multiple lines
    for (let i = 0; i < 5; i++) {
        const before = processedText;
        // Join when line ends with - or / (natural break points)
        processedText = processedText.replace(/((?:https?:\/\/)?[a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+(?:\/[^\s]*)?[-\/])\n([a-z0-9][-a-z0-9\/]*)/gi, '$1$2');
        // Join when line ends with alphanumeric (mid-word break)
        processedText = processedText.replace(/((?:https?:\/\/)?[a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+\/[^\s\n]*[a-z0-9])\n([a-z0-9][-a-z0-9\/]*)/gi, '$1$2');
        if (before === processedText) break;
    }

    // Step 3: Remove standalone "..." or "…" on their own line (Twitter's truncation indicator)
    processedText = processedText.replace(/\n(?:\.{2,3}|…)\s*(?=\n|$)/g, '');
    // Also remove ... or … at the very end of text
    processedText = processedText.replace(/(?:\.{2,3}|…)\s*$/, '');

    // Step 4: Remove trailing "..." or "…" from URLs mid-text
    // TLD list includes common TLDs (not domains like github, substack)
    processedText = processedText.replace(/(\S+\.(?:com|org|net|io|co|edu|gov|ai|dev|app|me|cc|gg|tv|fm|ly|to|uk|de|fr|jp)[^\s]*?)(?:\.{2,3}|…)(?=\s|$)/gi, '$1');

    // Step 5: Join label: followed by newline and URL
    // This handles cases like "Apply here:\nhttps://..." → "Apply here: https://..."
    processedText = processedText.replace(/:\s*\n\s*(https?:\/\/)/gi, ': $1');
    processedText = processedText.replace(/:\s*\n\s*((?:[a-z0-9-]+\.)+[a-z]{2,})/gi, ': $1');

    // Step 6: Replace truncated URLs with full URLs from the map
    if (urlMap && urlMap.size > 0) {
        for (const [displayUrl, fullUrl] of urlMap) {
            // Also try matching without newlines in case map has clean version
            processedText = processedText.replace(displayUrl, fullUrl);
        }
    }

    // Track which URLs have been processed (to avoid double-linking)
    const processedUrls = new Set();

    // Step 7: Special case - "X here:" followed by URL → "X here." with "here" linked
    // Pattern: any text ending with "here" + colon + URL
    // Example: "Apply here: https://..." → "Apply here." with "here" as the link
    const herePatternRegex = /(\S.*?)\s+(here)\s*:\s*(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

    // Start building HTML from text (before we modify processedText)
    let processedHtml = processedText;

    // Process "here:" patterns
    const hereMatches = [...processedText.matchAll(herePatternRegex)];
    for (const match of hereMatches) {
        const fullMatch = match[0];
        const prefix = match[1];
        let url = match[3];

        // Ensure URL has protocol
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        // Mark this URL as processed
        processedUrls.add(url);
        processedUrls.add(match[3]);

        // Replace in text: "X here: url" → "X here."
        processedText = processedText.replace(fullMatch, `${prefix} here.`);

        // Replace in HTML: "X here: url" → "X <a href="url">here</a>."
        processedHtml = processedHtml.replace(fullMatch, `${prefix} <a href="${url}">here</a>.`);
    }

    // Step 8: Find "Label: URL" patterns and transform to "Label [here]."
    // Build regex pattern for labels
    const labelPattern = URL_LABEL_PATTERNS.map(l => l.replace(/\s+/g, '\\s+')).join('|');
    const labelUrlRegex = new RegExp(
        `((?:${labelPattern}))\\s*:\\s*(https?:\\/\\/[^\\s]+|(?:[a-z0-9-]+\\.)+[a-z]{2,}\\/[^\\s]*)`,
        'gi'
    );

    // Collect all label+URL matches
    const labelMatches = [...processedText.matchAll(labelUrlRegex)];

    if (labelMatches.length > 0) {
        for (const match of labelMatches) {
            const fullMatch = match[0];
            const label = match[1];
            let url = match[2];

            // Ensure URL has protocol
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            // Mark this URL as processed
            processedUrls.add(url);
            processedUrls.add(match[2]); // Also add the original (possibly without protocol)

            // Replace in text: "Label: url" → "Label [here]."
            processedText = processedText.replace(fullMatch, `${label} [here].`);

            // Replace in HTML: "Label: url" → "Label <a href="url">[here]</a>."
            processedHtml = processedHtml.replace(fullMatch, `${label} <a href="${url}">[here]</a>.`);
        }
    }

    // Step 9: Make remaining URLs into clickable links (for HTML only)
    // Match URLs that aren't inside href attributes
    // Track all URLs we're wrapping to avoid double-wrapping the domain portion
    processedHtml = processedHtml.replace(/(https?:\/\/[^\s<>"]+)/g, (match, url, offset, string) => {
        // Skip if already processed as a label URL
        if (processedUrls.has(match)) {
            return match;
        }
        // Skip if inside an href attribute or anchor tag (check preceding characters)
        const preceding = string.substring(Math.max(0, offset - 10), offset);
        if (preceding.includes('href="') || preceding.includes("href='") || preceding.includes('">')) {
            return match;
        }
        // Mark the domain portion as processed too (to avoid double-wrapping)
        const domainMatch = match.match(/https?:\/\/(.+)/);
        if (domainMatch) {
            processedUrls.add(domainMatch[1]);
        }
        processedUrls.add(match);
        return `<a href="${match}">${match}</a>`;
    });

    // Also handle URLs without protocol (domain.com/path or domain.com format) that aren't labeled
    // TLD list includes common TLDs - must have a path (/) to avoid matching plain domain mentions
    processedHtml = processedHtml.replace(/((?:[a-z0-9-]+\.)+(?:com|org|net|io|co|edu|gov|ai|dev|app|me|cc|gg|tv|fm|ly|to|uk|de|fr|jp)\/[^\s<>"]+)/gi, (match, url, offset, string) => {
        // Skip if already processed (including as part of a full URL)
        if (processedUrls.has(match) || processedUrls.has('https://' + match)) {
            return match;
        }
        // Skip if inside an href attribute or anchor tag
        const preceding = string.substring(Math.max(0, offset - 10), offset);
        if (preceding.includes('href="') || preceding.includes("href='") || preceding.includes('">')) {
            return match;
        }
        return `<a href="https://${match}">${match}</a>`;
    });

    return { text: processedText, html: processedHtml };
}

// Helper to extract clean tweet text without extra newlines around @mentions
function extractCleanTweetText(tweetTextEl, urlMap = null) {
    if (!tweetTextEl) return { text: null, html: null };

    // Use innerText to get text with intended formatting preserved
    let text = tweetTextEl.innerText;

    console.log("[Tweet Extract] Raw innerText:", JSON.stringify(text));

    // Fix the @mention issue: Twitter wraps @mentions in elements that innerText
    // treats as blocks, adding newlines before/after them.
    // Only fix newlines that are DIRECTLY around @mentions (not legitimate paragraph breaks)
    // Pattern: single newline + @mention + single newline (not double newlines which are intentional)
    text = text.replace(/([^\n])\n(@\w+)\n([^\n])/g, '$1 $2 $3');  // text\n@mention\ntext -> text @mention text

    // Clean up multiple spaces (but preserve intentional newlines)
    text = text.replace(/  +/g, ' ');

    console.log("[Tweet Extract] After cleanup:", JSON.stringify(text));

    // Process URLs in the text
    const processed = processUrlsInText(text.trim(), urlMap);

    return { text: processed.text, html: processed.html };
}

function findTweetUnderCursor() {
    // Get the element under the cursor
    const elementUnderCursor = document.elementFromPoint(lastMouseX, lastMouseY);

    if (!elementUnderCursor) return null;

    // Find the closest tweet article
    const tweetEl = elementUnderCursor.closest('article[data-testid="tweet"]');

    if (!tweetEl) {
        console.log("[Twitter Shortcuts] No tweet article found under cursor");
        return null;
    }

    return extractTweetData(tweetEl);
}


/**
 * Finds the OP (first tweet on the page)
 */
function findMainTweet() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (tweets.length === 0) return null;

    return extractTweetData(tweets[0]);
}

/**
 * Finds the "current" tweet - either the one under cursor or closest to viewport center
 * This is what Alt+A should copy (not the OP)
 */
function findCurrentTweet() {
    // First, try to find tweet under cursor
    const tweetUnderCursor = findTweetUnderCursor();
    if (tweetUnderCursor) {
        console.log("[Twitter Shortcuts] Found tweet under cursor");
        return tweetUnderCursor;
    }

    // Fallback: find the tweet closest to the center of the viewport
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (tweets.length === 0) return null;

    const viewportCenter = window.innerHeight / 2;
    let closestTweet = null;
    let closestDistance = Infinity;

    for (const tweet of tweets) {
        const rect = tweet.getBoundingClientRect();
        const tweetCenter = rect.top + rect.height / 2;
        const distance = Math.abs(tweetCenter - viewportCenter);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestTweet = tweet;
        }
    }

    if (closestTweet) {
        console.log("[Twitter Shortcuts] Found tweet closest to viewport center");
        return extractTweetData(closestTweet);
    }

    return null;
}

/**
 * Checks if a name has meaningful alphanumeric content (not just emojis/symbols)
 */
function hasAlphanumericContent(str) {
    if (!str) return false;
    // Check if string contains at least one letter or number
    return /[a-zA-Z0-9]/.test(str);
}

/**
 * Extracts tweet data from a tweet article element
 */
function extractTweetData(tweetEl) {
    if (!tweetEl) return null;

    // Build URL map from anchor tags in the tweet
    const urlMap = new Map();
    const tweetTextEl = tweetEl.querySelector('[data-testid="tweetText"]');

    if (tweetTextEl) {
        const anchors = tweetTextEl.querySelectorAll('a[href]');
        for (const anchor of anchors) {
            const href = anchor.getAttribute('href');
            const displayText = anchor.innerText?.trim();

            // Skip @mentions and hashtags
            if (href && displayText && !href.startsWith('/') && !displayText.startsWith('@') && !displayText.startsWith('#')) {
                // Twitter uses t.co redirects, but the display text shows the actual domain
                // The href might be t.co/xxx or the actual URL
                // We want to map the display text to the full URL

                // If href is a t.co link, we need to check if there's a data attribute with the real URL
                let fullUrl = href;
                const expandedUrl = anchor.getAttribute('data-expanded-url') ||
                                   anchor.getAttribute('title') ||
                                   anchor.querySelector('[data-testid="linkUrl"]')?.textContent;

                if (expandedUrl && expandedUrl.startsWith('http')) {
                    fullUrl = expandedUrl;
                } else if (href.includes('t.co/')) {
                    // t.co redirect - the display text is usually the truncated real URL
                    // We'll use the display text as the URL base and expand it if possible
                    fullUrl = displayText.startsWith('http') ? displayText : 'https://' + displayText;
                }

                // Remove trailing ... from display text for matching
                const cleanDisplayText = displayText.replace(/\.{2,3}$/, '');
                urlMap.set(cleanDisplayText, fullUrl.replace(/\.{2,3}$/, ''));

                console.log("[URL Map] Display:", displayText, "→ Full:", fullUrl);
            }
        }
    }

    // Extract tweet text with URL processing
    const { text, html } = extractCleanTweetText(tweetTextEl, urlMap);
    let processedText = text;
    let processedHtml = html;

    // Trim trailing whitespace/newlines from text
    if (processedText) {
        processedText = processedText.trimEnd();
    }
    if (processedHtml) {
        processedHtml = processedHtml.trimEnd();
    }

    // Extract author name (display name, not @handle)
    const userNameSection = tweetEl.querySelector('[data-testid="User-Name"]');
    let displayName = null;
    let authorHandle = null;

    if (userNameSection) {
        // The display name is usually the first link's text content
        const nameLink = userNameSection.querySelector('a span');
        if (nameLink) {
            displayName = nameLink.innerText?.trim();
        }
        // Also get the @handle
        const handleLink = userNameSection.querySelector('a[href*="/"]');
        if (handleLink) {
            const href = handleLink.getAttribute('href');
            if (href && href.startsWith('/')) {
                authorHandle = '@' + href.slice(1).split('/')[0];
            }
        }
    }

    // Use display name if it has alphanumeric content, otherwise fall back to @handle
    let authorName = null;
    if (hasAlphanumericContent(displayName)) {
        authorName = displayName;
    } else if (authorHandle) {
        authorName = authorHandle;
        console.log("[Twitter Shortcuts] Display name is emoji-only, using handle:", authorHandle);
    }

    // Get tweet URL from permalink
    let tweetUrl = null;
    const timeLink = tweetEl.querySelector('a time')?.parentElement;
    if (timeLink && timeLink.href) {
        tweetUrl = timeLink.href.split('?')[0];
    } else {
        // Fallback: look for any status link
        const statusLink = tweetEl.querySelector('a[href*="/status/"]');
        if (statusLink) {
            tweetUrl = statusLink.href.split('?')[0];
        }
    }

    // Check for images in the tweet
    let imageUrls = [];
    const images = tweetEl.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const img of images) {
        if (img.src && !img.src.includes('emoji') && !img.src.includes('profile_images')) {
            imageUrls.push(img.src);
        }
    }

    return {
        text: processedText,
        html: processedHtml,
        authorName: authorName,
        authorHandle: authorHandle,
        url: tweetUrl,
        imageUrls: imageUrls,
        element: tweetEl  // Keep reference for ordering
    };
}

/**
 * Opens the Author Annotations page prefilled with the current tweet's author info
 */
async function openAnnotationForCurrentTweet() {
    try {
        const tweetData = findCurrentTweet();
        const name = tweetData?.authorName || '';
        const handle = tweetData?.authorHandle ? tweetData.authorHandle.replace(/^@/, '') : '';

        // Store prefill data in chrome.storage.local for the annotations page to pick up
        await chrome.storage.local.set({
            annotationPrefill: { name, handle, timestamp: Date.now() }
        });

        // Open the annotations page
        chrome.runtime.sendMessage({ action: 'open-author-annotations' });
        console.log("[Twitter Shortcuts] Opening annotation page for:", name, handle);
    } catch (err) {
        console.error("[Twitter Shortcuts] Error opening annotation:", err);
    }
}

/**
 * Looks up an author annotation from chrome.storage.sync
 * @param {string} authorName - Display name to match
 * @param {string|null} handle - Twitter @handle (with or without @)
 * @param {boolean} isTwitter - Whether we're on a Twitter page
 * @returns {Promise<{info: string, nameToShow: string|undefined}|null>} Annotation data, or null
 */
async function getAuthorAnnotation(authorName, handle, isTwitter) {
    try {
        const result = await chrome.storage.sync.get('authorAnnotations');
        const annotations = result.authorAnnotations || [];
        const cleanHandle = handle ? handle.replace(/^@/, '').toLowerCase() : null;
        const nameLower = authorName ? authorName.toLowerCase() : '';

        for (const ann of annotations) {
            if (ann.twitterOnly && !isTwitter) continue;
            if (ann.handleMatch && isTwitter && cleanHandle) {
                if (ann.handleMatch.toLowerCase() === cleanHandle) return { info: ann.info, nameToShow: ann.nameToShow };
            }
            if (ann.name.toLowerCase() === nameLower) return { info: ann.info, nameToShow: ann.nameToShow };
        }
    } catch (e) {
        console.error("[Twitter Shortcuts] Error looking up annotation:", e);
    }
    return null;
}

/**
 * Copies the current tweet (not the OP) with optional author
 */
async function copyCurrentTweet(includeAuthor = false) {
    try {
        const isTwitterPro = window.location.hostname.includes('pro.x.com');
        const tweetData = isTwitterPro ? findTweetUnderCursor() : findCurrentTweet();

        if (!tweetData || !tweetData.text) {
            console.log("[Twitter Shortcuts] Could not find current tweet");
            showNotification("Could not find tweet to copy", true);
            return;
        }

        if (includeAuthor && tweetData.authorName) {
            // Build HTML with linked author name and processed content
            // Use tweetData.html (with processed URLs) if available, otherwise fall back to text
            const tweetUrl = tweetData.url || window.location.href;
            const contentHtml = tweetData.html || tweetData.text;
            const authorAnnotation = await getAuthorAnnotation(tweetData.authorName, tweetData.authorHandle, true);
            const displayName = authorAnnotation?.nameToShow || tweetData.authorName;
            const infoText = authorAnnotation?.info ? ` (${authorAnnotation.info})` : '';
            const html = `<a href="${tweetUrl}">${displayName}</a>${infoText}: ${contentHtml}`;
            const plainText = `${displayName}${infoText}: ${tweetData.text}`;

            // Copy as both HTML and plain text
            const blob = new Blob([html], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });

            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': blob,
                    'text/plain': textBlob
                })
            ]);

            console.log("[Twitter Shortcuts] Copied current tweet with author:", plainText.substring(0, 100) + "...");
        } else {
            // Copy text and HTML (with processed URLs)
            const contentHtml = tweetData.html || tweetData.text;
            const blob = new Blob([contentHtml], { type: 'text/html' });
            const textBlob = new Blob([tweetData.text], { type: 'text/plain' });

            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': blob,
                    'text/plain': textBlob
                })
            ]);
            console.log("[Twitter Shortcuts] Copied current tweet:", tweetData.text.substring(0, 100) + "...");
        }

        showNotification("Tweet copied to clipboard!");

    } catch (error) {
        console.error("[Twitter Shortcuts] Error copying tweet:", error);
        showNotification("Error copying tweet", true);
    }
}

/**
 * Copies just the URL of the current tweet
 */
async function copyTweetUrl() {
    try {
        const isTwitterPro = window.location.hostname.includes('pro.x.com');
        const tweetData = isTwitterPro ? findTweetUnderCursor() : findCurrentTweet();

        if (!tweetData || !tweetData.url) {
            console.log("[Twitter Shortcuts] Could not find tweet URL");
            showNotification("Could not find tweet URL", true);
            return;
        }

        await navigator.clipboard.writeText(tweetData.url);
        console.log("[Twitter Shortcuts] Copied tweet URL:", tweetData.url);
        showNotification("URL copied to clipboard!");

    } catch (error) {
        console.error("[Twitter Shortcuts] Error copying URL:", error);
        showNotification("Error copying URL", true);
    }
}

/**
 * Finds all tweets in the thread from OP to current tweet
 */
function findThreadTweets() {
    const allTweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (allTweets.length === 0) return [];

    // Find the current tweet (where user is focused)
    const currentTweetData = findCurrentTweet();
    if (!currentTweetData) {
        // If we can't find current tweet, just return OP
        return [extractTweetData(allTweets[0])].filter(Boolean);
    }

    // Build list of tweets from OP to current
    const threadTweets = [];
    let foundCurrent = false;

    for (const tweetEl of allTweets) {
        const tweetData = extractTweetData(tweetEl);
        if (!tweetData) continue;

        threadTweets.push(tweetData);

        // Check if this is the current tweet
        if (currentTweetData.url && tweetData.url === currentTweetData.url) {
            foundCurrent = true;
            break;
        }

        // Also check by element reference
        if (currentTweetData.element && tweetEl === currentTweetData.element) {
            foundCurrent = true;
            break;
        }
    }

    // If we didn't find the current tweet, include all tweets
    if (!foundCurrent) {
        console.log("[Twitter Shortcuts] Current tweet not found in list, including all tweets");
    }

    return threadTweets;
}

/**
 * Formats multiple tweets as a thread, with smart author handling
 * Skips author name/link if same as previous tweet
 * Note: Images are not included as they don't transfer properly to other editors
 */
async function formatThread(tweets) {
    if (!tweets || tweets.length === 0) return { html: '', plainText: '' };

    let html = '';
    let plainText = '';
    let lastAuthor = null;

    for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        if (!tweet.text) continue;

        const isFirstTweet = i === 0;
        const sameAuthor = lastAuthor && tweet.authorName === lastAuthor;

        // Use processed HTML content if available, otherwise fall back to text
        const tweetHtml = tweet.html || tweet.text;

        if (sameAuthor && !isFirstTweet) {
            // Same author as previous - just add the text with a paragraph break
            html += `\n\n${tweetHtml}`;
            plainText += `\n\n${tweet.text}`;
        } else {
            // New author - include author name and link
            if (!isFirstTweet) {
                // Add extra spacing between different authors
                html += '\n\n';
                plainText += '\n\n';
            }

            if (tweet.authorName) {
                const tweetUrl = tweet.url || window.location.href;
                const authorAnnotation = await getAuthorAnnotation(tweet.authorName, tweet.authorHandle, true);
                const displayName = authorAnnotation?.nameToShow || tweet.authorName;
                const infoText = authorAnnotation?.info ? ` (${authorAnnotation.info})` : '';
                html += `<a href="${tweetUrl}">${displayName}</a>${infoText}: ${tweetHtml}`;
                plainText += `${displayName}${infoText}: ${tweet.text}`;
                lastAuthor = tweet.authorName;
            } else {
                html += tweetHtml;
                plainText += tweet.text;
            }
        }
    }

    // Trim trailing whitespace/newlines
    return { html: html.trimEnd(), plainText: plainText.trimEnd() };
}

/**
 * Copies the entire thread (OP + replies up to current tweet) with smart author handling
 */
async function copyThread() {
    try {
        const threadTweets = findThreadTweets();

        if (threadTweets.length === 0) {
            console.log("[Twitter Shortcuts] No tweets found in thread");
            showNotification("Could not find tweets to copy", true);
            return;
        }

        console.log("[Twitter Shortcuts] Found", threadTweets.length, "tweets in thread");

        const { html, plainText } = await formatThread(threadTweets);

        if (!plainText) {
            showNotification("No tweet content to copy", true);
            return;
        }

        // Copy as both HTML and plain text
        const blob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });

        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            })
        ]);

        const tweetCount = threadTweets.length;
        const authors = new Set(threadTweets.map(t => t.authorName).filter(Boolean));
        const authorCount = authors.size;

        console.log("[Twitter Shortcuts] Copied thread:", plainText.substring(0, 200) + "...");
        showNotification(`Thread copied! (${tweetCount} tweet${tweetCount > 1 ? 's' : ''}, ${authorCount} author${authorCount > 1 ? 's' : ''})`);

    } catch (error) {
        console.error("[Twitter Shortcuts] Error copying thread:", error);
        showNotification("Error copying thread", true);
    }
}

async function copyLastClosedTabUrl() {
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'get-last-closed-tab-url' }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(resp);
            });
        });

        if (response?.success && response.url) {
            await navigator.clipboard.writeText(response.url);
            const title = response.title || response.url;
            const display = title.length > 40 ? title.substring(0, 37) + '...' : title;
            showNotification(`Copied: ${display}`);
        } else {
            showNotification(response?.error || 'No recently closed tabs', true);
        }
    } catch (err) {
        console.error("[Twitter Shortcuts] Failed to get last closed tab:", err);
        showNotification("Failed to get last closed tab URL", true);
    }
}

function showNotification(message, isError = false) {
    // Create a simple notification div
    const existing = document.getElementById('twitter-shortcut-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'twitter-shortcut-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${isError ? '#f44336' : '#4caf50'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 2000);
}

console.log("[Twitter Shortcuts] Ready - ;c/Alt+C copy tweet, ;a/Alt+A tweet+author, ;s/Alt+S copy thread, ;q/Alt+Q copy URL, Alt+Click on pro.x.com to open in tab group");
