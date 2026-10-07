// Everything in one place: turns the export files people can already download from each service into one
// timeline, and each conversation into touches on the right person card.
// Leif 2026-10-03 01:14: "a aggregator of all social media in one place. all your messages all your mail all your calls
// all your instagram posts everything in one place for everybody on ce-net." Plan and sources: ../docs/AGGREGATOR.md.
// No logins and no scraping: the person downloads their own data from each service and drops the file here; it is read on
// the phone and nothing is uploaded.
(function (root) {
  "use strict";
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  const most = xs => { const n = {}; xs.forEach(x => { if (x) n[x] = (n[x] || 0) + 1; }); return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || ""; };
  // Instagram and Facebook exports write UTF-8 bytes as \u00XX escapes; this turns "Ã©" back into "é".
  const fixMeta = s => { try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };

  // ---- WhatsApp: "Export chat" > Without media gives "WhatsApp Chat with Ann Lee.txt" ----
  // iPhone: "[12/03/2024, 14:22:05] Ann Lee: hi"   Android: "12/03/2024, 14:22 - Ann Lee: hi"
  const WA = /^‎?\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\]?\s*(?:-\s*)?([^:]{1,60}):\s?(.*)$/;
  function waDate(a, b, c, h, m, s, ap, dayFirst) {
    let y, mo, d;
    if (a.length === 4) { y = +a; mo = +b; d = +c; } else { y = +c; if (y < 100) y += 2000; [d, mo] = dayFirst ? [+a, +b] : [+b, +a]; }
    h = +h; if (ap) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    return new Date(y, mo - 1, d, h, +m, +(s || 0)).getTime();
  }
  function whatsapp(text, fileName) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    const raw = [];
    for (const l of lines) {
      const m = l.match(WA);
      if (m) raw.push({m, text: m[9]});
      else if (raw.length && l.trim()) raw[raw.length - 1].text += "\n" + l;
    }
    // day-first unless a first field above 12 proves month-first is impossible the other way round
    const dayFirst = !raw.some(r => r.m[1].length < 4 && +r.m[2] > 12);
    const msgs = raw.map(r => ({at: waDate(r.m[1], r.m[2], r.m[3], r.m[4], r.m[5], r.m[6], r.m[7], dayFirst), from: clean(r.m[8]), text: r.text.trim()}))
      .filter(x => !/end-to-end encrypted|created group|added you|changed the subject/i.test(x.text) || x.from);
    const fromFile = (String(fileName || "").match(/WhatsApp Chat (?:with|-)\s*(.+?)(?:\.txt)?$/i) || [])[1];
    const authors = [...new Set(msgs.map(x => x.from))];
    const contact = fromFile ? clean(fromFile) : authors.length === 2 ? "" : "";
    return {source: "whatsapp", kind: "whatsapp", contacts: contact ? [{name: contact, messages: msgs}] : [], authors, messages: msgs, needsMe: !contact};
  }

  // ---- LinkedIn: Settings > Data privacy > Get a copy of your data > Messages gives messages.csv ----
  function csv(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x !== ""));
  }
  function linkedin(text) {
    const rows = csv(String(text));
    const head = rows.shift().map(h => h.trim().toUpperCase());
    const col = n => head.indexOf(n);
    const get = (r, n) => (col(n) >= 0 ? r[col(n)] || "" : "");
    const recs = rows.map(r => ({conv: get(r, "CONVERSATION ID"), from: clean(get(r, "FROM")), fromUrl: get(r, "SENDER PROFILE URL").trim(),
      to: clean(get(r, "TO")), toUrl: get(r, "RECIPIENT PROFILE URLS").trim(), at: Date.parse(get(r, "DATE").replace(" UTC", "Z").replace(" ", "T")) || Date.parse(get(r, "DATE")),
      text: clean(get(r, "CONTENT") || get(r, "SUBJECT"))}));
    const me = most(recs.map(r => r.fromUrl || r.from));
    const by = {};
    for (const r of recs) {
      const mine = (r.fromUrl || r.from) === me;
      const name = mine ? r.to.split(",")[0].trim() : r.from;
      const url = mine ? r.toUrl.split(",")[0].trim() : r.fromUrl;
      if (!name) continue;
      const k = url || name;
      (by[k] = by[k] || {name, linkedin: url, messages: []}).messages.push({at: r.at, from: mine ? "me" : name, text: r.text});
    }
    return {source: "linkedin", kind: "linkedin", contacts: Object.values(by), me};
  }

  // ---- Instagram: Your activity > Download your information > JSON; messages/inbox/<who>/message_1.json and posts_1.json ----
  function instagram(json, owner) {
    const d = typeof json === "string" ? JSON.parse(json) : json;
    if (Array.isArray(d) || d.media || (Array.isArray(d) && d[0] && d[0].media)) {
      const posts = (Array.isArray(d) ? d : [d]).map(p => { const m = (p.media || [])[0] || {}; return {at: (p.creation_timestamp || m.creation_timestamp || 0) * 1000, from: "me", text: fixMeta(p.title || m.title || "Posted a picture")}; });
      return {source: "instagram", kind: "instagram", contacts: [], posts};
    }
    const parts = (d.participants || []).map(p => fixMeta(p.name));
    const msgs = (d.messages || []).map(m => ({at: m.timestamp_ms, from: fixMeta(m.sender_name), text: fixMeta(m.content || (m.photos ? "Sent a photo" : m.share ? "Shared a link" : ""))})).filter(m => m.text);
    const me = owner || "";
    const others = parts.filter(p => p !== me);
    const name = fixMeta(d.title || "") || others[0] || "";
    msgs.forEach(m => { if (m.from === me) m.from = "me"; });
    return {source: "instagram", kind: "instagram", contacts: name ? [{name, group: others.length > 1, messages: msgs}] : [], authors: parts, needsMe: !me && parts.length > 1};
  }

  // ---- Email: Google Takeout > Mail gives one .mbox; any mail app can export .mbox too ----
  const addr = s => { const m = String(s || "").match(/<([^>]+)>/) || String(s || "").match(/([^\s,;]+@[^\s,;]+)/); return m ? m[1].toLowerCase() : ""; };
  const nameOf = s => { const m = String(s || "").match(/^\s*"?([^"<]+?)"?\s*</); return m ? clean(m[1]) : addr(s); };
  const unq = s => String(s || "").replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, e, t) => { try { return e.toLowerCase() === "b" ? decodeURIComponent(escape(atob(t))) : t.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))); } catch (x) { return t; } });
  function mbox(text, myAddress) {
    const parts = String(text).replace(/\r/g, "").split(/\n(?=From \S+.*\d{4}\s*\n)/);
    const mails = [];
    for (const p of parts) {
      const end = p.indexOf("\n\n"); const head = (end > 0 ? p.slice(0, end) : p).replace(/\n[ \t]+/g, " ");
      const h = k => ((head.match(new RegExp("^" + k + ":\\s*(.*)$", "mi")) || [])[1] || "");
      if (!h("From")) continue;
      mails.push({from: h("From"), to: h("To"), at: Date.parse(h("Date")) || 0, text: clean(unq(h("Subject"))) || "(no subject)"});
    }
    const me = (myAddress || most(mails.flatMap(m => [addr(m.from), ...m.to.split(",").map(addr)]))).toLowerCase();
    const by = {};
    for (const m of mails) {
      const mine = addr(m.from) === me;
      const who = mine ? m.to.split(",")[0] : m.from;
      const e = addr(who); if (!e || e === me || /no-?reply|notifications?@|mailer-daemon/i.test(e)) continue;
      (by[e] = by[e] || {name: nameOf(who), email: e, messages: []}).messages.push({at: m.at, from: mine ? "me" : nameOf(who), text: m.text});
    }
    return {source: "email", kind: "email", contacts: Object.values(by), me};
  }

  // ---- Calls: Android "SMS Backup & Restore" calls-*.xml (iPhone has no call-log export; see AGGREGATOR.md) ----
  function calls(xml) {
    const by = {};
    for (const m of String(xml).matchAll(/<call\s+([^>]*?)\/?>/g)) {
      const a = {}; for (const kv of m[1].matchAll(/(\w+)="([^"]*)"/g)) a[kv[1]] = kv[2];
      const num = (a.number || "").replace(/[^\d+]/g, ""); if (!num) continue;
      const type = {1: "Incoming call", 2: "Outgoing call", 3: "Missed call", 5: "Declined call"}[a.type] || "Call";
      const sec = +a.duration || 0;
      const name = a.contact_name && a.contact_name !== "(Unknown)" ? a.contact_name : num;
      (by[num] = by[num] || {name, phone: num, messages: []}).messages.push({at: +a.date, from: a.type === "2" ? "me" : name, text: type + (sec ? `, ${Math.round(sec / 60) || 1} min` : "")});
    }
    return {source: "calls", kind: "phone", contacts: Object.values(by)};
  }

  // ---- Phone contacts: iPhone Contacts › select all › Export vCard, Google Contacts › Export › vCard (.vcf) ----
  function vcard(text) {
    const cards = String(text).replace(/\r/g, "").replace(/\n[ \t]/g, "").split(/BEGIN:VCARD/i).slice(1);
    const contacts = cards.map(c => {
      const g = k => (c.match(new RegExp("^(?:item\\d+\\.)?" + k + "[;:][^\\n]*", "gim")) || []).map(l => l.slice(l.indexOf(":") + 1).trim()).filter(Boolean);
      const fn = g("FN")[0] || (g("N")[0] || "").split(";").slice(0, 2).reverse().join(" ").trim();
      const urls = g("URL").concat(g("X-SOCIALPROFILE")).filter(u => /linkedin\.com\/in\//i.test(u));
      return {name: clean(fn.replace(/\\,/g, ",")), company: clean((g("ORG")[0] || "").split(";")[0].replace(/\\,/g, ",")), role: clean(g("TITLE")[0] || ""),
        email: (g("EMAIL")[0] || "").toLowerCase(), phone: (g("TEL")[0] || "").replace(/[^\d+]/g, ""), linkedin: urls[0] || "", notes: clean((g("NOTE")[0] || "").replace(/\\n/g, " ")), messages: []};
    }).filter(c => c.name);
    return {source: "contacts", kind: "phone", contacts};
  }

  // Which parser fits this file
  function detect(name, text) {
    const n = String(name || "").toLowerCase(), t = String(text).slice(0, 2000);
    if (/\.vcf$/.test(n) || /^\uFEFF?BEGIN:VCARD/i.test(t)) return "vcard";
    if (/\.mbox$/.test(n) || /^From \S+/.test(t) && /\nFrom:/i.test(t)) return "mbox";
    if (/<calls\b|<call\s/.test(t)) return "calls";
    if (/^﻿?"?CONVERSATION ID/i.test(t)) return "linkedin";
    if (/^\s*[[{]/.test(t) && /(participants|sender_name|creation_timestamp|media)/.test(t)) return "instagram";
    if (WA.test(t.split("\n").find(l => l.trim()) || "") || /whatsapp/.test(n)) return "whatsapp";
    return "";
  }
  function read(name, text, opts) {
    opts = opts || {};
    const k = detect(name, text);
    if (k === "whatsapp") return whatsapp(text, name);
    if (k === "linkedin") return linkedin(text);
    if (k === "instagram") return instagram(text, opts.me);
    if (k === "mbox") return mbox(text, opts.email);
    if (k === "calls") return calls(text);
    if (k === "vcard") return vcard(text);
    return null;
  }

  // Put one read file into a Network Keeper db: a person per contact (matched by channel value, then exact name),
  // one touch per person per source per day (the reach-out rhythm counts days, not messages), the last 40 messages of each
  // conversation and every post in db.inbox for the one timeline.
  function merge(db, res, uid, now) {
    db.inbox = db.inbox || [];
    const out = {people: 0, added: 0, messages: 0, touches: 0};
    const norm = s => String(s || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[\s\-()/]/g, "");
    for (const c of res.contacts) {
      if ((!c.messages.length && res.source !== "contacts") || c.group) continue;
      const keys = [c.linkedin, c.email, c.phone].filter(Boolean).map(norm);
      let p = db.people.find(p => p.channels.some(ch => keys.includes(norm(ch.value)))) ||
        db.people.find(p => p.name.trim().toLowerCase() === c.name.trim().toLowerCase());
      if (!p) {
        p = {id: uid(), name: c.name, company: c.company || "", role: c.role || "", where: "", metAt: c.messages.length ? Math.min(...c.messages.map(m => m.at)) : (now || Date.now()), notes: c.notes || "", tags: "imported",
          priority: "C", cadence: 0, channels: [], touches: [], created: now || Date.now()};
        db.people.push(p); out.added++;
      }
      if (res.source === "contacts") { [["linkedin", c.linkedin], ["email", c.email], ["phone", c.phone]].forEach(([k, v]) => { if (v && !p.channels.some(ch => norm(ch.value) === norm(v))) p.channels.push({kind: k, value: v}); }); out.people++; continue; }
      const chan = c.linkedin ? ["linkedin", c.linkedin] : c.email ? ["email", c.email] : c.phone ? ["phone", c.phone] : res.kind === "whatsapp" ? ["whatsapp", ""] : null;
      if (chan && chan[1] && !p.channels.some(ch => norm(ch.value) === norm(chan[1]))) p.channels.push({kind: chan[0], value: chan[1]});
      if (chan && !chan[1] && !p.channels.some(ch => ch.kind === chan[0])) p.channels.push({kind: chan[0], value: ""});
      const days = new Set(p.touches.filter(t => t.src === res.source).map(t => new Date(t.at).toDateString()));
      const byDay = {};
      c.messages.forEach(m => { const k = new Date(m.at).toDateString(); if (!days.has(k) && (!byDay[k] || m.at > byDay[k].at)) byDay[k] = m; });
      Object.values(byDay).forEach(m => { p.touches.push({at: m.at, kind: res.kind === "instagram" ? "note" : res.kind, text: m.text.slice(0, 140), src: res.source}); out.touches++; });
      const seen = new Set(db.inbox.filter(x => x.person === p.id && x.src === res.source).map(x => x.at + x.text));
      c.messages.slice(-40).forEach(m => { if (!seen.has(m.at + m.text)) { db.inbox.push({at: m.at, src: res.source, person: p.id, who: m.from === "me" ? "me" : p.name, text: m.text.slice(0, 500)}); out.messages++; } });
      out.people++;
    }
    for (const m of res.posts || []) { const k = m.at + m.text; if (!db.inbox.some(x => x.src === "instagram-post" && x.at + x.text === k)) { db.inbox.push({at: m.at, src: "instagram-post", person: "", who: "me", text: m.text}); out.messages++; } }
    db.inbox.sort((a, b) => b.at - a.at);
    if (db.inbox.length > 4000) db.inbox.length = 4000;
    return out;
  }

  const api = {vcard, whatsapp, linkedin, instagram, mbox, calls, csv, detect, read, merge};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.NKAggregate = api;
})(typeof self !== "undefined" ? self : this);
