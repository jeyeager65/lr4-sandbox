// Carving from the machine's real motion (FluidNC mode): the page samples the tool's position from the motors' step
// counts every few ms and feeds it here, with the job's parsed moves (GcodePlay.load's segs, work mm). While the
// samples lie on those moves (within tol), the moves themselves are carved, so arcs come out as in Playback even when
// the samples are far apart; where the machine leaves them (a probe stopping early, a jog, a typed-in move, a
// different file) the sampled path is carved as straight lines. Monotonic: the cursor only moves forward, and after
// leaving the path it rejoins at the first move ahead that the machine is on again (the moves skipped meanwhile
// aren't carved - the machine didn't make them). Plain JS: tests/test_motion_carve.js.
(function (root) {
  "use strict";

  // the closest point of segment s to p: { u (0-1 along it), d (distance, mm) }
  function project(s, p) {
    const ax = s.start.x, ay = s.start.y, az = s.start.z;
    const vx = s.end.x - ax, vy = s.end.y - ay, vz = s.end.z - az, L2 = vx * vx + vy * vy + vz * vz;
    let u = L2 > 1e-12 ? ((p.x - ax) * vx + (p.y - ay) * vy + (p.z - az) * vz) / L2 : 0;
    u = Math.min(1, Math.max(0, u));
    return { u, d: Math.hypot(ax + vx * u - p.x, ay + vy * u - p.y, az + vz * u - p.z) };
  }
  const len = (s) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y, s.end.z - s.start.z);

  // segs: the job's moves; opts.tol (mm, default 0.1), opts.maxSegs (search window, default 20000).
  // feed(p, reach) -> actions: { seg: i, from, to } (carve move i from..to, 0-1) or { line: [a, b], seg: i } (carve
  // the straight line a -> b with move i's tool). reach = how far along the path the machine can have gone since the
  // last sample (mm; the page: max rate x time scale x elapsed); omitted = no limit.
  function tracker(segs, opts = {}) {
    const tol = opts.tol ?? 0.1, maxSegs = opts.maxSegs ?? 20000;
    // cursor: move i carved up to f; carved = moves done; stop: no move from this index on yet (the page: the next M0 -
    // a real Z homing goes up and down past the switch, which looked like the $HZ after the M0)
    const T = { i: 0, f: 0, on: false, last: null, carved: 0, stop: Infinity };
    T.feed = (p, reach = Infinity) => {
      const out = [];
      const prev = T.last;
      T.last = { x: p.x, y: p.y, z: p.z };
      if (!segs.length) { if (prev) out.push({ line: [prev, T.last], seg: -1 }); return out; }
      // the first move from the cursor on that p lies on (within reach along the path)
      let hit = null, run = 0;
      for (let j = T.i; j < segs.length && j < T.i + maxSegs && j < T.stop; j++) {
        const q = project(segs[j], p);
        if (q.d <= tol && (j > T.i || q.u >= T.f - 1e-6)) { hit = { j, u: q.u }; break; }
        if (segs[j].type !== "probe") run += len(segs[j]) * (j === T.i ? 1 - T.f : 1);   // a probe stops short at contact
        if (run > reach + tol) break;
      }
      if (hit && T.on) {                               // along the path: the moves in between are done
        for (let j = T.i; j < hit.j; j++) { if (j > T.i || T.f < 1) out.push({ seg: j, from: j === T.i ? T.f : 0, to: 1 }); }
        const from = hit.j === T.i ? T.f : 0;
        if (hit.u > from) out.push({ seg: hit.j, from, to: hit.u });
      } else if (hit) {                                // back on the path: the way here was the machine's own
        if (prev) out.push({ line: [prev, T.last], seg: hit.j });
      } else if (prev) out.push({ line: [prev, T.last], seg: T.i });   // off it
      if (hit) {
        if (hit.j !== T.i) { T.i = hit.j; T.f = hit.u; } else T.f = Math.max(T.f, hit.u);
        T.on = true;
      } else T.on = false;
      T.carved = T.i + (T.f >= 1 - 1e-9 ? 1 : 0);
      return out;
    };
    // jump the cursor (a new job starting, or the stock defined part way): the next sample rejoins from move i
    T.seek = (i, f = 0) => { T.i = i; T.f = f; T.on = false; T.carved = i; };
    return T;
  }

  // carve feed()'s actions into a cnc-gcode-tools StockSimulator (its tools; segs = the ones the tracker follows):
  // a move piece by piece as StockSimulator.carvePartial does (the move after a probe starts at its retract height),
  // a line with its move's tool. Returns true if anything was cut.
  function carve(sim, segs, actions) {
    let cut = false;
    for (const a of actions) {
      if (a.line) {
        const s = segs[a.seg], tool = (s && sim.tools.get(s.toolNumber)) || sim.defaultTool, [p, q] = a.line;
        if (!tool || Math.min(p.z, q.z) >= sim.stock.zmax) continue;
        cut = sim.sweep(p.x, p.y, p.z, q.x, q.y, q.z, tool) || cut;
        continue;
      }
      const s = segs[a.seg], at = (t) => ({ x: s.start.x + (s.end.x - s.start.x) * t,
        y: s.start.y + (s.end.y - s.start.y) * t, z: s.start.z + (s.end.z - s.start.z) * t });
      const piece = a.from <= 0 && a.to >= 1 ? s : Object.assign({}, s, { start: at(a.from), end: at(a.to) });
      cut = sim.carveOne(piece, a.from <= 0 ? segs[a.seg - 1] : piece, sim.tools, sim.defaultTool) || cut;
    }
    return cut;
  }

  const api = { project, tracker, carve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MotionCarve = api;
})(typeof self !== "undefined" ? self : this);
