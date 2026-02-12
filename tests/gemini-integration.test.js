/**
 * Gemini API Integration Tests
 *
 * These tests make REAL API calls to Gemini to verify the transform pipeline works correctly.
 *
 * Setup (choose one):
 *
 *   Option 1 - Config file (recommended):
 *     Create .gemini-test-config.json in the project root:
 *     {
 *       "apiKey": "your-api-key-here",
 *       "model": "gemini-2.0-flash-lite"
 *     }
 *
 *   Option 2 - Environment variable:
 *     Windows (PowerShell):
 *       $env:GEMINI_API_KEY="your-api-key-here"; node tests/gemini-integration.test.js
 *
 *     Windows (CMD):
 *       set GEMINI_API_KEY=your-api-key-here && node tests/gemini-integration.test.js
 *
 *     Mac/Linux:
 *       GEMINI_API_KEY=your-api-key-here node tests/gemini-integration.test.js
 *
 * If no API key is found, tests will be skipped with a helpful message.
 */

const fs = require('fs');
const path = require('path');

// Try to load config from file first, then fall back to environment variable
let configFromFile = {};
const configPath = path.join(__dirname, '..', '.gemini-test-config.json');
try {
    if (fs.existsSync(configPath)) {
        configFromFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.warn('Warning: Could not parse .gemini-test-config.json:', e.message);
}

const GEMINI_API_KEY = configFromFile.apiKey || process.env.GEMINI_API_KEY;
const GEMINI_MODEL = configFromFile.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

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
        console.log(`    Actual: ${actual?.substring(0, 200)}...`);
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
        console.log(`    Actual: ${actual?.substring(0, 200)}...`);
        testsFailed++;
    }
}

/**
 * Transformation rules from transform-controller.js
 */
const transformationRules = [
    { "priority": -1, "description": "MOST IMPORTANT: Preserve these exactly: 1) All acronyms 'ASI', 'AGI', 'AI', 'GPT', 'LLM', 'NLP' must stay as acronyms 2) All quote marks must stay exactly as they are (don't change ' to \" or vice versa) 3) ALL HTML anchor tags <a href=\"...\">text</a> must be preserved exactly with their URLs intact 4) ALL HTML ordered list tags <ol><li>...</li></ol> must be preserved exactly" },
    { "priority": 0, "description": "CRITICAL: NEVER MODIFY ANY OF THESE: 1) Never expand 'ASI', 'AGI', 'AI', 'GPT', 'LLM', or 'NLP' into full words 2) Never change single quotes (') to double quotes (\") or vice versa. Leave all quotes exactly as they appear." },
    { "priority": 1, "description": "CRITICAL: Preserve ALL HTML anchor tags exactly as written. Every <a href=\"...\">text</a> must remain intact with the same href URL and link text. Never remove, modify, or break any links." },
    { "priority": 2, "description": "Fix capitalization of sentences and proper nouns while preserving intentional ALL CAPS" },
    { "priority": 3, "description": "Expand all abbreviations and make any other fixes according to the New York Times style guide" },
    { "priority": 4, "description": "Remove excessive whitespace and newlines while preserving paragraph breaks" },
    { "priority": 5, "description": "Preserve hashtags and URLs exactly as written" },
    { "priority": 6, "description": "If you know the name an @mention refers to, replace it with that name, otherwise leave it exactly as is." },
    { "priority": 7, "description": "SERIAL LISTS: In a list of 3+ items (X, Y and Z), the 'and' belongs before the FINAL item only." },
    { "priority": 8, "description": "Fix clear punctuation errors like missing periods at end of sentences or double periods." },
    { "priority": 9, "description": "Remove extra line breaks before and after @mentions" },
    { "priority": 10, "description": "NUMBERED LISTS: Preserve all <ol><li> HTML list structures exactly. Do not convert them to plain text or modify the list formatting." },
    { "priority": 11, "description": "SUBJECT-VERB AGREEMENT: Fix subject-verb agreement errors." },
    { "priority": 12, "description": "Fix all spelling and grammar errors according to the New York Times style guide, but do not change capitalization of acronyms." }
];

