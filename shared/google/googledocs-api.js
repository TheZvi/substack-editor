// Google Docs API integration
// Uses OAuth with PKCE for persistent authentication (refresh tokens)

const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1/documents';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';
const OAUTH_CLIENT_ID = '633231389022-1g8alhfppclvipc7ndqllubltkr0ap1b.apps.googleusercontent.com';
// Need both Docs and Drive scopes for full functionality
// drive.file only works for files created/opened by the app, so we need broader drive scope for comments
const OAUTH_SCOPES = 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Generate a random string for PKCE code verifier
 */
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier (SHA256 hash, base64url encoded)
 */
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Base64 URL encode (no padding, URL-safe characters)
 */
function base64UrlEncode(buffer) {
    let base64 = btoa(String.fromCharCode(...buffer));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Get OAuth token - tries cached token, then refresh token, then interactive auth
 * @param {boolean} interactive - Whether to show login prompt if needed
 * @returns {Promise<string>} The access token
 */
async function getGoogleAuthToken(interactive = true) {
    const cached = await chrome.storage.local.get([
        'google-access-token',
        'google-token-expiry',
        'google-refresh-token'
    ]);

    // Check if we have a valid access token
    if (cached['google-access-token'] && cached['google-token-expiry']) {
        if (Date.now() < cached['google-token-expiry']) {
            console.log('[Google Docs API] Using cached access token');
            return cached['google-access-token'];
        }
    }

    // Try to use refresh token if we have one
    if (cached['google-refresh-token']) {
        console.log('[Google Docs API] Refreshing token...');
        try {
            const tokens = await refreshAccessToken(cached['google-refresh-token']);
            return tokens.access_token;
        } catch (error) {
            console.warn('[Google Docs API] Refresh failed, need re-auth:', error.message);
            // Fall through to interactive auth
        }
    }

    // Need interactive authorization
    if (!interactive) {
        throw new Error('No valid token and interactive auth disabled');
    }

    console.log('[Google Docs API] Starting interactive auth with PKCE...');
    return await performPKCEAuth();
}

/**
 * Perform OAuth authorization code flow with PKCE
 */
async function performPKCEAuth() {
    const redirectURL = chrome.identity.getRedirectURL();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    console.log('[Google Docs API] Redirect URL:', redirectURL);

    const authURL = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authURL.searchParams.set('client_id', OAUTH_CLIENT_ID);
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('response_type', 'code');
    authURL.searchParams.set('scope', OAUTH_SCOPES);
    authURL.searchParams.set('code_challenge', codeChallenge);
    authURL.searchParams.set('code_challenge_method', 'S256');
    authURL.searchParams.set('access_type', 'offline'); // Request refresh token
    authURL.searchParams.set('prompt', 'consent'); // Need consent for refresh token

    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
            {
                url: authURL.toString(),
                interactive: true
            },
            async (responseUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!responseUrl) {
                    reject(new Error('No response URL received'));
                    return;
                }

                // Extract authorization code from URL
                const url = new URL(responseUrl);
                const code = url.searchParams.get('code');

                if (!code) {
                    reject(new Error('No authorization code in response'));
                    return;
                }

                try {
                    // Exchange code for tokens
                    const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectURL);
                    resolve(tokens.access_token);
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
    console.log('[Google Docs API] Exchanging code for tokens...');
    console.log('[Google Docs API] Client ID:', OAUTH_CLIENT_ID);
    console.log('[Google Docs API] Redirect URI:', redirectUri);
    console.log('[Google Docs API] Code length:', code?.length);
    console.log('[Google Docs API] Code verifier length:', codeVerifier?.length);

    // Get client secret from storage (required for Web Application OAuth clients)
    const storage = await chrome.storage.local.get('google-client-secret');
    const clientSecret = storage['google-client-secret'];

    if (!clientSecret) {
        throw new Error('Google client secret not configured. Please add it in the extension popup under API Settings.');
    }
    console.log('[Google Docs API] Client secret found, length:', clientSecret.length);

    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: OAUTH_CLIENT_ID,
            client_secret: clientSecret,
            code: code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        })
    });

    console.log('[Google Docs API] Token exchange response status:', response.status);

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Docs API] Token exchange failed!');
        console.error('[Google Docs API] Status:', response.status);
        console.error('[Google Docs API] Error body:', error);
        throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const tokens = await response.json();
    console.log('[Google Docs API] Got tokens, expires in:', tokens.expires_in);

    // Store tokens
    const storageData = {
        'google-access-token': tokens.access_token,
        'google-token-expiry': Date.now() + (tokens.expires_in - 60) * 1000
    };

    if (tokens.refresh_token) {
        storageData['google-refresh-token'] = tokens.refresh_token;
        console.log('[Google Docs API] Stored refresh token for future use');
    }

    await chrome.storage.local.set(storageData);

    return tokens;
}

/**
 * Use refresh token to get a new access token
 */
