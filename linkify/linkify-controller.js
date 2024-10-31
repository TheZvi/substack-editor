// linkify-controller.js

// Global state to track our rules and results
window.linkRules = null;
window.linkResults = [];

// Load our rules from the default-rules.json file
// In linkify-controller.js, modify the loadRules function:
async function loadRules() {
    try {
        console.log("Loading rules and checking storage");
        const response = await fetch(chrome.runtime.getURL('linkify/default-rules.json'));
        const data = await response.json();
        const { overrides = {}, userRules = [] } = await chrome.storage.sync.get(['overrides', 'userRules']);
        
        // Filter out disabled rules and combine with user rules
        const defaultRules = data.linkRules.filter(rule => !overrides[rule.target]?.disabled);
        linkRules = [...defaultRules, ...userRules];
        
        // Only log user rules and rules containing "Battle of the Board"
        console.log("User rules:", userRules.map(r => ({
            target: r.target,
            url: r.url,
            matchType: r.matchType,
            wholeWord: r.wholeWord
        })));
        console.log("Active default rules matching test:", 
            defaultRules
                .filter(r => r.target.includes("Battle of the Board"))
                .map(r => ({ target: r.target, url: r.url }))
        );
        
        return linkRules;
    } catch (error) {
        console.error('Error loading link rules:', error);
        return null;
    }
}

// Process a single rule against the content
function processRule(contentElement, rule, ruleIndex, linkResults) {
    // Only log rules we care about
    const isTestRule = rule.target.includes("Battle of the Board") || 
                      rule.target === "Asymmetric Justice";
                      
    if (isTestRule) {
        console.log("Starting to process rule:", {
            target: rule.target,
            numTextNodes: findTextNodes(contentElement).length,
            contentElement: !!contentElement
        });
    }
    
    // Keep processing until no more matches are found
    let keepSearching = true;
    while (keepSearching) {
        keepSearching = false;
        const textNodes = findTextNodes(contentElement);
        
        // Look through each text node for a single match
        for (let node of textNodes) {
            if (isInsideLink(node)) continue;
            
            const matches = findMatches(node.textContent, rule);
            if (matches.length > 0) {
                // Only process the first match we find, then start over
                const match = matches[0];
                // Only log matches for rules we care about during current debug TODO remove
                if (rule.target.includes("Battle of the Board") || 
                    rule.target === "Asymmetric Justice") {
                    console.log("Processing match:", {
                        text: match.text,
                        nodeContent: node.textContent
                    });
                }
                createLink(node, match, rule, ruleIndex);
                linkResults.push({
                    text: match.text,
                    url: rule.url,
                    location: getNodeContext(node)
                });
                // Found and processed a match, keep searching
                keepSearching = true;
                break;
            }
        }
    }
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
    const isTestRule = rule.target.includes("Battle of the Board") || 
                      rule.target === "Asymmetric Justice";
                      
    if (isTestRule) {
        console.log("Starting findMatches with:", {
            text: text.substring(0, 50) + "...",
            ruleTarget: rule.target,
            ruleType: rule.matchType,
            wholeWord: rule.wholeWord
        });
    }
    
    const matches = [];
    let searchText = rule.matchType === 'caseInsensitive' ? 
        text.toLowerCase() : text;
    let targetText = rule.matchType === 'caseInsensitive' ? 
        rule.target.toLowerCase() : rule.target;

        if (isTestRule) {
            console.log("Processed text:", {
                searchText: searchText.substring(0, 50) + "...",
                targetText: targetText
            }); 
        }

    let startPos = 0;
    while (true) {
        const index = searchText.indexOf(targetText, startPos);
        if (index === -1) break;

        console.log(`Found potential match at position ${index}`);

        if (rule.wholeWord) {
            const beforeChar = index === 0 ? ' ' : searchText[index - 1];
            const afterChar = index + targetText.length >= searchText.length ? 
                ' ' : searchText[index + targetText.length];
            
            console.log("Checking whole word:", {
                beforeChar,
                afterChar,
                isValid: !/\w/.test(beforeChar) && !/\w/.test(afterChar)
            });

            if (!/\w/.test(beforeChar) && !/\w/.test(afterChar)) {
                matches.push({
                    start: index,
                    end: index + targetText.length,
                    text: text.slice(index, index + targetText.length)
                });
                console.log("Match added");
            }
        } else {
            matches.push({
                start: index,
                end: index + targetText.length,
                text: text.slice(index, index + targetText.length)
            });
            console.log("Match added (no whole word check)");
        }

        startPos = index + 1;
    }

    if (matches.length > 0 && isTestRule) {
        console.log("Returning matches:", matches);
    }
    return matches;
}