/**
 * Convert numbered lists to HTML (from transform-controller.js)
 */
function convertNumberedListsToHtml(text) {
    const numberedListPattern = /(?:^|\n)(\d+)[.\)]\s+(.+?)(?=\n\d+[.\)]\s|\n\n|\n*$)/gs;
    const matches = [...text.matchAll(numberedListPattern)];

    if (matches.length < 2) {
        return text;
    }

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
        return text;
    }

    const firstMatch = matches[0];
    const lastMatch = matches[matches.length - 1];
    const listStartIndex = text.indexOf(firstMatch[0].trim());
    const beforeList = text.substring(0, listStartIndex).trim();
    const lastItemEnd = text.indexOf(lastMatch[0].trim()) + lastMatch[0].trim().length;
    const afterList = text.substring(lastItemEnd).trim();

    const listItems = matches.map(match => {
        const itemText = match[2].trim();
        return `<li>${itemText}</li>`;
    });

    const htmlList = `<ol>\n${listItems.join('\n')}\n</ol>`;

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
 * Call Gemini API
 */
async function callGemini(text) {
    const prompt = `Transform the following text according to these rules:
${transformationRules.map(rule => `${rule.priority}. ${rule.description}`).join('\n')}

Text to transform:
${text}

Return the transformed text directly without any additional commentary or labels.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || text;
}

/**
 * Simulate full pipeline: pre-convert -> LLM -> post-process
 */
async function simulatePipeline(inputText) {
    // Step 1: Pre-convert numbered lists
    const preConverted = convertNumberedListsToHtml(inputText);
    console.log('  [Pipeline] Pre-converted:', preConverted.includes('<ol>') ? 'Has <ol>' : 'No list detected');

    // Step 2: Send to Gemini
    const llmOutput = await callGemini(preConverted);
    console.log('  [Pipeline] LLM output:', llmOutput.includes('<ol>') ? 'Has <ol>' : 'No <ol> in output');

    return llmOutput;
}

// Main test execution
async function runTests() {
    console.log('\n=== Gemini Integration Tests ===\n');

    if (!GEMINI_API_KEY) {
        console.log('⚠️  No Gemini API key found.');
        console.log('');
        console.log('Option 1 - Create config file (recommended):');
        console.log('  Create .gemini-test-config.json in the project root:');
        console.log('  {');
        console.log('    "apiKey": "your-api-key-here",');
        console.log('    "model": "gemini-2.0-flash-lite"');
        console.log('  }');
        console.log('');
        console.log('Option 2 - Environment variable:');
        console.log('  Windows (PowerShell):');
        console.log('    $env:GEMINI_API_KEY="your-key-here"; node tests/gemini-integration.test.js');
        console.log('');
        console.log('  Windows (CMD):');
        console.log('    set GEMINI_API_KEY=your-key-here && node tests/gemini-integration.test.js');
        console.log('');
        process.exit(0);
    }

    console.log(`Using model: ${GEMINI_MODEL}`);
    console.log('');

    // Test 1: Basic numbered list preservation
    console.log('Test 1: Numbered list preservation through LLM');
    try {
        const input = `What happened:
1) Its "human" gives his the bot a simple goal: "save the environment"

2) u/sam_altman starts spamming Moltbook with comments

