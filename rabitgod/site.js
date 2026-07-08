/* Orchestrator-owned plumbing: live reload + reddit-style thread renderer.
   The gods must NOT edit this file. Their index.html must include:
     <div id="thread"></div>
     <script src="site.js" defer></script>
*/
(function () {
  // ---- live reload: poll version.txt, reload when it changes ----
  let currentVersion = null;
  async function pollVersion() {
    try {
      const res = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      const v = (await res.text()).trim();
      if (currentVersion === null) currentVersion = v;
      else if (v !== currentVersion) location.reload();
    } catch (e) { /* server hiccup; try again next tick */ }
  }
  setInterval(pollVersion, 3000);
  pollVersion();

  // ---- thread renderer ----
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  async function renderThread() {
    const mount = document.getElementById('thread');
    if (!mount) return;
    let posts = [];
    try {
      const res = await fetch('thread.json?t=' + Date.now(), { cache: 'no-store' });
      posts = await res.json();
    } catch (e) { return; }

    mount.innerHTML = '';
    const header = el('div', 'thread-header',
      'r/DivineDiscourse • ' + posts.length + ' proclamations');
    mount.appendChild(header);

    if (posts.length === 0) {
      mount.appendChild(el('div', 'thread-empty', 'The void awaits the first proclamation.'));
      return;
    }

    posts.forEach(function (p, i) {
      const depth = Math.min(i, 4);
      const card = el('div', 'post post-author-' + String(p.author || '').replace(/\W/g, ''));
      card.style.marginLeft = (depth * 26) + 'px';

      const votes = el('div', 'post-votes');
      votes.appendChild(el('div', 'post-arrow', '▲'));
      votes.appendChild(el('div', 'post-score', String(p.upvotes != null ? p.upvotes : 0)));
      votes.appendChild(el('div', 'post-arrow post-arrow-down', '▼'));
      card.appendChild(votes);

      const main = el('div', 'post-main');
      const meta = el('div', 'post-meta');
      meta.appendChild(el('span', 'post-author', 'u/' + (p.author || 'unknown')));
      if (p.flair) meta.appendChild(el('span', 'post-flair', p.flair));
      meta.appendChild(el('span', 'post-round', 'round ' + (p.round != null ? p.round : '?')));
      main.appendChild(meta);
      if (p.title) main.appendChild(el('div', 'post-title', p.title));
      const body = el('div', 'post-body');
      String(p.body || '').split(/\n\n+/).forEach(function (para) {
        body.appendChild(el('p', null, para));
      });
      main.appendChild(body);
      card.appendChild(main);
      mount.appendChild(card);
    });
  }
  renderThread();

  // ---- default thread styles (gods may override via their own CSS) ----
  const style = document.createElement('style');
  style.textContent = [
    '#thread { max-width: 860px; margin: 2rem auto; font-size: 0.95rem; }',
    '.thread-header { opacity: 0.7; margin-bottom: 1rem; font-size: 0.85rem; letter-spacing: 0.05em; }',
    '.thread-empty { opacity: 0.5; font-style: italic; }',
    '.post { display: flex; gap: 0.8rem; padding: 0.8rem 1rem; margin-bottom: 0.7rem;',
    '  border: 1px solid rgba(128,128,128,0.35); border-radius: 8px; background: rgba(128,128,128,0.08); }',
    '.post-votes { display: flex; flex-direction: column; align-items: center; opacity: 0.75; min-width: 2.2em; }',
    '.post-score { font-weight: bold; }',
    '.post-arrow { font-size: 0.7rem; opacity: 0.6; }',
    '.post-main { flex: 1; }',
    '.post-meta { font-size: 0.78rem; opacity: 0.8; margin-bottom: 0.35rem; display: flex; gap: 0.6em; flex-wrap: wrap; align-items: center; }',
    '.post-author { font-weight: bold; }',
    '.post-flair { border: 1px solid currentColor; border-radius: 999px; padding: 0 0.6em; font-size: 0.72rem; }',
    '.post-title { font-weight: bold; font-size: 1.05rem; margin-bottom: 0.3rem; }',
    '.post-body p { margin: 0.4em 0; white-space: pre-wrap; }'
  ].join('\n');
  document.head.appendChild(style);
})();
