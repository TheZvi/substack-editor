/**
 * Unit tests for the isVisuallyEmpty predicate used by removeBlanks() in
 * popup.js (Remove Blank Sections button and Post Workup step 3).
 * The predicate decides which blocks count as dead whitespace; the DOM
 * traversal around it is exercised manually in the Substack editor.
 * Run with: node tests/removeBlanks.test.js
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
// Copied from popup.js removeBlanks() — keep in sync
// ============================================================================

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;
const BOUNDARY_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR'];
const isVisuallyEmpty = (el) => {
    if (!el) return false;
    if (BOUNDARY_TAGS.includes(el.tagName)) return false;
    if (el.querySelector('img, figure, iframe, video, audio, embed, object, hr')) return false;
    return el.textContent.replace(ZERO_WIDTH, '').trim() === '';
};

// ============================================================================
// Mock elements (the predicate only touches tagName/querySelector/textContent)
// ============================================================================

function mockEl(tagName, textContent, hasMedia = false) {
    return {
        tagName,
        textContent,
        querySelector: () => (hasMedia ? {} : null),
    };
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n--- isVisuallyEmpty: empty blocks ---');
assertEqual(isVisuallyEmpty(mockEl('P', '')), true, 'Truly empty paragraph');
assertEqual(isVisuallyEmpty(mockEl('P', '   ')), true, 'Whitespace-only paragraph');
assertEqual(isVisuallyEmpty(mockEl('P', ' ')), true, 'Non-breaking-space-only paragraph');
assertEqual(isVisuallyEmpty(mockEl('P', '​')), true, 'Zero-width-space paragraph (blockquote shortcut placeholder)');
assertEqual(isVisuallyEmpty(mockEl('P', '﻿‌‍')), true, 'Other zero-width characters');
assertEqual(isVisuallyEmpty(mockEl('P', ' ​ \n ')), true, 'Mixed whitespace and zero-width');
assertEqual(isVisuallyEmpty(mockEl('DIV', '')), true, 'Empty div');
assertEqual(isVisuallyEmpty(mockEl('BLOCKQUOTE', '  ')), true, 'Empty blockquote');

console.log('\n--- isVisuallyEmpty: content blocks are kept ---');
assertEqual(isVisuallyEmpty(mockEl('P', 'Real text.')), false, 'Paragraph with text');
assertEqual(isVisuallyEmpty(mockEl('P', '​X')), false, 'Zero-width char plus real text');
assertEqual(isVisuallyEmpty(mockEl('P', '', true)), false, 'Captionless image block (empty text, has media)');
assertEqual(isVisuallyEmpty(mockEl('FIGURE', '', true)), false, 'Figure with embed');

console.log('\n--- isVisuallyEmpty: boundaries are never whitespace ---');
assertEqual(isVisuallyEmpty(mockEl('H1', '')), false, 'Empty h1 not treated as whitespace');
assertEqual(isVisuallyEmpty(mockEl('H4', '')), false, 'Empty h4 not treated as whitespace');
assertEqual(isVisuallyEmpty(mockEl('HR', '')), false, 'Divider not treated as whitespace');

console.log('\n--- isVisuallyEmpty: null safety ---');
assertEqual(isVisuallyEmpty(null), false, 'Null element (walk termination)');
assertEqual(isVisuallyEmpty(undefined), false, 'Undefined element');

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
