// The node tests that need no browser: every tests/test_*.js except the page tests (test_page_*.js, run one at a
// time or with tools/page_tests.js). A new test file is picked up by itself - the old hand-kept lists in
// package.json drifted (test:local had lost test_wiring).
//   node run.js            npm test: what CI runs - without the files in LOCAL
//   node run.js --local    npm run test:local: all of them
//   node run.js name ...   only these (without test_ / .js)
"use strict";
const { spawnSync } = require("child_process"), fs = require("fs"), path = require("path");

// need what CI doesn't have: parts/ (the V1E files), the size builds (build/) or the OpenSCAD goldens (tests/golden/)
const LOCAL = ["config_model", "parts_files", "strut_plate"];

const args = process.argv.slice(2), local = args.includes("--local"), want = args.filter((a) => a !== "--local");
const all = fs.readdirSync(__dirname).filter((f) => /^test_(?!page_).*\.js$/.test(f)).map((f) => f.slice(5, -3)).sort();
const unknown = want.filter((n) => !all.includes(n));
if (unknown.length) { console.log(`no such test: ${unknown.join(", ")}`); process.exit(1); }
const names = want.length ? want : all.filter((n) => local || !LOCAL.includes(n));

const bad = [];
for (const n of names) {
  const r = spawnSync(process.execPath, [path.join(__dirname, `test_${n}.js`)], { cwd: __dirname, stdio: "inherit" });
  if (r.status !== 0) bad.push(n);
}
console.log(bad.length ? `\nFAILED (${bad.length} of ${names.length} files): ${bad.join(", ")}` : `\nall ${names.length} test files passed`);
process.exit(bad.length ? 1 : 0);
