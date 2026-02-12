// Google Docs AI Review - Comprehensive document review using Claude or Gemini
// Version 2.1: Full review (spelling, grammar, clarity, structure, rhetoric, factual, edits)
// Comments added via Google Drive API (not anchored, but include location context)

const REVIEW_GEMINI_MODEL = 'gemini-2.0-flash';
const REVIEW_CLAUDE_MODEL = 'claude-opus-4-5-20251101';  // Opus 4.5

/**
 * Format a comment with location context since API comments can't be anchored
 * @param {Object} issue - The issue object from Gemini
 * @param {number} paragraphNum - The paragraph number (1-indexed)
 * @param {string} paragraphText - The paragraph text (for context)
 * @returns {string} Formatted comment text
 */
function formatCommentWithLocation(issue, paragraphNum, paragraphText) {
    const truncatedText = paragraphText.length > 80
        ? paragraphText.substring(0, 80) + '...'
        : paragraphText;

    let comment = `PARAGRAPH ${paragraphNum}\n`;
    comment += `"${truncatedText}"\n`;
    comment += `---\n`;
    comment += `${issue.type.toUpperCase()}`;

    if (issue.original && issue.suggestion && issue.original !== issue.suggestion) {
        comment += `: "${issue.original}" -> "${issue.suggestion}"`;
    }

    comment += `\n\n${issue.explanation}`;

    return comment;
}

/**
 * Find which paragraph contains a given text
 * @param {string} searchText - Text to find
 * @param {Array} paragraphs - Array of paragraph objects
 * @returns {Object|null} Paragraph object or null
 */
function findParagraphForText(searchText, paragraphs) {
    const searchLower = searchText.toLowerCase().trim();

    for (const para of paragraphs) {
        if (para.text.toLowerCase().includes(searchLower)) {
            return para;
        }
    }

    // Fallback: try partial match (first few words)
    const searchWords = searchLower.split(/\s+/).slice(0, 5).join(' ');
    for (const para of paragraphs) {
        if (para.text.toLowerCase().includes(searchWords)) {
            return para;
        }
    }

    return null;
}

/**
 * Format document text with quoted section markers for LLM analysis
 * @param {string} text - The full document text
 * @param {Array} paragraphs - Array of paragraph objects with isQuoted flag
 * @returns {string} Text with [QUOTED] markers around quoted sections
 */
function formatTextWithQuotedMarkers(text, paragraphs) {
    if (!paragraphs || paragraphs.length === 0) {
        return text;
    }

    // Sort paragraphs by start position (should already be sorted, but ensure)
    const sortedParagraphs = [...paragraphs].sort((a, b) => a.start - b.start);

    // Build the marked-up text
    let result = '';
    let lastEnd = 0;
    let inQuotedSection = false;

    for (const para of sortedParagraphs) {
        // Add any text between paragraphs
        if (para.start > lastEnd) {
            result += text.substring(lastEnd, para.start);
        }

        // Handle transition in/out of quoted sections
        if (para.isQuoted && !inQuotedSection) {
            result += '\n[QUOTED SECTION START]\n';
            inQuotedSection = true;
        } else if (!para.isQuoted && inQuotedSection) {
            result += '\n[QUOTED SECTION END]\n';
            inQuotedSection = false;
        }

        result += text.substring(para.start, para.end);
        lastEnd = para.end;
    }

    // Close any open quoted section
    if (inQuotedSection) {
        result += '\n[QUOTED SECTION END]\n';
    }

    // Add any remaining text
    if (lastEnd < text.length) {
        result += text.substring(lastEnd);
    }

    return result;
}

/**
 * Review a Google Doc using AI and add comments via Drive API
 * @param {string} documentId - The Google Doc ID
 * @param {function} statusCallback - Callback for status updates
 * @returns {Promise<Object>} Result with issues found and comments created
 */
