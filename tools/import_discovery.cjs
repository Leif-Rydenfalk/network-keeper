#!/usr/bin/env node
// Merge reviewed public-post metadata into the feed; never accepts messages or contact exports.
// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs'),path=require('node:path');
const D=require('../app/discovery.js');
const positional=process.argv.slice(2).filter(x=>!x.startsWith('--'));
const input=positional[0];
if(!input || process.argv.includes('--help')) { console.log('node tools/import_discovery.cjs INPUT.json [OUTPUT.json] [--x-candidates]\nINPUT: array of reviewed public rows with url, title (25 words max), author, visibility:"public", observed_at, published_at, evidence:"page_read"|"search_result".'); process.exit(input?0:1); }
const output=path.resolve(positional[1] || path.join(__dirname,'../app/discovery.json'));
const text=fs.readFileSync(input,'utf8');
if(Buffer.byteLength(text)>2*1024*1024) throw new Error('Input exceeds 2 MiB');
const fromX=process.argv.includes('--x-candidates');
const data=fromX?text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)):JSON.parse(text);
const rows=fromX?data.filter(r=>D.source(r.url)?.platform==='x' && String(r.text||'').trim()).map(r=>({
  url:r.url,title:String(r.text).trim().split(/\s+/).slice(0,20).join(' '),author:r.author,
  observed_at:r.at,published_at:r.posted_at,visibility:'public',evidence:'page_read'
})):(Array.isArray(data)?data:data.posts);
if(!Array.isArray(rows) || rows.length>1000) throw new Error('Expected at most 1000 public post records');
const clean=rows.map(D.normalize);
if(clean.some(x=>!x)) throw new Error('Invalid or private record; no feed written');
const existing=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')).posts:[];
// Normalize requires explicit visibility on persisted records as well.
const incoming=clean.map(x=>({...x,visibility:'public'}));
const posts=D.records([...(existing||[]),...incoming]).map(x=>({...x,visibility:'public'}));
const temporary=output+'.tmp-'+process.pid;
fs.writeFileSync(temporary,JSON.stringify({schema:1,posts},null,2)+'\n',{flag:'wx'});
fs.renameSync(temporary,output);
console.log(JSON.stringify({accepted:rows.length,total:posts.length,output}));
