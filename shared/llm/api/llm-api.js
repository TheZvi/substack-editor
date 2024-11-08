console.log("Loading LLMApi base class...");

class LLMApi {
    constructor(config = {}) {
        this.config = {
            apiVersion: 'v1',
            model: 'default',
            ...config
        };
    }

    async _getApiKey() {
        try {
            const result = await chrome.storage.local.get([`${this.constructor.name.toLowerCase()}-api-key`]);
            return result[`${this.constructor.name.toLowerCase()}-api-key`];
        } catch (error) {
            console.error('Error getting API key:', error);
            throw new Error('Could not retrieve API key');
        }
    }

    async _loadTransformationRules() {
        const response = await fetch(chrome.runtime.getURL('shared/llm/api/default-rules.json'));
        const rulesData = await response.json();
        return rulesData.transformationRules;
    }

    _buildTransformationPrompt(text, rules) {
        return `You are a text formatting assistant. Apply these transformations in order:
${rules.map(rule => `${rule.priority}. ${rule.description}`).join('\n')}

IMPORTANT CONSTRAINTS:
- Return ONLY the transformed text
- Make no other changes beyond what the rules specify
- Add no explanatory text or comments
- Preserve all HTML formatting exactly

Text to transform:
${text}`;
    }

    async transformText(text) {
        try {
            const apiKey = await this._getApiKey();
            if (!apiKey) {
                throw new Error(`No API key found for ${this.constructor.name}`);
            }

            const rules = await this._loadTransformationRules();
            const prompt = this._buildTransformationPrompt(text, rules);

            // Child classes must implement this
            return await this._makeTransformationRequest(prompt, apiKey);
        } catch (error) {
            console.error("Text transformation failed:", error);
            throw error;
        }
    }

    // Child classes must implement these
    async _makeTransformationRequest(prompt, apiKey) {
        throw new Error('_makeTransformationRequest must be implemented by child class');
    }

    async testConnection() {
        throw new Error('testConnection must be implemented by child class');
    }
}

window.LLMApi = LLMApi;
console.log("LLMApi base class loaded");
console.log("LLMApi class defined:", typeof LLMApi);
console.log("Window.LLMApi:", typeof window.LLMApi); 
console.log("Window.LLMApi:", typeof window.LLMApi); 