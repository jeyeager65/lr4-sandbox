// strut_cam.js (the page's strut plate G-code) vs freecad/cam.py (FreeCAD CAM + the fluidnc post).
//   node tests/test_strut_cam.js     (needs `npm install` in tests/ once for polygon-clipping)
// 1. Invariants at many sizes (no FreeCAD needed): the outline path never comes closer than the bit radius to the
//    plate, follows it everywhere the bit fits, doesn't cross itself; holes / depths / tabs as asked.
// 2. Goldens, if tests/golden/cam_L<len>.gcode exist (local only; make them with FreeCAD):
//      LR4_STRUT=600 LR4_CAM_OUT=%CD%/tests/golden/cam_L600.gcode python tools/run.py freecad/cam.py   (also 830, 1200)
//    Both G-code files are parsed the same way: stock, hole centres + radii, pass depths, the deepest outline
//    pass (both ways within TOL), tab count + height, time estimate.
"use strict";
const fs = require("fs"), path = require("path");
const pc = require("polygon-clipping");
const SC = require("../web/js/strut_cam.js");

const GOLD = path.join(__dirname, "golden");
const TOL = 0.02;        // holes
const TOL_OUT = 0.04;    // outlines: FreeCAD fits arcs to the generator's 30-gon dogbones (0.03 off them); ours follows them
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

