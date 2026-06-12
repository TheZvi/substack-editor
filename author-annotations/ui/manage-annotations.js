// manage-annotations.js

// Dynamically load CSS
if (!window.cssLoaded) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('author-annotations/ui/manage-annotations.css');
    document.head.appendChild(link);
    window.cssLoaded = true;
}

const STORAGE_KEY = 'authorAnnotations';
const WEBSITE_STORAGE_KEY = 'websiteAnnotations';

// Default website annotations for common news sites
const DEFAULT_WEBSITE_ANNOTATIONS = [
    { domain: 'wsj.com', annotation: 'WSJ' },
    { domain: 'nytimes.com', annotation: 'NYTimes' },
    { domain: 'washingtonpost.com', annotation: 'WaPo' },
    { domain: 'bloomberg.com', annotation: 'Bloomberg' },
    { domain: 'lesswrong.com', annotation: 'LessWrong' },
    { domain: 'bbc.com', annotation: 'BBC' },
    { domain: 'bbc.co.uk', annotation: 'BBC' },
    { domain: 'cnn.com', annotation: 'CNN' },
    { domain: 'msnbc.com', annotation: 'MSNBC' },
    { domain: 'ft.com', annotation: 'FT' },
    { domain: 'foxnews.com', annotation: 'Fox News' },
    { domain: 'latimes.com', annotation: 'LA Times' },
];

document.addEventListener('DOMContentLoaded', async () => {
    await initializeDefaultWebsiteAnnotations();
    await loadAnnotations();
    await loadWebsiteAnnotations();
    setupEventListeners();
    await checkPrefill();
});

async function initializeDefaultWebsiteAnnotations() {
    const existing = await getWebsiteAnnotations();
    if (existing.length === 0) {
        await saveWebsiteAnnotations(DEFAULT_WEBSITE_ANNOTATIONS);
        console.log('[Annotations] Initialized default website annotations');
    }
}

async function getAnnotations() {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}

async function saveAnnotations(annotations) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: annotations });
}

// Website annotations storage
async function getWebsiteAnnotations() {
    const result = await chrome.storage.sync.get(WEBSITE_STORAGE_KEY);
    return result[WEBSITE_STORAGE_KEY] || [];
}

async function saveWebsiteAnnotations(annotations) {
    await chrome.storage.sync.set({ [WEBSITE_STORAGE_KEY]: annotations });
}

