// web/js/calculator.js vs freecad/calculator.py vs (locally, if vendor/ has it) V1E's own calculator.js.
//   node tests/test_calculator.js      (needs python on PATH; set PYTHON to use another)
// V1E's page shows every value rounded UP to 1/8 of the display unit (mm or inches); ours keeps mm exact and rounds
// only the inch display, so V1E's metric numbers are compared with up8(ours).
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");
const C = require("../web/js/calculator.js");

const ROOT = path.join(__dirname, "..");
const V1E = path.join(ROOT, "vendor", "v1e_lr4_calculator.js");
const IN = 25.4;

// Cut areas (mm): round mm, whole / fractional inches, the configurator's sizes, odd XZ plates.
const CASES = [];
for (const x of [300, 381, 500, 610, 762.5, 914.4, 1000, 1219.2, 1220, 1500.3, 2000])
  for (const y of [500, 762, 1219.2, 1500, 2438.4, 2440, 3000.7]) CASES.push([x, y, 6.5]);
for (let i = 12; i <= 96; i += 0.125 * 13) CASES.push([i * IN, (i * 1.5) * IN, 6.5]);
for (const xz of [6, 6.35, 6.5, 8, 0.25 * IN]) CASES.push([1219.2, 2438.4, xz]);

let fails = 0;
const close = (a, b) => Math.abs(a - b) < 1e-9;
function cmp(tag, a, b) {
  const bad = Object.keys(b).filter((k) => !close(a[k], b[k]));
  if (bad.length) {
    fails++;
    if (fails <= 10) console.log("FAIL", tag, bad.map((k) => `${k} ${a[k]} vs ${b[k]}`).join(", "));
  }
}

// Python
const py = JSON.parse(execFileSync(process.env.PYTHON || "python", [path.join(ROOT, "freecad", "calculator.py"), "--json"],
  { input: JSON.stringify(CASES) }).toString());
CASES.forEach((c, i) => {
  const mm = C.calc(...c);
  cmp(`python mm ${c}`, mm, py[i][0]);
  cmp(`python in ${c}`, C.inches(mm), py[i][1]);
});
console.log(`python: ${CASES.length} cases compared`);

// V1E (local only - not in the repo)
if (fs.existsSync(V1E)) {
  const shown = {};
  const $ = (sel) => ({
    text: (v) => { const m = /name=(\w+)/.exec(sel); if (m) shown[m[1]] = +v; },
    val: () => 0, prop: () => {}, on: () => {}, each: () => {},
  });
  const ctx = vm.createContext({ $, window: {}, Math, console });
  vm.runInContext(fs.readFileSync(V1E, "utf8"), ctx);
  const keys = { strut: "strut", xrails: "xrails", yrail: "yrail", xbelt: "xbelts", ybelt: "ybelts",
    belt_total: "belt_total", xtable: "xtable", ytable: "ytable" };
  const v1e = (c, unit) => {
    vm.runInContext(`xUsable = ${c[0]}; yUsable = ${c[1]}; xThickness = ${c[2]}; displayUnit = Units.${unit}; calculate();`, ctx);
    const o = {};
    for (const [k, n] of Object.entries(keys)) o[k] = shown[n];
    return o;
  };
  for (const c of CASES) {
    const mm = C.calc(...c), mm8 = {};
    for (const k of Object.keys(keys)) mm8[k] = C.up8(mm[k]);
    mm8.xrails = mm8.strut - C.up8(C.OFFSETS.xrail_cushion);
    cmp(`V1E mm ${c}`, mm8, v1e(c, "Metric"));
    cmp(`V1E in ${c}`, C.inches(mm), v1e(c, "Imperial"));
  }
  console.log(`V1E calculator.js: ${CASES.length} cases compared (mm + inches)`);
} else console.log("V1E calculator.js not in vendor/ - skipped (local only)");

console.log(fails ? `${fails} mismatches` : "all match");
process.exit(fails ? 1 : 0);
