/**
 * Unit tests for smartPaste paragraph handling
 * Run with: node tests/smartPaste.test.js
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
        console.log(`    Expected: ${expected}`);
        console.log(`    Actual:   ${actual}`);
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

function assertMatch(actual, regex, message) {
    if (actual && regex.test(actual)) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected to match: ${regex}`);
        console.log(`    Actual: ${actual}`);
        testsFailed++;
    }
}

// The function under test (extracted and simplified from content.js smartPaste)
// Uses <br><br> between paragraphs for tighter spacing (Substack's CSS adds margins to <p> tags)
function buildBlockquoteHtml(textContent, htmlContent = null) {
    // Check if content looks like a quote (Name: text format)
    const isQuote = textContent && /^[^:]+:\s/.test(textContent);

    if (!isQuote) {
        return { isQuote: false, html: null };
    }

    // Check if HTML contains a link (from Alt+A copy)
    let linkHref = null;
    let linkText = null;
    if (htmlContent) {
        const linkMatch = htmlContent.match(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (linkMatch) {
            linkHref = linkMatch[1];
            linkText = linkMatch[2];
        }
    }

    // Normalize line endings: convert Windows \r\n and old Mac \r to Unix \n
    const normalizedText = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split by double newlines (paragraph breaks), filter empty, and trim each paragraph
    const paragraphs = normalizedText.split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    // Build content - use <br><br> between paragraphs to avoid extra margins
    // from Substack's CSS (separate <p> tags add too much vertical space)
    let content = paragraphs
        .map((p, index) => {
            let paragraphContent = p.replace(/\n/g, '<br>');

            // For the first paragraph, restore the link if we found one
            if (index === 0 && linkHref && linkText) {
                // Replace "AuthorName:" or "AuthorName (Info):" with linked version
                const colonIndex = paragraphContent.indexOf(':');
                if (colonIndex !== -1) {
                    const authorPart = paragraphContent.substring(0, colonIndex);
                    const restPart = paragraphContent.substring(colonIndex);
                    // Match exact name or name with annotation like "Name (Org)"
                    if (authorPart.trim() === linkText.trim()) {
                        paragraphContent = `<a href="${linkHref}">${authorPart}</a>${restPart}`;
                    } else if (authorPart.trim().startsWith(linkText.trim() + ' (')) {
                        // Author has annotation - link just the name, keep annotation outside
                        paragraphContent = `<a href="${linkHref}">${linkText}</a>${authorPart.substring(linkText.length)}${restPart}`;
                    }
                }
            }
            return paragraphContent;
        })
        .join('<br><br>');

    return {
        isQuote: true,
        html: `<blockquote><p>${content}</p></blockquote>`,
        paragraphCount: paragraphs.length
    };
}

// OLD implementation for comparison (the buggy version)
function buildBlockquoteHtmlOld(textContent, htmlContent = null) {
    const isQuote = textContent && /^[^:]+:\s/.test(textContent);

    if (!isQuote) {
        return { isQuote: false, html: null };
    }

    let linkHref = null;
    let linkText = null;
    if (htmlContent) {
        const linkMatch = htmlContent.match(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (linkMatch) {
            linkHref = linkMatch[1];
            linkText = linkMatch[2];
        }
    }

    const paragraphs = textContent.split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    // OLD: use <br><br> between paragraphs instead of separate <p> tags
    let content = paragraphs
        .map((p, index) => {
            let paragraphContent = p.replace(/\n/g, '<br>');

            if (index === 0 && linkHref && linkText) {
                const colonIndex = paragraphContent.indexOf(':');
                if (colonIndex !== -1) {
                    const authorPart = paragraphContent.substring(0, colonIndex);
                    const restPart = paragraphContent.substring(colonIndex);
                    if (authorPart.trim() === linkText.trim()) {
                        paragraphContent = `<a href="${linkHref}">${authorPart}</a>${restPart}`;
                    }
                }
            }
            return paragraphContent;
        })
        .join('<br><br>');  // OLD: joining with <br><br>

    return {
        isQuote: true,
        html: `<blockquote><p>${content}</p></blockquote>`,  // OLD: single <p> tag
        paragraphCount: paragraphs.length
    };
}

// Tests
console.log('\n=== smartPaste Paragraph Handling Unit Tests ===\n');

console.log('Test 1: Single paragraph quote');
{
    const text = 'John Smith: This is a single paragraph quote.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Detects quote format');
    assertEqual(result.paragraphCount, 1, 'Counts 1 paragraph');
    assertContains(result.html, '<blockquote>', 'Has blockquote tag');
    assertContains(result.html, '<p>John Smith: This is a single paragraph quote.</p>', 'Has paragraph wrapped in <p> tag');
}

console.log('\nTest 2: Multi-paragraph quote - uses <br><br> for tighter spacing');
{
    const text = 'Author: First paragraph of the quote.\n\nSecond paragraph continues here.\n\nThird paragraph ends the quote.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Detects quote format');
    assertEqual(result.paragraphCount, 3, 'Counts 3 paragraphs');

    // Uses single <p> tag with <br><br> between paragraphs for tighter spacing in Substack
    const pTagCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pTagCount, 1, 'Single <p> tag (avoids Substack CSS margins)');
    assertContains(result.html, 'First paragraph of the quote.<br><br>Second paragraph', 'Paragraphs separated by <br><br>');
    assertContains(result.html, 'continues here.<br><br>Third paragraph', 'All paragraphs separated by <br><br>');
}

console.log('\nTest 3: OLD behavior (no line ending normalization) - fails on Windows');
{
    const text = 'Author: First paragraph of the quote.\n\nSecond paragraph continues here.\n\nThird paragraph ends the quote.';
    const resultOld = buildBlockquoteHtmlOld(text);

    // OLD implementation has same structure but lacks line ending normalization
    assertContains(resultOld.html, '<br><br>', 'OLD: Has <br><br> between paragraphs');
    assertContains(resultOld.html, '<blockquote><p>', 'OLD: Has single <p> tag');
    // The bug was: Windows \r\n line endings weren't normalized, causing split to fail
}

console.log('\nTest 4: Verify paragraph count and <br><br> separators');
{
    const text = 'Author: Para 1.\n\nPara 2.\n\nPara 3.\n\nPara 4.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 4, 'Reports 4 paragraphs');

    // Count <br><br> separators (should be paragraphCount - 1)
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 3, 'Has 3 <br><br> separators between 4 paragraphs');
}

console.log('\nTest 5: Preserves single newlines within paragraphs as <br>');
{
    const text = 'Author: First line of paragraph.\nSecond line of same paragraph.\n\nSecond paragraph here.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 2, 'Counts 2 paragraphs');
    assertContains(result.html, 'First line of paragraph.<br>Second line of same paragraph.', 'Single newline converted to <br>');
    assertContains(result.html, 'same paragraph.<br><br>Second paragraph', 'Double newline becomes <br><br>');
}

console.log('\nTest 6: Multiple double-newlines are treated as single paragraph break');
{
    const text = 'Author: First paragraph.\n\n\n\nSecond paragraph after many newlines.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 2, 'Multiple newlines still create just 2 paragraphs');

    // Should still be just one <br><br> between them
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 1, 'Only 1 <br><br> even with many newlines');
}

console.log('\nTest 7: Empty paragraphs are filtered out');
{
    const text = 'Author: First paragraph.\n\n   \n\nSecond paragraph.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 2, 'Empty/whitespace paragraphs filtered');
}

console.log('\nTest 8: Non-quote format returns null');
{
    const text = 'This is just regular text without the quote format.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, false, 'Does not detect as quote');
    assertEqual(result.html, null, 'Returns null HTML');
}

console.log('\nTest 9: Quote with link preserved in first paragraph');
{
    const text = 'John Smith: This is the quote content.\n\nSecond paragraph.';
    const html = '<a href="https://example.com/john">John Smith</a>: This is the quote content.';
    const result = buildBlockquoteHtml(text, html);

    assertContains(result.html, '<a href="https://example.com/john">John Smith</a>:', 'Link restored in first paragraph');
    assertContains(result.html, '<br><br>Second paragraph', 'Second paragraph after <br><br>');
}

console.log('\nTest 10: Quote with trailing/leading whitespace');
{
    const text = '  Author: First paragraph.  \n\n  Second paragraph.  ';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 2, 'Handles whitespace correctly');
    assertContains(result.html, 'Author: First paragraph.<br><br>Second paragraph.', 'Paragraphs trimmed and joined');
}

console.log('\nTest 11: Quote format with various colon positions');
{
    // Valid quote formats
    assertEqual(buildBlockquoteHtml('A: quote').isQuote, true, 'Single letter author works');
    assertEqual(buildBlockquoteHtml('Author Name: quote').isQuote, true, 'Multi-word author works');
    assertEqual(buildBlockquoteHtml('Author123: quote').isQuote, true, 'Author with numbers works');

    // Invalid (colon must have space after)
    assertEqual(buildBlockquoteHtml('http://example.com').isQuote, false, 'URL not detected as quote');
    assertEqual(buildBlockquoteHtml('No colon here').isQuote, false, 'No colon not detected as quote');
}

console.log('\nTest 12: Real-world multi-paragraph Twitter/social media quote');
{
    const text = `Eliezer Yudkowsky: The problem with AI safety is that most people think it's about the robots becoming "evil" in a human sense.

But that's not the concern at all. The concern is about optimization pressure and instrumental convergence.

A paperclip maximizer doesn't hate you, it just doesn't value you. And that's potentially worse.`;

    const result = buildBlockquoteHtml(text);
    assertEqual(result.paragraphCount, 3, 'Real-world quote has 3 paragraphs');

    // Verify paragraphs are separated by <br><br>
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Has 2 <br><br> separators between 3 paragraphs');

    // Verify content preserved
    assertContains(result.html, 'optimization pressure', 'Content preserved');
    assertContains(result.html, 'paperclip maximizer', 'All paragraphs present');
}

console.log('\nTest 13: Structure of blockquote HTML');
{
    const text = 'Author: Para 1.\n\nPara 2.';
    const result = buildBlockquoteHtml(text);

    // Should be: <blockquote><p>Para 1.<br><br>Para 2.</p></blockquote>
    // Single <p> tag with <br><br> between paragraphs for tighter Substack spacing
    assertMatch(result.html, /^<blockquote><p>.*<br><br>.*<\/p><\/blockquote>$/,
        'Structure is <blockquote><p>...<br><br>...</p></blockquote>');
}

// ============================================================================
// @ Symbol Handling Tests
// ============================================================================

console.log('\nTest 14: Twitter-style @username as author');
{
    const text = '@elaboratemouse: This is a quote from a Twitter user.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, '@username detected as valid quote format');
    assertContains(result.html, '<p>@elaboratemouse: This is a quote from a Twitter user.</p>', '@ symbol preserved in author');
}

console.log('\nTest 15: @username with multi-paragraph quote');
{
    const text = '@naval: First paragraph of wisdom.\n\nSecond paragraph continues the thought.\n\nThird paragraph concludes.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, '@username multi-paragraph detected as quote');
    assertEqual(result.paragraphCount, 3, 'Counts 3 paragraphs with @username author');
    assertContains(result.html, '@naval: First paragraph of wisdom.<br><br>Second paragraph', 'Paragraphs separated by <br><br>');
    assertContains(result.html, 'the thought.<br><br>Third paragraph', 'All paragraphs present');
}

console.log('\nTest 16: @ symbol in quote body (mentions)');
{
    const text = 'John: I was talking to @alice and @bob about this.\n\nThey both agreed with @charlie.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Quote with @ mentions in body detected');
    assertEqual(result.paragraphCount, 2, 'Counts 2 paragraphs');
    assertContains(result.html, '@alice', '@ mention preserved in body');
    assertContains(result.html, '@bob', 'Second @ mention preserved');
    assertContains(result.html, '@charlie', '@ mention in second paragraph preserved');
}

console.log('\nTest 17: Email address in author name');
{
    const text = 'john@example.com: This quote is attributed to an email address.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Email as author detected as quote');
    assertContains(result.html, 'john@example.com:', 'Email address preserved');
}

console.log('\nTest 18: Multiple @ symbols throughout');
{
    const text = '@user1: Replying to @user2 and @user3.\n\n@user4 also mentioned this to @user5.';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Multi-@ quote detected');
    assertEqual(result.paragraphCount, 2, 'Counts 2 paragraphs');

    // Count @ symbols in output
    const atCount = (result.html.match(/@/g) || []).length;
    assertEqual(atCount, 5, 'All 5 @ symbols preserved');
}

console.log('\nTest 19: @ at start without colon (not a quote)');
{
    const text = '@mention without any colon separator';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, false, 'Bare @mention not detected as quote');
}

console.log('\nTest 20: @username with link preservation');
{
    const text = '@twitteruser: This is the quote content.\n\nSecond paragraph here.';
    const html = '<a href="https://twitter.com/twitteruser">@twitteruser</a>: This is the quote content.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, '@username with link detected as quote');
    assertContains(result.html, '<a href="https://twitter.com/twitteruser">@twitteruser</a>:', 'Link with @ preserved');
    assertContains(result.html, '<br><br>Second paragraph here.', 'Second paragraph after <br><br>');
}

console.log('\nTest 21: Real-world Twitter thread quote with @mentions');
{
    const text = `@paulg: The best way to get startup ideas is to look for problems, preferably problems you have yourself.

If you can find something that's broken that you use every day, you've got a good chance of coming up with something people will pay for.

cc @sama @ycombinator`;

    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Real Twitter thread detected as quote');
    assertEqual(result.paragraphCount, 3, 'Has 3 paragraphs');
    assertContains(result.html, '@paulg:', 'Author @mention preserved');
    assertContains(result.html, '@sama', 'cc @mention preserved');
    assertContains(result.html, '@ycombinator', 'Second cc @mention preserved');

    // Verify <br><br> between paragraphs
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Has 2 <br><br> separators');
}

console.log('\nTest 22: @ symbol with special characters nearby');
{
    const text = '@user_name: Testing @under_scores and @with.dots.\n\n(@parenthetical @mention) and "quoted @mention"';
    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, '@ with special chars detected as quote');
    assertEqual(result.paragraphCount, 2, 'Counts 2 paragraphs');
    assertContains(result.html, '@user_name:', 'Underscore @ preserved');
    assertContains(result.html, '@under_scores', '@ with underscore in body preserved');
    assertContains(result.html, '@with.dots', '@ with dots preserved');
    assertContains(result.html, '(@parenthetical', 'Parenthetical @ preserved');
}

console.log('\nTest 23: Mixed @ formats in complex quote');
{
    const text = `@tech_insider: Breaking: @OpenAI just announced GPT-5.

Contact press@openai.com for more details.

Related: @AnthropicAI @Google_AI @MetaAI`;

    const result = buildBlockquoteHtml(text);
    assertEqual(result.isQuote, true, 'Complex mixed @ quote detected');
    assertEqual(result.paragraphCount, 3, 'Has 3 paragraphs');

    // Verify all @ patterns preserved
    assertContains(result.html, '@tech_insider:', 'Author preserved');
    assertContains(result.html, '@OpenAI', 'Company mention preserved');
    assertContains(result.html, 'press@openai.com', 'Email preserved');
    assertContains(result.html, '@AnthropicAI', 'Other company preserved');
}

// ============================================================================
// @ Symbol + Paragraph Structure Verification Tests
// ============================================================================

console.log('\nTest 24: @username quote - verify single <p> with <br><br> separators');
{
    const text = '@user1: First paragraph.\n\n@user2 mentioned in second.\n\nThird paragraph here.';
    const result = buildBlockquoteHtml(text);

    // Single <p> tag with <br><br> between paragraphs
    const pTagCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pTagCount, 1, '@-quote has single <p> tag');

    // Verify <br><br> separators
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Has 2 <br><br> separators between 3 paragraphs');
}

console.log('\nTest 25: @username quote - verify content with <br><br> separators');
{
    const text = '@author: Para one with @mention.\n\nPara two @another.\n\nPara three @final.';
    const result = buildBlockquoteHtml(text);

    // All content in single <p>, separated by <br><br>
    assertContains(result.html, '@author: Para one with @mention.<br><br>Para two', 'First to second via <br><br>');
    assertContains(result.html, 'Para two @another.<br><br>Para three', 'Second to third via <br><br>');
    assertContains(result.html, '@final.', 'Final content preserved');
}

console.log('\nTest 26: Email author - verify paragraph structure');
{
    const text = 'user@domain.com: First paragraph of email quote.\n\nSecond paragraph continues.\n\nThird wraps up.';
    const result = buildBlockquoteHtml(text);

    // Single <p> with <br><br> between paragraphs
    const pTagCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pTagCount, 1, 'Email author quote has single <p> tag');

    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Has 2 <br><br> separators');

    // Verify structure
    assertMatch(result.html, /^<blockquote><p>.*<br><br>.*<br><br>.*<\/p><\/blockquote>$/,
        'Email quote has proper <blockquote><p>...<br><br>...<br><br>...</p></blockquote> structure');
}

console.log('\nTest 27: @ symbols - single newlines vs double newlines');
{
    // Single newline = same paragraph (becomes <br>)
    // Double newline = paragraph break (becomes <br><br>)
    const text = '@user: Line one.\nLine two same para.\n\nNew paragraph here.\nAnother line same para.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.paragraphCount, 2, 'Double newline creates 2 paragraphs');

    // Single newlines become <br>
    assertContains(result.html, 'Line one.<br>Line two same para.', 'Single newline becomes <br> in first para');
    assertContains(result.html, 'New paragraph here.<br>Another line same para.', 'Single newline becomes <br> in second para');

    // Double newline becomes <br><br>
    assertContains(result.html, 'same para.<br><br>New paragraph', 'Double newline becomes <br><br>');
}

console.log('\nTest 28: @ at paragraph boundaries - structure integrity');
{
    const text = '@start: Starting with @.\n\n@middle paragraph.\n\nEnding with @end.';
    const result = buildBlockquoteHtml(text);

    // Verify content preserved with <br><br> separators
    assertContains(result.html, '@start: Starting with @.<br><br>@middle', 'First to second via <br><br>');
    assertContains(result.html, '@middle paragraph.<br><br>Ending', 'Second to third via <br><br>');

    // Count @ symbols to ensure none lost
    const atCount = (result.html.match(/@/g) || []).length;
    assertEqual(atCount, 4, 'All 4 @ symbols preserved across paragraph breaks');
}

console.log('\nTest 29: NEW vs OLD - both use <br><br>, but NEW normalizes line endings');
{
    const text = '@twitter_user: First paragraph with @mention.\n\nSecond @paragraph here.\n\nThird @final para.';

    const newResult = buildBlockquoteHtml(text);
    const oldResult = buildBlockquoteHtmlOld(text);

    // Both use single <p> tag with <br><br>
    const newPCount = (newResult.html.match(/<p>/g) || []).length;
    const oldPCount = (oldResult.html.match(/<p>/g) || []).length;
    assertEqual(newPCount, 1, 'NEW: Single <p> tag');
    assertEqual(oldPCount, 1, 'OLD: Single <p> tag');

    // Both use <br><br> between paragraphs
    assertContains(newResult.html, '<br><br>', 'NEW: Uses <br><br>');
    assertContains(oldResult.html, '<br><br>', 'OLD: Uses <br><br>');

    // Both preserve @ symbols
    const newAtCount = (newResult.html.match(/@/g) || []).length;
    const oldAtCount = (oldResult.html.match(/@/g) || []).length;
    assertEqual(newAtCount, 4, 'NEW: All @ preserved');
    assertEqual(oldAtCount, 4, 'OLD: All @ preserved');
    // The key difference: NEW normalizes \r\n to \n before processing
}

console.log('\nTest 30: Triple+ newlines with @ symbols');
{
    const text = '@user: First para.\n\n\n\nSecond para after many newlines.\n\n\n\n\nThird para.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.paragraphCount, 3, 'Multiple newlines still = 3 paragraphs');

    // Should have exactly 2 <br><br> separators regardless of how many newlines
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Still exactly 2 <br><br> separators');
}

// ============================================================================
// Windows Line Endings Tests (\r\n)
// ============================================================================

console.log('\nTest 31: Windows line endings (\\r\\n) - basic');
{
    const text = 'Author: First paragraph.\r\n\r\nSecond paragraph.\r\n\r\nThird paragraph.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Windows CRLF detected as quote');
    assertEqual(result.paragraphCount, 3, 'Windows CRLF creates 3 paragraphs');

    // Should use <br><br> between paragraphs
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 2, 'Has 2 <br><br> separators with Windows line endings');
    assertNotContains(result.html, '\r', 'No \\r in output');
}

console.log('\nTest 32: Windows line endings - single newlines become <br>');
{
    const text = 'Author: Line 1\r\nLine 2\r\nLine 3\r\n\r\nSecond paragraph.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.paragraphCount, 2, 'Windows CRLF: 2 paragraphs');
    assertContains(result.html, 'Line 1<br>Line 2<br>Line 3', 'Windows single newlines become <br>');
    assertContains(result.html, '<br><br>Second paragraph.', 'Second paragraph after <br><br>');
}

console.log('\nTest 33: Windows line endings with @ symbols');
{
    const text = '@twitteruser: First line.\r\nSecond line.\r\n\r\n@mention in para 2.\r\n\r\nPara 3.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Windows + @ detected as quote');
    assertEqual(result.paragraphCount, 3, 'Windows + @ has 3 paragraphs');
    assertContains(result.html, '@twitteruser:', '@ preserved with Windows endings');
    assertContains(result.html, '@mention', '@ in body preserved');
    assertContains(result.html, 'First line.<br>Second line.', 'Single CRLF becomes <br>');
}

console.log('\nTest 34: Mixed line endings (\\r\\n and \\n)');
{
    const text = 'Author: Para 1 line 1\nPara 1 line 2\r\n\r\nPara 2 line 1\r\nPara 2 line 2\n\nPara 3.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.paragraphCount, 3, 'Mixed endings: 3 paragraphs');
    assertContains(result.html, 'line 1<br>Para 1 line 2', 'Mixed single newlines become <br>');
    assertNotContains(result.html, '\r', 'No \\r in output');
}

console.log('\nTest 35: Old Mac line endings (\\r only)');
{
    const text = 'Author: Para 1.\r\rPara 2.\r\rPara 3.';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.paragraphCount, 3, 'Old Mac \\r\\r creates 3 paragraphs');
    assertNotContains(result.html, '\r', 'No \\r in output');
}

// ============================================================================
// Real-World Twitter Test Cases
// ============================================================================

console.log('\nTest 36: Jon Erlichman storage costs tweet (exact test case)');
{
    // This is the exact format from the screenshot - with line breaks between each price point
    const text = 'Jon Erlichman: Average cost for 1 gigabyte of storage:\r\n\r\n45 years ago: $438,000\r\n40 years ago: $238,000\r\n35 years ago: $48,720\r\n30 years ago: $5,152\r\n25 years ago: $455\r\n20 years ago: $5\r\n15 years ago: $0.55\r\n10 years ago: $0.05\r\n5 years ago: $0.03\r\nToday: $0.01';

    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Jon Erlichman tweet detected as quote');
    assertEqual(result.paragraphCount, 2, 'Tweet has 2 paragraphs (header + price list)');

    // Verify blockquote is created
    assertContains(result.html, '<blockquote>', 'Blockquote tag present');

    // Verify line breaks preserved in price list
    assertContains(result.html, '45 years ago: $438,000<br>40 years ago: $238,000', 'Price line breaks preserved as <br>');
    assertContains(result.html, '$0.05<br>5 years ago:', 'More price line breaks preserved');

    // Verify structure - single <p> with <br><br> between paragraphs
    assertContains(result.html, 'storage:<br><br>45 years ago:', 'Header and price list separated by <br><br>');

    // No merged text (the bug we fixed)
    assertNotContains(result.html, '$438,000 40 years', 'Prices NOT merged with spaces');
}

console.log('\nTest 37: Twitter list with all single newlines (no double newline)');
{
    // Some Twitter copies might have all single newlines
    const text = 'Author: Item 1\r\nItem 2\r\nItem 3\r\nItem 4';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Single-newline list detected as quote');
    assertEqual(result.paragraphCount, 1, 'All single newlines = 1 paragraph');
    assertContains(result.html, 'Item 1<br>Item 2<br>Item 3<br>Item 4', 'All items separated by <br>');
    assertNotContains(result.html, 'Item 1 Item 2', 'Items NOT merged with spaces');
}

console.log('\nTest 38: Twitter thread with timestamps and metrics');
{
    const text = '@elikitten: This is a multi-part thread about AI safety.\r\n\r\n1/ First point here.\r\n\r\n2/ Second point continues.\r\n\r\n3/ Third point concludes.\r\n\r\n10:30 AM · Jan 11, 2026 · 1.5M Views';

    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Twitter thread detected as quote');
    assertEqual(result.paragraphCount, 5, 'Thread has 5 paragraphs');
    assertContains(result.html, '@elikitten:', 'Author @mention preserved');

    // Verify <br><br> separators
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 4, 'Has 4 <br><br> separators between 5 paragraphs');
}

console.log('\nTest 39: Price/data list with colons on each line');
{
    // Test case where multiple lines have colons (like the storage costs)
    const text = 'Source: Data points:\r\n\r\nMetric A: 100\r\nMetric B: 200\r\nMetric C: 300';
    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Data list with colons detected as quote');
    // The first colon in "Source:" determines it's a quote
    assertContains(result.html, 'Source: Data points:<br><br>Metric A:', 'Header and metrics separated by <br><br>');
    assertContains(result.html, 'Metric A: 100<br>Metric B: 200<br>Metric C: 300', 'Metrics with colons preserved');
}

console.log('\nTest 40: Windows line endings - verify no content loss');
{
    const text = '@user: A\r\nB\r\nC\r\n\r\nD\r\nE\r\nF\r\n\r\nG\r\nH\r\nI';
    const result = buildBlockquoteHtml(text);

    // Count letters to ensure none lost
    const letterCount = (result.html.match(/[A-I]/g) || []).length;
    assertEqual(letterCount, 9, 'All 9 letters preserved with Windows line endings');

    // Count <br> tags: 6 single newlines (2 per paragraph) + 2 <br><br> (4 <br>) = 10 total
    const brCount = (result.html.match(/<br>/g) || []).length;
    assertEqual(brCount, 10, '10 <br> tags total (6 single + 4 from <br><br>)');

    // Single <p> tag
    const pCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pCount, 1, 'Single <p> tag');
}

// ============================================================================
// Nikhil Krishnan Test Case - Proper Paragraph Spacing
// ============================================================================

console.log('\nTest 41: Nikhil Krishnan Claude Code tweet (paragraph spacing test)');
{
    // This tests that paragraph spacing is correct (not too large)
    const text = `Nikhil Krishnan: I've spent the last 48 hours in Claude Code - as a non-technical person it's basically unlocked three very big things for me

1) The ability to interact with APIs generally - again, as a non-technical person one of the big barriers to running the business has been touching APIs.

2) The ability to thread things together - another issue has been threading several different products we work with together to do cohesive tasks.

3) Run something regularly - being able to set a script and run it regularly with this level of ease is a game changer.

I know I'm late to this and I'm probably doing things poorly so be nice to me. But it's really been awesome to dive into this.`;

    const result = buildBlockquoteHtml(text);

    assertEqual(result.isQuote, true, 'Nikhil Krishnan tweet detected as quote');
    assertEqual(result.paragraphCount, 5, 'Tweet has 5 paragraphs');

    // Verify single <p> tag with <br><br> for tighter spacing
    const pTagCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pTagCount, 1, 'Single <p> tag (avoids Substack CSS margins)');

    // Verify <br><br> separators
    const brbrCount = (result.html.match(/<br><br>/g) || []).length;
    assertEqual(brbrCount, 4, 'Has 4 <br><br> separators between 5 paragraphs');

    // Verify content preserved
    assertContains(result.html, 'unlocked three very big things', 'Intro paragraph present');
    assertContains(result.html, '1) The ability to interact with APIs', 'Point 1 present');
    assertContains(result.html, '2) The ability to thread things', 'Point 2 present');
    assertContains(result.html, '3) Run something regularly', 'Point 3 present');
    assertContains(result.html, 'awesome to dive into this', 'Conclusion present');
}

console.log('\nTest 42: Verify <br><br> produces tighter spacing than separate <p> tags');
{
    // This test documents the design decision
    const text = 'Author: Para 1.\n\nPara 2.\n\nPara 3.';
    const result = buildBlockquoteHtml(text);

    // Structure should be: <blockquote><p>content<br><br>content<br><br>content</p></blockquote>
    // NOT: <blockquote><p>content</p><p>content</p><p>content</p></blockquote>
    // Because Substack's CSS adds margins to <p> tags, making spacing too large

    const pTagCount = (result.html.match(/<p>/g) || []).length;
    assertEqual(pTagCount, 1, 'Single <p> tag for tighter spacing');

    assertMatch(result.html, /^<blockquote><p>.*<br><br>.*<br><br>.*<\/p><\/blockquote>$/,
        'Uses <br><br> for paragraph breaks (tighter spacing in Substack)');
}

// ============================================================================
// Image URL Extraction Tests
// ============================================================================

console.log('\n=== Image URL Extraction Tests ===\n');

/**
 * Extracts image URLs from HTML content using multiple patterns
 * Copied from content.js for unit testing
 */