async function refreshAccessToken(refreshToken) {
    // Get client secret from storage (required for Web Application OAuth clients)
    const storage = await chrome.storage.local.get('google-client-secret');
    const clientSecret = storage['google-client-secret'];

    if (!clientSecret) {
        throw new Error('Google client secret not configured');
    }

    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: OAUTH_CLIENT_ID,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Docs API] Token refresh failed:', response.status, error);
        // Clear stored tokens if refresh fails
        await chrome.storage.local.remove(['google-access-token', 'google-token-expiry', 'google-refresh-token']);
        throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const tokens = await response.json();
    console.log('[Google Docs API] Refreshed token, expires in:', tokens.expires_in);

    // Store new access token (refresh token stays the same)
    await chrome.storage.local.set({
        'google-access-token': tokens.access_token,
        'google-token-expiry': Date.now() + (tokens.expires_in - 60) * 1000
    });

    return tokens;
}

/**
 * Clear stored Google auth tokens
 */
async function clearGoogleAuthTokens() {
    console.log('[Google Docs API] Clearing stored tokens...');
    await chrome.storage.local.remove([
        'google-access-token',
        'google-token-expiry',
        'google-refresh-token'
    ]);
}

/**
 * Main function: Create a Google Doc with title and content
 * Uses Google Drive API to upload HTML - Google converts it preserving all formatting
 * @param {string} title - Document title
 * @param {string} htmlContent - HTML content for the body
 * @param {boolean} isRetry - Whether this is a retry after clearing tokens
 * @returns {Promise<Object>} Result with documentId and url
 */
async function createGoogleDocWithContent(title, htmlContent, isRetry = false) {
    console.log('[Google Docs API] Starting doc creation via Drive API...');
    console.log('[Google Docs API] isRetry:', isRetry);

    // Step 1: Get auth token
    let token;
    try {
        token = await getGoogleAuthToken(true);
        console.log('[Google Docs API] Got auth token, length:', token?.length);
        console.log('[Google Docs API] Token prefix:', token?.substring(0, 20) + '...');
    } catch (authError) {
        console.error('[Google Docs API] Auth error:', authError.message);
        console.error('[Google Docs API] Full auth error:', authError);
        // If auth fails with 400, clear tokens and retry
        if (!isRetry && authError.message.includes('400')) {
            console.log('[Google Docs API] Auth error 400, clearing tokens and retrying...');
            await clearGoogleAuthTokens();
            return createGoogleDocWithContent(title, htmlContent, true);
        }
        throw authError;
    }

    // Step 2: Process HTML content for better Google Docs compatibility
    // - Ensure paragraphs have proper spacing by adding <br> after closing </p> tags
    // - Preserve blockquotes with proper styling
    let processedContent = htmlContent
        // Add line break after paragraphs to ensure spacing in Google Docs
        .replace(/<\/p>\s*<p/gi, '</p><br><p')
        // Ensure blockquotes are styled with inline styles (Google Docs respects these better)
        .replace(/<blockquote/gi, '<blockquote style="margin-left:40px;padding-left:10px;border-left:3px solid #ccc;"');

    // Step 3: Create full HTML document
    // Note: Don't include title in body - it's already set as document title via metadata
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
</head>
<body>
    ${processedContent}
</body>
</html>`;

    // Step 3: Upload HTML to Google Drive with conversion to Google Docs format
    const metadata = {
        name: title || 'Untitled',
        mimeType: 'application/vnd.google-apps.document'
    };

    const boundary = '-------GoogleDocsAPIBoundary';
    const body = `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: text/html; charset=UTF-8\r
\r
${fullHtml}\r
--${boundary}--`;

    console.log('[Google Docs API] Uploading to Drive API...');
    console.log('[Google Docs API] HTML content length:', fullHtml?.length);

    const response = await fetch(`${GOOGLE_DRIVE_API}?uploadType=multipart`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
    });

    console.log('[Google Docs API] Drive API response status:', response.status);

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Docs API] Drive API failed!');
        console.error('[Google Docs API] Status:', response.status);
        console.error('[Google Docs API] Error body:', error);
        // If we get 400 or 401, clear tokens and retry once
        if (!isRetry && (response.status === 400 || response.status === 401)) {
            console.log(`[Google Docs API] API error ${response.status}, clearing tokens and retrying...`);
            await clearGoogleAuthTokens();
            return createGoogleDocWithContent(title, htmlContent, true);
        }
        throw new Error(`Failed to create document: ${response.status} - ${error}`);
    }

    const doc = await response.json();
    console.log('[Google Docs API] Created doc via Drive:', doc.id);

    return {
        documentId: doc.id,
        title: doc.name,
        url: `https://docs.google.com/document/d/${doc.id}/edit`
    };
}

/**
 * Read a Google Doc's content as plain text with index mapping
 * @param {string} documentId - The document ID
 * @returns {Promise<Object>} Object with title, text content, and index map for anchoring
 */
