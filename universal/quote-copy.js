// universal/quote-copy.js
// Universal Alt+A quote copy - works on any website with selected text
// Also handles PDF pages specially - preserving formatting while removing footnotes/page numbers

console.log("[Quote Copy] Loading universal quote copy...");

let recentKeys = '';
let keyTimeout = null;

// ============================================================================
// PDF Detection and Processing
// ============================================================================

/**
 * Detects if the current page is a PDF
 */
function isPdfPage() {
    const url = window.location.href.toLowerCase();

    // Check URL for .pdf extension
    if (url.endsWith('.pdf')) return true;
    if (url.includes('.pdf?')) return true;
    if (url.includes('.pdf#')) return true;

    // Check for Chrome's built-in PDF viewer extension
    if (url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')) return true;

    // Check for embedded PDF viewer
    if (document.querySelector('embed[type="application/pdf"]')) return true;
    if (document.querySelector('object[type="application/pdf"]')) return true;

    // Check for PDF.js viewer (used by Firefox and some sites)
    if (document.querySelector('#viewer.pdfViewer')) return true;

    return false;
}

/**
 * Unicode superscript digits for footnote detection
 */
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUPERSCRIPT_DIGIT_PATTERN = `[${SUPERSCRIPT_DIGITS}]`;

/**
 * Checks if text appears to be ONLY footnotes (not mixed content)
 * Footnotes typically start with a superscript number or regular number followed by text
 */
function isOnlyFootnotes(text) {
    if (!text || !text.trim()) return false;

    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) return false;

    // Check if ALL non-empty lines look like footnotes
    // Footnote patterns: "³⁵ Text..." or "35 Text..." or "35. Text..." at start of line
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

    // If most lines (>70%) look like footnotes, consider it footnote-only
    return footnoteLineCount / lines.length > 0.7;
}

/**
 * Removes footnote reference superscripts (³⁵, ³⁶, etc.) from text
 * Preserves mathematical superscripts (x², y²) by using heuristics:
 * - Footnotes: typically 2+ digits, appear after words/punctuation at phrase ends
 * - Math: typically single digit after single letter, followed by operators/spaces
 */
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
    // But NOT after a single letter (like z² in math) - use negative lookbehind
    // Match: word (2+ chars) + superscript + end of line
    result = result.replace(
        new RegExp(`([a-zA-Z]{2,})${SUPERSCRIPT_DIGIT_PATTERN}(?=\\s*$)`, 'gm'),
        '$1'
    );

    // Do NOT remove single superscript after single letters (x², y², z²) - likely math

    return result;
}

/**
 * Removes standalone page numbers from text
 * Page numbers are typically: alone on a line, just a number, often at bottom
 */
function removePageNumbers(text) {
    if (!text) return text;

    // Remove lines that are ONLY a number (with optional whitespace)
    // This catches page numbers like "107" on their own line
    return text.replace(/^\s*\d{1,4}\s*$/gm, '');
}

/**
 * Removes footnote text blocks from the selection
 * Footnote text appears at the bottom, starting with superscript or regular numbers
 * Also removes URLs that are part of footnotes
 */
function removeFootnoteText(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let inFootnoteSection = false;

    // Footnote line pattern: starts with superscript number or regular number followed by author-like text
    const footnoteLinePattern = new RegExp(
        `^\\s*(${SUPERSCRIPT_DIGIT_PATTERN}+|\\d{1,3})\\s+[A-Z]`,
        'i'
    );

    // URL line pattern (footnotes often contain URLs)
    const urlLinePattern = /^\s*https?:\/\//i;

    // Section header pattern (bold text followed by colon, indicates new section not footnote)
    const sectionHeaderPattern = /^[A-Z][^:]{2,50}:$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check if this line starts a footnote
        if (footnoteLinePattern.test(trimmed)) {
            inFootnoteSection = true;
            continue; // Skip this line
        }

        // If we're in footnote section, decide whether to continue skipping
        if (inFootnoteSection) {
            // Always skip URLs in footnote section
            if (urlLinePattern.test(trimmed)) {
                continue; // Skip URL
            }

            // Check if this looks like a new content section (not footnote continuation)
            const isBulletLine = /^[•●○▪▸►\-\*]\s/.test(trimmed);
            const isNumberedLine = /^\d+\.\s/.test(trimmed);
            const isSectionHeader = sectionHeaderPattern.test(trimmed);
            const isBlankLine = trimmed === '';
            const prevWasBlank = i > 0 && lines[i - 1]?.trim() === '';

            if (isBulletLine || isNumberedLine || isSectionHeader) {
                // New structured content - exit footnote section
                inFootnoteSection = false;
            } else if (isBlankLine) {
                // Blank line - check what comes next
                const nextLine = lines[i + 1]?.trim();
                const nextIsBullet = nextLine && /^[•●○▪▸►\-\*]\s/.test(nextLine);
                const nextIsNumbered = nextLine && /^\d+\.\s/.test(nextLine);
                const nextIsHeader = nextLine && sectionHeaderPattern.test(nextLine);
                const nextIsFootnote = nextLine && footnoteLinePattern.test(nextLine);
                const nextIsUrl = nextLine && urlLinePattern.test(nextLine);

                if (nextIsBullet || nextIsNumbered || nextIsHeader) {
                    // Next line starts new content section
                    inFootnoteSection = false;
                } else if (nextIsFootnote || nextIsUrl) {
                    // Still in footnotes
                    continue;
                } else if (!nextLine) {
                    // End of text
                    inFootnoteSection = false;
                }
                // Otherwise stay in footnote section and skip this blank line
                if (inFootnoteSection) continue;
            } else if (trimmed && prevWasBlank) {
                // Non-blank line after blank, and starts with capital - might be new paragraph
                // But if it doesn't look like structured content, might still be footnote
                // Be conservative: if it starts with capital and isn't a URL, exit footnote mode
                if (/^[A-Z]/.test(trimmed) && !urlLinePattern.test(trimmed)) {
                    // Check if this looks like a regular sentence vs footnote continuation
                    // Footnote continuations are usually short or contain citation info
                    if (trimmed.length > 60 || /^[A-Z][a-z]+\s+(is|are|was|were|the|a|an)\s/i.test(trimmed)) {
                        inFootnoteSection = false;
                    } else {
                        continue; // Likely footnote continuation
                    }
                } else {
                    continue; // Skip this line
                }
            } else if (trimmed) {
                // Non-blank continuation line - skip it
                continue;
            }
        }

        if (!inFootnoteSection) {
            result.push(line);
        }
    }

    return result.join('\n');
}

