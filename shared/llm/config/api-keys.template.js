// shared/llm/config/api-keys.template.js

// This is a template file. Create api-keys.local.js with your actual keys.
window.LLMConfig = {
    // Optional default key for development/testing
    defaultApiKey: 'your-api-key-here',
    
    // Function to validate key format
    validateKey: function(key) {
        // Claude API keys start with 'sk-'
        return typeof key === 'string' && 
               key.startsWith('sk-') && 
               key.length > 10;
    }
};