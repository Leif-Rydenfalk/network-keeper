// Optional contact-save measurement. No contact fields enter this module.
// SPDX-License-Identifier: AGPL-3.0-only
(function(root) {
  'use strict';
  const KEY='network-keeper.usage.v1';
  function create({storage,request,uuid,now=()=>new Date()}) {
    function state() { try {return JSON.parse(storage.getItem(KEY)) || {};} catch {return {};} }
    function write(value) {storage.setItem(KEY,JSON.stringify(value));}
    async function disable() {
      const value=state(); value.enabled=false; value.pending=Boolean(value.id); write(value);
      if(value.id) await request('/usage/opt-out',{client_id:value.id});
      write({enabled:false});
    }
    async function enable() {
      if(state().pending) await disable();
      if(!state().enabled) write({enabled:true,id:uuid()});
    }
    async function recordContact() {
      const value=state(), day=now().toISOString().slice(0,10);
      if(!value.enabled || !value.id || value.day===day) return false;
      try {
        await request('/usage',{client_id:value.id,event:'contact_saved',consent:true});
        const current=state();
        if(current.enabled && current.id===value.id) write({...current,day});
        return true;
      } catch {return false;}
    }
    return {state,enable,disable,recordContact};
  }
  const api={create,KEY};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.KeeperUsage=api;
})(typeof window!=='undefined'?window:globalThis);
