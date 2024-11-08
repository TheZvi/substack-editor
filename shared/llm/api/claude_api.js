class ClaudeApi extends LLMApi {
    constructor(config = {}) {
        super({
            apiVersion: 'v1',
            model: 'claude-3-opus-20240229',
            ...config
        });
    }

    async _makeTransformationRequest(prompt, apiKey) {
        const endpoint = 'https://api.anthropic.com/v1/messages';
        
        const payload = {
            model: this.config.model,
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }],
            temperature: 0.1
        };

        const options = {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        };

        return this.makeApiCall(endpoint, payload, options);
    }

    async _makeRequest(endpoint, payload, options) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: options.headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return response.json();
    }

    _handleResponse(response) {
        if (!response.content || !response.content[0]?.text) {
            throw new Error('Invalid response format from Claude API');
        }
        return response.content[0].text;
    }
}

window.ClaudeApi = ClaudeApi;
console.log("Claude API loaded"); 