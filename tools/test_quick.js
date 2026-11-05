// Which tests cover what changed: changed files -> the unit + page tests that use them, with the reason for each and
// the last known time (build/pt2/summary.txt). The full page suite takes ~85 min; this picks the few that matter.
//   node tools/test_quick.js                 changes vs HEAD (staged, unstaged, untracked)
//   node tools/test_quick.js --since <ref>   changes since a commit (e.g. origin/main)
//   node tools/test_quick.js <file> ...      just these files
//   add --run to run them (one at a time; timeout 1800 s each; summary at the end), --page / --unit for one kind
// How: a test is picked when it names the file (its module name / path / window global), or a function / mesh name /
// element id that the diff adds or removes. Names that most page tests use anyway (meshes, meta ...) don't count.
"use strict";
const fs = require("fs"), path = require("path"), { execSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, ".."), TESTS = path.join(ROOT, "tests");
const argv = process.argv.slice(2), flag = (f) => argv.includes(f);
const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }); } catch (e) { return ""; } };

// --- what changed -------------------------------------------------------------------------------------------------
const since = argv.includes("--since") ? argv[argv.indexOf("--since") + 1] : "HEAD";
const explicit = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");
let files = explicit.length ? explicit.map((f) => path.relative(ROOT, path.resolve(f)).replace(/\\/g, "/"))
  : [...new Set([...sh(`git diff --name-only ${since}`).split("\n"), ...sh("git ls-files --others --exclude-standard").split("\n")])];
files = files.filter((f) => f && !f.startsWith("tests/node_modules/"));

// names a diff adds or removes: functions, methods, consts, mesh / part names in quotes, element ids
const COMMON = new Set("function return const await async window document console length push slice filter value values"
  .split(" "));
