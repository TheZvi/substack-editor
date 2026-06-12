# CLAUDE.md - AI Assistant Guide for Substack Editor Extension

## Project Overview

**Name:** Substack Text Transformer / Substack TOC Helper
**Type:** Chrome Browser Extension (Manifest V3)
**Version:** 1.1
**Author:** Zvi Mowshowitz
**License:** MIT

A Chrome extension that helps writers format, edit, and publish content on Substack with features for:
- LLM-powered text transformation (Gemini/Claude APIs)
- Table of Contents management
- WordPress crossposting
- Twitter Article crossposting
- Google Docs export (via Google Docs API with OAuth)
- Twitter List Sync (sync Following to a List, or List-to-List transfers)
- Intelligent linkification of concepts
- Universal quote copy (Alt+A on any website with author detection and HTML preservation)
- Author annotations for quote copy (auto-append org/context after author names)
- Website annotations (auto-append site abbreviation when no author annotation matches)
- PDF copy with formatting preservation (removes footnotes/page numbers)
- Last closed tab URL copy (Alt+Z)

## Directory Structure

```
substack-editor/
├── background.js              # Service worker - commands, context menus, message routing
├── content.js                 # Content script - bridges extension & page context
├── extractContents.js         # Extracts Substack post content
├── popup.js                   # Popup UI logic & button handlers (~830 lines)
├── popup.html                 # Popup interface
├── manifest.json              # Extension config (Manifest V3)
│
├── features/
│   └── text-transform/
│       └── transform-controller.js   # Core text transformation logic (~450 lines)
│
├── formatters/
│   ├── wordpress-formatter.js        # Converts content to WordPress block format
│   └── twitter-formatter.js          # Converts content for Twitter Articles
│
├── receivers/
│   ├── wordpress-receiver.js         # Inserts content into WordPress editor
│   └── twitter-receiver.js           # Inserts content into Twitter Articles editor (incl. newline fixing)
│
├── twitter/
│   ├── twitter-shortcuts.js          # Tweet copy shortcuts (Alt+A, Alt+C, etc.)
│   └── twitter-list-sync.js          # Twitter List sync functionality
│
├── universal/
│   └── quote-copy.js                 # Universal Alt+A quote copy for any website
│
├── author-annotations/
│   └── ui/
│       ├── manage-annotations.html       # Annotation management page
│       ├── manage-annotations.js         # Annotation CRUD logic
│       └── manage-annotations.css        # Annotation page styles
│
├── linkify/
│   ├── default-rules.json            # Predefined link rules
│   ├── linkify-controller.js         # Linkification logic (~350 lines)
│   ├── storage-controller.js         # Rule storage management
│   └── ui/
│       ├── manage-linkify-rules.html
│       ├── manage-linkify-rules.js
│       └── manage-linkify-rules.css
│
├── shared/
│   ├── llm/
│   │   ├── api/
│   │   │   ├── base-api.js           # LLM base class (page context, loaded by content.js)
│   │   │   ├── llm-api.js            # LLM base class (popup context, loaded by popup.html)
│   │   │   ├── gemini_api.js         # Google Gemini implementation
│   │   │   ├── claude_api.js         # Anthropic Claude implementation (transform path; not working)
│   │   │   └── default-rules.json    # Default transformation rules
│   │   └── config/
│   │       ├── api-keys.template.js  # API key config template
│   │       └── api-keys.local.js     # Local API keys (gitignored)
│   └── google/
│       ├── googledocs-api.js         # Google Docs API integration (OAuth)
│       └── googledocs-review.js      # AI-powered document review
│
├── options/
│   ├── options.html                  # Settings page UI
│   └── options.js                    # Settings page logic
│
├── README.md
├── CHANGELOG.md
└── LICENSE.md
```

## Key Technologies

- **JavaScript (ES6+)** - Vanilla JS, no frameworks
- **Chrome Extension APIs (Manifest V3)**
- **LLM APIs:**
  - Google Gemini (configurable model, default `gemini-3.1-flash-lite`)
  - Anthropic Claude (`claude-3-opus-20240229`) - Note: Currently not working
