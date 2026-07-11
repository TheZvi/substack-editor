// coverage/sidepanel.js
// Side panel UI for the "Have I covered this?" feature. Shows analysis
// progress and, when a highlighted paragraph is clicked (or text selected)
// on the page, the matching prior coverage from the local covered server.

let currentTabId = null;
let lastMatches = []; // matches currently rendered (for section expand etc.)

const $ = (id) => document.getElementById(id);

function esc(s) {
    return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ------------------------------------------------------------------
// Background API proxy
// ------------------------------------------------------------------

function api(path, method, body) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'covered-api', path, method, body }, (resp) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!resp || !resp.success) {
                const err = new Error((resp && resp.error) || 'Unknown covered-api error');
                err.connectionFailed = !!(resp && resp.connectionFailed);
                return reject(err);
            }
            resolve(resp.data);
        });
    });
}

// ------------------------------------------------------------------
// Status / notices
// ------------------------------------------------------------------

async function loadIndexStatus() {
    try {
        const s = await api('/api/status', 'GET');
        const mode = s.vectors ? `hybrid · ${s.model}` : 'keyword-only';
        $('index-status').textContent =
            `${s.posts.toLocaleString()} posts · ${s.chunks.toLocaleString()} chunks · ${mode}`;
        hideNotice();
    } catch (e) {
        $('index-status').textContent = 'server not reachable';
        showNotice(e.connectionFailed
            ? 'The covered server isn’t running. Start it with <code>python covered_web.py</code> in the writing folder, then hit Analyze.'
            : `Server error: ${esc(e.message)}`);
    }
}

function showNotice(html) {
    const n = $('notice');
    n.innerHTML = html;
    n.hidden = false;
}
function hideNotice() { $('notice').hidden = true; }

function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 1200);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('copied'),
        () => toast('copy failed'));
}

// ------------------------------------------------------------------
// Progress & summary
// ------------------------------------------------------------------

function renderProgress(msg) {
    const running = msg.done < msg.total;
    $('progress').hidden = !running;
    $('analyze').disabled = running;
    $('analyze').textContent = running ? 'Analyzing…' : 'Analyze page';
    if (msg.total > 0) {
        $('progress-bar').style.width = `${Math.round(100 * msg.done / msg.total)}%`;
    }
    const c = msg.counts || {};
    const adjacent = (c['context'] || 0) + (c['keyword-match'] || 0);
    const parts = [];
    if (c['new']) parts.push(`<b class="new">${c['new']} new</b>`);
    if (adjacent) parts.push(`<b class="context">${adjacent} adjacent</b>`);
    if (c['covered']) parts.push(`<b class="covered">${c['covered']} covered</b>`);
    const head = running ? `${msg.done}/${msg.total} paragraphs · ` :
        (msg.total ? `${msg.total} paragraphs · ` : '');
    $('summary').innerHTML = msg.total ? head + (parts.join(' · ') || 'nothing yet') : '';
}

// ------------------------------------------------------------------
// Matches rendering (mirrors the webui's resultHtml)
// ------------------------------------------------------------------

function resultHtml(r, i) {
    const score = (r.similarity !== null && r.similarity !== undefined)
        ? r.similarity.toFixed(2) : '·';
    const section = r.section
        ? `<button class="section-link" data-act="section" data-i="${i}">§ ${esc(r.section)}</button>`
        : '';
    return `<div class="result" data-i="${i}">
        <div class="top">
            <span class="score">${score}</span>
            <a class="title" href="${esc(r.anchor_url)}" target="_blank" rel="noopener">${esc(r.post.title)}</a>
            <span class="date">${esc(r.post.date || '')}</span>
            ${section}
        </div>
        <div class="snippet">${esc(r.snippet)}…</div>
        <div class="actions">
            <button data-act="cite" data-i="${i}">copy cite</button>
            <button data-act="link" data-i="${i}">copy link</button>
        </div>
        <div class="fulltext"></div>
    </div>`;
}

function renderMatches(matches, emptyMessage) {
    lastMatches = matches || [];
    const box = $('matches');
    if (!lastMatches.length) {
        box.innerHTML = `<p class="muted hint">${esc(emptyMessage || 'No matches.')}</p>`;
        return;
    }
    box.innerHTML = lastMatches.map(resultHtml).join('');
    window.scrollTo({ top: 0 });
}

$('matches').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const r = lastMatches[Number(btn.dataset.i)];
    if (!r) return;
    if (btn.dataset.act === 'cite') copyText(r.citation_md);
    else if (btn.dataset.act === 'link') copyText(r.anchor_url);
    else if (btn.dataset.act === 'section') {
        const box = btn.closest('.result').querySelector('.fulltext');
        if (box.style.display === 'block') { box.style.display = 'none'; return; }
        box.textContent = 'loading…';
        box.style.display = 'block';
        try {
            const s = await api(`/api/section?slug=${encodeURIComponent(r.post.slug)}&name=${encodeURIComponent(r.section)}`, 'GET');
            box.textContent = s.text;
        } catch (err) {
            box.textContent = 'could not load section';
        }
    }
});

// ------------------------------------------------------------------
// Paragraph context box
// ------------------------------------------------------------------

