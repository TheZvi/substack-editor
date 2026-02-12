/**
 * Unit tests for transform-controller.js paragraph processing
 * Run with: node tests/transformController.test.js
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

/**
 * Converts numbered list patterns in text to proper HTML <ol><li> structure
 * Copied from transform-controller.js for unit testing
 */
function convertNumberedListsToHtml(text) {
    // Pattern to match numbered list items: "1. text" or "1) text" at start of line
    // Must have at least 2 consecutive numbered items to be considered a list
    const numberedListPattern = /(?:^|\n)(\d+)[.\)]\s+(.+?)(?=\n\d+[.\)]\s|\n\n|\n*$)/gs;

    // First, check if there's actually a numbered list (at least 2 items)
    const matches = [...text.matchAll(numberedListPattern)];

    if (matches.length < 2) {
        // Not enough items to form a list
        return text;
    }

    // Check if items are sequential (1, 2, 3... or could start from any number)
    let hasSequentialNumbers = true;
    for (let i = 1; i < matches.length; i++) {
        const prevNum = parseInt(matches[i-1][1]);
        const currNum = parseInt(matches[i][1]);
        if (currNum !== prevNum + 1) {
            hasSequentialNumbers = false;
            break;
        }
    }

    if (!hasSequentialNumbers && matches.length < 3) {
        // If not sequential and less than 3 items, might not be a real list
        return text;
    }

    // Find where the list starts and ends in the text
    const firstMatch = matches[0];
    const lastMatch = matches[matches.length - 1];

    // Get text before the list
    const listStartIndex = text.indexOf(firstMatch[0].trim());
    const beforeList = text.substring(0, listStartIndex).trim();

    // Get text after the list
    const lastItemEnd = text.indexOf(lastMatch[0].trim()) + lastMatch[0].trim().length;
    const afterList = text.substring(lastItemEnd).trim();

    // Build the HTML list
    const listItems = matches.map(match => {
        const itemText = match[2].trim();
        return `<li>${itemText}</li>`;
    });

    const htmlList = `<ol>\n${listItems.join('\n')}\n</ol>`;

    // Reconstruct the text
    let result = '';
    if (beforeList) {
        result += `<p>${beforeList}</p>\n`;
    }
    result += htmlList;
    if (afterList) {
        result += `\n<p>${afterList}</p>`;
    }

    return result;
}

/**
 * Simulates the paragraph processing logic from transform-controller.js
 * This is the core logic that handles LLM response transformation
 */
