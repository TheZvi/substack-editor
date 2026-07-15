/**
 * Unit tests for the paste sanitizer in content.js (sanitizePastedHtml /
 * needsPasteSanitizing). Substack-internal copies sometimes carry Chrome's
 * generic clipboard serialization (no data-pm-slice) whose
 * white-space:break-spaces styles make ProseMirror preserve the CF_HTML
 * wrapper's \r\n newlines as hard breaks — reliably producing two blank
 * lines at the top of the paste.
 * Run with: node tests/pasteSanitizer.test.js
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
// Copied from content.js — keep in sync
// ============================================================================

function sanitizePastedHtml(html) {
    let s = html;
    s = s.replace(/white-space:\s*(break-spaces|pre-wrap|pre-line|pre)\s*;?\s*/gi, '');
    s = s.replace(/(<html[^>]*>)\s+/gi, '$1')
         .replace(/(<body[^>]*>)\s+/gi, '$1')
         .replace(/\s+(<\/body>)/gi, '$1')
         .replace(/\s+(<\/html>)/gi, '$1')
         .replace(/(<!--StartFragment-->)\s+/gi, '$1')
         .replace(/\s+(<!--EndFragment-->)/gi, '$1');
    return s;
}

function needsPasteSanitizing(html) {
    if (!html || html.includes('data-pm-slice')) return false;
    return /white-space:\s*(break-spaces|pre)/i.test(html) ||
        /<body[^>]*>\s*[\r\n]/i.test(html);
}

// ============================================================================
// Tests
// ============================================================================

// The shape Chrome actually produces for a within-Substack copy (captured
// live 2026-07-15): CRLF after <html> and <body>, break-spaces styles.
const genericSubstackHtml = '<html>\r\n<body>\r\n<!--StartFragment--><span style="color: rgb(33,34,34); white-space: break-spaces; font-size: 19px;">Copied line.</span><!--EndFragment-->\r\n</body>\r\n</html>';

console.log('\n--- needsPasteSanitizing ---');
assertEqual(needsPasteSanitizing(genericSubstackHtml), true, 'Generic Substack copy matches the signature');
assertEqual(
    needsPasteSanitizing('<p data-pm-slice="1 1 []">Clean ProseMirror copy</p>'),
    false,
    'ProseMirror-serialized copy is left alone'
);
assertEqual(
    needsPasteSanitizing('<html><body><!--StartFragment--><b>Plain bold</b><!--EndFragment--></body></html>'),
    false,
    'Ordinary HTML without whitespace styles or wrapper newlines is left alone'
);
assertEqual(
    needsPasteSanitizing('<html>\r\n<body>\r\n<p>Wrapper newlines alone</p></body></html>'),
    true,
    'Wrapper newlines after body match even without white-space styles'
);
assertEqual(needsPasteSanitizing(''), false, 'Empty clipboard HTML is left alone');
assertEqual(needsPasteSanitizing(null), false, 'Null clipboard HTML is left alone');
assertEqual(
    needsPasteSanitizing('<div style="white-space: pre-wrap;">tweet text</div>'),
    true,
    'pre-wrap styles match the signature'
);

console.log('\n--- sanitizePastedHtml ---');
{
    const cleaned = sanitizePastedHtml(genericSubstackHtml);
    assertEqual(/<html[^>]*>\s/.test(cleaned), false, 'No whitespace after <html>');
    assertEqual(/<body[^>]*>\s/.test(cleaned), false, 'No whitespace after <body>');
    assertEqual(/white-space/i.test(cleaned), false, 'white-space styles stripped');
    assertEqual(cleaned.includes('Copied line.'), true, 'Content preserved');
    assertEqual(cleaned.includes('color: rgb(33,34,34)'), true, 'Other styles untouched');
}
assertEqual(
    sanitizePastedHtml('<span style="white-space: break-spaces; color: red;">x</span>'),
    '<span style="color: red;">x</span>',
    'break-spaces removed from style attribute, rest kept'
);
assertEqual(
    sanitizePastedHtml('<!--StartFragment-->\r\n<p>text</p>\r\n<!--EndFragment-->'),
    '<!--StartFragment--><p>text</p><!--EndFragment-->',
    'Newlines around fragment markers stripped'
);
assertEqual(
    sanitizePastedHtml('<p>Line with  internal   spaces</p>'),
    '<p>Line with  internal   spaces</p>',
    'Internal content whitespace untouched'
);

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