function namesIn(text) {
  // distinctive only (hrTubes, Router_Bit, wireLeads - not first / near): a capital, _ or digit, and >= 5 long
  const out = new Set(), add = (s) => { if (s && s.length >= 5 && /[A-Z_0-9]/.test(s.slice(1)) && !COMMON.has(s)) out.add(s); };
  // top level (indent <= 2: the modules' IIFE body), not a function's locals
  for (const m of text.matchAll(/^ {0,2}(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  for (const m of text.matchAll(/^ {0,2}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) add(m[1]);
  for (const m of text.matchAll(/^ {2,4}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) add(m[1]);    // methods
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/g)) add(m[1]);
  for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) add(m[1]);
  for (const m of text.matchAll(/["'`]([A-Z][A-Za-z0-9]*_[A-Za-z0-9_]+)["'`]/g)) add(m[1]);               // Mesh_Names
  for (const m of text.matchAll(/id=["']([\w-]+)["']|getElementById\(["']([\w-]+)["']\)|\$\(["']#([\w-]+)["']\)/g)) add(m[1] || m[2] || m[3]);
  return out;
}
function changedNames(f) {
  if (!/\.(js|html|py)$/.test(f)) return new Set();
  const d = explicit.length ? "" : sh(`git diff -U0 ${since} -- "${f}"`), full = path.join(ROOT, f);
  if (!d) return namesIn(fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "");   // new / untracked / named: all of it
  // changed lines (+ / -, their indent kept) and each hunk's enclosing function (git's @@ ... @@ context)
  const lines = d.split("\n").filter((l) => /^[+-](?![+-]{2} )/.test(l) || l.startsWith("@@"))
    .map((l) => l.startsWith("@@") ? l.replace(/^@@[^@]*@@ ?/, "") : l.slice(1));
  return namesIn(lines.join("\n"));
}

// --- the tests ----------------------------------------------------------------------------------------------------
const tests = fs.readdirSync(TESTS).filter((t) => /^test_.*\.(js|py)$/.test(t)).map((t) => ({
  name: t, page: t.startsWith("test_page_"), src: fs.readFileSync(path.join(TESTS, t), "utf8") }));
const pageTests = tests.filter((t) => t.page);
// a page test also covers what the helpers it requires cover (test_page_fluidnc.js is the shared harness: not followed)
const has = (t, s) => new RegExp(`(^|[^\\w$])${s.replace(/[$]/g, "\\$")}([^\\w$]|$)`).test(t.src);
const generic = (s) => pageTests.filter((t) => has(t, s)).length > 0.6 * pageTests.length;

// static rules for what names can't show: data, pipeline, the page shell
const RULES = [
  [/^web\/data\//, ["test_config_model.js", "test_page_parts.js", "test_page_inspect.js", "test_page_wiring.js", "test_page_router_build.js"], "page data"],
  [/^pipeline\/(fit_config|size_builds)\.py$/, ["test_config_model.js"], "the size fit"],
  [/^pipeline\/share_data\.py$/, ["test_share.py", "test_parts_files.js"], "the shared data"],
  [/^web\/index\.html$|^web\/css\//, ["test_page_phone.js", "test_page_help_ui.js"], "the page layout"],
  [/^web\/js\/page\/job\.js$/, ["test_page_sdjob.js"], "jobs"],
  [/^web\/js\/fluidnc_sim\.js$/, ["test_page_fluidnc.js"], "the FluidNC sim"],
];

const pick = new Map();      // test -> reasons
const why = (t, r) => { if (!pick.has(t)) pick.set(t, new Set()); pick.get(t).add(r); };
const notes = [];
for (const f of files) {
  const base = path.basename(f).replace(/\.(js|py|html)$/, "");
  for (const [re, ts, r] of RULES) if (re.test(f)) ts.forEach((t) => tests.some((x) => x.name === t) && why(t, r));
  if (f.startsWith("tests/") && /^test_/.test(path.basename(f))) { why(path.basename(f), "the test itself"); continue; }
  if (!/^web\/|^pipeline\//.test(f)) { if (!/^(private|docs|build)\//.test(f) && !/\.md$/.test(f)) notes.push(`no test rule: ${f}`); continue; }
  if (f.startsWith("web/js/")) {
    const unit = f.startsWith("web/js/page/") ? `test_page_${base}.js` : `test_${base}.js`;
    if (tests.some((t) => t.name === unit)) why(unit, "its own test");
    // the module's name in a test (require("../web/js/x.js"), js/page/x.js, or its window global)
    const src = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "";
    const globals = [...src.matchAll(/(?:window|root|globalThis)\.([A-Z][\w$]+)\s*=/g)].map((m) => m[1]);
    for (const t of tests) {
      if (t.src.includes(`${base}.js`)) why(t.name, `loads ${base}.js`);
      for (const g of globals) if (has(t, g) && !generic(g)) why(t.name, `uses ${g}`);
    }
  }
  const names = [...changedNames(f)].filter((s) => !generic(s));
  for (const t of tests) {
    const hit = names.filter((s) => has(t, s));
    if (hit.length) why(t.name, `names ${hit.slice(0, 4).join(", ")}${hit.length > 4 ? ` +${hit.length - 4}` : ""}`);
  }
}

// --- report / run -------------------------------------------------------------------------------------------------
const times = {};
try {
  for (const l of fs.readFileSync(path.join(ROOT, "build", "pt2", "summary.txt"), "utf8").split("\n")) {
    const m = l.match(/^(\S+) exit \d+ (\d+)s/);
    if (m) times[m[1] + ".js"] = +m[2];
  }
} catch (e) { /* no timings yet */ }
let list = [...pick.keys()].sort((a, b) => (a.startsWith("test_page_") - b.startsWith("test_page_")) || a.localeCompare(b));
if (flag("--page")) list = list.filter((t) => t.startsWith("test_page_"));
if (flag("--unit")) list = list.filter((t) => !t.startsWith("test_page_"));
console.log(`changed: ${files.length} file(s) (${explicit.length ? "named" : `vs ${since}`})`);
notes.forEach((n) => console.log("  " + n));
const est = list.reduce((s, t) => s + (times[t] || (t.startsWith("test_page_") ? 120 : 5)), 0);
for (const t of list) console.log(`  ${t.padEnd(30)} ${(times[t] ? times[t] + "s" : "").padStart(6)}  ${[...pick.get(t)].join("; ")}`);
console.log(`${list.length} test(s), ~${Math.round(est / 60)} min${list.length ? "" : " (nothing to run)"}`);

if (flag("--run")) {
  const res = [];
  for (const t of list) {
    const t0 = Date.now(), py = t.endsWith(".py");
    const r = spawnSync(py ? "python" : "node", [path.join(TESTS, t)], { cwd: py ? ROOT : TESTS, encoding: "utf8", timeout: 1800e3, maxBuffer: 1 << 28 });
    const out = (r.stdout || "") + (r.stderr || ""), s = Math.round((Date.now() - t0) / 1000);
    const fails = out.split("\n").filter((l) => /FAIL/.test(l));
    res.push(`${t} exit ${r.status} ${s}s ${fails.length ? fails.length + " FAIL" : "ok"}`);
    console.log(res[res.length - 1]);
    fails.slice(0, 5).forEach((l) => console.log("    " + l.trim()));
  }
  console.log("\n" + res.join("\n"));
  process.exit(res.some((l) => !/ exit 0 /.test(l)) ? 1 : 0);
}
