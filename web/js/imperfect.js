// An imperfect machine (Part 32, user 2026-10-23): a real LR4 isn't square until it homes. Two causes, both cleaned
// up by $H: the stops are off a little (the parts the second Y / Z switch trips on aren't exactly where the first
// one's are: permanent, the user's per-motor pulloff_mm make up for it), and powered down the motors don't hold (the
// gantry comes up racked and the beam at a different height each side: random-ish, per power-up). Homing pulls each
// side to its own switch and off by its own pulloff, so it squares / levels the machine. Not fixed by homing: the
// spoilboard isn't flat (surfacing flattens it) and the router can be out of tram (shimming its mount fixes it).
// Sides: side 1 = the Min end (x = geo.xA), side 2 = the Max end (geo.span further on). Which motor is where: V1E's
// docs: "Typically, as you face the machine, the left side is Y0 and Z0" -> motor0 = side 1 (settings motor0 "min",
// the default); machines wired the other way: motor0 "max" (side2Motor). E = { y: side 2 - side 1 (rack, mm),
// z: side 2 - side 1 (beam tilt, mm) }. Table frame =
// mm from the cutting area's front-left corner, Z up from the spoilboard's top (as js/hand_setup.js).
// Plain JS: tests/test_imperfect.js.
(function (root) {
  "use strict";
  // settings (the page keeps them in localStorage lr4-asbuilt): stop = second switch's offset (mm, null = from the
  // pulloffs); power = random rack / tilt at power-up up to rackMax / tiltMax (mm); warp (mm, a fresh spoilboard: x / y
  // = how much higher the +X / back end is, bow = the middle above the edges, negative = dished); tram (deg: the bit's
  // bottom tilted down toward +X / +Y); exag = the drawing's factor on rack / tilt (0.5 mm is invisible at 1x).
  // Off by default (user 2026-10-23: "at least for now")
  const DEFAULTS = { on: false, motor0: "min", stop: { y: null, z: null }, power: true, rackMax: 2, tiltMax: 1.5,
    warp: { x: 0.3, y: -0.2, bow: 0.4 }, tram: { x: 0, y: 0 }, exag: 1, pull: null,
    slip: { on: false, x: 0.3, y: 0.3, z: 0.5 }, heat: { on: false, fire: false, auto: true } };
  // slip (Part 44a, js/lost_steps.js): lost steps on Real-world, off by default; x / y / z = each axis' drag, 0 (clean,
  // lubed) .. 1 (dry, gritty). heat (Part 44b, js/heat.js): on = smoke, scorch and a warning where the bit rubs; fire =
  // it can catch (videos); auto = the extinguisher comes by itself
  // pull = { y: [p0, p1], z: [p0, p1] }: per-motor pulloff_mm in place of the config.yaml's (a video's stand-in for a
  // tuned config; FluidNC boots with them written in, withPulloffs), null = the config's
  // the stop offsets used when the config's pulloffs are equal (V1E's file: 4 / 4), so it homes out by these: a typical
  // amount (not measured; the user sets theirs in As built)
  const GUESS_STOP = { y: 0.8, z: 0.5 };

  function settings(saved) {
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    if (saved && typeof saved === "object") {
      for (const k of ["on", "power", "rackMax", "tiltMax", "exag"]) if (saved[k] !== undefined) s[k] = saved[k];
      for (const k of ["stop", "warp", "tram", "slip", "heat"]) if (saved[k]) Object.assign(s[k], saved[k]);
      if (saved.pull && typeof saved.pull === "object") s.pull = JSON.parse(JSON.stringify(saved.pull));
      if (saved.motor0 === "max") s.motor0 = "max";
    }
    return s;
  }
  const side2Motor = (set) => (set && set.motor0 === "max" ? 0 : 1);   // the motor number on the Max end (side 2)
  // per-motor [p0, p1] -> per-side [Min end, Max end]
  const bySide = (p, set) => (side2Motor(set) === 0 ? [p[1], p[0]] : p);

  // each Y / Z motor's pulloff_mm from parsed config values ({"/axes/y/motor1/pulloff_mm": 3.2, ...}; missing = the
  // axis' other motor, else fallback) -> { y: [p0, p1], z: [p0, p1] }
  function pulloffs(values, fallback = 4) {
    const v = values || {}, out = {};
    for (const a of ["y", "z"]) {
      const p = [0, 1].map((m) => v[`/axes/${a}/motor${m}/pulloff_mm`]);
      const any = p.find((q) => Number.isFinite(q));
      out[a] = p.map((q) => (Number.isFinite(q) ? q : Number.isFinite(any) ? any : fallback));
    }
    return out;
  }
  // a config.yaml with these per-motor pulloff_mm (pull: { y: [p0, p1], z: [...] }, an axis left out = as it is):
  // each axes > y | z > motor0 | motor1 > pulloff_mm line rewritten, added after the motor's line if it has none
  function withPulloffs(text, pull) {
    if (!pull) return text;
    const out = [], ind = (l) => l.length - l.trimStart().length;
    let inAxes = -1, axis = null, axInd = -1, motor = null, mInd = -1, done = false;
    const want = () => (axis && pull[axis] && motor !== null ? pull[axis][motor] : undefined);
    const lines = String(text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], t = l.trim(), n = ind(l);
      if (t && !t.startsWith("#")) {
        if (motor !== null && n <= mInd) { if (!done && Number.isFinite(want())) out.push(" ".repeat(mInd + 2) + `pulloff_mm: ${want().toFixed(3)}`); motor = null; }
        if (axis && n <= axInd) axis = null;
        if (inAxes >= 0 && n <= inAxes) inAxes = -1;
        let m;
        if (/^axes:\s*$/.test(t)) inAxes = n;
        else if (inAxes >= 0 && !axis && (m = /^([xyzabc]):\s*$/.exec(t))) { axis = m[1]; axInd = n; }
        else if (axis && motor === null && (m = /^motor([01]):\s*$/.exec(t))) { motor = Number(m[1]); mInd = n; done = false; }
        else if (motor !== null && /^pulloff_mm:/.test(t) && Number.isFinite(want())) {
          out.push(l.replace(/pulloff_mm:\s*[-\d.]+/, `pulloff_mm: ${want().toFixed(3)}`)); done = true; continue;
        }
      }
      out.push(l);
    }
    if (motor !== null && !done && Number.isFinite(want())) out.push(" ".repeat(mInd + 2) + `pulloff_mm: ${want().toFixed(3)}`);
    return out.join("\n");
  }
  // after homing: side 1 at trip + p0 (away from its switch), side 2 at trip + stop + p1 -> E = stop + dir (p1 - p0),
  // dir = +1 homing toward min (Y), -1 toward max (Z: positive_direction)
  const dirOf = (positive) => (positive ? -1 : 1);
  const residual = (stop, p, positive) => stop + dirOf(positive) * (p[1] - p[0]);
  // the stop offsets in use: set ones, else what the pulloffs square (their difference), else GUESS_STOP
  // -> { y, z, from: { y: "set" | "pulloffs" | "guess", z } }
  function stops(set, pulls, positive) {
    const out = { from: {} };
    for (const a of ["y", "z"]) {
      const want = -dirOf(positive[a]) * (pulls[a][1] - pulls[a][0]);
      if (Number.isFinite(set.stop[a])) { out[a] = set.stop[a]; out.from[a] = "set"; }
      else if (Math.abs(want) > 1e-6) { out[a] = want; out.from[a] = "pulloffs"; }
      else { out[a] = GUESS_STOP[a]; out.from[a] = "guess"; }
    }
    return out;
  }
  // a power-up: the gantry racked, the beam off level (rnd = Math.random or a seeded one)
  function powerUp(set, rnd = Math.random) {
    if (!set.on || !set.power) return { y: 0, z: 0 };
    const r = (m) => Math.round((rnd() * 2 - 1) * m * 100) / 100;
    return { y: r(set.rackMax), z: r(set.tiltMax) };
  }

  // the tip's error at table x (mm): side 2's lead / height shared out along the beam, and the small X shift as the
  // gantry turns (the bit geo.ty in front of the carriages' line) and the beam tilts (the tip geo.tz below its middle).
  // The rack pivots on the Y carriages (xA, span); the tilt on the two Z leadscrews (zA, zspan: E.z = the Max screw's
  // height over the Min one's - what the Z pulloffs set; 2026-10-27, was the carriages' span, ~5 % off)
  const zSpan = (geo) => (geo && geo.zspan > 0 ? geo.zspan : geo ? geo.span : 0);
  function tipErr(E, geo, x) {
    const ok = geo && geo.span > 0, f = ok ? (x - geo.xA) / geo.span : 0;
    const zs = zSpan(geo), fz = ok ? (x - (geo.zspan > 0 ? geo.zA : geo.xA)) / zs : 0;
    const dx = ok ? -E.y * (geo.ty || 0) / geo.span + E.z * (geo.tz || 0) / zs : 0;
    return { dx, dy: E.y * f, dz: E.z * fz };
  }
  // the bit's bottom tilt (mm per mm, rising toward +X / +Y): the tram (down toward +X / +Y) + the beam's tilt (the
  // router hangs off it: side 2 higher tips its +X edge up)
  function slopes(set, E, geo) {
    const t = (d) => Math.tan((d || 0) * Math.PI / 180);
    return { sx: -t(set.tram.x) + (geo && geo.span > 0 ? E.z / zSpan(geo) : 0), sy: -t(set.tram.y) };
  }

  // a fresh spoilboard's warp at table (x, y), over box { x: [from, to], y: [from, to] } (the cutting area): 0 at the
  // front-left corner's middle line, x / y = the far end's rise, bow = the middle's rise over the edges
  function warpAt(w, box, x, y) {
    const u = (x - box.x[0]) / (box.x[1] - box.x[0]), v = (y - box.y[0]) / (box.y[1] - box.y[0]);
    const cu = Math.min(1, Math.max(0, u)), cv = Math.min(1, Math.max(0, v));
    return w.x * (u - 0.5) + w.y * (v - 0.5) + w.bow * (1 - (2 * cu - 1) ** 2) * (1 - (2 * cv - 1) ** 2);
  }
  // lay the warp onto a fresh StockSimulator's heights (table frame): its high spot at zmax (the sim cuts nothing above
  // zmax, and the board's top = its highest point), the rest lower. -> how far the lowest spot is below it
  function warpBoard(sim, w, box) {
    const r = freshHeights(sim, w, box);
    sim.heights.set(r.heights);
    if (sim.markAllDirty) sim.markAllDirty();
    return r.depth;
  }
  // a fresh board's heights for sim's grid: warp w (null = flat at zmax) -> { heights, depth (high - low spot) }
  function freshHeights(sim, w, box) {
    const S = sim.stock, h = new Float32Array(sim.heights.length);
    if (!w) return { heights: h.fill(S.zmax), depth: 0 };
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j <= sim.ny; j++) for (let i = 0; i <= sim.nx; i++) {
      const v = h[j * sim.vx + i] = warpAt(w, box, S.xmin + i * sim.dx, S.ymin + j * sim.dy);
      hi = Math.max(hi, v); lo = Math.min(lo, v);
    }
    for (let k = 0; k < h.length; k++) h[k] = Math.max(S.zmin, S.zmax + h[k] - hi);
    return { heights: h, depth: hi - lo };
  }
  // has the board been cut since it was laid with warp w (null = flat; undefined = not known: taken as cut)? = it
  // differs from a fresh one
  function boardCut(sim, w, box, tol = 1e-3) {
    if (w === undefined) return true;
    const f = freshHeights(sim, w, box).heights, h = sim.heights;
    for (let k = 0; k < h.length; k++) if (Math.abs(h[k] - f[k]) > tol) return true;
    return false;
  }

  // stock that follows the spoilboard (bent onto it, user 2026-10-23): how far its bottom is below where a flat stock
  // sits, over box (table frame) - a grid of cell mm, each node the board's top within a cell of it (the stock bridges
  // grooves and marks), 0 at the highest node (a flat stock sits there). board = the spoilboard's sim (table frame).
  // -> { cell, at(x, y) (bilinear, clamped to the box) }, or null when it'd be flat
  function restField(board, box, cell = 5) {
    const S = board.stock, nx = Math.max(1, Math.ceil((box.x[1] - box.x[0]) / cell)), ny = Math.max(1, Math.ceil((box.y[1] - box.y[0]) / cell));
    const gx = (box.x[1] - box.x[0]) / nx, gy = (box.y[1] - box.y[0]) / ny, v = new Float64Array((nx + 1) * (ny + 1));
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = box.x[0] + i * gx, y = box.y[0] + j * gy;
      const i0 = Math.max(0, Math.ceil((x - cell - S.xmin) / board.dx)), i1 = Math.min(board.nx, Math.floor((x + cell - S.xmin) / board.dx));
      const j0 = Math.max(0, Math.ceil((y - cell - S.ymin) / board.dy)), j1 = Math.min(board.ny, Math.floor((y + cell - S.ymin) / board.dy));
      let top = -Infinity;
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) top = Math.max(top, board.heights[jj * board.vx + ii]);
      if (top === -Infinity) top = S.zmax;           // off the board: as a flat one
      v[j * (nx + 1) + i] = top; hi = Math.max(hi, top); lo = Math.min(lo, top);
    }
    if (hi - lo < 1e-4) return null;
    for (let k = 0; k < v.length; k++) v[k] -= hi;
    const at = (x, y) => {
      const u = Math.min(nx, Math.max(0, (x - box.x[0]) / gx)), w = Math.min(ny, Math.max(0, (y - box.y[0]) / gy));
      const i = Math.min(nx - 1, Math.floor(u)), j = Math.min(ny - 1, Math.floor(w)), fu = u - i, fw = w - j, r = j * (nx + 1) + i;
      return (v[r] * (1 - fu) + v[r + 1] * fu) * (1 - fw) + (v[r + nx + 1] * (1 - fu) + v[r + nx + 2] * fu) * fw;
    };
    return { cell: Math.min(gx, gy), at };
  }
  // a sim's stock following the board (rest = restField(...) in the table frame, null = flat): its cuts go through it
  function follow(sim, rest) { if (sim._asBuilt) sim._asBuilt.rest = rest || null; return sim; }
  // how far the stock's bottom is below a flat one's at table (x, y) - 0 when flat or As built is off
  function restAt(sim, x, y) {
    const A = sim && sim._asBuilt, st = A && A.state && A.state();
    return A && A.rest && st && st.set.on ? A.rest.at(x, y) : 0;
  }

  // one straight piece cut by a tilted bit (bottom z = tip + sx ox + sy oy + r |s|: the lowest edge is at the tip, as a
  // touch plate zeroes it, the rest of the face higher). For a cell under the bit along the move, the lowest of: where
  // it enters / leaves the bit's circle and the closest point (exact for a flat bit; the profile for others)
  function tiltPiece(sim, ax, ay, az, bx, by, bz, tool, sx, sy) {
    const S = sim.stock, h = sim.heights, r = tool.radius, r2 = r * r, dx = sim.dx, dy = sim.dy, vx = sim.vx;
    const lift = r * Math.hypot(sx, sy);
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx) - r - S.xmin) / dx)), i1 = Math.min(sim.nx, Math.floor((Math.max(ax, bx) + r - S.xmin) / dx));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by) - r - S.ymin) / dy)), j1 = Math.min(sim.ny, Math.floor((Math.max(ay, by) + r - S.ymin) / dy));
    if (i0 > i1 || j0 > j1) return false;
    const ux = bx - ax, uy = by - ay, len2 = ux * ux + uy * uy, has = len2 > 1e-18, L = Math.sqrt(len2), zLow = Math.min(az, bz);
    const bottom = sim.bottom, flat = tool.flat, profile = tool.profile;
    let cut = false;
    for (let j = j0; j <= j1; j++) {
      const py = S.ymin + j * dy - ay, row = j * vx;
      for (let i = i0; i <= i1; i++) {
        const px = S.xmin + i * dx - ax;
        let best = Infinity;
        const at = (t) => {
          const ox = px - t * ux, oy = py - t * uy, e2 = ox * ox + oy * oy;
          if (e2 > r2 + 1e-9) return;
          let z = (has ? az + (bz - az) * t : zLow) + sx * ox + sy * oy + lift;
          if (!flat) z += profile(Math.sqrt(Math.min(e2, r2)));
          if (z < best) best = z;
        };
        if (has) {
          const tc = (px * ux + py * uy) / len2, q2 = px * px + py * py - tc * tc * len2, hw = Math.sqrt(Math.max(0, r2 - q2)) / L;
          const cl = (t) => Math.min(1, Math.max(0, t));
          at(cl(tc - hw)); at(cl(tc + hw)); at(cl(tc));
        } else at(0);
        if (best === Infinity) continue;
        if (best < bottom) best = bottom;
        const k = row + i;
        if (best < h[k] - 1e-6) { h[k] = best; cut = true; }
      }
    }
    if (cut) {
      if (j0 < sim.dirtyMin) sim.dirtyMin = j0;
      if (j1 > sim.dirtyMax) sim.dirtyMax = j1;
      if (i0 < sim.dirtyMinI) sim.dirtyMinI = i0;
      if (i1 > sim.dirtyMaxI) sim.dirtyMaxI = i1;
    }
    return cut;
  }
  // a move by a tilted bit, cut in pieces no longer than a cell where Z changes (as StockSimulator.sweep)
  function tiltSweep(sim, x0, y0, z0, x1, y1, z1, tool, sx, sy) {
    const lx = x1 - x0, ly = y1 - y0, lz = z1 - z0, step = Math.min(sim.dx, sim.dy);
    const n = Math.abs(lz) > 1e-9 && Math.hypot(lx, ly) > step ? Math.min(Math.ceil(Math.hypot(lx, ly) / step), 100000) : 1;
    let cut = false;
    for (let p = 0; p < n; p++) {
      const t0 = p / n, t1 = (p + 1) / n;
      cut = tiltPiece(sim, x0 + lx * t0, y0 + ly * t0, z0 + lz * t0, x0 + lx * t1, y0 + ly * t1, z0 + lz * t1, tool, sx, sy) || cut;
    }
    return cut;
  }

  // every cut of a StockSimulator goes through the machine's errors: its sweep (which carveOne / carvePartial call)
  // moves the ends by the tip's error and tilts the bit; a stock that follows the board (follow()) is cut that much
  // higher, long moves in pieces so the cut follows it. toTable = the sim's frame -> table frame offset [x, y, z];
  // state() -> { set, E, geo } now (or null = as commanded). Returns the sim.
  function attach(sim, toTable, state) {
    if (sim._asBuilt) { sim._asBuilt.toTable = toTable; sim._asBuilt.state = state; return sim; }
    const plain = sim.sweep.bind(sim), A = sim._asBuilt = { toTable, state, plain, rest: null };
    sim.sweep = (x0, y0, z0, x1, y1, z1, tool) => {
      const st = A.state && A.state();
      if (!st || !st.set.on) return plain(x0, y0, z0, x1, y1, z1, tool);
      const o = A.toTable, e0 = tipErr(st.E, st.geo, x0 + o[0]), e1 = tipErr(st.E, st.geo, x1 + o[0]);
      const { sx, sy } = slopes(st.set, st.E, st.geo), tilt = Math.abs(sx) >= 1e-7 || Math.abs(sy) >= 1e-7;
      x0 += e0.dx; y0 += e0.dy; z0 += e0.dz; x1 += e1.dx; y1 += e1.dy; z1 += e1.dz;
      const one = (a, b, c, d, e, f) => (tilt ? tiltSweep(sim, a, b, c, d, e, f, tool, sx, sy) : plain(a, b, c, d, e, f, tool));
      const R = A.rest;
      if (!R) return one(x0, y0, z0, x1, y1, z1);
      const n = Math.min(10000, Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / R.cell)));
      const pt = (t) => { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; return [x, y, z0 + (z1 - z0) * t - R.at(x + o[0], y + o[1])]; };
      let cut = false, a = pt(0);
      for (let p = 1; p <= n; p++) { const b = pt(p / n); cut = one(a[0], a[1], a[2], b[0], b[1], b[2]) || cut; a = b; }
      return cut;
    };
    return sim;
  }

  // a rectangle cut now (table frame corners x0..x1, y0..y1): its two diagonals as the machine would cut them
  // -> { d1 (front-left to back-right), d2 (front-right to back-left), diff (d1 - d2), skew (deg off square) }
  function squareness(E, geo, r) {
    const c = (x, y) => { const e = tipErr(E, geo, x); return [x + e.dx, y + e.dy]; };
    return diagonals([c(r.x0, r.y0), c(r.x1, r.y0), c(r.x1, r.y1), c(r.x0, r.y1)]);
  }
  // corners [front-left, front-right, back-right, back-left] -> { d1, d2, diff, skew }
  function diagonals(k) {
    const [A, B, C, D] = k, d1 = Math.hypot(C[0] - A[0], C[1] - A[1]), d2 = Math.hypot(D[0] - B[0], D[1] - B[1]);
    const skew = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
    return { d1, d2, diff: d1 - d2, skew };
  }
  // a carved corner cross near table (cx, cy) in a sim (off = its frame's origin in the table frame): within win mm,
  // a line fitted through each groove (along X: per column, along Y: per row), the crossing columns / rows (cut over
  // more than wide mm) left out -> [x, y] where they meet, or null. Each column's middle from its deepest node and the
  // deeper neighbour: a V-bit's sides rise k mm per mm (k = 1 / tan(half angle)), so their height difference says
  // where the point ran between them (exact while both are in the groove: cut ~2 cells wide)
  function findCross(sim, off, cx, cy, win = 15, wide = 4, k = 1 / Math.tan(Math.PI / 6)) {
    const S = sim.stock, h = sim.heights, x = cx - off[0], y = cy - off[1];
    const i0 = Math.max(0, Math.ceil((x - win - S.xmin) / sim.dx)), i1 = Math.min(sim.nx, Math.floor((x + win - S.xmin) / sim.dx));
    const j0 = Math.max(0, Math.ceil((y - win - S.ymin) / sim.dy)), j1 = Math.min(sim.ny, Math.floor((y + win - S.ymin) / sim.dy));
    if (i1 - i0 < 4 || j1 - j0 < 4) return null;
    let top = -Infinity, low = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = h[j * sim.vx + i]; top = Math.max(top, v); low = Math.min(low, v); }
    if (top - low < 0.2) return null;                // nothing cut here
    const cut = (top - low) * 0.15, X = (i) => S.xmin + i * sim.dx, Y = (j) => S.ymin + j * sim.dy;
    // one groove: for each line across it (u), its middle along it (v) -> fitted v = a + b u
    const fit = (alongX) => {
      const pts = [], step = alongX ? sim.dy : sim.dx, q0 = alongX ? j0 : i0, q1 = alongX ? j1 : i1;
      for (let p = alongX ? i0 : j0; p <= (alongX ? i1 : j1); p++) {
        const at = (q) => (alongX ? h[q * sim.vx + p] : h[p * sim.vx + q]);
        let m = -1, lo = Infinity, hi = -Infinity;
        for (let q = q0; q <= q1; q++) {
          if (top - at(q) <= cut) continue;
          lo = Math.min(lo, q); hi = Math.max(hi, q);
          if (m < 0 || at(q) < at(m)) m = q;
        }
        if (m <= q0 || m >= q1 || (hi - lo) * step > wide) continue;
        const n = at(m - 1) < at(m + 1) ? m - 1 : m + 1;   // the deeper neighbour: the point ran between m and n
        const off1 = Math.max(0, step - (at(n) - at(m)) / k) / 2;
        pts.push([alongX ? X(p) : Y(p), (alongX ? Y(m) : X(m)) + (n > m ? off1 : -off1)]);
      }
      if (pts.length < 4) return null;
      const n = pts.length, mu = pts.reduce((s, p) => s + p[0], 0) / n, mv = pts.reduce((s, p) => s + p[1], 0) / n;
      let suu = 0, suv = 0;
      for (const [u, v] of pts) { suu += (u - mu) ** 2; suv += (u - mu) * (v - mv); }
      const b = suu > 0 ? suv / suu : 0;
      return { a: mv - b * mu, b };
    };
    const gx = fit(true), gy = fit(false);           // y = gx.a + gx.b x; x = gy.a + gy.b y
    if (!gx || !gy) return null;
    const px = (gy.a + gy.b * gx.a) / (1 - gy.b * gx.b), py = gx.a + gx.b * px;
    return [px + off[0], py + off[1]];
  }
  // the squareness test read off the cut: each corner cross of rectangle r (table frame, as commanded) found in the
  // first of srcs [{ sim, off }] that has it -> { corners, d1, d2, diff, skew } (corners in the table frame), or
  // { corners, missing: [index...] } when a cross isn't there
  function readSquare(srcs, r, win = 15) {
    const want = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], corners = [], missing = [];
    want.forEach(([x, y], k) => {
      let got = null;
      for (const s of srcs) if (s && s.sim && (got = findCross(s.sim, s.off || [0, 0, 0], x, y, win))) break;
      corners.push(got);
      if (!got) missing.push(k);
    });
    return missing.length ? { corners, missing } : Object.assign({ corners }, diagonals(corners));
  }
  // a squareness test job (mm, work zero = the cutting area's front-left corner, Z 0 = the spoilboard's top): a
  // rectangle o.w x o.h at o.x, o.y engraved o.z deep (negative) with a V-bit, crosses at the corners to measure
  // the diagonals between
  function squareJob(o) {
    const f = (v) => (+v).toFixed(3), x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h, k = 10;
    // short lines: FluidNC stops a job on a line over 127 bytes ("14 Line too long")
    const L = ["(LR4 squareness test)", "(Made by the LowRider 4 Sandbox)", `(A ${f(o.w)} x ${f(o.h)} mm rectangle, crosses at the corners)`,
      "(Measure the diagonals between the crosses: equal = square)",
      "(ToolDef 1: SHAPE=vbit D=6.35 ANGLE=60 NAME=60 deg V-bit)", "G21 G90 G54", "T1", `M3 S${o.rpm || 18000}`, "G0 Z5"];
    const cut = (pts) => {
      L.push(`G0 X${f(pts[0][0])} Y${f(pts[0][1])}`, `G1 Z${f(o.z)} F${o.plunge || 300}`);
      for (const p of pts.slice(1)) L.push(`G1 X${f(p[0])} Y${f(p[1])} F${o.feed || 1500}`);
      L.push("G0 Z5");
    };
    cut([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { cut([[x - k, y], [x + k, y]]); cut([[x, y - k], [x, y + k]]); }
    L.push("M5", "G0 X0 Y0", "M30", "");
    return L.join("\n");
  }

  // ---- the share link (user 2026-10-25): ab=1 (Real-world) + abx = what differs from the defaults, e.g.
  // abx=m0_max~sy_0.5~wx_-0.3 (pull - a video's stand-in - isn't shared) ----
  const LINK = [["m0", (s) => s.motor0, (s, v) => (s.motor0 = v === "max" ? "max" : "min")],
    ["sy", (s) => s.stop.y, (s, v) => (s.stop.y = v === "" ? null : +v)], ["sz", (s) => s.stop.z, (s, v) => (s.stop.z = v === "" ? null : +v)],
    ["pw", (s) => (s.power ? 1 : 0), (s, v) => (s.power = v !== "0")], ["rm", (s) => s.rackMax, (s, v) => (s.rackMax = +v)],
    ["tm", (s) => s.tiltMax, (s, v) => (s.tiltMax = +v)], ["wx", (s) => s.warp.x, (s, v) => (s.warp.x = +v)],
    ["wy", (s) => s.warp.y, (s, v) => (s.warp.y = +v)], ["wb", (s) => s.warp.bow, (s, v) => (s.warp.bow = +v)],
    ["tx", (s) => s.tram.x, (s, v) => (s.tram.x = +v)], ["ty", (s) => s.tram.y, (s, v) => (s.tram.y = +v)],
    ["ex", (s) => s.exag, (s, v) => (s.exag = +v || 1)], ["ls", (s) => (s.slip.on ? 1 : 0), (s, v) => (s.slip.on = v === "1")],
    ...["x", "y", "z"].map((a) => [`l${a}`, (s) => s.slip[a], (s, v) => (s.slip[a] = Math.min(1, Math.max(0, +v)))]),
    ...[["ht", "on"], ["fi", "fire"], ["au", "auto"]].map(([k, f]) => [k, (s) => (s.heat[f] ? 1 : 0), (s, v) => (s.heat[f] = v === "1")])];
  function toLink(set) {
    const d = settings(), q = {}, x = [];
    if (set.on) q.ab = "1";
    for (const [k, get] of LINK) if (get(set) !== get(d)) x.push(`${k}_${get(set) === null ? "" : get(set)}`);
    if (x.length) q.abx = x.join("~");
    return q;
  }
  function fromLink(o) {                              // the link's keys -> settings (null if it has neither)
    if (o.ab === undefined && o.abx === undefined) return null;
    const s = settings();
    s.on = o.ab === "1";
    for (const t of (o.abx || "").split("~").filter(Boolean)) {
      const i = t.indexOf("_"), f = LINK.find(([k]) => k === t.slice(0, i)), v = t.slice(i + 1);
      if (f && (v === "" || f[0] === "m0" || Number.isFinite(+v))) f[2](s, v);
    }
    return settings(s);
  }
  const api = { DEFAULTS, GUESS_STOP, freshHeights, settings, toLink, fromLink, side2Motor, bySide, pulloffs, withPulloffs, dirOf, residual, stops, powerUp, tipErr, slopes, warpAt, warpBoard,
    freshHeights, boardCut, restField, follow, restAt, tiltPiece, tiltSweep, attach, squareness, diagonals, findCross, readSquare, squareJob };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Imperfect = api;
})(typeof self !== "undefined" ? self : this);