- **Google Docs API** - OAuth2 via Chrome Identity API for document creation
- **Twitter Internal APIs** - GraphQL endpoints for list management (uses browser session auth)

## Architecture

```
┌─────────────────────────────────────┐
│   Chrome Extension UI               │
│   (popup.js, popup.html, options)   │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ Background Service Worker           │
│ (background.js)                     │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ Content Scripts                     │
│ (content.js, extractContents.js)    │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ Feature Modules                     │
│ - TransformController               │
│ - LinkifyController                 │
│ - WordPress Formatter/Receiver      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ LLM API Layer                       │
│ (GeminiApi, ClaudeApi)              │
└─────────────────────────────────────┘
```

### Communication Patterns

1. **Extension <-> Content Script:** `chrome.runtime.sendMessage()`
2. **Content Script <-> Page Context:** `window.postMessage()`
3. **Background Service Worker <-> External APIs:** Direct `fetch()` requests

## Development Workflow

### Setup
1. Clone repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select extension directory

### No Build System
This is a lightweight extension with no npm dependencies or build process. Changes are reflected immediately after reloading the extension.

### API Keys
- Copy `shared/llm/config/api-keys.template.js` to `api-keys.local.js`
- Add your Gemini API key (Claude API not currently functional)
- `api-keys.local.js` is gitignored

## Code Conventions

### Class-Based Design
```javascript
// Base class with shared functionality
class LLMApi {
  constructor(config) { ... }
  async transformText(text, apiKey) { ... }
}

// Implementations extend base
class GeminiApi extends LLMApi { ... }
class ClaudeApi extends LLMApi { ... }
```

### Async/Await Pattern
All async operations use async/await, not raw Promises:
```javascript
async handleTransform(inputText) {
  const apiKey = await this.getApiKey('gemini-api-key');
  const rules = await this.getRules();
  const transformedText = await this.api.transformText(text, apiKey, rules);
}
```

### Chrome Storage
- **`chrome.storage.local`** - Temporary data (extracted content)
- **`chrome.storage.sync`** - User preferences (API keys, rules)

### Rule Configuration Format
```javascript
{
  "target": "concept name",
  "url": "https://link.com",
  "matchType": "caseInsensitive",
  "wholeWord": true,
  "maxInstances": null,
  "priority": 1,
  "description": "Rule description"
}
```

### DOM Manipulation
The extension works with Substack's ProseMirror editor. Key considerations:
- Use `document.createDocumentFragment()` for batch insertions
- Preserve ProseMirror classes when modifying blockquotes
- Walk TextNodes for linkification to preserve structure

### Debugging
Console logging uses bracketed prefixes for filtering in DevTools, e.g. `[Quote Copy]`, `[Smart Paste]`, `[Twitter List Sync]`, `[Review]`, `[Google Docs API]`. Keep error logging (`console.error`) and diagnostics useful for debugging live DOM breakage; avoid chatty per-keystroke or full-content dumps.

## Key Files to Understand

| File | Purpose | Priority |
|------|---------|----------|
| `popup.js` | Main UI logic, button handlers | High |
| `features/text-transform/transform-controller.js` | Core transformation logic | High |
| `background.js` | Command handling, message routing, image fetching | High |
| `content.js` | Substack page bridge, Smart Paste (Alt+V), blockquote shortcuts | High |
| `twitter/twitter-shortcuts.js` | Tweet copy shortcuts (Alt+A/C/S/Q/T/Z) | High |
| `universal/quote-copy.js` | Universal Alt+A quote copy for any website | High |
| `shared/llm/api/gemini_api.js` | LLM API integration | Medium |
| `linkify/linkify-controller.js` | Link replacement | Medium |

## Known Issues

1. **Ctrl+Q shortcut sometimes requires page reload** - Chrome command registration timing issue
2. **Claude API not working for text transform** - The Ctrl+Q transform path runs in page context where Claude API calls are blocked by CORS. Note: Claude IS used successfully for Google Doc review (runs from the popup, which is extension context)

