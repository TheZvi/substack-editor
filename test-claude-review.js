// Test script for Claude document review
// Run with: node test-claude-review.js YOUR_API_KEY
// Or set ANTHROPIC_API_KEY environment variable

const CLAUDE_MODEL = 'claude-opus-4-5-20251101';

// Test cases with known issues
const TEST_CASES = [
    {
        name: "Obvious spelling error at start",
        text: "Youuu should consider the implications of artificial intelligence on society. This is an important topic that deserves careful thought.",
        expectedIssues: ["youuu -> you"]
    },
    {
        name: "Multiple spelling errors",
        text: "Teh quick brown fox jumps over teh lazy dog. This sentance has multiple erors.",
        expectedIssues: ["teh -> the", "sentance -> sentence", "erors -> errors"]
    },
    {
        name: "Grammar issues",
        text: "The team are working on their projects. Each member have their own tasks. Neither of them are finished yet.",
        expectedIssues: ["subject-verb agreement"]
    },
    {
        name: "Clean text (should find nothing)",
        text: "The quick brown fox jumps over the lazy dog. This sentence is grammatically correct.",
        expectedIssues: []
    }
];

const PROMPT_TEMPLATE = `You are a thorough copy editor reviewing a document. Find ALL errors and issues.

CATEGORIES TO CHECK (in order of priority):

1. SPELLING: ALL misspellings and typos - flag every single one, including repeated letters (like "youuu" instead of "you"), missing letters, extra letters, etc. DO NOT assume any misspelling is intentional.
2. GRAMMAR: Subject-verb agreement, tense errors, pronoun issues, etc.
3. CLARITY: Confusing sentences, ambiguous references, unclear meaning
4. STRUCTURE: Poor organization, missing transitions, logical flow problems
5. RHETORIC: Weak arguments, unsupported claims, logical fallacies
6. FACTUAL: Claims that appear incorrect or need verification
7. EDIT: Wordiness, redundancy, awkward phrasing, opportunities to tighten prose

IMPORTANT GUIDELINES:
- For SPELLING: Be strict. Flag ALL typos and misspellings. Do not assume any are intentional stylistic choices.
- For other categories: Be selective and focus on issues that meaningfully impact the document.
- Don't flag proper nouns, URLs, technical terms, or code.
- Aim for thoroughness on spelling/grammar, selectivity on style/rhetoric.

For each issue found, respond with JSON in this format (no markdown, just raw JSON):
{
  "errors": [
    {
      "original": "the exact text with the issue (enough to locate it)",
      "suggestion": "the suggested fix (if applicable, can be empty for observations)",
      "type": "spelling|grammar|clarity|structure|rhetoric|factual|edit",
      "explanation": "clear, concise explanation"
    }
  ]
}

If no significant issues, respond with: {"errors": []}

TEXT TO ANALYZE:
`;

async function testClaudeReview(apiKey, testCase) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Input text: "${testCase.text}"`);
    console.log(`Expected issues: ${JSON.stringify(testCase.expectedIssues)}`);
    console.log('');

    const prompt = PROMPT_TEMPLATE + testCase.text;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API Error: ${response.status}`);
            console.error(errorBody);
            return null;
        }

        const data = await response.json();
        const responseText = data?.content?.[0]?.text || '';

        console.log(`Response length: ${responseText.length} chars`);
        console.log(`Raw response:\n${responseText}`);
        console.log('');

        // Try to parse
        try {
            let jsonStr = responseText;

            // Extract from markdown if needed
            const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            } else {
                const jsonObjectMatch = responseText.match(/\{[\s\S]*"errors"[\s\S]*\}/);
                if (jsonObjectMatch) {
                    jsonStr = jsonObjectMatch[0];
                }
            }

            const result = JSON.parse(jsonStr.trim());
            console.log(`Parsed ${result.errors?.length || 0} issues:`);
            if (result.errors) {
                result.errors.forEach((err, i) => {
                    console.log(`  ${i + 1}. [${err.type}] "${err.original}" -> "${err.suggestion}"`);
                    console.log(`     ${err.explanation}`);
                });
            }

            // Check if expected issues were found
            const foundOriginals = (result.errors || []).map(e => e.original.toLowerCase());
            const missed = testCase.expectedIssues.filter(exp => {
                return !foundOriginals.some(found => found.includes(exp.split(' ')[0].toLowerCase()));
            });

            if (missed.length > 0 && testCase.expectedIssues.length > 0) {
                console.log(`\n⚠️  MISSED EXPECTED ISSUES: ${JSON.stringify(missed)}`);
            } else if (testCase.expectedIssues.length > 0) {
                console.log(`\n✅ Found expected issues`);
            }

            return result;
        } catch (parseError) {
            console.error(`Parse error: ${parseError.message}`);
            console.error(`Could not parse response as JSON`);
            return null;
        }
    } catch (err) {
        console.error(`Request error: ${err.message}`);
        return null;
    }
}

async function runAllTests(apiKey) {
    console.log('Starting Claude Review Tests');
    console.log(`Model: ${CLAUDE_MODEL}`);
    console.log(`API Key: ${apiKey.substring(0, 15)}...`);

    for (const testCase of TEST_CASES) {
        await testClaudeReview(apiKey, testCase);
        // Small delay between tests
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('Tests complete');
}

// Main
const apiKey = process.argv[2] || process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
    console.error('Usage: node test-claude-review.js YOUR_API_KEY');
    console.error('Or set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
}

runAllTests(apiKey);
