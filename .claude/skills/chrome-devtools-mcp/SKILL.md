# Chrome DevTools MCP Skill

## Description
Start and use the chrome-devtools-mcp server to inspect, debug, and extract data from Chrome browser pages. Useful for scraping dashboards, extracting metrics, and automating browser-based data collection tasks that require DevTools-level access.

## Setup

The chrome-devtools-mcp server requires Chrome to be running with remote debugging enabled.

### Starting Chrome with Remote Debugging
```bash
# Windows - close all Chrome instances first, then:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### Starting the MCP Server
```bash
npx chrome-devtools-mcp@latest --autoConnect
```

The server connects to Chrome's DevTools protocol via the remote debugging port and exposes page inspection capabilities to MCP clients.

## Usage

1. Ensure Chrome is running with `--remote-debugging-port=9222`
2. Run `npx chrome-devtools-mcp@latest --autoConnect`
3. The server provides tools for:
   - Inspecting page DOM and content
   - Reading network requests
   - Executing JavaScript in page context
   - Extracting structured data from web pages

## When to Use

- Extracting dashboard metrics (e.g., Substack stats, analytics)
- Scraping structured data from authenticated pages
- Debugging web application issues
- Automating data collection from browser-based tools

## Alternative: Claude in Chrome MCP

If the Claude browser extension is available and connected, prefer using the `mcp__claude-in-chrome__*` tools instead, as they don't require the separate DevTools MCP server setup. The Claude in Chrome extension provides:
- `mcp__claude-in-chrome__javascript_tool` - Execute JS in page context
- `mcp__claude-in-chrome__read_page` - Read page accessibility tree
- `mcp__claude-in-chrome__get_page_text` - Extract page text
- `mcp__claude-in-chrome__computer` - Mouse/keyboard automation
- `mcp__claude-in-chrome__navigate` - URL navigation

## Notes
- The DevTools MCP server exposes all browser content to MCP clients - avoid using with sensitive data visible
- Google collects usage statistics by default; opt out with `--no-usage-statistics`
- Disable CrUX API calls with `--no-performance-crux`