### Twitter Article Posting Issues
4. **Manual paste required for article body** - User must Ctrl+V to paste main content. UNFIXABLE: Browser security prevents programmatic paste, and direct DOM insertion breaks Twitter's editor state.
5. **Block quote formatting lost** - Line breaks and list numberings vanish in block quotes
6. **Images display as camera icons** - Images not transferred, show placeholder icons
7. **Header formatting lost** - FIXED in v1.0.3: Headers auto-converted to subheadings after paste via simulated clicks

## Twitter Article Formatting Techniques

Twitter Articles uses Draft.js editor. Standard DOM manipulation and execCommand don't work - they break the editor state. Instead, use **simulated mouse clicks** to interact with the formatting toolbar.

### Key Functions

**simulateClick(element)** - Sends full mouse event sequence that React recognizes:
```javascript
function simulateClick(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const eventOptions = {
        bubbles: true, cancelable: true, view: window,
        clientX: centerX, clientY: centerY,
        button: 0, buttons: 1
    };
    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));
    element.dispatchEvent(new PointerEvent('pointerdown', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
    element.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, pointerId: 1, pointerType: 'mouse' }));
}
```

### Workflow for Formatting

1. **Find block by text**: Query `.longform-unstyled, [data-block="true"]` and match text content
2. **Select the block**: Use Range API to select the text span
3. **Click toolbar button**: Find button in toolbar area (top < 150px) and simulateClick()

### Toolbar Buttons
- **Body/Subheading dropdown**: Find by text content "Body"/"Heading"/"Subheading"
- **Blockquote button**: The " icon - find by aria-label containing "quote" or find first button after Body dropdown
- Buttons are in toolbar area where `rect.top > 50 && rect.top < 150`

### Important Notes
- Paste listener triggers formatting 1 second after paste to let editor settle
- Don't check "already formatted" state - just apply the format (checking causes toggle issues)
- Text matching: use `includes()` not exact match since blocks may have additional content

## Twitter List Sync

Syncs your Twitter Following list to a Twitter List, or transfers members between lists. Useful for creating a "Following" list that can be used instead of Twitter's "For You" algorithmic feed.