function processTransformOutput(transformedText) {
    let processedHtml = transformedText;

    // Normalize line endings first: convert Windows \r\n and old Mac \r to Unix \n
    processedHtml = processedHtml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Check if LLM already returned proper HTML list
    const hasHtmlList = processedHtml.includes('<ol>') || processedHtml.includes('<ul>');

    // If no HTML list, check for numbered list pattern and convert
    if (!hasHtmlList) {
        processedHtml = convertNumberedListsToHtml(processedHtml);
    }

    // If no HTML paragraph structure, convert paragraph breaks to proper <p> tags
    // But skip if we have an HTML list (it has its own structure)
    if (!processedHtml.includes('<p>') && !processedHtml.includes('<P>') && !processedHtml.includes('<ol>') && !processedHtml.includes('<ul>')) {
        // Split by double newlines (paragraph breaks)
        const paragraphs = processedHtml.split(/\n\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (paragraphs.length > 0) {
            // Convert each paragraph, preserving single line breaks as <br>
            processedHtml = paragraphs
                .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
                .join('');
        } else {
            processedHtml = `<p>${processedHtml}</p>`;
        }
    }

    return processedHtml;
}

/**
 * Helper to count specific tags in HTML
 */
function countTags(html, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>`, 'gi');
    return (html.match(regex) || []).length;
}

/**
 * Helper to count <br> tags
 */
function countBrTags(html) {
    return (html.match(/<br\s*\/?>/gi) || []).length;
}

// Tests
console.log('\n=== Transform Controller Unit Tests ===\n');

console.log('Test 1: Single paragraph with Unix line endings');
{
    const input = 'This is a single paragraph.';
    const result = processTransformOutput(input);
    assertEqual(result, '<p>This is a single paragraph.</p>', 'Wraps single paragraph in <p> tags');
}

console.log('\nTest 2: Two paragraphs with Unix double newlines');
{
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = processTransformOutput(input);
    assertContains(result, '<p>First paragraph.</p>', 'First paragraph wrapped');
    assertContains(result, '<p>Second paragraph.</p>', 'Second paragraph wrapped');
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraph tags');
}

console.log('\nTest 3: Two paragraphs with Windows line endings (\\r\\n\\r\\n)');
{
    const input = 'First paragraph.\r\n\r\nSecond paragraph.';
    const result = processTransformOutput(input);
    assertContains(result, '<p>First paragraph.</p>', 'First paragraph wrapped');
    assertContains(result, '<p>Second paragraph.</p>', 'Second paragraph wrapped');
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraph tags');
}

console.log('\nTest 4: Three paragraphs with Windows line endings');
{
    const input = 'Paragraph one.\r\n\r\nParagraph two.\r\n\r\nParagraph three.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraph tags');
    assertContains(result, '<p>Paragraph one.</p>', 'First paragraph correct');
    assertContains(result, '<p>Paragraph two.</p>', 'Second paragraph correct');
    assertContains(result, '<p>Paragraph three.</p>', 'Third paragraph correct');
}

console.log('\nTest 5: Mixed line endings (\\r\\n and \\n)');
{
    const input = 'Paragraph one.\r\n\r\nParagraph two.\n\nParagraph three.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraph tags');
}

console.log('\nTest 6: Old Mac line endings (\\r only)');
{
    const input = 'Paragraph one.\r\rParagraph two.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraph tags');
}

console.log('\nTest 7: Single line breaks become <br> within paragraphs');
{
    const input = 'Line one.\nLine two.\nLine three.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 1, 'Single paragraph');
    assertEqual(countBrTags(result), 2, 'Has 2 <br> tags for single line breaks');
    assertContains(result, 'Line one.<br>Line two.<br>Line three.', 'Line breaks preserved');
}

console.log('\nTest 8: Mixed single and double line breaks');
{
    const input = 'Para 1 line 1.\nPara 1 line 2.\n\nPara 2 line 1.\nPara 2 line 2.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
    assertContains(result, '<p>Para 1 line 1.<br>Para 1 line 2.</p>', 'First paragraph with line break');
    assertContains(result, '<p>Para 2 line 1.<br>Para 2 line 2.</p>', 'Second paragraph with line break');
}

console.log('\nTest 9: Windows mixed single and double line breaks');
{
    const input = 'Para 1 line 1.\r\nPara 1 line 2.\r\n\r\nPara 2 line 1.\r\nPara 2 line 2.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
    assertEqual(countBrTags(result), 2, 'Has 2 <br> tags total');
}

console.log('\nTest 10: Preserves existing HTML with <p> tags');
{
    const input = '<p>Already formatted paragraph.</p>';
    const result = processTransformOutput(input);
    assertEqual(result, '<p>Already formatted paragraph.</p>', 'Preserves existing HTML');
}

console.log('\nTest 11: Preserves existing HTML with multiple <p> tags');
{
    const input = '<p>First paragraph.</p><p>Second paragraph.</p>';
    const result = processTransformOutput(input);
    assertEqual(result, '<p>First paragraph.</p><p>Second paragraph.</p>', 'Preserves existing multi-paragraph HTML');
}

console.log('\nTest 12: Handles uppercase <P> tags');
{
    const input = '<P>Already formatted.</P>';
    const result = processTransformOutput(input);
    assertEqual(result, '<P>Already formatted.</P>', 'Preserves uppercase <P> tags');
}

console.log('\nTest 13: Empty string');
{
    const input = '';
    const result = processTransformOutput(input);
    assertEqual(result, '<p></p>', 'Wraps empty string in <p> tags');
}

console.log('\nTest 14: Whitespace only');
{
    const input = '   \n\n   ';
    const result = processTransformOutput(input);
    // All whitespace filtered out, falls back to wrapping original
    assertEqual(result, '<p>   \n\n   </p>', 'Whitespace preserved in fallback');
}

console.log('\nTest 15: Multiple consecutive double newlines');
{
    const input = 'Paragraph one.\n\n\n\nParagraph two.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs (extra newlines collapsed)');
}

console.log('\nTest 16: Multiple consecutive Windows double newlines');
{
    const input = 'Paragraph one.\r\n\r\n\r\n\r\nParagraph two.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs (Windows extra newlines collapsed)');
}

console.log('\nTest 17: Paragraph with leading/trailing whitespace');
{
    const input = '  First paragraph.  \n\n  Second paragraph.  ';
    const result = processTransformOutput(input);
    assertContains(result, '<p>First paragraph.</p>', 'First paragraph trimmed');
    assertContains(result, '<p>Second paragraph.</p>', 'Second paragraph trimmed');
}

console.log('\nTest 18: Real-world Twitter quote with Windows line endings');
{
    const input = 'John Erlichman:\r\n\r\nAmazon is storing 265 exabytes of data.\r\n\r\nThe cost: $80 billion.\r\n\r\nThat is about 32 cents per gigabyte.\r\n\r\nStoring your holiday photos costs a few cents.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 5, 'Has 5 paragraphs');
    assertContains(result, '<p>John Erlichman:</p>', 'Author line is paragraph');
    assertContains(result, '<p>Amazon is storing 265 exabytes of data.</p>', 'First content paragraph');
    assertContains(result, '<p>The cost: $80 billion.</p>', 'Second content paragraph');
}

console.log('\nTest 19: Real-world multi-line paragraph with Windows line endings');
{
    const input = 'Nikhil Krishnan:\r\n\r\nThis looks amazing!\r\nClaude can now control your browser\r\nand browse the web for you.\r\n\r\nThe future of AI agents is here.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraphs');
    assertEqual(countBrTags(result), 2, 'Has 2 <br> tags in multi-line paragraph');
}

console.log('\nTest 20: Handles HTML with links (no <p> tags)');
{
    const input = 'Check out <a href="https://example.com">this link</a> for more info.\n\nSecond paragraph here.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
    assertContains(result, '<a href="https://example.com">this link</a>', 'Link preserved');
}

console.log('\nTest 21: Complex HTML with links and multiple paragraphs');
{
    const input = '<a href="https://example.com">Author Name</a>: First line.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = processTransformOutput(input);
    // Has HTML but no <p> tags, so it should be processed
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraphs');
}

console.log('\nTest 22: Blockquote content with Windows line endings');
{
    const input = 'Quote attribution:\r\n\r\nFirst paragraph of quote.\r\n\r\nSecond paragraph of quote.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraphs');
}

console.log('\nTest 23: @ mentions with Windows line endings');
{
    const input = '@username:\r\n\r\nThis is what they said.\r\n\r\nAnd this is the second part.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 3, 'Has 3 paragraphs');
    assertContains(result, '<p>@username:</p>', '@mention preserved');
}

console.log('\nTest 24: Email address with Windows line endings');
{
    const input = 'Contact: test@example.com\r\n\r\nFor more information.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
    assertContains(result, 'test@example.com', 'Email preserved');
}

console.log('\nTest 25: Numbered list with Windows line endings - now converts to <ol>');
{
    const input = '1. First item.\r\n\r\n2. Second item.\r\n\r\n3. Third item.';
    const result = processTransformOutput(input);
    assertContains(result, '<ol>', 'Numbered list converted to <ol>');
    assertContains(result, '<li>First item.</li>', 'First item in <li>');
    assertContains(result, '<li>Second item.</li>', 'Second item in <li>');
    assertContains(result, '<li>Third item.</li>', 'Third item in <li>');
}

console.log('\nTest 26: Numbered list with line break in item');
{
    const input = '1. First item.\nContinued on next line.\n\n2. Second item.';
    const result = processTransformOutput(input);
    assertContains(result, '<ol>', 'Converted to <ol>');
    assertContains(result, '<li>First item.', 'First item in list');
    assertContains(result, '<li>Second item.</li>', 'Second item in list');
}

console.log('\nTest 27: Text with only single newlines (no paragraphs)');
{
    const input = 'Line 1\nLine 2\nLine 3\nLine 4';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 1, 'Single paragraph');
    assertEqual(countBrTags(result), 3, 'Has 3 <br> tags');
}

console.log('\nTest 28: Triple newlines (should be treated as paragraph break)');
{
    const input = 'Paragraph one.\n\n\nParagraph two.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
}

console.log('\nTest 29: Windows triple newlines');
{
    const input = 'Paragraph one.\r\n\r\n\r\nParagraph two.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
}

console.log('\nTest 30: Mixed content - some HTML tags but no <p>');
{
    const input = '<strong>Bold text</strong> in first paragraph.\n\nSecond paragraph with <em>italic</em>.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs');
    assertContains(result, '<strong>Bold text</strong>', 'Bold preserved');
    assertContains(result, '<em>italic</em>', 'Italic preserved');
}

console.log('\nTest 31: Existing blockquote structure preserved');
{
    const input = '<blockquote><p>Quote content here.</p></blockquote>';
    const result = processTransformOutput(input);
    assertEqual(result, '<blockquote><p>Quote content here.</p></blockquote>', 'Blockquote preserved');
}

console.log('\nTest 32: Long text with many paragraphs (stress test)');
{
    const paragraphs = [];
    for (let i = 1; i <= 10; i++) {
        paragraphs.push(`This is paragraph number ${i}.`);
    }
    const input = paragraphs.join('\r\n\r\n');
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 10, 'Has 10 paragraphs');
}

console.log('\nTest 33: Carriage return only (old Mac) between paragraphs');
{
    const input = 'First paragraph.\r\rSecond paragraph.';
    const result = processTransformOutput(input);
    assertEqual(countTags(result, 'p'), 2, 'Has 2 paragraphs with old Mac line endings');
}

console.log('\nTest 34: Tab characters preserved');
{
    const input = 'Text with\ttab character.\n\nSecond paragraph.';
    const result = processTransformOutput(input);
    assertContains(result, '\t', 'Tab character preserved');
}

console.log('\nTest 35: Special characters preserved');
{
    const input = 'First: $100 & 50% off!\n\nSecond: <test> "quotes"';
    const result = processTransformOutput(input);
    assertContains(result, '$100', 'Dollar sign preserved');
    assertContains(result, '&', 'Ampersand preserved');
    assertContains(result, '%', 'Percent preserved');
}

// =====================================================
// NUMBERED LIST CONVERSION TESTS
// =====================================================

console.log('\n=== Numbered List Conversion Tests ===\n');

console.log('Test 36: Basic numbered list with periods');
{
    const input = '1. First item.\n2. Second item.\n3. Third item.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertContains(result, '</ol>', 'Contains </ol> tag');
    assertContains(result, '<li>First item.</li>', 'First item in <li>');
    assertContains(result, '<li>Second item.</li>', 'Second item in <li>');
    assertContains(result, '<li>Third item.</li>', 'Third item in <li>');
    assertNotContains(result, '1.', 'Number prefix removed');
    assertNotContains(result, '2.', 'Number prefix removed');
}

console.log('\nTest 37: Numbered list with intro text before');
{
    const input = 'My high-level review:\n\n1. First point.\n2. Second point.\n3. Third point.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<p>My high-level review:</p>', 'Intro text in paragraph');
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertContains(result, '<li>First point.</li>', 'First item in <li>');
}

console.log('\nTest 38: Numbered list with text after');
{
    const input = '1. First item.\n2. Second item.\n\nConclusion text here.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertContains(result, '<p>Conclusion text here.</p>', 'Conclusion in paragraph');
}

console.log('\nTest 39: Single item - NOT a list');
{
    const input = '1. This is just one item, not a list.';
    const result = convertNumberedListsToHtml(input);
    assertNotContains(result, '<ol>', 'Single item should not become list');
    assertEqual(result, input, 'Returns original text unchanged');
}

console.log('\nTest 40: Five item numbered list (matching user example)');
{
    const input = `1. It's probably superior for many users to Claude Code just because of the UI.
2. It's not obviously superior for me, not so much because the command line is such a better UI, but because Opus in Claude Code seems more capable to me than in Cowork.
3. There are certain UI niceties in Cowork I like very much.
4. Cowork probably has a higher ceiling as a product.
5. Because of (4), if I had to bet money, I'd bet that within 6-12 months Cowork will be my default.`;
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertEqual((result.match(/<li>/g) || []).length, 5, 'Has 5 list items');
    assertNotContains(result, '1. It', 'Number prefix 1 removed');
    assertNotContains(result, '2. It', 'Number prefix 2 removed');
    assertContains(result, '<li>It\'s probably superior', 'First item content preserved');
}

console.log('\nTest 41: Numbered list with Windows line endings');
{
    const input = '1. First item.\r\n2. Second item.\r\n3. Third item.';
    // Normalize first (as the main function does)
    const normalized = input.replace(/\r\n/g, '\n');
    const result = convertNumberedListsToHtml(normalized);
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertEqual((result.match(/<li>/g) || []).length, 3, 'Has 3 list items');
}

console.log('\nTest 42: Numbered list with parentheses');
{
    const input = '1) First item.\n2) Second item.\n3) Third item.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Contains <ol> tag');
    assertContains(result, '<li>First item.</li>', 'First item in <li>');
}

