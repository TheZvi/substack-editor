// coverage/coverage-content.js
// "Have I covered this?" page analysis.
// Injected on demand (context menu -> background.js). Extracts the article's
// paragraphs, sends them in batches to the local covered server
// (http://127.0.0.1:8377, proxied through background.js), and highlights each
// paragraph by coverage status:
//   new (green) - no meaningful prior coverage
//   context / keyword-match (yellow) - related prior coverage
//   covered (red) - adds no new information vs the archive
// Clicking a highlighted paragraph (or selecting text anywhere) sends its
// matches to the extension side panel.

(function () {
    if (window.__zviCoverageLoaded) {
        return;
    }
    window.__zviCoverageLoaded = true;

    console.log('[Coverage] Content script loaded');

    const BATCH_SIZE = 12;   // paragraphs per /api/check call (progressive highlighting)
    const MIN_WORDS = 20;    // server skips anything shorter; don't bother sending it
    const STYLE_ID = 'zvi-coverage-style';
    const BLOCK_SELECTOR = 'p, li, blockquote';

    let paragraphs = [];     // { el, text, status, matches, verdict_reason?, verdict_quote?, verified? }
    let running = false;
    let analyzed = false;
    let lastProgress = { done: 0, total: 0, counts: {} };

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        // box-shadow edge bar + low-alpha background: readable on light and
        // dark pages, and causes no layout shift.
        style.textContent = `
            .zvi-cov { cursor: pointer; border-radius: 2px; transition: background-color .15s; }
            .zvi-cov-pending { box-shadow: inset 4px 0 0 rgba(128,128,128,.45) !important; }
            .zvi-cov-new { box-shadow: inset 4px 0 0 #2e8b57 !important; background-color: rgba(46,139,87,.10) !important; }
            .zvi-cov-context, .zvi-cov-keyword-match { box-shadow: inset 4px 0 0 #d4a72c !important; background-color: rgba(212,167,44,.13) !important; }
            .zvi-cov-covered { box-shadow: inset 4px 0 0 #c0392b !important; background-color: rgba(192,57,43,.12) !important; }
            .zvi-cov-sel { outline: 2px solid #2f6fed !important; outline-offset: 2px; }
        `;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------
    // Article extraction
    // ------------------------------------------------------------------

    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function findRoot() {
        for (const sel of ['article', 'main', '[role="main"]']) {
            const el = document.querySelector(sel);
            if (el && normalize(el.innerText).length > 500) return el;
        }
        return document.body;
    }

    function collectBlocks(root) {
        const blocks = [];
        for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
            // Skip chrome around the article
            if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]')) continue;
            // Leaf blocks only (e.g. take the <p>s inside a blockquote, not both)
            if (el.querySelector(BLOCK_SELECTOR)) continue;
            if (!el.getClientRects().length) continue; // hidden
            const text = normalize(el.innerText);
            if (text.split(' ').length < MIN_WORDS) continue;
            blocks.push({ el, text });
        }
        return blocks;
    }

    // ------------------------------------------------------------------
    // Background API proxy
    // ------------------------------------------------------------------

    function api(path, method, body) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'covered-api', path, method, body }, (resp) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!resp || !resp.success) {
                    const err = new Error((resp && resp.error) || 'Unknown covered-api error');
                    err.connectionFailed = !!(resp && resp.connectionFailed);
                    return reject(err);
                }
                resolve(resp.data);
            });
        });
    }

    // Fire-and-forget message to the side panel (also seen by background,
    // which ignores unknown actions).
    function toPanel(msg) {
        chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
    }

    // ------------------------------------------------------------------
    // Analysis
    // ------------------------------------------------------------------

    function clearHighlights() {
        for (const p of paragraphs) {
            p.el.classList.remove('zvi-cov', 'zvi-cov-pending', 'zvi-cov-sel',
                'zvi-cov-new', 'zvi-cov-context', 'zvi-cov-keyword-match', 'zvi-cov-covered');
            delete p.el.dataset.zviCovIdx;
        }
        paragraphs = [];
        analyzed = false;
    }

    function applyStatus(p, idx) {
        p.el.classList.remove('zvi-cov-pending');
        if (['new', 'context', 'keyword-match', 'covered'].includes(p.status)) {
            p.el.classList.add('zvi-cov', `zvi-cov-${p.status}`);
            p.el.dataset.zviCovIdx = String(idx);
        }
    }

    async function run(verify) {
        if (running) return;
        running = true;
        try {
            clearHighlights();
            ensureStyles();
            const blocks = collectBlocks(findRoot());
            paragraphs = blocks.map(b => ({ ...b, status: 'pending', matches: [] }));
            const counts = { new: 0, context: 0, 'keyword-match': 0, covered: 0 };
            lastProgress = { done: 0, total: paragraphs.length, counts };
            for (const p of paragraphs) p.el.classList.add('zvi-cov-pending');
            toPanel({ action: 'coverage-progress', done: 0, total: paragraphs.length, counts, pageTitle: document.title });

            for (let start = 0; start < paragraphs.length; start += BATCH_SIZE) {
                const batch = paragraphs.slice(start, start + BATCH_SIZE);
                const data = await api('/api/check', 'POST', {
                    text: batch.map(p => p.text).join('\n\n'),
                    verify: !!verify,
                });
                const results = data.paragraphs || [];
                batch.forEach((p, i) => {
                    // Whitespace is normalized client-side, so the server's
                    // paragraph split should return the batch 1:1; re-align by
                    // text if it ever doesn't.
                    let r = results[i];
                    if (!r || r.text !== p.text) r = results.find(x => x.text === p.text);
                    if (!r) { p.el.classList.remove('zvi-cov-pending'); return; }
                    p.status = r.status;
                    p.matches = r.matches || [];
                    p.verdict_reason = r.verdict_reason;
                    p.verdict_quote = r.verdict_quote;
                    p.verified = r.verified;
                    if (counts[p.status] !== undefined) counts[p.status]++;
                    applyStatus(p, start + i);
                });
                lastProgress = { done: Math.min(start + batch.length, paragraphs.length), total: paragraphs.length, counts };
                toPanel({ action: 'coverage-progress', ...lastProgress, pageTitle: document.title });
            }
            analyzed = true;
            toPanel({ action: 'coverage-done', ...lastProgress, pageTitle: document.title });
        } catch (e) {
            console.error('[Coverage] Analysis failed:', e);
            for (const p of paragraphs) p.el.classList.remove('zvi-cov-pending');
            toPanel({ action: 'coverage-error', error: e.message, connectionFailed: !!e.connectionFailed });
        } finally {
            running = false;
        }
    }

    // ------------------------------------------------------------------
    // Interaction: click a paragraph / select text -> side panel
    // ------------------------------------------------------------------

    function selectParagraph(el) {
        const idx = Number(el.dataset.zviCovIdx);
        const p = paragraphs[idx];
        if (!p) return;
        document.querySelectorAll('.zvi-cov-sel').forEach(n => n.classList.remove('zvi-cov-sel'));
        el.classList.add('zvi-cov-sel');
        toPanel({
            action: 'coverage-show',
            text: p.text,
            status: p.status,
            matches: p.matches,
            verdict_reason: p.verdict_reason,
            verdict_quote: p.verdict_quote,
            verified: p.verified,
        });
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('a')) return; // let links be links
        const el = e.target.closest('[data-zvi-cov-idx]');
        if (el) selectParagraph(el);
    });

    let selectionTimer = null;
    document.addEventListener('mouseup', () => {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            const sel = window.getSelection();
            const text = normalize(sel ? sel.toString() : '');
            if (text.length < 30) return;
            toPanel({ action: 'coverage-selection', text: text.slice(0, 2000) });
        }, 400);
    });

    // ------------------------------------------------------------------
    // Messages from background / side panel
    // ------------------------------------------------------------------

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'coverage-ping') {
            sendResponse({ alive: true });
        } else if (request.action === 'coverage-run') {
            run(!!request.verify);
            sendResponse({ started: true });
        } else if (request.action === 'coverage-get-state') {
            sendResponse({ analyzed, running, ...lastProgress, pageTitle: document.title });
        } else if (request.action === 'coverage-clear') {
            clearHighlights();
            sendResponse({ cleared: true });
        }
    });
})();
