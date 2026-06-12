document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const apiSelect = document.getElementById('api-select');
    const geminiKeyInput = document.getElementById('gemini-key');
    const claudeKeyInput = document.getElementById('claude-key');
    const geminiModelSelect = document.getElementById('gemini-model');
    const claudeModelSelect = document.getElementById('claude-model');
    const geminiSettings = document.getElementById('gemini-settings');
    const claudeSettings = document.getElementById('claude-settings');

    // Load saved settings from both sync and local storage
    const syncSettings = await chrome.storage.sync.get({
        selectedApi: 'gemini',
        geminiKey: '',
        claudeKey: ''
    });

    const localSettings = await chrome.storage.local.get({
        'gemini-api-key': '',
        'claude-api-key': '',
        'gemini-model': 'gemini-3.1-flash-lite',
        'claude-model': 'claude-opus-4-5-20251101'
    });

    // Set initial values
    apiSelect.value = syncSettings.selectedApi;
    geminiKeyInput.value = localSettings['gemini-api-key'] || syncSettings.geminiKey || '';
    claudeKeyInput.value = localSettings['claude-api-key'] || syncSettings.claudeKey || '';
    geminiModelSelect.value = localSettings['gemini-model'] || 'gemini-3.1-flash-lite';
    claudeModelSelect.value = localSettings['claude-model'] || 'claude-opus-4-5-20251101';

    // Show both API settings (both can be used - Claude preferred for doc review)
    geminiSettings.style.display = 'block';
    claudeSettings.style.display = 'block';

    // Show/hide password buttons
    document.querySelectorAll('.show-hide-key').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    });

    // Save settings
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Save to sync storage (for backward compatibility)
        await chrome.storage.sync.set({
            selectedApi: apiSelect.value,
            geminiKey: geminiKeyInput.value,
            claudeKey: claudeKeyInput.value
        });

        // Save to local storage (what the extension actually uses)
        // Trim API keys to prevent whitespace issues from copy/paste
        await chrome.storage.local.set({
            'gemini-api-key': geminiKeyInput.value.trim(),
            'claude-api-key': claudeKeyInput.value.trim(),
            'gemini-model': geminiModelSelect.value,
            'claude-model': claudeModelSelect.value
        });

        alert('Settings saved!');
    });
}); 