async function reviewGoogleDoc(documentId, statusCallback = console.log) {
    statusCallback('Reading document...');

    // Step 1: Read the document (includes paragraphs for location tracking)
    const doc = await window.GoogleDocsAPI.readDoc(documentId);
    const text = doc.text;
    const paragraphs = doc.paragraphs || [];

    if (!text || text.trim().length === 0) {
        return { success: false, error: 'Document is empty' };
    }

    // Count quoted paragraphs
    const quotedCount = paragraphs.filter(p => p.isQuoted).length;
    console.log('[Review] Document paragraphs:', paragraphs.length, '(', quotedCount, 'quoted)');
    console.log('[Review] Text length:', text.length);

    // Format text with quoted markers for LLM analysis
    const markedText = formatTextWithQuotedMarkers(text, paragraphs);

    statusCallback(`Analyzing ${text.length} characters across ${paragraphs.length} paragraphs (${quotedCount} quoted)...`);

    // Step 2: Get API keys from storage - prefer Claude if available
    const storage = await chrome.storage.local.get(['gemini-api-key', 'gemini-model', 'claude-api-key']);
    const claudeApiKey = storage['claude-api-key'];
    const geminiApiKey = storage['gemini-api-key'];
    const geminiModel = storage['gemini-model'] || REVIEW_GEMINI_MODEL;

    let issues;

    // Step 3: Send to Claude (preferred) or Gemini for comprehensive analysis
    // Use markedText which includes [QUOTED SECTION] markers
    if (claudeApiKey) {
        statusCallback(`Sending to Claude Opus 4.5 for comprehensive review...`);
        console.log('[Review] Using Claude Opus 4.5');
        issues = await analyzeTextWithClaude(markedText, claudeApiKey, statusCallback);
    } else if (geminiApiKey) {
        statusCallback(`Sending to ${geminiModel} for comprehensive review...`);
        console.log('[Review] Using Gemini:', geminiModel);
        issues = await analyzeTextWithGemini(markedText, geminiApiKey, geminiModel, 0, statusCallback);
    } else {
        return { success: false, error: 'No API key configured. Please add Claude or Gemini API key in API Settings.' };
    }

    console.log('[Review] Issues returned:', issues?.length || 0);

    if (!issues || issues.length === 0) {
        console.log('[Review] No issues found, returning success');
        return {
            success: true,
            issuesFound: 0,
            commentsCreated: 0,
            message: 'No issues found - document looks good!'
        };
    }

    // Filter out non-issues
    const actualIssues = issues.filter(issue => {
        if (!issue.original || !issue.explanation) {
            return false;
        }
        // Skip if original and suggestion are identical (for types that have suggestions)
        if (issue.suggestion && issue.original.trim().toLowerCase() === issue.suggestion.trim().toLowerCase()) {
            console.log('[Review] Skipping non-issue (identical):', issue.original);
            return false;
        }
        // Skip if explanation indicates it's not actually an issue
        if (issue.explanation.toLowerCase().includes('not an error') ||
            issue.explanation.toLowerCase().includes('spelled correctly') ||
            issue.explanation.toLowerCase().includes('no issue')) {
            console.log('[Review] Skipping non-issue:', issue.original);
            return false;
        }
        return true;
    });

    console.log('[Review] Actual issues after filtering:', actualIssues.length);

    if (actualIssues.length === 0) {
        return {
            success: true,
            issuesFound: 0,
            commentsCreated: 0,
            message: 'No issues found - document looks good!'
        };
    }

    console.log('[Review] Found issues:', JSON.stringify(actualIssues, null, 2));
    statusCallback(`Found ${actualIssues.length} issues. Adding comments via API...`);

    // Step 4: Create comments using Drive API
    let commentsCreated = 0;
    let commentsFailed = 0;

    for (const issue of actualIssues) {
        try {
            // Find which paragraph this issue belongs to
            const paragraph = findParagraphForText(issue.original, paragraphs);
            const paragraphNum = paragraph ? paragraph.number : '?';
            const paragraphText = paragraph ? paragraph.text : issue.original;

            console.log('[Review] Creating comment for:', issue.original, 'in paragraph', paragraphNum);

            // Format comment with location context
            const commentText = formatCommentWithLocation(issue, paragraphNum, paragraphText);

            // Add comment via Drive API
            await window.GoogleDocsAPI.addComment(documentId, issue.original, commentText);

            commentsCreated++;
            statusCallback(`Created comment ${commentsCreated}/${actualIssues.length}...`);

            // Small delay between API calls to avoid rate limiting
            await sleep(500);
        } catch (err) {
            console.error('[Review] Failed to create comment:', err);
            commentsFailed++;
            statusCallback(`Failed to create comment: ${err.message}`);
        }
    }

    // Summarize by category
    const categoryCounts = {};
    for (const issue of actualIssues) {
        const type = issue.type || 'other';
        categoryCounts[type] = (categoryCounts[type] || 0) + 1;
    }
    const categoryStr = Object.entries(categoryCounts)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');

    return {
        success: true,
        issuesFound: actualIssues.length,
        commentsCreated: commentsCreated,
        commentsFailed: commentsFailed,
        categories: categoryCounts,
        message: `Found ${actualIssues.length} issues (${categoryStr}), created ${commentsCreated} comments.`
    };
}

