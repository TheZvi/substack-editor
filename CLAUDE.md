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
- Intelligent linkification of concepts

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
│   └── twitter-receiver.js           # Inserts content into Twitter Articles editor
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
│   └── llm/
│       ├── api/
│       │   ├── base-api.js           # Abstract LLM base class
│       │   ├── gemini_api.js         # Google Gemini implementation
│       │   ├── claude_api.js         # Anthropic Claude implementation
│       │   ├── claude-api.js         # Alternative Claude implementation
│       │   ├── api-factory.js        # Factory pattern for API selection
│       │   ├── llm-api.js            # Additional LLM interface
│       │   └── default-rules.json    # Default transformation rules
│       └── config/
│           ├── api-keys.template.js  # API key config template
│           └── api-keys.local.js     # Local API keys (gitignored)
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
  - Google Gemini (`gemini-1.5-flash-8b`)
  - Anthropic Claude (`claude-3-opus-20240229`) - Note: Currently not working

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
Extensive console logging exists throughout (marked `// todo remove`):
```javascript
console.log("Content script loading"); // todo remove
```

## Key Files to Understand

| File | Purpose | Priority |
|------|---------|----------|
| `popup.js` | Main UI logic, button handlers | High |
| `features/text-transform/transform-controller.js` | Core transformation logic | High |
| `background.js` | Command handling, message routing | High |
| `content.js` | Page context bridge | Medium |
| `shared/llm/api/gemini_api.js` | LLM API integration | Medium |
| `linkify/linkify-controller.js` | Link replacement | Medium |

## Known Issues

1. **Ctrl+Q shortcut sometimes requires page reload** - Chrome command registration timing issue
2. **Claude API not working** - Integration incomplete (README notes this)
3. **Debug logging throughout** - Many `console.log` statements marked for removal

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

## Common Tasks

### Adding a New LLM Provider
1. Create new class in `shared/llm/api/` extending `LLMApi` or `base-api.js`
2. Implement `transformText()` method
3. Register in `api-factory.js`
4. Add API key field in options page

### Adding New Linkify Rules
Edit `linkify/default-rules.json` or use the UI at `linkify/ui/manage-linkify-rules.html`

### Modifying Text Transformation Rules
Edit `shared/llm/api/default-rules.json` - rules have priorities and can be enabled/disabled

## Testing

No automated tests exist. Manual testing workflow:
1. Load extension unpacked in Chrome
2. Navigate to Substack editor (`https://*.substack.com/publish/post/*`)
3. Select text and press Ctrl+Q
4. Verify transformation preserves meaning and formatting

## Host Permissions

The extension requires access to:
- `https://*.substack.com/publish/post/*` - Substack editor
- `https://*.wordpress.com/*` - WordPress integration
- `https://api.anthropic.com/*` - Claude API
- `https://generativelanguage.googleapis.com/*` - Gemini API

## Important Considerations for AI Assistants

1. **Preserve technical meaning** - The extension is designed to reformat without changing meaning
2. **Acronym preservation** - AI, AGI, ASI, GPT, LLM, NLP must never be expanded
3. **Quote handling** - Exact quotes must be preserved verbatim
4. **No frameworks** - This is vanilla JavaScript; don't introduce npm dependencies
5. **Manifest V3** - Use service workers, not background pages
6. **ProseMirror awareness** - Substack uses ProseMirror; respect its DOM structure
