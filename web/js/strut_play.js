// LR4 strut plate job playback (simulator stage 1): StrutCam.job() moves -> timed straight segments for the
// stock simulator (stock_sim.js) and the machine pose at any time. Arcs are split into short chords; times use
// strut_cam.js's estimate (feeds / plunges at their rates, rapids at 50 mm/s, x 1.25), so the clock matches the
// page's "~N min". tests/test_strut_play.js checks it.
(function (root) {
  "use strict";
  const RAPID = 50, SLOW = 1.25;             // strut_cam.js minutes(): rapids mm/s, allowance for acceleration
  const ARC_STEP = Math.PI / 12, CHORD = 0.5;   // at most 15 deg and 0.5 mm per piece

  // job -> { segs: [{type, start, end, toolNumber, op}], t: Float64Array (each segment's end time, s), total, ops }
  function timeline(job) {
    const o = job.opts, segs = [], ends = [];
    let p = { x: 0, y: 0, z: o.probeClear }, t = 0;
    const ops = [];
    const push = (type, e, rate, op) => {
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      if (d < 1e-9) return;
      t += d / rate * SLOW;
      segs.push({ type, start: p, end: e, toolNumber: 1, tool: 1, op });
      ends.push(t);
      p = e;
    };
    job.ops.forEach((op, k) => {
      ops.push({ name: op.name, start: t, index: segs.length });
      for (const m of op.moves) {
        const e = { x: m.x ?? p.x, y: m.y ?? p.y, z: m.z ?? p.z };
        if (m.g === 0) { push("rapid", e, RAPID, k); continue; }
        const plunge = m.f === "plunge" && Math.hypot(e.x - p.x, e.y - p.y) < 1e-6;
        const rate = plunge ? o.plunge : o.feed;
        if (m.g === 1) { push("feed", e, rate, k); continue; }
        // G2 / G3: centre = start + (i, j); split by angle and chord
        const cx = p.x + m.i, cy = p.y + m.j, r = Math.hypot(m.i, m.j);
        const a0 = Math.atan2(p.y - cy, p.x - cx);
        let sweep = Math.atan2(e.y - cy, e.x - cx) - a0;
        if (m.g === 3) { if (sweep <= 1e-9) sweep += 2 * Math.PI; } else if (sweep >= -1e-9) sweep -= 2 * Math.PI;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(sweep) / ARC_STEP, Math.abs(sweep) * r / CHORD)));
        const z0 = p.z;
        for (let q = 1; q <= n; q++) {
          const a = a0 + sweep * q / n;
          push("feed", q === n ? e : { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: z0 + (e.z - z0) * q / n }, rate, k);
        }
      }
    });
    return { segs, t: Float64Array.from(ends), total: t, ops };
  }

  // the segment under way at time s: { index, progress (0-1), x, y, z, op }; past the end = the last point
  function at(tl, s) {
    const n = tl.segs.length;
    if (!n) return { index: 0, progress: 0, x: 0, y: 0, z: 0, op: -1 };
    if (s >= tl.total) { const e = tl.segs[n - 1].end; return { index: n, progress: 0, x: e.x, y: e.y, z: e.z, op: tl.segs[n - 1].op }; }
    let lo = 0, hi = n - 1;                    // first segment ending after s
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tl.t[mid] > s) hi = mid; else lo = mid + 1; }
    const sg = tl.segs[lo], t0 = lo ? tl.t[lo - 1] : 0, f = Math.min(1, Math.max(0, (s - t0) / (tl.t[lo] - t0)));
    const { start: a, end: b } = sg;
    return { index: lo, progress: f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, op: sg.op };
  }

  const api = { timeline, at, RAPID, SLOW };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StrutPlay = api;
})(typeof self !== "undefined" ? self : this);
