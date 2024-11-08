// features/text-transform/transform-controller.js

console.log("Transform controller loading"); // todo remove

class TransformController {
    constructor() {
        this.api = new window.GeminiApi();
        this.rules = {
            transformationRules: [
                {
                    "priority": 1,
                    "description": "Fix capitalization of sentences and proper nouns while preserving intentional ALL CAPS"
                },
                {
                    "priority": 2,
                    "description": "Expand common abbreviations (e.g., 'idk' to 'I don't know', 'abr' to 'abbreviation')"
                },
                {
                    "priority": 3,
                    "description": "Remove excessive whitespace and newlines while preserving paragraph breaks"
                },
                {
                    "priority": 4,
                    "description": "Preserve @mentions, hashtags, and URLs exactly as written"
                },
                {
                    "id": "fix-punctuation",
                    "description": "Correct obvious punctuation errors, including proper comma usage",
                    "enabled": true,
                    "priority": 5
                },
                {
                    "id": "clean-mentions",
                    "description": "Remove extra line breaks before and after @mentions",
                    "enabled": true,
                    "priority": 6
                },
                {
                    "id": "format-lists",
                    "description": "Convert informal numbered lists into proper HTML ordered lists",
                    "enabled": true,
                    "priority": 7
                }
            ]
        };
        console.log("Transform controller initialized with API");
        
        window.addEventListener('message', async (event) => {
            if (event.source !== window) return;
            if (event.data.type !== 'transform-text') return;
            
            console.log("Received transform request");
            await this.handleTransform(event.data.text || window.getSelection().toString());
        });
    }

    async getApiKey(type) {
        return new Promise((resolve) => {
            window.postMessage({
                type: 'get-api-key',
                service: type
            }, '*');

            const handler = (event) => {
                if (event.source !== window) return;
                if (event.data.type !== 'api-key-response') return;
                
                window.removeEventListener('message', handler);
                resolve(event.data.key);
            };

            window.addEventListener('message', handler);
        });
    }

    async getRules() {
        return this.rules.transformationRules;
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
            
            // 4. Direct insertion
            console.log("\n4. Direct insertion:");
            console.log("Text to insert:", transformedText);
            
            range.deleteContents();
            range.insertNode(document.createTextNode(transformedText));
            
            // 5. Post-insertion DOM state
            console.log("\n5. Post-insertion DOM:");
            const insertedContent = range.commonAncestorContainer;
            console.log("Inserted content parent:", insertedContent.parentNode);
            console.log("Parent's children:", Array.from(insertedContent.parentNode.childNodes).map(n => ({
                type: n.nodeType,
                name: n.nodeName,
                content: n.textContent
            })));
            
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
