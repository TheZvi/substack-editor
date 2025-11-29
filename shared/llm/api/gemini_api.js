console.log("Starting to load GeminiApi...");

// Default model - can be overridden via chrome.storage
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

class GeminiApi extends LLMApi {
    constructor(config = {}) {
        super({
            apiVersion: 'v1beta',
            model: config.model || DEFAULT_GEMINI_MODEL,
            ...config
        });
    }

    async getModel() {
        // Always fetch fresh from storage - model can change between calls
        return new Promise((resolve) => {
            window.postMessage({ type: 'get-gemini-model' }, '*');

            let resolved = false;
            const handler = (event) => {
                if (event.source !== window) return;
                if (event.data.type !== 'gemini-model-response') return;
                if (resolved) return;
                resolved = true;
                window.removeEventListener('message', handler);
                resolve(event.data.model || this.config.model);
            };

            window.addEventListener('message', handler);

            // Short timeout - local message should be fast
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                window.removeEventListener('message', handler);
                resolve(this.config.model);
            }, 100);
        });
    }

    async transformText(text, apiKey, rules) {
        // Store original quotes and acronyms before transformation
        const acronyms = [];
        text.replace(/\b(ASI|AGI|AI|GPT|LLM|NLP)\b/g, (match, p1, offset) => {
            acronyms.push({ text: p1, offset });
            return p1;
        });

        // More robust quote tracking
        const quotes = [];
        let currentIndex = 0;
        const quoteRegex = /(['"])((?:[^'"\\]|\\.)*?)\1/g;
        let match;

        while ((match = quoteRegex.exec(text)) !== null) {
            quotes.push({
                fullMatch: match[0],
                quote: match[1],
                content: match[2],
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }

        // Create the prompt
        const prompt = `Transform the following text according to these rules:
${rules.map(rule => `${rule.priority}. ${rule.description}`).join('\n')}

Text to transform:
${text}

Return the transformed text directly without any additional commentary or labels.`;

        // Get the model (user-configured or default)
        const model = await this.getModel();

        // Make the API request
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        let transformed = data?.candidates?.[0]?.content?.parts?.[0]?.text || text;

        // Restore acronyms
        acronyms.forEach(({text}) => {
            transformed = transformed.replace(
                new RegExp(`(artificial superintelligence|artificial general intelligence|artificial intelligence|generative pre-trained transformer|large language model|natural language processing)`, 'gi'),
                text
            );
        });

        // More precise quote restoration
        quotes.forEach(({fullMatch, quote, content}) => {
            // Escape special regex characters in content
            const escapedContent = content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const quotePattern = new RegExp(`["'](${escapedContent})["']`, 'g');
            transformed = transformed.replace(quotePattern, `${quote}${content}${quote}`);
        });

        console.log("Successfully extracted transformed text");
        return transformed;
    }
}

window.GeminiApi = GeminiApi;
console.log("Gemini API loaded"); 