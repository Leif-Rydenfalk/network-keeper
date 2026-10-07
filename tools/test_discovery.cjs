// Source-link safety, provenance, deduplication and filtering. Signed foreman/win-8321.
const assert=require('node:assert/strict');
const D=require('../app/discovery.js');
const row={visibility:'public',url:'https://x.com/demo/status/123?s=20#ref',title:'A public engineering post',author:'Demo',observed_at:'2026-01-10T12:00:00Z',published_at:'2026-01-09T12:00:00Z',evidence:'page_read'};
assert.equal(D.normalize(row).url,'https://x.com/demo/status/123');
for(const url of ['javascript:alert(1)','http://x.com/demo/status/123','https://x.com.evil.test/demo/status/123','https://evil.test/','https://secret@x.com/demo/status/123','https://x.com:444/demo/status/123','https://x.com/messages/123','https://linkedin.com/messaging/thread/123','https://reddit.com/message/inbox']) assert.equal(D.source(url),null,url);
assert.equal(D.normalize({...row,visibility:'private'}),null);
assert.equal(D.normalize({...row,observed_at:'bad'}),null);
assert.equal(D.normalize({...row,observed_at:'2999-01-01'}),null);
assert.equal(D.normalize({...row,published_at:'2999-01-01'}).published_at,null);
assert.equal(D.records([row,{...row,url:'https://twitter.com/other/status/123'}]).length,1);
assert.equal(D.records([{...row,url:'https://www.reddit.com/r/Jobs/comments/abc123/a_title/'},{...row,url:'https://old.reddit.com/r/jobs/comments/abc123/another/'}]).length,1);
assert.equal(D.records([{...row,url:'https://www.linkedin.com/posts/demo_activity-12345-abcd'},{...row,url:'https://linkedin.com/feed/update/urn:li:activity:12345/'}]).length,1);
assert.equal(D.normalize({...row,title:Array(100).fill('word').join(' ')}).title.split(' ').length,25);
const rows=D.records([row,{...row,url:'https://x.com/demo/status/456',published_at:null}]);
assert.equal(D.select(rows,{query:'engineering Demo'}).length,2);
assert.equal(D.select(rows,{platform:'reddit'}).length,0);
assert.equal(D.select(rows,{days:7},Date.parse('2026-01-10')).length,1);
assert.equal(D.select(rows,{days:7},Date.parse('2026-02-10')).length,0);
const html=D.card(D.normalize({...row,title:'<img src=x onerror=alert(1)>',author:'<script>x</script>'}));
assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;img'));
assert.ok(html.includes('Shared anonymously')); assert.ok(html.includes('External post'));
assert.ok(D.card(D.normalize({...row,evidence:'search_result'})).includes('Search result only'));
console.log('PASS: public-post allowlist, HTTPS and credentials, provenance, timestamps, canonical dedup, excerpt limits, filters, HTML escaping');

// Exercise the CLI across imports, a removal, aliases, and a competing writer.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'keeper-moderation-'));
try {
  const input=path.join(folder,'input.json'),output=path.join(folder,'feed.json');
  const cli=path.join(__dirname,'import_discovery.cjs');
  const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
  fs.writeFileSync(input,JSON.stringify([row,{...row,url:'https://x.com/demo/status/456'}]));
  assert.equal(run(input,output).status,0);
  assert.equal(run('--remove-url','https://twitter.com/alias/status/123',output).status,0);
  assert.equal(run(input,output).status,0);
  let feed=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.deepEqual(feed.removed,['x:123']);
  assert.deepEqual(feed.posts.map(x=>x.id),['x:456']);
  const saved=fs.readFileSync(output,'utf8');
  fs.writeFileSync(input,JSON.stringify([{...row,visibility:'private'}]));
  assert.notEqual(run(input,output).status,0);
  assert.equal(fs.readFileSync(output,'utf8'),saved);
  assert.equal(fs.existsSync(output+'.lock'),false);
  fs.writeFileSync(output+'.lock','another writer');
  assert.notEqual(run('--remove-url','https://x.com/demo/status/456',output).status,0);
  assert.equal(fs.readFileSync(output,'utf8'),saved);
  assert.equal(fs.readFileSync(output+'.lock','utf8'),'another writer');
  console.log('PASS: removed posts stay removed after alias reimport; invalid input and competing writer preserve feed');
} finally { fs.rmSync(folder,{recursive:true,force:true}); }
