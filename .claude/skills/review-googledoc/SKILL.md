---
name: review-googledoc
description: Review a Google Doc in Chrome and add anchored comments using MCP browser automation. Can review an already-open doc OR open a doc by name from Google Drive. Use when the user wants to review, comment on, or get feedback on a Google Doc - for any review type including spelling, grammar, factual accuracy, clarity, structure, potential edits, rhetorical effectiveness, or custom criteria. If no specific criteria given, reviews for ALL types.
---

# Google Docs Review Skill

Use this Skill to review Google Docs and add anchored comments directly in the document using MCP browser automation.

## Prerequisites
- Google Doc must be open in a Chrome tab
- Claude in Chrome MCP browser tools must be available

## Workflow

### Step 1: Get Document Context
1. Use `mcp__claude-in-chrome__tabs_context_mcp` to get available tabs
2. Look for a Google Doc tab (URL contains `docs.google.com/document/`)
3. **If user named a specific document:**
   - Check if that doc is already open (match by title in tab or page)
   - If NOT open, open it:
     a. Create new tab: `mcp__claude-in-chrome__tabs_create_mcp`
     b. Navigate to Google Drive search: `mcp__claude-in-chrome__navigate` url="https://drive.google.com/drive/search?q=[doc name]"
     c. Wait for results to load, take screenshot
     d. Find and click the matching document to open it
     e. Wait for doc to load, take screenshot to confirm
4. **If no doc specified and no Google Doc tab found:**
   - Ask user which document to review
5. Take a screenshot to see the current document state
6. Determine review scope:
   - If user specified criteria, use those
   - If user did NOT specify criteria, review for ALL of the following:
     - Spelling/grammar errors
     - Factual accuracy
     - Clarity and readability
     - Technical accuracy
     - Structure and organization
     - Potential edits (wording improvements, conciseness)
     - Rhetorical effectiveness (argument strength, persuasiveness, flow)

### Step 2: Read Document Content
Use one of these approaches to get the document text:
1. **Scroll and screenshot** - Take multiple screenshots while scrolling to read all content visually
2. **Select all and copy** - Ctrl+A, then read the selection

### Step 3: Analyze and Identify Issues
Based on the user's requested review type, identify specific issues to comment on.
For each issue, note:
- The exact text or phrase to find (for anchoring the comment)
- The comment to add (description of issue + suggestion)

### Step 4: Add Comments (for each issue)
Use MCP automation to add anchored comments:

1. Open Find: `mcp__claude-in-chrome__computer` action="key" text="ctrl+f"
2. Type search text: `mcp__claude-in-chrome__computer` action="type" text="[phrase to find]"
3. Find it: `mcp__claude-in-chrome__computer` action="key" text="Return"
4. Take screenshot to see where it is
5. Close Find: `mcp__claude-in-chrome__computer` action="key" text="Escape"
6. Triple-click to select paragraph: `mcp__claude-in-chrome__computer` action="triple_click" coordinate=[x,y]
7. Find Add Comment button: `mcp__claude-in-chrome__find` query="Add comment button"
8. Click it: `mcp__claude-in-chrome__computer` action="left_click" ref="ref_xxx"
9. Type comment: `mcp__claude-in-chrome__computer` action="type" text="[comment text]"
10. Find submit button: `mcp__claude-in-chrome__find` query="Comment submit button"
11. Submit: `mcp__claude-in-chrome__computer` action="left_click" ref="ref_xxx"

### Step 5: Report Results
After processing all issues, report:
- Total issues found
- Comments successfully added
- Any issues that couldn't be commented (e.g., text not found)

## Usage Triggers

Claude will automatically use this Skill when you ask things like:
- "Review my Google Doc" (reviews open doc for ALL criteria)
- "Review 'My Draft Post'" (opens doc by name if not already open)
- "Check the Google Doc for spelling errors" (specific criterion)
- "Add comments to the Google Doc about factual accuracy"
- "Review this doc for clarity"
- "Check the structure and flow"
- "Suggest edits for this doc"
- "Review 'Weekly Update' for rhetorical effectiveness"
- "Comment on the open Google Doc"

## Important Notes
- Comments anchor to paragraphs, not specific words (Google Docs limitation via this method)
- Each comment requires ~10 MCP tool calls, so large reviews take time
- If Find can't locate exact text, try a shorter unique phrase from that paragraph
- The Google Doc must be in a Chrome tab that's part of the MCP tab group
