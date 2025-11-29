// content.js - update existing file

console.log("Content script loading"); // todo remove

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   if (request.action === "transformText") {
       // Forward the message to the page context
       window.postMessage({
           type: 'transform-text',
           text: request.text
       }, '*');
       // Acknowledge receipt
       sendResponse({received: true});
   }
   return true; // Indicates we'll send a response asynchronously
});

// Handle communication between page scripts and chrome.storage
window.addEventListener('message', async (event) => {
   console.log("Content script received message:", event.data);
   if (event.source !== window) return;
   
   if (event.data.type === 'get-api-key') {
       const result = await chrome.storage.local.get(null);
       console.log('All stored keys:', Object.keys(result));
       
       const keyMap = {
           'gemini-api-key': 'gemini-api-key',
           'claude-api-key': 'claude-api-key'
       };
       
       const storageKey = keyMap[event.data.service];
       const apiKey = result[storageKey];
       console.log('Retrieving API key for:', event.data.service, 'using storage key:', storageKey);
       
       window.postMessage({
           type: 'api-key-response',
           key: apiKey,
           success: true
       }, '*');
   }
   else if (event.data.type === 'set-api-key') {
       const result = await chrome.storage.local.get('llmApiKeys');
       const llmApiKeys = result.llmApiKeys || {};
       llmApiKeys[event.data.service] = event.data.key;
       await chrome.storage.local.set({ llmApiKeys });
   }
   else if (event.data.type === 'get-gemini-model') {
       const result = await chrome.storage.local.get('gemini-model');
       window.postMessage({
           type: 'gemini-model-response',
           model: result['gemini-model']
       }, '*');
   }
   else if (event.data.type === 'claude-api-request' || event.data.type === 'gemini-api-request') {
       try {
           const response = await chrome.runtime.sendMessage({
               action: event.data.type,
               endpoint: event.data.endpoint,
               payload: event.data.payload,
               options: event.data.options
           });

           window.postMessage({
               type: event.data.type.replace('request', 'response'),
               response: response
           }, '*');
       } catch (error) {
           window.postMessage({
               type: event.data.type.replace('request', 'response'),
               error: error.message
           }, '*');
       }
   }
});

async function loadTransformScripts() {
    try {
        // Load scripts in sequence
        await loadScript('shared/llm/config/api-keys.local.js');
        await loadScript('shared/llm/api/base-api.js');
        await loadScript('shared/llm/api/gemini_api.js');
        await loadScript('shared/llm/api/claude_api.js');
        await loadScript('features/text-transform/transform-controller.js');
    } catch (error) {
        console.error('Error loading transform scripts:', error);
    }
}

function loadScript(path) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(path);
        script.onload = () => resolve();
        script.onerror = (error) => reject(error);
        document.head.appendChild(script);
    });
}

// Call the loading function
loadTransformScripts();

console.log("Content script loaded"); // todo remove