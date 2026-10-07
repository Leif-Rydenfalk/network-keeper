// LinkedIn profile -> Network Keeper profile. Two inputs, one parser:
//  1. the PDF LinkedIn makes from a profile (profile page > More > Save to PDF), read with pdf.js into lines with x and size;
//  2. text copied from the profile page and pasted (lines only).
// Leif 2026-10-01 ~21:00: "it should be easy to inport just using youer linked in profile". No LinkedIn login or scraping:
// the person exports their own profile, so only what they choose comes in, and they edit it before anything is published.
(function (root) {
  "use strict";
  const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
  const DATE = new RegExp("^(?:" + MON + "\\s+)?\\d{4}\\s*[-–]\\s*(?:(?:" + MON + "\\s+)?\\d{4}|present|now|today)(?:\\s*[·(].*)?$", "i");
  const DUR = /^\(?\s*(?:less than a year|\d+\s+(?:yrs?|years?|mos?|months?)(?:\s+\d+\s+(?:mos?|months?))?)\s*\)?$/i;
  const HEAD = {summary: "about", about: "about", experience: "experience", education: "education", "top skills": "skills", skills: "skills",
    contact: "contact", languages: "skip", certifications: "skip", "honors-awards": "skip", "honors & awards": "skip", publications: "skip",
    patents: "skip", projects: "skip", volunteering: "skip", "volunteer experience": "skip", recommendations: "skip", interests: "skip",
    activity: "skip", licenses: "skip", "licenses & certifications": "skip", courses: "skip", featured: "skip"};
  const PAGE = /^page \d+ of \d+$/i;
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();

  // lines: [{text, size?, x?}] in reading order. sidebarX: lines with x below it are the PDF's left column.
  function parse(lines, sidebarX) {
    lines = lines.map(l => typeof l === "string" ? {text: l} : l).map(l => ({...l, text: clean(l.text)})).filter(l => l.text && !PAGE.test(l.text));
    const side = sidebarX ? lines.filter(l => l.x < sidebarX) : [];
    const main = sidebarX ? lines.filter(l => !(l.x < sidebarX)) : lines;
    const out = {name: "", headline: "", location: "", about: "", skills: [], experience: [], education: [], linkedin: "", email: ""};
    const all = lines.map(l => l.text).join("\n");
    // the PDF breaks a long url over two lines: "www.linkedin.com/in/ann-lee-" + "4b2a1 (LinkedIn)"
    const i = lines.findIndex(l => /linkedin\.com\/in\//i.test(l.text));
    if (i >= 0) {
      let u = lines[i].text.match(/\S*linkedin\.com\/in\/[A-Za-z0-9\-_%]*/i)[0];
      const nx = lines[i + 1] && lines[i + 1].text;
      if (nx && /\(LinkedIn\)\s*$/i.test(nx) && !/\(LinkedIn\)/i.test(lines[i].text)) u += nx.split(/\s/)[0];
      out.linkedin = "https://" + u.replace(/^https?:\/\//, "").replace(/^(?:[a-z]{2,3}\.)?linkedin/, "www.linkedin");
    }
    const em = all.match(/[^\s@()]+@[^\s@()]+\.[a-z]{2,}/i); if (em) out.email = em[0];
    // sidebar (PDF): Top Skills
    let sec = "";
    for (const l of side) { const h = HEAD[l.text.toLowerCase()]; if (h) { sec = h; continue; } if (sec === "skills") out.skills.push(l.text); }
    // main column: name is the biggest text before the first section heading; with no sizes, the first line
    const first = main.findIndex(l => HEAD[l.text.toLowerCase()]);
    const top = main.slice(0, first < 0 ? Math.min(main.length, 4) : first);
    let ni = 0;
    if (top.some(l => l.size)) { const big = Math.max(...top.map(l => l.size || 0)); ni = top.findIndex(l => (l.size || 0) === big); }
    if (top[ni]) {
      out.name = top[ni].text;
      const rest = top.slice(ni + 1).map(l => l.text).filter(t => !/^(contact|connections?|\d+\+? connections|followers)/i.test(t));
      if (rest.length > 1 && !/[|,·]\s*$/.test(rest[rest.length - 2])) { out.location = rest.pop(); }
      out.headline = rest.join(" ").slice(0, 200);
    }
    sec = ""; const body = {about: [], experience: [], education: [], skills: []}, expL = [];
    for (const l of main.slice(first < 0 ? main.length : first)) {
      const h = HEAD[l.text.toLowerCase()]; if (h) { sec = h; continue; }
      if (body[sec]) body[sec].push(l.text); if (sec === "experience") expL.push(l);
    }
    out.about = body.about.join(" ").slice(0, 2600);
    if (body.skills.length) out.skills.push(...body.skills.filter(s => s.length < 60 && !/endorse/i.test(s)));
    out.skills = [...new Set(out.skills.map(clean).filter(Boolean))].slice(0, 50);
    out.experience = roles(expL);
    out.education = schools(body.education);
    return out;
  }
  // Experience: [company, (duration)], title, dates, (location), (description...). A company with several roles lists its
  // name once, then a total duration, then title + dates per role.
  // A line before a title is the company only when it looks like one: in the PDF it is set bigger than the dates line;
  // pasted text has no sizes, so a sentence (long, or ending in a full stop) is the last role's description instead.
  function roles(X) {
    const L = X.map(l => l.text), out = []; let org = "";
    const isOrg = (j, di) => { const t = L[j]; if (!t || DATE.test(t)) return false;
      if (X[j].size && X[di].size) return X[j].size > X[di].size && X[j].size >= (X[j + 1] && X[j + 1].size || 0);
      return t.length <= 60 && !/[.!?]$/.test(t); };
    for (let i = 0; i < L.length; i++) {
      if (!DATE.test(L[i])) continue;
      const title = L[i - 1] || ""; let o = org;
      if (i >= 2 && DUR.test(L[i - 2])) o = L[i - 3] || org;   // "Acme" / "3 years 2 months" / title / dates
      else if (i >= 2 && isOrg(i - 2, i) && !out.some(r => r._end === i - 2)) o = L[i - 2];
      org = o;
      out.push({title, org: o, when: L[i].replace(/\s*[·(].*$/, ""), detail: "", _end: i, _new: o !== (out.length ? out[out.length - 1].org : null)});
    }
    // what follows a role's dates (location, description) until the next role's title (and company lines) is its detail
    for (let k = 0; k < out.length; k++) {
      const n = out[k + 1], from = out[k]._end + 1;
      let to = n ? n._end - 1 : L.length;
      if (n && n._new) to -= DUR.test(L[n._end - 2] || "") ? 2 : 1;
      out[k].detail = L.slice(from, Math.max(from, to)).filter(t => !DUR.test(t)).join(" ").slice(0, 600);
    }
    return out.map(({_end, _new, ...r}) => r).slice(0, 30);
  }
  // Education: school, then "Degree, Field · (2010 - 2014)"
  function schools(L) {
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(/^(.*?)\s*·?\s*\((.*\d{4}.*)\)\s*$/);
      if (m) { out.push({title: clean(m[1]), org: L[i - 1] || "", when: clean(m[2]), detail: ""}); continue; }
      if (i + 1 >= L.length && !out.some(e => e.org === L[i])) out.push({title: "", org: L[i], when: "", detail: ""});
    }
    return out.slice(0, 15);
  }
  // pdf.js page -> lines with x (left edge) and size, in reading order
  async function pdfLines(pdfjs, data) {
    const doc = await pdfjs.getDocument({data}).promise; const lines = []; let width = 612;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p); width = page.view[2] || width;
      const tc = await page.getTextContent(); const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4], y = Math.round(it.transform[5]), size = Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10;
        const col = x < width * 0.33 ? 0 : 1, k = col + ":" + y;
        const r = rows.get(k) || {text: "", x, y, size, col, page: p}; r.text += (r.text ? " " : "") + it.str; r.size = Math.max(r.size, size); r.x = Math.min(r.x, x); rows.set(k, r);
      }
      lines.push(...[...rows.values()].sort((a, b) => a.col - b.col || b.y - a.y));
    }
    return {lines, sidebarX: width * 0.33};
  }
  const api = {parse, pdfLines};
  if (typeof module !== "undefined") module.exports = api; else root.LinkedInImport = api;
})(this);
