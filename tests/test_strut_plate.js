// Golden test: strut_plate.js vs Vector76's SCAD run by OpenSCAD.
//   node tests/test_strut_plate.js    (needs `npm install` in tests/ once for polygon-clipping)
// OpenSCAD outputs are cached in golden/ (delete it to regenerate). Pass = every vertex of each
// outline lies within TOL of the matching outline on the other side, and the areas agree.
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const pc = require("polygon-clipping");
const SP = require("../web/js/strut_plate.js");

const OPENSCAD = "C:/Program Files/OpenSCAD/openscad.com";
const SCAD = path.join(__dirname, "..", "vendor", "lr4_strut_plate_3d.scad");
const GOLD = path.join(__dirname, "golden");
const TOL = 0.01;

const LENGTHS = [380, 450, 566, 567, 600, 700, 749, 750, 780, 830, 1000, 1200, 1500, 1800];
const CASES = [];
for (const L of LENGTHS) for (const wing of [8, 11.5]) for (const dog of [0, 3.5])
  CASES.push({ L, wing, dog, nb: 0 });
CASES.push({ L: 830, wing: 11.5, dog: 3.5, nb: 6 }, { L: 1200, wing: 8, dog: 6.35, nb: 0 });

function golden(c) {
  fs.mkdirSync(GOLD, { recursive: true });
  const f = path.join(GOLD, `L${c.L}_w${c.wing}_d${c.dog}_n${c.nb}.dxf`);
  if (!fs.existsSync(f))
    execFileSync(OPENSCAD, ["-o", f, "-D", `strut_length=${c.L}`, "-D", `num_braces=${c.nb}`,
      "-D", `dogbones=${c.dog}`, "-D", `front_wing_size=${c.wing}`, "-D", "render_2d=true", SCAD],
      { stdio: "pipe" });
  return readLoops(f);
}

// OpenSCAD 2D DXF (LINE entities) -> closed loops (same as lr4.read_dxf_loops).
function readLoops(f) {
  const ls = fs.readFileSync(f, "utf8").split(/\r?\n/).map(s => s.trim());
  const segs = []; let cur = null;
  for (let i = 0; i + 1 < ls.length; i += 2) {
    const code = ls[i], val = ls[i + 1];
    if (code === "0") {
      if (cur && Object.keys(cur).length === 4) segs.push([[cur[10], cur[20]], [cur[11], cur[21]]]);
      cur = val === "LINE" ? {} : null;
    } else if (cur && ["10", "20", "11", "21"].includes(code)) cur[code] = parseFloat(val);
  }
  const key = p => p[0].toFixed(5) + "," + p[1].toFixed(5);
  const nxt = new Map();
  for (const [a, b] of segs) { const k = key(a); if (!nxt.has(k)) nxt.set(k, []); nxt.get(k).push(b); }
  const used = new Set(), loops = [];
  for (const [a, b] of segs) {
    if (used.has(key(a) + ">" + key(b))) continue;
    const loop = [a]; let p = b; used.add(key(a) + ">" + key(b));
    while (key(p) !== key(loop[0])) {
      loop.push(p);
      const q = nxt.get(key(p)).find(q => !used.has(key(p) + ">" + key(q)));
      used.add(key(p) + ">" + key(q)); p = q;
    }
    loops.push(loop);
  }
  return loops;
}

const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length]; s += a * d - b * c; } return Math.abs(s / 2); };
const cen = r => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function ptLoop(p, r) { let m = Infinity; for (let i = 0; i < r.length; i++) m = Math.min(m, segDist(p, r[i], r[(i + 1) % r.length])); return m; }
const hd = (A, B) => Math.max(...A.map(p => ptLoop(p, B)));

let fails = 0, worst = 0;
for (const c of CASES) {
  const g = golden(c);
  const out = SP.plates(pc, c.L, { nbraces: c.nb, wing: c.wing, dogbones: c.dog });
  const mine = [...out.front, ...out.bottom].flatMap(poly => poly).map(r => r.slice(0, -1));
  let bad = mine.length !== g.length ? `loops ${mine.length} vs ${g.length}` : "";
  let cw = 0;
  if (!bad) {
    const left = g.slice();
    for (const r of mine) {
      const [cx, cy] = cen(r);
      let bi = 0, bd = Infinity;
      left.forEach((s, i) => { const [sx, sy] = cen(s); const d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; bi = i; } });
      const s = left.splice(bi, 1)[0];
      const d = Math.max(hd(r, s), hd(s, r));
      cw = Math.max(cw, d);
      if (d > TOL || Math.abs(area(r) - area(s)) > 0.05) { bad = `loop at (${cx.toFixed(1)}, ${cy.toFixed(1)}) off ${d.toFixed(4)} mm, area ${area(r).toFixed(3)} vs ${area(s).toFixed(3)}`; break; }
    }
  }
  worst = Math.max(worst, cw);
  const tag = `L=${c.L} wing=${c.wing} dog=${c.dog} n=${c.nb} (braces ${out.braces.n}, ${mine.length} loops)`;
  if (bad) { fails++; console.log("FAIL", tag, "-", bad); } else console.log("ok  ", tag, "max dev", cw.toExponential(1));
}
console.log(`${CASES.length - fails}/${CASES.length} pass, worst deviation ${worst.toExponential(2)} mm`);
process.exit(fails ? 1 : 0);
