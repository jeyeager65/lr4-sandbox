// Run headless-Chrome page tests (tests/test_page_*.js, not in npm test) one after another, each one's output to
// <log dir>/<name>.log, and print a line per test: its ok / FAIL counts and the first failures.
//   node tools/page_tests.js <log dir> [name ...]       (names without test_page_ / .js; none = all of them)
"use strict";
const { spawnSync } = require("child_process"), fs = require("fs"), path = require("path");

const ROOT = path.dirname(__dirname), TESTS = path.join(ROOT, "tests");
const [dir, ...want] = process.argv.slice(2);
if (!dir) { console.log("usage: node tools/page_tests.js <log dir> [name ...]"); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const all = fs.readdirSync(TESTS).filter((f) => /^test_page_.*\.js$/.test(f)).map((f) => f.slice(10, -3));
let bad = 0;
for (const name of want.length ? want : all) {
  const t0 = Date.now();
  const r = spawnSync("node", [path.join(TESTS, `test_page_${name}.js`)], { cwd: ROOT, encoding: "utf8", timeout: +(process.env.PAGE_TEST_MS || 1800000), maxBuffer: 64 << 20 });
  const text = (r.stdout || "") + (r.stderr || "");
  fs.writeFileSync(path.join(dir, name + ".log"), text);
  const oks = (text.match(/^\s*ok\s/gm) || []).length, fails = text.split("\n").filter((l) => /^\s*FAIL\s|\[exception\]/.test(l));
  const pass = r.status === 0 && !fails.length;
  if (!pass) bad++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${oks} ok, ${fails.length} failed/exceptions, exit ${r.status}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const l of fails.slice(0, 4)) console.log("    " + l.trim().slice(0, 240));
}
console.log(bad ? `${bad} test file(s) failed` : "all passed");
process.exit(bad ? 1 : 0);
