// manage-linkify-rules.js
// Dynamically load CSS if not already loaded
if (!window.cssLoaded) {
    console.log("Attempting to load CSS from:", chrome.runtime.getURL('linkify/ui/manage-linkify-rules.css'));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('linkify/ui/manage-linkify-rules.css');
    document.head.appendChild(link);
    window.cssLoaded = true;
}

console.log("manage-linkify-rules.js loading");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Content Loaded");
    await loadRules();
    console.log("Setting up event listeners...");
    setupEventListeners();
    console.log("Event listeners set up");
});
console.log("manage-linkify-rules.js loaded"); //todo: remove
async function loadRules() {
    const { defaultRules, userRules } = await RuleStorage.getAllRules();
    console.log("Loaded rules:", { defaultRules, userRules });  //todo: remove

    // Split rules into active and disabled
    const activeRules = defaultRules.filter(r => !r.isDisabled);
    const disabledRules = defaultRules.filter(r => r.isDisabled);
    
    // Display rules in appropriate sections
    displayRules('user-rules', userRules);
    displayRules('default-rules', activeRules);
    displayRules('disabled-rules', disabledRules);
    
    // Show/hide disabled section
    const disabledSection = document.getElementById('disabled-section');
    disabledSection.style.display = disabledRules.length > 0 ? 'block' : 'none';
}