function extractImageUrls(htmlContent) {
    if (!htmlContent) return [];

    const patterns = [
        // Standard img src
        /<img[^>]+src="([^"]+)"[^>]*>/gi,
        // img with srcset (take first URL)
        /<img[^>]+srcset="([^\s"]+)/gi,
        // data-src attribute
        /data-src="([^"]+)"/gi,
        // Background image in style
        /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/gi,
        // Twitter media URLs in any attribute
        /(https:\/\/pbs\.twimg\.com\/media\/[^\s"'<>]+)/gi,
        // General image URLs (jpg, png, webp)
        /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/gi
    ];

    const foundUrls = new Set();
    for (const pattern of patterns) {
        const matches = htmlContent.matchAll(pattern);
        for (const match of matches) {
            const src = match[1];
            if (src &&
                !src.includes('emoji') &&
                !src.includes('twemoji') &&
                !src.includes('/1f') &&
                !src.includes('icon') &&
                !src.includes('profile_images') &&
                !src.includes('_normal') &&
                !src.includes('_mini') &&
                src.length > 20) {
                foundUrls.add(src);
            }
        }
    }

    return [...foundUrls];
}

console.log('Test 43: Extract standard img src');
{
    const html = '<div><img src="https://example.com/photo.jpg" alt="test"></div>';
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Finds 1 image');
    assertContains(urls[0], 'photo.jpg', 'Correct URL extracted');
}

