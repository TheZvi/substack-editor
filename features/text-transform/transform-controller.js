// features/text-transform/transform-controller.js

console.log("Transform controller loading"); // todo remove

class TransformController {
    constructor() {
        this.api = new window.GeminiApi();
        this.rules = {
            transformationRules: [
                { "priority": 0, "description": "CRITICAL: NEVER MODIFY ANY OF THESE: 1) Never expand 'ASI', 'AGI', 'AI', 'GPT', 'LLM', or 'NLP' into full words 2) Never change single quotes (') to double quotes (\") or vice versa. Leave all quotes exactly as they appear."                 },
                { "priority": 1, "description": "Fix capitalization of sentences and proper nouns while preserving intentional ALL CAPS" },
                { "priority": 2, "description": "Expand all abbreviations and make any other fixes according to the New York Times style guide" },
                { "priority": 3, "description": "Remove excessive whitespace and newlines while preserving paragraph breaks" },
                { "priority": 4, "description": "Preserve hashtags and URLs exactly as written" },
                { "priority": 5, "descirption": "If you know the name an @mention refers to, replace it with that name, otherwise leave it exactly as is."},
                { "priority": 6, "description": "Correct obvious punctuation errors, including proper comma usage" },
                { "priority": 7, "description": "Remove extra line breaks before and after @mentions" },
                { "priority": 8, "description": "Convert informal numbered lists into proper HTML ordered lists" },
                { "priority": 9, "description": "Fix all spelling and grammar errors according to the New York Times style guide, but do not change capitalization of acronyms." }
            ]
        };
        
        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'transform-text') return;
            
            await this.handleTransform(event.data.text || window.getSelection().toString());
        });
    }

    async getRules() {
        return this.rules.transformationRules;
    }

    showWorkingIndicator() {
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
            Transforming text...
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

            // Show working indicator
            this.showWorkingIndicator();

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

            const rules = await this.getRules();

            // Add rule to preserve HTML links
            rules.unshift({
                priority: -1,
                description: "MOST IMPORTANT: Preserve these exactly: 1) All acronyms 'ASI', 'AGI', 'AI', 'GPT', 'LLM', 'NLP' must stay as acronyms 2) All quote marks must stay exactly as they are (don't change ' to \" or vice versa)"
            });

            const transformedText = await this.api.transformText(processedText, apiKey, rules);

            let processedHtml = transformedText;
            if (!processedHtml.includes('<p>')) {
                processedHtml = `<p>${processedHtml}</p>`;
            }

            // Create fragment for insertion
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);

            const outputDiv = document.createElement('div');
            outputDiv.innerHTML = processedHtml.trim();

            // Split text into paragraphs if needed
            if (outputDiv.children.length === 0) {
                const paragraphs = processedHtml.split(/\n\n+/);
                paragraphs.forEach(para => {
                    if (para.trim()) {
                        const p = document.createElement('p');
                        p.textContent = para.trim();
                        outputDiv.appendChild(p);
                    }
                });
            }

            // Move each paragraph to the fragment
            const fragment = document.createDocumentFragment();
            Array.from(outputDiv.children).forEach(child => {
                fragment.appendChild(child.cloneNode(true));
            });

            // Insert the transformed content
            range.deleteContents();
            range.insertNode(fragment);

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

window.transformController = new TransformController();console.log("Transform controller loaded"); // todo remove