### Setup
1. Enter your Twitter username (without @)
2. Enter a destination List ID (find this in the list's URL: `x.com/i/lists/LISTID`)
3. Optionally enter a source List ID (leave empty to sync from Following)

### Sync Modes
- **Add Only**: Adds accounts from source to destination (won't remove anyone)
- **Remove Only**: Removes accounts from destination that aren't in source
- **Full Sync**: Makes destination exactly match source

### How It Works
1. **Scraping**: Opens source page (Following or List) and auto-scrolls to load all accounts
2. **Collection**: Extracts usernames from `[data-testid="UserCell"]` elements as they appear
3. **Comparison**: Compares source accounts with destination list members
4. **Sync**: Uses Twitter's internal GraphQL APIs to add/remove members

### Rate Limiting
Twitter rate-limits API calls. The sync includes:
- 3 second delay between add/remove operations
- Exponential backoff (60s, 120s, 240s) on 429 errors
- Auto-pause (60s) after 3 consecutive errors

For large syncs (200+ accounts), expect ~15-20 minutes to complete.

### Key Files
- `twitter/twitter-list-sync.js` - Scraping and sync logic
- `background.js` - Orchestrates the sync process (stays alive when popup closes)
- `popup.js` / `popup.html` - UI for settings and sync buttons

### Technical Notes
- Uses CSRF token from cookies for authentication
- GraphQL endpoints: `ListAddMember`, `ListRemoveMember`, `UserByScreenName`
- Twitter virtualizes long lists but keeps DOM elements after scrolling
- The `scrollAndCollect()` function collects usernames during scroll, not after

## Twitter Copy Shortcuts & Smart Paste

Keyboard shortcuts for copying tweets from Twitter/X and pasting them as formatted blockquotes in Substack.

### Tweet Copy Shortcuts (on Twitter/X pages)

These shortcuts work on `x.com`, `twitter.com`, and `pro.x.com`:

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+A** | `;a` | Copy current tweet with author name (linked to tweet) |
| **Alt+C** | `;c` | Copy current tweet text only (no author) |
| **Alt+S** | `;s` | Copy entire thread (OP + replies up to current tweet) |
| **Alt+Q** | `;q` | Copy tweet URL only |
| **Alt+T** | `;t` | Open Author Annotations page prefilled with current tweet's author |
| **Alt+Z** | — | Copy URL of last closed tab to clipboard |

**"Current tweet"** = tweet under mouse cursor, or if none, the tweet closest to viewport center.

#### What Gets Copied
- **Text**: Tweet text with proper newline handling
- **Author**: Display name (or @handle if display name is emoji-only)
- **Link**: Tweet permalink wrapped around author name
- **Note**: Images are NOT copied (they don't transfer properly between editors). Use native copy/paste (Ctrl+C/Ctrl+V) if you need images.

#### HTML Format (Alt+A)
```html
<a href="https://x.com/user/status/123">Author Name</a>: Tweet text
<!-- With author annotation: -->
<a href="https://x.com/user/status/123">Author Name</a> (Org): Tweet text
```

#### URL Processing

When copying tweets, URLs are automatically processed:

1. **Truncation removal**: Twitter's "..." or "…" truncation indicators are removed
2. **Line joining**: URLs broken across lines are rejoined (including `https://` separated from domain)
3. **Label-colon joining**: Newlines between `label:` and URL are removed so patterns can match
4. **"Here" pattern**: When text ends with "here:" followed by a URL, it transforms to "X here." with "here" as the link (no brackets, since "here" was in the original text)
5. **Label transformation**: When a URL is preceded by a descriptive label like "More:", "Github:", "Link:", etc., it transforms to `Label [here].` with "[here]" linked to the URL
6. **Clickable links**: Remaining URLs become proper `<a href>` links in the HTML output

**Special "here:" pattern** (processed first):
- `Apply here: URL` → `Apply here.` (with "here" linked)
- `Register here: URL` → `Register here.` (with "here" linked)
- `Sign up here: URL` → `Sign up here.` (with "here" linked)
- Note: No brackets around "here" because the word was already in the original text

**Supported URL labels** (case-insensitive, use `[here]` with brackets):
- `more`, `read more`, `see more`, `full article`, `full thread`
- `link`, `article`, `source`, `via`
- `github`, `repo`, `code`
- `blog`, `post`, `thread`, `paper`, `study`
- `video`, `watch`, `listen`, `podcast`
- `newsletter`, `substack`, `details`, `info`

**Example transformations:**
```
Input:  "Apply here: https://example.com/apply"
Output: "Apply here."
        (with "here" linked to https://example.com/apply - no brackets)

Input:  "Great thread! More: https://example.com/article..."
Output: "Great thread! More [here]."
        (with "[here]" linked to https://example.com/article)

Input:  "Check this: https://example.com/page"
Output: "Check this: https://example.com/page"
        (URL becomes a clickable link, no label transformation)
```

#### Bracket Convention for Non-Original Text

**Important**: When text is added that wasn't in the original tweet, use square brackets `[]` to indicate it's not original.

- `[here]` - indicates the word "here" was added (replacing a URL)
- Multiple links: `[Here, here and here].` when multiple URLs are present

This convention ensures readers can distinguish between the original tweet text and editorial additions.

#### Key Files
- `twitter/twitter-shortcuts.js` - All Twitter page shortcuts

---

### Universal Quote Copy (Any Website)

**Alt+A** or **`;a`** works on ANY website (except Twitter, which uses the specialized handler above).

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+A** | `;a` | Copy selected text as quote with auto-detected author |
| **Alt+Z** | — | Copy URL of last closed tab to clipboard |

#### How It Works
1. Select any text on a webpage
2. Press **Alt+A** (or type `;a`)
3. Extension detects the author using heuristics:
   - If in a blockquote: looks for `<cite>`, attribution patterns (`— Author`)
   - If in a comment: looks for username/author elements
   - Otherwise: checks meta tags, JSON-LD, common byline selectors
4. If heuristics fail, uses Gemini LLM as fallback
5. If still unknown, uses page title as author
6. Looks up author annotation, falls back to website annotation if no author match
7. Copies as: `<a href="url">Author Name</a> (Annotation): selected text`
8. **HTML preservation**: The selection's native HTML is used (preserving bullet points, bold, lists, etc.) rather than escaping to plain text

#### Author Detection Priority
1. **Blockquote author**: `<cite>` element, `— Name` pattern, footer/figcaption
2. **Comment author**: `.author`, `.username`, `[data-author]`, etc.
3. **Page author**: `<meta name="author">`, JSON-LD `author`, byline selectors
4. **LLM fallback**: Gemini analyzes surrounding HTML context
5. **Last resort**: Page title

#### URL Detection
- Prefers `cite` attribute from blockquotes when present
- Otherwise uses current page URL (cleaned of tracking params)

#### Key Files
- `universal/quote-copy.js` - Author detection and clipboard logic
- `background.js` - `detect-author-llm` handler for LLM fallback

---

### PDF Copy (Chrome PDF Viewer)

**Alt+A** or **`;a`** on a PDF page copies selected content with formatting preserved and cleanup applied.

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+A** | `;a` | Copy PDF selection with formatting, remove footnotes/page numbers |

#### How It Works
1. Select text in Chrome's built-in PDF viewer
2. Press **Alt+A** (or type `;a`)
3. Extension detects PDF context and processes the text:
   - **Joins artificial line breaks** from PDF visual wrapping (preserves real paragraph breaks)
   - Removes footnote reference superscripts (³⁵, ³⁶) but preserves math (x², y²)
   - Removes inline footnote numbers (56, 57) when PDF doesn't preserve superscript formatting
   - Removes standalone page numbers (e.g., "107" alone on a line)
   - Removes footnote text blocks at the bottom of selections
   - Converts bullet points (•, ●, -, etc.) to HTML `<ul><li>`
   - Converts numbered lists (1., 2., etc.) to HTML `<ol><li>`
   - Makes URLs clickable `<a>` links
4. Copies as formatted HTML (no author prefix, no link back to PDF)
5. Shows notification: "PDF content copied"

#### Special Cases
- **Footnotes only**: If selection contains ONLY footnotes (no main content), they are preserved as-is
- **Math superscripts**: Single-digit superscripts after single letters (x², y², z²) are preserved
- **URLs in footnotes**: Removed along with footnote text when mixed with main content

#### PDF Detection
Triggered when:
- URL ends in `.pdf` or contains `.pdf?` / `.pdf#`
- Chrome's built-in PDF viewer extension URL (`chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/`)
- Embedded PDF viewer element (`embed[type="application/pdf"]`)

#### Key Files
- `universal/quote-copy.js` - PDF detection and processing
- `tests/pdfCopy.test.js` - Unit tests (81 tests)

#### Processing Functions
| Function | Purpose |
|----------|---------|
| `isPdfPage()` | Detect PDF context |
| `joinPdfLineBreaks(text)` | Join artificial line breaks from PDF visual wrapping |
| `isOnlyFootnotes(text)` | Check if selection is footnotes-only |
| `removeFootnoteReferences(text)` | Strip ³⁵-style superscript indicators |
| `removeInlineFootnoteNumbers(text)` | Strip regular digit footnotes (56, 57) |
| `removePageNumbers(text)` | Strip standalone page numbers |
| `removeFootnoteText(text)` | Strip footnote blocks |
| `formatListsAsHtml(text)` | Convert bullets/numbers to HTML lists |
| `linkifyUrls(text)` | Make URLs clickable |
| `processPdfText(text)` | Main processing pipeline |

---

### Smart Paste (in Substack Editor)

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+V** | `;v` | Smart paste - auto-creates blockquote for tweet quotes |

#### How It Works
1. Detects if clipboard content looks like a quote (format: `Name: text`)
2. If quote format AND not already in a blockquote:
   - Creates a `<blockquote>` wrapper
   - Restores author link from HTML (if copied with Alt+A)
   - Fetches and embeds images inside the blockquote
3. Otherwise: does normal paste

#### Workflow: Tweet to Substack Quote
1. On Twitter: hover over tweet, press **Alt+A**
2. In Substack editor: press **Alt+V**
3. Result: Formatted blockquote with linked author name and images

#### Key Files
- `content.js` - `smartPaste()` function (lines 326-516)
- `background.js` - `fetch-image` handler for CORS bypass

#### Technical Notes
- Images are fetched via background script to bypass CORS restrictions
- Images are converted to base64 data URLs before insertion
- Twitter images require the background script to include credentials/referrer
- If image fetch fails, falls back to direct URL (may not display)

---

### Author & Website Annotations

Annotations auto-append contextual info (like organization) after author names when copying quotes with Alt+A. Managed via the "Manage Author Annotations" page (popup button or Alt+T on Twitter).

#### Two Annotation Types

| Type | Storage Key | Matching | Example |
|------|------------|----------|---------|
| **Author** | `authorAnnotations` | By name (case-insensitive) or Twitter handle | `theseriousadult (Anthropic): text` |
| **Website** | `websiteAnnotations` | By domain (e.g., `wsj.com`) | `Some Author (WSJ): text` |

Author annotations are checked first. Website annotations are the fallback when no author match is found.

#### Author Annotation Data Structure
```javascript
{
    name: "theseriousadult",     // Name to match (case-insensitive)
    info: "Anthropic",           // Text shown in parentheses
    twitterOnly: false,          // If true, only apply on Twitter/X pages
    handleMatch: "seriousadult"  // Optional: match Twitter handle instead of display name
}
```

#### Website Annotation Data Structure
```javascript
{
    domain: "wsj.com",           // Domain to match (also matches www.wsj.com)
    annotation: "WSJ"            // Text shown in parentheses
}
```

#### Annotation Lookup Priority
1. Author annotation by handle (Twitter only, if handleMatch set)
2. Author annotation by name (case-insensitive)
3. Website annotation by domain (fallback)

#### Alt+T Quick Add (Twitter only)
Hover over a tweet and press Alt+T to open the annotations page with the author's display name and @handle prefilled. Uses `chrome.storage.local` with a 10-second expiry to pass prefill data.

#### Key Files
- `author-annotations/ui/manage-annotations.html` - Management page (author + website sections)
- `author-annotations/ui/manage-annotations.js` - CRUD logic, prefill support
- `author-annotations/ui/manage-annotations.css` - Styles
- `twitter/twitter-shortcuts.js` - `getAuthorAnnotation()`, `openAnnotationForCurrentTweet()`
- `universal/quote-copy.js` - `getAuthorAnnotation()`, `getWebsiteAnnotation()`
- `content.js` - Smart paste annotation handling (lines 488-493)

---

### Last Closed Tab URL (Alt+Z)

Press **Alt+Z** on any page to copy the URL of the most recently closed tab to the clipboard. Uses `chrome.sessions.getRecentlyClosed()` via the background script. Shows a notification with the tab's title.

Works on all pages (both Twitter and non-Twitter). Requires the `sessions` permission.

---

### Other Substack Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+S** | Copy current page URL (clean, no query params) |
| **F4** | Toggle current line between Heading 4 and Paragraph |
| **`> ` + space** | Convert line to blockquote (markdown-style) |

---

## Google Docs API Integration

Exports Substack content to Google Docs with title and body automatically populated.

### Why API Instead of Clipboard?
Google Docs uses canvas-based rendering, not standard DOM elements. Chrome extensions cannot:
- Programmatically paste into Google Docs (browser security)
- Manipulate the document via DOM (canvas rendering)

The Google Docs API bypasses these limitations entirely.

### Authentication Flow
1. Uses Chrome Identity API (`chrome.identity.getAuthToken()`)
2. OAuth2 with scope `https://www.googleapis.com/auth/documents`
3. Requires user to set up their own OAuth Client ID in Google Cloud Console
4. Token is cached by Chrome after first authorization

### Key Files
- `shared/google/googledocs-api.js` - API wrapper with auth and document creation
- `manifest.json` - Contains `oauth2` config with Client ID and scopes

### API Endpoints Used
- `POST https://docs.googleapis.com/v1/documents` - Create new document with title
- `POST https://docs.googleapis.com/v1/documents/{id}:batchUpdate` - Insert content

### Setup Required
Each user must create their own OAuth Client ID in Google Cloud Console. See README.md for detailed instructions. The `manifest.json` must be updated with the user's Client ID before the feature will work.

### Future Enhancements
The API integration enables future features like:
- AI-powered document commenting/editing via LLM
- Rich formatting preservation (headers, links, blockquotes)
- Batch document operations

## Google Docs Review Features

**IMPORTANT: There are TWO DISTINCT review features. Do not confuse them.**

| Feature | Location | How It Works | Comments Type |
|---------|----------|--------------|---------------|
| **Extension Review Doc** | Chrome extension popup button | LLM analyzes doc, creates comments via Drive API | Unanchored |
| **Claude Code `/review-googledoc`** | Claude Code CLI skill | MCP browser automation with triple-click selection | Anchored |

These are completely separate implementations. When the user says "Review Doc" or "extension review", they mean the Chrome extension feature. When they say `/review-googledoc` or "the skill", they mean the Claude Code skill.

---

### Extension Review Doc (Chrome Extension Feature)

The "Review Doc" button in the extension popup sends document content to an LLM for analysis, then creates unanchored comments via the Google Drive API.

#### How It Works
1. User clicks "Review Doc" in extension popup
2. Extension extracts document content (text + structure info like blockquotes)
3. LLM analyzes content and generates feedback
4. Extension creates comments via Drive API (unanchored, with quoted text for Ctrl+F lookup)

#### Comment Format
Each unanchored comment includes a quoted phrase for Ctrl+F lookup:
```
📍 "[exact quote from document]"

[Feedback/suggestion]
```

#### Review Standards by Text Type

**Main body text** (author's own words):
- Lower bar for flagging issues
- Point out spelling, grammar, clarity, structure, rhetoric, factual, and edit issues
- Suggest improvements and tightening

**Quoted/indented text** (blockquotes - someone else's words):
- HIGH bar - only flag clear errors
- Only correct obvious typos or broken formatting
- NEVER suggest improvements, style changes, or clarity edits
- NEVER point out logical errors or weak arguments (it's a quote!)
- The text is marked with `[QUOTED SECTION START/END]` markers before being sent to the LLM

#### Key Files
- `popup.js` - Review Doc button handler
- `shared/google/googledocs-api.js` - Drive API integration
- Message action: `create-googledoc-comment`

#### API Endpoint
`POST https://www.googleapis.com/drive/v3/files/{documentId}/comments`
- Requires Google OAuth token (user must authenticate via extension popup first)

---

### Claude Code `/review-googledoc` Skill (Separate from Extension)

A Claude Code CLI skill that uses MCP browser automation to add **anchored** comments directly in Google Docs. This is NOT part of the Chrome extension - it's a separate skill defined in `.claude/skills/`.

#### How It Works
1. Claude reads the Google Doc (via screenshots or text selection)
2. Analyzes content based on requested review type
3. For each issue found, uses MCP automation:
   - Find text (Ctrl+F)
   - Triple-click to select paragraph
   - Click "Add comment" button
   - Type comment and submit

#### Requirements
- Google Doc must be open in Chrome
- Claude in Chrome MCP extension must be active
- Claude Code session with MCP tools available

#### Key Files
- `.claude/skills/review-googledoc/SKILL.md` - Skill definition (NOT part of extension)

#### Key Insight: Selection vs Highlight
Google Docs' Find feature only **highlights** text, it doesn't **select** it. Comments can only anchor to selections. Triple-click creates a real selection that comments anchor to properly.

## Common Tasks

### Adding a New LLM Provider
1. Create new class in `shared/llm/api/` extending `LLMApi` (base-api.js for page context, llm-api.js for popup)
2. Implement `transformText()` method
3. Load it where needed (manifest.json web_accessible_resources + content.js loadTransformScripts, or popup.html script tag)
4. Add API key field in options page

### Adding New Linkify Rules
Edit `linkify/default-rules.json` or use the UI at `linkify/ui/manage-linkify-rules.html`

### Modifying Text Transformation Rules
The live Ctrl+Q rules are in `features/text-transform/transform-controller.js`:
- `getCoreRules()` - mechanical fixes + preservation constraints, applied in both modes
- `getOwnProseRules()` - extra latitude when editing Zvi's own prose
- `getQuoteRules()` - restrictions when the selection is inside a `<blockquote>` (someone else's words)

Mode is auto-detected: selection inside a blockquote = quote mode (conservative, "would the author endorse this as a faithful quote?"); otherwise own-prose mode (more liberal, voice-preserving). House style: NO Oxford comma, contract spelled-out forms to acronyms, never expand acronyms, never add em-dashes/transitions/summaries, preserve fragments/contractions/one-line paragraphs.

When changing rules, keep the mirrored copies in `tests/transformController.test.js` in sync (tests 49-56f assert rule presence).

Note: `shared/llm/api/default-rules.json` is only used by the base-class `transformText()` fallback paths, not by the Gemini transform.

## Testing

### Automated Tests

Run tests with Node.js:
```bash
# Twitter shortcuts tests (133 tests)
node tests/twitterShortcuts.test.js

# Smart paste tests (233 tests)
node tests/smartPaste.test.js

# Transform controller tests (143 tests)
node tests/transformController.test.js

# PDF copy tests (112 tests)
node tests/pdfCopy.test.js

# Clean link sources tests (33 tests)
node tests/cleanLinkSources.test.js

# Gemini API integration tests (requires API key)
node tests/gemini-integration.test.js
```

**Gemini Integration Tests Setup:**
Create `.gemini-test-config.json` in the project root:
```json
{
  "apiKey": "your-api-key-here",
  "model": "gemini-3.1-flash-lite"
}
```

### Manual Testing

For features that can't be unit tested:
1. Load extension unpacked in Chrome
2. Navigate to Substack editor (`https://*.substack.com/publish/post/*`)
3. Select text and press Ctrl+Q
4. Verify transformation preserves meaning and formatting

## Host Permissions

The extension requires access to:
- `https://*.substack.com/publish/post/*` - Substack editor
- `https://*.wordpress.com/*` - WordPress integration
- `https://api.anthropic.com/*`, `https://*.anthropic.com/*` - Claude API
- `https://generativelanguage.googleapis.com/*` - Gemini API
- `https://x.com/*`, `https://*.x.com/*`, `https://pro.x.com/*` - Twitter/X
- `https://substackcdn.com/*`, `https://*.substackcdn.com/*` - Substack CDN (images)
- `https://docs.google.com/*` - Google Docs
- `https://www.googleapis.com/*`, `https://oauth2.googleapis.com/*` - Google APIs

## Chrome Permissions

- `activeTab`, `scripting` - Interact with current page
- `storage` - Store settings, API keys, annotations, rules
- `tabs`, `tabGroups` - Tab management and grouping
- `commands` - Keyboard shortcuts (Ctrl+Q)
- `sessions` - Access recently closed tabs (Alt+Z)
- `identity` - Google OAuth for Docs API
- `contextMenus`, `notifications`, `webNavigation` - UI features

## Important Considerations for AI Assistants

1. **Preserve technical meaning** - The extension is designed to reformat without changing meaning
2. **Acronym preservation** - AI, AGI, ASI, GPT, LLM, NLP must never be expanded
3. **Quote handling** - Exact quotes must be preserved verbatim
4. **No frameworks** - This is vanilla JavaScript; don't introduce npm dependencies
5. **Manifest V3** - Use service workers, not background pages
6. **ProseMirror awareness** - Substack uses ProseMirror; respect its DOM structure
