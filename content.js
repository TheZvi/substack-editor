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
   console.log("Content script received message:", event.data); // todo remove
   if (event.source !== window) return;
   
   if (event.data.type === 'get-api-key') {
       const result = await chrome.storage.local.get('llmApiKeys');
       window.postMessage({
           type: 'api-key-response',
           key: result.llmApiKeys?.[event.data.service]
       }, '*');
       console.log('Retrieving API key for:', event.data.service); // todo remove
   }
   else if (event.data.type === 'set-api-key') {
       const result = await chrome.storage.local.get('llmApiKeys');
       const llmApiKeys = result.llmApiKeys || {};
       llmApiKeys[event.data.service] = event.data.key;
       await chrome.storage.local.set({ llmApiKeys });
   }
   else if (event.data.type === 'claude-api-request') {
       try {
           console.log("Forwarding API request to background"); // todo remove
           const response = await chrome.runtime.sendMessage({
               action: 'claude-api-request',
               endpoint: event.data.endpoint,
               payload: event.data.payload,
               options: event.data.options
           });
           console.log("Got response from background:", response); // todo remove
           window.postMessage({
               type: 'claude-api-response',
               response: response || { success: false, error: 'No response from background' }
           }, '*');
       } catch (error) {
           console.error("Error in content script:", error); // todo remove
           window.postMessage({
               type: 'claude-api-response',
               response: { success: false, error: error.message || 'Error in content script' }
           }, '*');
       }
   }
});

function loadTransformScripts() {
   console.log("Loading transform scripts"); // todo remove
   
   // Load config first
   const configScript = document.createElement('script');
   configScript.src = chrome.runtime.getURL('shared/llm/config/api-keys.local.js');
   document.head.appendChild(configScript);

   // Then load base API
   configScript.onload = () => {
       console.log("Config loaded, loading base API"); // todo remove
       const baseApiScript = document.createElement('script');
       baseApiScript.src = chrome.runtime.getURL('shared/llm/api/base-api.js');
       document.head.appendChild(baseApiScript);

       // Load Claude API after base API
       baseApiScript.onload = () => {
           console.log("Base API loaded, loading Claude API"); // todo remove
           const claudeApiScript = document.createElement('script');
           claudeApiScript.src = chrome.runtime.getURL('shared/llm/api/claude-api.js');
           document.head.appendChild(claudeApiScript);

           // Load transform controller after APIs
           claudeApiScript.onload = () => {
               console.log("Claude API loaded, loading transform controller"); // todo remove
               const transformScript = document.createElement('script');
               transformScript.src = chrome.runtime.getURL('features/text-transform/transform-controller.js');
               document.head.appendChild(transformScript);
           };
       };
   };
}

// Call the loading function
loadTransformScripts();

console.log("Content script loaded"); // todo remove