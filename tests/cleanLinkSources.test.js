/**
 * Unit tests for cleanLinkSources function
 * Run with: node tests/cleanLinkSources.test.js
 */

// Mock DOM environment
class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.attributes = {};
        this.children = [];
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return this.attributes[name];
    }

    get href() {
        return this.attributes.href;
    }

    set href(value) {
        this.attributes.href = value;
    }

    querySelectorAll(selector) {
        if (selector === 'a[href]') {
            return this.children.filter(c => c.tagName === 'A' && c.attributes.href);
        }
        return [];
    }
}

class MockDocument {
    constructor() {
        this.elements = {};
    }

    setElement(selector, element) {
        this.elements[selector] = element;
    }

    querySelector(selector) {
        return this.elements[selector] || null;
    }
}

// The function under test (extracted from popup.js)
function cleanLinkSources(mockDocument) {
    try {
        console.log("Starting cleanLinkSources");

        // Find the editor - try multiple selectors used by Substack
        const editor = mockDocument.querySelector('.ProseMirror') ||
                      mockDocument.querySelector('[contenteditable="true"]') ||
                      mockDocument.querySelector('div[role="article"]');

        if (!editor) {
            console.error("Could not find editor element");
            return { success: false, error: "Could not find editor" };
        }

        const links = editor.querySelectorAll('a[href]');
        console.log(`Found ${links.length} links to check`);

        let count = 0;
        links.forEach(link => {
            try {
                const url = new URL(link.href);
                if (url.search) {  // has query parameters
                    console.log(`Cleaning: ${link.href}`);
                    url.search = '';  // remove all query params
                    link.href = url.toString();
                    count++;
                }
            } catch (e) {
                // Skip invalid URLs
                console.log(`Skipping invalid URL: ${link.href}`);
            }
        });

        console.log(`Cleaned ${count} links`);
        return { success: true, count };

    } catch (e) {
        console.error("Error in cleanLinkSources:", e);
        return { success: false, error: e.message };
    }
}

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

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr === expectedStr) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected: ${expectedStr}`);
        console.log(`    Actual:   ${actualStr}`);
        testsFailed++;
    }
}

// Helper to create a link element
function createLink(href) {
    const link = new MockElement('A');
    link.href = href;
    return link;
}

// Helper to create editor with links
function createEditorWithLinks(hrefs) {
    const editor = new MockElement('DIV');
    hrefs.forEach(href => {
        editor.children.push(createLink(href));
    });
    const doc = new MockDocument();
    doc.setElement('.ProseMirror', editor);
    return { doc, editor };
}

// Tests
console.log('\n=== cleanLinkSources Unit Tests ===\n');

console.log('Test 1: Strips single query parameter');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/article?source=ChatGPT'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 1, 'Reports 1 link cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/article', 'URL is cleaned');
}

console.log('\nTest 2: Strips multiple query parameters');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/article?source=ChatGPT&utm_medium=social&ref=abc'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 1, 'Reports 1 link cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/article', 'All params removed');
}

console.log('\nTest 3: Leaves clean URLs unchanged');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/article'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 0, 'Reports 0 links cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/article', 'URL unchanged');
}

console.log('\nTest 4: Handles multiple links with mixed states');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/clean',
        'https://example.com/dirty?source=test',
        'https://other.com/page?utm_source=newsletter',
        'https://third.com/no-params'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 2, 'Reports 2 links cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/clean', 'Clean URL unchanged');
    assertEqual(editor.children[1].href, 'https://example.com/dirty', 'First dirty URL cleaned');
    assertEqual(editor.children[2].href, 'https://other.com/page', 'Second dirty URL cleaned');
    assertEqual(editor.children[3].href, 'https://third.com/no-params', 'Another clean URL unchanged');
}

console.log('\nTest 5: Preserves URL fragments (anchors)');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/article?source=test#section-1'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 1, 'Reports 1 link cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/article#section-1', 'Fragment preserved');
}

console.log('\nTest 6: Handles URLs with paths');
{
    const { doc, editor } = createEditorWithLinks([
        'https://thezvi.substack.com/p/my-post-title?utm_source=publication-search'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 1, 'Reports 1 link cleaned');
    assertEqual(editor.children[0].href, 'https://thezvi.substack.com/p/my-post-title', 'Path preserved, params removed');
}

console.log('\nTest 7: Returns error when no editor found');
{
    const doc = new MockDocument();  // No editor set
    const result = cleanLinkSources(doc);
    assertEqual(result.success, false, 'Returns failure');
    assertEqual(result.error, 'Could not find editor', 'Correct error message');
}

console.log('\nTest 8: Handles empty editor (no links)');
{
    const { doc } = createEditorWithLinks([]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 0, 'Reports 0 links cleaned');
}

console.log('\nTest 9: Handles URLs with only query string (edge case)');
{
    const { doc, editor } = createEditorWithLinks([
        'https://example.com/?foo=bar'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 1, 'Reports 1 link cleaned');
    assertEqual(editor.children[0].href, 'https://example.com/', 'Trailing slash preserved');
}

console.log('\nTest 10: Handles complex real-world Substack URLs');
{
    const { doc, editor } = createEditorWithLinks([
        'https://thezvi.substack.com/p/ai-governance?utm_source=publication-search&utm_campaign=monthly',
        'https://astralcodexten.substack.com/p/some-post?source=post_page',
        'https://www.lesswrong.com/posts/abc123/title?ref=thezvi'
    ]);
    const result = cleanLinkSources(doc);
    assertEqual(result.success, true, 'Returns success');
    assertEqual(result.count, 3, 'Reports 3 links cleaned');
    assertEqual(editor.children[0].href, 'https://thezvi.substack.com/p/ai-governance', 'Substack URL cleaned');
    assertEqual(editor.children[1].href, 'https://astralcodexten.substack.com/p/some-post', 'ACX URL cleaned');
    assertEqual(editor.children[2].href, 'https://www.lesswrong.com/posts/abc123/title', 'LessWrong URL cleaned');
}

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