/**
 * Formats bullet points and numbered lists as HTML
 */
function formatListsAsHtml(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let inBulletList = false;
    let inNumberedList = false;

    // Bullet patterns: •, ●, ○, ▪, ▸, ►, -, * at start of line
    const bulletPattern = /^[•●○▪▸►\-\*]\s+(.+)$/;
    // Numbered pattern: 1., 2., etc. at start of line
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
            // Close any open lists
            if (inBulletList) {
                result.push('</ul>');
                inBulletList = false;
            }
            if (inNumberedList) {
                result.push('</ol>');
                inNumberedList = false;
            }
            // Regular line - preserve as paragraph or line break
            if (trimmed) {
                result.push(`<p>${escapeHtml(trimmed)}</p>`);
            }
        }
    }

    // Close any remaining open lists
    if (inBulletList) result.push('</ul>');
    if (inNumberedList) result.push('</ol>');

    return result.join('\n');
}

/**
 * Makes URLs in text clickable (for HTML output)
 */
function linkifyUrls(text) {
    if (!text) return text;

    // Match URLs (http, https, or www.)
    const urlPattern = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;

    return text.replace(urlPattern, (match) => {
        const href = match.startsWith('www.') ? 'https://' + match : match;
        return `<a href="${href}">${match}</a>`;
    });
}

/**
 * Joins artificial PDF line breaks (where text wraps visually but isn't a real paragraph)
 * PDF viewers often insert newlines at each visual line boundary
 */
function joinPdfLineBreaks(text) {
    if (!text) return text;

    const lines = text.split('\n');
    const result = [];
    let currentParagraph = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const nextLine = lines[i + 1]?.trim();

        // Empty line = real paragraph break
        if (!trimmed) {
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            continue;
        }

        // Check if this is a bullet or numbered list item (preserve as separate line)
        const isBulletLine = /^[•●○▪▸►\-\*]\s/.test(trimmed);
        const isNumberedLine = /^\d+\.\s/.test(trimmed);

        if (isBulletLine || isNumberedLine) {
            // Push current paragraph first
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            result.push(trimmed);
            continue;
        }

        // Check if this looks like a footnote line (superscript or regular number + author-style text)
        const isFootnoteLine = new RegExp(
            `^(${SUPERSCRIPT_DIGIT_PATTERN}+|\\d{1,3})\\s+[A-Z][a-z]+[,.]`,
            'i'
        ).test(trimmed);

        if (isFootnoteLine) {
            // Push current paragraph first, then this as separate line
            if (currentParagraph) {
                result.push(currentParagraph);
                currentParagraph = '';
            }
            result.push(trimmed);
            continue;
        }

        // Otherwise, join to current paragraph
        if (currentParagraph) {
            // Add space when joining, unless the line ended with hyphen (word break)
            if (currentParagraph.endsWith('-')) {
                // Remove hyphen and join directly (hyphenated word)
                currentParagraph = currentParagraph.slice(0, -1) + trimmed;
            } else {
                currentParagraph += ' ' + trimmed;
            }
        } else {
            currentParagraph = trimmed;
        }
    }

    // Don't forget the last paragraph
    if (currentParagraph) {
        result.push(currentParagraph);
    }

    return result.join('\n\n');
}

/**
 * Removes inline footnote numbers (regular digits like "56" appearing mid-text)
 * These appear when PDF viewer doesn't preserve superscript formatting
 */
function removeInlineFootnoteNumbers(text) {
    if (!text) return text;

    // Pattern: period/closing paren/bracket followed by regular digits (1-3) followed by space and capital
    // This catches: "snapshot.56 We asked" -> "snapshot. We asked"
    let result = text.replace(/([.!?\)\]])(\d{1,3})\s+([A-Z])/g, '$1 $3');

    // Also catch: word followed by digits followed by space and capital (no punctuation)
    // But be careful not to remove numbers that are part of the content
    // Pattern: word boundary + 2-digit number + space + "We/The/A/An/This/That/It/They" (common sentence starters)
    result = result.replace(/(\w)(\d{2})\s+(We|The|A|An|This|That|It|They|In|On|As|To|For)\b/g, '$1 $3');

    // Also catch: period/punctuation followed by digits at end of text (no following sentence)
    // This catches: "in the transcript.57" at end -> "in the transcript."
    result = result.replace(/([.!?\)\]])(\d{1,3})$/g, '$1');

    // And: word followed by digits at end of text
    // This catches: "transcript57" at end -> "transcript"
    result = result.replace(/(\w)(\d{2})$/g, '$1');

    return result;
}

/**
 * Processes PDF text: removes footnotes/page numbers, formats lists, linkifies URLs
 */
function processPdfText(text) {
    if (!text) return { text: '', html: '' };

    // Check if this is ONLY footnotes - if so, copy as-is
    if (isOnlyFootnotes(text)) {
        console.log("[PDF Copy] Selection appears to be footnotes only, preserving");
        const html = linkifyUrls(escapeHtml(text).replace(/\n/g, '<br>'));
        return { text: text, html: html };
    }

    // Process the text
    let processed = text;

    // Step 1: Join artificial PDF line breaks (before any other processing)
    processed = joinPdfLineBreaks(processed);

    // Step 2: Remove footnote text blocks (before references are stripped)
    processed = removeFootnoteText(processed);

    // Step 3: Remove page numbers
    processed = removePageNumbers(processed);

    // Step 4: Remove footnote references (superscript numbers) from main text
    processed = removeFootnoteReferences(processed);

    // Step 5: Remove inline footnote numbers (regular digits like "56" in text)
    processed = removeInlineFootnoteNumbers(processed);

    // Step 6: Clean up extra blank lines and spaces
    processed = processed.replace(/\n{3,}/g, '\n\n');
    processed = processed.replace(/  +/g, ' ');
    processed = processed.trim();

    // Step 7: Create HTML with lists and links
    let html = formatListsAsHtml(processed);
    html = linkifyUrls(html);

    return { text: processed, html: html };
}

/**
 * Copies PDF content with formatting preserved and footnotes/page numbers removed
 */