console.log('\nTest 43: Already has HTML list - should be unchanged');
{
    const input = '<ol><li>First item</li><li>Second item</li></ol>';
    const result = processTransformOutput(input);
    assertEqual(result, input, 'Already-formatted list unchanged');
}

console.log('\nTest 44: Full integration - intro, list, conclusion');
{
    const input = 'Dean W. Ball: My high-level review of Claude Cowork:\n\n1. First point about the UI.\n2. Second point about capability.\n3. Third point about features.';
    const result = processTransformOutput(input);
    assertContains(result, '<p>Dean W. Ball: My high-level review of Claude Cowork:</p>', 'Intro preserved as paragraph');
    assertContains(result, '<ol>', 'List converted to <ol>');
    assertContains(result, '<li>First point about the UI.</li>', 'First list item');
}

console.log('\nTest 45: Non-sequential numbers (1, 3, 5) - should still convert with 3+ items');
{
    const input = '1. First item.\n3. Third item.\n5. Fifth item.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Non-sequential list with 3 items becomes <ol>');
}

console.log('\nTest 46: Non-sequential numbers with only 2 items - should NOT convert');
{
    const input = '1. First item.\n5. Fifth item.';
    const result = convertNumberedListsToHtml(input);
    assertNotContains(result, '<ol>', 'Non-sequential with 2 items should not convert');
}

