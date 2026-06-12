// features/text-transform/transform-controller.js

class TransformController {
    constructor() {
        this.api = new window.GeminiApi();

        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;

            if (event.data.type === 'transform-controller-check') {
                // Content script (possibly a new instance after an extension
                // reload) is asking whether a controller already exists
                window.postMessage({ type: 'transform-controller-ready' }, '*');
                return;
            }

            if (event.data.type !== 'transform-text') return;
            await this.handleTransform(event.data.text || window.getSelection().toString());
        });

        // Announce readiness so the content script knows Ctrl+Q will work
        window.postMessage({ type: 'transform-controller-ready' }, '*');
    }

    /**
     * Mechanical fixes and hard preservation constraints - applied in BOTH modes
     */
    getCoreRules() {
        return [
            { "priority": 0, "description": "CRITICAL PRESERVATION: 1) Never expand 'ASI', 'AGI', 'AI', 'GPT', 'LLM', or 'NLP' into full words - and CONTRACT spelled-out forms to the acronym ('artificial intelligence' → 'AI', 'artificial general intelligence' → 'AGI', 'large language model' → 'LLM') 2) Never change single quotes (') to double quotes (\") or vice versa - leave all quote marks exactly as they appear 3) Preserve ALL HTML anchor tags exactly as written - every <a href=\"...\">text</a> must keep the same href URL and link text; never remove, modify or break any links 4) Preserve hashtags and URLs exactly as written 5) Preserve square-bracket editorial insertions like [here] or [sic] exactly." },
            { "priority": 1, "description": "Fix typos and misspellings (e.g. 'teh' → 'the', 'sentance' → 'sentence')." },
            { "priority": 2, "description": "Fix grammar errors ONLY when they are clearly unintentional mistakes: subject-verb agreement ('X and Y is' → 'X and Y are'; 'The team are' → 'The team is'; 'Neither X nor Y are' → 'Neither X nor Y is'; compound subjects joined by 'and' take plural verbs), tense slips and doubled words. Do NOT change phrasing that could be intentional or stylistic." },
            { "priority": 3, "description": "Fix clear punctuation errors: missing periods at the end of sentences, double periods, stray spaces before punctuation. Only change a question mark to a period (or vice versa), or an exclamation mark to a period (or vice versa), if it is an obvious error. Otherwise respect the author's punctuation choices." },
            { "priority": 4, "description": "Fix capitalization at sentence starts and of proper nouns, while preserving intentional ALL CAPS and Title Case headers." },
            { "priority": 5, "description": "SERIAL LISTS: In a list of 3+ items (X, Y and Z), the 'and' belongs before the FINAL item only. If 'and' appears mid-list, move it to before the final item and remove any comma before that final item. Example: 'ask permission, add folders and without restarting, make suggestions' → 'ask permission, add folders without restarting and make suggestions'. NEVER add Oxford commas (no comma before 'and'). The pattern should be 'X, Y, Z and W' not 'X, Y, Z, and W'." },
            { "priority": 6, "description": "PARAGRAPH BREAKS: Adjust paragraph breaks and whitespace for readability. Join lines that were broken mid-sentence (common in pasted tweets). Split long walls of text into paragraphs at natural topic boundaries. Preserve deliberate one-line paragraphs and all intentional existing breaks. Remove excessive blank lines while preserving paragraph breaks." },
            { "priority": 7, "description": "NUMBERED LISTS: If text contains numbered items (like '1. item' followed by '2. item' on next line), convert them to proper HTML ordered list format: <ol><li>first item text without number</li><li>second item text without number</li></ol>. Remove the number prefixes (1., 2., etc.) since the <ol> handles numbering. Preserve paragraph breaks between list items if content is long." },
            { "priority": 8, "description": "If you know the name an @mention refers to, replace it with that name, otherwise leave it exactly as is. Remove extra line breaks before and after @mentions." },
            { "priority": 9, "description": "MINIMAL EDIT PRINCIPLE: Never ADD em-dashes, transition words, summary sentences or intensifiers. Do not rewrite, reorder or restructure. Make the smallest change that fixes each problem; when in doubt, leave it as written." }
        ];
    }

    /**
     * Extra rules when editing the author's OWN prose (not inside a blockquote)
     */
    getOwnProseRules() {
        return [
            { "priority": 10, "description": "VOICE: This is the author's own prose. Sentence fragments ('Good luck with that.'), one-line paragraphs, rhetorical questions, colloquialisms and contractions are deliberate style - never 'fix' them. Never expand contractions ('it's' stays 'it's'). Asterisk-censored profanity stays exactly as written." },
            { "priority": 11, "description": "NUMBERS: Use digits for large or precise values and words for small casual counts, but leave existing defensible choices unchanged." }
        ];
    }

    /**
     * Extra rules when editing QUOTED text (selection inside a blockquote)
     */
    getQuoteRules() {
        return [
            { "priority": 10, "description": "QUOTED TEXT: This text quotes another author. Apply ONLY the mechanical fixes above. Never change word choice, tone or register (quoted slang like 'gonna' stays). Never add or remove content. Never fix the author's logic, arguments or claims. Only fix grammar when the error is clearly an unintentional mistake. The result must be something the original author would endorse as a faithful quote of what they wrote." }
        ];
    }

    /**
     * Build the full rule set for the current mode
     * @param {boolean} isQuote - true when the selection is inside a blockquote
     */
    buildRules(isQuote) {
        return [
            ...this.getCoreRules(),
            ...(isQuote ? this.getQuoteRules() : this.getOwnProseRules())
        ];
    }

    /**
     * Detect whether the current selection sits inside a blockquote,
     * which means we are editing someone else's quoted words
     */
    isSelectionInBlockquote() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;
        let node = selection.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentElement;
        }
        return !!(node && node.closest && node.closest('blockquote'));
    }

    /**
     * Converts numbered list patterns in text to proper HTML <ol><li> structure
     * Detects patterns like "1. item\n2. item" or "1. item\n\n2. item"
     * @param {string} text - The text to process
     * @returns {string} - Text with numbered lists converted to HTML
     */
    convertNumberedListsToHtml(text) {
        // First, try to detect numbered items wrapped in <p> tags: <p>1. text</p>
        // This is the typical format when content comes from a blockquote selection.
        const htmlParaPattern = /<p>\s*(\d+)[.\)]\s+([\s\S]+?)\s*<\/p>/gi;
        const htmlParaMatches = [...text.matchAll(htmlParaPattern)];

        if (htmlParaMatches.length >= 2) {
            let hasSequential = true;
            for (let i = 1; i < htmlParaMatches.length; i++) {
                if (parseInt(htmlParaMatches[i][1]) !== parseInt(htmlParaMatches[i-1][1]) + 1) {
                    hasSequential = false;
                    break;
                }
            }

            if (hasSequential || htmlParaMatches.length >= 3) {
                console.log("[Transform] Detected HTML-wrapped numbered list with", htmlParaMatches.length, "items");

                const firstFull = htmlParaMatches[0][0];
                const lastFull = htmlParaMatches[htmlParaMatches.length - 1][0];

                const listStart = text.indexOf(firstFull);
                const beforeList = text.substring(0, listStart).trim();

                const listEnd = text.indexOf(lastFull) + lastFull.length;
                const afterList = text.substring(listEnd).trim();

                const listItems = htmlParaMatches.map(m => `<li><p>${m[2].trim()}</p></li>`);
                const htmlList = `<ol>${listItems.join('')}</ol>`;

                let result = beforeList;
                if (result) result += '\n';
                result += htmlList;
                if (afterList) result += '\n' + afterList;
                return result;
            }
        }

        // Fallback: plain-text pattern "1. text" or "1) text" at start of line
        // Must have at least 2 consecutive numbered items to be considered a list
        const numberedListPattern = /(?:^|\n)(\d+)[.\)]\s+(.+?)(?=\n\d+[.\)]\s|\n\n|\n*$)/gs;

        // First, check if there's actually a numbered list (at least 2 items)
        const matches = [...text.matchAll(numberedListPattern)];

        if (matches.length < 2) {
            // Not enough items to form a list
            return text;
        }

        // Check if items are sequential (1, 2, 3... or could start from any number)
        let hasSequentialNumbers = true;
        for (let i = 1; i < matches.length; i++) {
            const prevNum = parseInt(matches[i-1][1]);
            const currNum = parseInt(matches[i][1]);
            if (currNum !== prevNum + 1) {
                hasSequentialNumbers = false;
                break;
            }
        }

        if (!hasSequentialNumbers && matches.length < 3) {
            // If not sequential and less than 3 items, might not be a real list
            return text;
        }

        console.log("[Transform] Detected numbered list with", matches.length, "items");

        // Find where the list starts and ends in the text
        const firstMatch = matches[0];
        const lastMatch = matches[matches.length - 1];

        // Get text before the list
        const listStartIndex = text.indexOf(firstMatch[0].trim());
        const beforeList = text.substring(0, listStartIndex).trim();

        // Get text after the list
        const lastItemEnd = text.indexOf(lastMatch[0].trim()) + lastMatch[0].trim().length;
        const afterList = text.substring(lastItemEnd).trim();

        // Build the HTML list
        const listItems = matches.map(match => {
            const itemText = match[2].trim();
            return `<li><p>${itemText}</p></li>`;
        });

        const htmlList = `<ol>${listItems.join('')}</ol>`;

        // Reconstruct the text
        let result = '';
        if (beforeList) {
            result += `<p>${beforeList}</p>\n`;
        }
        result += htmlList;
        if (afterList) {
            result += `\n<p>${afterList}</p>`;
        }

        return result;
    }

    showWorkingIndicator(label = 'Transforming text…') {
        // Remove any existing indicator
        this.hideWorkingIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'transform-working-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #4285f4, #34a853);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        indicator.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
                <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
                <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
            </svg>
            ${label}
        `;
        document.body.appendChild(indicator);
    }

    hideWorkingIndicator() {
        const indicator = document.getElementById('transform-working-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async getApiKey(type) {
        // Use cached key if available
        if (this._cachedApiKey) {
            return this._cachedApiKey;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('API key request timed out'));
            }, 500); // Reduced timeout - local message should be fast

            const handler = (event) => {
                if (event.source !== window) return;
                if (event.data.type !== 'api-key-response') return;

                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                this._cachedApiKey = event.data.key;
                resolve(event.data.key);
            };

            try {
                window.postMessage({
                    type: 'get-api-key',
                    service: type
                }, '*');
                window.addEventListener('message', handler);
            } catch (error) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                reject(error);
            }
        });
    }

    async handleTransform(inputText) {
        try {
            // If no text is pre-selected, auto-select based on context
            if (!inputText) {
                const selection = window.getSelection();
                const range = document.createRange();
                let container = selection.anchorNode;

                // First try to find a blockquote ancestor
                let blockquote = container;
                while (blockquote && blockquote.nodeName !== 'BLOCKQUOTE') {
                    blockquote = blockquote.parentNode;
                }

                // If we found a blockquote, use that, otherwise fall back to paragraph
                if (blockquote) {
                    range.selectNodeContents(blockquote);
                } else {
                    // Find the nearest paragraph
                    while (container && container.nodeName !== 'P') {
                        container = container.parentNode;
                    }
                    if (container) {
                        range.selectNodeContents(container);
                    }
                }

                if (blockquote || container) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // Get the selected content
                    const contentFragment = range.cloneContents();
                    const selectionDiv = document.createElement('div');
                    selectionDiv.appendChild(contentFragment.cloneNode(true));
                    inputText = selectionDiv.innerHTML;
                }
            }

            // Quote mode (inside a blockquote) gets conservative rules;
            // the author's own prose gets the more liberal set
            const isQuote = this.isSelectionInBlockquote();
            console.log("[Transform] Mode:", isQuote ? "quote (conservative)" : "own prose (liberal)");

            // Show working indicator
            this.showWorkingIndicator(isQuote ? 'Transforming quote…' : 'Transforming text…');

            const userSelection = window.getSelection();
            if (!userSelection || userSelection.rangeCount === 0) {
                this.hideWorkingIndicator();
                return { success: false, error: "No valid selection" };
            }

            const selectionRange = userSelection.getRangeAt(0);
            const contentFragment = selectionRange.cloneContents();

            // Create a temporary div to get HTML
            const selectionDiv = document.createElement('div');
            selectionDiv.appendChild(contentFragment.cloneNode(true));
            let processedText = selectionDiv.innerHTML;

            if (!processedText) {
                this.hideWorkingIndicator();
                return { success: false, error: "No content to process" };
            }

            const apiKey = await this.getApiKey('gemini-api-key');
            if (!apiKey) {
                this.hideWorkingIndicator();
                throw new Error("No API key found");
            }

            // Pre-convert numbered lists to HTML BEFORE sending to LLM
            // This ensures the list structure is preserved through LLM transformation
            processedText = this.convertNumberedListsToHtml(processedText);

            const rules = this.buildRules(isQuote);

            const transformedText = await this.api.transformText(processedText, apiKey, rules);

            let processedHtml = transformedText;

            // Normalize line endings first: convert Windows \r\n and old Mac \r to Unix \n
            processedHtml = processedHtml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            // Check if LLM already returned proper HTML list
            const hasHtmlList = processedHtml.includes('<ol>') || processedHtml.includes('<ul>');

            // If no HTML list, check for numbered list pattern and convert
            if (!hasHtmlList) {
                processedHtml = this.convertNumberedListsToHtml(processedHtml);
            }

            // If no HTML paragraph structure, convert paragraph breaks to proper <p> tags
            // But skip if we have an HTML list (it has its own structure)
            if (!processedHtml.includes('<p>') && !processedHtml.includes('<P>') && !processedHtml.includes('<ol>') && !processedHtml.includes('<ul>')) {
                // Split by double newlines (paragraph breaks)
                const paragraphs = processedHtml.split(/\n\n+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0);

                if (paragraphs.length > 0) {
                    // Convert each paragraph, preserving single line breaks as <br>
                    processedHtml = paragraphs
                        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
                        .join('');
                } else {
                    processedHtml = `<p>${processedHtml}</p>`;
                }
            }

            // Insert the transformed content
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);

            // Use execCommand('insertHTML') so ProseMirror's paste handler fires,
            // which correctly converts <ol><li> to native Substack list nodes.
            // IMPORTANT: Do NOT call range.deleteContents() first — that empties the
            // blockquote, ProseMirror removes the now-empty element, and the list is
            // then inserted outside the blockquote. insertHTML replaces the active
            // selection atomically so ProseMirror never sees an empty blockquote.
            const inserted = document.execCommand('insertHTML', false, processedHtml.trim());

            if (!inserted) {
                // Fallback: delete first, then insert via DOM (blockquote may be lost)
                range.deleteContents();
                const outputDiv = document.createElement('div');
                outputDiv.innerHTML = processedHtml.trim();
                const fragment = document.createDocumentFragment();
                Array.from(outputDiv.children).forEach(child => {
                    fragment.appendChild(child.cloneNode(true));
                });
                range.insertNode(fragment);
            }

            // Clean up empty paragraphs at start/end of blockquote (async, non-blocking)
            requestAnimationFrame(() => {
                try {
                    const blockquote = range.commonAncestorContainer.closest?.('blockquote');
                    if (blockquote) {
                        const paragraphs = blockquote.querySelectorAll('p');
                        if (paragraphs.length > 0) {
                            if (!paragraphs[0].textContent.trim()) {
                                paragraphs[0].remove();
                            }
                            if (!paragraphs[paragraphs.length - 1].textContent.trim()) {
                                paragraphs[paragraphs.length - 1].remove();
                            }
                        }
                    }
                } catch (e) { /* ignore cleanup errors */ }
            });

            this.hideWorkingIndicator();
            return { success: true };

        } catch (error) {
            this.hideWorkingIndicator();
            console.error("Transform error:", error);
            window.postMessage({
                type: 'transform-error',
                success: false,
                error: error.message
            }, '*');
            return { success: false, error: error.message };
        }
    }
}

window.transformController = new TransformController();