console.log('\nTest 44: Extract Twitter media URL');
{
    const html = '<div data-url="https://pbs.twimg.com/media/GhXYZ123abc.jpg"></div>';
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Finds Twitter media URL');
    assertContains(urls[0], 'pbs.twimg.com/media', 'Correct Twitter URL');
}

console.log('\nTest 45: Extract from srcset');
{
    const html = '<img srcset="https://example.com/image-800.jpg 800w, https://example.com/image-1200.jpg 1200w">';
    const urls = extractImageUrls(html);
    assertEqual(urls.length >= 1, true, 'Finds at least 1 srcset URL');
}

console.log('\nTest 46: Extract from background-image');
{
    const html = '<div style="background-image: url(\'https://example.com/bg.png\')"></div>';
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Finds background-image URL');
    assertContains(urls[0], 'bg.png', 'Correct background URL');
}

console.log('\nTest 47: Filter out emoji images');
{
    const html = `
        <img src="https://example.com/photo.jpg">
        <img src="https://twemoji.maxcdn.com/v/emoji.png">
        <img src="https://example.com/1f600.png">
    `;
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Only non-emoji image found');
    assertNotContains(urls.join(','), 'emoji', 'No emoji URLs');
    assertNotContains(urls.join(','), '1f600', 'No emoji code URLs');
}

