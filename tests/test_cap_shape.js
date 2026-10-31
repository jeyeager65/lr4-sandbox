// cap_shape.js (Part 46b): the motor cap from its top / front / section views - spans (line, arc, curve, corner radii), the
// starting shapes build closed outward meshes of the right size, the plan's signed distance, the top's height, scaling,
// clean().
//   node tests/test_cap_shape.js
"use strict";
const S = require("../web/js/cap_shape.js");
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) fails++; console.log(`  ${c ? "ok  " : "FAIL"} ${msg}`); };
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;

// spans
const sq = S.path([{ x: 0, y: 0, s: "line" }, { x: 10, y: 0, s: "line" }, { x: 10, y: 10, s: "line" }], false);
ok(sq.length === 3, `3 lines: 3 points (${sq.length})`);
const rounded = S.path([{ x: 0, y: 0, s: "line" }, { x: 10, y: 0, s: "line", r: 2 }, { x: 10, y: 10, s: "line" }], false);
const arcPts = rounded.slice(1, -1);
ok(rounded.length > 5 && !rounded.some((p) => near(p[0], 10, 1e-6) && near(p[1], 0, 1e-6)) && arcPts.every((p) => near(Math.hypot(p[0] - 8, p[1] - 2), 2, 1e-6)), `a corner r 2: the corner cut by a quarter round (${rounded.length} points)`);
const semi = S.path([{ x: -5, y: 0, s: "arc", r: 5 }, { x: 5, y: 0, s: "line" }], false);
ok(semi.every((p) => near(Math.hypot(p[0], p[1]), 5, 1e-6)) && Math.max(...semi.map((p) => p[1])) > 4.9, "an arc r 5 from (-5, 0) to (5, 0): a half circle, bulging +y (left of the way)");
const cv = S.path([{ x: 0, y: 0, s: "curve" }, { x: 10, y: 5, s: "curve" }, { x: 20, y: 0, s: "line" }], false, "x");
const d0 = [cv[1][0] - cv[0][0], cv[1][1] - cv[0][1]];
ok(Math.abs(d0[0]) < 0.2 * Math.abs(d0[1]) && Math.max(...cv.map((p) => p[1])) >= 5 - 1e-6, "a curve leaves the middle line square to it and passes its points");

// the starting shapes
const o = { L: 100, W: 70, H: 50, at: 5, top_r: 8, front_r: 14, back_r: 10, bot_r: 3 };
for (const [k, f] of Object.entries(S.STARTS)) {
  const sh = f(o), z = S.size(sh), m = S.mesh(sh, 100);
  let vol = 0;
  const P = m.pos, I = m.idx, edges = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const [i, j, q] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
    vol += (P[i] * (P[j + 1] * P[q + 2] - P[j + 2] * P[q + 1]) - P[i + 1] * (P[j] * P[q + 2] - P[j + 2] * P[q]) + P[i + 2] * (P[j] * P[q + 1] - P[j + 1] * P[q])) / 6;
    for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const key = a + "," + b; edges.set(key, (edges.get(key) || 0) + 1); }
  }
  const open = [...edges.keys()].filter((e) => { const [a, b] = e.split(","); return !edges.has(b + "," + a); }).length;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < P.length; i += 3) { zmin = Math.min(zmin, P[i]); zmax = Math.max(zmax, P[i]); }
  const wantL = k === "can" || k === "dome" ? 70 : 100, wantW = 70, e = k === "pear" ? 3 : 0.1;   // the pear's curves: about the size
  ok(vol > 0 && open === 0 && near(z.L, wantL, 0.1) && near(z.W, wantW, e) && near(z.H, 50, e) && near(zmin, 100, 0.01) && near(zmax, 150, e + 0.1),
    `${k}: closed (${open} open edges), faces out (vol ${(vol / 1000).toFixed(0)} cm^3), ${z.L} x ${z.W} x ${z.H}, z ${zmin.toFixed(1)}..${zmax.toFixed(1)}`);
}
const bx = S.STARTS.box(o), sd = S.planSd(bx);
ok(sd(5, 0) < -30 && near(sd(5 + 50, 0), 0, 0.01) && sd(5, 40) > 4.9, `box: the plan's signed distance (${sd(5, 0).toFixed(1)}, ${sd(55, 0).toFixed(2)}, ${sd(5, 40).toFixed(2)})`);
ok(near(S.topAt(bx, 5, 0), 50, 1e-6) && S.topAt(bx, 5, 34.5) < 50 && S.topAt(bx, 5, 36) === null, `box: the top 50 in the middle, lower at the rounded edge (${S.topAt(bx, 5, 34.5).toFixed(1)}), null off it`);
const dm = S.STARTS.dome(o);
ok(S.topAt(dm, 5, 0) > S.topAt(dm, 5, 20) && S.topAt(dm, 5, 20) > S.topAt(dm, 5, 33), "dome: lower toward the edge");
const big = S.scaled(bx, { L: 120, H: 60 }), bz = S.size(big);
ok(near(bz.L, 120, 0.1) && near(bz.W, 70, 0.1) && near(bz.H, 60, 0.1) && near(bz.at[0], 5, 0.05), `scaled to L 120, H 60: ${bz.L} x ${bz.W} x ${bz.H}, still about x ${bz.at[0]}`);

// the footprint (the transition's target): a head raised at the cord end leaves that end out
const raised = { top: bx.top, front: [{ x: -45, y: 6, s: "line" }, { x: -35, y: 6, s: "line" }, { x: -34, y: 0, s: "line" }, { x: 55, y: 0, s: "line" }, { x: 55, y: 50, s: "line" }, { x: -45, y: 50, s: "line" }], section: bx.section };
const fs_ = S.footSd(raised), ps_ = S.planSd(raised);
ok(ps_(-40, 0) < 0 && fs_(-40, 0) > 0 && fs_(0, 0) < -30 && Math.abs(fs_(0, 35) - 3) < 0.6, `footprint: the raised cord end left out (${fs_(-40, 0).toFixed(1)}), under the rest the bottom's width - the rounded under edge (3) in (${fs_(0, 35).toFixed(2)})`);

// clean
ok(S.clean(null) === null && S.clean({ top: [], front: [], section: [] }) === null, "clean: nothing / empty -> null");
const c = S.clean({ top: [{ x: -50, y: 2, s: "bogus" }, { x: 0, y: 30 }, { x: 50, y: 3 }], front: bx.front, section: bx.section });
ok(c && c.top[0].y === 0 && c.top[2].y === 0 && c.top[0].s === "line", "clean: the half outline starts / ends on the middle line, unknown spans = line");
const two = S.clean({ top: bx.top, front: bx.front, section: [{ at: -40, pts: S.STARTS.dome(o).section }, { at: 40, pts: bx.section }] });
ok(two && two.section.length === 2 && S.mesh(two, 0).idx.length > 0 && S.topAt(two, -40, 25) < S.topAt(two, 40, 25), "2 sections: kept, blended (rounder at the left)");

console.log(fails ? `${fails} of ${n} failed` : `${n}/${n} checks passed`);
process.exit(fails ? 1 : 0);
