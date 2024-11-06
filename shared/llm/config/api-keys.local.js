// shared/llm/config/api-keys.local.js

window.LLMConfig = {
    validateKey: function(key) {
        // Claude API keys start with 'sk-'
        return typeof key === 'string' && 
               key.startsWith('sk-') && 
               key.length > 10;
    }
};