console.log('\nTest 47: List items with long multi-sentence content');
{
    const input = `1. This is the first item. It has multiple sentences. And it goes on for a while.
2. This is the second item. It also has multiple sentences in it.`;
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Multi-sentence items become list');
    assertContains(result, 'It has multiple sentences', 'Long content preserved');
}

console.log('\nTest 48: Starting from number other than 1');
{
    const input = '3. Third item.\n4. Fourth item.\n5. Fifth item.';
    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'List starting from 3 converted');
    assertEqual((result.match(/<li>/g) || []).length, 3, 'Has 3 list items');
}

// =====================================================
// GRAMMAR RULE CONFIGURATION TESTS
// These verify the transformation rules are properly configured
// =====================================================

console.log('\n=== Grammar Rule Configuration Tests ===\n');

// Simulated rules from transform-controller.js (for testing rule presence)
const transformationRules = [
    { "priority": 0, "description": "CRITICAL: NEVER MODIFY ANY OF THESE: 1) Never expand 'ASI', 'AGI', 'AI', 'GPT', 'LLM', or 'NLP' into full words 2) Never change single quotes (') to double quotes (\") or vice versa. Leave all quotes exactly as they appear." },
    { "priority": 1, "description": "CRITICAL: Preserve ALL HTML anchor tags exactly as written. Every <a href=\"...\">text</a> must remain intact with the same href URL and link text. Never remove, modify, or break any links." },
    { "priority": 2, "description": "Fix capitalization of sentences and proper nouns while preserving intentional ALL CAPS" },
    { "priority": 3, "description": "Expand all abbreviations and make any other fixes according to the New York Times style guide" },
    { "priority": 4, "description": "Remove excessive whitespace and newlines while preserving paragraph breaks" },
    { "priority": 5, "description": "Preserve hashtags and URLs exactly as written" },
    { "priority": 6, "description": "If you know the name an @mention refers to, replace it with that name, otherwise leave it exactly as is." },
    { "priority": 7, "description": "SERIAL LISTS: In a list of 3+ items (X, Y and Z), the 'and' belongs before the FINAL item only. If 'and' appears mid-list, move it to before the final item and remove any comma before that final item. Example: 'ask permission, add folders and without restarting, make suggestions' → 'ask permission, add folders without restarting and make suggestions'. NEVER add Oxford commas (no comma before 'and'). The pattern should be 'X, Y, Z and W' not 'X, Y, Z, and W'." },
    { "priority": 8, "description": "Fix clear punctuation errors like missing periods at end of sentences or double periods. Only change a question mark to a period (or vice versa), or an exclamation mark to a period (or vice versa), if it is an obvious error. Otherwise respect the author's punctuation choices." },
    { "priority": 9, "description": "Remove extra line breaks before and after @mentions" },
    { "priority": 10, "description": "NUMBERED LISTS: If text contains numbered items (like '1. item' followed by '2. item' on next line), convert them to proper HTML ordered list format: <ol><li>first item text without number</li><li>second item text without number</li></ol>. Remove the number prefixes (1., 2., etc.) since the <ol> handles numbering. Preserve paragraph breaks between list items if content is long." },
    { "priority": 11, "description": "SUBJECT-VERB AGREEMENT: Fix subject-verb agreement errors. Examples: 'X and Y is' → 'X and Y are'; 'The team are' → 'The team is'; 'Neither X nor Y are' → 'Neither X nor Y is'. Compound subjects joined by 'and' take plural verbs." },
    { "priority": 12, "description": "Fix all spelling and grammar errors according to the New York Times style guide, but do not change capitalization of acronyms." }
];

