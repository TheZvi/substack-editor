// shared/llm/api/base-api.js
class LLMApi {
    constructor(config = {}) {
        this.config = {
            apiVersion: 'v1',
            model: 'default',
            maxRetries: 3,
            ...config
        };
    }

    async transformText(text, apiKey) {
        if (!apiKey) {
            throw new Error('API key is required');
        }

        try {
            // Load rules
            const response = await fetch(chrome.runtime.getURL('shared/llm/api/default-rules.json'));
            const rulesData = await response.json();
            
            const systemPrompt = this._buildTransformationPrompt(text, rulesData.transformationRules);
            return await this._makeTransformationRequest(systemPrompt, apiKey);
        } catch (error) {
            console.error("Text transformation failed:", error);
            throw error;
        }
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

    async makeApiCall(endpoint, payload, options, attempt = 1) {
        try {
            const response = await this._makeRequest(endpoint, payload, options);
            return this._handleResponse(response);
        } catch (error) {
            if (attempt < this.config.maxRetries) {
                console.log(`Attempt ${attempt} failed, retrying...`);
                return this.makeApiCall(endpoint, payload, options, attempt + 1);
            }
            throw new Error(`API call failed after ${attempt} attempts: ${error.message}`);
        }
    }

    // These methods must be implemented by child classes
    async _makeTransformationRequest(prompt, apiKey) {
        throw new Error('_makeTransformationRequest must be implemented by child class');
    }

    async _makeRequest(endpoint, payload, options) {
        throw new Error('_makeRequest must be implemented by child class');
    }

    async _handleResponse(response) {
        throw new Error('_handleResponse must be implemented by child class');
    }
}

window.LLMApi = LLMApi;
console.log("Base LLM API loaded");