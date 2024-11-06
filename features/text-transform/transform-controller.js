// features/text-transform/transform-controller.js

console.log("Transform controller loading"); // todo remove

class TransformController {
    constructor() {
        this.claudeApi = new window.ClaudeApi();
        console.log("Transform controller constructor called"); // todo remove
        
        // Set up message receiver
        window.addEventListener('message', async (event) => {
            // Only accept messages from our own window
            if (event.source !== window) return;
            if (event.data.type !== 'transform-text') return;
            
            console.log("Received transform request"); // todo remove
            await this.handleTransform(event.data.text || window.getSelection().toString());
        });
    }

    async handleTransform(selectedText) {
        if (!selectedText) {
            console.log("No text selected"); // todo remove
            return { success: false, error: "No text selected" };
        }

        try {
            console.log("Starting transformation of text:", selectedText.substring(0, 50) + "..."); // todo remove

            // Get the selected range to preserve formatting
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            
            // Default rules for initial testing
            const defaultRules = [
                {
                    id: "capitalize-proper",
                    name: "Capitalize Proper Nouns",
                    description: "Ensure all proper nouns are properly capitalized",
                    enabled: true
                },
                {
                    id: "expand-abbreviations",
                    name: "Expand Abbreviations",
                    description: "Expand common abbreviations except keep 'US', 'UK', 'EU' as is",
                    enabled: true
                }
            ];

            // Get transformed text from Claude
            const transformedText = await this.claudeApi.transformText(selectedText, defaultRules);
            
            if (!transformedText) {
                throw new Error("No response from Claude API");
            }

            console.log("Received transformed text:", transformedText.substring(0, 50) + "..."); // todo remove

            // Replace the selected text while preserving formatting
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = transformedText;
            
            range.deleteContents();
            range.insertNode(tempDiv);

            // Clean up any wrapper div that might have been inserted
            if (tempDiv.parentNode) {
                while (tempDiv.firstChild) {
                    tempDiv.parentNode.insertBefore(tempDiv.firstChild, tempDiv);
                }
                tempDiv.parentNode.removeChild(tempDiv);
            }

            console.log("Transform complete"); // todo remove
            return { success: true };

        } catch (error) {
            console.error("Transform error:", error); // todo remove
            return { success: false, error: error.message };
        }
    }
}

// Initialize the controller
window.transformController = new TransformController();
console.log("Transform controller loaded"); // todo remove