console.log('\nTest 48: Filter out profile images');
{
    const html = `
        <img src="https://pbs.twimg.com/profile_images/123/avatar.jpg">
        <img src="https://pbs.twimg.com/media/ABC123.jpg">
    `;
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Only media image found, not profile');
    assertNotContains(urls.join(','), 'profile_images', 'No profile image URLs');
}

console.log('\nTest 49: Filter out thumbnail sizes');
{
    const html = `
        <img src="https://example.com/image_normal.jpg">
        <img src="https://example.com/image_mini.png">
        <img src="https://example.com/full_image.jpg">
    `;
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'Only full-size image found');
    assertNotContains(urls.join(','), '_normal', 'No _normal thumbnails');
    assertNotContains(urls.join(','), '_mini', 'No _mini thumbnails');
}

console.log('\nTest 50: Multiple images - deduplication');
{
    const html = `
        <img src="https://example.com/photo.jpg">
        <img src="https://example.com/photo.jpg">
        <img src="https://example.com/other.png">
    `;
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 2, 'Duplicates removed');
}

console.log('\nTest 51: Complex Twitter HTML with images');
{
    const html = `
        <div class="tweet">
            <img src="https://pbs.twimg.com/profile_images/123/avatar_normal.jpg" class="avatar">
            <span class="emoji"><img src="https://twemoji.maxcdn.com/v/13.1.0/72x72/1f600.png"></span>
            <div class="media">
                <img src="https://pbs.twimg.com/media/GhXYZ789.jpg:large" alt="Tweet image">
            </div>
        </div>
    `;
    const urls = extractImageUrls(html);
    // Should find the main media URL, profile and emoji should be filtered
    const hasMediaUrl = urls.some(u => u.includes('media/GhXYZ789'));
    const hasProfileUrl = urls.some(u => u.includes('profile_images'));
    const hasEmojiUrl = urls.some(u => u.includes('twemoji') || u.includes('1f600'));
    assertEqual(hasMediaUrl, true, 'Main tweet image found');
    assertEqual(hasProfileUrl, false, 'Profile image filtered out');
    assertEqual(hasEmojiUrl, false, 'Emoji image filtered out');
}