async function loadAnnotations() {
    const annotations = await getAnnotations();
    const container = document.getElementById('annotations-list');

    if (annotations.length === 0) {
        container.innerHTML = '<div class="empty-state">No annotations yet. Click "Add Annotation" to create one.</div>';
        return;
    }

    container.innerHTML = annotations.map((ann, index) => {
        const metaParts = [];
        if (ann.nameToShow) metaParts.push(`shows as: ${ann.nameToShow}`);
        if (ann.handleMatch) metaParts.push(`@${ann.handleMatch.replace(/^@/, '')}`);
        if (ann.twitterOnly) metaParts.push('Twitter only');

        return `
            <div class="annotation" data-index="${index}">
                <div class="annotation-content">
                    <strong>${escapeHtml(ann.name)}</strong>
                    <span class="info-tag">${escapeHtml(ann.info)}</span>
                    ${metaParts.length > 0 ? `<div class="meta">${escapeHtml(metaParts.join(' | '))}</div>` : ''}
                </div>
                <div class="annotation-actions">
                    <button class="edit-annotation" data-index="${index}">Edit</button>
                    <button class="delete-annotation" data-index="${index}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadWebsiteAnnotations() {
    const annotations = await getWebsiteAnnotations();
    const container = document.getElementById('website-annotations-list');

    if (annotations.length === 0) {
        container.innerHTML = '<div class="empty-state">No website annotations yet. Click "Add Website" to create one.</div>';
        return;
    }

    container.innerHTML = annotations.map((ann, index) => {
        return `
            <div class="annotation website-annotation" data-index="${index}">
                <div class="annotation-content">
                    <strong>${escapeHtml(ann.domain)}</strong>
                    <span class="info-tag">${escapeHtml(ann.annotation)}</span>
                </div>
                <div class="annotation-actions">
                    <button class="edit-website-annotation" data-index="${index}">Edit</button>
                    <button class="delete-website-annotation" data-index="${index}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function setupEventListeners() {
    // Add button - author annotations
    document.getElementById('add-annotation').addEventListener('click', () => {
        openModal(-1);
    });

    // Modal cancel - author annotations
    document.getElementById('modal-cancel').addEventListener('click', closeModal);

    // Click outside modal to close - author annotations
    document.getElementById('annotation-editor').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Form submit - author annotations
    document.getElementById('annotation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFromForm();
    });

    // Delegation for edit/delete buttons - author annotations
    document.getElementById('annotations-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const index = parseInt(btn.dataset.index, 10);

        if (btn.classList.contains('edit-annotation')) {
            openModal(index);
        } else if (btn.classList.contains('delete-annotation')) {
            if (confirm('Delete this annotation?')) {
                const annotations = await getAnnotations();
                annotations.splice(index, 1);
                await saveAnnotations(annotations);
                await loadAnnotations();
                showStatus('Annotation deleted');
            }
        }
    });

    // Add button - website annotations
    document.getElementById('add-website-annotation').addEventListener('click', () => {
        openWebsiteModal(-1);
    });

    // Modal cancel - website annotations
    document.getElementById('website-modal-cancel').addEventListener('click', closeWebsiteModal);

    // Click outside modal to close - website annotations
    document.getElementById('website-annotation-editor').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeWebsiteModal();
    });

    // Form submit - website annotations
    document.getElementById('website-annotation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveWebsiteFromForm();
    });

    // Delegation for edit/delete buttons - website annotations
    document.getElementById('website-annotations-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const index = parseInt(btn.dataset.index, 10);

        if (btn.classList.contains('edit-website-annotation')) {
            openWebsiteModal(index);
        } else if (btn.classList.contains('delete-website-annotation')) {
            if (confirm('Delete this website annotation?')) {
                const annotations = await getWebsiteAnnotations();
                annotations.splice(index, 1);
                await saveWebsiteAnnotations(annotations);
                await loadWebsiteAnnotations();
                showStatus('Website annotation deleted');
            }
        }
    });

    // Export
    document.getElementById('export-annotations').addEventListener('click', async () => {
        const authorAnnotations = await getAnnotations();
        const websiteAnnotations = await getWebsiteAnnotations();
        const json = JSON.stringify({
            authorAnnotations,
            websiteAnnotations
        }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotations.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('Annotations exported');
    });

    // Import
    document.getElementById('import-annotations').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                let importedCount = 0;

                // Import author annotations
                if (data.authorAnnotations && Array.isArray(data.authorAnnotations)) {
                    // Validate entries
                    for (const ann of data.authorAnnotations) {
                        if (!ann.name || !ann.info) {
                            throw new Error('Each author annotation must have name and info fields');
                        }
                    }

                    const existing = await getAnnotations();
                    const existingNames = new Set(existing.map(a => a.name.toLowerCase()));
                    const newOnes = data.authorAnnotations.filter(a => !existingNames.has(a.name.toLowerCase()));

                    if (newOnes.length > 0) {
                        const merged = [...existing, ...newOnes];
                        await saveAnnotations(merged);
                        await loadAnnotations();
                        importedCount += newOnes.length;
                    }
                }

                // Import website annotations
                if (data.websiteAnnotations && Array.isArray(data.websiteAnnotations)) {
                    // Validate entries
                    for (const ann of data.websiteAnnotations) {
                        if (!ann.domain || !ann.annotation) {
                            throw new Error('Each website annotation must have domain and annotation fields');
                        }
                    }

                    const existing = await getWebsiteAnnotations();
                    const existingDomains = new Set(existing.map(a => a.domain.toLowerCase()));
                    const newOnes = data.websiteAnnotations.filter(a => !existingDomains.has(a.domain.toLowerCase()));

                    if (newOnes.length > 0) {
                        const merged = [...existing, ...newOnes];
                        await saveWebsiteAnnotations(merged);
                        await loadWebsiteAnnotations();
                        importedCount += newOnes.length;
                    }
                }

                if (importedCount === 0) {
                    showStatus('No new annotations to import (all entries already exist)');
                } else {
                    showStatus(`Imported ${importedCount} annotation${importedCount > 1 ? 's' : ''}`);
                }
            } catch (err) {
                showStatus('Import error: ' + err.message, true);
            }
        });
        input.click();
    });
}