async function readGoogleDoc(documentId) {
    console.log('[Google Docs API] Reading document:', documentId);

    const token = await getGoogleAuthToken(true);

    const response = await fetch(`${GOOGLE_DOCS_API}/${documentId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to read document: ${response.status} - ${error}`);
    }

    const doc = await response.json();
    console.log('[Google Docs API] Document title:', doc.title);

    // Extract plain text with index tracking for comment anchoring
    const { text, indexMap, paragraphs } = extractTextWithIndices(doc);
    console.log('[Google Docs API] Extracted text length:', text.length);
    console.log('[Google Docs API] Paragraph count:', paragraphs.length);

    return {
        documentId: doc.documentId,
        title: doc.title,
        text: text,
        indexMap: indexMap,  // Maps text positions to document indices
        paragraphs: paragraphs  // Array of { number, start, end, text }
    };
}

/**
 * Extract plain text with document index mapping for comment anchoring
 * @param {Object} doc - The document object from the API
 * @returns {Object} { text: string, indexMap: Array, paragraphs: Array } - indexMap maps text positions to doc indices, paragraphs tracks paragraph boundaries with isQuoted flag
 */
function extractTextWithIndices(doc) {
    const content = doc.body?.content || [];
    let text = '';
    const indexMap = []; // Array of { textStart, textEnd, docStart, docEnd }
    const paragraphs = []; // Array of { number, start, end, text, isQuoted }
    let paragraphNumber = 0;

    function processElements(elements, paragraphStart) {
        for (const elem of elements || []) {
            if (elem.textRun && elem.textRun.content) {
                const textStart = text.length;
                const content = elem.textRun.content;
                text += content;
                const textEnd = text.length;

                // Map this text segment to its document indices
                indexMap.push({
                    textStart: textStart,
                    textEnd: textEnd,
                    docStart: elem.startIndex,
                    docEnd: elem.endIndex,
                    content: content
                });
            }
        }
    }

    /**
     * Check if a paragraph style indicates quoted/indented text
     * Blockquotes in Google Docs typically have indentation > 0
     */
    function isQuotedParagraph(paragraph) {
        const style = paragraph.paragraphStyle;
        if (!style) return false;

        // Check for indentation (blockquotes are typically indented)
        const indentStart = style.indentStart?.magnitude || 0;
        const indentFirstLine = style.indentFirstLine?.magnitude || 0;

        // If indented by 20+ points, consider it a blockquote
        // (Standard blockquote indent is typically 36pt)
        if (indentStart >= 20 || indentFirstLine >= 20) {
            return true;
        }

        return false;
    }

    for (const element of content) {
        if (element.paragraph) {
            const paragraphStart = text.length;
            processElements(element.paragraph.elements, paragraphStart);
            const paragraphEnd = text.length;
            const paragraphText = text.substring(paragraphStart, paragraphEnd).trim();

            // Only count non-empty paragraphs
            if (paragraphText.length > 0) {
                paragraphNumber++;
                paragraphs.push({
                    number: paragraphNumber,
                    start: paragraphStart,
                    end: paragraphEnd,
                    text: paragraphText,
                    isQuoted: isQuotedParagraph(element.paragraph)
                });
            }
        } else if (element.table) {
            // Handle table cells (tables are not considered quoted text)
            for (const row of element.table.tableRows || []) {
                for (const cell of row.tableCells || []) {
                    for (const cellContent of cell.content || []) {
                        if (cellContent.paragraph) {
                            const paragraphStart = text.length;
                            processElements(cellContent.paragraph.elements, paragraphStart);
                            const paragraphEnd = text.length;
                            const paragraphText = text.substring(paragraphStart, paragraphEnd).trim();

                            if (paragraphText.length > 0) {
                                paragraphNumber++;
                                paragraphs.push({
                                    number: paragraphNumber,
                                    start: paragraphStart,
                                    end: paragraphEnd,
                                    text: paragraphText,
                                    isQuoted: false
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    return { text, indexMap, paragraphs };
}

/**
 * Add a comment to a Google Doc via Drive API (unanchored fallback)
 * Note: Anchored comments require browser automation - the API cannot create them
 * @param {string} documentId - The document ID
 * @param {string} quotedText - The text being commented on
 * @param {string} commentText - The comment content
 * @returns {Promise<Object>} The created comment
 */
async function addCommentToDoc(documentId, quotedText, commentText) {
    console.log('[Google Docs API] Adding comment to doc:', documentId);

    const token = await getGoogleAuthToken(true);

    // Note: quotedFileContent does NOT work for Google Docs anchoring
    // Google Docs uses internal kix.XXXX element IDs that only the UI can generate
    const commentData = {
        content: commentText
    };

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}/comments?fields=*`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(commentData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create comment: ${response.status} - ${error}`);
    }

    const comment = await response.json();
    console.log('[Google Docs API] Created comment:', comment.id);

    return comment;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Export for use in popup.js
if (typeof window !== 'undefined') {
    window.GoogleDocsAPI = {
        getAuthToken: getGoogleAuthToken,
        createDocWithContent: createGoogleDocWithContent,
        readDoc: readGoogleDoc,
        addComment: addCommentToDoc
    };
}