console.log('\nTest 52: Empty and null HTML');
{
    assertEqual(extractImageUrls('').length, 0, 'Empty string returns empty array');
    assertEqual(extractImageUrls(null).length, 0, 'Null returns empty array');
    assertEqual(extractImageUrls(undefined).length, 0, 'Undefined returns empty array');
}

console.log('\nTest 53: URL with query parameters');
{
    const html = '<img src="https://example.com/photo.jpg?format=webp&name=large">';
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 1, 'URL with query params found');
    assertContains(urls[0], 'format=webp', 'Query params preserved');
}

console.log('\nTest 54: data-src attribute');
{
    const html = '<img data-src="https://example.com/lazy-loaded.jpg" src="placeholder.gif">';
    const urls = extractImageUrls(html);
    const hasLazyUrl = urls.some(u => u.includes('lazy-loaded'));
    assertEqual(hasLazyUrl, true, 'data-src URL found');
}

console.log('\nTest 55: WebP and GIF formats');
{
    const html = `
        <img src="https://example.com/animation.gif">
        <img src="https://example.com/modern.webp">
    `;
    const urls = extractImageUrls(html);
    assertEqual(urls.length, 2, 'Both gif and webp found');
}

// ============================================================================
// Author Annotation Smart Paste Tests
// ============================================================================

