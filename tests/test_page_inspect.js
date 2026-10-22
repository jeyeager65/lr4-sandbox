// The inspect view (Part 27) in headless Chrome: a tree row's ⤢ and a double-click open it in place of the machine
// (its set only, no workshop), the parts list counts its fasteners, the Show checkboxes still work in it, double-click
// inside goes down to the part, Esc / Back return, and an option that takes the set off the machine closes it.
// Tools (Part 28): explode moves the set along its bolts (the anchor stays) and comes back to 0; the section shows its
// slider; measure snaps two hole centres on the XZ plate; leaving inspect resets them.
//   node tests/test_page_inspect.js   (serves the repo on port 8792 and runs tools/page_shot.js; needs parts/)
"use strict";
const { spawn, execFileSync } = require("child_process");
const path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), PORT = 8792;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL " + msg); } };

const steps = [
  // the Core assembly from its row: the set only, the list
  `document.getElementById('t-show').click(); const all = LR4Inspect.shown().length;
   document.querySelector('#show-tree .ins[data-id=core]').click();
   const rows = [...document.querySelectorAll('#insp-list tr')].map((r) => [r.cells[0].textContent, r.cells[1].textContent]);
   return { all, id: LR4Inspect.id(), shown: LR4Inspect.shown(), overlay: !document.getElementById('insp').hidden,
     head: document.getElementById('insp-h').textContent, rows }`,
  // a checkbox in it: Core's hardware off hides the bolts; back on
  `const box = document.querySelector('#show-tree input[data-id="core.hardware"]'); box.click();
   const off = LR4Inspect.shown(); box.click(); return { off, on: LR4Inspect.shown().length }`,
  // a double-click inside: the part under the pointer (the view is framed on the core, so its centre hits something)
  `const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
   let id = null;
   for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.4], [0.55, 0.6], [0.4, 0.55]]) {
     c.dispatchEvent(new MouseEvent('dblclick', { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true }));
     if (LR4Inspect.id() !== 'core') { id = LR4Inspect.id(); break; }
   }
   return { id, shown: LR4Inspect.shown().length }`,
  // Esc back to the machine
  `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
   return { id: LR4Inspect.id(), shown: LR4Inspect.shown().length, overlay: !document.getElementById('insp').hidden }`,
  // tools: explode, section, measure, then Back
  `LR4Inspect.open('yz-min'); const T = LR4Inspect.tools; T.explode(0.6); const ex = T.offsets();
   T.explode(0); const ex0 = Object.keys(T.offsets()).length; T.explode(0.6);
   const stepper = [T.offsets().Y_Stepper_Min, T.offsets().Y_Stepper_Min_Shaft, T.offsets().Y_Stepper_Min_Lead_Red].map(String);
   LR4Inspect.open('Core'); T.explode(0.6); const nuts = T.nuts().filter((x) => x[1] && x[2] > 1).map((x) => x[0]); LR4Inspect.open('yz-min');
   T.section('x', 0.5); const sec = { x: document.querySelector('#insp-sec [data-v=x]').getAttribute('aria-pressed'), cut: !document.getElementById('insp-cut').hidden };
   T.section('');
   LR4Inspect.open('XZ_Plate_Min'); T.measure(true);
   const c = document.querySelector('canvas').getBoundingClientRect(), holes = [];
   for (let y = 0.15; y < 0.9; y += 0.04) for (let x = 0.2; x < 0.8; x += 0.04) {
     const q = T.snap(c.left + c.width * x, c.top + c.height * y); if (q && q.what === 'hole centre') holes.push([x, y]); }
   if (holes.length > 1) { const a = holes[0], b = holes[holes.length - 1];
     T.click(c.left + c.width * a[0], c.top + c.height * a[1]); T.click(c.left + c.width * b[0], c.top + c.height * b[1]); }
   const meas = T.result();
   document.getElementById('insp-back').click();
   return { ex, ex0, stepper, nuts, sec, holes: holes.length, meas, after: Object.keys(T.offsets()).length, clip: document.querySelector('#insp-sec [data-v=""]').getAttribute('aria-pressed') }`,
  // the router's row, then the router taken off the machine: the view closes
  `LR4Inspect.open('router'); const open = LR4Inspect.id(); document.getElementById('opt-router').click();
   const r = { open, after: LR4Inspect.id(), shown: LR4Inspect.shown().length }; document.getElementById('opt-router').click(); return r`,
];

