console.log("Starting to load GeminiApi...");

class GeminiApi extends LLMApi {
    constructor(config = {}) {
        super({
            apiVersion: 'v1',
            model: 'gemini-1.5-flash-8b',
            ...config
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

        console.log("Making Gemini API request with prompt:", prompt);

        // Make the API request
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-8b:generateContent?key=${apiKey}`, {
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

        console.log("Sending request to Gemini...");
        
        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Received response from Gemini");
        console.log("Processing Gemini response:", data);

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