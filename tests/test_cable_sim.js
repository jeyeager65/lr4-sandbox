// web/js/cable_sim.js (Part 53a): the rope settles - sags, keeps its length, stays out of the colliders, ends pinned
//   node tests/test_cable_sim.js
"use strict";
const C = require("../web/js/cable_sim.js");
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fails++; };

// resample: n evenly spaced points along a polyline
const rs = C.resample([[0, 0, 0], [100, 0, 0], [100, 100, 0]], 5);
ok(rs.length === 5 && Math.abs(rs[2][0] - 100) < 1e-9 && Math.abs(rs[2][1]) < 1e-9 && Math.abs(rs[4][1] - 100) < 1e-9, `resample ${JSON.stringify(rs)}`);

// a 1200 mm rope between two pins 1000 mm apart: sags, keeps its length (within 1 %)
const hang = () => { const c = C.make([[0, 0, 0], [1000, 0, 0]], { n: 30, len: 1200, r: 5 }); c.pin(0, [0, 0, 0]); c.pin(-1, [1000, 0, 0]); return c; };
let c = hang();
c.settle(600);
let pts = c.points(), low = Math.min(...pts.map((p) => p[2]));
ok(low < -200 && low > -500, `sags ${low.toFixed(0)} mm (a 1200 mm rope over 1000 mm: ~-330 for a chain)`);
ok(Math.abs(c.length() - 1200) / 1200 < 0.01, `length ${c.length().toFixed(1)} of 1200`);
ok(c.speed() < 0.05, `settled (last step ${c.speed().toFixed(3)} mm)`);
const mid = pts[Math.floor(pts.length / 2)];
ok(Math.abs(mid[0] - 500) < 30 && Math.abs(mid[1]) < 1e-6, `symmetric, in its plane (mid x ${mid[0].toFixed(1)})`);

// a floor under it: the nodes stay above it (by the radius)
c = hang();
c.settle(600, [{ floor: -150 }]);
low = Math.min(...c.points().map((p) => p[2]));
ok(low >= -145 - 0.5, `on the floor: lowest ${low.toFixed(1)} (floor -150, r 5)`);

// a box in the way: the rope drapes over it, no node inside
c = hang();
const box = [400, -100, -400, 600, 100, -120];
c.settle(800, [{ box }]);
const inBox = c.points().filter((p) => p[0] > box[0] && p[0] < box[3] && p[1] > box[1] && p[1] < box[4] && p[2] > box[2] && p[2] < box[5]);
ok(!inBox.length, `over the box: ${inBox.length} nodes inside`);
ok(Math.abs(c.length() - 1200) / 1200 < 0.02, `length over the box ${c.length().toFixed(1)}`);

// an upright cylinder: pushed round it
c = hang();
c.settle(800, [{ cyl: [500, 0, 80, -600, -150] }]);
const inCyl = c.points().filter((p) => Math.hypot(p[0] - 500, p[1]) < 80 && p[2] > -600 && p[2] < -150);
ok(!inCyl.length, `round / onto the cylinder: ${inCyl.length} nodes inside`);

// pinned direction: two nodes at each end hold the way the cable leaves (here level, out along +x / in along +x)
c = C.make([[0, 0, 0], [1000, 0, 0]], { n: 30, len: 1300, r: 5, stiff: 0.3 });
c.pin(0, [0, 0, 0]); c.pin(1, [c.seg, 0, 0]); c.pin(-1, [1000, 0, 0]); c.pin(-2, [1000 - c.seg, 0, 0]);
c.settle(800);
pts = c.points();
ok(Math.abs(pts[1][2]) < 1e-9 && Math.abs(pts[pts.length - 2][2]) < 1e-9 && pts[3][2] < 0, `the ends leave level, then it sags (node 3 z ${pts[3][2].toFixed(1)})`);