async function copyPdfContent() {
    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim();

    if (!selectedText) {
        showNotification("No text selected", true);
        return;
    }

    console.log("[PDF Copy] Selected text length:", selectedText.length);
    console.log("[PDF Copy] First 200 chars:", selectedText.substring(0, 200));

    // Process the PDF text
    const { text, html } = processPdfText(selectedText);

    if (!text) {
        showNotification("No content to copy after processing", true);
        return;
    }

    // Copy to clipboard (no author prefix for PDFs)
    try {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([text], { type: 'text/plain' });

        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
            })
        ]);

        console.log("[PDF Copy] Copied:", text.substring(0, 100) + "...");
        showNotification("PDF content copied");
    } catch (err) {
        console.error("[PDF Copy] Clipboard write failed:", err);
        // Fallback to plain text
        try {
            await navigator.clipboard.writeText(text);
            showNotification("PDF content copied (text only)");
        } catch (err2) {
            console.error("[PDF Copy] Fallback clipboard failed:", err2);
            showNotification("Failed to copy to clipboard", true);
        }
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isPdfPage,
        isOnlyFootnotes,
        removeFootnoteReferences,
        removePageNumbers,
        removeFootnoteText,
        formatListsAsHtml,
        linkifyUrls,
        processPdfText
    };
}

// ============================================================================
// Keyboard Listeners
// ============================================================================

// True when this content script instance was orphaned by an extension
// reload/update. Orphaned instances keep their DOM listeners, so without this
// check shortcuts fire twice (once here, once in the fresh instance).
function isOrphanedInstance() {
    try {
        return !chrome.runtime?.id;
    } catch (e) {
        return true;
    }
}

// Listen for ";a" sequence
document.addEventListener('keydown', (e) => {
    if (isOrphanedInstance()) return;
    // Don't trigger if user is typing in an input field
    const activeEl = document.activeElement;
    const isTyping = activeEl.tagName === 'INPUT' ||
                     activeEl.tagName === 'TEXTAREA' ||
                     activeEl.getAttribute('contenteditable') === 'true' ||
                     activeEl.closest('[contenteditable="true"]');

    if (isTyping) return;

    // Build up recent key sequence
    recentKeys += e.key;

    // Clear after 1 second of no typing
    clearTimeout(keyTimeout);
    keyTimeout = setTimeout(() => {
        recentKeys = '';
    }, 1000);

    // Check for ";a" command
    if (recentKeys.endsWith(';a')) {
        console.log("[Quote Copy] ;a detected");
        recentKeys = '';
        copySelectedQuote();
    }
});

// Alt+A shortcut
document.addEventListener('keydown', (e) => {
    if (isOrphanedInstance()) return;
    // Don't trigger if user is typing in an input field
    const activeEl = document.activeElement;
    const isTyping = activeEl.tagName === 'INPUT' ||
                     activeEl.tagName === 'TEXTAREA' ||
                     activeEl.getAttribute('contenteditable') === 'true' ||
                     activeEl.closest('[contenteditable="true"]');

    if (isTyping) return;

    // Alt+A - copy selection as quote
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        console.log("[Quote Copy] Alt+A detected");
        copySelectedQuote();
    }

    // Alt+Z - copy URL of last closed tab
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        console.log("[Quote Copy] Alt+Z detected - getting last closed tab URL");
        copyLastClosedTabUrl();
    }
}, true);

// ============================================================================
// Main Copy Function
// ============================================================================

/**
 * Looks up an author annotation from chrome.storage.sync
 * @param {string} authorName - Display name to match
 * @param {string|null} handle - Not used for universal copy (no handle available)
 * @param {boolean} isTwitter - Always false for universal copy
 * @returns {Promise<{info: string, nameToShow: string|undefined}|null>} Annotation data, or null
 */
async function getAuthorAnnotation(authorName, handle, isTwitter) {
    try {
        const result = await chrome.storage.sync.get('authorAnnotations');
        const annotations = result.authorAnnotations || [];
        const nameLower = authorName ? authorName.toLowerCase() : '';

        for (const ann of annotations) {
            if (ann.twitterOnly && !isTwitter) continue;
            if (ann.name.toLowerCase() === nameLower) return { info: ann.info, nameToShow: ann.nameToShow };
        }
    } catch (e) {
        console.error("[Quote Copy] Error looking up annotation:", e);
    }
    return null;
}

// ============================================================================
// Archive snapshot support (archive.today family + Wayback Machine)
//
// Snapshot pages should quote as if they were the original site: website
// annotations key off the original domain and the copied link points to the
// original URL. isArchiveHost/extractEmbeddedUrl are pure for unit testing.
// ============================================================================

const ARCHIVE_HOST_PATTERN = /(^|\.)(archive\.(is|ph|today|md|li|vn|fo)|web\.archive\.org)$/i;

function isArchiveHost(hostname) {
    return ARCHIVE_HOST_PATTERN.test(hostname || '');
}

// Pull an embedded original URL out of an archive snapshot URL, e.g.
//   https://archive.is/2026.06.27-130734/https://www.axios.com/...   (canonical)
//   https://archive.is/o/cXCJ0/https://www.axios.com/authors/x       (rewritten link)
//   https://web.archive.org/web/20260627000000/https://www.axios.com/ (wayback)
function extractEmbeddedUrl(url) {
    if (!url) return null;
    const match = url.match(/^https?:\/\/[^/]+\/.*?(https?:\/\/?.+)$/i);
    if (!match) return null;
    // Wayback sometimes collapses "https://" to "https:/" — restore it
    return match[1].replace(/^(https?:\/)([^/])/i, '$1/$2');
}

function getArchiveOriginalUrl() {
    if (!isArchiveHost(window.location.hostname)) return null;
    try {
        // The address bar (full-form snapshots, wayback) or the canonical link
        // (archive.today short links like /cXCJ0) carries the original URL.
        const candidates = [
            window.location.href,
            document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        ];
        for (const candidate of candidates) {
            const embedded = extractEmbeddedUrl(candidate);
            if (embedded && isValidUrl(embedded) && !isArchiveHost(new URL(embedded).hostname)) {
                return cleanUrl(embedded);
            }
        }
        // Fallback: archive.today's "saved from" search box holds the original URL
        for (const input of document.querySelectorAll('input[type="text"]')) {
            const val = (input.value || '').trim();
            if (/^https?:\/\//i.test(val) && isValidUrl(val) && !isArchiveHost(new URL(val).hostname)) {
                return cleanUrl(val);
            }
        }
    } catch (e) {
        console.error("[Quote Copy] Error extracting archive original URL:", e);
    }
    return null;
}

