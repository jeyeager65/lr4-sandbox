// web/help/: the help videos (Part 43d). index.json lists files that exist; each script parses with no warnings, is a
// valid FluidNC job (every line <= 127 bytes, a move), says its KIND as listed, and its Point / Click / Step ids are
// elements of web/index.html (or made by the page: none yet). Also the Design / Inspect lines name what exists.
//   node tests/test_help_scripts.js   (in npm test)
"use strict";
const fs = require("fs"), path = require("path");
const DS = require("../web/js/demo_script.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };

const HELP = path.join(__dirname, "../web/help"), html = fs.readFileSync(path.join(__dirname, "../web/index.html"), "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const index = JSON.parse(fs.readFileSync(path.join(HELP, "index.json"), "utf8"));
ok(Array.isArray(index.videos) && index.videos.length >= 5, `index.json: ${index.videos && index.videos.length} videos`);
ok(new Set(index.videos.map((v) => v.id)).size === index.videos.length, "ids unique");
for (const v of index.videos) {
  const f = path.join(HELP, v.file || v.id + ".gcode");
  ok(fs.existsSync(f), `${v.id}: ${v.file} exists`);
  if (!fs.existsSync(f)) continue;
  ok(/^[\w-]+$/.test(v.id) && v.title && v.blurb && v.secs > 0 && ["machine", "ui"].includes(v.kind), `${v.id}: id, title, blurb, secs, kind`);
  const text = fs.readFileSync(f, "utf8"), s = DS.parse(text);
  ok(!s.warnings.length, `${v.id}: no warnings (${s.warnings.join("; ")})`);
  ok(s.firstMove > 0, `${v.id}: a job (a move)`);
  ok((s.settings.kind || "machine") === v.kind, `${v.id}: KIND ${s.settings.kind || "machine"} as listed (${v.kind})`);
  ok(Array.isArray(s.settings.machine), `${v.id}: MACHINE= (the same for every viewer)`);
  const long = text.split(/\r?\n/).filter((l) => Buffer.byteLength(l) > 127);
  ok(!long.length, `${v.id}: lines <= 127 bytes (${long.length} longer)`);
  for (const c of [...s.intro, ...s.at].filter((q) => ["point", "click", "step"].includes(q.kind)))
    ok(ids.has(c.kv.id), `${v.id}: line ${c.line}: #${c.kv.id} is in web/index.html`);
  const hasClickHome = s.intro.some((c) => (c.kind === "click" && /^home/.test(c.kv.id)) || c.kind === "home");
  ok(hasClickHome, `${v.id}: homes (Home or a clicked Home) before its job`);
}
// the welcome card's tour link plays an id that exists
ok(/id="wc-tour"/.test(html) && index.videos.some((v) => v.id === "tour"), "the welcome card's tour is in index.json");
console.log(fails ? `help scripts: ${fails} of ${checks} failed` : `help scripts: all ${checks} passed`);
process.exit(fails ? 1 : 0);