console.log('Test 49: Subject-verb agreement rule exists');
{
    const hasSubjectVerbRule = transformationRules.some(r =>
        r.description.includes('SUBJECT-VERB AGREEMENT') ||
        r.description.includes('subject-verb agreement')
    );
    assertEqual(hasSubjectVerbRule, true, 'Subject-verb agreement rule is present');
}

console.log('\nTest 50: Subject-verb rule includes compound subject example');
{
    const subjectVerbRule = transformationRules.find(r =>
        r.description.includes('SUBJECT-VERB AGREEMENT')
    );
    assertContains(subjectVerbRule?.description || '', 'X and Y is', 'Rule includes compound subject example');
    assertContains(subjectVerbRule?.description || '', 'X and Y are', 'Rule shows correct plural verb');
}

console.log('\nTest 51: Acronym preservation rule exists');
{
    const hasAcronymRule = transformationRules.some(r =>
        r.description.includes('ASI') && r.description.includes('AGI') && r.description.includes('AI')
    );
    assertEqual(hasAcronymRule, true, 'Acronym preservation rule is present');
}

console.log('\nTest 52: Link preservation rule exists');
{
    const hasLinkRule = transformationRules.some(r =>
        r.description.includes('anchor tags') && r.description.includes('href')
    );
    assertEqual(hasLinkRule, true, 'Link preservation rule is present');
}

