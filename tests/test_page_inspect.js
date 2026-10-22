// The inspect view (Part 27) in headless Chrome: a tree row's ⤢ and a double-click open it in place of the machine
// (its set only, no workshop), the parts list counts its fasteners, the Show checkboxes still work in it, double-click
// inside goes down to the part, Esc / Back return, and an option that takes the set off the machine closes it.
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
  const [a, b, c, d, e] = ev;
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
  ok(e.open === "router" && e.after === null && e.shown < a.all, "router off the machine closes its inspect view: " + JSON.stringify(e));
}
console.log(fails ? `${fails} check(s) failed` : "all inspect checks passed");
process.exit(fails ? 1 : 0);
