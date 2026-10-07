// Public source-link discovery. Private contacts and messages never enter this feed.
// SPDX-License-Identifier: AGPL-3.0-only
(function (root) {
  'use strict';
  const platforms = {x: 'X', reddit: 'Reddit', linkedin: 'LinkedIn'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function source(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
      let platform, id;
      if (['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)) {
        const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/);
        if (!m) return null; platform = 'x'; id = m[2]; u.hostname = 'x.com'; u.pathname = `/${m[1]}/status/${id}`;
      } else if (['reddit.com','www.reddit.com','old.reddit.com'].includes(u.hostname)) {
        const m = u.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)(?:\/[^/]*)?\/?$/i);
        if (!m) return null; platform = 'reddit'; id = m[2].toLowerCase(); u.hostname = 'www.reddit.com'; u.pathname = `/r/${m[1].toLowerCase()}/comments/${id}/`;
      } else if (['linkedin.com','www.linkedin.com'].includes(u.hostname)) {
        const m = u.pathname.match(/^\/posts\/[^/]*activity-(\d+)-[^/]+\/?$/) || u.pathname.match(/^\/feed\/update\/urn:li:activity:(\d+)\/?$/);
        if (!m) return null; platform = 'linkedin'; id = m[1]; u.hostname = 'www.linkedin.com'; u.pathname = `/feed/update/urn:li:activity:${id}/`;
      } else return null;
      u.search = ''; u.hash = '';
      return {platform, id: `${platform}:${id}`, url: u.href};
    } catch { return null; }
  }
  function normalize(row) {
    if (!row || typeof row !== 'object' || row.visibility !== 'public') return null;
    const s = source(row.url), observed = Date.parse(row.observed_at);
    if (!s || !Number.isFinite(observed) || observed > Date.now() + 300000) return null;
    const title = String(row.title || '').trim().split(/\s+/).slice(0,25).join(' ').slice(0,250);
    if (!title) return null;
    const published = Date.parse(row.published_at);
    return {...s, title, author: String(row.author || '').trim().slice(0,100), observed_at: new Date(observed).toISOString(),
      published_at: Number.isFinite(published) && published <= observed ? new Date(published).toISOString() : null,
      evidence: row.evidence === 'page_read' ? 'page_read' : 'search_result'};
  }
  function records(rows) {
    const out = new Map();
    for (const raw of (Array.isArray(rows) ? rows : []).slice(0,10000)) {
      const item = normalize(raw); if (!item) continue;
      if (!out.has(item.id) || out.get(item.id).observed_at < item.observed_at) out.set(item.id,item);
    }
    return [...out.values()].sort((a,b) => b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id));
  }
  function select(rows, {query='', platform='', days=0} = {}, now=Date.now()) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return rows.filter(x => (!platform || x.platform === platform) && (!days || (x.published_at && Date.parse(x.published_at) >= now-days*86400000)) &&
      terms.every(t => `${x.title} ${x.author} ${platforms[x.platform]}`.toLowerCase().includes(t)));
  }
  function card(x) {
    return `<article class="group" style="padding:18px;margin-top:12px"><div class="meta">${escape(platforms[x.platform])} · Shared anonymously · External post</div><h3 style="margin:10px 0"><a href="${escape(x.url)}" target="_blank" rel="noopener noreferrer">${escape(x.title)}</a></h3><div class="meta">${escape(x.author || 'Author unavailable')}</div><div class="note">${x.published_at ? 'Published ' + escape(new Date(x.published_at).toLocaleDateString()) : 'Publication date unavailable'} · Source checked ${escape(new Date(x.observed_at).toLocaleDateString())}</div><div class="note">${x.evidence === 'search_result' ? 'Search result only. ' : ''}Check availability at source.</div></article>`;
  }
  let observer, sequence = 0;
  function stop() { sequence++; if (observer) observer.disconnect(); }
  async function mount(box) {
    stop(); const run = sequence;
    box.innerHTML = `<label for="discoveryQuery">Search public posts</label><input id="discoveryQuery" type="search" placeholder="Role, skill or person"><div class="row"><label>Platform<select id="discoveryPlatform"><option value="">All platforms</option>${Object.entries(platforms).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Published<select id="discoveryDays"><option value="0">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label></div><p class="note">Public source links. CE membership is not verified. Coverage is limited to collected posts.</p><div id="discoveryStatus" role="status">Loading…</div><div id="discoveryCards"></div><button id="discoveryMore" class="btn wide" hidden>Load more</button>`;
    try {
      const r = await fetch('discovery.json', {cache:'no-store'}); if (!r.ok) throw new Error('Source feed unavailable');
      const data = await r.json(); if (run !== sequence || !box.isConnected) return;
      const rows = records(data.posts), status = box.querySelector('#discoveryStatus'), cards = box.querySelector('#discoveryCards'), more = box.querySelector('#discoveryMore');
      let filtered = [], shown = 0;
      function append() {
        const batch = filtered.slice(shown,shown+20); shown += batch.length;
        cards.insertAdjacentHTML('beforeend',batch.map(card).join('')); more.hidden = shown >= filtered.length;
        status.textContent = `${shown} of ${filtered.length} posts`;
      }
      function filter() {
        filtered = select(rows,{query:box.querySelector('#discoveryQuery').value,platform:box.querySelector('#discoveryPlatform').value,days:Number(box.querySelector('#discoveryDays').value)});
        shown=0; cards.innerHTML=''; append();
      }
      more.onclick=append;
      box.querySelector('#discoveryQuery').oninput=filter;
      box.querySelector('#discoveryPlatform').onchange=filter;
      box.querySelector('#discoveryDays').onchange=filter;
      filter();
      if (typeof IntersectionObserver !== 'undefined') { observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!more.hidden)append();}); observer.observe(more); }
    } catch (e) { if (run===sequence && box.isConnected) { const status=box.querySelector('#discoveryStatus'); status.textContent='Source feed unavailable. Please try again.'; } }
  }
  const api={source,normalize,records,select,card,mount,stop};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.KeeperDiscovery=api;
})(typeof window !== 'undefined' ? window : globalThis);
