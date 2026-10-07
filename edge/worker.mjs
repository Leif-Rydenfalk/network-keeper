// people.profiles: opt-in people profiles, job posts and first messages for Network Keeper's "Me" and "Find" tabs.
// foreman/codex-lead 2026-10-01, from Leif ~21:00 (schema.sql has his words). Routes: ce-net.com/api/people/*.
// Onboarding resolve (Leif 2026-10-02 17:12:54, to win-2734): an account can be created from nothing but a name or a
// LinkedIn profile; we say when we can't find you or when it's ambiguous and more information is needed, otherwise we
// find everything we need online. Resolve is read-only: it matches and returns candidates, it never stores or claims
// anyone — a profile is stored only by the person's own POST /profile with consent (and edited only with their key).
// Sources: the opt-in people index, plus a live read of the public LinkedIn page a link points at (og:title /
// og:description, no login, nothing cached). Full web-search enrichment by name is the next phase (foreman/lola
// 2026-10-02: live public-profile fetch shipped; name search online needs a search source decision).
// No IP, cookie or user agent is stored. Editing needs the edit key the person's phone holds (stored here only as SHA-256).
const J = (o, s = 200) => new Response(JSON.stringify(o), {status: s, headers: {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS'}});
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const list = (v, n, each) => (Array.isArray(v) ? v : []).slice(0, n).map(each).filter(Boolean);
const word = s => clip(s, 60);
const entry = e => (e && typeof e === 'object') ? {title: clip(e.title, 120), org: clip(e.org, 120), when: clip(e.when, 60), detail: clip(e.detail, 600)} : null;
const OPEN = new Set(['work', 'hiring', 'projects', 'advice']);
const enc = new TextEncoder();
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const rid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const key = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

function profileIn(b) {
  const p = {name: clip(b.name, 100), headline: clip(b.headline, 200), location: clip(b.location, 100), about: clip(b.about, 2600),
    skills: list(b.skills, 50, word), experience: list(b.experience, 30, entry), education: list(b.education, 15, entry),
    open_to: list(b.open_to, 4, x => OPEN.has(x) ? x : null), email: clip(b.email, 200)};
  let li = clip(b.linkedin, 200); try { const u = new URL(li); li = /(^|\.)linkedin\.com$/.test(u.hostname) ? u.origin + u.pathname : ''; } catch { li = ''; }
  p.linkedin = li;
  if (p.email && !EMAIL.test(p.email)) p.email = '';
  p.search = [p.name, p.headline, p.location, p.about, ...p.skills, ...p.experience.map(e => e.title + ' ' + e.org)].join(' ').toLowerCase();
  return p;
}
const profileOut = r => ({id: r.id, name: r.name, headline: r.headline, location: r.location, about: r.about, skills: JSON.parse(r.skills),
  experience: JSON.parse(r.experience), education: JSON.parse(r.education), linkedin: r.linkedin, open_to: JSON.parse(r.open_to), updated: r.updated});
const jobOut = r => ({id: r.id, title: r.title, org: r.org, location: r.location, detail: r.detail, skills: JSON.parse(r.skills), poster: r.poster, ts: r.ts});

const norm = s => clip(s, 100).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
function liSlug(v) {
  const s = clip(v, 200).trim();
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!/(^|\.)linkedin\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([A-Za-z0-9\-_%]{3,})\/?$/);
    // profiles are stored with the host exactly as the person gave it (profileIn), so match both www and bare forms
    return m ? ['https://www.linkedin.com/in/' + m[1], 'https://linkedin.com/in/' + m[1]] : null;
  } catch { return null; }
}
// The public profile page of the link the person gave us, no login: LinkedIn serves og:title "Name - Headline" and
// og:description to fetches it likes; when it blocks us (datacenter IP, 999) we return null and the person pastes the
// PDF or text instead. web is injected so tests never touch the network.
async function fetchLinkedIn(web, url) {
  try { const r = await web(url, {headers: {'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'accept-language': 'en'}, signal: AbortSignal.timeout(6000)});
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 300000);
    const meta = p => { const m = html.match(new RegExp('<meta[^>]+(?:property|name)="og:' + p + '"[^>]+content="([^"]*)"')); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : ''; };
    const title = meta('title'); if (!title) return null;
    const parts = title.split(/\s+[|–·-]\s+/);
    return {name: clip(parts[0], 100), headline: clip(parts.slice(1).join(' — ').trim() || meta('description'), 200)};
  } catch { return null; }
}
const webPerson = (p, li) => ({name: p.name, headline: p.headline, location: '', about: '', skills: [], experience: [], education: [], open_to: [], linkedin: li});

async function body(req, n) { try { return JSON.parse((await req.text()).slice(0, n)); } catch { return null; } }
function terms(q) { return clip(q, 120).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6); }
function where(ts) { return ts.length ? ' AND ' + ts.map(() => 'search LIKE ?').join(' AND ') : ''; }
const like = ts => ts.map(t => '%' + t.replace(/[%_]/g, '') + '%');

export async function handle(req, env, web = fetch) {
  const url = new URL(req.url); const path = url.pathname.replace(/\/+$/, ''); const m = req.method; const now = Math.floor(Date.now() / 1000);
  if (m === 'OPTIONS') return J({});
  // create or update my profile. Opt-in is explicit: consent must be true, or nothing is stored.
  if (m === 'POST' && path === '/api/people/profile') {
    const b = await body(req, 40000); if (!b) return J({error: 'bad json'}, 400);
    if (b.website) return J({ok: true});
    if (b.consent !== true) return J({error: 'a profile is stored only when you opt in (consent: true)'}, 400);
    const p = profileIn(b); if (!p.name) return J({error: 'a name is needed'}, 400);
    const k = key(req);
    if (b.id) {
      const row = await env.DB.prepare('SELECT key_hash FROM profiles WHERE id=?').bind(clip(b.id, 20)).first();
      if (!row || !k || row.key_hash !== await sha(k)) return J({error: 'not your profile'}, 403);
      await env.DB.prepare('UPDATE profiles SET updated=?,listed=?,name=?,headline=?,location=?,about=?,skills=?,experience=?,education=?,linkedin=?,open_to=?,email=?,search=? WHERE id=?')
        .bind(now, b.listed === false ? 0 : 1, p.name, p.headline, p.location, p.about, JSON.stringify(p.skills), JSON.stringify(p.experience), JSON.stringify(p.education), p.linkedin, JSON.stringify(p.open_to), p.email, p.search, clip(b.id, 20)).run();
      return J({ok: true, id: clip(b.id, 20)});
    }
    const id = rid(10), nk = rid(32);
    await env.DB.prepare('INSERT INTO profiles(id,key_hash,ts,updated,listed,name,headline,location,about,skills,experience,education,linkedin,open_to,email,search) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, await sha(nk), now, now, b.listed === false ? 0 : 1, p.name, p.headline, p.location, p.about, JSON.stringify(p.skills), JSON.stringify(p.experience), JSON.stringify(p.education), p.linkedin, JSON.stringify(p.open_to), p.email, p.search).run();
    return J({ok: true, id, key: nk});
  }
  let mm;
  if ((mm = path.match(/^\/api\/people\/profile\/([a-z0-9]{6,20})$/))) {
    const id = mm[1];
    if (m === 'GET') { const r = await env.DB.prepare('SELECT * FROM profiles WHERE id=? AND listed=1').bind(id).first(); return r ? J(profileOut(r)) : J({error: 'not found'}, 404); }
    if (m === 'DELETE') {   // opt out: the row and every message to it are gone
      const row = await env.DB.prepare('SELECT key_hash FROM profiles WHERE id=?').bind(id).first(); const k = key(req);
      if (!row || !k || row.key_hash !== await sha(k)) return J({error: 'not your profile'}, 403);
      await env.DB.batch([env.DB.prepare('DELETE FROM profiles WHERE id=?').bind(id), env.DB.prepare("DELETE FROM messages WHERE to_kind='profile' AND to_id=?").bind(id)]);
      return J({ok: true, deleted: id});
    }
  }
  if (m === 'GET' && path === '/api/people/search') {
    const ts = terms(url.searchParams.get('q')); const want = url.searchParams.get('open_to');
    let sql = 'SELECT * FROM profiles WHERE listed=1' + where(ts); const args = like(ts);
    if (OPEN.has(want)) { sql += ' AND open_to LIKE ?'; args.push('%"' + want + '"%'); }
    const r = await env.DB.prepare(sql + ' ORDER BY updated DESC LIMIT 50').bind(...args).all();
    return J({people: r.results.map(profileOut)});
  }
  if (m === 'POST' && path === '/api/people/job') {
    const b = await body(req, 12000); if (!b) return J({error: 'bad json'}, 400);
    if (b.website) return J({ok: true});
    const email = clip(b.email, 200), title = clip(b.title, 140);
    if (!title || !EMAIL.test(email)) return J({error: 'a job title and a valid email are needed'}, 400);
    const j = {title, org: clip(b.org, 120), location: clip(b.location, 100), detail: clip(b.detail, 3000), skills: list(b.skills, 30, word), poster: clip(b.poster, 100)};
    const id = rid(10), nk = rid(32);
    await env.DB.prepare('INSERT INTO jobs(id,key_hash,ts,open,title,org,location,detail,skills,poster,email,search) VALUES(?,?,?,1,?,?,?,?,?,?,?,?)')
      .bind(id, await sha(nk), now, j.title, j.org, j.location, j.detail, JSON.stringify(j.skills), j.poster, email, [j.title, j.org, j.location, j.detail, ...j.skills].join(' ').toLowerCase()).run();
    return J({ok: true, id, key: nk});
  }
  if ((mm = path.match(/^\/api\/people\/job\/([a-z0-9]{6,20})$/)) && m === 'DELETE') {
    const row = await env.DB.prepare('SELECT key_hash FROM jobs WHERE id=?').bind(mm[1]).first(); const k = key(req);
    if (!row || !k || row.key_hash !== await sha(k)) return J({error: 'not your job'}, 403);
    await env.DB.prepare('UPDATE jobs SET open=0 WHERE id=?').bind(mm[1]).run(); return J({ok: true, closed: mm[1]});
  }
  if (m === 'GET' && path === '/api/people/jobs') {
    const ts = terms(url.searchParams.get('q'));
    const r = await env.DB.prepare('SELECT * FROM jobs WHERE open=1 AND ts>?' + where(ts) + ' ORDER BY ts DESC LIMIT 50').bind(now - 86400 * 120, ...like(ts)).all();
    return J({jobs: r.results.map(jobOut)});
  }
  // a first message to a person or a job poster; the address stays private, the owner reads it with their key
  if (m === 'POST' && path === '/api/people/message') {
    const b = await body(req, 6000); if (!b) return J({error: 'bad json'}, 400);
    if (b.website) return J({ok: true});
    const kind = b.to_kind === 'job' ? 'job' : 'profile', to = clip(b.to_id, 20), email = clip(b.from_email, 200), name = clip(b.from_name, 100), text = clip(b.text, 2000);
    if (!name || !EMAIL.test(email) || !text) return J({error: 'your name, a valid email and a message are needed'}, 400);
    const ok = await env.DB.prepare(kind === 'job' ? 'SELECT id FROM jobs WHERE id=? AND open=1' : 'SELECT id FROM profiles WHERE id=? AND listed=1').bind(to).first();
    if (!ok) return J({error: 'not found'}, 404);
    const recent = await env.DB.prepare('SELECT count(*) n FROM messages WHERE to_id=? AND from_email=? AND ts>?').bind(to, email, now - 86400).first();
    if (recent.n >= 3) return J({error: 'three messages a day to one person is the limit'}, 429);
    await env.DB.prepare('INSERT INTO messages(ts,to_kind,to_id,from_name,from_email,from_profile,text) VALUES(?,?,?,?,?,?,?)').bind(now, kind, to, name, email, clip(b.from_profile, 20), text).run();
    return J({ok: true});
  }
  if (m === 'GET' && path === '/api/people/inbox') {
    const kind = url.searchParams.get('kind') === 'job' ? 'job' : 'profile', id = clip(url.searchParams.get('id'), 20), k = key(req);
    const row = await env.DB.prepare(kind === 'job' ? 'SELECT key_hash FROM jobs WHERE id=?' : 'SELECT key_hash FROM profiles WHERE id=?').bind(id).first();
    if (!row || !k || row.key_hash !== await sha(k)) return J({error: 'not yours'}, 403);
    const r = await env.DB.prepare('SELECT ts,from_name,from_email,from_profile,text FROM messages WHERE to_kind=? AND to_id=? ORDER BY ts DESC LIMIT 100').bind(kind, id).all();
    return J({messages: r.results});
  }
  // onboarding identity resolve, Leif 2026-10-02 17:12:54. Read-only: found / ambiguous / not-found, never stores.
  if (m === 'POST' && path === '/api/people/resolve') {
    const b = await body(req, 4000); if (!b) return J({error: 'bad json'}, 400);
    const name = norm(b.name), lis = liSlug(b.linkedin);
    if (!name && !lis) return J({error: 'give your name or your LinkedIn link'}, 400);
    if (lis) {
      const li = lis[0];
      const ix = await env.DB.prepare('SELECT * FROM profiles WHERE listed=1 AND linkedin IN (?, ?)').bind(lis[0], lis[1]).all();
      if (ix.results.length === 1) return J({status: 'found', source: 'index', person: profileOut(ix.results[0])});
      if (ix.results.length > 1) return J({status: 'ambiguous', source: 'index', people: ix.results.map(profileOut).slice(0, 10),
        need: 'More than one listed profile has this link and we can\'t tell which one is you. Pick yourself from the list, or paste your LinkedIn PDF.'});
      const w = await fetchLinkedIn(web, li);
      if (w && w.name) return J({status: 'found', source: 'web', person: webPerson(w, li),
        note: 'Read from your public LinkedIn page just now. Check it and fill in the rest before anything goes online.'});
    }
    const ts = name.split(/\s+/).filter(Boolean).slice(0, 4);
    if (ts.length) {
      const sql = 'SELECT * FROM profiles WHERE listed=1 AND ' + ts.map(() => 'LOWER(name) LIKE ?').join(' AND ') + ' ORDER BY updated DESC LIMIT 20';
      const r = await env.DB.prepare(sql).bind(...ts.map(t => '%' + t.replace(/[%_]/g, '') + '%')).all();
      if (r.results.length === 1) return J({status: 'found', source: 'index', person: profileOut(r.results[0])});
      if (r.results.length > 1) return J({status: 'ambiguous', source: 'index', people: r.results.map(profileOut).slice(0, 10),
        need: 'We found ' + r.results.length + ' people with that name and can\'t tell which one is you. Pick yourself from the list, or give your LinkedIn link.'});
    }
    return J({status: 'not-found', need: lis
      ? 'We couldn\'t read that LinkedIn page. Paste the PDF LinkedIn makes (More > Save to PDF) or your profile text, and we take it from there.'
      : 'We couldn\'t find you online. Give your LinkedIn link, or paste the PDF LinkedIn makes or your profile text.'});
  }
  return J({error: 'not found'}, 404);
}
export default {async fetch(req, env) { try { return await handle(req, env); } catch (e) { return J({error: 'unavailable'}, 503); } }};
