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

const WIRE_SERVICE_PATTERN = /^(the\s+)?(reuters|associated press|ap|afp|agence france[- ]presse|bloomberg|staff(\s+reports?)?)$/i;

function isWireServiceName(text) {
    return WIRE_SERVICE_PATTERN.test(text.trim());
}

const GENERIC_ACCOUNT_NAME_PATTERN = /^(system|admin|administrator|root|webmaster|moderator|mod|bot|guest|anonymous|anon|user|editor|staff|team|info|support|contact|noreply|no-?reply|unknown|default|test)$/i;

function isGenericAccountName(text) {
    return GENERIC_ACCOUNT_NAME_PATTERN.test((text || '').trim());
}

function isAllCapsName(name) {
    const withoutConnectors = name.replace(/\b(and)\b/g, '');
    return /[A-Z]/.test(withoutConnectors) && !/[a-z]/.test(withoutConnectors);
}

function titleCaseAllCapsName(name) {
    return name.replace(/[A-Za-z]+/g, word => {
        if (/^and$/i.test(word)) return 'and';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function extractBylineFromBodyText(bodyText) {
    if (!bodyText) return null;

    const earlyText = bodyText.substring(0, 3000);
    for (const byLineMatch of earlyText.matchAll(/\n[Bb]y ([^\n]{4,120})(?=\n)/g)) {
        let potentialByline = byLineMatch[1].trim();
        if (isAllCapsName(potentialByline)) {
            potentialByline = titleCaseAllCapsName(potentialByline);
        }
        if (isWireServiceName(potentialByline)) continue;
        const capWords = potentialByline.match(/\b[A-Z][a-z]+/g);
        if (capWords && capWords.length >= 2 && /^[A-Z]/.test(potentialByline) &&
            !isLikelyJobTitle(potentialByline)) {
            return potentialByline;
        }
    }

    // Fallback: line immediately before a standalone date line, e.g. the
    // Substack reader (substack.com/home/post/...): "PETE BUTTIGIEG" directly
    // above "JUN 26, 2026". Checked line by line over the early text.
    const DATE_LINE_PATTERN = /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})$/i;
    const lines = earlyText.split('\n').map(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
        if (!DATE_LINE_PATTERN.test(lines[i])) continue;
        // Nearest non-empty line above the date
        let j = i - 1;
        while (j >= 0 && !lines[j]) j--;
        if (j < 0) continue;
        let candidate = lines[j];
        if (isAllCapsName(candidate)) {
            candidate = titleCaseAllCapsName(candidate);
        }
        if (isLikelyJobTitle(candidate) || isWireServiceName(candidate)) continue;
        const words = candidate.split(/[\s,]+/).filter(w => w);
        const capWords = words.filter(w => /^[A-Z]/.test(w));
        const isLikelyName = words.length >= 2 && words.length <= 8 &&
            capWords.length >= 2 &&
            words.every(w => (/^[A-Z][a-zA-Z.'’-]*$/.test(w) && w.length <= 20) || /^(and|&)$/i.test(w));
        if (isLikelyName) return candidate;
    }

    const publishedMatch = bodyText.match(/\n([^\n]{4,120})\s*\n\s*Published/);
    if (publishedMatch && publishedMatch[1]) {
        let potentialByline = publishedMatch[1].trim();
        if (isAllCapsName(potentialByline)) {
            potentialByline = titleCaseAllCapsName(potentialByline);
        }
        potentialByline = potentialByline.replace(/\s+in\s+[A-Z][a-zA-Z\s,]+$/, '');
        if (isLikelyJobTitle(potentialByline) || isWireServiceName(potentialByline)) return null;
        const words = potentialByline.split(/[\s,]+/).filter(w => w);
        const capWords = words.filter(w => /^[A-Z]/.test(w));
        const isLikelyName = words.length >= 2 && words.length <= 8 &&
            capWords.length >= 2 &&
            words.every(w => (/^[A-Z][a-zA-Z]/.test(w) && w.length <= 20) || /^(and|&)$/i.test(w));
        if (isLikelyName) return potentialByline;
    }

    return null;
}

const AUTHOR_PROFILE_HREF_PATTERN = /\/(authors?|by|staff|people|profiles?|contributors?|writers?|columnists?)\/[^/?#]/i;

const SOCIAL_PROFILE_HREF_PATTERN = /(^|[\/.])(bsky\.app|facebook\.com|instagram\.com|threads\.net|linkedin\.com|youtube\.com|tiktok\.com|mastodon\.[a-z]+)\//i;

function isAuthorProfileHref(href) {
    if (!href) return false;
    if (/^(mailto:|javascript:|tel:|#)/i.test(href)) return false;
    if (SOCIAL_PROFILE_HREF_PATTERN.test(href)) return false;
    return AUTHOR_PROFILE_HREF_PATTERN.test(href);
}

function extractSiteNameFromTitle(title) {
    if (!title) return null;
    const parts = title.split('|');
    if (parts.length < 2) return null;
    const siteName = parts[parts.length - 1].trim();
    if (siteName.length < 2 || siteName.length > 60) return null;
    return siteName;
}

function cleanAuthorLinkText(text) {
    return (text || '')
        .replace(/^[\s,&]+|[\s,&]+$/g, '')
        .replace(/^and\s+/i, '')
        .replace(/\s+and$/i, '')
        .trim();
}

function isLikelyPersonName(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 4 || trimmed.length > 50) return false;
    if (isLikelyJobTitle(trimmed)) return false;
    if (/^(more|all|meet|our|the|about|other|view|see|read|follow|share|subscribe|join|connect|contact|submit|sign)\b/i.test(trimmed)) return false;
    if (!/^[A-Z][A-Za-zÀ-ÿ.'’-]*(\s+[A-Za-zÀ-ÿ.'’-]+){1,3}$/.test(trimmed)) return false;
    return (trimmed.match(/[A-Z]/g) || []).length >= 2;
}

function joinAuthorNames(names) {
    const capped = names.slice(0, 4);
    if (capped.length === 0) return null;
    if (capped.length === 1) return capped[0];
    if (capped.length === 2) return `${capped[0]} and ${capped[1]}`;
    return capped.slice(0, -1).join(', ') + ' and ' + capped[capped.length - 1];
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

console.log('\n--- extractBylineFromBodyText: politico.com all-caps regression ---');
// politico.com renders bylines in all caps ("By DANA NICKEL"), which the
// capWords validation used to reject. Detection then fell through to
// meta[name="twitter:creator"] = "@politico" and the author came out as
// "politico" instead of "Dana Nickel".
const politicoText = [
    'SKIP TO MAIN CONTENT',
    'Toggle menu',
    'MORE FROM POLITICO',
    "Trump's AI flip-flopping could be a gift to China",
    '',
    'Chinese AI companies have announced breakthroughs in advanced AI.',
    '',
    'Photo caption text here. | Andrew Harnik/Getty Images',
    '',
    'By DANA NICKEL',
    '',
    '07/01/2026 05:00 AM EDT',
    '',
    'Article body starts here.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(politicoText),
    'Dana Nickel',
    'politico.com: all-caps "By DANA NICKEL" becomes "Dana Nickel"'
);

const allCapsMultiAuthorText = [
    'Publication',
    '',
    'By ALICE SMITH and BOB JONES',
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsMultiAuthorText),
    'Alice Smith and Bob Jones',
    'All-caps multi-author byline is title-cased with lowercase "and"'
);

const allCapsAndUppercaseText = [
    'Publication',
    '',
    'By ALICE SMITH AND BOB JONES',
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsAndUppercaseText),
    'Alice Smith and Bob Jones',
    'All-caps "AND" between authors is lowercased'
);

const allCapsHyphenText = [
    'Publication',
    '',
    'By MARY SMITH-JONES',
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsHyphenText),
    'Mary Smith-Jones',
    'All-caps hyphenated surname is title-cased on both sides'
);

const allCapsApostropheText = [
    'Publication',
    '',
    "By SEAN O'BRIEN",
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsApostropheText),
    "Sean O'Brien",
    'All-caps apostrophe surname is title-cased after the apostrophe'
);

const allCapsJobTitleText = [
    'Publication',
    '',
    'By SENIOR REPORTER',
    '',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsJobTitleText),
    null,
    'All-caps job title is still rejected after title-casing'
);

const allCapsPublishedText = [
    'Publication',
    '',
    'GILLIAN TETT',
    'Published March 4, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(allCapsPublishedText),
    'Gillian Tett',
    'All-caps name before Published is title-cased'
);

console.log('\n--- titleCaseAllCapsName ---');
assertEqual(titleCaseAllCapsName('DANA NICKEL'), 'Dana Nickel', 'Simple two-word name');
assertEqual(titleCaseAllCapsName('ALICE SMITH AND BOB JONES'), 'Alice Smith and Bob Jones', 'AND is lowercased');
assertEqual(titleCaseAllCapsName('J.D. VANCE'), 'J.D. Vance', 'Single-letter initials keep their capitals');

console.log('\n--- isAllCapsName ---');
assertEqual(isAllCapsName('DANA NICKEL'), true, 'All-caps name detected');
assertEqual(isAllCapsName('ALICE SMITH and BOB JONES'), true, 'Lowercase "and" connector still counts as all-caps');
assertEqual(isAllCapsName('Dana Nickel'), false, 'Title-case name is not all-caps');
assertEqual(isAllCapsName('Jonah Owen Lamb'), false, 'Normal byline is not all-caps');

console.log('\n--- extractBylineFromBodyText: substack reader (byline above date line) ---');
// substack.com/home/post/p-XXXX regression: meta[name="author"] is "Substack"
// (platform boilerplate) and the only good signal is the all-caps byline
// directly above a standalone date line.
const substackReaderText = [
    '18',
    '99+',
    'Subscribe',
    "PETE BUTTIGIEG'S SUBSTACK",
    'A Terrible Thing Happened to My Family',
    "Even in today's climate, there should be one fundamental principle everyone respects.",
    'PETE BUTTIGIEG',
    'JUN 26, 2026',
    '',
    'Someone decided to hurt our family this week.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(substackReaderText),
    'Pete Buttigieg',
    'Substack reader: all-caps byline above date line becomes "Pete Buttigieg"'
);

const titleCaseDateText = [
    'Some Publication',
    'Article Title Here With Lowercase words in it',
    'Jane Doe',
    'June 26, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(titleCaseDateText),
    'Jane Doe',
    'Title-case byline above full-month date line'
);

const dayFirstDateText = [
    'Publication',
    'Alice Smith',
    '26 Jun 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(dayFirstDateText),
    'Alice Smith',
    'Byline above day-first date line (26 Jun 2026)'
);

const blankLineBeforeDateText = [
    'Publication',
    'Bob Jones',
    '',
    'Jun. 26, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(blankLineBeforeDateText),
    'Bob Jones',
    'Blank line between byline and date is skipped'
);

const titleBeforeDateText = [
    'Publication',
    'A Terrible Thing Happened to My Family',
    'JUN 26, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(titleBeforeDateText),
    null,
    'Title with lowercase words above date is not mistaken for author'
);

const jobTitleBeforeDateText = [
    'Publication',
    'Senior Reporter',
    'JUN 26, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(jobTitleBeforeDateText),
    null,
    'Job title above date is rejected'
);

const singleWordBeforeDateText = [
    'Publication',
    'Subscribe',
    'JUN 26, 2026',
].join('\n');
assertEqual(
    extractBylineFromBodyText(singleWordBeforeDateText),
    null,
    'Single word above date is rejected'
);

console.log('\n--- extractBylineFromBodyText: wire-service bylines (usnews.com regression) ---');
// usnews.com syndicating Reuters: "By Reuters" (link byline) appears above
// the human byline "By Daniel Wiessner". The old code only examined the
// FIRST "By X" match, so it gave up and fell through to JSON-LD, which
// says author = Organization "Reuters".
const usnewsText = [
    'U.S. News',
    'Home / News / Top News',
    'Meta Used AI to Target Workers With Medical Conditions for Layoffs, Lawsuit Claims',
    'By Reuters',
    'July 14, 2026, at 9:52 a.m.',
    'Save',
    'A woman walks by the Meta Lab in Los Angeles. REUTERS/Daniel Cole',
    'By Daniel Wiessner',
    'July 14 (Reuters) - Twenty-six employees of Meta Platforms have filed a novel lawsuit.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(usnewsText),
    'Daniel Wiessner',
    'usnews.com: skips "By Reuters", picks "By Daniel Wiessner"'
);

const apText = [
    'Some Paper',
    'By Associated Press',
    'Story intro here.',
    'By Jane Doe',
    'Article body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(apText),
    'Jane Doe',
    '"By Associated Press" (which passes name validation) is skipped for the human byline'
);

const wireOnlyText = [
    'Some Paper',
    'By Reuters',
    'Article body with no human byline anywhere.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(wireOnlyText),
    null,
    'Wire-only byline returns null (later detection layers handle it)'
);

const adjacentBylinesText = [
    'Paper',
    'By Reuters',
    'By John Smith',
    'Body.',
].join('\n');
assertEqual(
    extractBylineFromBodyText(adjacentBylinesText),
    'John Smith',
    'Adjacent "By" lines: second one still matched (lookahead regex)'
);

console.log('\n--- isWireServiceName ---');
assertEqual(isWireServiceName('Reuters'), true, 'Reuters');
assertEqual(isWireServiceName('Associated Press'), true, 'Associated Press');
assertEqual(isWireServiceName('The Associated Press'), true, 'The Associated Press');
assertEqual(isWireServiceName('AP'), true, 'AP');
assertEqual(isWireServiceName('Bloomberg'), true, 'Bloomberg');
assertEqual(isWireServiceName('AFP'), true, 'AFP');
assertEqual(isWireServiceName('Staff Reports'), true, 'Staff Reports');
assertEqual(isWireServiceName('Daniel Wiessner'), false, 'Human name is not a wire service');
assertEqual(isWireServiceName('April Smith'), false, 'Name starting with Ap- is not AP');

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

// ============================================================================
// Author profile link detection (archive.today regression)
//
// archive.is/.ph strips meta tags, breaks JSON-LD and removes classes from
// archived pages, so author-profile hrefs (which archive.today preserves,
// rewritten as archive.is/o/<code>/<original-url>) are the only reliable
// signal left. Example: archive.is/cXCJ0 (Axios, two authors) resolved to
// the page title instead of "Mike Allen and Zachary Basu".
// ============================================================================

console.log('\n--- isAuthorProfileHref ---');
assertEqual(
    isAuthorProfileHref('https://archive.is/o/cXCJ0/https://www.axios.com/authors/mikeallen'),
    true,
    'archive.is-rewritten Axios /authors/ link matches'
);
assertEqual(isAuthorProfileHref('https://www.nytimes.com/by/cade-metz'), true, 'NYT /by/ link matches');
assertEqual(isAuthorProfileHref('https://www.politico.com/staff/dana-nickel'), true, 'Politico /staff/ link matches');
assertEqual(isAuthorProfileHref('https://www.washingtonpost.com/people/some-writer/'), true, 'WaPo /people/ link matches');
assertEqual(isAuthorProfileHref('/author/jane-doe'), true, 'Relative WordPress /author/ link matches');
assertEqual(isAuthorProfileHref('https://example.com/contributors/john'), true, '/contributors/ link matches');
assertEqual(isAuthorProfileHref('mailto:tips@axios.com'), false, 'mailto: is rejected');
assertEqual(isAuthorProfileHref('#authors/section'), false, 'Fragment-only href is rejected');
assertEqual(isAuthorProfileHref('https://example.com/bypass/page'), false, '/bypass/ does not match /by/');
assertEqual(isAuthorProfileHref('https://example.com/by/'), false, '/by/ with nothing after it is rejected');
assertEqual(isAuthorProfileHref('https://example.com/news/article'), false, 'Ordinary article link is rejected');
assertEqual(isAuthorProfileHref(null), false, 'Null href is rejected');

console.log('\n--- cleanAuthorLinkText ---');
assertEqual(cleanAuthorLinkText('Mike Allen,  '), 'Mike Allen', 'Trailing comma inside anchor is stripped (archived Axios)');
assertEqual(cleanAuthorLinkText(', Zachary Basu'), 'Zachary Basu', 'Leading comma is stripped');
assertEqual(cleanAuthorLinkText('and Bob Jones'), 'Bob Jones', 'Leading "and" is stripped');
assertEqual(cleanAuthorLinkText('Alice Smith and'), 'Alice Smith', 'Trailing "and" is stripped');
assertEqual(cleanAuthorLinkText('  Jane Doe  '), 'Jane Doe', 'Whitespace is trimmed');
assertEqual(cleanAuthorLinkText('Andrea Long'), 'Andrea Long', 'Name starting with "And" is not mangled');
assertEqual(cleanAuthorLinkText(''), '', 'Empty string stays empty');

console.log('\n--- isLikelyPersonName ---');
assertEqual(isLikelyPersonName('Mike Allen'), true, 'Simple two-word name');
assertEqual(isLikelyPersonName('Zachary Basu'), true, 'Another two-word name');
assertEqual(isLikelyPersonName('J.D. Vance'), true, 'Initials with periods');
assertEqual(isLikelyPersonName('Mary Smith-Jones'), true, 'Hyphenated surname');
assertEqual(isLikelyPersonName("Sean O'Brien"), true, 'Apostrophe surname');
assertEqual(isLikelyPersonName('Ursula von der Leyen'), true, 'Lowercase particles allowed');
assertEqual(isLikelyPersonName('Subscribe'), false, 'Single word rejected');
assertEqual(isLikelyPersonName('Staff Writer'), false, 'Job title rejected');
assertEqual(isLikelyPersonName('More Authors'), false, 'Nav label "More ..." rejected');
assertEqual(isLikelyPersonName('About Us'), false, 'Nav label "About ..." rejected');
assertEqual(isLikelyPersonName('email (opens in new window)'), false, 'Share link text rejected');
assertEqual(isLikelyPersonName('The daily show'), false, 'Only one capital letter rejected');
assertEqual(isLikelyPersonName(''), false, 'Empty string rejected');
assertEqual(isLikelyPersonName('A B C D E'), false, 'Five words rejected');

console.log('\n--- social profile links (themidasproject.com regression) ---');
// bsky.app/profile/... matched the /profile/ author pattern and its link
// text "Follow on Bluesky" passed name validation, so the watchtower page
// was attributed to "Follow on Bluesky" instead of The Midas Project.
assertEqual(
    isAuthorProfileHref('https://bsky.app/profile/safetychanges.bsky.social'),
    false,
    'Bluesky profile link is not a byline'
);
assertEqual(isAuthorProfileHref('https://www.linkedin.com/in/someone'), false, 'LinkedIn link is not a byline');
assertEqual(isAuthorProfileHref('https://facebook.com/profile/12345'), false, 'Facebook profile is not a byline');
assertEqual(
    isAuthorProfileHref('https://archive.is/o/x/https://bsky.app/profile/someone'),
    false,
    'Archive-wrapped social link is still excluded'
);
assertEqual(isAuthorProfileHref('https://www.politico.com/staff/dana-nickel'), true, 'Politico staff link still matches');
assertEqual(isLikelyPersonName('Follow on Bluesky'), false, '"Follow on Bluesky" is not a person');
assertEqual(isLikelyPersonName('Share This Article'), false, '"Share This Article" is not a person');
assertEqual(isLikelyPersonName('Subscribe Now Today'), false, '"Subscribe Now Today" is not a person');

console.log('\n--- isGenericAccountName (huggingface.co "system" regression) ---');
// huggingface.co blog posts are published by the platform "system" account,
// which won the byline heuristics; generic account names are never authors,
// so detection now falls through to the site name instead.
assertEqual(isGenericAccountName('system'), true, '"system" is generic');
assertEqual(isGenericAccountName('System'), true, 'Case-insensitive');
assertEqual(isGenericAccountName('  admin  '), true, 'Whitespace trimmed');
assertEqual(isGenericAccountName('administrator'), true, 'administrator');
assertEqual(isGenericAccountName('bot'), true, 'bot');
assertEqual(isGenericAccountName('anonymous'), true, 'anonymous');
assertEqual(isGenericAccountName('noreply'), true, 'noreply');
assertEqual(isGenericAccountName('no-reply'), true, 'no-reply');
assertEqual(isGenericAccountName('Sarah Constantin'), false, 'Real name is not generic');
assertEqual(isGenericAccountName('Adminah Smith'), false, 'Name starting with admin- is not generic');
assertEqual(isGenericAccountName('Systema Naturae'), false, 'Multi-word phrase is not generic');
assertEqual(isGenericAccountName(''), false, 'Empty string is not generic');
assertEqual(isGenericAccountName(null), false, 'Null is not generic');

console.log('\n--- extractSiteNameFromTitle ---');
assertEqual(extractSiteNameFromTitle('xAI | The Midas Project'), 'The Midas Project', 'Title suffix after | is the site name');
assertEqual(extractSiteNameFromTitle('A | B | The Verge'), 'The Verge', 'Last segment wins with multiple pipes');
assertEqual(extractSiteNameFromTitle('Plain title without separator'), null, 'No pipe returns null');
assertEqual(extractSiteNameFromTitle('Title - Site Name'), null, 'Dash separator is not used (too ambiguous)');
assertEqual(extractSiteNameFromTitle(''), null, 'Empty title returns null');
assertEqual(extractSiteNameFromTitle('Title |'), null, 'Empty suffix returns null');

console.log('\n--- joinAuthorNames ---');
assertEqual(joinAuthorNames(['Mike Allen']), 'Mike Allen', 'Single author');
assertEqual(joinAuthorNames(['Mike Allen', 'Zachary Basu']), 'Mike Allen and Zachary Basu', 'Two authors joined with "and"');
assertEqual(joinAuthorNames(['A One', 'B Two', 'C Three']), 'A One, B Two and C Three', 'Three authors: comma then "and"');
assertEqual(joinAuthorNames(['A One', 'B Two', 'C Three', 'D Four', 'E Five']), 'A One, B Two, C Three and D Four', 'Capped at four names');
assertEqual(joinAuthorNames([]), null, 'Empty list returns null');

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
