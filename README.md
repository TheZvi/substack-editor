# Substack Text Transformer

A Chrome extension that helps clean up and format text on Substack, with a focus on maintaining precise technical meaning while improving readability.

## Features

- Quick formatting with Ctrl+Q shortcut
- Preserves technical acronyms (AI, AGI, ASI, etc.)
- Maintains exact quote formatting
- Auto-selects paragraphs or blockquotes
- Preserves links and HTML structure
- Uses Google's Gemini API for fast processing

## Installation

1. Install from the Chrome Web Store (link coming soon)
2. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey) (note that Claude is not working atm)
3. Enter your API key when prompted

## Usage

1. Navigate to any Substack post editor
2. Select text (or use Ctrl+Q to auto-select)
3. Press Ctrl+Q to transform the text
4. The selected text will be reformatted while preserving technical meaning

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