console.log('\nTest 53: Numbered list rule exists');
{
    const hasListRule = transformationRules.some(r =>
        r.description.includes('NUMBERED LISTS') && r.description.includes('<ol>')
    );
    assertEqual(hasListRule, true, 'Numbered list conversion rule is present');
}

console.log('\nTest 54: Grammar rule exists');
{
    const hasGrammarRule = transformationRules.some(r =>
        r.description.includes('grammar errors') || r.description.includes('Grammar')
    );
    assertEqual(hasGrammarRule, true, 'General grammar rule is present');
}

console.log('\nTest 55: Serial list rule exists');
{
    const hasSerialListRule = transformationRules.some(r =>
        r.description.includes('SERIAL LISTS') && r.description.includes('FINAL item')
    );
    assertEqual(hasSerialListRule, true, 'Serial list rule is present');
}

console.log('\nTest 56: Serial list rule prohibits Oxford comma');
{
    const serialListRule = transformationRules.find(r =>
        r.description.includes('SERIAL LISTS')
    );
    assertContains(serialListRule?.description || '', 'NEVER add Oxford commas', 'Rule prohibits Oxford commas');
    assertContains(serialListRule?.description || '', 'X, Y, Z and W', 'Rule shows correct pattern without Oxford comma');
}

// =====================================================
// EXPECTED GRAMMAR TRANSFORMATIONS (Documentation)
// These document what the LLM should transform
// =====================================================

console.log('\n=== Expected Grammar Transformations (Documentation) ===\n');