// ---- G-code -> ops of moves (modal XYZ, #<vars> substituted) ----
function parse(text) {
  const vars = {}, ops = [];
  let x = 0, y = 0, z = 0, op = null, stock = null;
  for (const raw of text.split(/\r?\n/)) {
    const v = raw.match(/^#<(\w+)>=([-\d.]+)/);
    if (v) { vars[v[1]] = +v[2]; continue; }
    const s = raw.match(/^\(Stock: (.*)\)/);
    if (s) stock = Object.fromEntries(s[1].split(" ").map(kv => [kv.split("=")[0], +kv.split("=")[1]]));
    if (/^\(MSG, \d+\/\d+ /.test(raw)) { op = { name: raw, moves: [] }; ops.push(op); continue; }
    const line = raw.replace(/\(.*\)/g, "").trim().replace(/#<(\w+)>/g, (_, n) => vars[n]);
    const gm = line.match(/^G([0-3])\b/);
    if (!gm || !op) continue;
    const w = {};
    for (const m of line.matchAll(/([XYZIJ])\[?(-?[\d.]+)\]?/g)) w[m[1]] = +m[2];
    const g = +gm[1], nx = w.X ?? x, ny = w.Y ?? y, nz = w.Z ?? z;
    op.moves.push({ g, x0: x, y0: y, z0: z, x: nx, y: ny, z: nz, i: w.I, j: w.J });
    [x, y, z] = [nx, ny, nz];
  }
  return { ops, stock, vars };
}

// points every `step` mm along moves (arcs sampled), XY
function sample(moves, step = 0.5) {
  const pts = [];
  for (const m of moves) {
    if (m.g < 2) {
      const L = Math.hypot(m.x - m.x0, m.y - m.y0), n = Math.max(1, Math.ceil(L / step));
      for (let k = 1; k <= n; k++) pts.push([m.x0 + (m.x - m.x0) * k / n, m.y0 + (m.y - m.y0) * k / n]);
    } else {
      const cx = m.x0 + m.i, cy = m.y0 + m.j, r = Math.hypot(m.i, m.j);
      const a0 = Math.atan2(m.y0 - cy, m.x0 - cx), a1 = Math.atan2(m.y - cy, m.x - cx);
      let sw = m.g === 3 ? a1 - a0 : a0 - a1;
      while (sw <= 1e-9) sw += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(r * sw / step));
      for (let k = 1; k <= n; k++) { const a = a0 + (m.g === 3 ? 1 : -1) * sw * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
  }
  return pts;
}
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const polyDist = (p, poly, closed) => {
  let d = Infinity;
  for (let k = 0; k < poly.length - (closed ? 0 : 1); k++) d = Math.min(d, segDist(p, poly[k], poly[(k + 1) % poly.length]));
  return d;
};
const maxDist = (A, B) => A.reduce((m, p) => Math.max(m, polyDist(p, B, false)), 0);

// the last pass of an op: the moves after its last Z-only feed plunge
function lastPass(op) {
  let k = -1;
  op.moves.forEach((m, i) => { if (m.g === 1 && m.x === m.x0 && m.y === m.y0 && m.z < m.z0) k = i; });
  return op.moves.slice(k + 1).filter(m => m.g > 0);
}
const passDepths = op => [...new Set(op.moves.filter(m => m.g === 1 && m.x === m.x0 && m.y === m.y0 && m.z < m.z0).map(m => m.z.toFixed(3)))];
const holeCentres = op => op.moves.filter(m => m.g >= 2).map(m => [m.x0 + m.i, m.y0 + m.j, Math.hypot(m.i, m.j)]);
const tabsIn = pass => pass.filter(m => m.g === 1 && m.z > m.z0 + 1e-6 && Math.hypot(m.x - m.x0, m.y - m.y0) > 1e-6);

// ---- 1. invariants ----
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12;
}
const CASES = [];
for (const L of [380, 450, 566, 600, 750, 830, 1000, 1200, 1500, 1800, 2400]) CASES.push({ L });
CASES.push({ L: 830, nbraces: 6 }, { L: 1200, dogbones: 0 }, { L: 1000, wing: 8 }, { L: 830, t: 12, step: 3, tabs: 6 },
  { L: 700, bit: 6.35, dogbones: 6.35, holeD: 8 });
for (const c of CASES) {
  const tag = JSON.stringify(c), r0 = (c.bit || 3.175) / 2;
  let J;
  try { J = SC.job(pc, c.L, c); } catch (e) { ok(false, `${tag}: ${e.message}`); continue; }
  const P = parse(J.gcode), lay = SC.layout(pc, c.L, Object.assign({}, SC.DEFAULTS, c));
  ok(P.ops.length === 4, `${tag}: 4 ops`);
  { const long = J.gcode.split("\n").filter((l) => new TextEncoder().encode(l).length > 127); ok(!long.length, `${tag}: every line fits FluidNC (<= 127 bytes): ${long[0] || ""}`); }
  ok(Math.abs(P.stock.XMAX - J.stock.xmax) < 1e-3 && Math.abs(P.stock.YMAX - c.L - 24) < 1e-3, `${tag}: stock`);
  const want = SC.DEFAULTS.tabs === undefined ? 4 : (c.tabs || SC.DEFAULTS.tabs);
  lay.plates.forEach((pl, k) => {
    const holes = holeCentres(P.ops[k]);
    ok(holes.every(h => Math.abs(h[2] - ((c.holeD || 5.3) / 2 - r0)) < 2e-3), `${tag} ${pl.name}: hole radius`);
    ok(new Set(holes.map(h => h[0].toFixed(2) + "," + h[1].toFixed(2))).size === pl.holes.length, `${tag} ${pl.name}: every hole`);
    const out = P.ops[2 + k], pass = lastPass(out), pts = sample(pass, 0.25);
    const dmin = pts.reduce((m, p) => Math.min(m, polyDist(p, pl.outer, true)), Infinity);
    // a dogbone as big as the bit: its 30-gon is 0.03 inside the true circle, so the bit grazes the polygon
    ok(dmin > r0 - ((c.dogbones || 3.5) >= 2 * r0 ? 0.035 : 2e-3), `${tag} ${pl.name}: path ${dmin.toFixed(4)} from the plate (bit r ${r0})`);
    const far = pl.outer.reduce((m, p) => Math.max(m, polyDist(p, pts, false)), 0);
    // sharp inside corners (the screw-head notch) stay r * sqrt 2 from the path; dogbone floors ~r + 0.2
    ok(far < r0 * Math.SQRT2 + 0.01, `${tag} ${pl.name}: plate corner ${far.toFixed(3)} from the path`);
    const poly = sample(pass, 2);
    let cross = 0;
    for (let a = 0; a < poly.length - 1; a++) for (let b = a + 2; b < poly.length - 1; b++)
      if (!(a === 0 && b === poly.length - 2) && segsCross(poly[a], poly[a + 1], poly[b], poly[b + 1])) cross++;
    ok(cross === 0, `${tag} ${pl.name}: outline crosses itself ${cross}x`);
    ok(tabsIn(pass).length === want, `${tag} ${pl.name}: ${tabsIn(pass).length} tabs, want ${want}`);
    const top = -(c.t || 6.35) - 0.25 + 1.5;
    ok(tabsIn(pass).every(m => Math.abs(m.z - top) < 1e-3), `${tag} ${pl.name}: tab top`);
    const ds = passDepths(out).map(Number), fin = -(c.t || 6.35) - 0.25;
    ok(Math.abs(ds[ds.length - 1] - fin) < 1e-3 && ds.every((d, i) => i === 0 || ds[i - 1] - d <= (c.step || 2) + 1e-6), `${tag} ${pl.name}: depths ${ds}`);
  });
  ok(!/NaN|undefined|Infinity/.test(J.gcode), `${tag}: clean numbers`);
}
console.log(`invariants: ${CASES.length} cases`);

// ---- 2. goldens ----
const golds = fs.existsSync(GOLD) ? fs.readdirSync(GOLD).filter(f => /^cam_L[\d.]+\.gcode$/.test(f)) : [];
if (!golds.length) console.log("no cam.py goldens in tests/golden (see the header) - skipped");
for (const f of golds) {
  const L = +f.match(/cam_L([\d.]+)\.gcode/)[1];
  const G = parse(fs.readFileSync(path.join(GOLD, f), "utf8")), J = SC.job(pc, L), M = parse(J.gcode);
  ok(G.ops.length === M.ops.length, `L${L}: ops ${G.ops.length} vs ${M.ops.length}`);
  for (const k of ["XMIN", "XMAX", "YMIN", "YMAX", "ZMIN", "ZMAX"])
    ok(Math.abs(G.stock[k] - M.stock[k]) < 0.01, `L${L}: stock ${k} ${G.stock[k]} vs ${M.stock[k]}`);
  for (let k = 0; k < 4; k++) {
    const g = G.ops[k], m = M.ops[k], tag = `L${L} op ${k + 1}`;
    ok(passDepths(g).join() === passDepths(m).join(), `${tag}: depths ${passDepths(g)} vs ${passDepths(m)}`);
    if (k < 2) {
      const key = h => h[0].toFixed(1) + "," + h[1].toFixed(1);
      const gc = [...new Map(holeCentres(g).map(h => [key(h), h])).values()];
      const mc = [...new Map(holeCentres(m).map(h => [key(h), h])).values()];
      ok(gc.length === mc.length, `${tag}: ${gc.length} vs ${mc.length} holes`);
      const worst = gc.reduce((w, h) => Math.max(w, Math.min(...mc.map(q => Math.hypot(h[0] - q[0], h[1] - q[1]) + Math.abs(h[2] - q[2])))), 0);
      ok(worst < TOL, `${tag}: hole centres / radii off by ${worst.toFixed(4)}`);
    } else {
      const gp = sample(lastPass(g)), mp = sample(lastPass(m));
      const d1 = maxDist(gp, mp), d2 = maxDist(mp, gp);
      ok(d1 < TOL_OUT && d2 < TOL_OUT, `${tag}: outline ${d1.toFixed(4)} / ${d2.toFixed(4)} apart`);
      const gt = tabsIn(lastPass(g)), mt = tabsIn(lastPass(m));
      ok(gt.length === mt.length, `${tag}: tabs ${gt.length} vs ${mt.length}`);
      ok(gt.length && Math.abs(gt[0].z - mt[0].z) < 1e-3, `${tag}: tab top ${gt[0] && gt[0].z} vs ${mt[0] && mt[0].z}`);
    }
  }
  const gm = +(fs.readFileSync(path.join(GOLD, f), "utf8").match(/RPM, ~(\d+) min/) || [])[1];
  ok(Math.abs(J.minutes - gm) / gm < 0.2, `L${L}: ~${J.minutes.toFixed(1)} min vs cam.py ~${gm} min`);
  console.log(`golden L${L}: ${J.lines} lines vs ${fs.readFileSync(path.join(GOLD, f), "utf8").split("\n").length}, ~${J.minutes.toFixed(1)} min vs ~${gm}`);
}
console.log(fails ? `${fails} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
