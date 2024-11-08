// features/text-transform/transform-controller.js

console.log("Transform controller loading"); // todo remove

class TransformController {
    constructor() {
        this.api = new window.GeminiApi();
        this.rules = {
            transformationRules: [
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

    async handleTransform(selectedText) {
        if (!selectedText) {
            console.log("No text selected");
            return { success: false, error: "No text selected" };
        }

        try {
            console.log("\n=== Text Transformation ===");
            console.log("Input:", selectedText);
            
            console.log("Getting API key...");
            const apiKey = await this.getApiKey('gemini-api-key');
            if (!apiKey) {
                throw new Error("No API key found");
            }
            console.log("API key received");

            console.log("Getting transformation rules...");
            const rules = await this.getRules();
            console.log("Rules received:", rules);

            console.log("Calling API for transformation...");
            const transformedText = await this.api.transformText(selectedText, apiKey, rules);
            
            console.log("Output:", transformedText);
            console.log("=====================\n");

            console.log("Raw transformed text:", JSON.stringify(transformedText));
            console.log("After initial trim:", JSON.stringify(transformedText.trim()));
            
            // 1. Initial text state
            console.log("=== Source Analysis ===");
            console.log("1. Original selection:", JSON.stringify(selectedText));
            
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
            // Split on double newlines to preserve paragraphs
            const paragraphs = transformedText.trim().split(/\n\s*\n/);
            console.log("\n4. Fragment Creation:");
            console.log("Split paragraphs:", paragraphs);
            
            const fragment = document.createDocumentFragment();
            paragraphs.forEach(para => {
                if (para.trim()) {  // Only process non-empty paragraphs
                    const p = document.createElement('p');
                    p.textContent = para.trim();
                    fragment.appendChild(p);
                }
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
