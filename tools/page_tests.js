// Run headless-Chrome page tests (tests/test_page_*.js, not in npm test), each one's output to <log dir>/<name>.log,
// and print a line per test: its ok / FAIL counts and the first failures.
// A test that fails is run once more by itself at the end (<name>.retry.log): passing then makes it FLAKY, not
// FAIL - it still counts as passed, but it is named, with what failed the first time, so it can be fixed.
// The lines are also in <log dir>/summary.txt.
//   node tools/page_tests.js <log dir> [--no-retry] [--jobs N] [--all] [name ...]   (names without test_page_ / .js)
// No names = every test but the release-only ones (RELEASE: help_all plays each help clip in real time, ~14 min; the
// clips' scripts are checked by tests/test_help_scripts.js, a changed clip by tools/test_quick.js). --all = those too:
// before a release.
// --jobs N: N tests at a time, the longest first (lines in the order they finish). Only worth it on the real GPU
// (LR4_TEST_GPU=1): SwiftShader draws on the CPU, so tests side by side slow each other down. Retries stay alone.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), path = require("path");

const ROOT = path.dirname(__dirname), TESTS = path.join(ROOT, "tests");
const RELEASE = ["help_all"];
const args = process.argv.slice(2), flags = { retry: true, jobs: 1, all: false }, rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--no-retry") flags.retry = false;
  else if (args[i] === "--all") flags.all = true;
  else if (args[i] === "--jobs") flags.jobs = Math.max(1, +args[++i] || 1);
  else rest.push(args[i]);
}
const [dir, ...want] = rest;
if (!dir) { console.log("usage: node tools/page_tests.js <log dir> [--no-retry] [--jobs N] [--all] [name ...]"); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const all = fs.readdirSync(TESTS).filter((f) => /^test_page_.*\.js$/.test(f)).map((f) => f.slice(10, -3));
const unknown = want.filter((n) => !all.includes(n));
if (unknown.length) { console.log(`no such page test: ${unknown.join(", ")}`); process.exit(1); }

// seconds each test took the last time (tests/page_times.json, written by a full run): the longest start first
const TIMES = path.join(TESTS, "page_times.json");
let times = {};
try { times = JSON.parse(fs.readFileSync(TIMES, "utf8")); } catch (e) { /* none yet */ }

const lines = [];
const say = (l) => { console.log(l); lines.push(l); fs.writeFileSync(path.join(dir, "summary.txt"), lines.join("\n") + "\n"); };
function run(name, log) {
  return new Promise((done) => {
    const t0 = Date.now(), out = fs.createWriteStream(path.join(dir, log));
    const p = spawn("node", [path.join(TESTS, `test_page_${name}.js`)], { cwd: ROOT });
    let text = "";
    const got = (d) => { text += d; out.write(d); };
    p.stdout.on("data", got); p.stderr.on("data", got);
    const kill = setTimeout(() => p.kill(), +(process.env.PAGE_TEST_MS || 1800000) + 60000);   // the test's own watchdog comes first
    p.on("close", (status) => {
      clearTimeout(kill); out.end();
      const oks = (text.match(/^\s*ok\s/gm) || []).length, fails = text.split("\n").filter((l) => /^\s*FAIL\s|\[exception\]/.test(l));
      done({ pass: status === 0 && !fails.length, oks, fails, status, secs: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

(async () => {
  const t00 = Date.now(), failed = [], took = {};
  const queue = want.length ? want.slice() : all.filter((n) => flags.all || !RELEASE.includes(n));
  if (queue.length < all.length && !want.length) say(`(not run: ${RELEASE.join(", ")} - release only, --all)`);
  if (flags.jobs > 1) queue.sort((a, b) => (times[b] || 60) - (times[a] || 60));
  const worker = async () => {
    for (let name; (name = queue.shift());) {
      const r = await run(name, name + ".log");
      if (r.pass) took[name] = r.secs; else failed.push([name, r]);
      say(`${r.pass ? "PASS" : "FAIL"} ${name}: ${r.oks} ok, ${r.fails.length} failed/exceptions, exit ${r.status}, ${r.secs} s`);
      for (const l of r.fails.slice(0, 4)) say("    " + l.trim().slice(0, 240));
    }
  };
  await Promise.all(Array.from({ length: flags.jobs }, worker));
  const flaky = [], bad = [];
  if (failed.length && flags.retry) say(`-- again, alone: ${failed.map((f) => f[0]).join(", ")}`);
  for (const [name, first] of failed) {
    if (!flags.retry) { bad.push(name); continue; }
    const r = await run(name, name + ".retry.log");
    (r.pass ? flaky : bad).push(name);
    if (r.pass) took[name] = r.secs;
    say(`${r.pass ? "FLAKY" : "FAIL "} ${name}: ${r.pass ? `passed alone (${r.oks} ok, ${r.secs} s); the first time: ${(first.fails[0] || "exit " + first.status).trim().slice(0, 160)}` : `failed again (${r.fails.length} failed/exceptions, exit ${r.status}, ${r.secs} s)`}`);
    if (!r.pass) for (const l of r.fails.slice(0, 4)) say("    " + l.trim().slice(0, 240));
  }
  if (flags.jobs === 1 && Object.keys(took).length) {            // times alone only: side by side they are not a test's own
    const t = Object.assign({}, times, took);
    fs.writeFileSync(TIMES, JSON.stringify(Object.fromEntries(Object.keys(t).sort().map((k) => [k, t[k]])), null, 1) + "\n");
  }
  say(`${bad.length ? `${bad.length} test file(s) failed: ${bad.join(", ")}` : "all passed"}${flaky.length ? `; flaky (passed alone): ${flaky.join(", ")}` : ""} - ${((Date.now() - t00) / 60000).toFixed(0)} min${flags.jobs > 1 ? `, ${flags.jobs} at a time` : ""}`);
  process.exit(bad.length ? 1 : 0);
})();
