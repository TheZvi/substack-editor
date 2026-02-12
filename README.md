# Substack Text Transformer

A Chrome extension that helps writers format, edit, and publish content on Substack, with powerful keyboard shortcuts for quoting, crossposting, and content management.

## Features

### Text Transformation (Ctrl+Q)
- Quick formatting with Ctrl+Q shortcut
- Preserves technical acronyms (AI, AGI, ASI, etc.)
- Maintains exact quote formatting
- Auto-selects paragraphs or blockquotes
- Preserves links and HTML structure
- Uses Google's Gemini API for fast processing (configurable model)

### Quote Copy (Alt+A) — Works Everywhere
Copy selected text as a formatted, attributed quote from any website.

- **On Twitter/X**: Hover over a tweet, press Alt+A to copy with author name linked to the tweet
- **On any website**: Select text, press Alt+A to copy with auto-detected author and link
- **On PDFs**: Select text, press Alt+A to copy with footnotes/page numbers removed and formatting preserved
- **Author detection**: Checks blockquote attribution, comment usernames, meta tags, JSON-LD, byline selectors, and falls back to LLM detection
- **HTML preservation**: Copies the selection's native HTML (bullet points, bold, lists, etc.)

### Author & Website Annotations
Automatically append contextual info after author names when copying quotes.

- **Author annotations**: Match by name or Twitter handle (e.g., `theseriousadult (Anthropic): text`)
- **Website annotations**: Match by domain as fallback (e.g., `Some Author (WSJ): text`)
- Manage via popup button "Manage Author Annotations" or Alt+T on Twitter for quick add
- Import/export as JSON

### Smart Paste (Alt+V) — Substack Editor
Paste clipboard content as a formatted blockquote in the Substack editor.

- Auto-detects quote format (`Author: text`)
- Creates `<blockquote>` with linked author name
- Preserves annotations outside the link
- Fetches and embeds images inside the blockquote
- Multi-paragraph support with proper spacing

### Last Closed Tab URL (Alt+Z)
Press Alt+Z on any page to copy the URL of the most recently closed tab to clipboard. Useful when you close a tab and forgot to save the link.

### Table of Contents
- Generate/Update TOC from headers
- Auto-links to sections
- Marks blank sections
- Preserves subtitle annotations when updating

### Crossposting
- **WordPress**: One-click crosspost to WordPress.com
- **Twitter Articles**: Post Substack content as Twitter Articles (with auto header/blockquote formatting)
- **Google Docs**: Export to Google Docs with title and formatting preserved (requires one-time OAuth setup — see below)

### Google Docs AI Review
- Send document content to Gemini LLM for analysis
- Creates comments with quoted text for Ctrl+F lookup
- Different review standards for author text vs. blockquotes

### Twitter List Sync
Sync your Following list to a Twitter List, or transfer members between lists.

- **Add Only**: Add accounts from source to destination list
- **Remove Only**: Remove accounts not in source from destination
- **Full Sync**: Make destination exactly match source
- Supports syncing from Following or from another list (even someone else's public list)

### Linkify
- Auto-link concepts to predefined URLs
- Customizable rules via UI

### Clean Link Sources
Strip tracking query parameters from all links in a Substack post.

## Keyboard Shortcuts Reference

### Twitter/X Pages (`x.com`, `twitter.com`, `pro.x.com`)

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+A** | `;a` | Copy current tweet with linked author name |
| **Alt+C** | `;c` | Copy current tweet text only |
| **Alt+S** | `;s` | Copy entire thread |
| **Alt+Q** | `;q` | Copy tweet URL only |
| **Alt+T** | `;t` | Open Author Annotations prefilled with tweet author |
| **Alt+Z** | — | Copy URL of last closed tab |

### Any Website (except Twitter)

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Alt+A** | `;a` | Copy selected text as attributed quote |
| **Alt+Z** | — | Copy URL of last closed tab |

### Substack Editor

| Shortcut | Alternative | Action |
|----------|-------------|--------|
| **Ctrl+Q** | — | Transform selected text with LLM |
| **Alt+V** | `;v` | Smart paste (auto-blockquote for quotes) |
| **Alt+S** | — | Copy current page URL (clean) |
| **F4** | — | Toggle line between H4 and paragraph |
| **`> ` + space** | — | Convert line to blockquote |

## Installation

1. Clone this repository (or download from the Chrome Web Store — link coming soon)
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory
5. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
6. Open the extension popup and click "API Settings" to enter your key

## Google Docs API Setup (Required for Copy to Google Doc)

The "Copy to Google Doc" feature uses the Google Docs API to create documents with the title and content automatically populated. This requires a one-time OAuth setup:

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one

### 2. Enable the Google Docs API
1. Go to **APIs & Services > Library**
2. Search for "Google Docs API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**
2. Choose **Internal** (if you have Google Workspace) or **External**
3. Fill in:
   - App name: "Substack Editor" (or any name)
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click "Add or Remove Scopes" and add:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
6. If you chose External, add your email as a **Test user**
7. Save and continue through the remaining steps

### 4. Create OAuth Client ID
1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Chrome Extension**
4. Name: "Substack Editor"
5. **Item ID**: Your extension ID (find at `chrome://extensions` — the long string under your extension name)
6. Click **Create**

### 5. Update the Extension
1. Copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`)
2. Open `manifest.json` in the extension folder
3. Find the `oauth2` section and replace the `client_id` value with your Client ID:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/documents",
       "https://www.googleapis.com/auth/drive"
     ]
   }
   ```
4. Reload the extension at `chrome://extensions`

### 6. First Use
1. Click "Copy to Google Doc" in the extension popup
2. Google will prompt you to sign in and authorize access
3. Click **Allow**
4. Future uses will work automatically without prompts

## Development

No build system — this is vanilla JavaScript with no npm dependencies. Changes are reflected immediately after reloading the extension at `chrome://extensions`.

### Running Tests

```bash
node tests/twitterShortcuts.test.js    # 133 tests
node tests/smartPaste.test.js          # 233 tests
node tests/transformController.test.js # 143 tests
node tests/pdfCopy.test.js            # 112 tests
node tests/cleanLinkSources.test.js   # 33 tests
```

### API Keys
- Copy `shared/llm/config/api-keys.template.js` to `api-keys.local.js`
- Add your Gemini API key (Claude API not currently functional)
- `api-keys.local.js` is gitignored

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. But note that I have no idea what I'm doing, shield your eyes, etc.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
