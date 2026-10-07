// node tools/test_aggregate.cjs: every export format the aggregator reads, then merge into a db.
const A = require("../app/aggregate.js");
const assert = require("assert");
let n = 0; const ok = (name, f) => { f(); n++; console.log("ok", name); };
const uid = (() => { let i = 0; return () => "p" + ++i; })();

ok("whatsapp iphone export, contact from file name", () => {
  const t = "[12/03/2024, 14:22:05] Ann Lee: hi Lola\n[12/03/2024, 14:23:10] Lola Tan: hey! coffee friday?\nsecond line\n[13/03/2024, 09:00:00] Ann Lee: yes";
  const r = A.read("WhatsApp Chat with Ann Lee.txt", t);
  assert.equal(r.source, "whatsapp"); assert.equal(r.contacts[0].name, "Ann Lee"); assert.equal(r.messages.length, 3);
  assert.equal(r.messages[1].text, "hey! coffee friday?\nsecond line");
  assert.equal(new Date(r.messages[0].at).getMonth(), 2);
});
ok("whatsapp android export, month-first inferred", () => {
  const r = A.whatsapp("3/25/24, 9:05 PM - Bo Chen: see you\n3/26/24, 8:00 AM - Lola: ok", "WhatsApp Chat with Bo Chen.txt");
  const d = new Date(r.messages[0].at); assert.equal(d.getDate(), 25); assert.equal(d.getHours(), 21);
});
ok("linkedin messages.csv, me found, contact keyed by profile url", () => {
  const t = 'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER\n' +
    'c1,,Lola Tan,https://www.linkedin.com/in/lolatan,Ann Lee,https://www.linkedin.com/in/annlee,2024-05-01 10:00:00 UTC,,"Great to meet you, Ann",INBOX\n' +
    'c1,,Ann Lee,https://www.linkedin.com/in/annlee,Lola Tan,https://www.linkedin.com/in/lolatan,2024-05-02 10:00:00 UTC,,Likewise!,INBOX\n' +
    'c2,,Lola Tan,https://www.linkedin.com/in/lolatan,Max Wu,https://www.linkedin.com/in/maxwu,2024-06-01 10:00:00 UTC,,Hello Max,INBOX\n';
  const r = A.read("messages.csv", t);
  assert.equal(r.me, "https://www.linkedin.com/in/lolatan"); assert.equal(r.contacts.length, 2);
  const ann = r.contacts.find(c => c.name === "Ann Lee"); assert.equal(ann.messages.length, 2); assert.equal(ann.messages[0].from, "me");
  assert.equal(ann.messages[0].text, "Great to meet you, Ann");
});
ok("instagram dm json with mojibake fixed", () => {
  const j = JSON.stringify({participants: [{name: "RenÃ©e"}, {name: "Lola Tan"}], messages: [{sender_name: "RenÃ©e", timestamp_ms: 1700000000000, content: "cafÃ©?"}, {sender_name: "Lola Tan", timestamp_ms: 1700000100000, content: "yes"}], title: "RenÃ©e"});
  const r = A.read("message_1.json", j, {me: "Lola Tan"});
  assert.equal(r.contacts[0].name, "Renée"); assert.equal(r.contacts[0].messages[0].text, "café?"); assert.equal(r.contacts[0].messages[1].from, "me");
});
ok("instagram posts json goes to the timeline", () => {
  const r = A.instagram([{media: [{uri: "a.jpg", creation_timestamp: 1700000000, title: "Night sky"}]}]);
  assert.equal(r.posts.length, 1); assert.equal(r.posts[0].text, "Night sky");
});
ok("mbox: me is the common address, noreply dropped, encoded subject", () => {
  const t = "From 1@x Mon Jan 01 00:00:00 +0000 2024\nFrom: Lola <lola@x.com>\nTo: Ann Lee <ann@a.com>\nDate: Mon, 1 Jan 2024 10:00:00 +0000\nSubject: =?UTF-8?B?Q2Fmw6k=?=\n\nbody\n" +
    "From 2@x Tue Jan 02 00:00:00 +0000 2024\nFrom: \"Ann Lee\" <ann@a.com>\nTo: lola@x.com\nDate: Tue, 2 Jan 2024 10:00:00 +0000\nSubject: Re: hi\n\nbody\n" +
    "From 3@x Wed Jan 03 00:00:00 +0000 2024\nFrom: Shop <noreply@shop.com>\nTo: lola@x.com\nDate: Wed, 3 Jan 2024 10:00:00 +0000\nSubject: Sale\n\nbody\n";
  const r = A.read("All mail.mbox", t);
  assert.equal(r.me, "lola@x.com"); assert.equal(r.contacts.length, 1); assert.equal(r.contacts[0].name, "Ann Lee");
  assert.equal(r.contacts[0].messages[0].text, "Café");
});
ok("android call log xml", () => {
  const r = A.read("calls-2024.xml", '<?xml version="1.0"?><calls count="2"><call number="+8613800000000" duration="125" date="1700000000000" type="2" contact_name="Bo Chen" /><call number="+8613800000000" duration="0" date="1700000500000" type="3" contact_name="Bo Chen" /></calls>');
  assert.equal(r.contacts[0].name, "Bo Chen"); assert.equal(r.contacts[0].messages[0].text, "Outgoing call, 2 min"); assert.equal(r.contacts[0].messages[1].text, "Missed call");
});
ok("merge: matches existing person by channel, adds new, one touch per day, idempotent", () => {
  const db = {people: [{id: "x", name: "Ann L.", channels: [{kind: "linkedin", value: "linkedin.com/in/annlee"}], touches: [], priority: "A"}], followups: []};
  const t = 'CONVERSATION ID,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,CONTENT\n' +
    'c1,Lola,https://www.linkedin.com/in/lola,Ann Lee,https://www.linkedin.com/in/annlee,2024-05-01 10:00:00 UTC,a\n' +
    'c1,Lola,https://www.linkedin.com/in/lola,Ann Lee,https://www.linkedin.com/in/annlee,2024-05-01 11:00:00 UTC,b\n' +
    'c2,Lola,https://www.linkedin.com/in/lola,Max Wu,https://www.linkedin.com/in/maxwu,2024-06-01 10:00:00 UTC,c\n';
  const r = A.linkedin(t);
  const o = A.merge(db, r, uid, 1);
  assert.equal(o.added, 1); assert.equal(db.people.length, 2);
  assert.equal(db.people[0].touches.length, 1); assert.equal(db.people[0].touches[0].text, "b");
  assert.equal(db.inbox.length, 3);
  const o2 = A.merge(db, A.linkedin(t), uid, 1);
  assert.equal(o2.touches, 0); assert.equal(o2.messages, 0); assert.equal(db.people.length, 2);
});
ok("detect returns empty for an unknown file", () => assert.equal(A.read("x.txt", "hello world"), null));
ok("vcard: phone contacts become cards with all channels, matched on re-import", () => {
  const t = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lee;Ann;;;\r\nFN:Ann Lee\r\nORG:Hardware Club;\r\nTITLE:Organizer\r\nEMAIL;type=INTERNET:Ann@a.com\r\nTEL;type=CELL:+86 138 0000 1111\r\nitem1.URL:https://www.linkedin.com/in/annlee\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Bo Chen\r\nEND:VCARD\r\n";
  const r = A.read("contacts.vcf", t);
  assert.equal(r.contacts.length, 2); assert.equal(r.contacts[0].email, "ann@a.com"); assert.equal(r.contacts[0].phone, "+8613800001111");
  const db = {people: [], followups: []}; const o = A.merge(db, r, uid, 1);
  assert.equal(o.added, 2); assert.equal(db.people[0].channels.length, 3); assert.equal(db.people[0].company, "Hardware Club");
  const o2 = A.merge(db, A.read("contacts.vcf", t), uid, 1); assert.equal(o2.added, 0); assert.equal(db.people[0].channels.length, 3);
});
console.log(n + " passed");
