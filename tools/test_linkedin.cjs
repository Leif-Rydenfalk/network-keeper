// node --test tools/test_linkedin.cjs : the LinkedIn parser on a PDF-shaped sample (two columns, sizes) and on pasted text.
const test = require("node:test"); const assert = require("node:assert/strict"); const {parse} = require("../app/linkedin.js");
const L = (text, x, size) => ({text, x, size});
const pdf = [
  L("Contact", 30, 13), L("ann.lee@example.com", 30, 10), L("www.linkedin.com/in/ann-lee-", 30, 10), L("4b2a1 (LinkedIn)", 30, 10),
  L("Top Skills", 30, 13), L("KiCad", 30, 10), L("PCB Design", 30, 10), L("DFM", 30, 10),
  L("Ann Lee", 220, 26), L("Hardware engineer | PCB and DFM for consumer devices", 220, 12), L("Shenzhen, Guangdong, China", 220, 10),
  L("Summary", 220, 16), L("I take boards from schematic to mass production.", 220, 10),
  L("Experience", 220, 16), L("Acme Robotics", 220, 12), L("3 years 2 months", 220, 10),
  L("Lead PCB Engineer", 220, 11), L("January 2024 - Present (1 year 10 months)", 220, 10), L("Shenzhen", 220, 10), L("Owns the motor driver boards.", 220, 10),
  L("PCB Engineer", 220, 11), L("Sep 2022 - Dec 2023 (1 year 4 months)", 220, 10),
  L("Foxlink", 220, 12), L("Test Engineer", 220, 11), L("2019 - 2022 (3 years)", 220, 10),
  L("Education", 220, 16), L("Harbin Institute of Technology", 220, 12), L("Bachelor of Engineering, Electronics · (2015 - 2019)", 220, 10),
  L("Page 1 of 2", 220, 9)];
test("PDF: name, headline, location, skills, roles, school, url, email", () => {
  const p = parse(pdf, 200);
  assert.equal(p.name, "Ann Lee"); assert.equal(p.location, "Shenzhen, Guangdong, China");
  assert.match(p.headline, /^Hardware engineer/); assert.deepEqual(p.skills, ["KiCad", "PCB Design", "DFM"]);
  assert.equal(p.linkedin, "https://www.linkedin.com/in/ann-lee-4b2a1"); assert.equal(p.email, "ann.lee@example.com");
  assert.deepEqual(p.experience.map(e => [e.title, e.org, e.when]), [
    ["Lead PCB Engineer", "Acme Robotics", "January 2024 - Present"], ["PCB Engineer", "Acme Robotics", "Sep 2022 - Dec 2023"], ["Test Engineer", "Foxlink", "2019 - 2022"]]);
  assert.match(p.experience[0].detail, /motor driver/);
  assert.equal(p.education[0].org, "Harbin Institute of Technology"); assert.equal(p.education[0].when, "2015 - 2019");
  assert.match(p.about, /mass production/);
});
test("pasted text: first line is the name, sections still split", () => {
  const p = parse(["Ann Lee", "Hardware engineer", "Shenzhen", "About", "Boards to mass production.", "Experience", "PCB Engineer", "Acme", "2022 - Present", "Skills", "KiCad", "DFM"]);
  assert.equal(p.name, "Ann Lee"); assert.equal(p.headline, "Hardware engineer"); assert.equal(p.location, "Shenzhen");
  assert.deepEqual(p.skills, ["KiCad", "DFM"]); assert.equal(p.experience.length, 1); assert.equal(p.experience[0].when, "2022 - Present");
});