// Create a link from matched text
function createLink(node, match, rule, ruleIndex) {
    try {
        console.log("Creating link with:", {
            text: match.text,
            url: rule.url,
            hoverText: rule.hoverText,
            newTab: rule.newTab
        });

        const range = document.createRange();
        if (match.start > node.textContent.length || match.end > node.textContent.length) {
            console.error("Invalid range, skipping");
            return;
        }
        range.setStart(node, match.start);
        range.setEnd(node, match.end);

        const link = document.createElement('a');
        link.href = rule.url;
        link.textContent = match.text;  // Use original case from match

        //TODO: Try to get hover text to work but Substack overrides it, here are some attempts that didn't work:
        //link.setAttribute('title', rule.hoverText);  
        //link.setAttribute('data-hover', rule.hoverText); 
        //link.setAttribute('data-original-hover', rule.hoverText); 
        //Trying a timeout first to dodge Substack's changes didn't work either

        link.setAttribute('target', '_blank');
        link.setAttribute('data-auto-linked', 'true');
        link.setAttribute('data-rule-index', ruleIndex.toString());        
        
        console.log("Link element before insertion:", link.outerHTML);
        range.deleteContents();
        range.insertNode(link);

        console.log("Link element after insertion:", link.parentElement.innerHTML);
    } catch (error) {
        console.error("Error creating link:", error);
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

// Main function to process the content and add links
async function linkifyContent() {

    /* Clean up any existing hover styles from previous runs
    We don't need this right now because Substack overrides the hover text anyway but might be useful later
    document.querySelectorAll('style').forEach(style => {
    if (style.textContent.includes('a[data-hover]')) {
        style.remove();
        }
    }); 

    // Add style for hover text if not already added
    if (!document.querySelector('#linkify-hover-style')) {
        const style = document.createElement('style');
        style.id = 'linkify-hover-style';
        style.textContent = `
            a[data-hover]:hover::after {
                content: attr(data-hover);
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: black;
                color: white;
                padding: 5px;
                border-radius: 3px;
                font-size: 14px;
                white-space: nowrap;
                z-index: 1000;
            }
            a[data-hover] {
                position: relative;
            }
        `;
        document.head.appendChild(style);
    } */

    // Set up mutation observer to watch for link changes, in case we ever need that for debugging
    /*const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === 'A') {  // Element node and it's a link
                    console.log("Link modified/added:", node);
                    if (node.getAttribute('data-auto-linked')) {
                        console.log("Adding hover text to our link");
                        node.setAttribute('data-hover', node.getAttribute('data-original-hover'));
                        node.title = node.getAttribute('data-original-hover');
                        }
                    }
                });
            });
        }); 

    // Start observing the document for changes
    const contentElement = document.querySelector('div[contenteditable="true"][data-testid="editor"]');
    if (!contentElement) {
        return { 
            success: false, 
            error: "Could not find editor content",
            results: [] 
        };
    }

    observer.observe(contentElement, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        characterData: true 
    }); */

    const linkResults = [];
    
    try {
        // Load rules
        const linkRules = await loadRules();

        if (!linkRules) {
            return { 
                success: false, 
                error: "Could not load linking rules",
                results: [] 
            };
        }

        // Get the editable content area
        const contentElement = document.querySelector('div[contenteditable="true"][data-testid="editor"]');
        if (!contentElement) {
            return { 
                success: false, 
                error: "Could not find editor content",
                results: [] 
            };
        }

        // Process each rule in order (priority order)
        for (let ruleIndex = 0; ruleIndex < linkRules.length; ruleIndex++) {
            const rule = linkRules[ruleIndex];
            processRule(contentElement, rule, ruleIndex, linkResults);
        }
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