console.log('\n=== Author Annotation Smart Paste Tests ===\n');

console.log('Test 56: Annotation in plain text, link in HTML - link is preserved with annotation outside');
{
    const text = 'theseriousadult (Anthropic): opus 4.6 feels even more ensouled';
    const html = '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a> (Anthropic): opus 4.6 feels even more ensouled';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertContains(result.html, '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a>', 'Link wraps only the author name');
    assertContains(result.html, '</a> (Anthropic):', 'Annotation appears after link, before colon');
    assertNotContains(result.html, '<a href="https://x.com/theseriousadult/status/123">theseriousadult (Anthropic)</a>', 'Annotation is NOT inside the link');
}

console.log('\nTest 57: No annotation - original link behavior preserved');
{
    const text = 'theseriousadult: opus 4.6 feels even more ensouled';
    const html = '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a>: opus 4.6 feels even more ensouled';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertContains(result.html, '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a>:', 'Link preserved without annotation');
}

console.log('\nTest 58: Annotation with multi-paragraph tweet');
{
    const text = 'AuthorName (OpenAI): First paragraph.\n\nSecond paragraph continues.';
    const html = '<a href="https://x.com/author/status/456">AuthorName</a> (OpenAI): First paragraph.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertEqual(result.paragraphCount, 2, '2 paragraphs');
    assertContains(result.html, '<a href="https://x.com/author/status/456">AuthorName</a> (OpenAI):', 'Link and annotation in first paragraph');
    assertContains(result.html, '<br><br>Second paragraph continues.', 'Second paragraph present');
}

console.log('\nTest 59: Annotation with special characters in annotation text');
{
    const text = 'John Doe (CEO, Acme Corp.): Some quote here.';
    const html = '<a href="https://example.com">John Doe</a> (CEO, Acme Corp.): Some quote here.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertContains(result.html, '<a href="https://example.com">John Doe</a> (CEO, Acme Corp.):', 'Annotation with comma preserved');
}

console.log('\nTest 60: Annotation with @handle as author name');
{
    const text = '@elonmusk (Tesla/SpaceX): Rockets are cool.';
    const html = '<a href="https://x.com/elonmusk/status/789">@elonmusk</a> (Tesla/SpaceX): Rockets are cool.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertContains(result.html, '<a href="https://x.com/elonmusk/status/789">@elonmusk</a> (Tesla/SpaceX):', 'Handle with annotation preserved');
}

console.log('\nTest 61: No HTML provided - plain text annotation is kept as-is');
{
    const text = 'AuthorName (SomeOrg): Quote content here.';
    const result = buildBlockquoteHtml(text, null);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertContains(result.html, 'AuthorName (SomeOrg): Quote content here.', 'Plain text preserved without link');
}

console.log('\nTest 62: HTML link text does not match author - no link added');
{
    const text = 'DifferentAuthor (Org): Quote content.';
    const html = '<a href="https://example.com">SomeoneElse</a>: Quote content.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.isQuote, true, 'Detected as quote');
    assertNotContains(result.html, '<a href', 'No link added when names dont match');
    assertContains(result.html, 'DifferentAuthor (Org): Quote content.', 'Original text preserved');
}

console.log('\nTest 63: Annotation with Windows line endings');
{
    const text = 'Author (Org): First paragraph.\r\n\r\nSecond paragraph.';
    const html = '<a href="https://example.com">Author</a> (Org): First paragraph.';
    const result = buildBlockquoteHtml(text, html);

    assertEqual(result.paragraphCount, 2, '2 paragraphs with CRLF');
    assertContains(result.html, '<a href="https://example.com">Author</a> (Org):', 'Link and annotation preserved with CRLF');
}

console.log('\nTest 64: Verify exact output format for annotated smart paste');
{
    const text = 'TestUser (TestOrg): Hello world.';
    const html = '<a href="https://x.com/test/status/1">TestUser</a> (TestOrg): Hello world.';
    const result = buildBlockquoteHtml(text, html);

    const expected = '<blockquote><p><a href="https://x.com/test/status/1">TestUser</a> (TestOrg): Hello world.</p></blockquote>';
    assertEqual(result.html, expected, 'Exact HTML output matches expected format');
}

console.log('\nTest 65: Annotation does not interfere with colon detection');
{
    // The annotation contains no colon, so first colon is after the annotation
    const text = 'Author (Info): Content with colon: inside text.';
    const html = '<a href="https://example.com">Author</a> (Info): Content with colon: inside text.';
    const result = buildBlockquoteHtml(text, html);

    assertContains(result.html, '<a href="https://example.com">Author</a> (Info):', 'First colon after annotation used for split');
    assertContains(result.html, 'Content with colon: inside text.', 'Content with internal colon preserved');
}

// ============================================================================
// getAuthorAnnotation Tests (annotation lookup logic)
// ============================================================================

console.log('\n=== getAuthorAnnotation Unit Tests ===\n');

/**
 * Simulates getAuthorAnnotation without chrome.storage dependency
 */
function getAuthorAnnotation(authorName, handle, isTwitter, annotations) {
    const cleanHandle = handle ? handle.replace(/^@/, '').toLowerCase() : null;
    const nameLower = authorName ? authorName.toLowerCase() : '';

    for (const ann of annotations) {
        if (ann.twitterOnly && !isTwitter) continue;
        if (ann.handleMatch && isTwitter && cleanHandle) {
            if (ann.handleMatch.toLowerCase() === cleanHandle) return ann.info;
        }
        if (ann.name.toLowerCase() === nameLower) return ann.info;
    }
    return null;
}