/**
 * Looks up a website annotation from chrome.storage.sync based on current hostname.
 * On archive snapshots, the original site's hostname is used instead, so
 * e.g. an archived Axios article gets the axios.com annotation.
 * @returns {Promise<string|null>} The annotation text, or null
 */
async function getWebsiteAnnotation() {
    try {
        const result = await chrome.storage.sync.get('websiteAnnotations');
        const annotations = result.websiteAnnotations || [];
        let hostname = window.location.hostname.toLowerCase();
        const originalUrl = getArchiveOriginalUrl();
        if (originalUrl) {
            try {
                hostname = new URL(originalUrl).hostname.toLowerCase();
            } catch (e) { /* keep archive hostname */ }
        }

        for (const ann of annotations) {
            const domain = ann.domain.toLowerCase();
            // Match if hostname equals domain or ends with .domain (e.g., www.wsj.com matches wsj.com)
            if (hostname === domain || hostname.endsWith('.' + domain)) {
                console.log("[Quote Copy] Found website annotation:", ann.annotation, "for", hostname);
                return ann.annotation;
            }
        }
    } catch (e) {
        console.error("[Quote Copy] Error looking up website annotation:", e);
    }
    return null;
}

async function copySelectedQuote() {
    // Check if on PDF page - use special handling
    const onPdf = isPdfPage();
    console.log("[Quote Copy] isPdfPage:", onPdf, "URL:", window.location.href.substring(0, 100));

    if (onPdf) {
        console.log("[Quote Copy] PDF page detected, using PDF handler");
        return copyPdfContent();
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText) {
        showNotification("No text selected", true);
        return;
    }

    console.log("[Quote Copy] Selected text:", selectedText.substring(0, 100) + "...");

    // Get the selection's HTML to preserve formatting (bullet points, bold, etc.)
    let selectedHtml = '';
    let range = null;
    if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);
        selectedHtml = tempDiv.innerHTML;
        console.log("[Quote Copy] Selected HTML:", selectedHtml.substring(0, 200) + "...");
    }

    // Detect author using heuristics
    let author = detectAuthor(range);
    let url = detectUrl(range);

    // If heuristics failed, try LLM fallback
    if (!author) {
        console.log("[Quote Copy] Heuristics failed, trying LLM fallback...");
        showNotification("Detecting author...");

        try {
            author = await detectAuthorWithLLM(range, selectedText);
        } catch (err) {
            console.error("[Quote Copy] LLM fallback failed:", err);
        }
    }

    // If still no author, use page title
    if (!author) {
        author = getPageTitle();
        console.log("[Quote Copy] Using page title as author:", author);
    }

    // Look up annotation for this author, fall back to website annotation
    const authorAnnotation = await getAuthorAnnotation(author, null, false);
    let annotationInfo = authorAnnotation?.info;
    const displayName = authorAnnotation?.nameToShow || author;
    if (!annotationInfo) {
        annotationInfo = await getWebsiteAnnotation();
    }
    const infoText = annotationInfo ? ` (${escapeHtml(annotationInfo)})` : '';

    // Build the quote - use selection HTML to preserve formatting (bullets, bold, etc.)
    // Escape the URL for safe use inside the href attribute (& and " in particular)
    const safeUrl = escapeHtml(url).replace(/"/g, '&quot;');
    const authorPrefix = `<a href="${safeUrl}">${escapeHtml(displayName)}</a>${infoText}: `;
    const contentHtml = selectedHtml || escapeHtml(selectedText);
    const html = authorPrefix + contentHtml;
    const plainText = `${displayName}${annotationInfo ? ` (${annotationInfo})` : ''}: ${selectedText}`;

    // Copy to clipboard
    try {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });

        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
            })
        ]);

        console.log("[Quote Copy] Copied:", plainText.substring(0, 100) + "...");
        showNotification(`Quote copied: ${displayName}`);
    } catch (err) {
        console.error("[Quote Copy] Clipboard write failed:", err);
        // Fallback to plain text
        try {
            await navigator.clipboard.writeText(plainText);
            showNotification(`Quote copied (text only): ${displayName}`);
        } catch (err2) {
            console.error("[Quote Copy] Fallback clipboard failed:", err2);
            showNotification("Failed to copy to clipboard", true);
        }
    }
}

// ============================================================================
// Last Closed Tab URL
// ============================================================================

async function copyLastClosedTabUrl() {
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'get-last-closed-tab-url' }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(resp);
            });
        });

        if (response?.success && response.url) {
            await navigator.clipboard.writeText(response.url);
            const title = response.title || response.url;
            const display = title.length > 40 ? title.substring(0, 37) + '...' : title;
            showNotification(`Copied: ${display}`);
        } else {
            showNotification(response?.error || 'No recently closed tabs', true);
        }
    } catch (err) {
        console.error("[Quote Copy] Failed to get last closed tab:", err);
        showNotification("Failed to get last closed tab URL", true);
    }
}

// ============================================================================
// Author Detection - Heuristics
// ============================================================================

function detectAuthor(range) {
    if (!range) return null;

    // Get the common ancestor element
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // 1. Check if inside a blockquote
    const blockquote = container.closest('blockquote');
    if (blockquote) {
        const author = detectBlockquoteAuthor(blockquote);
        if (author) {
            console.log("[Quote Copy] Found blockquote author:", author);
            return author;
        }
    }

    // 2a. LessWrong / EA Forum / Alignment Forum comment detection
    // Each comment is wrapped in a div.comments-node; nesting is recursive.
    // We find the innermost comments-node and get the first user link that belongs
    // directly to it (not to a nested child comments-node).
    const hostname = window.location.hostname;
    if (hostname.includes('lesswrong.com') ||
        hostname.includes('alignmentforum.org') ||
        hostname.includes('forum.effectivealtruism.org')) {
        const commentNode = container.closest('.comments-node');
        if (commentNode) {
            const userLinks = commentNode.querySelectorAll('a[href*="/users/"]');
            for (const link of userLinks) {
                // Ensure this link belongs to THIS comment frame, not a nested reply
                if (link.closest('.comments-node') === commentNode) {
                    const text = link.textContent?.trim();
                    if (text && text.length > 1 && text.length < 50) {
                        console.log("[Quote Copy] Found LessWrong comment author:", text);
                        return cleanAuthorName(text);
                    }
                }
            }
        }
    }

    // 2b. Check if inside a comment (generic)
    const comment = findCommentContainer(container);
    if (comment) {
        const author = detectCommentAuthor(comment);
        if (author) {
            console.log("[Quote Copy] Found comment author:", author);
            return author;
        }
    }

    // 3. Fall back to page author
    const pageAuthor = detectPageAuthor();
    if (pageAuthor) {
        console.log("[Quote Copy] Found page author:", pageAuthor);
        return pageAuthor;
    }

    return null;
}

