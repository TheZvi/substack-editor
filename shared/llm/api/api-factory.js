class LLMApiFactory {
    static create(type = 'gemini') {
        switch (type.toLowerCase()) {
            case 'claude':
                return new ClaudeApi();
            case 'gemini':
                return new GeminiApi();
            default:
                throw new Error(`Unknown API type: ${type}`);
        }
    }
}

window.LLMApiFactory = LLMApiFactory; 