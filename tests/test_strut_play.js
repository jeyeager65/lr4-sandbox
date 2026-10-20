// strut_play.js (job playback) + stock_sim.js (cnc-gcode-tools' StockSimulator) on the page's strut plate job.
//   node tests/test_strut_play.js     (needs `npm install` in tests/ once for polygon-clipping)
// At a few strut lengths: the clock matches strut_cam.js's estimate, at() is continuous, and carving the whole job
// cuts every hole and the outline through, leaves the tabs at their height and the plates' faces untouched, and no
// rapid cuts the stock.
"use strict";
const pc = require("polygon-clipping");
const SC = require("../web/js/strut_cam.js");
const SP = require("../web/js/strut_play.js");
const { StockSimulator } = require("../web/js/stock_sim.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

for (const [strut, opts] of [[600, {}], [830, {}], [1200, { tabs: 0 }], [830, { step: 3.5, tabs: 6 }]]) {
  const tag = `L${strut} ${JSON.stringify(opts)}`;
  const job = SC.job(pc, strut, opts), o = job.opts, tl = SP.timeline(job);
  ok(Math.abs(tl.total / 60 - job.minutes) / job.minutes < 0.01, `${tag}: ${(tl.total / 60).toFixed(2)} min vs ${job.minutes.toFixed(2)}`);
  ok(tl.ops.length === job.ops.length && tl.ops.every((op, k) => k === 0 || op.start > tl.ops[k - 1].start), `${tag}: op starts`);
  let worst = 0;
  for (let k = 0; k < tl.segs.length; k += 37) {
    const p = SP.at(tl, tl.t[k]), e = tl.segs[k].end;
    worst = Math.max(worst, Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z));
    if (k) { const s = tl.segs[k].start, q = tl.segs[k - 1].end; worst = Math.max(worst, Math.hypot(s.x - q.x, s.y - q.y, s.z - q.z)); }
  }
  ok(worst < 1e-6, `${tag}: at() / segments continuous (${worst})`);
  const end = SP.at(tl, tl.total + 1);
  ok(end.index === tl.segs.length && Math.abs(end.z - o.clear) < 1e-9, `${tag}: ends at clear height`);

  const sim = new StockSimulator(job.stock, new Map([[1, { shape: "flat", diameter: o.bit }]]), { maxCells: 4e5, snapshots: false });
  sim.setSegments(tl.segs);
  sim.advanceTo(tl.segs.length);
  ok(sim.gouges.size === 0, `${tag}: ${sim.gouges.size} rapids cut the stock`);
  const S = job.stock, h = (x, y) => sim.heights[Math.round((y - S.ymin) / sim.dy) * sim.vx + Math.round((x - S.xmin) / sim.dx)];
  const bottom = Math.fround(S.zmin), cell = Math.hypot(sim.dx, sim.dy);
  let holes = 0, holesBad = 0, path = 0, pathBad = 0, face = 0, faceBad = 0, tabs = 0, tabsBad = 0;
  const top = -o.t - o.through + o.tabH;
  for (const op of job.ops) {
    for (const c of op.holes || []) { holes++; if (h(c.x, c.y) > bottom + 1e-4) holesBad++; }
    for (const el of op.path || []) {
      if (el.type !== "line") continue;
      const L = Math.hypot(el.b[0] - el.a[0], el.b[1] - el.a[1]), d = [(el.b[0] - el.a[0]) / L, (el.b[1] - el.a[1]) / L];
      for (let s = 2; s < L - 2; s += 5) {
        const p = [el.a[0] + d[0] * s, el.a[1] + d[1] * s], z = h(p[0], p[1]);
        // on the path: through, or a tab (its top, or a 45 deg ramp down from it)
        path++;
        if (z > bottom + 1e-4 && z < top + 0.15) tabs++;
        else if (z > bottom + 1e-4) pathBad++;
        // inside the plate (right of the clockwise path), past the bit: never touched - unless a hole is near
        const q = [p[0] + d[1] * (o.bit / 2 + 2 * cell + 0.5), p[1] - d[0] * (o.bit / 2 + 2 * cell + 0.5)];
        const nearHole = job.ops.some(op2 => (op2.holes || []).some(c => Math.hypot(c.x - q[0], c.y - q[1]) < o.holeD / 2 + 1));
        if (!nearHole) { face++; if (h(q[0], q[1]) < S.zmax - 1e-4) faceBad++; }
      }
    }
    // the tab tops in the moves: feed moves at the tab height
    for (let k = 1; k < op.moves.length; k++) {
      const m = op.moves[k], pm = op.moves[k - 1];
      if (m.g === 1 && pm.z !== undefined && Math.abs(m.z - top) < 1e-9 && Math.abs(pm.z - top) < 1e-9 && m.x !== undefined) {
        const z = h((m.x + pm.x) / 2, (m.y + pm.y) / 2);
        if (Math.abs(z - top) > 0.15) tabsBad++;
      }
    }
  }
  ok(holes > 0 && holesBad === 0, `${tag}: ${holesBad}/${holes} hole centres not through`);
  ok(pathBad === 0, `${tag}: ${pathBad}/${path} outline points not through`);
  ok(o.tabs ? tabs > 0 : tabs === 0, `${tag}: ${tabs} outline points at the tab height (tabs ${o.tabs})`);
  ok(tabsBad === 0, `${tag}: ${tabsBad} tab tops not at their height`);
  ok(face > 50 && faceBad === 0, `${tag}: ${faceBad}/${face} plate face points cut`);
  console.log(`${tag}: ${tl.segs.length} segments, ${(tl.total / 60).toFixed(1)} min, holes ${holes}, path ${path} (tabs ${tabs}), face ${face}`);
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