function detectBlockquoteAuthor(blockquote) {
    // Check cite attribute (rarely used but standards-compliant)
    // Note: cite attribute contains URL, not author name

    // Look for <cite> element inside or after blockquote
    let cite = blockquote.querySelector('cite');
    if (cite?.textContent?.trim()) {
        return cleanAuthorName(cite.textContent);
    }

    // Check for cite element right after blockquote
    const nextSibling = blockquote.nextElementSibling;
    if (nextSibling?.tagName === 'CITE' || nextSibling?.querySelector('cite')) {
        const citeEl = nextSibling.tagName === 'CITE' ? nextSibling : nextSibling.querySelector('cite');
        if (citeEl?.textContent?.trim()) {
            return cleanAuthorName(citeEl.textContent);
        }
    }

    // Look for attribution patterns inside blockquote
    const text = blockquote.textContent;
    const patterns = [
        /[—–-]\s*([A-Z][a-zA-Z\s.]+?)$/m,           // — Author Name (at end)
        /~\s*([A-Z][a-zA-Z\s.]+?)$/m,               // ~ Author Name
        /\n\s*[—–-]\s*([A-Z][a-zA-Z\s.]+)/,         // Newline then dash and name
        /\(\s*([A-Z][a-zA-Z\s.]+?)\s*\)$/,          // (Author Name) at end
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return cleanAuthorName(match[1]);
        }
    }

    // Check for footer/figcaption with attribution
    const footer = blockquote.querySelector('footer, figcaption');
    if (footer?.textContent?.trim()) {
        return cleanAuthorName(footer.textContent);
    }

    return null;
}

function findCommentContainer(element) {
    // Look for common comment container patterns
    const commentSelectors = [
        // Site-specific (check first for accuracy)
        'article.blog-comment',  // Marginal Revolution
        // Substack-specific
        '[class*="comment-content"]',
        '[class*="comment-body"]',
        '[data-testid="comment"]',
        // Generic patterns
        '[class*="comment"]',
        '[class*="Comment"]',
        '[id*="comment"]',
        '[data-comment]',
        '[data-testid*="comment"]',
        '.reply',
        '.thing', // Old Reddit
        '.athing', // Hacker News
    ];

    for (const selector of commentSelectors) {
        const container = element.closest(selector);
        if (container) {
            return container;
        }
    }

    return null;
}

function detectCommentAuthor(commentContainer) {
    // Substack-specific: look for the author name link in comment header
    // Substack comments have structure like: avatar + author name link + timestamp link
    if (window.location.hostname.includes('substack.com')) {
        // Try to find the first link that looks like a profile link (not the timestamp)
        const links = commentContainer.querySelectorAll('a[href*="/profile/"], a[href*="/@"]');
        for (const link of links) {
            const text = link.textContent?.trim();
            // Skip if it looks like a timestamp (contains numbers like "1d", "2h", etc.)
            if (text && text.length < 50 && !/^\d+[hdwmy]$/i.test(text)) {
                console.log("[Quote Copy] Found Substack comment author:", text);
                return cleanAuthorName(text);
            }
        }

        // Also try looking for author name in the comment header area
        const headerSelectors = [
            '[class*="comment-meta"] a',
            '[class*="comment-header"] a',
            '[class*="commenter"]',
            '[class*="author-name"]',
        ];
        for (const selector of headerSelectors) {
            const el = commentContainer.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                if (text && text.length < 50 && !/^\d+[hdwmy]$/i.test(text)) {
                    return cleanAuthorName(text);
                }
            }
        }
    }

    // Common selectors for comment authors
    const authorSelectors = [
        // Site-specific (check first for accuracy)
        'h3.comment-author',  // Marginal Revolution
        '.author',
        '.comment-author',
        '.commenter',
        '.username',
        '.user-name',
        '.display-name',
        '[class*="author"]',
        '[class*="Author"]',
        '[data-author]',
        '[data-testid*="author"]',
        '[data-testid*="username"]',
        '.hnuser',           // Hacker News
        'a[href*="/user/"]', // Reddit-style
        'a[href*="/u/"]',    // Reddit new
        '.byline',
        '.posted-by',
        '.meta .name',
        '.user a',
    ];

    for (const selector of authorSelectors) {
        const authorEl = commentContainer.querySelector(selector);
        if (authorEl) {
            // Try data attribute first
            const dataAuthor = authorEl.getAttribute('data-author');
            if (dataAuthor) return cleanAuthorName(dataAuthor);

            // Then text content
            const text = authorEl.textContent?.trim();
            if (text && text.length < 50) { // Reasonable length for a name
                return cleanAuthorName(text);
            }
        }
    }

    return null;
}

// Rejects lines that look like a job title rather than a name, e.g. "Senior Reporter",
// which can otherwise be misidentified as the byline when it sits just above "Published".
const JOB_TITLE_PATTERN = /^(senior |staff |chief |managing |deputy |associate |assistant |contributing |executive |freelance |lead |principal )?(reporter|editor|writer|correspondent|columnist|journalist|contributor|producer|analyst|commentator|anchor|host)s?$/i;

function isLikelyJobTitle(text) {
    return JOB_TITLE_PATTERN.test(text.trim());
}

// Wire services and agency bylines — never a person. Syndicated pages (e.g.
// usnews.com running Reuters copy) show "By Reuters" above the human byline
// ("By Daniel Wiessner"), so these are skipped rather than accepted.
const WIRE_SERVICE_PATTERN = /^(the\s+)?(reuters|associated press|ap|afp|agence france[- ]presse|bloomberg|staff(\s+reports?)?)$/i;

function isWireServiceName(text) {
    return WIRE_SERVICE_PATTERN.test(text.trim());
}

// Some sites (e.g. politico.com) render bylines in all caps ("By DANA NICKEL"),
// either literally or via CSS text-transform, which innerText reflects.
// Convert to title case so validation and output treat it as a normal name.
// Connector words ("and", "&") may be lowercase in an otherwise all-caps byline.
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