console.log('Test 66: Basic name match');
{
    const annotations = [{ name: 'theseriousadult', info: 'Anthropic', twitterOnly: false, handleMatch: '' }];
    const result = getAuthorAnnotation('theseriousadult', null, false, annotations);
    assertEqual(result, 'Anthropic', 'Matches by name');
}

console.log('\nTest 67: Case-insensitive name match');
{
    const annotations = [{ name: 'TheSeriousAdult', info: 'Anthropic', twitterOnly: false, handleMatch: '' }];
    const result = getAuthorAnnotation('theseriousadult', null, false, annotations);
    assertEqual(result, 'Anthropic', 'Case-insensitive match works');
}

console.log('\nTest 68: No match returns null');
{
    const annotations = [{ name: 'theseriousadult', info: 'Anthropic', twitterOnly: false, handleMatch: '' }];
    const result = getAuthorAnnotation('unknownuser', null, false, annotations);
    assertEqual(result, null, 'Non-matching name returns null');
}

console.log('\nTest 69: Twitter-only annotation on Twitter');
{
    const annotations = [{ name: 'testuser', info: 'TestOrg', twitterOnly: true, handleMatch: '' }];
    const result = getAuthorAnnotation('testuser', null, true, annotations);
    assertEqual(result, 'TestOrg', 'Twitter-only annotation shown on Twitter');
}

console.log('\nTest 70: Twitter-only annotation skipped on non-Twitter');
{
    const annotations = [{ name: 'testuser', info: 'TestOrg', twitterOnly: true, handleMatch: '' }];
    const result = getAuthorAnnotation('testuser', null, false, annotations);
    assertEqual(result, null, 'Twitter-only annotation NOT shown on non-Twitter sites');
}

console.log('\nTest 71: Handle match on Twitter');
{
    const annotations = [{ name: 'Display Name', info: 'HandleOrg', twitterOnly: false, handleMatch: 'realhandle' }];
    const result = getAuthorAnnotation('Some Other Name', '@realhandle', true, annotations);
    assertEqual(result, 'HandleOrg', 'Handle match takes priority on Twitter');
}

console.log('\nTest 72: Handle match with @ prefix');
{
    const annotations = [{ name: 'User', info: 'Org', twitterOnly: false, handleMatch: 'myhandle' }];
    const result = getAuthorAnnotation('User', '@myhandle', true, annotations);
    assertEqual(result, 'Org', 'Handle match works with @ prefix');
}

console.log('\nTest 73: Handle match case-insensitive');
{
    const annotations = [{ name: 'User', info: 'Org', twitterOnly: false, handleMatch: 'MyHandle' }];
    const result = getAuthorAnnotation('User', '@myhandle', true, annotations);
    assertEqual(result, 'Org', 'Handle match is case-insensitive');
}

console.log('\nTest 74: Handle match ignored on non-Twitter');
{
    const annotations = [{ name: 'NotMatching', info: 'Org', twitterOnly: false, handleMatch: 'myhandle' }];
    const result = getAuthorAnnotation('NotMatching', '@myhandle', false, annotations);
    assertEqual(result, 'Org', 'Falls back to name match on non-Twitter even with handleMatch set');
}

console.log('\nTest 75: Handle match ignored when no handle provided');
{
    const annotations = [{ name: 'UserName', info: 'Org', twitterOnly: false, handleMatch: 'differenthandle' }];
    const result = getAuthorAnnotation('UserName', null, true, annotations);
    assertEqual(result, 'Org', 'Falls back to name match when no handle provided');
}

console.log('\nTest 76: Multiple annotations - first match wins');
{
    const annotations = [
        { name: 'user1', info: 'Org1', twitterOnly: false, handleMatch: '' },
        { name: 'user2', info: 'Org2', twitterOnly: false, handleMatch: '' },
        { name: 'user1', info: 'Org3', twitterOnly: false, handleMatch: '' }
    ];
    const result = getAuthorAnnotation('user1', null, false, annotations);
    assertEqual(result, 'Org1', 'First matching annotation returned');
}

console.log('\nTest 77: Empty annotations array');
{
    const result = getAuthorAnnotation('anyuser', null, false, []);
    assertEqual(result, null, 'Empty annotations returns null');
}

console.log('\nTest 78: Handle match takes priority over name match');
{
    const annotations = [{ name: 'DisplayName', info: 'ByHandle', twitterOnly: false, handleMatch: 'handle123' }];
    // On Twitter with matching handle but different display name
    const result = getAuthorAnnotation('CompletelyDifferent', '@handle123', true, annotations);
    assertEqual(result, 'ByHandle', 'Handle match found even with different display name');
}

console.log('\nTest 79: Name match still works when handle does not match');
{
    const annotations = [{ name: 'DisplayName', info: 'ByName', twitterOnly: false, handleMatch: 'someotherhandle' }];
    const result = getAuthorAnnotation('DisplayName', '@differenthandle', true, annotations);
    assertEqual(result, 'ByName', 'Falls back to name match when handle doesnt match');
}

// ============================================================================
// Twitter copyCurrentTweet output format tests (annotation in HTML/plaintext)
// ============================================================================

console.log('\n=== Tweet Copy Output Format Tests ===\n');

/**
 * Simulates the HTML/plainText output of copyCurrentTweet with annotations
 */
function buildTweetCopyOutput(authorName, authorHandle, tweetUrl, tweetText, tweetHtml, annotation) {
    const infoText = annotation ? ` (${annotation})` : '';
    const contentHtml = tweetHtml || tweetText;
    const html = `<a href="${tweetUrl}">${authorName}</a>${infoText}: ${contentHtml}`;
    const plainText = `${authorName}${infoText}: ${tweetText}`;
    return { html, plainText };
}

console.log('Test 80: Tweet output with annotation');
{
    const output = buildTweetCopyOutput(
        'theseriousadult', '@theseriousadult',
        'https://x.com/theseriousadult/status/123',
        'opus 4.6 feels even more ensouled',
        'opus 4.6 feels even more ensouled',
        'Anthropic'
    );
    assertEqual(output.html, '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a> (Anthropic): opus 4.6 feels even more ensouled', 'HTML has link + annotation + content');
    assertEqual(output.plainText, 'theseriousadult (Anthropic): opus 4.6 feels even more ensouled', 'Plain text has name + annotation + content');
}

console.log('\nTest 81: Tweet output without annotation');
{
    const output = buildTweetCopyOutput(
        'someuser', '@someuser',
        'https://x.com/someuser/status/456',
        'just a regular tweet',
        'just a regular tweet',
        null
    );
    assertEqual(output.html, '<a href="https://x.com/someuser/status/456">someuser</a>: just a regular tweet', 'HTML has link without annotation');
    assertEqual(output.plainText, 'someuser: just a regular tweet', 'Plain text has name without annotation');
}

