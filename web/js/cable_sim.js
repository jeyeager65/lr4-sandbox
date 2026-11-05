// A cable as a rope (Part 53a): a chain of nodes, Verlet with gravity, its segments' lengths held, a bend stiffness,
// pinned nodes (an end and its direction = the end node + the one next to it) and colliders the nodes are pushed out
// of (boxes, upright cylinders, a floor). No self-collision. Plain JS, no three.js (tests/test_cable_sim.js).
// Stiffness here is soft (a position-based solver can't hold a long bend against the chain's weight); a stiff cable
// (the vac hose) uses fewer, longer segments instead - the smooth tube through them can't fold tighter than ~one.
//   const c = LR4Cable.make(points, { n, len, r, stiff, stretch, give, damp, iters })   // laid along points (n nodes);
//     len = its relaxed length; stretch = how far it can extend (1: not at all), give = how softly it pulls back
//   c.pin(i, [x, y, z]) / c.unpin(i); c.guide(targets, k); c.step(dt, colliders); c.settle(steps, colliders); c.points(); c.length()
// colliders: [{ box: [x0, y0, z0, x1, y1, z1] } | { cyl: [x, y, r, z0, z1] } | { sph: [x, y, z, r] } | { floor: z }]. mm, s;
// z up. self: [from, to] - those nodes keep 2r apart (a run lying on itself; not near neighbours).
(function (root) {
  "use strict";
  const G = 9810;                                     // mm/s^2

  // n points evenly along a polyline (by arc length)
  function resample(pts, n) {
    const d = [0];
    for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const L = d[d.length - 1], out = [];
    for (let k = 0, j = 1; k < n; k++) {
      const s = L * k / (n - 1);
      while (j < pts.length - 1 && d[j] < s) j++;
      const t = d[j] > d[j - 1] ? (s - d[j - 1]) / (d[j] - d[j - 1]) : 0;
      out.push([0, 1, 2].map((q) => pts[j - 1][q] + (pts[j][q] - pts[j - 1][q]) * Math.min(1, Math.max(0, t))));
    }
    return out;
  }

  function make(points, o) {
    o = Object.assign({ n: 30, len: null, r: 5, stiff: 0.2, stretch: 1, give: 0.2, damp: 0.04, iters: 24, self: null }, o || {});
    const lay = resample(points, o.n), n = lay.length;
    const L = o.len || lay.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - lay[i - 1][0], p[1] - lay[i - 1][1], p[2] - lay[i - 1][2]) : 0), 0);
    const seg = L / (n - 1);
    const p = new Float64Array(3 * n), q = new Float64Array(3 * n), pin = new Array(n).fill(null);
    let guide = null, gk = 0;                         // guide: a soft pull of each node toward a target (or null) - a shape to keep
    lay.forEach((v, i) => { for (let k = 0; k < 3; k++) p[3 * i + k] = q[3 * i + k] = v[k]; });

    function keep(i) { const a = pin[i]; if (a) for (let k = 0; k < 3; k++) p[3 * i + k] = a[k]; }
    function dist(i, j, rest, wi, wj) {                // move i and j to rest apart (wi, wj: their shares)
      const dx = p[3 * j] - p[3 * i], dy = p[3 * j + 1] - p[3 * i + 1], dz = p[3 * j + 2] - p[3 * i + 2], d = Math.hypot(dx, dy, dz) || 1e-9;
      const f = (d - rest) / d;
      p[3 * i] += dx * f * wi; p[3 * i + 1] += dy * f * wi; p[3 * i + 2] += dz * f * wi;
      p[3 * j] -= dx * f * wj; p[3 * j + 1] -= dy * f * wj; p[3 * j + 2] -= dz * f * wj;
    }
    const w = (i) => (pin[i] ? 0 : 1);
    // the colliders, prepared once a step (perf, Part 53: collide was ~4 s of a page load): balls (sph) bucketed in a grid
    // of cells >= the largest ball's reach, so a node checks only the 27 cells round it; the rest kept with a reach box
    let prep = null, prepCols = null;
    const BC = 120;                                      // the box / cylinder grid's cell (mm)
    function prepare(cols) {
      if (prepCols === cols && prep) return prep;
      const sph = [], always = [], bgrid = new Map();
      let cell = 1;
      for (const c of cols) if (c.sph) { sph.push(c.sph); cell = Math.max(cell, 2 * (c.sph[3] + o.r)); }
      const grid = new Map(), key = (a, b, c) => ((a + 4096) * 8192 + (b + 4096)) * 8192 + (c + 4096);   // numeric (strings were slow)
      for (const q of sph) {
        const k = key(Math.floor(q[0] / cell), Math.floor(q[1] / cell), Math.floor(q[2] / cell));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(q);
      }
      // boxes + cylinders: into every cell their reach (+ r) covers; a node checks its own cell only. A floor, or a
      // part covering too many cells: checked always
      for (const c of cols) {
        if (c.sph) continue;
        let bb = null;
        if (c.box) bb = c.box;
        else if (c.cyl) { const [x, y, r0, z0, z1] = c.cyl; bb = [x - r0, y - r0, z0, x + r0, y + r0, z1]; }
        if (!bb) { always.push(c); continue; }
        const R = o.r + 1, lo = [0, 1, 2].map((k) => Math.floor((bb[k] - R) / BC)), hi = [0, 1, 2].map((k) => Math.floor((bb[k + 3] + R) / BC));
        if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4000) { always.push(c); continue; }
        for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let z = lo[2]; z <= hi[2]; z++) {
          const k = key(a, b, z);
          if (!bgrid.has(k)) bgrid.set(k, []);
          bgrid.get(k).push(c);
        }
      }
      prepCols = cols;
      prep = { always, bgrid, grid, cell, key, n: sph.length };
      return prep;
    }
    function collide(i, cols) {
      const R = o.r, P = prepare(cols);
      if (P.n) {                                         // the balls near this node only
        // a cell is >= 2x a ball's reach, so a ball touching the node is in its own cell or the neighbour on its nearer
        // side, per axis: 8 cells, not 27 (Part 53c perf: collide was the top cost of a move)
        const fx = p[3 * i] / P.cell, fy = p[3 * i + 1] / P.cell, fz = p[3 * i + 2] / P.cell;
        const gx = Math.floor(fx), gy = Math.floor(fy), gz = Math.floor(fz);
        const ax0 = fx - gx < 0.5 ? -1 : 0, by0 = fy - gy < 0.5 ? -1 : 0, cz0 = fz - gz < 0.5 ? -1 : 0;
        for (let a = ax0; a <= ax0 + 1; a++) for (let b = by0; b <= by0 + 1; b++) for (let c = cz0; c <= cz0 + 1; c++) {
          const list = P.grid.get(P.key(gx + a, gy + b, gz + c));
          if (!list) continue;
          for (const [cx, cy, cz, cr] of list) {
            const dx = p[3 * i] - cx, dy = p[3 * i + 1] - cy, dz = p[3 * i + 2] - cz, rr = cr + R;
            if (dx > rr || dx < -rr || dy > rr || dy < -rr || dz > rr || dz < -rr) continue;
            const d = Math.hypot(dx, dy, dz);
            if (d < rr && d > 1e-9) { const k = rr / d; p[3 * i] = cx + dx * k; p[3 * i + 1] = cy + dy * k; p[3 * i + 2] = cz + dz * k; }
          }
        }
      }
      const own = P.bgrid.get(P.key(Math.floor(p[3 * i] / BC), Math.floor(p[3 * i + 1] / BC), Math.floor(p[3 * i + 2] / BC)));
      for (let w2 = 0, L1 = P.always.length, L2 = own ? own.length : 0; w2 < L1 + L2; w2++) {
        const c = w2 < L1 ? P.always[w2] : own[w2 - L1];
        let x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2];
        if (c.floor !== undefined) { if (z < c.floor + R) p[3 * i + 2] = c.floor + R; continue; }
        if (c.box) {
          const b = c.box;
          if (x > b[0] - R && x < b[3] + R && y > b[1] - R && y < b[4] + R && z > b[2] - R && z < b[5] + R) {
            const out = [[x - (b[0] - R), 0, -1], [(b[3] + R) - x, 0, 1], [y - (b[1] - R), 1, -1], [(b[4] + R) - y, 1, 1],
              [z - (b[2] - R), 2, -1], [(b[5] + R) - z, 2, 1]].reduce((m, v) => (v[0] < m[0] ? v : m));
            p[3 * i + out[1]] += out[0] * out[2];
          }
          continue;
        }
        if (c.sph) {                                     // a ball (x, y, z, r): another cable's node
          const [cx, cy, cz, cr] = c.sph, dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz), rr = cr + R;
          if (d < rr && d > 1e-9) { const k = rr / d; p[3 * i] = cx + dx * k; p[3 * i + 1] = cy + dy * k; p[3 * i + 2] = cz + dz * k; }
          continue;
        }
        if (c.cyl) {
          const [cx, cy, cr, z0, z1] = c.cyl, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), rr = cr + R;
          if (d < rr && z > z0 - R && z < z1 + R) {
            if (z1 + R - z < rr - d) p[3 * i + 2] = z1 + R;   // nearer the top: onto it
            else { const k = d > 1e-9 ? rr / d : 1; p[3 * i] = cx + (d > 1e-9 ? dx * k : rr); p[3 * i + 1] = cy + dy * (d > 1e-9 ? k : 0); }
          }
        }
      }
    }
    function step(dt, cols) {
      const g = G * dt * dt, keepV = 1 - o.damp;
      for (let i = 0; i < n; i++) {
        if (pin[i]) { keep(i); q[3 * i] = p[3 * i]; q[3 * i + 1] = p[3 * i + 1]; q[3 * i + 2] = p[3 * i + 2]; continue; }
        for (let k = 0; k < 3; k++) {
          const v = (p[3 * i + k] - q[3 * i + k]) * keepV;
          q[3 * i + k] = p[3 * i + k];
          p[3 * i + k] += v - (k === 2 ? g : 0);
        }
      }
      for (let it = 0; it < o.iters; it++) {
        const fw = it % 2 === 0;                       // sweep both ways in turn (no lean to one end)
        if (o.stiff > 0) for (let k = 1; k + 1 < n; k++) {   // bend: nodes two apart softly toward straight (2 seg)
          const i = fw ? k : n - 1 - k, a0 = i - 1, b0 = i + 1, wa = w(a0), wb = w(b0), ws = wa + wb;
          if (!ws) continue;
          const dx = p[3 * b0] - p[3 * a0], dy = p[3 * b0 + 1] - p[3 * a0 + 1], dz = p[3 * b0 + 2] - p[3 * a0 + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d < 2 * seg) dist(a0, b0, 2 * seg, o.stiff * wa / ws, o.stiff * wb / ws);
        }
        for (let k = 0; k + 1 < n; k++) {              // the segments' lengths, last (they win)
          const i = fw ? k : n - 2 - k, wi = w(i), wj = w(i + 1), s = wi + wj;
          if (!s) continue;
          if (o.stretch <= 1) { dist(i, i + 1, seg, wi / s, wj / s); continue; }
          // a stretchy cable (a wire-helix hose): never shorter than its relaxed length, never longer than stretch x, and
          // pulled back toward relaxed softly (give) in between - it stretches under its own weight, more when pulled
          const d = Math.hypot(p[3 * i + 3] - p[3 * i], p[3 * i + 4] - p[3 * i + 1], p[3 * i + 5] - p[3 * i + 2]);
          if (d < seg) dist(i, i + 1, seg, wi / s, wj / s);
          else if (d > seg * o.stretch) dist(i, i + 1, seg * o.stretch, wi / s, wj / s);
          else dist(i, i + 1, seg, o.give * wi / s, o.give * wj / s);
        }
        if (o.self) {                                   // nodes [from, to] keep 2r apart (not near neighbours): a run lying on itself
          const [a0, b0] = o.self, D = 2 * o.r;
          for (let i = a0; i <= b0; i++) for (let j = i + 4; j <= b0; j++) {
            const dx = p[3 * j] - p[3 * i], dy = p[3 * j + 1] - p[3 * i + 1], dz = p[3 * j + 2] - p[3 * i + 2];
            if (Math.abs(dx) >= D || Math.abs(dy) >= D || Math.abs(dz) >= D) continue;
            const wi = w(i), wj = w(j), ws = wi + wj;
            if (ws && Math.hypot(dx, dy, dz) < D) dist(i, j, D, wi / ws, wj / ws);
          }
        }
        if (guide) for (let i = 0; i < n; i++) {
          const g = guide[i];
          if (!g || pin[i]) continue;
          const wt = g.length > 3 ? g[3] : 1;          // a 4th value: this node's share of the pull
          for (let k = 0; k < 3; k++) p[3 * i + k] += (g[k] - p[3 * i + k]) * gk * wt;
        }
        if (cols && cols.length) for (let i = 0; i < n; i++) if (!pin[i]) collide(i, cols);
        for (let i = 0; i < n; i++) keep(i);
      }
    }
    return {
      n, seg, len: L, r: o.r, opt: o,
      pin(i, v) { pin[i < 0 ? n + i : i] = v.slice(); keep(i < 0 ? n + i : i); },
      unpin(i) { pin[i < 0 ? n + i : i] = null; },
      guide(targets, k) { guide = targets; gk = k; },
      snap(targets) {                                  // jump to targets[i] (where not null), at rest - then a short settle (perf)
        for (let i = 0; i < n; i++) { const g = targets[i]; if (!g || pin[i]) continue; for (let k = 0; k < 3; k++) p[3 * i + k] = q[3 * i + k] = g[k]; }
      },   // targets[i] = [x, y, z (, weight)] or null; k: the pull a pass (0..1)
      step,
      settle(steps, cols, dt = 1 / 120) { for (let s = 0; s < steps; s++) step(dt, cols); },
      points() { const out = []; for (let i = 0; i < n; i++) out.push([p[3 * i], p[3 * i + 1], p[3 * i + 2]]); return out; },
      length() { let s = 0; for (let i = 1; i < n; i++) s += Math.hypot(p[3 * i] - p[3 * i - 3], p[3 * i + 1] - p[3 * i - 2], p[3 * i + 2] - p[3 * i - 1]); return s; },
      speed() { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.hypot(p[3 * i] - q[3 * i], p[3 * i + 1] - q[3 * i + 1], p[3 * i + 2] - q[3 * i + 2])); return m; },
    };
  }

  const api = { make, resample, G };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Cable = api;
})(typeof self !== "undefined" ? self : this);