// a stiff cable = fewer, longer segments: the tightest bend along the settled rope grows with the segment
const tight = (n) => { const q = C.make([[0, 0, 0], [800, 0, 0]], { n, len: 1500, r: 30 });
  q.pin(0, [0, 0, 0]); q.pin(1, [q.seg, 0, 0]); q.pin(-1, [800, 0, 0]); q.pin(-2, [800 - q.seg, 0, 0]); q.settle(1500, [{ floor: -700 }]);
  const P = q.points(); let a = 0;
  for (let i = 1; i + 1 < P.length; i++) {
    const u = [0, 1, 2].map((k) => P[i][k] - P[i - 1][k]), v = [0, 1, 2].map((k) => P[i + 1][k] - P[i][k]);
    a = Math.max(a, Math.acos(Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v))));
  }
  return { R: q.seg / a, L: q.length() }; };
const t40 = tight(40), t12 = tight(12);
ok(t12.R > 2 * t40.R && Math.abs(t12.L - 1500) / 1500 < 0.02, `12 segments bend no tighter than ${t12.R.toFixed(0)} mm (40: ${t40.R.toFixed(0)}), length ${t12.L.toFixed(0)}`);

// a stretchy cable (user 2026-11-02: the vac hose stretches): hanging, it ends up longer than relaxed, never past stretch x
const sc = C.make([[0, 0, 0], [1000, 0, 0]], { n: 12, len: 1000, r: 30, stretch: 1.25, give: 0.2 });
sc.pin(0, [0, 0, 0]); sc.pin(-1, [1000, 0, 0]); sc.settle(1500);
ok(sc.length() > 1020 && sc.length() <= 1250 + 1, `stretches under its weight: ${sc.length().toFixed(0)} (relaxed 1000, max 1250)`);
const pulled = C.make([[0, 0, 0], [1000, 0, 0]], { n: 12, len: 1000, r: 30, stretch: 1.25 });
pulled.pin(0, [0, 0, 0]); pulled.pin(-1, [1200, 0, 0]); pulled.settle(1500);
const sagP = Math.min(...pulled.points().map((q) => q[2]));
ok(pulled.length() >= 1200 && pulled.length() <= 1250 * 1.01 && sagP > -150, `pulled to 1200: stretched to ${pulled.length().toFixed(0)}, sags only ${sagP.toFixed(0)}`);

// self-collision: a long rope dropped into a U onto a floor lies on itself, its runs 2r apart, not through each other
const u = C.make([[0, 0, 0], [600, 0, 0], [600, 0, 60], [0, 0, 60]], { n: 40, len: 1300, r: 20, self: [0, 39], stiff: 0.2 });
u.pin(0, [0, 0, 0]); u.pin(-1, [0, 0, 60]);
u.settle(1200, [{ floor: -20 }]);
const up = u.points();
let close = 0;
for (let i = 0; i < up.length; i++) for (let j = i + 4; j < up.length; j++) if (Math.hypot(up[i][0] - up[j][0], up[i][1] - up[j][1], up[i][2] - up[j][2]) < 2 * 20 - 2) close++;
ok(close === 0, `a U lying on itself: ${close} node pairs closer than 2r`);
// a ball collider (another cable's node)
const sb = hang(); sb.settle(800, [{ sph: [500, 0, -300, 120] }]);
ok(!sb.points().some((q) => Math.hypot(q[0] - 500, q[1], q[2] + 300) < 120 + 5 - 0.5), "draped over a ball");

// a guide: pulled toward a shape (here a straight line 100 mm up), it sags far less than unguided
const gd = hang(), tg = Array.from({ length: gd.n }, (_, i) => [1000 * i / (gd.n - 1), 0, 0]);
gd.guide(tg, 0.3); gd.settle(800);
const gl = Math.min(...gd.points().map((q) => q[2]));
ok(gl > -200 && gl < -5, `guided: sags ${gl.toFixed(0)} (unguided ~-300), still a rope`);

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
