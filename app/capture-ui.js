// Local camera/OCR/NFC lifecycle, integrated with the existing contact editor. foreman/win-e4fa.
let captureCleanup = null;
function stopCapture() { if(captureCleanup) { const fn=captureCleanup;captureCleanup=null;fn(); } }
function captureControls() {
  return `<section aria-label="Quick capture" class="capture-box">
    <b>Add someone you just met</b><p class="note">1. Capture a card or tap NFC. 2. Check the details. 3. Save.</p>
    <div class="capture-actions"><button type="button" class="btn soft" id="cardPick">Scan business card</button><button type="button" class="btn soft" id="selfiePick">Take selfie / portrait</button><button type="button" class="btn soft" id="nfcPick">Read NFC / reader</button></div>
    <input hidden type="file" accept="image/*" capture="environment" id="cardFile">
    <input hidden type="file" accept="image/*" capture="user" id="selfieFile">
    <div id="photoBox" hidden><img id="photoPreview" alt="Contact portrait preview"><button class="btn link" id="photoRemove">Remove photo</button></div>
    <div id="cardBox" hidden><img id="cardPreview" alt="Business card preview"><label for="ocrLang">Card language</label><select id="ocrLang"><option value="eng">English</option><option value="eng+chi_sim">English + 简体中文</option><option value="eng+chi_tra">English + 繁體中文</option></select><button class="btn wide" id="ocrRead">Read card text</button></div>
    <div id="nfcBox" hidden><p class="note" id="nfcSupport"></p><button class="btn wide" id="nfcStart">Start NFC scan</button><button class="btn soft wide" id="nfcStop" hidden>Stop NFC scan</button>
    <div id="readerTags"></div><label for="readerUID">Reader tag ID (optional)</label><input id="readerUID" maxlength="128" autocomplete="off" placeholder="Focus here, then tap a keyboard-mode reader"><button class="btn link" id="readerLink">Use this tag ID</button><p class="note">A keyboard-mode reader types an ID or contact text. An ID has no contact details: associate it with this person, then Save. It is a lookup shortcut, not proof of identity. PC/SC-only USB readers need their vendor app to export a vCard.</p>
    <label for="nfcFile">Open a contact file from a reader</label><input type="file" id="nfcFile" accept=".vcf,.txt,text/vcard,text/plain"></div>
    <details id="captureTextDetails"><summary>Review card text or paste reader output</summary><label for="captureText">Contact text or one vCard</label><textarea id="captureText" maxlength="32000" placeholder="Paste a name, email, phone or vCard"></textarea><button class="btn soft wide" id="captureApply">Fill empty fields for review</button></details>
    <p class="note" id="captureStatus" role="status" aria-live="polite">Photos and card recognition stay on this device. Nothing is saved until you tap Save. A selfie is a photo reminder; enter the name yourself.</p>
    <button class="btn link" id="captureCancel" hidden>Cancel capture</button>
  </section>`;
}
let ocrScript;
function loadOCR() {
  if(window.Tesseract) return Promise.resolve();
  if(!ocrScript) ocrScript=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>{ocrScript=null;s.remove();reject(Error('Card reader could not load. Connect once to download it, or paste the card text below.'));};document.head.append(s);});
  return ocrScript;
}
function mountCapture(person, applyChannels) {
  let alive=true, generation=0, worker=null, controller=null, card='', photo=KeeperCapture.isPhoto(person.photo)?person.photo:'', nfcIds=[...(person.nfcIds||[])];
  const get=id=>document.getElementById(id), say=text=>{if(alive)get('captureStatus').textContent=text;};
  const endNFC=()=>{controller?.abort();controller=null;if(alive){get('nfcStart').disabled=false;get('nfcStop').hidden=true;}};
  const cancel=()=>{generation++;endNFC();if(worker){worker.terminate();worker=null;}if(alive){get('ocrRead').disabled=false;get('captureCancel').hidden=true;}};
  captureCleanup=()=>{alive=false;cancel();};
  const renderPhoto=()=>{get('photoBox').hidden=!photo;get('photoPreview').src=photo||'';};renderPhoto();
  get('photoRemove').onclick=()=>{photo='';renderPhoto();};
  const apply=parsed=>{
    for(const k of ['name','company','role']) if(!get('f_'+k).value.trim()) get('f_'+k).value=parsed[k]||'';
    if(parsed.notes) { const old=get('f_notes').value; if(!old.includes(parsed.notes)) get('f_notes').value=[old,parsed.notes].filter(Boolean).join('\n'); }
    applyChannels(parsed.channels||[]); say('Details filled. Check the name, company and channels below, then tap Save.');
  };
  const review=text=>{get('captureText').value=text;get('captureTextDetails').open=true;};
  get('captureApply').onclick=()=>{try { const text=get('captureText').value;if(!text.trim())throw Error('Paste contact text first.');apply(KeeperCapture.parseText(text)); }catch(e){say(e.message);}};
  get('cardPick').onclick=()=>get('cardFile').click();get('selfiePick').onclick=()=>get('selfieFile').click();
  async function pick(file,kind) {
    cancel();const token=generation;if(!file)return; say('Opening photo…');
    try {const data=await KeeperCapture.image(file,kind==='selfie'?480:1800);if(!alive||token!==generation)return;
      if(kind==='selfie'){if(!KeeperCapture.isPhoto(data))throw Error('Photo is too large. Choose a smaller photo.');photo=data;renderPhoto();say('Photo ready. Enter the name and check the details below, then Save.');}
      else {card=data;get('cardPreview').src=data;get('cardBox').hidden=false;say('Check the card is sharp and fills the photo, choose its language, then Read card text.');}
    }catch(e){if(alive&&token===generation)say(e.message);}
  }
  get('cardFile').onchange=e=>{pick(e.target.files[0],'card');e.target.value='';};get('selfieFile').onchange=e=>{pick(e.target.files[0],'selfie');e.target.value='';};
  get('captureCancel').onclick=()=>{cancel();say('Capture stopped. You can enter the details yourself.');};
  get('ocrRead').onclick=async()=>{
    if(!card)return;cancel();const token=generation;get('ocrRead').disabled=true;get('captureCancel').hidden=false;
    say('Loading card reader on this device. The first use needs a connection.');
    let activeWorker;
    try {await loadOCR();if(!alive||token!==generation)return;
      activeWorker=await Tesseract.createWorker(get('ocrLang').value,1,{workerPath:new URL('vendor/ocr/worker.min.js',location.href).href,corePath:new URL('vendor/ocr/',location.href).href,langPath:new URL('vendor/ocr/',location.href).href,logger:m=>{if(alive&&token===generation)say(m.status+(Number.isFinite(m.progress)?' '+Math.round(m.progress*100)+'%':''));}});
      if(!alive||token!==generation){await activeWorker.terminate();return;}worker=activeWorker;
      const {data}=await activeWorker.recognize(card);if(!alive||token!==generation)return;
      review(data.text);say(data.text.trim()?'Card text ready. Correct any mistakes, then Fill empty fields for review.':'No text found. Retake a sharper photo or type the details below.');
    }catch(e){if(alive&&token===generation)say('Could not read this card. Try a sharper photo or paste its text. '+e.message);}
    finally {if(activeWorker){await activeWorker.terminate().catch(()=>{});if(worker===activeWorker)worker=null;}if(alive&&token===generation){get('ocrRead').disabled=false;get('captureCancel').hidden=true;}}
  };
  get('nfcPick').onclick=()=>{get('nfcBox').hidden=false;const supported='NDEFReader' in window && window.isSecureContext;get('nfcStart').hidden=!supported;get('nfcSupport').textContent=supported?'Tap Start NFC scan, allow access, then hold a contact tag against your phone.':'Direct NFC scanning is unavailable in this browser. Use Chrome on an NFC-capable Android phone, paste reader output, or open a vCard file below. On iPhone, a URL tag can open its contact page; export its vCard to import here.';};
  const showTags=()=>{get('readerTags').innerHTML=nfcIds.map((id,i)=>`<div class="note">${esc(id)} <button class="btn link" data-untag="${i}">Remove association</button></div>`).join('');};showTags();
  get('readerTags').onclick=e=>{const b=e.target.closest('[data-untag]');if(b){nfcIds.splice(Number(b.dataset.untag),1);showTags();say('Association removed from this draft. Tap Save to keep the change.');}};
  const useUID=()=>{const value=get('readerUID').value.trim();if(!value||value.length>128||/[\r\n<>]/.test(value)){say('Enter a tag ID (1–128 characters).');return;}
    const other=db.people.find(p=>p.id!==person.id&&(p.nfcIds||[]).some(id=>id.toLowerCase()===value.toLowerCase()));
    if(other){say('This tag is already associated with '+other.name+'. No association changed.');return;}
    if(!nfcIds.some(id=>id.toLowerCase()===value.toLowerCase()))nfcIds.push(value);showTags();say('Tag associated with this draft. Enter or check the name, then Save.');};
  get('readerLink').onclick=useUID;get('readerUID').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();useUID();}};
  get('nfcStop').onclick=()=>{endNFC();say('NFC scan stopped.');};
  get('nfcStart').onclick=async()=>{
    endNFC();const scan=new AbortController();controller=scan;get('nfcStart').disabled=true;get('nfcStop').hidden=false;
    try {const reader=new NDEFReader();
      reader.onreadingerror=()=>say('Tag could not be read. Keep it still, or use a vCard or reader text.');
      reader.onreading=e=>{if(!alive||scan.signal.aborted)return;try{const parsed=KeeperCapture.parseNdef(e.message);endNFC();apply(parsed);}catch(err){say(err.message);}};
      await reader.scan({signal:scan.signal});if(alive&&!scan.signal.aborted)say('Ready. Hold the contact tag near the phone. Keep this screen open.');
    }catch(e){if(alive&&!scan.signal.aborted){endNFC();say(e.name==='NotAllowedError'?'NFC permission was declined. Allow NFC in browser settings or use reader text.':'NFC is unavailable: '+e.message);}}
  };
  get('nfcFile').onchange=async e=>{const f=e.target.files[0],token=generation;if(!f)return;try {if(f.size>32000)throw Error('Choose one contact file smaller than 32 KB.');const text=await f.text();if(!alive||token!==generation)return;review(text);apply(KeeperCapture.parseText(text));}catch(err){say(err.message);}e.target.value='';};
  return ()=>({photo,nfcIds});
}
function sheetCaptureHelp() {
  openSheet(`<h2>Meet someone. Keep in touch.</h2><ol class="capture-guide"><li><b>Add a person.</b> Tap +. Scan their business card, read an NFC contact tag, take a portrait, or type their name.</li><li><b>Check before saving.</b> Card recognition can make mistakes. Add their channels and where you met. A selfie is only a photo reminder.</li><li><b>Choose when to reconnect.</b> A is every 14 days, B every 30, C every 90. Set a custom rhythm if needed.</li><li><b>Come back to Today.</b> Open a person to log a conversation or set a follow-up. Use Merge if you saved the same person twice.</li></ol><p class="note">Contacts and photos stay in this browser. Export a backup in Settings before changing phones or clearing browser data. Me → List me is a separate, optional public profile.</p><p class="note">NFC: direct scans require a supported Android browser and NDEF contact tags. Keyboard-mode readers can enter contact text or a tag ID. Other readers can export a vCard. No contact details are inferred from a tag ID.</p><div class="actions"><button class="btn soft" id="closeS">Close</button><button class="btn" id="helpAdd">Add a person</button></div>`);
  document.getElementById('helpAdd').onclick=()=>sheetEdit(null);
}
document.addEventListener('click',e=>{if(e.target.closest('[data-act="capturehelp"]'))sheetCaptureHelp();});