function displayRules(containerId, rules) {
    console.log(`Displaying rules for ${containerId}:`, rules);
    console.log("Rules with isDefault flag:", rules.map(r => ({target: r.target, isDefault: r.isDefault})));
    
    const container = document.getElementById(containerId);
    container.innerHTML = rules.map(rule => {
        const isCustomRule = !rule.isDefault;
        console.log(`Rule ${rule.target} is custom: ${isCustomRule}`);
        
        return `
            <div class="rule ${rule.isDisabled ? 'disabled' : ''}" data-target="${rule.target}">
                <div class="rule-content">
                    <strong>${rule.target}</strong> &rarr; ${rule.url}
                </div>
                <div class="rule-actions">
                    <button class="toggle-rule">
                        ${rule.isDisabled ? 'Enable' : 'Disable'}
                    </button>
                    ${isCustomRule ? `<button class="delete-rule">Delete</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function setupEventListeners() {
    console.log("Setting up event listeners");
    
    // Add New Rule button
    const addButton = document.getElementById('add-rule');
    console.log("Found add button:", !!addButton);
    addButton?.addEventListener('click', () => {
        console.log("Add button clicked");
        const modal = document.getElementById('rule-editor');
        console.log("Found modal:", !!modal);
        modal.classList.add('active');
        
        // Clear any previous form data
        const form = modal.querySelector('form');
        form.reset();
    });
 
    // Modal close handling
    document.querySelector('#rule-editor .cancel')?.addEventListener('click', () => {
        const modal = document.getElementById('rule-editor');
        modal.classList.remove('active');
    });
 
    // Form submission
    document.querySelector('#rule-editor form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Form submitted");
        const form = e.target;
        
        const newRule = {
            target: form.target.value.trim(),
            url: form.url.value.trim(),
            matchType: form.caseInsensitive.checked ? 'caseInsensitive' : 'caseSensitive',
            wholeWord: form.wholeWord.checked,
            hoverText: form.hoverText.value.trim() || null,
            maxInstances: null,
            newTab: true
        };
        console.log("New rule:", newRule);

        if (!newRule.target || !newRule.url) {
            alert('Text to match and URL are required');
            return;
        }

        try {
            await RuleStorage.addUserRule(newRule);
            const modal = document.getElementById('rule-editor');
            modal.classList.remove('active');
            await loadRules();  // Refresh the display
        } catch (error) {
            console.error('Error adding rule:', error);
            alert('Error adding rule: ' + error.message);
        }
    });

    // Rule list event delegation for edit/delete/toggle buttons
    // Rule list event delegation for edit/delete/toggle buttons
document.querySelectorAll('.rules-list').forEach(list => {
    list.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const rule = button.closest('.rule');
        if (!rule) return;

        if (button.classList.contains('edit-rule')) {
            console.log('Edit rule clicked for', rule.dataset.target);
            // TODO: Implement edit
        } else if (button.classList.contains('toggle-rule')) {
            const target = rule.dataset.target;
            const isDisabling = button.textContent.trim() === 'Disable';
            
            // Update storage
            await RuleStorage.toggleRule(target, isDisabling);
            
            // Reload rules display
            await loadRules();
        } else if (button.classList.contains('delete-rule')) {
            // Prevent multiple handler calls
            if (button.dataset.processing) return;
            button.dataset.processing = 'true';
            
            console.log('Delete rule clicked for', rule.dataset.target);
            const target = rule.dataset.target;
            
            try {
                // Find all rules with this target
                const userRules = await RuleStorage.getUserRules();
                const matchingRules = userRules.filter(r => r.target === target);
                
                if (matchingRules.length > 1) {
                    const choice = confirm(`Found ${matchingRules.length} identical rules for "${target}". \n\n` +
                        `Click OK to delete all instances\n` +
                        `Click Cancel to keep one and delete the rest`);
                        
                    if (choice) {
                        // Delete all
                        await RuleStorage.deleteUserRule(target);
                    } else {
                        // Keep one, delete others
                        const keptRule = matchingRules[0];
                        const newRules = userRules.filter(r => 
                            r.target !== target || r === matchingRules[0]
                        );
                        await chrome.storage.sync.set({ userRules: newRules });
                    }
                } else {
                    // Single rule - normal delete confirmation
                    if (confirm(`Are you sure you want to delete the rule for "${target}"?`)) {
                        await RuleStorage.deleteUserRule(target);
                    }
                }
                await loadRules();  // Refresh the display
            } catch (error) {
                console.error('Error managing rules:', error);
                alert('Error managing rules: ' + error.message);
            } finally {
                delete button.dataset.processing;
            }
        }
    });
});

    // Export button
    document.getElementById('export-all')?.addEventListener('click', async () => {
        // Prevent double-execution
        if (this.exporting) return;
        this.exporting = true;
        
        console.log('Export clicked');
        try {
            const allRules = await RuleStorage.exportAllRules();
            
            // Create blob and trigger download
            const blob = new Blob([allRules], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'linkify-rules.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showStatus('Rules exported successfully');
        } catch (error) {
            console.error('Error exporting rules:', error);
            showStatus('Error exporting rules: ' + error.message, true);
        } finally {
            this.exporting = false;
        }
    });

    // Import button
document.getElementById('import-rules')?.addEventListener('click', async () => {
    console.log('Import clicked');
    // Prevent double-execution
    if (this.importing) return;
    this.importing = true;
    
    // Create file input if it doesn't exist
    let fileInput = document.getElementById('rule-file-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.id = 'rule-file-input';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        
        // Add the file handler
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                // Validate format
                if (!data.linkRules || !Array.isArray(data.linkRules)) {
                    throw new Error('Invalid file format - must contain linkRules array');
                }
                
                // Get current rules
                const { userRules = [] } = await chrome.storage.sync.get('userRules');      
                const defaultRulesResponse = await fetch(chrome.runtime.getURL('linkify/default-rules.json'));
                const defaultRulesData = await defaultRulesResponse.json();
                const defaultRules = defaultRulesData.linkRules;

                // Add new rules (checking against both default and user rules)
                const newRules = data.linkRules.filter(rule =>  
                    !userRules.some(ur => ur.target === rule.target) &&
                    !defaultRules.some(dr => dr.target === rule.target)
);
                
                if (newRules.length === 0) {
                    showStatus('No new rules to import');
                    return;
                }
                
                // Confirm import
                if (confirm(`Import ${newRules.length} new rules?`)) {
                    await chrome.storage.sync.set({
                        userRules: [...userRules, ...newRules]
                    });
                    await loadRules();  // Refresh display
                    showStatus(`Imported ${newRules.length} rules successfully`);
                }
            } catch (error) {
                console.error('Error importing rules:', error);
                showStatus('Error importing rules: ' + error.message, true);
            }
            
            // Clear the input so the same file can be selected again
            fileInput.value = '';
        });
    }
    
    // Trigger file selection
    fileInput.click();
});
}
