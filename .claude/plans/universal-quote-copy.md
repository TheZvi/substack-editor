# Plan: Universal Alt+A Quote Copy Feature

## Overview

Extend Alt+A functionality to work on any website with highlighted text. When triggered, it will:
1. Capture the selected text
2. Detect the author/speaker from context
3. Copy as formatted quote: `<a href="url">Author Name</a>: selected text`

## Current State

- **Twitter**: `twitter/twitter-shortcuts.js` handles Alt+A with Twitter-specific DOM parsing
- **Substack**: `content.js` has Smart Paste (Alt+V) that receives these quotes
- **Other sites**: No Alt+A support currently

## Architecture Decision

**Create a new universal content script** (`universal/quote-copy.js`) that:
- Runs on all URLs except Twitter (which has specialized handling)
- Implements fast heuristic-based author detection
- Falls back to LLM only when heuristics fail

## Implementation Steps

### 1. Create `universal/quote-copy.js`

New file with:
- Alt+A / `;a` keyboard listeners (same pattern as Twitter shortcuts)
- Selection capture
- Author detection engine
- Clipboard write (HTML + plain text)

### 2. Author Detection Strategy (Priority Order)

**Fast heuristics (no delay):**

a) **If selection is inside a `<blockquote>` or quotation:**
   - Check `cite` attribute on blockquote
   - Look for citation patterns: `— Author`, `- Author`, `~ Author`
   - Check for `<cite>` element nearby

b) **If selection is in a comment section:**
   - Look for `.author`, `.username`, `.user-name`, `[data-author]` in parent
   - Check for avatar/profile link nearby
   - Common platforms: Disqus, WordPress comments, Reddit, HN, etc.

c) **Page-level author (for article/post content):**
   - Meta tags: `<meta name="author">`, `property="article:author"`, `property="og:article:author"`, `name="twitter:creator"`
   - JSON-LD: Look for `@type: "Article"` or `"BlogPosting"` with `author` field
   - Common selectors: `.author`, `.byline`, `[rel="author"]`, `.post-author`, `.entry-author`, `a[href*="/author/"]`
   - WordPress: `.author-name`, `.posted-by`
   - Medium: `[data-testid="authorName"]`
   - Substack (non-editor): `.byline`, author in URL pattern

d) **LLM Fallback (only if heuristics fail):**
   - Send small HTML context (~500 chars around selection) to Gemini
   - Ask: "Who is the author or speaker of this text?"
   - Cache result per page to avoid repeated calls
   - Show brief "Detecting author..." notification

### 3. URL Detection

- **Default**: Current page URL (cleaned, no query params)
- **Blockquote with cite**: Use the cite URL if present
- **Linked content**: If selection starts with a link, use that link's href

### 4. Update `manifest.json`

Add content script entry:
```json
{
  "matches": ["<all_urls>"],
  "exclude_matches": [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://pro.x.com/*"
  ],
  "js": ["universal/quote-copy.js"],
  "run_at": "document_idle"
}
```

### 5. Handle Edge Cases

- **No selection**: Show notification "No text selected"
- **Selection spans multiple authors**: Use page author + note complexity
- **Author detection fails entirely**: Use "Source" as placeholder, still copy
- **Images in selection**: Include if reasonable, skip if complex

### 6. Add Background Script Support

Add handler for LLM-based author detection:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detect-author-llm') {
    // Call Gemini with small context
    // Return detected author name
  }
});
```

## File Structure

```
universal/
  quote-copy.js     # Main logic: Alt+A handler, author detection
```

Changes to existing files:
- `manifest.json` - Add content script entry
- `background.js` - Add LLM author detection handler (optional)

## Author Detection Heuristics Detail

```javascript
function detectAuthor() {
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);

  // 1. Check if inside blockquote
  const blockquote = range.commonAncestorContainer.closest?.('blockquote')
                  || range.commonAncestorContainer.parentElement?.closest('blockquote');
  if (blockquote) {
    return detectBlockquoteAuthor(blockquote);
  }

  // 2. Check if inside comment
  const comment = findCommentContainer(range.commonAncestorContainer);
  if (comment) {
    return detectCommentAuthor(comment);
  }

  // 3. Fall back to page author
  return detectPageAuthor();
}

function detectPageAuthor() {
  // Meta tags
  const authorMeta = document.querySelector('meta[name="author"]')?.content
    || document.querySelector('meta[property="article:author"]')?.content
    || document.querySelector('meta[property="og:article:author"]')?.content;
  if (authorMeta) return authorMeta;

  // JSON-LD
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd.textContent);
      if (data.author?.name) return data.author.name;
      if (typeof data.author === 'string') return data.author;
    } catch {}
  }

  // Common selectors
  const selectors = [
    '.author-name', '.byline-name', '.author', '.byline',
    '[rel="author"]', '.post-author', '.entry-author',
    'a[href*="/author/"]', '.posted-by a'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      return el.textContent.trim().replace(/^by\s+/i, '');
    }
  }

  return null; // Trigger LLM fallback
}
```

## Testing Scenarios

1. **Blog post** - Should detect author from meta/byline
2. **News article** - Should detect from byline/JSON-LD
3. **Reddit comment** - Should detect commenter username
4. **Hacker News** - Should detect commenter
5. **Substack article** (reading, not editing) - Should detect author
6. **Medium article** - Should detect author
7. **Blockquote with attribution** - Should detect quoted author
8. **Generic page with no author info** - Should trigger LLM or use fallback

## User Experience

1. User selects text on any website
2. User presses Alt+A (or types `;a`)
3. **Fast path** (~50ms): Heuristics find author
   - Clipboard updated immediately
   - Toast: "Quote copied: [Author Name]"
4. **Slow path** (~500-1000ms): LLM fallback needed
   - Brief toast: "Detecting author..."
   - LLM call via background script
   - Clipboard updated
   - Toast: "Quote copied: [Author Name]"
5. **Failure path**:
   - Toast: "Quote copied (author unknown)"
   - Still copies with placeholder or just the text

## Open Questions for User

1. **LLM fallback timing**: Should we:
   - Always try heuristics first, then LLM if needed (adds delay when LLM needed)
   - Run both in parallel, use heuristic result if available quickly
   - Require user to explicitly request LLM detection (e.g., Alt+Shift+A)?

2. **Author unknown behavior**: When author can't be detected:
   - Copy as just the text (no author prefix)?
   - Use placeholder like "Unknown" or "Source"?
   - Include page title as attribution?

3. **URL to use**: Should the link be:
   - Always the current page URL?
   - If in a blockquote with cite attribute, use that?
   - Let user configure preference?