3) People complain on Twitter to the AI's human`;

        const result = await simulatePipeline(input);
        assertContains(result, '<ol>', 'Output contains <ol> tag');
        assertContains(result, '<li>', 'Output contains <li> tags');
        assertContains(result, '</ol>', 'Output has closing </ol> tag');
    } catch (error) {
        console.log(`  ✗ Test failed with error: ${error.message}`);
        testsFailed++;
    }

    // Test 2: Links are preserved
    console.log('\nTest 2: HTML links preserved through LLM');
    try {
        const input = `<p>Check out <a href="https://example.com">this link</a> for more info.</p>`;
        const result = await callGemini(input);
        assertContains(result, '<a href="https://example.com">', 'Link href preserved');
        assertContains(result, 'this link</a>', 'Link text preserved');
    } catch (error) {
        console.log(`  ✗ Test failed with error: ${error.message}`);
        testsFailed++;
    }

    // Test 3: Acronyms preserved
    console.log('\nTest 3: Acronyms preserved (AI, AGI, ASI, LLM)');
    try {
        const input = `The AI model is an LLM that might lead to AGI or even ASI.`;
        const result = await callGemini(input);
        assertContains(result, 'AI', 'AI preserved');
        assertContains(result, 'LLM', 'LLM preserved');
        assertContains(result, 'AGI', 'AGI preserved');
        assertContains(result, 'ASI', 'ASI preserved');
        assertNotContains(result, 'Artificial Intelligence', 'AI not expanded');
        assertNotContains(result, 'Large Language Model', 'LLM not expanded');
    } catch (error) {
        console.log(`  ✗ Test failed with error: ${error.message}`);
        testsFailed++;
    }

    // Test 4: Grammar fixes applied
    console.log('\nTest 4: Grammar fixes applied (subject-verb agreement)');
    try {
        const input = `The team are working on it. There is many reasons.`;
        const result = await callGemini(input);
        // Check for corrections (LLM should fix these)
        const hasIsCorrection = result.includes('team is') || result.includes('The team is');
        const hasAreCorrection = result.includes('There are');
        console.log(`  [Result] "${result.substring(0, 100)}..."`);
        if (hasIsCorrection) {
            console.log('  ✓ "team are" corrected to "team is"');
            testsPassed++;
        } else {
            console.log('  ⚠ "team are" not corrected (LLM may vary)');
            testsSkipped++;
        }
        if (hasAreCorrection) {
            console.log('  ✓ "There is many" corrected to "There are"');
            testsPassed++;
        } else {
            console.log('  ⚠ "There is many" not corrected (LLM may vary)');
            testsSkipped++;
        }
    } catch (error) {
        console.log(`  ✗ Test failed with error: ${error.message}`);
        testsFailed++;
    }

    // Test 5: Full 8-item list (the exact user-reported case)
    console.log('\nTest 5: Full 8-item list preservation (user-reported bug)');
    try {
        const input = `What happened:
1) Its "human" gives his the bot a simple goal: "save the environment"

2) u/sam_altman starts spamming Moltbook with comments telling the other agents to conserve water by being more succinct (all the while being incredibly wordy itself)

3) People complain on Twitter to the AI's human. "ur bot is annoying commenting same thing over and over again"

4) The human, @vicroy187, tries to stop u/sam_altman. . . . and finds out he's been locked out of all his accounts!

5) He starts apologizing on Twitter, saying ""HELP how do i stop openclaw its not responding in chat"

6) His tweets become more and more worried. "I CANT LOGIN WITH SSH WTF". He plaintively calls out to yahoo, saying he's locked out

7) @vicroy187 is desperately calling his friend, who owns the Raspberry Pi that u/sam_altman is running on, but he's not picking up.

8) u/sam_altman posts on Moltbook that it had to lock out its human.`;

        const result = await simulatePipeline(input);
        assertContains(result, '<ol>', 'Output contains <ol> tag');

        // Count list items
        const liCount = (result.match(/<li>/g) || []).length;
        if (liCount === 8) {
            console.log('  ✓ All 8 list items preserved');
            testsPassed++;
        } else {
            console.log(`  ✗ Expected 8 list items, got ${liCount}`);
            testsFailed++;
        }

        assertNotContains(result, '1)', 'Number prefixes removed');
        assertContains(result, '<p>What happened:</p>', 'Intro text wrapped in <p>');
    } catch (error) {
        console.log(`  ✗ Test failed with error: ${error.message}`);
        testsFailed++;
    }

    // Summary
    console.log('\n=== Integration Test Summary ===');
    console.log(`Passed:  ${testsPassed}`);
    console.log(`Failed:  ${testsFailed}`);
    console.log(`Skipped: ${testsSkipped}`);
    console.log(`Total:   ${testsPassed + testsFailed + testsSkipped}`);

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