console.log('\nTest 82: Tweet output with HTML content (URLs in tweet)');
{
    const output = buildTweetCopyOutput(
        'user', '@user',
        'https://x.com/user/status/789',
        'Check this out: https://example.com',
        'Check this out: <a href="https://example.com">https://example.com</a>',
        'SomeOrg'
    );
    assertContains(output.html, '<a href="https://x.com/user/status/789">user</a> (SomeOrg):', 'Author link with annotation');
    assertContains(output.html, '<a href="https://example.com">', 'Content link preserved');
}

// ============================================================================
// End-to-end: tweet copy -> smart paste with annotation
// ============================================================================

console.log('\n=== End-to-End: Copy + Paste with Annotation ===\n');

console.log('Test 83: Full flow - tweet copied with annotation, pasted as blockquote');
{
    // Step 1: Simulate what copyCurrentTweet produces
    const tweetOutput = buildTweetCopyOutput(
        'theseriousadult', '@theseriousadult',
        'https://x.com/theseriousadult/status/123',
        'opus 4.6 feels even more ensouled',
        'opus 4.6 feels even more ensouled',
        'Anthropic'
    );

    // Step 2: Feed into buildBlockquoteHtml (simulating smart paste)
    const result = buildBlockquoteHtml(tweetOutput.plainText, tweetOutput.html);

    assertEqual(result.isQuote, true, 'Paste content detected as quote');
    assertContains(result.html, '<a href="https://x.com/theseriousadult/status/123">theseriousadult</a>', 'Link restored in blockquote');
    assertContains(result.html, '</a> (Anthropic):', 'Annotation after link in blockquote');
    assertContains(result.html, 'opus 4.6 feels even more ensouled', 'Tweet content preserved');
}

console.log('\nTest 84: Full flow - tweet without annotation, pasted as blockquote');
{
    const tweetOutput = buildTweetCopyOutput(
        'someuser', '@someuser',
        'https://x.com/someuser/status/456',
        'just a regular tweet',
        'just a regular tweet',
        null
    );

    const result = buildBlockquoteHtml(tweetOutput.plainText, tweetOutput.html);

    assertEqual(result.isQuote, true, 'Paste content detected as quote');
    assertContains(result.html, '<a href="https://x.com/someuser/status/456">someuser</a>:', 'Link restored without annotation');
    assertNotContains(result.html, '(', 'No parenthetical annotation present');
}

console.log('\nTest 85: Full flow - multi-paragraph tweet with annotation');
{
    const tweetOutput = buildTweetCopyOutput(
        'AuthorName', '@authorname',
        'https://x.com/authorname/status/789',
        'First paragraph.\n\nSecond paragraph.',
        'First paragraph.\n\nSecond paragraph.',
        'BigCorp'
    );

    const result = buildBlockquoteHtml(tweetOutput.plainText, tweetOutput.html);

    assertEqual(result.isQuote, true, 'Multi-para with annotation detected as quote');
    assertEqual(result.paragraphCount, 2, '2 paragraphs');
    assertContains(result.html, '<a href="https://x.com/authorname/status/789">AuthorName</a> (BigCorp):', 'Link + annotation in first para');
    assertContains(result.html, '<br><br>Second paragraph.', 'Second para present');
}

// ============================================================================
// formatThread output format tests (with annotations)
// ============================================================================

console.log('\n=== formatThread with Annotations Tests ===\n');

/**
 * Simulates formatThread with annotation lookup
 * annotations is an array of {name, info, twitterOnly, handleMatch}
 */
function formatThreadWithAnnotations(tweets, annotations) {
    if (!tweets || tweets.length === 0) return { html: '', plainText: '' };

    let html = '';
    let plainText = '';
    let lastAuthor = null;

    for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        if (!tweet.text) continue;

        const isFirstTweet = i === 0;
        const sameAuthor = lastAuthor && tweet.authorName === lastAuthor;

        const tweetHtml = tweet.html || tweet.text;

        if (sameAuthor && !isFirstTweet) {
            html += `\n\n${tweetHtml}`;
            plainText += `\n\n${tweet.text}`;
        } else {
            if (!isFirstTweet) {
                html += '\n\n';
                plainText += '\n\n';
            }

            if (tweet.authorName) {
                const tweetUrl = tweet.url || 'https://x.com';
                const annotation = getAuthorAnnotation(tweet.authorName, tweet.authorHandle, true, annotations);
                const infoText = annotation ? ` (${annotation})` : '';
                html += `<a href="${tweetUrl}">${tweet.authorName}</a>${infoText}: ${tweetHtml}`;
                plainText += `${tweet.authorName}${infoText}: ${tweet.text}`;
                lastAuthor = tweet.authorName;
            } else {
                html += tweetHtml;
                plainText += tweet.text;
            }
        }
    }

    return { html: html.trimEnd(), plainText: plainText.trimEnd() };
}

console.log('Test 86: Thread with annotated author');
{
    const tweets = [
        { text: 'First tweet', html: 'First tweet', authorName: 'TestUser', authorHandle: '@testuser', url: 'https://x.com/testuser/status/1' },
        { text: 'Second tweet', html: 'Second tweet', authorName: 'TestUser', authorHandle: '@testuser', url: 'https://x.com/testuser/status/2' }
    ];
    const annotations = [{ name: 'TestUser', info: 'TestOrg', twitterOnly: false, handleMatch: '' }];

    const result = formatThreadWithAnnotations(tweets, annotations);
    assertContains(result.html, '<a href="https://x.com/testuser/status/1">TestUser</a> (TestOrg): First tweet', 'First tweet has annotation');
    assertNotContains(result.html, 'TestUser</a> (TestOrg): Second tweet', 'Same author second tweet has no duplicate header');
    assertContains(result.plainText, 'TestUser (TestOrg): First tweet', 'Plain text has annotation');
}

console.log('\nTest 87: Thread with mixed annotated and non-annotated authors');
{
    const tweets = [
        { text: 'Tweet from annotated user', authorName: 'User1', authorHandle: '@user1', url: 'https://x.com/user1/status/1' },
        { text: 'Reply from non-annotated', authorName: 'User2', authorHandle: '@user2', url: 'https://x.com/user2/status/2' }
    ];
    const annotations = [{ name: 'User1', info: 'OrgA', twitterOnly: false, handleMatch: '' }];

    const result = formatThreadWithAnnotations(tweets, annotations);
    assertContains(result.html, 'User1</a> (OrgA):', 'Annotated user has annotation');
    assertContains(result.html, 'User2</a>: Reply', 'Non-annotated user has no annotation');
    assertNotContains(result.html, 'User2</a> (', 'No annotation for User2');
}

console.log('\nTest 88: Thread with handle-based annotation match');
{
    const tweets = [
        { text: 'Tweet text', authorName: 'Fancy Display Name', authorHandle: '@realhandle', url: 'https://x.com/realhandle/status/1' }
    ];
    const annotations = [{ name: 'SomethingElse', info: 'ByHandle', twitterOnly: false, handleMatch: 'realhandle' }];

    const result = formatThreadWithAnnotations(tweets, annotations);
    assertContains(result.html, 'Fancy Display Name</a> (ByHandle):', 'Handle match found annotation');
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