const server = spawn("python", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
let out = "";
try {
  execFileSync("node", ["-e", "setTimeout(() => {}, 1000)"]);   // let the server start
  const args = [path.join(ROOT, "tools", "page_shot.js"), `http://127.0.0.1:${PORT}/web/index.html?parts=/parts/#26x50`,
    path.join(os.tmpdir(), "lr4_page_inspect.png"), "--size", "1200x800"];
  for (const js of steps) args.push("--eval", js.replace(/\s*\n\s*/g, " "));
  out = execFileSync("node", args, { cwd: ROOT, encoding: "utf8", timeout: 180000 });
} finally { server.kill(); }

const ev = out.split("\n").filter((l) => l.startsWith("eval: ")).map((l) => JSON.parse(l.slice(6)));
ok(!/\[exception\]/.test(out), "page exception: " + (out.match(/\[exception\].*/) || [""])[0]);
ok(ev.length === steps.length, `${steps.length} results, got ${ev.length}`);
if (ev.length !== steps.length) console.log(out);
else {
  const [a, b, c, d, t, e] = ev;
  const has = (list, re) => list.some((n) => re.test(n));
  ok(a.id === "core" && a.overlay && a.head === "Core", "Core's row opens the inspect view: " + JSON.stringify([a.id, a.head]));
  ok(a.shown.length < a.all / 4 && has(a.shown, /^Core$/) && has(a.shown, /^Bearing_Core_Lower/) && has(a.shown, /^X_Stepper$/)
    && !has(a.shown, /^(TableMDF|Brace_|YZ_Plate)/), `only the core's set drawn (${a.shown.length} of ${a.all})`);
  const row = (l) => (a.rows.find((r) => r[1] === l) || [])[0];
  ok(row("M8 x 40 mm hex head bolt") === "8" && row("M5 x 30 mm button head screw") === "6" && row("Bearing Core Lower") === "4",
    "parts list: " + JSON.stringify(a.rows));
  // bolts also listed under another assembly (tool mount -> router, X endstop -> electronics) stay: shown with either
  ok(!has(b.off, /^(Bearing_Core|X_Idler|Core__)/) && has(b.off, /^Tool_Mount_T_Kobalt__M5_to_Core$/) && b.on === a.shown.length,
    `Core's hardware box works in it (${b.off.length} / ${b.on})`);
  ok(c.id && c.id !== "core" && c.shown < a.shown.length, "double-click inside: down to a part: " + JSON.stringify(c));
  ok(d.id === null && !d.overlay && d.shown === a.all, "Esc: back to the whole machine");
  const exN = Object.keys(t.ex).length, plate = t.ex.YZ_Plate_Min || [], moved = Object.values(t.ex).filter((v) => Math.hypot(...v) > 1).length;
  ok(exN > 20 && plate.every((v) => v === 0) && moved > 20 && t.ex0 === 0, `explode: ${moved} of ${exN} parts moved, the YZ plate stays, 0 = back`);
  ok(t.stepper[0] && t.stepper.every((v) => v === t.stepper[0]), "the stepper moves as one (shaft, leads with the body): " + t.stepper.join(" | "));
  ok(["Bearing_Core__M8", "Tool_Mount_T_Kobalt__M5_to_Core", "Core__M5_to_X_Idler_1"].every((n) => t.nuts.includes(n)), "nuts come off their bolts: " + t.nuts);
  ok(t.sec.x === "true" && t.sec.cut, "section X: on, its slider shows");
  ok(t.holes > 1 && / mm \(.* in\).*hole centre → hole centre/.test(t.meas), `measure: hole centre to hole centre (${t.holes} snaps): ${t.meas}`);
  ok(t.after === 0 && t.clip === "true", "Back: explode + section reset");
  ok(e.open === "router" && e.after === null && e.shown < a.all, "router off the machine closes its inspect view: " + JSON.stringify(e));
}
console.log(fails ? `${fails} check(s) failed` : "all inspect checks passed");
process.exit(fails ? 1 : 0);
