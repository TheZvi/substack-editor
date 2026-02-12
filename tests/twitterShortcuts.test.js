/**
 * Unit tests for twitter-shortcuts.js thread formatting
 * Run with: node tests/twitterShortcuts.test.js
 */

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected: ${JSON.stringify(expected)}`);
        console.log(`    Actual:   ${JSON.stringify(actual)}`);
        testsFailed++;
    }
}

function assertContains(actual, substring, message) {
    if (actual && actual.includes(substring)) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected to contain: ${substring}`);
        console.log(`    Actual: ${actual}`);
        testsFailed++;
    }
}

function assertNotContains(actual, substring, message) {
    if (!actual || !actual.includes(substring)) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected NOT to contain: ${substring}`);
        console.log(`    Actual: ${actual}`);
        testsFailed++;
    }
}

// ============================================================================
// formatThread function (copied from twitter-shortcuts.js for testing)
// ============================================================================

/**
 * Formats multiple tweets as a thread, with smart author handling
 * Skips author name/link if same as previous tweet
 * Includes images for each tweet in HTML output
 */
function formatThread(tweets) {
    if (!tweets || tweets.length === 0) return { html: '', plainText: '' };

    let html = '';
    let plainText = '';
    let lastAuthor = null;

    for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        if (!tweet.text) continue;

        const isFirstTweet = i === 0;
        const sameAuthor = lastAuthor && tweet.authorName === lastAuthor;

        if (sameAuthor && !isFirstTweet) {
            // Same author as previous - just add the text with a paragraph break
            html += `\n\n${tweet.text}`;
            plainText += `\n\n${tweet.text}`;
        } else {
            // New author - include author name and link
            if (!isFirstTweet) {
                // Add extra spacing between different authors
                html += '\n\n';
                plainText += '\n\n';
            }

            if (tweet.authorName) {
                const tweetUrl = tweet.url || 'https://x.com';
                html += `<a href="${tweetUrl}">${tweet.authorName}</a>: ${tweet.text}`;
                plainText += `${tweet.authorName}: ${tweet.text}`;
                lastAuthor = tweet.authorName;
            } else {
                html += tweet.text;
                plainText += tweet.text;
            }
        }

        // Add images for this tweet (HTML only)
        if (tweet.imageUrls && tweet.imageUrls.length > 0) {
            for (const imgUrl of tweet.imageUrls) {
                html += `<br><img src="${imgUrl}">`;
            }
        }
    }

    // Trim trailing whitespace/newlines
    return { html: html.trimEnd(), plainText: plainText.trimEnd() };
}

/**
 * Checks if a name has meaningful alphanumeric content (not just emojis/symbols)
 */
function hasAlphanumericContent(str) {
    if (!str) return false;
    // Check if string contains at least one letter or number
    return /[a-zA-Z0-9]/.test(str);
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n=== Twitter Shortcuts Unit Tests ===\n');

// ============================================================================
// formatThread Tests
// ============================================================================

console.log('=== formatThread Tests ===\n');

console.log('Test 1: Single tweet with author');
{
    const tweets = [
        { text: 'This is a single tweet.', authorName: 'John Doe', url: 'https://x.com/john/status/123' }
    ];
    const result = formatThread(tweets);
    assertEqual(result.plainText, 'John Doe: This is a single tweet.', 'Plain text has author');
    assertContains(result.html, '<a href="https://x.com/john/status/123">John Doe</a>', 'HTML has linked author');
}

console.log('\nTest 2: Two tweets from same author - author not repeated');
{
    const tweets = [
        { text: 'First tweet from me.', authorName: 'John Doe', url: 'https://x.com/john/status/1' },
        { text: 'Second tweet from me.', authorName: 'John Doe', url: 'https://x.com/john/status/2' }
    ];
    const result = formatThread(tweets);

    // Count how many times "John Doe:" appears
    const authorCount = (result.plainText.match(/John Doe:/g) || []).length;
    assertEqual(authorCount, 1, 'Author name appears only once');
    assertContains(result.plainText, 'First tweet from me.', 'First tweet present');
    assertContains(result.plainText, 'Second tweet from me.', 'Second tweet present');
}

console.log('\nTest 3: Three tweets from same author - author not repeated');
{
    const tweets = [
        { text: 'Tweet 1', authorName: 'Alice', url: 'https://x.com/alice/status/1' },
        { text: 'Tweet 2', authorName: 'Alice', url: 'https://x.com/alice/status/2' },
        { text: 'Tweet 3', authorName: 'Alice', url: 'https://x.com/alice/status/3' }
    ];
    const result = formatThread(tweets);

    const authorCount = (result.plainText.match(/Alice:/g) || []).length;
    assertEqual(authorCount, 1, 'Author name appears only once for 3 tweets');

    // Verify all tweets are present
    assertContains(result.plainText, 'Tweet 1', 'Tweet 1 present');
    assertContains(result.plainText, 'Tweet 2', 'Tweet 2 present');
    assertContains(result.plainText, 'Tweet 3', 'Tweet 3 present');
}

console.log('\nTest 4: Two tweets from different authors - both have author names');
{
    const tweets = [
        { text: 'Original post here.', authorName: 'Alice', url: 'https://x.com/alice/status/1' },
        { text: 'Reply from me!', authorName: 'Bob', url: 'https://x.com/bob/status/2' }
    ];
    const result = formatThread(tweets);

    assertContains(result.plainText, 'Alice: Original post here.', 'First author present');
    assertContains(result.plainText, 'Bob: Reply from me!', 'Second author present');
}

console.log('\nTest 5: OP -> Reply -> OP reply (author alternates)');
{
    const tweets = [
        { text: 'I have a question.', authorName: 'Alice', url: 'https://x.com/alice/status/1' },
        { text: 'Here is the answer.', authorName: 'Bob', url: 'https://x.com/bob/status/2' },
        { text: 'Thanks for the answer!', authorName: 'Alice', url: 'https://x.com/alice/status/3' }
    ];
    const result = formatThread(tweets);

    // All three authors should be named (Alice changes back)
    const aliceCount = (result.plainText.match(/Alice:/g) || []).length;
    const bobCount = (result.plainText.match(/Bob:/g) || []).length;
    assertEqual(aliceCount, 2, 'Alice named twice (before and after Bob)');
    assertEqual(bobCount, 1, 'Bob named once');
}

console.log('\nTest 6: Complex thread - OP with multiple self-replies, then other person');
{
    const tweets = [
        { text: 'Thread start (1/3)', authorName: 'Threadmaster', url: 'https://x.com/tm/status/1' },
        { text: 'Continuing (2/3)', authorName: 'Threadmaster', url: 'https://x.com/tm/status/2' },
        { text: 'End of thread (3/3)', authorName: 'Threadmaster', url: 'https://x.com/tm/status/3' },
        { text: 'Great thread!', authorName: 'Fan', url: 'https://x.com/fan/status/4' }
    ];
    const result = formatThread(tweets);

    // Threadmaster should only be named once
    const tmCount = (result.plainText.match(/Threadmaster:/g) || []).length;
    assertEqual(tmCount, 1, 'Threadmaster named only once');

    // Fan should be named
    const fanCount = (result.plainText.match(/Fan:/g) || []).length;
    assertEqual(fanCount, 1, 'Fan named once');

    // All tweets present
    assertContains(result.plainText, 'Thread start (1/3)', 'Tweet 1 present');
    assertContains(result.plainText, 'Continuing (2/3)', 'Tweet 2 present');
    assertContains(result.plainText, 'End of thread (3/3)', 'Tweet 3 present');
    assertContains(result.plainText, 'Great thread!', 'Tweet 4 present');
}

console.log('\nTest 7: User scenario from bug report');
{
    // OP: prerat posts about Terminator
    // Reply: Radek replies about doomposting
    // User is on Radek's reply and presses Alt+A - should copy Radek's tweet, not prerat's

    // This test verifies the thread format when Alt+S is used
    const tweets = [
        { text: 'going back in time to stop james cameron from making The Terminator', authorName: 'prerat', url: 'https://x.com/prerat/status/1' },
        { text: 'I always said that doomposting is the real danger', authorName: 'Radek Pilar', url: 'https://x.com/mrkvak/status/2' }
    ];
    const result = formatThread(tweets);

    assertContains(result.plainText, 'prerat: going back in time', 'OP content with author');
    assertContains(result.plainText, 'Radek Pilar: I always said', 'Reply content with author');
}

console.log('\nTest 8: Empty tweet list');
{
    const tweets = [];
    const result = formatThread(tweets);
    assertEqual(result.plainText, '', 'Empty list returns empty string');
    assertEqual(result.html, '', 'Empty list returns empty HTML');
}

console.log('\nTest 9: Tweets with no text are skipped');
{
    const tweets = [
        { text: 'First tweet', authorName: 'Alice', url: 'https://x.com/alice/status/1' },
        { text: '', authorName: 'Bob', url: 'https://x.com/bob/status/2' },  // Empty text
        { text: 'Third tweet', authorName: 'Charlie', url: 'https://x.com/charlie/status/3' }
    ];
    const result = formatThread(tweets);

    assertContains(result.plainText, 'Alice: First tweet', 'First tweet present');
    assertContains(result.plainText, 'Charlie: Third tweet', 'Third tweet present');
    assertNotContains(result.plainText, 'Bob:', 'Empty tweet skipped');
}

console.log('\nTest 10: Tweets with null text are skipped');
{
    const tweets = [
        { text: 'Has text', authorName: 'Alice', url: 'https://x.com/alice/status/1' },
        { text: null, authorName: 'Bob', url: 'https://x.com/bob/status/2' },
        { authorName: 'Charlie', url: 'https://x.com/charlie/status/3' }  // No text property
    ];
    const result = formatThread(tweets);

    const authorCount = (result.plainText.match(/:/g) || []).length;
    assertEqual(authorCount, 1, 'Only one author (others skipped)');
}

console.log('\nTest 11: HTML links are properly formed');
{
    const tweets = [
        { text: 'Test tweet', authorName: 'TestUser', url: 'https://x.com/testuser/status/12345' }
    ];
    const result = formatThread(tweets);

    assertContains(result.html, '<a href="https://x.com/testuser/status/12345">TestUser</a>:', 'Proper link format');
}

console.log('\nTest 12: Paragraph breaks between tweets');
{
    const tweets = [
        { text: 'First', authorName: 'Alice', url: 'https://x.com/a/1' },
        { text: 'Second', authorName: 'Alice', url: 'https://x.com/a/2' }
    ];
    const result = formatThread(tweets);

    assertContains(result.plainText, '\n\n', 'Has paragraph break between tweets');
}

console.log('\nTest 13: Long thread with alternating authors');
{
    const tweets = [
        { text: 'A1', authorName: 'A', url: 'u1' },
        { text: 'B1', authorName: 'B', url: 'u2' },
        { text: 'A2', authorName: 'A', url: 'u3' },
        { text: 'B2', authorName: 'B', url: 'u4' },
        { text: 'C1', authorName: 'C', url: 'u5' }
    ];
    const result = formatThread(tweets);

    // Each author switch should include the name
    const aCount = (result.plainText.match(/\bA:/g) || []).length;
    const bCount = (result.plainText.match(/\bB:/g) || []).length;
    const cCount = (result.plainText.match(/\bC:/g) || []).length;

    assertEqual(aCount, 2, 'A appears twice (at start and after B)');
    assertEqual(bCount, 2, 'B appears twice (after A each time)');
    assertEqual(cCount, 1, 'C appears once');
}

console.log('\nTest 14: Tweet without author name');
{
    const tweets = [
        { text: 'Tweet with no author', url: 'https://x.com/status/1' }
    ];
    const result = formatThread(tweets);

    assertEqual(result.plainText, 'Tweet with no author', 'Text without author prefix');
    assertNotContains(result.plainText, ':', 'No colon when no author');
}

console.log('\nTest 15: Mix of tweets with and without authors');
{
    const tweets = [
        { text: 'First with author', authorName: 'Alice', url: 'u1' },
        { text: 'No author here', url: 'u2' },
        { text: 'Back to author', authorName: 'Bob', url: 'u3' }
    ];
    const result = formatThread(tweets);

    assertContains(result.plainText, 'Alice: First with author', 'First tweet has author');
    assertContains(result.plainText, 'No author here', 'Second tweet present');
    assertContains(result.plainText, 'Bob: Back to author', 'Third tweet has author');
}

console.log('\nTest 16: Tweet with images - images in HTML only');
{
    const tweets = [
        {
            text: 'Check out this image!',
            authorName: 'Alice',
            url: 'https://x.com/alice/status/1',
            imageUrls: ['https://pbs.twimg.com/media/abc123.jpg']
        }
    ];
    const result = formatThread(tweets);

    assertContains(result.html, '<img src="https://pbs.twimg.com/media/abc123.jpg">', 'Image tag in HTML');
    assertNotContains(result.plainText, 'pbs.twimg.com', 'No image URL in plain text');
}

console.log('\nTest 17: Tweet with multiple images');
{
    const tweets = [
        {
            text: 'Multiple pics!',
            authorName: 'Bob',
            url: 'https://x.com/bob/status/2',
            imageUrls: [
                'https://pbs.twimg.com/media/img1.jpg',
                'https://pbs.twimg.com/media/img2.jpg'
            ]
        }
    ];
    const result = formatThread(tweets);

    assertContains(result.html, 'src="https://pbs.twimg.com/media/img1.jpg"', 'First image in HTML');
    assertContains(result.html, 'src="https://pbs.twimg.com/media/img2.jpg"', 'Second image in HTML');
}

console.log('\nTest 18: Thread with images - mixed tweets');
{
    const tweets = [
        {
            text: 'Post with image',
            authorName: 'Alice',
            url: 'u1',
            imageUrls: ['https://pbs.twimg.com/media/pic1.jpg']
        },
        {
            text: 'Post without image',
            authorName: 'Alice',
            url: 'u2'
        },
        {
            text: 'Another post with image',
            authorName: 'Bob',
            url: 'u3',
            imageUrls: ['https://pbs.twimg.com/media/pic2.jpg']
        }
    ];
    const result = formatThread(tweets);

    assertContains(result.html, 'pic1.jpg', 'First image present');
    assertContains(result.html, 'pic2.jpg', 'Third tweet image present');
    assertContains(result.html, 'Post without image', 'Text-only tweet present');
}

console.log('\nTest 19: Empty imageUrls array should not add tags');
{
    const tweets = [
        {
            text: 'No images here',
            authorName: 'Alice',
            url: 'u1',
            imageUrls: []
        }
    ];
    const result = formatThread(tweets);

    assertNotContains(result.html, '<img', 'No img tag when imageUrls is empty');
}

// ============================================================================
// hasAlphanumericContent Tests
// ============================================================================

console.log('\n=== hasAlphanumericContent Tests ===\n');

console.log('Test 20: Normal name with letters');
{
    assertEqual(hasAlphanumericContent('Alice'), true, 'Normal name returns true');
    assertEqual(hasAlphanumericContent('Bob123'), true, 'Name with numbers returns true');
    assertEqual(hasAlphanumericContent('deepfates'), true, 'Lowercase name returns true');
}

console.log('\nTest 21: Emoji-only names');
{
    assertEqual(hasAlphanumericContent('🐻‍❄️🔵🪙'), false, 'Emoji-only returns false');
    assertEqual(hasAlphanumericContent('😀😎🎉'), false, 'Multiple emojis returns false');
    assertEqual(hasAlphanumericContent('⭐'), false, 'Single emoji returns false');
}

console.log('\nTest 22: Mixed names (emoji + text)');
{
    assertEqual(hasAlphanumericContent('🐻 Bob'), true, 'Emoji + name returns true');
    assertEqual(hasAlphanumericContent('Alice 🎉'), true, 'Name + emoji returns true');
    assertEqual(hasAlphanumericContent('🔥Tech🔥'), true, 'Emoji + text + emoji returns true');
}

console.log('\nTest 23: Empty/null/undefined');
{
    assertEqual(hasAlphanumericContent(''), false, 'Empty string returns false');
    assertEqual(hasAlphanumericContent(null), false, 'Null returns false');
    assertEqual(hasAlphanumericContent(undefined), false, 'Undefined returns false');
}

console.log('\nTest 24: Whitespace only');
{
    assertEqual(hasAlphanumericContent('   '), false, 'Whitespace only returns false');
    assertEqual(hasAlphanumericContent('\n\t'), false, 'Tab/newline only returns false');
}

console.log('\nTest 25: Symbols only (not emojis)');
{
    assertEqual(hasAlphanumericContent('★☆♠♥'), false, 'Symbol-only returns false');
    assertEqual(hasAlphanumericContent('~!@#$%'), false, 'Punctuation-only returns false');
}

// ============================================================================
// Trailing newline trimming tests
// ============================================================================

console.log('\n=== Trailing Newline Tests ===\n');

console.log('Test 26: Tweet text with trailing newlines is trimmed');
{
    const tweets = [
        { text: 'Hello world\n\n', authorName: 'Alice', url: 'u1' }
    ];
    const result = formatThread(tweets);
    assertNotContains(result.plainText, '\n\n\n', 'No trailing newlines in plain text');
    assertEqual(result.plainText.endsWith('world'), true, 'Plain text ends with content, not newlines');
}

console.log('\nTest 27: Thread output is trimmed');
{
    const tweets = [
        { text: 'First tweet\n', authorName: 'Alice', url: 'u1' },
        { text: 'Second tweet\n\n', authorName: 'Alice', url: 'u2' }
    ];
    const result = formatThread(tweets);
    assertEqual(result.plainText.endsWith('tweet'), true, 'Thread ends with content');
    assertEqual(result.html.endsWith('tweet'), true, 'HTML ends with content');
}

// ============================================================================
// URL Processing Tests
// ============================================================================

// Labels that indicate a link follows (case-insensitive matching)
const URL_LABEL_PATTERNS = [
    'more', 'read more', 'see more', 'full article', 'full thread',
    'link', 'article', 'source', 'via', 'github', 'repo', 'code',
    'blog', 'post', 'thread', 'paper', 'study', 'video', 'watch',
    'listen', 'podcast', 'newsletter', 'substack', 'details', 'info'
];

/**
 * Processes URLs in tweet text (copied from twitter-shortcuts.js for testing)
 */
function processUrlsInText(text, urlMap) {
    if (!text) return { text: '', html: '' };

    let processedText = text;

    // Step 1: Join "https://" or "http://" that got separated from domain by newline/space
    processedText = processedText.replace(/(https?:\/\/)\s*\n\s*/gi, '$1');

    // Step 2: Join URL path segments broken across lines
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
    processedText = processedText.replace(/(\S+\.(?:com|org|net|io|co|edu|gov|ai|dev|app|me|cc|gg|tv|fm|ly|to|uk|de|fr|jp)[^\s]*?)(?:\.{2,3}|…)(?=\s|$)/gi, '$1');

    // Step 5: Join label: followed by newline and URL
    processedText = processedText.replace(/:\s*\n\s*(https?:\/\/)/gi, ': $1');
    processedText = processedText.replace(/:\s*\n\s*((?:[a-z0-9-]+\.)+[a-z]{2,})/gi, ': $1');

    // Step 6: Replace truncated URLs with full URLs from the map
    if (urlMap && urlMap.size > 0) {
        for (const [displayUrl, fullUrl] of urlMap) {
            processedText = processedText.replace(displayUrl, fullUrl);
        }
    }

    // Track which URLs have been processed (to avoid double-linking)
    const processedUrls = new Set();

    // Step 7: Special case - "X here:" followed by URL → "X here." with "here" linked
    const herePatternRegex = /(\S.*?)\s+(here)\s*:\s*(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

    // Start building HTML from text (before we modify processedText)
    let processedHtml = processedText;

    // Process "here:" patterns
    const hereMatches = [...processedText.matchAll(herePatternRegex)];
    for (const match of hereMatches) {
        const fullMatch = match[0];
        const prefix = match[1];
        let url = match[3];

        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        processedUrls.add(url);
        processedUrls.add(match[3]);

        processedText = processedText.replace(fullMatch, `${prefix} here.`);
        processedHtml = processedHtml.replace(fullMatch, `${prefix} <a href="${url}">here</a>.`);
    }

    // Step 8: Find "Label: URL" patterns and transform to "Label [here]."
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

            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            processedUrls.add(url);
            processedUrls.add(match[2]);

            processedText = processedText.replace(fullMatch, `${label} [here].`);
            processedHtml = processedHtml.replace(fullMatch, `${label} <a href="${url}">[here]</a>.`);
        }
    }

    // Step 9: Make remaining URLs into clickable links (for HTML only)
    processedHtml = processedHtml.replace(/(https?:\/\/[^\s<>"]+)/g, (match, url, offset, string) => {
        if (processedUrls.has(match)) {
            return match;
        }
        const preceding = string.substring(Math.max(0, offset - 10), offset);
        if (preceding.includes('href="') || preceding.includes("href='") || preceding.includes('">')) {
            return match;
        }
        const domainMatch = match.match(/https?:\/\/(.+)/);
        if (domainMatch) {
            processedUrls.add(domainMatch[1]);
        }
        processedUrls.add(match);
        return `<a href="${match}">${match}</a>`;
    });

    // Also handle URLs without protocol (domain.com/path format) that aren't labeled
    processedHtml = processedHtml.replace(/((?:[a-z0-9-]+\.)+(?:com|org|net|io|co|edu|gov|ai|dev|app|me|cc|gg|tv|fm|ly|to|uk|de|fr|jp)\/[^\s<>"]+)/gi, (match, url, offset, string) => {
        if (processedUrls.has(match) || processedUrls.has('https://' + match)) {
            return match;
        }
        const preceding = string.substring(Math.max(0, offset - 10), offset);
        if (preceding.includes('href="') || preceding.includes("href='") || preceding.includes('">')) {
            return match;
        }
        return `<a href="https://${match}">${match}</a>`;
    });

    return { text: processedText, html: processedHtml };
}

console.log('\n=== URL Processing Tests ===\n');

console.log('Test 28: Remove trailing ... from URLs');
{
    const input = 'Check this out: https://example.com/article...';
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '...', 'Trailing dots removed from text');
    assertContains(result.text, 'https://example.com/article', 'URL preserved');
}

console.log('\nTest 29: Remove trailing ... from domain URLs (no label)');
{
    const input = 'Check out seconds0.substack.com/p/heres-whats-next...';
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '...', 'Trailing dots removed');
    assertContains(result.text, 'seconds0.substack.com/p/heres-whats-next', 'URL preserved');
}

console.log('\nTest 30: Join URLs broken across lines (no label)');
{
    const input = 'Check out https://example.com/very-long-path-\ncontinued-here for details';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'https://example.com/very-long-path-continued-here', 'URL joined across lines');
}

console.log('\nTest 31: "More:" + URL transforms to "More [here]."');
{
    const input = 'Great article! More: https://example.com/article';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'More [here].', 'Text has "More [here]."');
    assertNotContains(result.text, 'https://example.com', 'URL removed from text');
    assertContains(result.html, '<a href="https://example.com/article">[here]</a>', 'HTML has linked [here]');
}

console.log('\nTest 32: "Read more:" transforms correctly');
{
    const input = 'Interesting thread. Read more: https://example.com/thread';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Read more [here].', 'Text has "Read more [here]."');
    assertContains(result.html, '<a href="https://example.com/thread">[here]</a>', 'HTML has linked [here]');
}

console.log('\nTest 33: "Github:" transforms correctly');
{
    const input = 'Check out the code. Github: https://github.com/user/repo';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Github [here].', 'Text has "Github [here]."');
    assertContains(result.html, '<a href="https://github.com/user/repo">[here]</a>', 'HTML has linked [here]');
}

console.log('\nTest 34: "Link:" transforms correctly');
{
    const input = 'Full details. Link: https://example.com/details';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Link [here].', 'Text has "Link [here]."');
}

console.log('\nTest 35: URL without label becomes clickable link in HTML');
{
    const input = 'Check out https://example.com/page for more info';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'https://example.com/page', 'Text preserves URL');
    assertContains(result.html, '<a href="https://example.com/page">https://example.com/page</a>', 'HTML has clickable link');
}

console.log('\nTest 36: Domain URL without protocol becomes link');
{
    const input = 'Visit example.com/page for details';
    const result = processUrlsInText(input, null);
    assertContains(result.html, '<a href="https://example.com/page">example.com/page</a>', 'Domain URL becomes link');
}

console.log('\nTest 37: Multiple label+URL patterns');
{
    const input = 'Great resources! Article: https://example.com/article Github: https://github.com/repo';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Article [here].', 'First label transformed');
    assertContains(result.text, 'Github [here].', 'Second label transformed');
}

console.log('\nTest 38: Full tweet example - "More:" with truncated URL');
{
    const input = `Best of N is going to be the hack the token-rich will be able to use.

More: seconds0.substack.com/p/heres-whats-...`;
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'More [here].', 'More transformed to [here]');
    assertNotContains(result.text, '...', 'Dots removed');
    assertNotContains(result.text, 'seconds0.substack.com', 'URL removed from text');
    assertContains(result.html, '<a href="https://seconds0.substack.com/p/heres-whats-">[here]</a>', 'HTML has link');
}

console.log('\nTest 39: Case insensitive label matching');
{
    const input = 'MORE: https://example.com/page';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'MORE [here].', 'Uppercase MORE works');
}

console.log('\nTest 40: Label with extra spaces');
{
    const input = 'More:   https://example.com/page';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'More [here].', 'Extra spaces handled');
}

console.log('\nTest 41: URL map replaces truncated URLs');
{
    const urlMap = new Map();
    urlMap.set('seconds0.substack.com/p/heres-whats', 'https://seconds0.substack.com/p/heres-whats-next-in-agentic-coding');

    const input = 'More: seconds0.substack.com/p/heres-whats';
    const result = processUrlsInText(input, urlMap);
    assertContains(result.html, 'heres-whats-next-in-agentic-coding', 'Full URL used from map');
}

console.log('\nTest 42: Text without URLs unchanged');
{
    const input = 'This is just regular text without any links.';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, input, 'Text unchanged');
}

console.log('\nTest 43: Preserve non-URL colons');
{
    const input = 'Time: 3:00 PM. More: https://example.com/event';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Time: 3:00 PM', 'Non-URL colon preserved');
    assertContains(result.text, 'More [here].', 'URL label still works');
}

console.log('\nTest 44: Substack URL handling');
{
    const input = 'Newsletter: https://newsletter.substack.com/p/article-title';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Newsletter [here].', 'Newsletter label works');
    assertContains(result.html, 'substack.com/p/article-title', 'Substack URL in link');
}

console.log('\nTest 45: "Full article:" label');
{
    const input = 'Full article: https://example.com/full';
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Full article [here].', 'Full article label works');
}

console.log('\nTest 46: URL at end of sentence with period');
{
    const input = 'Check this https://example.com/page.';
    const result = processUrlsInText(input, null);
    // The period after the URL should be preserved
    assertContains(result.html, '<a href="https://example.com/page.">', 'URL with trailing period linked');
}

// ============================================================================
// Real-world URL breaking scenarios (from user bug report)
// ============================================================================

console.log('\n=== Real-world URL Breaking Tests ===\n');

console.log('Test 47: https:// separated from domain by newline');
{
    const input = `Blog post: On the Coming Industrialisation of Exploit Generation with LLMs
https://
sean.heelan.io/2026/01/18/on-the-coming-industrialisation`;
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'https://sean.heelan.io/2026/01/18/on-the-coming-industrialisation', 'Protocol joined with domain');
    assertNotContains(result.text, 'https://\n', 'No newline after https://');
}

console.log('\nTest 48: URL path broken across multiple lines');
{
    const input = `sean.heelan.io/2026/01/18/on-
the-coming-industrialisation-of-exploit-generation-with-llms/`;
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'sean.heelan.io/2026/01/18/on-the-coming-industrialisation-of-exploit-generation-with-llms/', 'URL path segments joined');
}

console.log('\nTest 49: Standalone ... on own line removed');
{
    const input = `Check out github.com/SeanHeelan/ana
mnesis-release
...`;
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '...', 'Standalone ... removed');
    assertNotContains(result.text, '\n...', 'No newline-dots pattern');
}

console.log('\nTest 50: Full real-world tweet with broken URLs');
{
    const input = `Blog post: On the Coming Industrialisation of Exploit Generation with LLMs
https://
sean.heelan.io/2026/01/18/on-
the-coming-industrialisation-of-exploit-generation-with-llms/
...

TL;DR: I ran an experiment with GPT-5.2 and Opus 4.5 based agents to generate exploits for a zeroday QuickJS bug. They're pretty good at it.

Code:
https://
github.com/SeanHeelan/ana
mnesis-release
...`;
    const result = processUrlsInText(input, null);

    // Check first URL is properly joined
    assertContains(result.text, 'https://sean.heelan.io/2026/01/18/on-the-coming-industrialisation-of-exploit-generation-with-llms/', 'First URL fully joined');

    // Check second URL - "Code:" is a label pattern, so it transforms to "Code [here]."
    assertContains(result.text, 'Code [here].', 'Code label transformed to [here]');

    // Check no ... remains
    assertNotContains(result.text, '...', 'All truncation dots removed');

    // Check HTML has proper links
    assertContains(result.html, '<a href="https://sean.heelan.io/2026/01/18/on-the-coming-industrialisation-of-exploit-generation-with-llms/">', 'First URL is a proper link');
    assertContains(result.html, '<a href="https://github.com/SeanHeelan/anamnesis-release">[here]</a>', 'Second URL linked via [here]');
}

console.log('\nTest 51: Unicode ellipsis (…) removal');
{
    const input = `Check out github.com/user/repo
…`;
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '…', 'Unicode ellipsis removed');
}

console.log('\nTest 52: URL with path broken mid-word (not at hyphen)');
{
    const input = `github.com/SeanHeelan/ana
mnesis-release`;
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'github.com/SeanHeelan/anamnesis-release', 'Path joined mid-word');
}

// ============================================================================
// "X here:" pattern tests
// ============================================================================

console.log('\n=== "X here:" Pattern Tests ===\n');

console.log('Test 53: "Apply here:" transforms to "Apply here." with link');
{
    const input = 'Apply here: https://example.com/apply';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, 'Apply here.', 'Text becomes "Apply here."');
    assertContains(result.html, '<a href="https://example.com/apply">here</a>.', 'HTML has "here" as link');
    assertNotContains(result.html, '[here]', 'No brackets around "here"');
}

console.log('\nTest 54: "Register here:" transforms correctly');
{
    const input = 'Register here: https://event.com/register';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, 'Register here.', 'Text becomes "Register here."');
    assertContains(result.html, '<a href="https://event.com/register">here</a>.', 'HTML has linked here');
}

console.log('\nTest 55: "Sign up here:" transforms correctly');
{
    const input = 'Sign up here: https://signup.com/form';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, 'Sign up here.', 'Text becomes "Sign up here."');
    assertContains(result.html, '<a href="https://signup.com/form">here</a>.', 'HTML has linked here');
}

console.log('\nTest 56: Real-world "Apply here:" tweet with newline');
{
    const input = `Announcing Built with Opus 4.6: a Claude Code virtual hackathon.

Join the Claude Code team for a week of building. Winners will be hand-selected to win $100K in Claude API credits.

Apply here:
https://cerebralvalley.ai/e/claude-code-hackathon`;
    const result = processUrlsInText(input, null);
    assertContains(result.text, 'Apply here.', 'Text has "Apply here."');
    assertNotContains(result.text, 'cerebralvalley', 'URL removed from text');
    assertNotContains(result.text, '\nhttps://', 'URL not on separate line');
    assertContains(result.html, '<a href="https://cerebralvalley.ai/e/claude-code-hackathon">here</a>.', 'HTML has linked here');
}

