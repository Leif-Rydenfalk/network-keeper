// node --test edge/test_worker.mjs : people.profiles against real SQLite (node:sqlite) wearing the D1 interface.
import test from 'node:test'; import assert from 'node:assert/strict'; import {DatabaseSync} from 'node:sqlite'; import {readFileSync} from 'node:fs';
import {handle} from './worker.mjs';
function d1() { const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const prep = sql => { let a = []; const st = {bind(...x) { a = x; return st; }, async run() { db.prepare(sql).run(...a); return {}; },
    async first() { return db.prepare(sql).get(...a) ?? null; }, async all() { return {results: db.prepare(sql).all(...a)}; }}; return st; };
  return {prepare: prep, async batch(sts) { for (const s of sts) await s.run(); }}; }
const call = async (env, m, p, body, k, web) => { const r = await handle(new Request('https://ce-net.com' + p, {method: m, headers: k ? {authorization: 'Bearer ' + k} : {}, body: body && JSON.stringify(body)}), env, web); return [r.status, await r.json()]; };
const LEIF = {consent: true, name: 'Leif Rydenfalk', headline: 'Founder, ce-net', location: 'Shenzhen', skills: ['robotics', 'CAD'], open_to: ['hiring'],
  experience: [{title: 'Founder', org: 'ce-net', when: '2024 - now'}], email: 'leif@example.com', linkedin: 'https://www.linkedin.com/in/leif/?x=1'};

test('nothing is stored without opt-in', async () => { const env = {DB: d1()};
  const [s] = await call(env, 'POST', '/api/people/profile', {...LEIF, consent: undefined}); assert.equal(s, 400);
  const [, r] = await call(env, 'GET', '/api/people/search?q=leif'); assert.equal(r.people.length, 0); });
test('profile: create, search, public read hides email, linkedin cleaned', async () => { const env = {DB: d1()};
  const [s, c] = await call(env, 'POST', '/api/people/profile', LEIF); assert.equal(s, 200); assert.ok(c.id && c.key);
  const [, f] = await call(env, 'GET', '/api/people/search?q=robotics shenzhen'); assert.equal(f.people.length, 1);
  assert.equal(f.people[0].linkedin, 'https://www.linkedin.com/in/leif/'); assert.ok(!JSON.stringify(f).includes('leif@example.com'));
  const [, h] = await call(env, 'GET', '/api/people/search?open_to=work'); assert.equal(h.people.length, 0);
  const [, g] = await call(env, 'GET', '/api/people/profile/' + c.id); assert.equal(g.name, 'Leif Rydenfalk'); });
test('only the key edits, hides or deletes', async () => { const env = {DB: d1()};
  const [, c] = await call(env, 'POST', '/api/people/profile', LEIF);
  assert.equal((await call(env, 'POST', '/api/people/profile', {...LEIF, id: c.id, name: 'X'}, 'wrong'))[0], 403);
  assert.equal((await call(env, 'POST', '/api/people/profile', {...LEIF, id: c.id, listed: false}, c.key))[0], 200);
  assert.equal((await call(env, 'GET', '/api/people/search'))[1].people.length, 0);
  assert.equal((await call(env, 'DELETE', '/api/people/profile/' + c.id, null, 'wrong'))[0], 403);
  assert.equal((await call(env, 'DELETE', '/api/people/profile/' + c.id, null, c.key))[0], 200); });
test('jobs and messages: post, search, message, owner reads inbox, rate limit', async () => { const env = {DB: d1()};
  const [, p] = await call(env, 'POST', '/api/people/profile', LEIF);
  const [s, j] = await call(env, 'POST', '/api/people/job', {title: 'PCB designer', org: 'ce-net', skills: ['KiCad'], email: 'jobs@example.com'}); assert.equal(s, 200);
  assert.equal((await call(env, 'GET', '/api/people/jobs?q=kicad'))[1].jobs.length, 1);
  const msg = {to_kind: 'profile', to_id: p.id, from_name: 'Ann', from_email: 'ann@example.com', text: 'Hi, can we talk about a robot cell?'};
  for (let i = 0; i < 3; i++) assert.equal((await call(env, 'POST', '/api/people/message', msg))[0], 200);
  assert.equal((await call(env, 'POST', '/api/people/message', msg))[0], 429);
  assert.equal((await call(env, 'GET', '/api/people/inbox?id=' + p.id))[0], 403);
  const [, ib] = await call(env, 'GET', '/api/people/inbox?id=' + p.id, null, p.key); assert.equal(ib.messages.length, 3);
  assert.equal((await call(env, 'DELETE', '/api/people/job/' + j.id, null, j.key))[0], 200);
  assert.equal((await call(env, 'GET', '/api/people/jobs'))[1].jobs.length, 0); });

// onboarding resolve, Leif 2026-10-02 17:12:54: account from nothing but a name or a LinkedIn profile; we say
// not-found or ambiguous and ask for more; otherwise we find everything we need online. Read-only, never stores.
const ANN = {consent: true, name: 'Ann Lee', headline: 'Engineer, Brightline', location: 'Shenzhen', skills: ['firmware'], linkedin: 'https://linkedin.com/in/ann-lee'};