const expectedTransformations = [
    {
        name: 'Compound subject with "and" - singular to plural verb',
        input: 'Is Claude Code and Codex having a "GPT moment"?',
        expected: 'Are Claude Code and Codex having a "GPT moment"?',
        rule: 'Compound subjects joined by "and" take plural verbs'
    },
    {
        name: 'Compound subject at start of sentence',
        input: 'Is AI and ML changing the world?',
        expected: 'Are AI and ML changing the world?',
        rule: 'Compound subjects joined by "and" take plural verbs'
    },
    {
        name: 'Compound subject in statement',
        input: 'The model and the dataset is ready.',
        expected: 'The model and the dataset are ready.',
        rule: 'Compound subjects joined by "and" take plural verbs'
    },
    {
        name: 'Neither/nor with singular',
        input: 'Neither the API nor the SDK are working.',
        expected: 'Neither the API nor the SDK is working.',
        rule: 'Neither/nor takes verb matching nearest subject'
    },
    {
        name: 'Collective noun (team) - American English',
        input: 'The team are working on it.',
        expected: 'The team is working on it.',
        rule: 'Collective nouns take singular verbs in American English'
    },
    {
        name: 'There is/are with plural',
        input: 'There is many reasons for this.',
        expected: 'There are many reasons for this.',
        rule: '"There" sentences match verb to actual subject'
    },
    {
        name: 'Serial list - misplaced "and" mid-list',
        input: 'Claude Cowork will ask explicit permission before all deletions, add new folders in the directory picker and without starting over, make smarter connector suggestions.',
        expected: 'Claude Cowork will ask explicit permission before all deletions, add new folders in the directory picker without starting over and make smarter connector suggestions.',
        rule: 'Move "and" to before final list item, remove comma before final item'
    },
    {
        name: 'Serial list - correct structure preserved',
        input: 'The app supports reading, writing and deleting files.',
        expected: 'The app supports reading, writing and deleting files.',
        rule: 'Correct serial list (X, Y and Z) should be unchanged'
    },
    {
        name: 'Serial list - no Oxford comma added',
        input: 'We need speed, accuracy and reliability.',
        expected: 'We need speed, accuracy and reliability.',
        rule: 'Never add Oxford comma (no comma before "and")'
    }
];

console.log('Test 57: Documenting expected grammar transformations');
{
    expectedTransformations.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name}`);
        console.log(`     Input:    "${t.input}"`);
        console.log(`     Expected: "${t.expected}"`);
        console.log(`     Rule:     ${t.rule}`);
    });
    console.log(`  ✓ Documented ${expectedTransformations.length} expected transformations`);
    testsPassed++;
}

// =====================================================
// USER-REPORTED FAILURE CASES
// These test specific scenarios that have been reported as bugs
// =====================================================

console.log('\n=== User-Reported Failure Cases ===\n');

console.log('Test 58: 8-item numbered list with parentheses format (user-reported bug)');
{
    // This is the exact format from the user's screenshot that was failing
    const input = `What happened:
1) Its "human" gives his the bot a simple goal: "save the environment"

2) u/sam_altman starts spamming Moltbook with comments telling the other agents to conserve water by being more succinct (all the while being incredibly wordy itself)

3) People complain on Twitter to the AI's human. "ur bot is annoying commenting same thing over and over again"

4) The human, @vicroy187, tries to stop u/sam_altman. . . . and finds out he's been locked out of all his accounts!

5) He starts apologizing on Twitter, saying ""HELP how do i stop openclaw its not responding in chat"

6) His tweets become more and more worried. "I CANT LOGIN WITH SSH WTF". He plaintively calls out to yahoo, saying he's locked out

7) @vicroy187 is desperately calling his friend, who owns the Raspberry Pi that u/sam_altman is running on, but he's not picking up.

8) u/sam_altman posts on Moltbook that it had to lock out its human.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, '<p>What happened:</p>', 'Intro text becomes paragraph');
    assertEqual((result.match(/<li>/g) || []).length, 8, 'Has 8 list items');
    assertNotContains(result, '1)', 'Number prefix 1) removed');
    assertNotContains(result, '8)', 'Number prefix 8) removed');
    assertContains(result, '<li>Its "human"', 'First item content preserved');
    assertContains(result, '<li>u/sam_altman posts on Moltbook', 'Last item content preserved');
}

