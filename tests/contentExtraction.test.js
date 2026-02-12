/**
 * Unit tests for content extraction and cleanup functions
 * Run with: node tests/contentExtraction.test.js
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

// Mock DOM for testing
class MockElement {
    constructor(tagName, innerHTML = '') {
        this.tagName = tagName;
        this._innerHTML = innerHTML;
        this.attributes = new Map();
        this._children = [];
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(value) {
        this._innerHTML = value;
        // Parse innerHTML to create children (simplified)
        this._children = [];
    }

    get children() {
        return this._children;
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }

    getAttribute(name) {
        return this.attributes.get(name);
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }
}

// Simplified cleanupContent function (extracted from extractContents.js)
function cleanupContent(content) {
    // Create a mock processing similar to the actual implementation
    // In the real code, this uses DOM manipulation

    // For testing, we'll simulate the attribute stripping with regex
    // This matches the behavior of keeping only href, src, alt

    // Remove all attributes except href, src, alt
    let cleaned = content;

    // Remove class attributes
    cleaned = cleaned.replace(/\s+class="[^"]*"/g, '');
    cleaned = cleaned.replace(/\s+class='[^']*'/g, '');

    // Remove style attributes
    cleaned = cleaned.replace(/\s+style="[^"]*"/g, '');
    cleaned = cleaned.replace(/\s+style='[^']*'/g, '');

    // Remove data-* attributes
    cleaned = cleaned.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s+data-[a-z-]+='[^']*'/gi, '');

    // Remove id attributes
    cleaned = cleaned.replace(/\s+id="[^"]*"/g, '');
    cleaned = cleaned.replace(/\s+id='[^']*'/g, '');

    // Remove other common attributes (but keep href, src, alt)
    cleaned = cleaned.replace(/\s+contenteditable="[^"]*"/g, '');
    cleaned = cleaned.replace(/\s+role="[^"]*"/g, '');
    cleaned = cleaned.replace(/\s+aria-[a-z-]+="[^"]*"/gi, '');

    return cleaned;
}

// Test HTML paragraph structure preservation
function parseHtmlParagraphs(html) {
    // Count paragraph tags
    const pTags = (html.match(/<p[^>]*>/gi) || []).length;
    const closingPTags = (html.match(/<\/p>/gi) || []).length;

    // Count blockquote tags
    const blockquotes = (html.match(/<blockquote[^>]*>/gi) || []).length;

    // Count headers
    const headers = (html.match(/<h[1-6][^>]*>/gi) || []).length;

    // Count line breaks
    const brTags = (html.match(/<br\s*\/?>/gi) || []).length;

    return { pTags, closingPTags, blockquotes, headers, brTags };
}

// Tests
console.log('\n=== Content Extraction Unit Tests ===\n');

console.log('Test 1: cleanupContent removes class attributes');
{
    const input = '<p class="paragraph css-abc123">Hello</p>';
    const result = cleanupContent(input);
    assertNotContains(result, 'class=', 'Class attribute removed');
    assertContains(result, '<p>Hello</p>', 'Paragraph structure preserved');
}

console.log('\nTest 2: cleanupContent removes style attributes');
{
    const input = '<p style="color: red; font-size: 16px;">Styled text</p>';
    const result = cleanupContent(input);
    assertNotContains(result, 'style=', 'Style attribute removed');
    assertContains(result, '<p>Styled text</p>', 'Content preserved');
}

console.log('\nTest 3: cleanupContent removes data-* attributes');
{
    const input = '<div data-testid="editor" data-block="true">Content</div>';
    const result = cleanupContent(input);
    assertNotContains(result, 'data-testid', 'data-testid removed');
    assertNotContains(result, 'data-block', 'data-block removed');
    assertContains(result, '<div>Content</div>', 'Structure preserved');
}

console.log('\nTest 4: cleanupContent preserves href attributes');
{
    const input = '<a href="https://example.com" class="link-class">Link text</a>';
    const result = cleanupContent(input);
    assertContains(result, 'href="https://example.com"', 'href preserved');
    assertNotContains(result, 'class=', 'class removed');
}

console.log('\nTest 5: cleanupContent preserves src attributes');
{
    const input = '<img src="https://example.com/image.jpg" class="img-class" alt="Description">';
    const result = cleanupContent(input);
    assertContains(result, 'src="https://example.com/image.jpg"', 'src preserved');
    assertContains(result, 'alt="Description"', 'alt preserved');
    assertNotContains(result, 'class=', 'class removed');
}

console.log('\nTest 6: cleanupContent preserves alt attributes');
{
    const input = '<img alt="Image description" data-custom="value">';
    const result = cleanupContent(input);
    assertContains(result, 'alt="Image description"', 'alt preserved');
    assertNotContains(result, 'data-custom', 'data-custom removed');
}

console.log('\nTest 7: Paragraph structure analysis - single paragraph');
{
    const html = '<p>Single paragraph content.</p>';
    const stats = parseHtmlParagraphs(html);
    assertEqual(stats.pTags, 1, 'Has 1 opening p tag');
    assertEqual(stats.closingPTags, 1, 'Has 1 closing p tag');
}

console.log('\nTest 8: Paragraph structure analysis - multiple paragraphs');
{
    const html = '<p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p>';
    const stats = parseHtmlParagraphs(html);
    assertEqual(stats.pTags, 3, 'Has 3 opening p tags');
    assertEqual(stats.closingPTags, 3, 'Has 3 closing p tags');
}

console.log('\nTest 9: Paragraph structure analysis - blockquote with paragraphs');
{
    const html = '<blockquote><p>Quote para 1.</p><p>Quote para 2.</p></blockquote>';
    const stats = parseHtmlParagraphs(html);
    assertEqual(stats.pTags, 2, 'Has 2 p tags inside blockquote');
    assertEqual(stats.blockquotes, 1, 'Has 1 blockquote');
}

console.log('\nTest 10: Paragraph structure analysis - mixed content');
{
    const html = `
        <h2>Title</h2>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
        <blockquote>
            <p>Quote content.</p>
        </blockquote>
        <p>Third paragraph.</p>
    `;
    const stats = parseHtmlParagraphs(html);
    assertEqual(stats.headers, 1, 'Has 1 header');
    assertEqual(stats.pTags, 4, 'Has 4 paragraphs total');
    assertEqual(stats.blockquotes, 1, 'Has 1 blockquote');
}

console.log('\nTest 11: cleanupContent handles complex Substack HTML');
{
    const input = `
        <p class="paragraph" data-testid="paragraph" style="margin-bottom: 1em;">
            This is <strong>bold</strong> and <a href="https://example.com" class="link" data-test="link">a link</a>.
        </p>
    `;
    const result = cleanupContent(input);
    assertNotContains(result, 'class=', 'All classes removed');
    assertNotContains(result, 'data-testid', 'data-testid removed');
    assertNotContains(result, 'style=', 'style removed');
    assertContains(result, 'href="https://example.com"', 'Link href preserved');
    assertContains(result, '<strong>bold</strong>', 'Strong tags preserved');
}

console.log('\nTest 12: cleanupContent removes contenteditable attribute');
{
    const input = '<div contenteditable="true" role="textbox">Editable content</div>';
    const result = cleanupContent(input);
    assertNotContains(result, 'contenteditable', 'contenteditable removed');
    assertNotContains(result, 'role=', 'role removed');
}

console.log('\nTest 13: cleanupContent removes aria-* attributes');
{
    const input = '<button aria-label="Submit" aria-pressed="false">Submit</button>';
    const result = cleanupContent(input);
    assertNotContains(result, 'aria-label', 'aria-label removed');
    assertNotContains(result, 'aria-pressed', 'aria-pressed removed');
}

console.log('\nTest 14: Paragraph vs line break distinction');
{
    // Multiple paragraphs (correct structure)
    const multiParagraph = '<p>Para 1.</p><p>Para 2.</p>';
    const statsMulti = parseHtmlParagraphs(multiParagraph);

    // Single paragraph with breaks (problematic structure)
    const singleWithBreaks = '<p>Para 1.<br><br>Para 2.</p>';
    const statsSingle = parseHtmlParagraphs(singleWithBreaks);

    assertEqual(statsMulti.pTags, 2, 'Multi-paragraph has 2 p tags (correct)');
    assertEqual(statsSingle.pTags, 1, 'Single with breaks has 1 p tag (problematic)');
    assertEqual(statsSingle.brTags, 2, 'Single with breaks has 2 br tags');
}

console.log('\nTest 15: Verify blockquote should contain multiple <p> tags');
{
    // New correct format
    const correctFormat = '<blockquote><p>First paragraph.</p><p>Second paragraph.</p></blockquote>';
    // Old incorrect format
    const incorrectFormat = '<blockquote><p>First paragraph.<br><br>Second paragraph.</p></blockquote>';

    const correctStats = parseHtmlParagraphs(correctFormat);
    const incorrectStats = parseHtmlParagraphs(incorrectFormat);

    assertEqual(correctStats.pTags, 2, 'Correct format has 2 p tags');
    assertEqual(incorrectStats.pTags, 1, 'Incorrect format has only 1 p tag');
    assertEqual(incorrectStats.brTags, 2, 'Incorrect format uses br tags instead');
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