/**
 * Analyze text comprehensively using Gemini
 * @param {string} text - The text to analyze
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Gemini model to use
 * @param {number} retryCount - Current retry attempt (for rate limiting)
 * @param {function} statusCallback - Callback for status updates
 * @returns {Promise<Array>} Array of issues found
 */
async function analyzeTextWithGemini(text, apiKey, model, retryCount = 0, statusCallback = console.log) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s backoff

    const prompt = `You are a thorough document reviewer. Analyze this text and identify issues across ALL of these categories:

CATEGORIES TO CHECK:

1. SPELLING: Misspelled words, typos
2. GRAMMAR: Subject-verb agreement, tense errors, syntax issues
3. CLARITY: Confusing sentences, ambiguous references, unclear meaning, jargon without explanation
4. STRUCTURE: Poor paragraph organization, missing transitions, logical flow problems, abrupt topic changes
5. RHETORIC: Weak arguments, unsupported claims, logical fallacies, unconvincing reasoning
6. FACTUAL: Claims that appear incorrect or need verification, outdated information
7. EDIT: Wordiness, redundancy, awkward phrasing, opportunities to tighten prose

CRITICAL: QUOTED TEXT VS MAIN BODY TEXT
The text contains markers [QUOTED SECTION START] and [QUOTED SECTION END] indicating blockquotes/indented text (someone else's words being quoted).

For QUOTED/INDENTED TEXT (inside [QUOTED SECTION] markers):
- ONLY flag clear errors (obvious typos, broken formatting)
- Have a HIGH bar - these are someone else's words
- NEVER suggest improvements, style changes, or clarity edits
- NEVER point out logical errors or weak arguments (it's a quote!)
- DO NOT include [QUOTED SECTION START/END] markers in your "original" field

For MAIN BODY TEXT (outside [QUOTED SECTION] markers):
- Use normal standards - flag spelling, grammar, clarity, structure, rhetoric, factual, and edit issues
- Have a lower bar - be willing to suggest various improvements

IMPORTANT GUIDELINES:
- Only report actual issues that would improve the document if fixed
- Be specific about what text has the issue
- Provide actionable suggestions
- Ignore URLs, @mentions, code snippets, and intentional stylistic choices
- If something looks intentional (e.g., informal tone in a casual piece), don't flag it
- For factual issues, only flag things that are clearly wrong or highly suspicious

For each issue found, respond with JSON in this EXACT format (no markdown code blocks, just raw JSON):
{
  "errors": [
    {
      "original": "the exact text with the issue (enough to locate it)",
      "suggestion": "the suggested fix or improvement (if applicable)",
      "type": "spelling|grammar|clarity|structure|rhetoric|factual|edit",
      "explanation": "clear explanation of the issue and why it matters"
    }
  ]
}

If there are no issues worth reporting, respond with: {"errors": []}

TEXT TO ANALYZE:
${text}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,  // Slightly higher for more creative feedback
                topP: 0.9,
                maxOutputTokens: 16384  // Larger for comprehensive review
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Review] Gemini API error:', response.status, errorBody);

        // Handle rate limiting with retry
        if (response.status === 429 && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCount];
            console.log(`[Review] Rate limited, retrying in ${delay/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            statusCallback(`Rate limited - retrying in ${delay/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
            await sleep(delay);
            return analyzeTextWithGemini(text, apiKey, model, retryCount + 1, statusCallback);
        }

        // Provide user-friendly error messages
        if (response.status === 429) {
            throw new Error('Rate limited by Gemini API. Please wait a minute and try again.');
        } else if (response.status === 400) {
            throw new Error('Invalid request to Gemini API. The document may be too long.');
        } else if (response.status === 401 || response.status === 403) {
            throw new Error('Gemini API key is invalid or expired. Please check API Settings.');
        }

        throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    console.log('[Review] Gemini response received');

    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Review] Response text length:', responseText.length);

    if (!responseText) {
        console.error('[Review] No response text from Gemini!');
        return [];
    }

    // Parse JSON from response
    try {
        let jsonStr = responseText;

        // Try multiple patterns to extract JSON from markdown code blocks
        let jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            console.log('[Review] Extracted JSON from code block');
            jsonStr = jsonMatch[1];
        } else {
            // Pattern 2: Find JSON object directly
            const jsonObjectMatch = responseText.match(/\{[\s\S]*"errors"[\s\S]*\}/);
            if (jsonObjectMatch) {
                console.log('[Review] Extracted JSON object directly');
                jsonStr = jsonObjectMatch[0];
            }
        }

        // Clean up any remaining markdown artifacts
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');
        }

        console.log('[Review] Parsing JSON (first 300 chars):', jsonStr.substring(0, 300));
        const result = JSON.parse(jsonStr);
        console.log('[Review] Parsed issues count:', result.errors?.length || 0);
        return result.errors || [];
    } catch (parseError) {
        console.error('[Review] Failed to parse Gemini response:', parseError);

        // Try to recover partial errors from truncated JSON
        console.log('[Review] Attempting to recover partial issues from truncated JSON...');
        const recoveredErrors = [];
        const errorPattern = /\{\s*"original"\s*:\s*"([^"]+)"\s*,\s*"suggestion"\s*:\s*"([^"]*)"\s*,\s*"type"\s*:\s*"([^"]+)"\s*,\s*"explanation"\s*:\s*"([^"]+)"\s*\}/g;
        let match;
        while ((match = errorPattern.exec(responseText)) !== null) {
            recoveredErrors.push({
                original: match[1],
                suggestion: match[2],
                type: match[3],
                explanation: match[4]
            });
        }

        if (recoveredErrors.length > 0) {
            console.log(`[Review] Recovered ${recoveredErrors.length} issues from truncated response`);
            return recoveredErrors;
        }

        return [];
    }
}

/**
 * Analyze text comprehensively using Claude Opus 4.5
 * @param {string} text - The text to analyze
 * @param {string} apiKey - Claude API key
 * @param {function} statusCallback - Callback for status updates
 * @returns {Promise<Array>} Array of issues found
 */
async function analyzeTextWithClaude(text, apiKey, statusCallback = console.log) {
    // Trim whitespace from API key (common copy/paste issue)
    apiKey = apiKey.trim();
    const prompt = `You are a thorough copy editor reviewing a document. Find ALL errors and issues.

CATEGORIES TO CHECK (in order of priority):

1. SPELLING: ALL misspellings and typos - flag every single one, including repeated letters (like "youuu" instead of "you"), missing letters, extra letters, etc. DO NOT assume any misspelling is intentional.
2. GRAMMAR: Subject-verb agreement, tense errors, pronoun issues, etc.
3. CLARITY: Confusing sentences, ambiguous references, unclear meaning
4. STRUCTURE: Poor organization, missing transitions, logical flow problems
5. RHETORIC: Weak arguments, unsupported claims, logical fallacies
6. FACTUAL: Claims that appear incorrect or need verification
7. EDIT: Wordiness, redundancy, awkward phrasing, opportunities to tighten prose

CRITICAL: QUOTED TEXT VS MAIN BODY TEXT
The text contains markers [QUOTED SECTION START] and [QUOTED SECTION END] indicating blockquotes/indented text (someone else's words being quoted).

For QUOTED/INDENTED TEXT (inside [QUOTED SECTION] markers):
- ONLY flag clear errors (obvious typos, broken formatting)
- Have a HIGH bar - these are someone else's words
- NEVER suggest improvements, style changes, or clarity edits
- NEVER point out logical errors or weak arguments (it's a quote!)
- DO NOT include [QUOTED SECTION START/END] markers in your "original" field

For MAIN BODY TEXT (outside [QUOTED SECTION] markers):
- Use normal standards - flag spelling, grammar, clarity, structure, rhetoric, factual, and edit issues
- Have a lower bar - be willing to suggest various improvements

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
${text}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: REVIEW_CLAUDE_MODEL,
            max_tokens: 16384,
            messages: [{
                role: 'user',
                content: prompt
            }]
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Review] Claude API error:', response.status, errorBody);
        console.error('[Review] API Key starts with:', apiKey.substring(0, 15) + '...');
        console.error('[Review] API Key length:', apiKey.length);

        if (response.status === 429) {
            throw new Error('Rate limited by Claude API. Please wait and try again.');
        } else if (response.status === 401) {
            // Parse error body for more details
            let detail = '';
            try {
                const errJson = JSON.parse(errorBody);
                detail = errJson.error?.message || '';
            } catch (e) {}
            throw new Error(`Claude API key error (401): ${detail || 'Invalid or expired key'}. Please check API Settings.`);
        } else if (response.status === 400) {
            throw new Error('Invalid request to Claude API. Document may be too long.');
        } else if (response.status === 404) {
            throw new Error(`Claude model not found. Model: ${REVIEW_CLAUDE_MODEL}`);
        }

        throw new Error(`Claude API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    console.log('[Review] Claude response received');
    console.log('[Review] Full API response:', JSON.stringify(data, null, 2));

    const responseText = data?.content?.[0]?.text || '';
    console.log('[Review] Response text length:', responseText.length);
    console.log('[Review] Raw response text:', responseText.substring(0, 500));

    if (!responseText) {
        console.error('[Review] No response text from Claude!');
        return [];
    }

    // Parse JSON from response
    try {
        let jsonStr = responseText;

        // Extract JSON from markdown code blocks if present
        let jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const jsonObjectMatch = responseText.match(/\{[\s\S]*"errors"[\s\S]*\}/);
            if (jsonObjectMatch) {
                jsonStr = jsonObjectMatch[0];
            }
        }

        jsonStr = jsonStr.trim();
        const result = JSON.parse(jsonStr);
        console.log('[Review] Parsed issues count:', result.errors?.length || 0);
        return result.errors || [];
    } catch (parseError) {
        console.error('[Review] Failed to parse Claude response:', parseError);
        console.error('[Review] Raw response:', responseText.substring(0, 500));
        return [];
    }
}

/**
 * Extract document ID from a Google Docs URL
 * @param {string} url - The Google Docs URL
 * @returns {string|null} The document ID or null if invalid
 */
function extractDocIdFromUrl(url) {
    const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for use in popup.js
if (typeof window !== 'undefined') {
    window.GoogleDocsReview = {
        review: reviewGoogleDoc,
        extractDocId: extractDocIdFromUrl
    };
    console.log('[GoogleDocsReview] Module loaded and exported');
}