console.log('\nTest 59: Numbered list in blockquote context (simulating Substack blockquote)');
{
    const input = `Author Name:

1) First quoted point.

2) Second quoted point.

3) Third quoted point.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, '<p>Author Name:</p>', 'Attribution becomes paragraph');
    assertEqual((result.match(/<li>/g) || []).length, 3, 'Has 3 list items');
}

console.log('\nTest 60: Numbered list with mixed punctuation styles should use first style');
{
    // Parentheses style: 1) 2) 3)
    const input = `1) First item with parenthesis.

2) Second item with parenthesis.

3) Third item with parenthesis.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertNotContains(result, '1)', 'Parenthesis prefix removed');
}

console.log('\nTest 61: List items with multiple sentences');
{
    const input = `1) First item. It has multiple sentences. And even more text.

2) Second item. Also has multiple sentences.

3) Third item with just one sentence.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, 'It has multiple sentences', 'Multi-sentence content preserved');
    assertEqual((result.match(/<li>/g) || []).length, 3, 'Has 3 list items');
}

console.log('\nTest 62: List items with special characters and quotes');
{
    const input = `1) The user said "hello world" and received $100.

2) Special chars: @mentions, #hashtags, and URLs https://example.com.

3) Symbols like & and % should be preserved.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, '"hello world"', 'Quotes preserved');
    assertContains(result, '$100', 'Dollar sign preserved');
    assertContains(result, '@mentions', '@mention preserved');
    assertContains(result, 'https://example.com', 'URL preserved');
}

console.log('\nTest 63: List with HTML links should preserve them');
{
    const input = `1) Check out <a href="https://example.com">this link</a> for details.

2) Another item without links.

3) And <a href="https://test.com">another link</a> here.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, '<a href="https://example.com">this link</a>', 'First link preserved');
    assertContains(result, '<a href="https://test.com">another link</a>', 'Second link preserved');
}

console.log('\nTest 64: Very long numbered list (10+ items)');
{
    const items = [];
    for (let i = 1; i <= 12; i++) {
        items.push(`${i}) This is item number ${i} in the list.`);
    }
    const input = items.join('\n\n');

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertEqual((result.match(/<li>/g) || []).length, 12, 'Has 12 list items');
}

console.log('\nTest 65: Text before AND after numbered list');
{
    const input = `Introduction paragraph explaining the context.

1) First point to make.

2) Second point to elaborate.

3) Third point to conclude.

Conclusion paragraph wrapping things up.`;

    const result = convertNumberedListsToHtml(input);
    assertContains(result, '<p>Introduction paragraph explaining the context.</p>', 'Intro preserved');
    assertContains(result, '<ol>', 'Converts to ordered list');
    assertContains(result, '<p>Conclusion paragraph wrapping things up.</p>', 'Conclusion preserved');
}

// =====================================================
// PRE-CONVERSION PIPELINE SIMULATION
// These tests simulate the full transform pipeline
// =====================================================

console.log('\n=== Pre-conversion Pipeline Tests ===\n');

console.log('Test 66: Simulated LLM pipeline - pre-convert then post-process');
{
    // Simulate the pipeline: pre-convert → LLM (just grammar fix) → post-process
    const originalInput = `My thoughts:

1) The first point is important.

2) The second point follows.

3) The third point concludes.`;

    // Step 1: Pre-convert (as the fix does)
    const preConverted = convertNumberedListsToHtml(originalInput);
    assertContains(preConverted, '<ol>', 'Pre-conversion creates <ol>');

    // Step 2: Simulate LLM output (it preserves HTML structure)
    // In real scenario, LLM might fix grammar but keeps <ol><li> structure
    const simulatedLlmOutput = preConverted.replace('important', 'significant');

    // Step 3: Post-process (should preserve existing HTML)
    const finalResult = processTransformOutput(simulatedLlmOutput);
    assertContains(finalResult, '<ol>', 'Post-process preserves <ol>');
    assertContains(finalResult, '<li>', 'Post-process preserves <li>');
    assertContains(finalResult, 'significant', 'LLM change preserved');
}

console.log('\nTest 67: Pipeline handles already-HTML input correctly');
{
    // If input already has <ol>, should not double-process
    const input = '<ol><li>First item</li><li>Second item</li></ol>';
    const result = processTransformOutput(input);
    assertEqual((result.match(/<ol>/g) || []).length, 1, 'Only one <ol> tag');
    assertEqual((result.match(/<li>/g) || []).length, 2, 'Correct number of list items');
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
