# Changelog

## Coverage Check ("Have I covered this?")

### Features
- 2026-07-08: New feature — right-click any page → "Check coverage on this page"
  - Highlights article paragraphs by coverage vs the DWATV archive: green = new,
    yellow = adjacent/context, red = covered (no layout shift; edge bar + tint)
  - Chrome side panel shows prior-coverage matches (score, post, date, section,
    snippet, copy cite / copy link) when you click a highlighted paragraph or
    select any text on the page
  - Optional "verify" mode (Claude judges flagged paragraphs, slower)
  - Requires the local covered server: `python covered_web.py` in the writing
    folder (http://127.0.0.1:8377)
  - New files: `coverage/coverage-content.js`, `coverage/sidepanel.{html,js,css}`;
    new permissions: `sidePanel`, host `http://127.0.0.1:8377/*`

## Text Transform Feature

### Bug Fixes
- 2024-03-XX: Fixed paragraph preservation while removing extra whitespace
  - Split text into paragraphs using \n\n+
  - Create separate p elements for each paragraph
  - Remove empty text nodes around blockquote
- 2024-03-XX: Fixed blockquote formatting with ProseMirror classes

### Known Issues
- Ctrl+Q shortcut sometimes requires page reload to work

### Implementation Notes
- Use \n\n+ to split paragraphs
- Remove empty text nodes around blockquote
- Create separate p elements for each paragraph
- Don't modify blockquote margins/padding