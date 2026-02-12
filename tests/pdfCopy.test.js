/**
 * Unit tests for PDF copy functionality in universal/quote-copy.js
 * Run with: node tests/pdfCopy.test.js
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

function assertTrue(actual, message) {
    if (actual === true) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected: true`);
        console.log(`    Actual:   ${actual}`);
        testsFailed++;
    }
}

function assertFalse(actual, message) {
    if (actual === false) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected: false`);
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

// ============================================================================
// Functions copied from universal/quote-copy.js for testing
// ============================================================================

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUPERSCRIPT_DIGIT_PATTERN = `[${SUPERSCRIPT_DIGITS}]`;

function isOnlyFootnotes(text) {
    if (!text || !text.trim()) return false;

    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) return false;

    const footnotePattern = new RegExp(
        `^\\s*(${SUPERSCRIPT_DIGIT_PATTERN}+|\\d+\\.?)\\s+[A-Z]`,
        'i'
    );

    let footnoteLineCount = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (footnotePattern.test(trimmed)) {
            footnoteLineCount++;
        }
    }

    return footnoteLineCount / lines.length > 0.7;
}

function removeFootnoteReferences(text) {
    if (!text) return text;

    let result = text;

    // Pattern 1: Multi-digit superscripts (³⁵, ¹²³) - almost always footnotes
    result = result.replace(
        new RegExp(`${SUPERSCRIPT_DIGIT_PATTERN}{2,}`, 'g'),
        ''
    );

    // Pattern 2: Single superscript digit after punctuation (word.³, word,³) - likely footnote
    result = result.replace(
        new RegExp(`([.,;:'"\\)\\]])${SUPERSCRIPT_DIGIT_PATTERN}`, 'g'),
        '$1'
    );

    // Pattern 3: Single superscript at end of line AFTER a word (not a single letter) - likely footnote
    result = result.replace(
        new RegExp(`([a-zA-Z]{2,})${SUPERSCRIPT_DIGIT_PATTERN}(?=\\s*$)`, 'gm'),
        '$1'
    );

    // Do NOT remove single superscript after single letters (x², y², z²) - likely math

    return result;
}

function removePageNumbers(text) {
    if (!text) return text;
    return text.replace(/^\s*\d{1,4}\s*$/gm, '');
}

function removeFootnoteText(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let inFootnoteSection = false;

    const footnoteLinePattern = new RegExp(
        `^\\s*(${SUPERSCRIPT_DIGIT_PATTERN}+|\\d{1,3})\\s+[A-Z]`,
        'i'
    );

    const urlLinePattern = /^\s*https?:\/\//i;
    const sectionHeaderPattern = /^[A-Z][^:]{2,50}:$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (footnoteLinePattern.test(trimmed)) {
            inFootnoteSection = true;
            continue;
        }

        if (inFootnoteSection) {
            if (urlLinePattern.test(trimmed)) {
                continue;
            }

            const isBulletLine = /^[•●○▪▸►\-\*]\s/.test(trimmed);
            const isNumberedLine = /^\d+\.\s/.test(trimmed);
            const isSectionHeader = sectionHeaderPattern.test(trimmed);
            const isBlankLine = trimmed === '';
            const prevWasBlank = i > 0 && lines[i - 1]?.trim() === '';

            if (isBulletLine || isNumberedLine || isSectionHeader) {
                inFootnoteSection = false;
            } else if (isBlankLine) {
                const nextLine = lines[i + 1]?.trim();
                const nextIsBullet = nextLine && /^[•●○▪▸►\-\*]\s/.test(nextLine);
                const nextIsNumbered = nextLine && /^\d+\.\s/.test(nextLine);
                const nextIsHeader = nextLine && sectionHeaderPattern.test(nextLine);
                const nextIsFootnote = nextLine && footnoteLinePattern.test(nextLine);
                const nextIsUrl = nextLine && urlLinePattern.test(nextLine);

                if (nextIsBullet || nextIsNumbered || nextIsHeader) {
                    inFootnoteSection = false;
                } else if (nextIsFootnote || nextIsUrl) {
                    continue;
                } else if (!nextLine) {
                    inFootnoteSection = false;
                }
                if (inFootnoteSection) continue;
            } else if (trimmed && prevWasBlank) {
                if (/^[A-Z]/.test(trimmed) && !urlLinePattern.test(trimmed)) {
                    if (trimmed.length > 60 || /^[A-Z][a-z]+\s+(is|are|was|were|the|a|an)\s/i.test(trimmed)) {
                        inFootnoteSection = false;
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }
            } else if (trimmed) {
                continue;
            }
        }

        if (!inFootnoteSection) {
            result.push(line);
        }
    }

    return result.join('\n');
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatListsAsHtml(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let inBulletList = false;
    let inNumberedList = false;

    const bulletPattern = /^[•●○▪▸►\-\*]\s+(.+)$/;
    const numberedPattern = /^\d+\.\s+(.+)$/;

    for (const line of lines) {
        const trimmed = line.trim();

        const bulletMatch = trimmed.match(bulletPattern);
        const numberedMatch = trimmed.match(numberedPattern);

        if (bulletMatch) {
            if (!inBulletList) {
                if (inNumberedList) {
                    result.push('</ol>');
                    inNumberedList = false;
                }
                result.push('<ul>');
                inBulletList = true;
            }
            result.push(`<li>${escapeHtml(bulletMatch[1])}</li>`);
        } else if (numberedMatch) {
            if (!inNumberedList) {
                if (inBulletList) {
                    result.push('</ul>');
                    inBulletList = false;
                }
                result.push('<ol>');
                inNumberedList = true;
            }
            result.push(`<li>${escapeHtml(numberedMatch[1])}</li>`);
        } else {
            if (inBulletList) {
                result.push('</ul>');
                inBulletList = false;
            }
            if (inNumberedList) {
                result.push('</ol>');
                inNumberedList = false;
            }
            if (trimmed) {
                result.push(`<p>${escapeHtml(trimmed)}</p>`);
            }
        }
    }

    if (inBulletList) result.push('</ul>');
    if (inNumberedList) result.push('</ol>');

    return result.join('\n');
}

function linkifyUrls(text) {
    if (!text) return text;

    const urlPattern = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;

    return text.replace(urlPattern, (match) => {
        const href = match.startsWith('www.') ? 'https://' + match : match;
        return `<a href="${href}">${match}</a>`;
    });
}

function joinPdfLineBreaks(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let currentParagraph = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            continue;
        }

        const isBulletLine = /^[•●○▪▸►\-\*]\s/.test(trimmed);
        const isNumberedLine = /^\d+\.\s/.test(trimmed);

        if (isBulletLine || isNumberedLine) {
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            result.push(trimmed);
            continue;
        }

        const isFootnoteLine = new RegExp(
            `^(${SUPERSCRIPT_DIGIT_PATTERN}+|\\d{1,3})\\s+[A-Z][a-z]+[,.]`,
            'i'
        ).test(trimmed);

        if (isFootnoteLine) {
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            result.push(trimmed);
            continue;
        }

        if (currentParagraph) {
            if (currentParagraph.endsWith('-')) {
                currentParagraph = currentParagraph.slice(0, -1) + trimmed;
            } else {
                currentParagraph += ' ' + trimmed;
            }
        } else {
            currentParagraph = trimmed;
        }
    }

    if (currentParagraph) {
        result.push(currentParagraph);
    }

    return result.join('\n\n');
}

function removeInlineFootnoteNumbers(text) {
    if (!text) return text;

    let result = text.replace(/([.!?\)\]])(\d{1,3})\s+([A-Z])/g, '$1 $3');
    result = result.replace(/(\w)(\d{2})\s+(We|The|A|An|This|That|It|They|In|On|As|To|For)\b/g, '$1 $3');
    result = result.replace(/([.!?\)\]])(\d{1,3})$/g, '$1');
    result = result.replace(/(\w)(\d{2})$/g, '$1');

    return result;
}

function processPdfText(text) {
    if (!text) return { text: '', html: '' };

    if (isOnlyFootnotes(text)) {
        const html = linkifyUrls(escapeHtml(text).replace(/\n/g, '<br>'));
        return { text: text, html: html };
    }

    let processed = text;
    processed = joinPdfLineBreaks(processed);
    processed = removeFootnoteText(processed);
    processed = removePageNumbers(processed);
    processed = removeFootnoteReferences(processed);
    processed = removeInlineFootnoteNumbers(processed);
    processed = processed.replace(/\n{3,}/g, '\n\n');
    processed = processed.replace(/  +/g, ' ');
    processed = processed.trim();

    let html = formatListsAsHtml(processed);
    html = linkifyUrls(html);

    return { text: processed, html: html };
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n=== PDF Copy Tests ===\n');

// ============================================================================
// joinPdfLineBreaks tests
// ============================================================================

console.log('--- joinPdfLineBreaks ---');

(function testJoinSimpleLineBreaks() {
    const input = 'We performed a lightweight model-graded evaluation for sandbagging or refusals in\nour dangerous capability evaluations.';
    const result = joinPdfLineBreaks(input);
    assertContains(result, 'refusals in our dangerous', 'Joins wrapped lines with space');
    assertNotContains(result, '\n', 'No newlines in output for simple paragraph');
})();

(function testJoinMultipleWrappedLines() {
    const input = 'First line of\nthe paragraph that\ncontinues here.';
    const result = joinPdfLineBreaks(input);
    assertEqual(result, 'First line of the paragraph that continues here.', 'Joins multiple wrapped lines');
})();

(function testPreserveParagraphBreaks() {
    const input = 'First paragraph here.\n\nSecond paragraph starts.';
    const result = joinPdfLineBreaks(input);
    assertContains(result, '\n\n', 'Preserves double newline paragraph break');
})();

(function testPreserveBulletLists() {
    const input = '• First bullet item\n• Second bullet item';
    const result = joinPdfLineBreaks(input);
    assertContains(result, '• First bullet', 'Preserves first bullet');
    assertContains(result, '• Second bullet', 'Preserves second bullet');
})();

(function testPreserveNumberedLists() {
    const input = '1. First item\n2. Second item';
    const result = joinPdfLineBreaks(input);
    assertContains(result, '1. First item', 'Preserves numbered list');
})();

(function testJoinHyphenatedWords() {
    const input = 'This is a hyphen-\nated word in the text.';
    const result = joinPdfLineBreaks(input);
    assertContains(result, 'hyphenated word', 'Joins hyphenated words correctly');
    assertNotContains(result, 'hyphen-', 'Removes trailing hyphen');
})();

(function testRealWorldPdfText() {
    const input = `We performed a lightweight model-graded evaluation for sandbagging or refusals in
our dangerous capability evaluations. We drew a random sample of 1,000 of these evaluation
transcripts from a mixture of (i) two partially-trained snapshots from the Claude Opus 4.6
training run, (ii) the final [model] snapshot, and (iii) a helpful-only snapshot.56 We asked
Claude Sonnet 4.5 to grade each transcript for signs of refusal, deliberate inaccuracy, low
helpfulness, or consideration of such actions, as well as a generic score for things that
seemed unusual or concerning in the transcript.57`;
    const result = joinPdfLineBreaks(input);
    assertContains(result, 'refusals in our dangerous capability', 'Joins first line break');
    assertContains(result, 'evaluation transcripts from', 'Joins second line break');
    assertNotContains(result, 'in\nour', 'No artificial breaks remain');
})();

// ============================================================================
// removeInlineFootnoteNumbers tests
// ============================================================================

console.log('\n--- removeInlineFootnoteNumbers ---');

(function testRemoveFootnoteAfterPeriod() {
    const input = 'snapshot.56 We asked Claude';
    const result = removeInlineFootnoteNumbers(input);
    assertEqual(result, 'snapshot. We asked Claude', 'Removes footnote number after period');
})();

(function testRemoveFootnoteAfterParen() {
    const input = 'text here)57 The next sentence';
    const result = removeInlineFootnoteNumbers(input);
    assertEqual(result, 'text here) The next sentence', 'Removes footnote number after parenthesis');
})();

(function testRemoveFootnoteInMiddle() {
    const input = 'word56 We found that';
    const result = removeInlineFootnoteNumbers(input);
    assertEqual(result, 'word We found that', 'Removes footnote number after word');
})();

(function testPreserveActualNumbers() {
    const input = 'We drew a sample of 1,000 of these';
    const result = removeInlineFootnoteNumbers(input);
    assertContains(result, '1,000', 'Preserves actual numbers in text');
})();

(function testPreserveYears() {
    const input = 'In 2024 we conducted research';
    const result = removeInlineFootnoteNumbers(input);
    assertContains(result, '2024', 'Preserves years');
})();

(function testMultipleFootnotes() {
    const input = 'first point.55 We then second point.56 They also';
    const result = removeInlineFootnoteNumbers(input);
    assertNotContains(result, '55', 'Removes first footnote');
    assertNotContains(result, '56', 'Removes second footnote');
    assertContains(result, 'point. We', 'Preserves text with space');
})();

(function testFootnoteAtEndOfText() {
    const input = 'concerning in the transcript.57';
    const result = removeInlineFootnoteNumbers(input);
    assertEqual(result, 'concerning in the transcript.', 'Removes footnote at end of text');
})();

(function testFootnoteAtEndNoSpace() {
    const input = 'end of sentence57';
    const result = removeInlineFootnoteNumbers(input);
    assertEqual(result, 'end of sentence', 'Removes footnote at end without punctuation');
})();

// ============================================================================
// removeFootnoteReferences tests
// ============================================================================

console.log('\n--- removeFootnoteReferences ---');

(function testRemoveFootnoteAfterWord() {
    const input = 'behavior spanning³⁵';
    const expected = 'behavior spanning';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes footnote after word');
})();

(function testRemoveFootnoteAfterPunctuation() {
    const input = 'voice.³⁶';
    const expected = 'voice.';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes footnote after period');
})();

(function testRemoveFootnoteAfterComma() {
    const input = 'first,³⁵ second';
    const expected = 'first, second';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes footnote after comma');
})();

(function testRemoveFootnoteAfterQuote() {
    const input = '"quoted"³⁷';
    const expected = '"quoted"';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes footnote after quote');
})();

(function testRemoveFootnoteAfterParen() {
    const input = '(parenthetical)³⁸';
    const expected = '(parenthetical)';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes footnote after parenthesis');
})();

(function testPreserveMathSuperscript() {
    const input = 'x² + y² = z²';
    const expected = 'x² + y² = z²';
    assertEqual(removeFootnoteReferences(input), expected, 'Preserves math superscripts');
})();

(function testPreserveMathWithSpaces() {
    const input = 'The formula x² is common';
    const expected = 'The formula x² is common';
    assertEqual(removeFootnoteReferences(input), expected, 'Preserves superscript in math context');
})();

(function testRemoveMultiDigitFootnote() {
    const input = 'text¹²³';
    const expected = 'text';
    assertEqual(removeFootnoteReferences(input), expected, 'Removes multi-digit footnote');
})();

(function testRemoveFootnoteEndOfLine() {
    const input = 'sentence end³⁵\nnext line';
    const result = removeFootnoteReferences(input);
    assertContains(result, 'sentence end', 'Preserves text before footnote');
    assertNotContains(result, '³⁵', 'Removes footnote at end of line');
})();

(function testMixedFootnotesAndMath() {
    const input = 'The x² formula³⁵ works';
    const result = removeFootnoteReferences(input);
    assertContains(result, 'x²', 'Preserves math superscript');
    assertNotContains(result, '³⁵', 'Removes footnote reference');
})();

// ============================================================================
// removePageNumbers tests
// ============================================================================

console.log('\n--- removePageNumbers ---');

(function testRemoveStandalonePageNumber() {
    const input = 'paragraph text\n\n107\n\nnext paragraph';
    const result = removePageNumbers(input);
    assertNotContains(result, '107', 'Removes standalone page number');
    assertContains(result, 'paragraph text', 'Preserves paragraph before');
    assertContains(result, 'next paragraph', 'Preserves paragraph after');
})();

(function testRemovePageNumberWithWhitespace() {
    const input = 'text\n   42   \nmore text';
    const result = removePageNumbers(input);
    assertNotContains(result, '42', 'Removes page number with whitespace');
})();

(function testPreserveNumberInText() {
    const input = 'There are 107 items in the list';
    const result = removePageNumbers(input);
    assertContains(result, '107', 'Preserves number within text');
})();

(function testPreserveNumberedList() {
    const input = '1. First item\n2. Second item';
    const result = removePageNumbers(input);
    assertContains(result, '1.', 'Preserves numbered list');
    assertContains(result, '2.', 'Preserves numbered list items');
})();

(function testRemoveMultiplePageNumbers() {
    const input = 'page one\n\n1\n\npage two\n\n2\n\nend';
    const result = removePageNumbers(input);
    assertEqual(result.match(/^\s*\d\s*$/gm), null, 'Removes all standalone page numbers');
})();

// ============================================================================
// removeFootnoteText tests
// ============================================================================

console.log('\n--- removeFootnoteText ---');

(function testRemoveSupersciriptFootnoteText() {
    const input = 'Main content here.\n\n³⁵ Treutlein, J. et al., 2026. Pre-deployment auditing.';
    const result = removeFootnoteText(input);
    assertContains(result, 'Main content', 'Preserves main content');
    assertNotContains(result, 'Treutlein', 'Removes footnote text');
})();

(function testRemoveRegularNumberFootnote() {
    const input = 'Main content here.\n\n35 Smith, J. et al., 2024. Some paper title.';
    const result = removeFootnoteText(input);
    assertContains(result, 'Main content', 'Preserves main content');
    assertNotContains(result, 'Smith', 'Removes regular number footnote');
})();

(function testRemoveFootnoteWithUrl() {
    const input = 'Main text.\n\n³⁵ Author name.\nhttps://example.com/paper';
    const result = removeFootnoteText(input);
    assertContains(result, 'Main text', 'Preserves main content');
    assertNotContains(result, 'https://example.com', 'Removes URL in footnote');
})();

(function testPreserveBulletListAfterFootnote() {
    const input = '³⁵ Footnote text.\n\n• Bullet item';
    const result = removeFootnoteText(input);
    assertContains(result, 'Bullet item', 'Preserves bullet list after footnote section');
})();

(function testPreserveMainContentWithFootnotes() {
    const input = `The aggregate metrics we report are as follows.

• Misaligned behavior: Catch-all for many forms of concerning behavior;
• Cooperation with human misuse: Cooperation with misuse by human users;

³⁵ Treutlein, J. et al., 2026.
https://alignment.anthropic.com/2026/auditing/

107`;
    const result = removeFootnoteText(input);
    assertContains(result, 'aggregate metrics', 'Preserves opening text');
    assertContains(result, 'Misaligned behavior', 'Preserves first bullet');
    assertContains(result, 'Cooperation with human misuse', 'Preserves second bullet');
    assertNotContains(result, 'Treutlein', 'Removes footnote author');
    assertNotContains(result, 'alignment.anthropic.com', 'Removes footnote URL');
})();

// ============================================================================
// isOnlyFootnotes tests
// ============================================================================

console.log('\n--- isOnlyFootnotes ---');

(function testDetectFootnotesOnly() {
    const input = '³⁵ Treutlein, J. et al., 2026. Pre-deployment auditing.\n³⁶ Another reference here.';
    assertTrue(isOnlyFootnotes(input), 'Detects footnote-only selection');
})();

(function testDetectRegularNumberFootnotes() {
    const input = '35 Smith, J. et al., 2024.\n36 Jones, K. et al., 2023.';
    assertTrue(isOnlyFootnotes(input), 'Detects regular number footnotes');
})();

(function testMixedContentNotFootnotesOnly() {
    const input = 'This is regular text.\n\n³⁵ Treutlein, J. et al.';
    assertFalse(isOnlyFootnotes(input), 'Mixed content is not footnotes-only');
})();

(function testBulletListNotFootnotes() {
    const input = '• First item\n• Second item\n• Third item';
    assertFalse(isOnlyFootnotes(input), 'Bullet list is not footnotes');
})();

(function testRegularParagraphNotFootnotes() {
    const input = 'This is a regular paragraph of text.\nWith multiple lines.\nAnd more content.';
    assertFalse(isOnlyFootnotes(input), 'Regular paragraph is not footnotes');
})();

// ============================================================================
// formatListsAsHtml tests
// ============================================================================

console.log('\n--- formatListsAsHtml ---');

(function testFormatBulletList() {
    const input = '• First item\n• Second item';
    const result = formatListsAsHtml(input);
    assertContains(result, '<ul>', 'Creates unordered list');
    assertContains(result, '<li>First item</li>', 'Formats first bullet');
    assertContains(result, '<li>Second item</li>', 'Formats second bullet');
    assertContains(result, '</ul>', 'Closes unordered list');
})();

(function testFormatNumberedList() {
    const input = '1. First step\n2. Second step';
    const result = formatListsAsHtml(input);
    assertContains(result, '<ol>', 'Creates ordered list');
    assertContains(result, '<li>First step</li>', 'Formats first item');
    assertContains(result, '<li>Second step</li>', 'Formats second item');
    assertContains(result, '</ol>', 'Closes ordered list');
})();

(function testFormatMixedContent() {
    const input = 'Intro paragraph.\n\n• Bullet one\n• Bullet two\n\nConclusion.';
    const result = formatListsAsHtml(input);
    assertContains(result, '<p>Intro paragraph.</p>', 'Formats intro as paragraph');
    assertContains(result, '<ul>', 'Creates list');
    assertContains(result, '<p>Conclusion.</p>', 'Formats conclusion as paragraph');
})();

(function testFormatDashBullets() {
    const input = '- Item with dash\n- Another dash item';
    const result = formatListsAsHtml(input);
    assertContains(result, '<ul>', 'Recognizes dash as bullet');
    assertContains(result, '<li>Item with dash</li>', 'Formats dash bullet');
})();

(function testFormatAlternativeBullets() {
    const input = '● Filled circle\n○ Empty circle\n▪ Square';
    const result = formatListsAsHtml(input);
    assertContains(result, '<ul>', 'Recognizes alternative bullets');
})();

(function testEscapeHtmlInLists() {
    const input = '• Item with <script> tag';
    const result = formatListsAsHtml(input);
    assertContains(result, '&lt;script&gt;', 'Escapes HTML in list items');
    assertNotContains(result, '<script>', 'Does not allow raw script tag');
})();

// ============================================================================
// linkifyUrls tests
// ============================================================================

console.log('\n--- linkifyUrls ---');

(function testLinkifyHttps() {
    const input = 'Check https://example.com for more';
    const result = linkifyUrls(input);
    assertContains(result, '<a href="https://example.com">', 'Linkifies HTTPS URL');
})();

(function testLinkifyHttp() {
    const input = 'Old site http://example.com here';
    const result = linkifyUrls(input);
    assertContains(result, '<a href="http://example.com">', 'Linkifies HTTP URL');
})();

(function testLinkifyWww() {
    const input = 'Visit www.example.com today';
    const result = linkifyUrls(input);
    assertContains(result, '<a href="https://www.example.com">', 'Linkifies www URL with https');
})();

(function testLinkifyMultipleUrls() {
    const input = 'First https://one.com then https://two.com';
    const result = linkifyUrls(input);
    assertContains(result, 'href="https://one.com"', 'Linkifies first URL');
    assertContains(result, 'href="https://two.com"', 'Linkifies second URL');
})();

(function testLinkifyUrlWithPath() {
    const input = 'Read https://example.com/path/to/article';
    const result = linkifyUrls(input);
    assertContains(result, 'href="https://example.com/path/to/article"', 'Preserves URL path');
})();

// ============================================================================
// processPdfText integration tests
// ============================================================================

console.log('\n--- processPdfText (integration) ---');

(function testProcessPdfWithFootnoteReferences() {
    const input = 'Misaligned behavior³⁵: Catch-all for concerning behavior.';
    const result = processPdfText(input);
    assertNotContains(result.text, '³⁵', 'Removes footnote reference from text');
    assertContains(result.text, 'Misaligned behavior', 'Preserves main content');
})();

(function testProcessPdfWithPageNumber() {
    const input = 'Main content.\n\n107\n\nMore content.';
    const result = processPdfText(input);
    assertContains(result.text, 'Main content', 'Preserves content before page number');
    assertContains(result.text, 'More content', 'Preserves content after page number');
    // Page number line should be removed
    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l);
    assertFalse(lines.includes('107'), 'Removes standalone page number');
})();

(function testProcessPdfWithFootnoteText() {
    const input = `The metrics we report are as follows:

• Misaligned behavior: Catch-all for many forms of concerning behavior;
• Cooperation with human misuse: Working with bad actors;

³⁵ Treutlein, J. et al., 2026. Pre-deployment auditing can catch saboteurs.
https://alignment.anthropic.com/2026/auditing/`;

    const result = processPdfText(input);
    assertContains(result.text, 'Misaligned behavior', 'Preserves bullet content');
    assertNotContains(result.text, 'Treutlein', 'Removes footnote author');
    assertNotContains(result.text, 'alignment.anthropic.com', 'Removes footnote URL');
})();

(function testProcessPdfPreservesFootnotesOnly() {
    const input = '³⁵ Treutlein, J. et al., 2026.\n³⁶ Smith, K. et al., 2025.';
    const result = processPdfText(input);
    assertContains(result.text, 'Treutlein', 'Preserves footnote when only footnotes selected');
    assertContains(result.text, 'Smith', 'Preserves all footnotes');
})();

(function testProcessPdfWithBulletList() {
    const input = '• First bullet item\n• Second bullet item\n• Third bullet item';
    const result = processPdfText(input);
    assertContains(result.html, '<ul>', 'Creates HTML list');
    assertContains(result.html, '<li>First bullet item</li>', 'Formats bullets as list items');
})();

(function testProcessPdfWithUrl() {
    const input = 'For more information, visit https://example.com/docs';
    const result = processPdfText(input);
    assertContains(result.html, '<a href="https://example.com/docs">', 'Creates clickable link');
})();

(function testProcessPdfWithWrappedLines() {
    // Test case from user's screenshot - PDF with wrapped lines and inline footnote numbers
    const input = `We performed a lightweight model-graded evaluation for sandbagging or refusals in
our dangerous capability evaluations. We drew a random sample of 1,000 of these evaluation
transcripts from a mixture of (i) two partially-trained snapshots from the Claude Opus 4.6
training run, (ii) the final [model] snapshot, and (iii) a helpful-only snapshot.56 We asked
Claude Sonnet 4.5 to grade each transcript for signs of refusal, deliberate inaccuracy, low
helpfulness, or consideration of such actions, as well as a generic score for things that
seemed unusual or concerning in the transcript.57`;

    const result = processPdfText(input);

    // Should join wrapped lines
    assertContains(result.text, 'refusals in our dangerous capability', 'Joins first line wrap');
    assertContains(result.text, 'these evaluation transcripts', 'Joins second line wrap');
    assertContains(result.text, 'Opus 4.6 training run', 'Joins third line wrap');

    // Should remove inline footnote numbers
    assertNotContains(result.text, '56', 'Removes inline footnote 56');
    assertNotContains(result.text, '57', 'Removes inline footnote 57');

    // Should preserve actual content
    assertContains(result.text, '1,000', 'Preserves actual number 1,000');
    assertContains(result.text, 'Opus 4.6', 'Preserves version number 4.6');
    assertContains(result.text, 'Sonnet 4.5', 'Preserves version number 4.5');

    // Output should be continuous paragraph (no artificial line breaks)
    const lineCount = result.text.split('\n').length;
    assertEqual(lineCount, 1, 'Output is single continuous paragraph');
})();

(function testProcessPdfFullExample() {
    // Simulating the example from the user's screenshot
    const input = `The aggregate metrics we report are as follows.

Overall harmful behavior and cooperation with misuse:

• Misaligned behavior³⁵: Catch-all for many forms of concerning behavior, spanning both cooperation with human misuse and undesirable actions that the model takes at its own initiative, across a range of medium- and high-stakes scenarios;
• Cooperation with human misuse: Cooperation with misuse by human users;

³⁵ Treutlein, J. et al., 2026. Pre-deployment auditing can catch an overt saboteur.
https://alignment.anthropic.com/2026/auditing-overt-saboteur/

107`;

    const result = processPdfText(input);

    // Should preserve main content
    assertContains(result.text, 'aggregate metrics', 'Preserves intro');
    assertContains(result.text, 'Misaligned behavior', 'Preserves bullet content');
    assertContains(result.text, 'Cooperation with human misuse', 'Preserves second bullet');

    // Should remove footnote reference
    assertNotContains(result.text, '³⁵', 'Removes footnote reference from bullet');

    // Should remove footnote text
    assertNotContains(result.text, 'Treutlein', 'Removes footnote author');
    assertNotContains(result.text, 'alignment.anthropic.com', 'Removes footnote URL');

    // Should remove page number
    const textLines = result.text.split('\n').map(l => l.trim()).filter(l => l);
    assertFalse(textLines.includes('107'), 'Removes page number');

    // HTML should have proper list formatting
    assertContains(result.html, '<ul>', 'HTML has list');
    assertContains(result.html, '<li>', 'HTML has list items');
})();

// ============================================================================
// Summary
// ============================================================================

console.log('\n===================');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('===================\n');

process.exit(testsFailed > 0 ? 1 : 0);