test('resolve: found by name, ambiguous by name, not-found, nothing stored', async () => { const env = {DB: d1()};
  const [, a] = await call(env, 'POST', '/api/people/profile', ANN);
  const [, f] = await call(env, 'POST', '/api/people/resolve', {name: 'Ann Lee'});
  assert.equal(f.status, 'found'); assert.equal(f.source, 'index'); assert.equal(f.person.id, a.id);
  await call(env, 'POST', '/api/people/profile', {...ANN, name: 'Ann Chen', headline: 'Designer', email: 'ann2@example.com'});
  const [, am] = await call(env, 'POST', '/api/people/resolve', {name: 'ann'});
  assert.equal(am.status, 'ambiguous'); assert.equal(am.people.length, 2); assert.ok(am.need);
  const [, nf] = await call(env, 'POST', '/api/people/resolve', {name: 'Nobody Fields'});
  assert.equal(nf.status, 'not-found'); assert.ok(/LinkedIn link|PDF/.test(nf.need));
  assert.equal((await call(env, 'POST', '/api/people/resolve', {}))[0], 400);
  const [, s] = await call(env, 'GET', '/api/people/search?q=ann'); assert.equal(s.people.length, 2); });

test('resolve: linkedin link matches the index, or reads the live public page, or asks for more', async () => { const env = {DB: d1()};
  const [, a] = await call(env, 'POST', '/api/people/profile', ANN);
  const [, ix] = await call(env, 'POST', '/api/people/resolve', {linkedin: 'https://www.linkedin.com/in/ann-lee/'});
  assert.equal(ix.status, 'found'); assert.equal(ix.source, 'index'); assert.equal(ix.person.linkedin, 'https://linkedin.com/in/ann-lee');
  const page = '<html><head><meta property="og:title" content="Mia Stone - Founder, Nordic Design"><meta property="og:description" content="Founder"></head></html>';
  const okWeb = async () => new Response(page, {status: 200});
  const [, w] = await call(env, 'POST', '/api/people/resolve', {linkedin: 'linkedin.com/in/mia-stone'}, null, okWeb);
  assert.equal(w.status, 'found'); assert.equal(w.source, 'web'); assert.equal(w.person.name, 'Mia Stone');
  assert.equal(w.person.headline, 'Founder, Nordic Design'); assert.equal(w.person.linkedin, 'https://www.linkedin.com/in/mia-stone');
  const dead = async () => new Response('', {status: 999});
  const [, b] = await call(env, 'POST', '/api/people/resolve', {name: 'Mia Stone', linkedin: 'linkedin.com/in/mia-stone'}, null, dead);
  assert.equal(b.status, 'not-found'); assert.ok(/PDF|text/.test(b.need));
  const [bs, bad] = await call(env, 'POST', '/api/people/resolve', {linkedin: 'https://example.com/in/x'}, null, okWeb);
  assert.equal(bs, 400); assert.ok(/name or your LinkedIn link/.test(bad.error));
  const [, s] = await call(env, 'GET', '/api/people/search?q=mia'); assert.equal(s.people.length, 0); });


test('optional usage: consent, strict payload, deduplication, hashed IDs and opt-out races', async () => {
  const env={DB:d1()}, id='6e695093-a607-4672-990e-37ff15d23abd';
  const event={client_id:id,event:'contact_saved',consent:true};
  const count=async()=>await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_browsers WHERE enabled=1').first();
  assert.equal((await call(env,'POST','/api/people/usage',{...event,consent:false}))[0],400);
  assert.equal((await call(env,'POST','/api/people/usage',{...event,contact_name:'Private name'}))[0],400);
  assert.equal((await count()).n,0);
  for(let i=0;i<2;i++) assert.equal((await call(env,'POST','/api/people/usage',event))[0],200);
  assert.equal((await count()).n,1);
  const row=await env.DB.prepare('SELECT * FROM usage_browsers').first();
  assert.equal(row.client_hash.length,64);assert.ok(!JSON.stringify(row).includes(id));
  assert.match(row.first_day,/^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(row).sort(),['client_hash','enabled','first_day','last_day']);
  assert.equal((await call(env,'POST','/api/people/usage/opt-out',{client_id:id}))[0],200);
  assert.equal((await count()).n,0);
  // A delayed event must not recreate data after the user opts out.
  await call(env,'POST','/api/people/usage',event);
  const stopped=await env.DB.prepare('SELECT * FROM usage_browsers').first();
  assert.equal(stopped.enabled,0);assert.equal(stopped.first_day,null);assert.equal(stopped.last_day,null);
  const newId='425f1b1d-12ac-4d60-9a10-6b2a2aa643ee';
  await call(env,'POST','/api/people/usage/opt-out',{client_id:newId});
  await call(env,'POST','/api/people/usage',{...event,client_id:newId});
  assert.equal((await count()).n,0);
});
