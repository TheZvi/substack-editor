# Substack Text Transformer

A Chrome extension that helps clean up and format text on Substack, with a focus on maintaining precise technical meaning while improving readability.

## Features

### Text Transformation (Ctrl+Q)
- Quick formatting with Ctrl+Q shortcut
- Preserves technical acronyms (AI, AGI, ASI, etc.)
- Maintains exact quote formatting
- Auto-selects paragraphs or blockquotes
- Preserves links and HTML structure
- Uses Google's Gemini API for fast processing (configurable model)

### Table of Contents
- Generate/Update TOC from headers
- Auto-links to sections
- Marks blank sections
- Preserves subtitle annotations when updating

### Crossposting
- **WordPress**: One-click crosspost to WordPress.com
- **Twitter Articles**: Post Substack content as Twitter Articles (with auto header/blockquote formatting)

### Twitter List Sync
Sync your Following list to a Twitter List, or transfer members between lists. Useful workaround for Twitter's "For You" feed.

- **Add Only**: Add accounts from source to destination list
- **Remove Only**: Remove accounts not in source from destination
- **Full Sync**: Make destination exactly match source
- Supports syncing from Following or from another list (even someone else's public list)

### Linkify
- Auto-link concepts to predefined URLs
- Customizable rules via UI

## Installation

1. Install from the Chrome Web Store (link coming soon)
2. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey) (note that Claude is not working atm)
3. Enter your API key when prompted

## Usage

### Text Transformation
1. Navigate to any Substack post editor
2. Select text (or use Ctrl+Q to auto-select)
3. Press Ctrl+Q to transform the text
4. The selected text will be reformatted while preserving technical meaning

### Twitter List Sync
1. Open the extension popup
2. In the "Twitter List Sync" section, enter:
   - **Username**: Your Twitter username (without @)
   - **Source List**: Leave empty to sync from Following, or enter a List ID to sync from another list
   - **Dest List**: The List ID you want to sync TO (find in URL: `x.com/i/lists/LISTID`)
3. Click Add Only, Remove Only, or Full Sync
4. The extension will automatically open the necessary pages and collect accounts

**Note**: Large syncs (200+ accounts) take ~15-20 minutes due to Twitter rate limits. The DOM scraping may pick up a small number of false positives (~2-3%) due to UI proximity detection.

## Development

To work on the extension locally:

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. But note that I have no idea what I'm doing, shield your eyes, etc.

## License

This project is licensed under the MIT License - see the LICENSE file for details.