/**
 * Extract a byline from raw innerText of the page body.
 * Pure function (no DOM access) so it can be unit-tested directly.
 * Returns the author string or null.
 */
function extractBylineFromBodyText(bodyText) {
    if (!bodyText) return null;

    // Prefer the explicit "By AuthorName" pattern first — it's more specific than
    // "line before Published" and avoids grabbing subtitle lines like "Senior Reporter"
    // that appear between the byline and the publication date (e.g. sfstandard.com).
    // Iterate every "By X" line rather than stopping at the first: syndicated
    // pages carry a wire byline ("By Reuters") above the human author's.
    const earlyText = bodyText.substring(0, 3000);
    for (const byLineMatch of earlyText.matchAll(/\n[Bb]y ([^\n]{4,120})(?=\n)/g)) {
        let potentialByline = byLineMatch[1].trim();
        // All-caps byline (Politico style "By DANA NICKEL") — title-case it so the
        // capWords validation below accepts it and the output reads as a name.
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

    // Fallback: line immediately before "Published" (common in news articles like FT).
    // Handles: "Author Name", "Author1 and Author2", "Author1 and Author2 in Location".
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

// ============================================================================
// Author profile links
//
// archive.today (archive.is/.ph/.md/...) strips meta tags, breaks JSON-LD and
// removes classes/data-testid from archived pages, which kills every other
// detection layer. But it keeps hrefs, rewritten as
// archive.is/o/<code>/<original-url>, so the original author-profile path
// (e.g. axios.com/authors/mikeallen, nytimes.com/by/cade-metz) is still
// present as a substring. These helpers are pure so they can be unit-tested.
// ============================================================================

// Author/staff profile path segments used by major outlets:
// /authors/ (Axios, Bloomberg, The Verge), /by/ (NYT), /staff/ (Politico),
// /people/ (WaPo), /author/ (WordPress and many others).
const AUTHOR_PROFILE_HREF_PATTERN = /\/(authors?|by|staff|people|profiles?|contributors?|writers?|columnists?)\/[^/?#]/i;

function isAuthorProfileHref(href) {
    if (!href) return false;
    if (/^(mailto:|javascript:|tel:|#)/i.test(href)) return false;
    return AUTHOR_PROFILE_HREF_PATTERN.test(href);
}

// Byline anchors sometimes include the separator inside the link text
// (e.g. "Mike Allen,  " on archived Axios pages). Strip leading/trailing
// separators before name validation.
function cleanAuthorLinkText(text) {
    return (text || '')
        .replace(/^[\s,&]+|[\s,&]+$/g, '')
        .replace(/^and\s+/i, '')
        .replace(/\s+and$/i, '')
        .trim();
}

// Does the link text look like a person's name? 2-4 words, starts capitalized,
// at least two capital letters overall (allows lowercase particles like
// "von der"), no job titles or nav labels ("More Authors", "About Us").
function isLikelyPersonName(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 4 || trimmed.length > 50) return false;
    if (isLikelyJobTitle(trimmed)) return false;
    if (/^(more|all|meet|our|the|about|other|view|see|read)\b/i.test(trimmed)) return false;
    if (!/^[A-Z][A-Za-zÀ-ÿ.'’-]*(\s+[A-Za-zÀ-ÿ.'’-]+){1,3}$/.test(trimmed)) return false;
    return (trimmed.match(/[A-Z]/g) || []).length >= 2;
}

// Join multiple authors the same way the JSON-LD path does.
// Capped at 4 names as a safeguard against runaway matches.
function joinAuthorNames(names) {
    const capped = names.slice(0, 4);
    if (capped.length === 0) return null;
    if (capped.length === 1) return capped[0];
    if (capped.length === 2) return `${capped[0]} and ${capped[1]}`;
    return capped.slice(0, -1).join(', ') + ' and ' + capped[capped.length - 1];
}

function detectPageAuthor() {
    // 0. Site-specific detection (check first for accuracy)
    const hostname = window.location.hostname;

    // LessWrong / EA Forum / Alignment Forum detection
    if (hostname.includes('lesswrong.com') ||
        hostname.includes('alignmentforum.org') ||
        hostname.includes('forum.effectivealtruism.org')) {

        // LessWrong uses links to /users/username for author profiles
        // The author link is typically near the post title, often with "by" prefix
        const userLinks = document.querySelectorAll('a[href*="/users/"]');
        for (const link of userLinks) {
            const text = link.textContent?.trim();
            // Skip navigation/menu items - the logged-in user's profile link
            // appears in the site nav and must not be picked up as post author
            if (link.closest('nav, [class*="Navigation"], [class*="navigation"], [class*="UsersMenu"], [class*="header-"]')) {
                continue;
            }
            const rect = link.getBoundingClientRect();
            // Author name should be in the top portion of the page and have reasonable length
            if (text && text.length > 1 && text.length < 50 && rect.top < 400) {
                // Check if there's "by" text before this link or author-related class
                const parent = link.parentElement;
                const parentText = parent?.textContent || '';
                if (parentText.toLowerCase().includes('by ') ||
                    parent?.className?.toLowerCase().includes('author') ||
                    parent?.className?.toLowerCase().includes('byline')) {
                    console.log("[Quote Copy] Found LessWrong author:", text);
                    return cleanAuthorName(text);
                }
                // Check if in the post header area (NOT the site-wide header/nav)
                const postHeader = link.closest('[class*="PostsPageHeader"], [class*="PostsAuthor"], [class*="post-header"], [class*="PostHeader"]');
                if (postHeader) {
                    console.log("[Quote Copy] Found LessWrong header author:", text);
                    return cleanAuthorName(text);
                }
            }
        }

        // Fallback: look for "by AuthorName" pattern in any element near the top
        const headerElements = document.querySelectorAll('h1, h2, [class*="PostsPageHeader"], [class*="post-title"]');
        for (const header of headerElements) {
            const sibling = header.nextElementSibling;
            if (sibling) {
                const siblingText = sibling.textContent || '';
                const byMatch = siblingText.match(/^by\s+(\S+)/i);
                if (byMatch) {
                    console.log("[Quote Copy] Found LessWrong 'by' author:", byMatch[1]);
                    return cleanAuthorName(byMatch[1]);
                }
            }
        }
    }

    // 1. Text-based byline extraction — works on archive.is and sites with unusual markup
    const bodyText = document.body?.innerText || '';
    const textByline = extractBylineFromBodyText(bodyText);
    if (textByline) {
        console.log("[Quote Copy] Found byline in body text:", textByline);
        return cleanAuthorName(textByline);
    }

    // 2. Meta tags. twitter:creator is NOT here — it's frequently the publication's
    // own handle (e.g. @politico) rather than the author, so it's a last-resort
    // fallback below, after JSON-LD and DOM bylines.
    const metaSelectors = [
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[property="og:article:author"]',
        'meta[name="dc.creator"]',
    ];

    const siteLabel = hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
    for (const selector of metaSelectors) {
        const meta = document.querySelector(selector);
        const content = meta?.getAttribute('content');
        if (content?.trim()) {
            // Skip URL values (e.g., article:author often contains author profile URL, not name)
            if (content.trim().startsWith('http://') || content.trim().startsWith('https://')) {
                continue;
            }
            // Skip platform boilerplate: a meta author matching the site's own
            // name (e.g. "Substack" on substack.com) is not a person
            if (content.trim().toLowerCase() === siteLabel) {
                continue;
            }
            return cleanAuthorName(content);
        }
    }

    // 3. JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
        try {
            const data = JSON.parse(script.textContent);
            const author = extractAuthorFromJsonLd(data);
            if (author) return author;
        } catch (e) {
            // Invalid JSON, skip
        }
    }

    // 4. Common DOM selectors for bylines
    const bylineSelectors = [
        '.author-name',
        '.byline-name',
        '.author a',
        '.byline a',
        '[rel="author"]',
        '.post-author',
        '.entry-author',
        '.author',
        '.byline',
        '.posted-by a',
        '[data-testid="authorName"]',
        '.article-author',
        '.article__author',
        '.writer-name',
        '.contributor',
    ];

    for (const selector of bylineSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            // Skip elements inside comment sections (these are comment authors, not post authors)
            if (el.closest('#comments, .comments, .comments-area, [class*="comment-list"], [id*="comments"], article.blog-comment')) {
                continue;
            }
            const text = el.textContent?.trim();
            if (text && text.length < 50 && text.length > 1) {
                const cleaned = cleanAuthorName(text);
                if (cleaned && cleaned.length > 1) {
                    return cleaned;
                }
            }
        }
    }

    // 5. Substack-specific
    const substackAuthor = document.querySelector('.byline-content .profile-name');
    if (substackAuthor?.textContent?.trim()) {
        return cleanAuthorName(substackAuthor.textContent);
    }

    // 6. Author profile links (a[href*="/authors/"], /by/, /staff/, ...).
    // The main path that still works on archive.today snapshots, where meta
    // tags, JSON-LD and classes are all stripped but hrefs survive inside
    // the rewritten archive.is/o/<code>/<original-url> form.
    const authorLinks = [];
    for (const link of document.querySelectorAll('a[href]')) {
        if (!isAuthorProfileHref(link.getAttribute('href'))) continue;
        if (link.closest('#comments, .comments, .comments-area, [class*="comment-list"], [id*="comments"], article.blog-comment')) {
            continue;
        }
        if (isLikelyPersonName(cleanAuthorLinkText(link.textContent))) {
            authorLinks.push(link);
        }
    }
    if (authorLinks.length > 0) {
        // First matching link in document order is the byline (bylines sit at
        // the top). Co-authors of the same article share its list/container.
        const first = authorLinks[0];
        const container = first.closest('ul, ol') || first.parentElement;
        const names = [];
        for (const link of authorLinks) {
            if (link !== first && !(container && container.contains(link))) continue;
            const name = cleanAuthorName(cleanAuthorLinkText(link.textContent));
            if (name && !names.includes(name)) names.push(name);
        }
        const joined = joinAuthorNames(names);
        if (joined) {
            console.log("[Quote Copy] Found author profile link(s):", joined);
            return joined;
        }
    }

    // 7. twitter:creator as last resort. Skip when it's the publication's own
    // handle (e.g. @politico on politico.com) rather than a person.
    const twitterCreator = document.querySelector('meta[name="twitter:creator"]')
        ?.getAttribute('content')?.trim();
    if (twitterCreator && !twitterCreator.startsWith('http')) {
        const handle = twitterCreator.replace(/^@/, '').toLowerCase();
        if (handle && handle !== siteLabel) {
            return cleanAuthorName(twitterCreator);
        }
    }

    return null;
}

function extractAuthorFromJsonLd(data) {
    // Handle arrays (multiple JSON-LD blocks)
    if (Array.isArray(data)) {
        for (const item of data) {
            const author = extractAuthorFromJsonLd(item);
            if (author) return author;
        }
        return null;
    }

    // Check for article types
    const articleTypes = ['Article', 'NewsArticle', 'BlogPosting', 'WebPage', 'CreativeWork'];
    if (data['@type'] && articleTypes.some(t => data['@type'].includes(t))) {
        if (data.author) {
            if (typeof data.author === 'string') {
                return cleanAuthorName(data.author);
            }
            if (data.author.name) {
                return cleanAuthorName(data.author.name);
            }
            if (Array.isArray(data.author)) {
                const names = data.author
                    .map(a => cleanAuthorName(a.name || (typeof a === 'string' ? a : '')))
                    .filter(n => n);
                if (names.length === 0) return null;
                if (names.length === 1) return names[0];
                if (names.length === 2) return `${names[0]} and ${names[1]}`;
                return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
            }
        }
    }

    return null;
}

// ============================================================================
// Author Detection - LLM Fallback
// ============================================================================

async function detectAuthorWithLLM(range, selectedText) {
    // Get context around selection
    let contextHtml = '';

    if (range) {
        // Get parent element context
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) {
            container = container.parentElement;
        }

        // Walk up to get more context, but limit depth
        let contextEl = container;
        for (let i = 0; i < 3 && contextEl.parentElement; i++) {
            contextEl = contextEl.parentElement;
        }

        // Get innerHTML but truncate to reasonable size
        contextHtml = contextEl.innerHTML.substring(0, 2000);
    }

    // Also include page metadata
    const pageTitle = document.title;
    const pageUrl = window.location.href;

    // Build prompt context
    const context = {
        selectedText: selectedText.substring(0, 500),
        surroundingHtml: contextHtml,
        pageTitle: pageTitle,
        pageUrl: pageUrl
    };

    // Send to background script for LLM processing
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'detect-author-llm',
            context: context
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response?.success && response?.author) {
                resolve(response.author);
            } else {
                reject(new Error(response?.error || 'No author detected'));
            }
        });
    });
}

