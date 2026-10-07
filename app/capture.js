// Contact capture: bounded, local parsers and image processing. foreman/win-e4fa.
(function(root) {
  'use strict';
  const MAX_TEXT = 32000;
  const clean = x => String(x || '').trim();
  function safeURL(s) {
    try { const u = new URL(/^www\./i.test(s) ? 'https://' + s : s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function parseText(input) {
    const text = clean(input); if (text.length > MAX_TEXT) throw Error('Contact text is too long (32,000 characters maximum).');
    const out = {name:'', company:'', role:'', channels:[], notes:''};
    const add = (kind,value) => { value=clean(value); if(value && !out.channels.some(c=>c.kind===kind && c.value===value)) out.channels.push({kind,value}); };
    if (/BEGIN:VCARD/i.test(text)) {
      if ((text.match(/BEGIN:VCARD/ig)||[]).length !== 1 || !/END:VCARD/i.test(text)) throw Error('Use one complete vCard at a time. Import contact files under Settings for multiple people.');
      const unescape = s => s.replace(/\\n/ig,'\n').replace(/\\([,;\\])/g,'$1');
      for (const line of text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/)) {
        const at=line.indexOf(':'); if(at<0) continue;
        const key=line.slice(0,at).split(';')[0].replace(/^item\d+\./i,'').toUpperCase(), v=unescape(line.slice(at+1));
        if (key==='FN') out.name=v;
        if (key==='N' && !out.name) out.name=v.split(';').filter(Boolean).reverse().join(' ');
        if (key==='ORG') out.company=v.replace(/;/g,', ');
        if (key==='TITLE') out.role=v;
        if (key==='EMAIL') add('email',v.replace(/^mailto:/i,''));
        if (key==='TEL') add('phone',v.replace(/^tel:/i,''));
        if (key==='NOTE') out.notes=v;
        if (key==='URL') { const u=safeURL(v); if(u) { if (/^(www\.)?linkedin\.com$/i.test(new URL(u).hostname)) add('linkedin',u); else out.notes += '\n'+u; } }
      }
      return out;
    }
    const lines=text.split(/\r?\n/).map(clean).filter(Boolean);
    for(const m of text.matchAll(/[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}/g)) add('email',m[0]);
    for(const m of text.matchAll(/(?:\+?\d[\d ().-]{5,}\d)/g)) if(m[0].replace(/\D/g,'').length>=7) add('phone',m[0]);
    for(const m of text.matchAll(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/gi)) add('linkedin',safeURL(/^https?:/i.test(m[0])?m[0]:'https://'+m[0]));
    for(const l of lines) {
      const w=l.match(/^(?:WeChat|微信)(?:\s*(?:ID|号))?\s*[:：]\s*(.+)$/i); if(w) add('wechat',w[1]);
      const n=l.match(/^(?:Name|姓名)\s*[:：]\s*(.+)$/i); if(n) out.name=n[1];
      const c=l.match(/^(?:Company|公司)\s*[:：]\s*(.+)$/i); if(c) out.company=c[1];
      const r=l.match(/^(?:Title|Role|职位|職位)\s*[:：]\s*(.+)$/i); if(r) out.role=r[1];
    }
    // Unlabelled lines remain tentative; the UI requires review before Save.
    const candidates=lines.filter(l=>!/[\d@:/：]/.test(l) && !/^(?:www\.|email|phone|tel|wechat|微信)/i.test(l));
    out.name ||= candidates.find(l=>!/(?:ltd|inc|company|有限公司|corporation)\b/i.test(l)) || '';
    out.company ||= candidates.find(l=>l!==out.name && /(?:ltd|inc|company|有限公司|corporation)/i.test(l)) || '';
    out.notes=text;
    return out;
  }
  function parseNdef(message) {
    const records=Array.from(message.records||[]); if(records.length>32) throw Error('Too many NFC records.');
    const parts=[]; let size=0;
    for(const r of records) {
      if(!['text','url','mime'].includes(r.recordType)) continue;
      if(r.recordType==='mime' && !/^(text\/(vcard|x-vcard|plain))$/i.test(r.mediaType||'')) continue;
      size += r.data?.byteLength||0; if(size>MAX_TEXT) throw Error('NFC contact is too large.');
      const s=new TextDecoder(r.encoding||'utf-8',{fatal:true}).decode(r.data);
      if(r.recordType==='url') { const u=safeURL(s); if(!u) throw Error('This NFC link is not a safe web address.'); parts.push(u); }
      else parts.push(s);
    }
    if(!parts.length) throw Error('No contact text, vCard or web link on this tag.');
    return parseText(parts.join('\n'));
  }
  function isPhoto(s) { return typeof s==='string' && s.length<=450000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s); }
  async function image(file, maxWidth=1200) {
    if(!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw Error('Choose a JPEG, PNG, WebP or phone photo.');
    if(file.size>20*1024*1024) throw Error('Choose a photo smaller than 20 MB.');
    const url=URL.createObjectURL(file);
    try {
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('This photo cannot be opened. Choose JPEG or PNG.'));i.src=url;});
      const scale=Math.min(1,maxWidth/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/jpeg',maxWidth<=480?0.75:0.9);
    } finally { URL.revokeObjectURL(url); }
  }
  const api={parseText,parseNdef,safeURL,isPhoto,image}; root.KeeperCapture=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window==='undefined'?globalThis:window);
