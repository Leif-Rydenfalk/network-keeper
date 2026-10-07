// Consent and failure isolation for usage measurement. No network calls.
const assert=require('node:assert/strict');
const {create,KEY}=require('../app/usage.js');
const values=new Map(),calls=[];
const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
let fail=false,sequence=0,wait;
const usage=create({storage,uuid:()=>`id-${++sequence}`,now:()=>new Date('2026-10-07T12:00:00Z'),request:async(path,body)=>{
  calls.push({path,body}); if(fail)throw Error('offline'); if(wait)await wait;
}});
(async()=>{
  assert.equal(await usage.recordContact(),false);assert.equal(calls.length,0);
  await usage.enable();assert.equal(calls.length,0);
  assert.equal(await usage.recordContact(),true);
  assert.deepEqual(calls[0],{path:'/usage',body:{client_id:'id-1',event:'contact_saved',consent:true}});
  assert.equal(await usage.recordContact(),false);assert.equal(calls.length,1);
  fail=true;await assert.rejects(usage.disable());
  assert.equal(usage.state().enabled,false);assert.equal(usage.state().pending,true);
  await usage.recordContact();assert.equal(calls.length,2);
  fail=false;await usage.enable();assert.equal(usage.state().id,'id-2');
  assert.equal(calls.at(-1).path,'/usage/opt-out');
  let resolve;wait=new Promise(r=>resolve=r);
  const saving=usage.recordContact();
  wait=null;await usage.disable();resolve();await saving;
  assert.deepEqual(usage.state(),{enabled:false});
  assert.ok(!storage.getItem(KEY).includes('day'));
  console.log('PASS: default-off, minimal payload, daily dedup, failed opt-out retry, late request isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
