/**
 * Unit tests for archive snapshot URL handling in universal/quote-copy.js
 * (isArchiveHost, extractEmbeddedUrl — used to key website annotations off
 * the original site and link quotes to the original URL).
 * Run with: node tests/archiveUrl.test.js
 */

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

// ============================================================================
// Functions copied from universal/quote-copy.js for testing
// ============================================================================

const ARCHIVE_HOST_PATTERN = /(^|\.)(archive\.(is|ph|today|md|li|vn|fo)|web\.archive\.org)$/i;

function isArchiveHost(hostname) {
    return ARCHIVE_HOST_PATTERN.test(hostname || '');
}

function extractEmbeddedUrl(url) {
    if (!url) return null;
    const match = url.match(/^https?:\/\/[^/]+\/.*?(https?:\/\/?.+)$/i);
    if (!match) return null;
    // Wayback sometimes collapses "https://" to "https:/" — restore it
    return match[1].replace(/^(https?:\/)([^/])/i, '$1/$2');
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n--- isArchiveHost ---');
assertEqual(isArchiveHost('archive.is'), true, 'archive.is');
assertEqual(isArchiveHost('archive.ph'), true, 'archive.ph');
assertEqual(isArchiveHost('archive.today'), true, 'archive.today');
assertEqual(isArchiveHost('archive.md'), true, 'archive.md');
assertEqual(isArchiveHost('archive.li'), true, 'archive.li');
assertEqual(isArchiveHost('archive.vn'), true, 'archive.vn');
assertEqual(isArchiveHost('archive.fo'), true, 'archive.fo');
assertEqual(isArchiveHost('www.archive.today'), true, 'www.archive.today subdomain');
assertEqual(isArchiveHost('web.archive.org'), true, 'Wayback Machine web.archive.org');
assertEqual(isArchiveHost('axios.com'), false, 'Ordinary site is not an archive host');
assertEqual(isArchiveHost('myarchive.is'), false, 'Suffix without dot boundary does not match');
assertEqual(isArchiveHost('archive.org'), false, 'Bare archive.org (not web.) is not a snapshot host');
assertEqual(isArchiveHost(''), false, 'Empty hostname');
assertEqual(isArchiveHost(null), false, 'Null hostname');

console.log('\n--- extractEmbeddedUrl ---');
assertEqual(
    extractEmbeddedUrl('https://archive.is/2026.06.27-130734/https://www.axios.com/2026/06/27/anthropic-fable-5-return-soon'),
    'https://www.axios.com/2026/06/27/anthropic-fable-5-return-soon',
    'archive.is full-form snapshot URL (canonical link format)'
);
assertEqual(
    extractEmbeddedUrl('https://archive.is/o/cXCJ0/https://www.axios.com/authors/mikeallen'),
    'https://www.axios.com/authors/mikeallen',
    'archive.is rewritten in-page link (/o/<code>/ form)'
);
assertEqual(
    extractEmbeddedUrl('https://web.archive.org/web/20260627000000/https://www.axios.com/page'),
    'https://www.axios.com/page',
    'Wayback Machine snapshot URL'
);
assertEqual(
    extractEmbeddedUrl('https://web.archive.org/web/20260627000000/https:/www.axios.com/page'),
    'https://www.axios.com/page',
    'Wayback collapsed "https:/" is restored to "https://"'
);
assertEqual(
    extractEmbeddedUrl('http://archive.ph/2026/http://example.com/article?id=3'),
    'http://example.com/article?id=3',
    'http original URL with query string survives'
);
assertEqual(
    extractEmbeddedUrl('https://archive.is/cXCJ0'),
    null,
    'Short-form snapshot URL has no embedded URL'
);
assertEqual(
    extractEmbeddedUrl('https://www.axios.com/2026/06/27/some-article'),
    null,
    'Ordinary article URL has no embedded URL'
);
assertEqual(extractEmbeddedUrl(''), null, 'Empty string returns null');
assertEqual(extractEmbeddedUrl(null), null, 'Null returns null');

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
