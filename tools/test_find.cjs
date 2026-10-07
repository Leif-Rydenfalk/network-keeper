// Bounded search regression checks; no browser, network or public mutations.
// Signed: foreman/win-8321.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const html = readFileSync(new URL('../app/index.html', `file://${__filename}`), 'utf8');
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const code = html.slice(html.indexOf('function viewFind() {'), html.indexOf('function sheetFound(x)'));
const box = {innerHTML: ''}, pending = [];
const context = vm.createContext({
  findMode: 'people', findQ: 'first', findOpen: 'work', findRequest: 0,
  db: {savedSearches: [{mode: 'jobs', q: '<script>bad</script>', open: ''}]},
  OPEN_TO: {work: 'Looking for work'}, setTitle() {},
  esc: s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  avatar: () => '', ICON: {chev: ''},
  document: {getElementById: () => box},
  api: (method, path) => new Promise((resolve, reject) => pending.push({path, resolve, reject}))
});
vm.runInContext(code, context);
(async () => {
  const view = vm.runInContext('viewFind()', context);
  assert.ok(view.includes('data-act="postjob"'));
  assert.ok(view.includes('data-act="seekwork"'));
  assert.ok(view.includes('id="findOpen"'));
  assert.ok(view.includes('&lt;script&gt;bad&lt;/script&gt;'));
  const first = vm.runInContext('findRun()', context);
  assert.ok(pending[0].path.includes('open_to=work'));
  context.findQ = 'second';
  const second = vm.runInContext('findRun()', context);
  pending[1].resolve({people: [{id:'p2', name:'Second result', headline:'', skills:[], location:'', open_to:[]}]});
  await second;
  assert.ok(box.innerHTML.includes('Second result'));
  pending[0].resolve({people: [{id:'p1', name:'Stale result', headline:'', skills:[], location:'', open_to:[]}]});
  await first;
  assert.ok(box.innerHTML.includes('Second result'));
  assert.ok(!box.innerHTML.includes('Stale result'));
  const third = vm.runInContext('findRun()', context);
  context.findQ = 'third';
  pending[2].reject(new Error('Old failure'));
  await third;
  assert.ok(!box.innerHTML.includes('Old failure'));
  context.findMode = 'jobs';
  const jobs = vm.runInContext('findRun()', context);
  assert.ok(pending[3].path.startsWith('/jobs?q='));
  assert.ok(!pending[3].path.includes('open_to='));
  pending[3].resolve({jobs: []}); await jobs;
  console.log('PASS: inline JS syntax, primary job actions, saved-query escaping, availability filter, stale result/error isolation, jobs endpoint');
})().catch(e => { console.error(e); process.exitCode = 1; });