const STATUS_LABEL = { 'keyword-match': 'matches', 'context': 'context' };

function renderParagraph(msg) {
    const ctx = $('context');
    ctx.hidden = false;
    // "context" the status collides with the container's own class name
    const statusClass = msg.status === 'context' ? 'context-status' : msg.status;
    ctx.className = `context ${statusClass}`;
    const tag = $('context-tag');
    tag.className = `tag ${msg.status}`;
    tag.textContent = (STATUS_LABEL[msg.status] || msg.status) + (msg.verified ? ' ✓' : '');
    $('context-label').textContent = msg.matches.length ? `${msg.matches.length} matches` : '';
    const t = msg.text || '';
    $('context-text').textContent = t.length > 260 ? t.slice(0, 260) + '…' : t;
    const v = $('context-verdict');
    if (msg.verdict_reason || msg.verdict_quote) {
        v.hidden = false;
        v.innerHTML = esc(msg.verdict_reason || '') + (msg.verdict_quote
            ? ` <span class="quote">— “${esc(msg.verdict_quote.slice(0, 180))}”</span>` : '');
    } else {
        v.hidden = true;
    }
    renderMatches(msg.matches, 'No matches for this paragraph.');
}

// ------------------------------------------------------------------
// Selection search
// ------------------------------------------------------------------

let selectionSeq = 0;
async function searchSelection(text) {
    const seq = ++selectionSeq;
    const ctx = $('context');
    ctx.hidden = false;
    ctx.className = 'context';
    $('context-tag').className = 'tag';
    $('context-tag').textContent = 'selection';
    $('context-label').textContent = 'searching…';
    const t = text.length > 260 ? text.slice(0, 260) + '…' : text;
    $('context-text').textContent = t;
    $('context-verdict').hidden = true;
    try {
        const data = await api(`/api/search?q=${encodeURIComponent(text.slice(0, 1200))}&k=10`, 'GET');
        if (seq !== selectionSeq) return; // a newer selection superseded this one
        $('context-label').textContent = `${data.results.length} matches`;
        renderMatches(data.results, 'No prior coverage found for this selection.');
    } catch (e) {
        if (seq !== selectionSeq) return;
        $('context-label').textContent = '';
        renderMatches([], `search failed: ${e.message}`);
        if (e.connectionFailed) loadIndexStatus();
    }
}

// ------------------------------------------------------------------
// Messages from the page's content script
// ------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!sender.tab || sender.tab.id !== currentTabId) return;
    if (msg.action === 'coverage-progress') {
        hideNotice();
        renderProgress(msg);
    } else if (msg.action === 'coverage-done') {
        renderProgress({ ...msg, done: msg.total });
        if (!msg.total) {
            showNotice('No analyzable paragraphs found on this page (needs blocks of 20+ words).');
        }
    } else if (msg.action === 'coverage-error') {
        $('progress').hidden = true;
        $('analyze').disabled = false;
        $('analyze').textContent = 'Analyze page';
        showNotice(msg.connectionFailed
            ? 'The covered server isn’t running. Start it with <code>python covered_web.py</code> in the writing folder, then hit Analyze again.'
            : `Analysis failed: ${esc(msg.error)}`);
    } else if (msg.action === 'coverage-show') {
        renderParagraph(msg);
    } else if (msg.action === 'coverage-selection') {
        searchSelection(msg.text);
    }
});

// ------------------------------------------------------------------
// Tab tracking & analyze button
// ------------------------------------------------------------------

function resetUI() {
    $('summary').innerHTML = '';
    $('progress').hidden = true;
    $('context').hidden = true;
    $('analyze').disabled = false;
    $('analyze').textContent = 'Analyze page';
    $('matches').innerHTML = '<p class="muted hint">Click a highlighted paragraph — or select any text — to see prior coverage here.</p>';
}

async function pullState() {
    if (currentTabId === null) return;
    try {
        const state = await chrome.tabs.sendMessage(currentTabId, { action: 'coverage-get-state' });
        if (state && (state.analyzed || state.running)) {
            renderProgress(state.running ? state : { ...state, done: state.total });
        }
    } catch (e) {
        // No content script on this tab yet — idle state is fine.
    }
}

async function refreshTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id !== currentTabId) {
        currentTabId = tab.id;
        resetUI();
        pullState();
    } else if (tab) {
        currentTabId = tab.id;
    }
}

chrome.tabs.onActivated.addListener(() => refreshTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === currentTabId && changeInfo.status === 'loading') resetUI();
});

$('analyze').addEventListener('click', () => {
    if (currentTabId === null) return;
    hideNotice();
    $('analyze').disabled = true;
    $('analyze').textContent = 'Analyzing…';
    chrome.runtime.sendMessage({
        action: 'coverage-run-request',
        tabId: currentTabId,
        verify: $('verify').checked,
    }, (resp) => {
        if (chrome.runtime.lastError || (resp && !resp.success)) {
            $('analyze').disabled = false;
            $('analyze').textContent = 'Analyze page';
            showNotice(`Could not start analysis: ${esc((resp && resp.error) || chrome.runtime.lastError.message)}`);
        }
    });
});

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------

refreshTab().then(() => loadIndexStatus());
