console.log("Starting to load GeminiApi...");

class GeminiApi extends LLMApi {
    constructor(config = {}) {
        super({
            apiVersion: 'v1',
            model: 'gemini-pro',
            ...config
        });
    }

    async transformText(text, apiKey, rules) {
        if (!apiKey) {
            throw new Error('API key is required');
        }
        if (!rules) {
            throw new Error('Transformation rules are required');
        }

        try {
            const systemPrompt = this._buildTransformationPrompt(text, rules);
            return await this._makeTransformationRequest(systemPrompt, apiKey);
        } catch (error) {
            console.error("Text transformation failed:", error);
            throw error;
        }
    }

    _buildTransformationPrompt(text, rules) {
        const rulesText = rules
            .map(rule => `${rule.priority}. ${rule.description}`)
            .join('\n');

        return `
Please transform the following text according to these rules:
${rulesText}

Text to transform:
${text}

Return the transformed text directly without any additional commentary or labels.`;
    }

    async _makeTransformationRequest(prompt, apiKey) {
        console.log("Making Gemini API request with prompt:", prompt);
        const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                topK: 1,
                topP: 1
            }
        };

        const options = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const response = await this.makeApiCall(endpoint, payload, options);
        return response.trim();
    }

    async _makeRequest(endpoint, payload, options) {
        console.log("Sending request to Gemini...");
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: options.headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API error:", errorText);
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        console.log("Received response from Gemini");
        return response.json();
    }

    _handleResponse(response) {
        console.log("Processing Gemini response:", response);
        
        if (!response.candidates || !response.candidates[0]?.content?.parts?.[0]?.text) {
            console.error("Invalid response format:", response);
            throw new Error('Invalid response format from Gemini API');
        }
        
        const transformedText = response.candidates[0].content.parts[0].text;
        console.log("Successfully extracted transformed text");
        return transformedText;
    }

    async testConnection() {
        return this.transformText("This is a test of the Gemini API connection.");
    }
}

window.GeminiApi = GeminiApi;
console.log("Gemini API loaded"); 