console.log('\nTest 57: Label colon-newline-URL joining');
{
    const input = `Check out the code:
https://github.com/user/repo`;
    const result = processUrlsInText(input, null);
    // "Code" is a label pattern, so it should transform
    assertContains(result.text, '[here].', 'Label pattern applied after newline joined');
}

console.log('\nTest 58: "here:" takes precedence over label patterns');
{
    // "Link here:" should use the "here" pattern, not the "link" label pattern
    const input = 'Link here: https://example.com/page';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, 'Link here.', 'Text becomes "Link here."');
    assertContains(result.html, '>here</a>.', 'here is the link text (not [here])');
}

console.log('\nTest 59: Domain URL without protocol in "here:" pattern');
{
    const input = 'Apply here: cerebralvalley.ai/e/hackathon';
    const result = processUrlsInText(input, null);
    assertEqual(result.text, 'Apply here.', 'Text transformation works');
    assertContains(result.html, '<a href="https://cerebralvalley.ai/e/hackathon">here</a>.', 'Protocol added to link');
}

// ============================================================================
// Standalone URL tests (not preceded by labels)
// ============================================================================

console.log('\n=== Standalone URL Tests ===\n');

console.log('Test 60: github.com URL with truncation becomes clickable link');
{
    const input = `Check out the repo

github.com/rohunvora/x-re...`;
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '...', 'Truncation dots removed');
    assertContains(result.text, 'github.com/rohunvora/x-re', 'URL preserved in text');
    assertContains(result.html, '<a href="https://github.com/rohunvora/x-re">github.com/rohunvora/x-re</a>', 'URL wrapped in link');
}

console.log('\nTest 61: .ai domain URL becomes clickable link');
{
    const input = 'Check out cerebralvalley.ai/e/claude-code-hackathon for details';
    const result = processUrlsInText(input, null);
    assertContains(result.html, '<a href="https://cerebralvalley.ai/e/claude-code-hackathon">cerebralvalley.ai/e/claude-code-hackathon</a>', '.ai domain linked');
}

console.log('\nTest 62: Multiple standalone URLs in text');
{
    const input = `Two great repos:

github.com/user/repo1...

And also github.com/user/repo2...`;
    const result = processUrlsInText(input, null);
    assertNotContains(result.text, '...', 'All truncation dots removed');
    assertContains(result.html, '<a href="https://github.com/user/repo1">github.com/user/repo1</a>', 'First URL linked');
    assertContains(result.html, '<a href="https://github.com/user/repo2">github.com/user/repo2</a>', 'Second URL linked');
}

console.log('\nTest 63: URL with .dev TLD');
{
    const input = 'Check out web.dev/articles/performance';
    const result = processUrlsInText(input, null);
    assertContains(result.html, '<a href="https://web.dev/articles/performance">web.dev/articles/performance</a>', '.dev domain linked');
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
