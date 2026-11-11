// web/help/: Learn's clips (Part 43d, 47b). index.json lists files that exist; each has a clean (Video Learn: ...)
// header (title, group, kind, a line; demo_script.js learnOf: no errors, no warnings) and every line <= 127 bytes.
// A demo is a valid FluidNC job (a move, MACHINE=, homes first) whose Point / Click / Step ids are elements of
// web/index.html; a mine clip is its one BitChange / TouchPlate line. Also the Design / Inspect lines name what exists.
//   node tests/test_help_scripts.js   (in npm test)
"use strict";
const fs = require("fs"), path = require("path");
const DS = require("../web/js/demo_script.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };

const HELP = path.join(__dirname, "../web/help"), html = fs.readFileSync(path.join(__dirname, "../web/index.html"), "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const ST = require("../web/js/show_tree.js");
const PARTS = JSON.parse(fs.readFileSync(path.join(__dirname, "../web/data/lr4_config.json"), "utf8")).parts.map((p) => p.meta.name);
const ASMS = ST.ASM.map((a) => a[0]), GROUP_IDS = new Set([...ASMS, ...ASMS.flatMap((a) => ST.KINDS.map((k) => `${a}.${k[0]}`))]);
const showKnows = (x) => (x.includes("*")
  ? PARTS.some((p) => new RegExp("^" + x.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(p))
  : GROUP_IDS.has(x) || PARTS.includes(x));
const index = JSON.parse(fs.readFileSync(path.join(HELP, "index.json"), "utf8"));
ok(Array.isArray(index.files) && index.files.length >= 7, `index.json: ${index.files && index.files.length} files`);
const idOf = (f) => f.file.replace(/\.[^.]+$/, "");
ok(new Set(index.files.map(idOf)).size === index.files.length, "ids unique");
const GROUPS = ["Getting started", "Setting up", "Running a job", "Bits and collets", "Probing / zero", "Maintenance"];
for (const v of index.files) {
  const id = idOf(v), f = path.join(HELP, v.file);
  ok(fs.existsSync(f), `${id}: ${v.file} exists`);
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, "utf8"), s = DS.parse(text), L = DS.learnOf(s, v.file);
  ok(/^[\w-]+$/.test(id) && L.title !== id && L.blurb && GROUPS.includes(L.group), `${id}: header NAME, DESC, a built-in GROUP (${L.title} | ${L.group})`);
  ok(!L.errors.length, `${id}: no errors or warnings (${L.errors.join("; ")})`);
  const long = text.split(/\r?\n/).filter((l) => Buffer.byteLength(l) > 127);
  ok(!long.length, `${id}: lines <= 127 bytes (${long.length} longer)`);
  if (L.type === "mine") { ok(!!L.mine && !v.secs, `${id}: mine - its BitChange / TouchPlate, length from the script`); continue; }
  ok(v.secs > 0, `${id}: a demo's measured secs`);
  ok(s.firstMove > 0, `${id}: a job (a move)`);
  ok(Array.isArray(s.settings.machine), `${id}: MACHINE= (the same for every viewer)`);
  for (const c of [...s.intro, ...s.at].filter((q) => ["point", "click", "step"].includes(q.kind)))
    ok(ids.has(c.kv.id), `${id}: line ${c.line}: #${c.kv.id} is in web/index.html`);
  // Show lines: an assembly, "asm.kind", a part or a part pattern (as the page's LR4Show.apply; test_page_help_all
  // plays the clips, but only before a release)
  for (const c of [...s.intro, ...s.at].filter((q) => q.kind === "show")) {
    const sh = DS.showOf(c), bad = [...(sh.hide || []), ...(sh.show || [])].filter((x) => !showKnows(x));
    if (sh.preset && !ST.PRESETS.some(([p]) => p === sh.preset)) bad.push("PRESET=" + sh.preset);
    ok(!bad.length, `${id}: line ${c.line}: Show knows its ids (not: ${bad.join(", ")})`);
  }
  const hasClickHome = s.intro.some((c) => (c.kind === "click" && /^home/.test(c.kv.id)) || c.kind === "home");
  ok(hasClickHome, `${id}: homes (Home or a clicked Home) before its job`);
}
// the welcome card's tour link plays an id that exists
ok(/id="wc-tour"/.test(html) && index.files.some((v) => idOf(v) === "tour"), "the welcome card's tour is in index.json");
console.log(fails ? `help scripts: ${fails} of ${checks} failed` : `help scripts: all ${checks} passed`);
process.exit(fails ? 1 : 0);
