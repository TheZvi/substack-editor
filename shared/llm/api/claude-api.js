// shared/llm/api/claude-api.js

class ClaudeApi extends LLMApi {
    constructor(config = {}) {
        console.log("ClaudeApi constructor"); // todo remove
        super({
            apiVersion: '2024-01-01',
            model: 'claude-3-haiku',
            ...config
        });
    }

    async transformText(text, rules = [], customInstructions = '') {
        const apiKey = await this._getApiKey();
        console.log("Raw API key (first 10 chars):", JSON.stringify(apiKey.substring(0, 10)));

        // Clean the key immediately after getting it
        const cleanKey = apiKey.replace(/^["']|["']$/g, '').trim();
        console.log("Key after initial cleaning:", cleanKey.substring(0, 10));

        if (!cleanKey) {
            throw new Error('Claude API key not found');
        }

        console.log("Using API key:", cleanKey.substring(0, 5) + "..." + cleanKey.substring(cleanKey.length - 4)); // todo remove

        // Construct system prompt based on rules
        const systemPrompt = this._buildSystemPrompt(rules);
        
        const messages = [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: `Transform the following text while preserving all HTML formatting, especially links. Apply only the transformations specified in the system prompt:\n\n${text}`
            }
        ];

        if (customInstructions) {
            messages.push({
                role: 'user',
                content: `Additional instructions: ${customInstructions}`
            });
        }

        const options = {
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': this.config.apiVersion,
                Authorization: 'Bearer ' + apiKey.replace(/['"]/g, '').trim()
            }
        };

        console.log("Raw header value:", options.headers.Authorization);
        
        console.log("Headers being sent from claude-api.js:", options.headers);
        
        const payload = {
            model: this.config.model,
            messages: messages,
            max_tokens: 4000
        };

        return this.makeApiCall('https://api.anthropic.com/v1/messages', payload, options);
    }

    async _makeRequest(endpoint, payload, options) {
        return new Promise((resolve, reject) => {
            window.postMessage({
                type: 'claude-api-request',
                endpoint,
                payload,
                options
            }, '*');

            const handler = (event) => {
                if (event.source !== window) return;
                if (event.data.type !== 'claude-api-response') return;
                window.removeEventListener('message', handler);
                
                console.log("Received API response in claude-api.js:", event.data); // todo remove
                
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data.response);
                }
            };
            window.addEventListener('message', handler);
        });
    }

    async _handleResponse(response) {
        console.log("Handling response in claude-api.js:", response); // todo remove
        if (!response.success) {
            throw new Error(response.error);
        }
        return response.data.content[0].text;
    }

    _buildSystemPrompt(rules) {
        const enabledRules = rules.filter(rule => rule.enabled);
        const ruleInstructions = enabledRules
            .map(rule => `- ${rule.description}`)
            .join('\n');

        return `You are a text formatting assistant. Apply these transformations:
${ruleInstructions}

CONTENT TRANSFORMATIONS TO APPLY:
${ruleInstructions}

FORMATTING CONSTRAINTS:
1. Preserve all HTML formatting, especially <a> tags and their attributes
2. Never add explanatory text or comments
3. Return exactly one transformed version with no alternatives or explanations

PRECEDENCE RULES:
1. HTML preservation takes absolute precedence - never modify HTML tags or attributes
2. Content transformation rules (listed above) can modify any text content including whitespace and line breaks
3. If transformation rules conflict with each other, apply them in the order listed

Begin your response with the transformed text with no preamble.`;
    }
}

window.ClaudeApi = ClaudeApi;
console.log("Claude API loaded");