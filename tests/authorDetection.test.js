/**
 * Unit tests for author byline detection in universal/quote-copy.js
 * Run with: node tests/authorDetection.test.js
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

const JOB_TITLE_PATTERN = /^(senior |staff |chief |managing |deputy |associate |assistant |contributing |executive |freelance |lead |principal )?(reporter|editor|writer|correspondent|columnist|journalist|contributor|producer|analyst|commentator|anchor|host)s?$/i;

function isLikelyJobTitle(text) {
    return JOB_TITLE_PATTERN.test(text.trim());
}

function extractBylineFromBodyText(bodyText) {
    if (!bodyText) return null;

    const earlyText = bodyText.substring(0, 3000);
    const byLineMatch = earlyText.match(/\n[Bb]y ([^\n]{4,120})\s*\n/);
    if (byLineMatch) {
        const potentialByline = byLineMatch[1].trim();
        const capWords = potentialByline.match(/\b[A-Z][a-z]+/g);
        if (capWords && capWords.length >= 2 && /^[A-Z]/.test(potentialByline) &&
            !isLikelyJobTitle(potentialByline)) {
            return potentialByline;
        }
    }

    const publishedMatch = bodyText.match(/\n([^\n]{4,120})\s*\n\s*Published/);
    if (publishedMatch && publishedMatch[1]) {
        let potentialByline = publishedMatch[1].trim();
        potentialByline = potentialByline.replace(/\s+in\s+[A-Z][a-zA-Z\s,]+$/, '');
        if (isLikelyJobTitle(potentialByline)) return null;
        const words = potentialByline.split(/[\s,]+/).filter(w => w);
        const capWords = words.filter(w => /^[A-Z]/.test(w));
        const isLikelyName = words.length >= 2 && words.length <= 8 &&
            capWords.length >= 2 &&
            words.every(w => (/^[A-Z][a-zA-Z]/.test(w) && w.length <= 20) || /^(and|&)$/i.test(w));
        if (isLikelyName) return potentialByline;
    }

    return null;
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n--- isLikelyJobTitle ---');
assertEqual(isLikelyJobTitle('Senior Reporter'), true, 'Senior Reporter is a job title');
assertEqual(isLikelyJobTitle('Staff Writer'), true, 'Staff Writer is a job title');
assertEqual(isLikelyJobTitle('Managing Editor'), true, 'Managing Editor is a job title');
assertEqual(isLikelyJobTitle('Reporter'), true, 'Reporter alone is a job title');
assertEqual(isLikelyJobTitle('Correspondents'), true, 'Plural correspondents is a job title');
assertEqual(isLikelyJobTitle('Jonah Owen Lamb'), false, 'Real name is not a job title');
assertEqual(isLikelyJobTitle('Ezra Klein'), false, 'Another name is not a job title');
assertEqual(isLikelyJobTitle('John Reporter'), false, 'Name ending in Reporter is not a job title');

console.log('\n--- extractBylineFromBodyText: sfstandard.com regression ---');
// This is the bug reported in the image: sfstandard.com article with
// "By Jonah Owen Lamb\nSenior Reporter\nPublished Apr. 12, 2026 ..."
// Previously extracted "Senior Reporter" because the line-before-Published
// heuristic ran before the "By" heuristic.
const sfStandardText = [
    'The San Francisco Standard',
    'Politics',
    '',
    "Sam Altman's home targeted in second attack",
    '',
    'By Jonah Owen Lamb',
    'Senior Reporter',
    '',
    'Published Apr. 12, 2026 • 3:01pm',
    '',
    "OpenAI CEO Sam Altman's home appears to have been the target of a second attack Sunday morning...",
].join('\n');
assertEqual(
    extractBylineFromBodyText(sfStandardText),
    'Jonah Owen Lamb',
    'sfstandard.com: picks "Jonah Owen Lamb", not "Senior Reporter"'
);

console.log('\n--- extractBylineFromBodyText: other job-title subtitles ---');
const staffWriterText = [
    'Some Publication',
    '',
    'By Jane Q Doe',
    'Staff Writer',
    '',
    'Published Jan. 1, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(staffWriterText),
    'Jane Q Doe',
    'Staff Writer subtitle: picks the real name'
);

const managingEditorText = [
    'Paper',
    '',
    'By Alice Smith',
    'Managing Editor',
    '',
    'Published Feb. 2, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(managingEditorText),
    'Alice Smith',
    'Managing Editor subtitle: picks the real name'
);

console.log('\n--- extractBylineFromBodyText: existing patterns still work ---');
// Line before Published with a real name (no explicit "By ...") — the FT-style case.
const ftText = [
    'Financial Times',
    '',
    'Gillian Tett',
    'Published March 4, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(ftText),
    'Gillian Tett',
    'FT-style: name on line before Published is picked up'
);

const ftLocationText = [
    'Financial Times',
    '',
    'Gillian Tett in London',
    'Published March 4, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(ftLocationText),
    'Gillian Tett',
    'FT-style with location: trims " in London"'
);

const byOnlyText = [
    'News Site',
    '',
    'By Ezra Klein',
    '',
    'Article body starts here.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(byOnlyText),
    'Ezra Klein',
    'Plain "By Name" line with no Published marker is picked up'
);

const multipleAuthorsText = [
    'News Site',
    '',
    'By Alice Smith and Bob Jones',
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(multipleAuthorsText),
    'Alice Smith and Bob Jones',
    'Multiple "By" authors preserved'
);

console.log('\n--- extractBylineFromBodyText: negative cases ---');
assertEqual(extractBylineFromBodyText(''), null, 'Empty string returns null');
assertEqual(extractBylineFromBodyText(null), null, 'Null returns null');
assertEqual(
    extractBylineFromBodyText('Just some body text with no byline structure at all.'),
    null,
    'No byline pattern returns null'
);
// Solo "Senior Reporter" before Published (no By line above): should not be mistaken for a name.
const onlyJobTitleText = [
    'Publication',
    '',
    'Senior Reporter',
    'Published Apr. 12, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(onlyJobTitleText),
    null,
    'Job title alone before Published is not returned as author'
);

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
