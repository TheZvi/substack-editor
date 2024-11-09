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

    async getApiKey(type) {
        return new Promise((resolve, reject) => {
            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('API key request timed out'));
            }, 5000); // 5 second timeout

            const handler = (event) => {
                if (event.source !== window) return;
                if (event.data.type !== 'api-key-response') return;
                
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
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

                // Find the nearest blockquote or paragraph
                while (container && !['BLOCKQUOTE', 'P'].includes(container.nodeName)) {
                    container = container.parentNode;
                }

                if (container) {
                    range.selectNodeContents(container);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // Get the selected content
                    const contentFragment = range.cloneContents();
                    const selectionDiv = document.createElement('div');
                    selectionDiv.appendChild(contentFragment.cloneNode(true));
                    inputText = selectionDiv.innerHTML;
                }
            }

            console.log("Starting handleTransform with:", {
                hasInputText: !!inputText,
                inputTextType: typeof inputText
            });

            const userSelection = window.getSelection();
            console.log("Selection:", {
                hasSelection: !!userSelection,
                rangeCount: userSelection?.rangeCount
            });

            if (!userSelection || userSelection.rangeCount === 0) {
                console.log("No valid selection found");
                return { success: false, error: "No valid selection" };
            }

            const selectionRange = userSelection.getRangeAt(0);
            const contentFragment = selectionRange.cloneContents();
            
            // Create a temporary div to get HTML
            const selectionDiv = document.createElement('div');
            selectionDiv.appendChild(contentFragment.cloneNode(true));
            let processedText = selectionDiv.innerHTML;

            console.log("Content Fragment:", {
                hasFragment: !!contentFragment,
                nodeType: contentFragment?.nodeType,
                childNodes: contentFragment?.childNodes?.length,
                innerHTML: contentFragment?.innerHTML,
                selectionDivHTML: selectionDiv.innerHTML
            });

            if (!processedText) {
                console.log("No content found in selection or input");
                return { success: false, error: "No content to process" };
            }

            console.log("LINK CHECK 1 - Selection:", {
                hasProcessedText: !!processedText,
                processedTextType: typeof processedText,
                rawText: processedText,
                hasHTML: processedText?.includes('<'),
                links: Array.from(contentFragment.querySelectorAll('a')).map(a => ({
                    text: a.textContent,
                    href: a.href,
                    fullHTML: a.outerHTML
                }))
            });

            console.log("Initial text with HTML:", {
                text: processedText,
                html: window.getSelection().getRangeAt(0).cloneContents().innerHTML
            });

            console.log("\n=== Text Transformation ===");
            console.log("Input:", processedText);
            
            console.log("Getting API key...");
            const apiKey = await this.getApiKey('gemini-api-key');
            if (!apiKey) {
                throw new Error("No API key found");
            }
            console.log("API key received");

            console.log("Getting transformation rules...");
            const rules = await this.getRules();
            console.log("Rules received:", rules);

            // Add rule to preserve HTML links
            rules.unshift({ 
                priority: -1,  // Even higher priority
                description: "MOST IMPORTANT: Preserve these exactly: 1) All acronyms 'ASI', 'AGI', 'AI', 'GPT', 'LLM', 'NLP' must stay as acronyms 2) All quote marks must stay exactly as they are (don't change ' to \" or vice versa)"
            });

            console.log("LINK CHECK 2 - Pre-Gemini:", {
                textToSend: processedText,
                hasLinks: processedText.includes('<a'),
                linkElements: processedText.match(/<a[^>]*>.*?<\/a>/g)
            });

            console.log("Sending to Gemini:", {
                text: processedText,
                containsLinks: processedText.includes('href='),
                htmlTags: processedText.match(/<[^>]+>/g)
            });

            console.log("Calling API for transformation...");
            const transformedText = await this.api.transformText(processedText, apiKey, rules);
            
            let processedHtml = transformedText;
            if (!processedHtml.includes('<p>')) {
                // If we don't have paragraph tags, wrap the text
                processedHtml = `<p>${processedHtml}</p>`;
            }

            console.log("LINK CHECK 3 - Post-Gemini:", {
                transformedText: processedHtml,
                hasLinks: processedHtml.includes('<a'),
                linkElements: processedHtml.match(/<a[^>]*>.*?<\/a>/g)
            });
            
            console.log("Received from Gemini:", {
                text: processedHtml,
                containsLinks: processedHtml.includes('href='),
                htmlTags: processedHtml.match(/<[^>]+>/g)
            });

            console.log("Output:", transformedText);
            console.log("=====================\n");

            console.log("Raw transformed text:", JSON.stringify(transformedText));
            console.log("After initial trim:", JSON.stringify(transformedText.trim()));
            
            // 1. Initial text state
            console.log("=== Source Analysis ===");
            console.log("1. Original selection:", JSON.stringify(processedText));
            
            // 2. After Gemini transformation
            console.log("\n2. Gemini Output:");
            console.log("Raw response:", JSON.stringify(transformedText));
            console.log("After trim:", JSON.stringify(transformedText.trim()));
            
            // 3. DOM state before modification
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            console.log("\n3. DOM Before Change:");
            console.log("Start container:", range.startContainer);
            console.log("Start container parent:", range.startContainer.parentNode);
            console.log("End container:", range.endContainer);
            console.log("Common ancestor:", range.commonAncestorContainer);
            
            // 4. Fragment creation
            // Create a temporary div to parse the HTML
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
            
            // 5. Just before insertion
            console.log("\n5. Pre-insertion:");
            console.log("Fragment node count:", fragment.childNodes.length);
            console.log("Fragment nodes:", Array.from(fragment.childNodes).map(n => ({
                type: n.nodeType,
                name: n.nodeName,
                content: n.textContent
            })));
            
            // 6. Insertion
            range.deleteContents();
            range.insertNode(fragment);
            
            // Clean up empty paragraphs at start/end of blockquote
            setTimeout(() => {
                const blockquote = range.commonAncestorContainer.closest('blockquote');
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
            }, 200);
            
            return { success: true };

        } catch (error) {
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
