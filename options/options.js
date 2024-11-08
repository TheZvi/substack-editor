document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const apiSelect = document.getElementById('api-select');
    const apiKeyInput = document.getElementById('api-key');

    // Load saved settings
    const settings = await chrome.storage.sync.get({
        selectedApi: 'gemini',
        geminiKey: '',
        claudeKey: ''
    });

    // Set initial values
    apiSelect.value = settings.selectedApi;
    apiKeyInput.value = settings.selectedApi === 'gemini' ? settings.geminiKey : settings.claudeKey;

    // Show/hide password
    document.querySelector('.show-hide-key').addEventListener('click', () => {
        apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
    });

    // Save settings
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedApi = apiSelect.value;
        const apiKey = apiKeyInput.value;

        const saveData = {
            selectedApi
        };
        saveData[selectedApi === 'gemini' ? 'geminiKey' : 'claudeKey'] = apiKey;

        await chrome.storage.sync.set(saveData);
        alert('Settings saved!');
    });
}); 