async function openModal(editIndex) {
    const modal = document.getElementById('annotation-editor');
    const form = document.getElementById('annotation-form');
    const title = document.getElementById('modal-title');

    form.reset();
    document.getElementById('ann-edit-index').value = editIndex;

    if (editIndex >= 0) {
        title.textContent = 'Edit Annotation';
        const annotations = await getAnnotations();
        const ann = annotations[editIndex];
        if (ann) {
            document.getElementById('ann-name').value = ann.name;
            document.getElementById('ann-name-to-show').value = ann.nameToShow || '';
            document.getElementById('ann-info').value = ann.info;
            document.getElementById('ann-twitter-only').checked = !!ann.twitterOnly;
            document.getElementById('ann-handle').value = ann.handleMatch || '';
        }
    } else {
        title.textContent = 'Add Annotation';
    }

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('annotation-editor').classList.remove('active');
}

// Website annotation modal functions
async function openWebsiteModal(editIndex) {
    const modal = document.getElementById('website-annotation-editor');
    const form = document.getElementById('website-annotation-form');
    const title = document.getElementById('website-modal-title');

    form.reset();
    document.getElementById('website-edit-index').value = editIndex;

    if (editIndex >= 0) {
        title.textContent = 'Edit Website';
        const annotations = await getWebsiteAnnotations();
        const ann = annotations[editIndex];
        if (ann) {
            document.getElementById('website-domain').value = ann.domain;
            document.getElementById('website-annotation').value = ann.annotation;
        }
    } else {
        title.textContent = 'Add Website';
    }

    modal.classList.add('active');
}

function closeWebsiteModal() {
    document.getElementById('website-annotation-editor').classList.remove('active');
}

async function saveWebsiteFromForm() {
    const domain = document.getElementById('website-domain').value.trim().toLowerCase();
    const annotation = document.getElementById('website-annotation').value.trim();
    const editIndex = parseInt(document.getElementById('website-edit-index').value, 10);

    if (!domain || !annotation) {
        showStatus('Domain and annotation text are required', true);
        return;
    }

    // Clean up domain (remove http://, https://, www., trailing slashes)
    const cleanDomain = domain
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');

    const entry = {
        domain: cleanDomain,
        annotation
    };

    const annotations = await getWebsiteAnnotations();

    if (editIndex >= 0) {
        annotations[editIndex] = entry;
    } else {
        annotations.push(entry);
    }

    await saveWebsiteAnnotations(annotations);
    closeWebsiteModal();
    await loadWebsiteAnnotations();
    showStatus(editIndex >= 0 ? 'Website annotation updated' : 'Website annotation added');
}

async function saveFromForm() {
    const name = document.getElementById('ann-name').value.trim();
    const nameToShow = document.getElementById('ann-name-to-show').value.trim();
    const info = document.getElementById('ann-info').value.trim();
    const twitterOnly = document.getElementById('ann-twitter-only').checked;
    const handleMatch = document.getElementById('ann-handle').value.trim().replace(/^@/, '');
    const editIndex = parseInt(document.getElementById('ann-edit-index').value, 10);

    if (!name || !info) {
        showStatus('Name and annotation text are required', true);
        return;
    }

    const entry = {
        name,
        nameToShow: nameToShow || undefined,
        info,
        twitterOnly,
        handleMatch: handleMatch
    };

    const annotations = await getAnnotations();

    if (editIndex >= 0) {
        annotations[editIndex] = entry;
    } else {
        annotations.push(entry);
    }

    await saveAnnotations(annotations);
    closeModal();
    await loadAnnotations();
    showStatus(editIndex >= 0 ? 'Annotation updated' : 'Annotation added');
}

function showStatus(message, isError = false) {
    const el = document.getElementById('status-message');
    el.textContent = message;
    el.className = 'status-message ' + (isError ? 'error' : 'success');
    setTimeout(() => {
        el.className = 'status-message';
    }, 3000);
}

async function checkPrefill() {
    try {
        const result = await chrome.storage.local.get('annotationPrefill');
        const prefill = result.annotationPrefill;
        if (!prefill) return;

        // Only use prefill data less than 10 seconds old
        if (Date.now() - prefill.timestamp > 10000) {
            await chrome.storage.local.remove('annotationPrefill');
            return;
        }

        // Clear the prefill data so it doesn't trigger again
        await chrome.storage.local.remove('annotationPrefill');

        // Open modal and fill in the fields
        openModal(-1);
        if (prefill.name) document.getElementById('ann-name').value = prefill.name;
        if (prefill.handle) document.getElementById('ann-handle').value = prefill.handle;
    } catch (err) {
        console.error('[Annotations] Error checking prefill:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
