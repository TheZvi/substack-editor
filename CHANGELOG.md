# Changelog

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