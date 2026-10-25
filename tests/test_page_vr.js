// The page + js/vr.js together, in headless Chrome (no headset): the VR menu drives the page through the panel's
// controls by id, so it has to keep working while their tab is hidden, and the canvas overlays hide in VR. The
// FluidTouch pendant (Part 18; an option, off by default since Part 24 - turned on here) loads, has its chip in the menu
// (the Show tree's assemblies, Part 26; all fit above the bottom row) and hides with it.
//   node tests/test_page_vr.js        (serves the repo on port 8791 and runs tools/page_shot.js; needs parts/)
"use strict";
const { spawn, execFileSync } = require("child_process");
const path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), PORT = 8791;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL " + msg); } };

const steps = [
  // on the Run tab (Machine hidden): what the menu reads, and what shows in VR
  `LR4Pendant.set(true); document.getElementById('t-run').click(); const v = LR4VR.page; v.preview('one'); const s = v.state();
   const shown = (q) => getComputedStyle(document.querySelector(q)).display !== 'none';
   return { machineHidden: getComputedStyle(document.querySelector('.panel')).display === 'none', groups: s.groups.length, peter: s.peter.length,
     unit: s.unit, toolbar: shown('.toolbar'), panel: shown('.panel'), vrpop: shown('#vr-pop'),
     pendant: Object.values(LR4Demo.boxes('^Pendant_')).filter((b) => b[2]).length, chip: s.groups.some((g) => g.id === 'g-pendant'),
     fits: LR4VR.layout(s).buttons.filter((b) => b.act.a === 'group').every((b) => b.y + b.h <= 634) }`,
  // the menu's actions land on the hidden controls
  `const v = LR4VR.page;
   v.act({ a: 'unit', u: 'mm' }); v.act({ a: 'peter', v: 'none' }); v.act({ a: 'group', id: 'g-table' }); v.act({ a: 'group', id: 'g-pendant' });
   const s = v.state();
   return { unit: s.unit, peterNone: s.peter.some((p) => p.v === 'none' && p.on), table: document.getElementById('g-table').checked,
     readout: /^mm/.test(document.getElementById('dro-hint').textContent) ? 'mm' : '?', pendant: Object.values(LR4Demo.boxes('^Pendant_')).filter((b) => b[2]).length }`,
  `LR4VR.page.preview(null); return { vr: document.body.classList.contains('vr-on'),
     toolbar: getComputedStyle(document.querySelector('.toolbar')).display !== 'none' }`,
];

const server = spawn("python", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
let out = "";
try {
  execFileSync("node", ["-e", "setTimeout(() => {}, 1000)"]);   // let the server start
  const args = [path.join(ROOT, "tools", "page_shot.js"), `http://127.0.0.1:${PORT}/web/index.html?parts=/parts/#26x50`,
    path.join(os.tmpdir(), "lr4_page_vr.png"), "--size", "1200x800"];
  for (const js of steps) args.push("--eval", js.replace(/\s*\n\s*/g, " "));
  out = execFileSync("node", args, { cwd: ROOT, encoding: "utf8", timeout: 180000 });
} finally { server.kill(); }

const ev = out.split("\n").filter((l) => l.startsWith("eval: ")).map((l) => JSON.parse(l.slice(6)));
ok(!/\[exception\]/.test(out), "page exception: " + (out.match(/\[exception\].*/) || [""])[0]);
ok(ev.length === 3, `3 results, got ${ev.length}`);
if (ev.length !== 3) console.log(out);
if (ev.length === 3) {
  const [a, b, c] = ev;
  ok(a.machineHidden, "Design panel hidden while on Run");
  ok(a.groups > 5, `menu sees the part groups (${a.groups})`);
  ok(a.peter > 0, "menu sees the Peter Plate choices");
  ok(!a.toolbar && !a.panel && a.vrpop, "in VR: no toolbar / panel, the VR card shows");
  ok(b.unit === "mm" && b.readout === "mm", "unit from the menu: page + tool position readout in mm");
  ok(b.peterNone, "Peter Plates set to None from the menu");
  ok(b.table === false, "Table assembly toggled off from the menu");
  ok(a.pendant === 5 && a.chip, `pendant: ${a.pendant} parts shown (case x2, stand, screen, spacer), chip in the menu`);
  ok(a.fits !== false, "all group chips fit above the menu's bottom row");
  ok(b.pendant === 0, "pendant hidden from the menu");
  ok(!c.vr && c.toolbar, "leaving VR: toolbar back");
}
console.log(fails ? `${fails} check(s) failed` : "all page + VR checks passed");
process.exit(fails ? 1 : 0);
