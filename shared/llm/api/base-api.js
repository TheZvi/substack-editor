// shared/llm/api/base-api.js
window.LLMApi = class {
    constructor(config = {}) {
        if (new.target === window.LLMApi) {
            throw new Error('LLMApi is an abstract class and cannot be instantiated directly');
        }
        
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 30000,
            ...config
        };
    }

    // Template for API call with retry logic and error handling
    async makeApiCall(endpoint, payload, options = {}) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await this._makeRequest(endpoint, payload, options);
                return await this._handleResponse(response);
            } catch (error) {
                lastError = error;
                if (!this._shouldRetry(error, attempt)) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
            }
        }
        throw new Error(`API call failed after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }

    // Protected methods to be implemented by specific API classes
    async _makeRequest(endpoint, payload, options) {
        throw new Error('_makeRequest must be implemented by subclass');
    }

    async _handleResponse(response) {
        throw new Error('_handleResponse must be implemented by subclass');
    }

    _shouldRetry(error, attempt) {
        // Default retry condition for common transient errors
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        return attempt < this.config.maxRetries && 
               (error.status && retryableStatuses.includes(error.status));
    }

    // Utility methods for API key management
    async _getApiKey() {
        // Temporarily bypass storage and message passing
        const hardcodedKey = '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';
        return hardcodedKey;
    }

    async _setApiKey(apiKey) {
        window.postMessage({ 
            type: 'set-api-key', 
            service: this.constructor.name,
            key: apiKey 
        }, '*');
    }

    // Validation methods
    _validateConfig() {
        const requiredFields = this._getRequiredConfigFields();
        for (const field of requiredFields) {
            if (!this.config[field]) {
                throw new Error(`Missing required configuration field: ${field}`);
            }
        }
    }

    _getRequiredConfigFields() {
        return ['maxRetries', 'retryDelay', 'timeout'];
    }
};

window.LLMApi = LLMApi;
console.log("Base LLM API loaded");