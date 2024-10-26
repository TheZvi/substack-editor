// linkify-controller.js

// Global state to track our rules and results
let linkRules = null;
let linkResults = [];

// Load our rules from the default-rules.json file
async function loadRules() {
    try {
        console.log("Attempting to fetch rules from:", chrome.runtime.getURL('linkify/default-rules.json'));
        const response = await fetch(chrome.runtime.getURL('linkify/default-rules.json'));
        console.log("Fetch response:", response);
        const data = await response.json();
        console.log("Parsed data:", data);
        return data.linkRules;
    } catch (error) {
        console.error('Error loading link rules - FULL ERROR:', error);
        console.error('Error loading link rules - message:', error.message);
        console.error('Error loading link rules - stack:', error.stack);
        return null;
    }
}

// Process a single rule against the content
function processRule(contentElement, rule, ruleIndex) {
    const textNodes = findTextNodes(contentElement);
    
    textNodes.forEach(node => {
        // Skip if this node is already part of a link
        if (isInsideLink(node)) return;

        const matches = findMatches(node.textContent, rule);
        matches.forEach(match => {
            if (canCreateLink(node, match)) {
                createLink(node, match, rule, ruleIndex);
                linkResults.push({
                    text: match.text,
                    url: rule.url,
                    location: getNodeContext(node)
                });
            }
        });
    });
}

// Helper function to find all text nodes
function findTextNodes(element) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
        nodes.push(node);
    }
    return nodes;
}

// Helper to check if node is inside a link
function isInsideLink(node) {
    let parent = node.parentElement;
    while (parent) {
        if (parent.tagName === 'A') return true;
        parent = parent.parentElement;
    }
    return false;
}

// Helper to find matches in text based on rule
function findMatches(text, rule) {
    const matches = [];
    let searchText = rule.matchType === 'caseInsensitive' ? 
        text.toLowerCase() : text;
    let targetText = rule.matchType === 'caseInsensitive' ? 
        rule.target.toLowerCase() : rule.target;

    let startPos = 0;
    while (true) {
        const index = searchText.indexOf(targetText, startPos);
        if (index === -1) break;

        if (rule.wholeWord) {
            const beforeChar = index === 0 ? ' ' : searchText[index - 1];
            const afterChar = index + targetText.length >= searchText.length ? 
                ' ' : searchText[index + targetText.length];
            
            if (!/\w/.test(beforeChar) && !/\w/.test(afterChar)) {
                matches.push({
                    start: index,
                    end: index + targetText.length,
                    text: text.slice(index, index + targetText.length)
                });
            }
        } else {
            matches.push({
                start: index,
                end: index + targetText.length,
                text: text.slice(index, index + targetText.length)
            });
        }

        startPos = index + 1;
    }

    return matches;
}

// Helper to check if we can create a link at this location
function canCreateLink(node, match) {
    // Add any additional checks here (e.g., not too close to other links)
    return true;
}

// Create a link from matched text
function createLink(node, match, rule, ruleIndex) {
    console.log("Creating link for:", {
        nodeText: node.textContent,
        nodeLength: node.textContent.length,
        matchStart: match.start,
        matchEnd: match.end,
        matchText: match.text
    });
    
    try {
        const range = document.createRange();
        if (match.start > node.textContent.length || match.end > node.textContent.length) {
            console.error("Invalid range:", {
                nodeLength: node.textContent.length,
                matchStart: match.start,
                matchEnd: match.end
            });
            return;
        }
        range.setStart(node, match.start);
        range.setEnd(node, match.end);

        const link = document.createElement('a');
        link.href = rule.url;
        link.textContent = match.text;
        if (rule.hoverText) link.title = rule.hoverText;
        if (rule.newTab) link.target = '_blank';
        link.setAttribute('data-auto-linked', 'true');
        link.setAttribute('data-rule-index', ruleIndex.toString());

        range.deleteContents();
        range.insertNode(link);
    } catch (error) {
        console.error("Error creating link:", error, {
            nodeText: node.textContent,
            nodeLength: node.textContent.length,
            matchStart: match.start,
            matchEnd: match.end,
            matchText: match.text
        });
    }
}

// Helper to get context about where in the document this node appears
function getNodeContext(node) {
    let context = "";
    let parent = node.parentElement;
    while (parent && !parent.matches('h1, h2, h3, h4, p')) {
        parent = parent.parentElement;
    }
    if (parent) {
        context = `in ${parent.tagName.toLowerCase()}`;
        if (parent.textContent.length > 50) {
            context += `: "${parent.textContent.slice(0, 50)}..."`;
        } else {
            context += `: "${parent.textContent}"`;
        }
    }
    return context;
}

console.log("=== Linkify controller starting ==="); //TODO: Remove this
// Main function to process the content and add links
async function linkifyContent() {
    console.log("Starting linkification process");
    const linkResults = [];
    
    try {
        // Load rules
        console.log("Loading rules..."); //TODO: Remove this
        const linkRules = await loadRules();
        console.log("Rules loaded:", linkRules); //TODO: Remove this

        if (!linkRules) {
            return { 
                success: false, 
                error: "Could not load linking rules",
                results: [] 
            };
        }

        // Get the editable content area
        console.log("Getting content element..."); //TODO: Remove this
        const contentElement = document.querySelector('div[contenteditable="true"][data-testid="editor"]');
        console.log("Content element found:", !!contentElement); //TODO: Remove this
        if (!contentElement) {
            return { 
                success: false, 
                error: "Could not find editor content",
                results: [] 
            };
        }

        // Process each rule in order (priority order)
        console.log("Processing rules..."); //TODO: Remove this
        for (let ruleIndex = 0; ruleIndex < linkRules.length; ruleIndex++) {
            const rule = linkRules[ruleIndex];
            processRule(contentElement, rule, ruleIndex, linkResults);
        }
        console.log("Link results:", linkResults); //TODO: Remove this
        return {
            success: true,
            results: linkResults
        };
    } catch (error) {
        console.error('Error in linkification:', error);
        return {
            success: false,
            error: error.message,
            results: linkResults
        };
    }
}

window.linkifyContent = linkifyContent;
console.log("Linkify controller loaded");