// ============================================================================
// URL Detection
// ============================================================================

// Page URL for the quote link: on archive snapshots, prefer the original URL.
function getQuotePageUrl() {
    const original = getArchiveOriginalUrl();
    if (original) {
        console.log("[Quote Copy] Using original URL from archive snapshot:", original);
        return original;
    }
    return cleanUrl(window.location.href);
}

function detectUrl(range) {
    if (!range) {
        return getQuotePageUrl();
    }

    // Get the common ancestor element
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // Check if inside a blockquote with cite attribute
    const blockquote = container.closest('blockquote');
    if (blockquote) {
        const cite = blockquote.getAttribute('cite');
        if (cite && isValidUrl(cite)) {
            console.log("[Quote Copy] Using blockquote cite URL:", cite);
            return cite;
        }
    }

    // Check if inside a comment - look for comment permalink
    const commentContainer = findCommentContainer(container);
    if (commentContainer) {
        // Substack-specific: timestamp link is the comment permalink
        if (window.location.hostname.includes('substack.com')) {
            // Look for links that contain "/comment/" in the href
            const commentLink = commentContainer.querySelector('a[href*="/comment/"]');
            if (commentLink?.href) {
                console.log("[Quote Copy] Using Substack comment permalink:", commentLink.href);
                return commentLink.href;
            }

            // Also try timestamp links (often relative time like "1d", "2h")
            const links = commentContainer.querySelectorAll('a');
            for (const link of links) {
                const text = link.textContent?.trim();
                // Timestamp pattern: 1d, 2h, 3w, etc. or "just now", or date
                if (text && /^(\d+[hdwmy]|just now|\w+ \d+)$/i.test(text) && link.href) {
                    console.log("[Quote Copy] Using Substack timestamp link:", link.href);
                    return link.href;
                }
            }
        }

        // Generic comment permalink detection
        const permalinkSelectors = [
            'a.permalink',               // Marginal Revolution (and generic)
            'a[href*="commentID="]',     // Marginal Revolution query param style
            'a[href*="/comment/"]',
            'a[href*="#comment"]',
            'a[class*="permalink"]',
            'a[class*="timestamp"]',
            'time a',
            '.comment-date a',
        ];

        for (const selector of permalinkSelectors) {
            const permalinkEl = commentContainer.querySelector(selector);
            if (permalinkEl?.href && isValidUrl(permalinkEl.href)) {
                console.log("[Quote Copy] Using comment permalink:", permalinkEl.href);
                return permalinkEl.href;
            }
        }
    }

    // Check if selection starts with a link
    const startContainer = range.startContainer;
    const link = startContainer.nodeType === Node.TEXT_NODE
        ? startContainer.parentElement.closest('a')
        : startContainer.closest('a');

    if (link?.href && isValidUrl(link.href)) {
        let href = link.href;
        // Archive snapshots rewrite in-page links as archive.is/o/<code>/<original> — unwrap
        if (isArchiveHost(window.location.hostname)) {
            const embedded = extractEmbeddedUrl(href);
            if (embedded && isValidUrl(embedded)) {
                href = embedded;
            }
        }
        console.log("[Quote Copy] Using link href:", href);
        return href;
    }

    // Default to page URL
    return getQuotePageUrl();
}

function cleanUrl(url) {
    try {
        const urlObj = new URL(url);
        // Remove common tracking parameters
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
        paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
        return urlObj.toString();
    } catch {
        return url;
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

function cleanAuthorName(name) {
    if (!name) return null;

    let cleaned = name.trim()
        // Remove leading @ (Twitter handles)
        .replace(/^@/, '')
        // Remove common prefixes
        .replace(/^by\s+/i, '')
        .replace(/^author:\s*/i, '')
        .replace(/^written by\s+/i, '')
        .replace(/^posted by\s+/i, '')
        // Remove common suffixes
        .replace(/\s*\|\s*.*$/, '')  // Remove everything after |
        .replace(/\s*[-–—]\s*.*$/, '')  // Remove everything after dash (if followed by more text)
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();

    // Remove leading/trailing punctuation (note: - must be at end of character class)
    cleaned = cleaned.replace(/^[—–~\s-]+/, '').replace(/[—–~\s-]+$/, '');

    // Clean up Twitter-style handles that got used as author names
    // e.g., "AnthropicAI" -> "Anthropic", but "OpenAI" stays "OpenAI" (it's the actual name)
    const keepAsIs = ['OpenAI', 'DeepAI', 'AI21', 'AI21Labs', 'ScaleAI'];
    if (!keepAsIs.some(name => name.toLowerCase() === cleaned.toLowerCase())) {
        cleaned = cleaned
            .replace(/^(.+?)(AI|HQ|Official|Labs)$/i, (match, base, suffix) => {
                // Only strip suffix if base is a recognizable name (4+ chars, proper case)
                if (base.length >= 4 && /^[A-Z][a-z]+/.test(base)) {
                    return base;
                }
                return match; // Keep original
            });
    }

    // Don't return if too short or looks like a number/date
    if (cleaned.length < 2 || /^\d+$/.test(cleaned)) {
        return null;
    }

    return cleaned;
}

function getPageTitle() {
    // Get title, clean it up
    let title = document.title.trim();

    // Remove common suffixes like " | Site Name" or " - Site Name"
    title = title.replace(/\s*[|–—-]\s*[^|–—-]+$/, '').trim();

    // If title is too long, truncate
    if (title.length > 60) {
        title = title.substring(0, 57) + '...';
    }

    return title || 'Source';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, isError = false) {
    // Remove existing notification
    const existing = document.getElementById('quote-copy-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'quote-copy-notification';
    notification.textContent = message;

    // Use !important on key properties to override PDF viewer styles
    notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        padding: 12px 24px !important;
        background: ${isError ? '#f44336' : '#4caf50'} !important;
        color: white !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        z-index: 2147483647 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        pointer-events: none !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        border: 2px solid white !important;
    `;

    // Try to append to body, fall back to documentElement if body isn't available
    const parent = document.body || document.documentElement;
    parent.appendChild(notification);

    console.log("[Quote Copy] Notification shown:", message);

    setTimeout(() => {
        notification.remove();
    }, 2000);
}

console.log("[Quote Copy] Ready - Alt+A or ;a to copy selected text as quote");
