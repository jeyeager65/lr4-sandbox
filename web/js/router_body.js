// A router's model from its preset (Part 45b, user 2026-10-28; names 2026-10-29): web/data/routers.js `model` ->
// triangle meshes in the router's own frame (mm, z up from the collet nut's bottom, +x = the motor cap's switch / dial
// end; see the data file's header). One closed mesh per part, so each takes its own look (js/routers.js LOOK_PARTS):
// the turned stack (shaft, bearing cap, motor housing, collar, transition), the motor cap (a box with rounded edges),
// the dial wheel, switch (+ its rocker both ways), shaft lock, strain relief + cord stub, trim (small dark details),
// and the parts a bit change shows (js/page/tool_change.js): the collet nut, the collet and the shaft's threaded end.
// No booleans: pieces overlap. Plain JS, no THREE (tests/test_router_body.js); the page wraps the arrays.
//   build(model) -> { parts: { name: { pos: number[], idx: number[] } }, dial: { c, axis, out, r, t } | null, cord: { tip, dir },
//                     rocker, noSwitch, z: { nutTop, shaftEnd, flats, lock } }
//   place(mesh, frame) -> a copy moved into frame { o: [x, y, z], a: rad about z }
(function (root) {
  "use strict";
  const N = 96;                                      // points round a turned piece / the motor cap
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
  const perp = (d) => norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0]));
  const mesh = () => ({ pos: [], idx: [] });
  function append(m, o) {
    const k = m.pos.length / 3;
    for (const v of o.pos) m.pos.push(v);
    for (const i of o.idx) m.idx.push(i + k);
    return m;
  }
  // rings (each n points, in profile order: the first and last may be one point = a cap's centre) -> a closed
  // surface; angle runs counter-clockwise seen from the far end of the axis, profile from the bottom centre out,
  // up and back in, so every face points out
  function sweep(rings) {
    const m = mesh(), n = rings[0].length;
    for (const r of rings) for (const p of r) m.pos.push(p[0], p[1], p[2]);
    for (let j = 0; j + 1 < rings.length; j++)
      for (let i = 0; i < n; i++) {
        const a = j * n + i, b = j * n + (i + 1) % n, c = (j + 1) * n + (i + 1) % n, d = (j + 1) * n + i;
        m.idx.push(a, b, c, a, c, d);
      }
    return m;
  }
  // turned piece about an axis: prof = [[r, h]...] from the bottom centre (r 0) to the top centre (r 0); flat: the
  // ring clamped to +-flat along u (two wrench flats; about z: facing +-y, as the hex nut's), per point ([r, h, flat])
  function turned(prof, o, dir, n) {
    n = n || N;
    const d = norm(dir), u = perp(d), v = cross(d, u);
    return sweep(prof.map(([r, h, fl]) => Array.from({ length: n }, (_, i) => {
      const t = 2 * Math.PI * i / n, c = fl > 0 ? Math.max(-fl, Math.min(fl, r * Math.cos(t))) : r * Math.cos(t);
      return add(add(o, mul(d, h)), add(mul(u, c), mul(v, r * Math.sin(t))));
    })));
  }
  const cyl = (o, dir, d, l, n) => turned([[0, 0], [d / 2, 0], [d / 2, l], [0, l]], o, dir, n);
  const zcyl = (d, z0, z1, n) => turned([[0, z0], [d / 2, z0], [d / 2, z1], [0, z1]], [0, 0, 0], [0, 0, 1], n);

  // ---- the motor cap: a box with its own corner radius per end, top edges rounded, bottom edges rounded ----
  function sdPoly(pts, x, y) {                       // convex CCW polygon (the hex nut)
    let out = -Infinity, dq = Infinity, inside = true;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey);
      const s = ((x - a[0]) * ey - (y - a[1]) * ex) / el;   // + outside
      out = Math.max(out, s);
      if (s > 0) inside = false;
      const t = Math.min(Math.max(((x - a[0]) * ex + (y - a[1]) * ey) / (el * el), 0), 1);
      dq = Math.min(dq, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
    }
    return inside ? out : dq;
  }
  function planSd(s) {
    if (s.plan) return s.plan;
    const rn = s.r ? s.r[0] : 0, rp = s.r ? s.r[1] : 0, bx = s.L / 2, by = s.W / 2;
    s.plan = (x, y) => {                             // iq's rounded box, corner r per end
      const r = Math.min(x > 0 ? rp : rn, bx, by), qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r;
      return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    };
    return s.plan;
  }
  const half = (s) => [s.L / 2, s.W / 2];
  function topAt(s, x, y) {                          // the slab's top at a plan point (slab frame): its edge rounding
    const d = -planSd(s)(x, y), top = s.z[1], rt = s.top_r || 0;
    if (d < 0) return null;
    const z = rt > 0 && d < rt ? top - rt + Math.sqrt(Math.max(rt * rt - (rt - d) * (rt - d), 0)) : top;
    return Math.max(z, s.z[0]);
  }
  function rayOf(s) {                                // (th, d) -> the plan point d in from s's outline along the ray at th
    const sd = planSd(s), [hx, hy] = half(s), far = Math.hypot(hx, hy) + 1, dmax = -sd(0, 0);
    return (th, d) => {
      d = Math.min(d, dmax);
      const cx = Math.cos(th), cy = Math.sin(th);
      let lo = 0, hi = far;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sd(cx * m, cy * m) < -d) lo = m; else hi = m; }
      return [cx * lo, cy * lo];
    };
  }
  function slab(s) {
    const sd = planSd(s), z0 = s.z[0], at = s.at || [0, 0];
    const cb = s.chamfer || s.bot_r || 0, rt = s.top_r || 0;
    const dmax = -sd(0, 0), ray = rayOf(s);
    const prof = [[dmax, () => z0]];                // [d in, z(x, y)] from the bottom centre round to the top centre
    if (s.chamfer) prof.push([cb, () => z0], [0, () => z0 + cb]);
    else if (s.bot_r) for (let k = 0; k <= 6; k++) { const f = Math.PI / 2 * k / 6; prof.push([cb - cb * Math.sin(f), () => z0 + cb - cb * Math.cos(f)]); }
    else prof.push([0, () => z0]);
    const tz = (x, y) => topAt(s, x, y) ?? z0;
    prof.push([0, (x, y) => Math.min(s.z[1] - rt, tz(x, y))]);
    if (rt > 0) for (let k = 1; k <= 8; k++) prof.push([rt * (1 - Math.cos(Math.PI / 2 * k / 8)), tz]);
    const dIn = Math.max(rt, 0.5);
    for (let k = 1; k <= 8; k++) prof.push([dIn + (dmax - dIn) * k / 8, tz]);
    const rings = prof.map(([d, zf]) => Array.from({ length: N }, (_, i) => {
      const [x, y] = ray(2 * Math.PI * i / N, d);
      return [x + at[0], y + at[1], zf(x, y)];
    }));
    return sweep(rings);
  }
  function hexNut(af, h, z0, bore) {                 // a hex, chamfered both ends, centred on the axis
    const rc = af / 2 / Math.cos(Math.PI / 6), pts = Array.from({ length: 6 }, (_, i) => [rc * Math.cos(Math.PI / 3 * i), rc * Math.sin(Math.PI / 3 * i)]);
    const m = slab({ plan: (x, y) => sdPoly(pts, x, y), L: 2 * rc, W: af, z: [z0, z0 + h], chamfer: Math.min(1.2, h / 4) });
    if (bore > 0) append(m, turned([[0, z0 - 0.02], [bore / 2, z0 - 0.02], [bore / 2, z0 + 0.6], [0, z0 + 0.6]], [0, 0, 0], [0, 0, 1], 32));   // the dark hole the collet shows in
    return m;
  }
  function box(c, size) {                            // axis-aligned, centred on c
    const [hx, hy, hz] = size.map((v) => v / 2), m = mesh();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) m.pos.push(c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz);
    m.idx.push(0, 3, 2, 0, 1, 3, 4, 7, 5, 4, 6, 7, 0, 5, 1, 0, 4, 5, 2, 7, 6, 2, 3, 7, 0, 6, 4, 0, 2, 6, 1, 7, 3, 1, 5, 7);
    return m;
  }

  // ---- the stack's heights: nut, the exposed shaft, bearing cap, motor housing, collar, transition; the motor cap
  // sits on top. A section with no size is left out. ----
  const ok = (s) => !!s && s.d > 0 && s.l > 0;
  const SECTIONS = ["bearing_cap", "housing", "collar"];
  function stackTop(m) {
    let z = m.collet_nut.h + (m.shaft ? m.shaft.exposed || 0 : 0);
    for (const k of SECTIONS) if (ok(m[k])) z += m[k].l;
    if (m.transition && m.transition.l > 0) z += m.transition.l;
    return z;
  }
  const overall = (m) => +(stackTop(m) + (m.kind === "spindle" ? 0 : m.motor_cap ? m.motor_cap.H : 0)).toFixed(2);
  // the motor cap, the dial, switch and strain relief placed on it (each merged under the preset's own, if any)
  function expand(m) {
    if (m.kind === "spindle") return m;
    const h = m.motor_cap, at = h.at || [0, 0], z0 = stackTop(m), H = h.H, z1 = z0 + H, x1 = at[0] + h.L / 2;
    const fit = (v, dflt) => Math.min(v ?? dflt, h.W / 2, h.L / 2);
    const rf = fit(h.front_r, 10), rb = fit(h.back_r, 10), e = Math.min(h.top_r ?? 6, H / 2);
    const dp = Object.assign({ place: "end" }, m.dial), d = dp.d || 24, t = dp.t || 6;
    const dial = dp.place === "top"
      ? { axis: "y", at: [x1 - d / 2 - Math.max(e, 8), at[1], z1 - d / 2 + 5], d, t, out: 90, slot: [d + 4, t + 3] }
      : { axis: "z", at: [x1 - d / 2 + 5, at[1], z1 - e - t / 2 - 1], d, t, out: 0 };
    const sw = Math.max(Math.min(20, h.W - 2 * rf - 2), 6), sh = Math.min(14, H * 0.4);   // on the flat of the +x end
    const swz = dp.place === "top" ? z0 + H / 2 : Math.min(z0 + H * 0.4, dial.at[2] - t / 2 - sh / 2 - 3);
    return Object.assign({}, m, {
      cap: { at, L: h.L, W: h.W, r: [rb, rf], z: [z0, z1], top_r: e, bot_r: Math.min(h.bot_r ?? 2, H / 2 - e) },
      dial: Object.assign(dial, dp.at ? { at: dp.at } : {}, { ring: dp.ring }),
      switch: Object.assign({ at: [x1 + 0.75, at[1], swz], size: [1.5, sw, sh], rocker: [3.0, sw * 0.7, sh * 0.65] }, m.switch),
      strain_relief: Object.assign({ at: [at[0] - h.L / 2, at[1], z0 + H * 0.6], l: 40.0, d: 12.0, bend: 45.0 }, m.strain_relief),
      cord: Object.assign({ d: 7.4, out: 15.0 }, m.cord),
    });
  }
  // the biggest edge (fillet / chamfer) the transition can have where it meets the motor cap: no longer than the
  // transition; round: its flare stays under the cap (to its narrower half); shaped to the cap: the loft's top (the
  // cap's plan inset by its under-fillet + the edge) keeps some size
  function transitionEdgeMax(m) {
    const T = m.transition, h = m.motor_cap;
    if (!T || !(T.l > 0) || !h) return 0;
    const hh = Math.min(h.L, h.W) / 2, bot = h.bot_r ?? 2;
    const lim = T.shape === "cap" ? hh - bot - 8 : hh - Math.max(T.d > 0 ? T.d / 2 : 0, 0.5) - 0.5;
    return Math.max(0, +Math.min(T.l - 0.2, lim).toFixed(1));
  }
  // the shaft: from its end (inside the nut, `below` up from the nut's face) up into the bearing cap; its threaded end
  // (the nut's thread) a part of its own (zigzag rings, pitch apart); flats: the ring clamped to af / 2 there
  function shaftParts(m) {
    const S = m.shaft || { d: 12, exposed: 0 }, nut = m.collet_nut, z0 = nut.below || 0, zTop = nut.h + (S.exposed || 0) + 2;
    const Th = S.thread || { d: S.d + 1, pitch: 0.75, length: Math.min(8, nut.h - z0) }, tl = Math.min(Th.length || 8, zTop - z0);
    const r = S.d / 2, F = S.flats, prof = [[0, z0 + tl]];
    const flat = (z) => F && z >= F.z - 1e-6 && z <= F.z + F.l + 1e-6 ? F.af / 2 : 0;
    const zs = [z0 + tl, zTop];
    if (F) zs.push(F.z, F.z + F.l / 2, F.z + F.l);
    zs.sort((a, b) => a - b);
    for (const z of zs) if (z >= z0 + tl - 1e-6 && z <= zTop + 1e-6) {
      if (F && Math.abs(z - F.z) < 1e-6) prof.push([r, z, 0], [r, z, F.af / 2]);
      else if (F && Math.abs(z - F.z - F.l) < 1e-6) prof.push([r, z, F.af / 2], [r, z, 0]);
      else prof.push([r, z, flat(z)]);
    }
    prof.push([0, zTop]);
    const shaft = turned(prof, [0, 0, 0], [0, 0, 1]);
    const tp = [[0, z0]], rt = Th.d / 2, dep = Math.min(0.6 * Th.pitch, rt * 0.2);   // the thread: a 60 deg zigzag
    for (let z = z0; z < z0 + tl - 1e-6; z += Th.pitch) tp.push([rt - dep, z], [rt, z + Th.pitch / 2]);
    tp.push([rt - dep, z0 + tl], [0, z0 + tl]);
    return { shaft, thread: turned(tp, [0, 0, 0], [0, 0, 1], 48), shaftEnd: z0 };
  }
  // the collet: its nut end (wide, 30 deg nose) down at the nut's face, tapering `taper` deg up into the shaft; a bore
  // for the shank `bore` mm (else the biggest it takes). An ER collet (type ER...) is slit: erCollet
  function colletPart(m, bore) {
    const C = m.collet || { d: 11.5, l: 18, taper: 8, sizes: [6.35] }, z0 = 0.6, R = C.d / 2, top = R - C.l * Math.tan((C.taper || 8) * Math.PI / 180);
    const rb = (bore > 0 ? bore : Math.max(...(C.sizes || [6.35]))) / 2, nose = Math.min(2.5, C.l / 6);
    if (/^ER/i.test(C.type || "")) return erCollet(C, rb, z0);
    return turned([[rb, z0], [R - nose * 0.58, z0], [R, z0 + nose], [Math.max(top, rb + 0.6), z0 + C.l], [rb, z0 + C.l], [rb, z0]], [0, 0, 0], [0, 0, 1], 48);
  }
  // an ER collet: the nose, then the groove the nut's eccentric ring snaps into, a short band and the taper; ER_SLITS
  // slits cut in turn from each end, each to ER_LAND short of the other (GUESS: 8 slits 0.7 wide, from photos). Built
  // as cells round x along the axis: a slit cell is open over its slit's length, its faces close every open side
  const ER_SLITS = 8, ER_SLIT = 0.7, ER_LAND = 2.5;
  function erCollet(C, rb, z0) {
    const R = C.d / 2, L = C.l, nose = Math.min(2.5, L / 6), t = Math.tan((C.taper || 8) * Math.PI / 180), zt = z0 + nose + 2;
    const top = Math.max(R - (z0 + L - zt) * t, rb + 0.6);
    const prof = [[z0, R - nose * 0.58], [z0 + nose, R], [z0 + nose + 0.2, R - 0.6], [z0 + nose + 1.2, R - 0.6], [z0 + nose + 1.4, R], [zt, R], [z0 + L, top]];
    const ro = (z) => {
      for (let k = 1; k < prof.length; k++) if (z <= prof[k][0] + 1e-9) { const [za, ra] = prof[k - 1], [zb, rz] = prof[k]; return ra + (rz - ra) * (z - za) / (zb - za); }
      return top;
    };
    const zs = [...new Set(prof.map((p) => +p[0].toFixed(6)).concat([z0 + ER_LAND, z0 + L - ER_LAND]))].sort((a, b) => a - b);
    const n = ER_SLITS, da = ER_SLIT / 2 / ((R + rb) / 2), cells = [];   // [a0, a1, slit: 0 solid | 1 from the nut end | 2 from the shaft end]
    for (let k = 0; k < n; k++) {
      const c = 2 * Math.PI * (k + 0.5) / n, g0 = c - 2 * Math.PI / n + da, g1 = c - da;   // slits between, so +x is solid (the widest point)
      for (let s = 0; s < 6; s++) cells.push([g0 + (g1 - g0) * s / 6, g0 + (g1 - g0) * (s + 1) / 6, 0]);
      cells.push([g1, c + da, k % 2 ? 2 : 1]);
    }
    const nz = zs.length - 1, nc = cells.length;
    const solid = (i, j) => {
      if (j < 0 || j >= nz) return false;
      const [, , s] = cells[(i + nc) % nc], zm = (zs[j] + zs[j + 1]) / 2;
      return s === 0 || (s === 1 ? zm > z0 + L - ER_LAND : zm < z0 + ER_LAND);
    };
    const m = mesh(), P = (a, r, z) => [r * Math.cos(a), r * Math.sin(a), z];
    const quad = (...q) => { const k = m.pos.length / 3; for (const p of q) m.pos.push(...p); m.idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    for (let i = 0; i < nc; i++) for (let j = 0; j < nz; j++) {
      if (!solid(i, j)) continue;
      const [a0, a1] = cells[i], z1 = zs[j], z2 = zs[j + 1], r1 = ro(z1), r2 = ro(z2);
      quad(P(a0, r1, z1), P(a1, r1, z1), P(a1, r2, z2), P(a0, r2, z2));                  // outside
      quad(P(a0, rb, z1), P(a0, rb, z2), P(a1, rb, z2), P(a1, rb, z1));                  // the bore
      if (!solid(i - 1, j)) quad(P(a0, rb, z1), P(a0, r1, z1), P(a0, r2, z2), P(a0, rb, z2));   // a slit's sides
      if (!solid(i + 1, j)) quad(P(a1, rb, z1), P(a1, rb, z2), P(a1, r2, z2), P(a1, r1, z1));
      if (!solid(i, j - 1)) quad(P(a0, rb, z1), P(a1, rb, z1), P(a1, r1, z1), P(a0, r1, z1));   // the ends, a slit's end
      if (!solid(i, j + 1)) quad(P(a0, rb, z2), P(a0, r2, z2), P(a1, r2, z2), P(a1, rb, z2));
    }
    return m;
  }

  // the turned part above the shaft: bearing cap, the motor housing (its collet end chamfered ch at 45 deg), the collar,
  // the transition { l, d, shape: "round" (a cone to its top d) | "cap" (lofted from round to the motor cap's plan),
  // edge: "none" | "fillet" | "chamfer", e } - its edge where it meets the cap
  function stack(m, P) {
    let z = m.collet_nut.h + (m.shaft ? m.shaft.exposed || 0 : 0), r = 0;
    for (const k of SECTIONS) {
      const s = m[k];
      if (!ok(s)) continue;
      const c = k === "housing" ? Math.min(s.ch || 0, s.l / 2, Math.max(s.d / 2 - 0.5, 0)) : 0;
      const prof = [[0, z]];
      if (c > 0) prof.push([s.d / 2 - c, z], [s.d / 2, z + c]); else prof.push([s.d / 2, z]);
      prof.push([s.d / 2, z + s.l], [0, z + s.l]);
      append(P[k], turned(prof, [0, 0, 0], [0, 0, 1]));
      z += s.l; r = s.d / 2;
    }
    const T = m.transition, H = m.cap;
    if (T && T.l > 0) {
      const z1 = z + T.l, emax = transitionEdgeMax(m);
      if (T.shape === "cap" && H) append(P.transition, transitionLoft(H, r, z, z1, T, emax));
      else {
        const rt = Math.max(T.d > 0 ? T.d / 2 : r, 0.5), e = T.edge === "fillet" || T.edge === "chamfer" ? Math.min(T.e || 0, emax) : 0;
        const prof = [[0, z], [r, z]], re = r + (rt - r) * (T.l - e) / T.l;
        prof.push([re, z1 - e]);
        if (e > 0 && T.edge === "fillet") for (let k = 1; k <= 8; k++) { const f = Math.PI / 2 * k / 8; prof.push([re + e - e * Math.cos(f), z1 - e + e * Math.sin(f)]); }
        else if (e > 0) prof.push([re + e, z1]);
        prof.push([0, z1]);
        append(P.transition, turned(prof, [0, 0, 0], [0, 0, 1]));
      }
      z = z1;
    }
    return z;
  }
  // round (radius r at z0) up to the cap's plan (inset by its under-fillet + the edge) at z1, then the edge out into
  // the cap's underside (fillet: a concave quarter round; chamfer: 45 deg)
  function transitionLoft(H, r, z0, z1, T, emax) {
    const ray = rayOf(H), at = H.at || [0, 0], bot = H.bot_r || 0;
    const e = T.edge === "fillet" || T.edge === "chamfer" ? Math.min(T.e || 0, emax) : 0;
    const m0 = bot + e, K = 12, th = Array.from({ length: N }, (_, i) => 2 * Math.PI * i / N);
    const out = (ins) => th.map((t) => { const [x, y] = ray(t, ins); return [x + at[0], y + at[1]]; });
    const o0 = out(m0), rings = [th.map(() => [0, 0, z0]), th.map((t) => [r * Math.cos(t), r * Math.sin(t), z0])];
    for (let j = 1; j <= K; j++) {
      const u = j / K, w = u * u * (3 - 2 * u), zz = z0 + (z1 - e - z0) * u;   // smoothstep: round at the collar, square under the cap
      rings.push(th.map((t, i) => [r * Math.cos(t) * (1 - w) + o0[i][0] * w, r * Math.sin(t) * (1 - w) + o0[i][1] * w, zz]));
    }
    if (e > 0) for (let k = 1; k <= 8; k++) {
      const f = Math.PI / 2 * k / 8, ins = T.edge === "fillet" ? m0 - e + e * Math.cos(f) : m0 - e * k / 8;
      const zz = T.edge === "fillet" ? z1 - e + e * Math.sin(f) : z1 - e + e * k / 8, o = out(ins);
      rings.push(o.map(([x, y]) => [x, y, zz]));
    }
    rings.push(th.map(() => [at[0], at[1], z1]));
    return sweep(rings);
  }
  const PARTS = ["shaft", "thread", "collet", "collet_nut", "bearing_cap", "housing", "collar", "transition", "motor_cap",
    "dial", "switch", "switch_off", "shaft_lock", "strain_relief", "cord", "trim"];
  function build(m) {
    const P = Object.fromEntries(PARTS.map((k) => [k, mesh()])), nut = m.collet_nut;
    append(P.collet_nut, nut.shape === "round" ? turned([[0, 0], [nut.af / 2 - 1, 0], [nut.af / 2, 1], [nut.af / 2, nut.h], [0, nut.h]], [0, 0, 0], [0, 0, 1])
      : hexNut(nut.af, nut.h, 0, Math.max(...((m.collet && m.collet.sizes) || [6.35])) + 1.5));
    const sp = shaftParts(m);
    append(P.shaft, sp.shaft); append(P.thread, sp.thread); append(P.collet, colletPart(m));
    const Z = { nutTop: nut.h, shaftEnd: sp.shaftEnd, flats: m.shaft && m.shaft.flats || null, lock: null };
    if (m.kind === "spindle") return spindle(m, P, Z);
    m = expand(m);
    const top = stack(m, P);
    append(P.motor_cap, slab(m.cap));
    if (m.shaft_lock) {                              // a peg out of the housing, pressed in `travel` (tool_change.js)
      const L = m.shaft_lock, a = L.a * Math.PI / 180, dir = [Math.cos(a), Math.sin(a), 0], hr = ok(m.housing) ? m.housing.d / 2 : L.r - 4;
      const r0 = Math.max(Math.min(hr - (L.travel || 3) - 1, L.r - 2), 0);
      append(P.shaft_lock, cyl([dir[0] * r0, dir[1] * r0, L.z], dir, L.d, L.r - r0, 48));
      Z.lock = { dir, z: L.z, travel: L.travel || 3 };
    }
    const D = m.dial, ax = D.axis === "y" ? [0, 1, 0] : [0, 0, 1];
    append(P.dial, cyl(add(D.at, mul(ax, -D.t / 2)), ax, D.d, D.t, 72));
    const oa = (D.out || 0) * Math.PI / 180, out = D.axis === "y" ? [Math.cos(oa), 0, Math.sin(oa)] : [Math.cos(oa), Math.sin(oa), 0];
    if (D.slot) {                                    // the dark slot round a dial on top: a thin plate on the cap's top
      const s = m.cap, nx = 6, ny = 6, base = P.trim.pos.length / 3;
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
        const x = D.at[0] + D.slot[0] * (i / nx - 0.5), y = D.at[1] + D.slot[1] * (j / ny - 0.5), t = topAt(s, x - s.at[0], y - s.at[1]);
        P.trim.pos.push(x, y, (t === null ? s.z[1] : t) + 0.12);
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const a = base + i * (ny + 1) + j, b = a + ny + 1; P.trim.idx.push(a, b, b + 1, a, b + 1, a + 1); }
    }
    let rocker = null;                               // the rocker's centre, size, tip (deg): the page marks its face O | I
    const SW = m.switch;
    append(SW.rocker ? P.trim : P.switch, box(SW.at, SW.size));   // with a rocker: the bezel stays put (trim)
    if (SW.rocker) {
      const k = SW.rocker;
      for (const [part, a] of [["switch", 8], ["switch_off", -8]]) {   // the rocker tipped about its upright middle: on = its +y ("I") end in
        const c = add(SW.at, [(k[0] - SW.size[0]) / 2, 0, 0]), r = box(c, k), ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
        for (let i = 0; i < r.pos.length; i += 3) { const x = r.pos[i] - c[0], y = r.pos[i + 1] - c[1]; r.pos[i] = c[0] + ca * x - sa * y; r.pos[i + 1] = c[1] + sa * x + ca * y; }
        append(P[part], r);
        rocker = { c, size: k, a: 8 };
      }
    }
    const { cord } = cordParts(P, m.strain_relief, m.cord);
    return { parts: P, dial: { c: D.at, axis: ax, out, r: D.d / 2, t: D.t, ring: D.ring || null }, cord, rocker, top, z: Z };
  }
  // a spindle (user 2026-10-29: some run a 65 mm spindle instead of a router): the nut, shaft, bearing cap and the
  // can (housing) up to the top, a dark end cap (motor_cap) on it; air-cooled: a fan grille on top, water-cooled: two
  // hose barbs up out of the cap; the cable plug on the -x side near the top, the cable out of it toward -x. No dial,
  // no switch (a VFD runs it).
  function spindle(m, P, Z) {
    const top = stack(m, P), cd = m.housing.d, capH = Math.min(8, m.housing.l / 4);
    // the can's top capH is the end cap: the housing's own top face is under it
    append(P.motor_cap, turned([[0, top - capH], [cd / 2 + 0.05, top - capH], [cd / 2 + 0.05, top - 1.5], [cd / 2 - 1.5, top], [0, top]], [0, 0, 0], [0, 0, 1]));
    if (m.cooling === "water")                       // two barbs up out of the cap, either side of the axis
      for (const y of [-cd * 0.22, cd * 0.22]) { append(P.trim, cyl([cd * 0.18, y, top - 1], [0, 0, 1], 10, 6, 24)); append(P.trim, cyl([cd * 0.18, y, top + 5], [0, 0, 1], 6, 12, 24)); }
    else for (let i = 0; i < 4; i++) {               // the fan grille: dark rings on the cap
      const r = cd * (0.12 + 0.1 * i);
      append(P.trim, turned([[r, top + 0.15], [r + cd * 0.04, top + 0.15], [r + cd * 0.04, top + 0.3], [r, top + 0.3]], [0, 0, 0], [0, 0, 1], 48));
    }
    const pz = top - capH - 12;                      // the plug: a boss out of the -x side, the cable on out of it
    append(P.trim, cyl([-cd / 2 + 1, 0, pz], [-1, 0, 0], 16, 14, 32));
    const SR = Object.assign({ l: 20.0, d: 10.0, bend: 30.0 }, m.strain_relief, { at: [-cd / 2 - 13, 0, pz] });
    const { cord } = cordParts(P, SR, Object.assign({ d: 7.4, out: 15.0 }, m.cord));
    return { parts: P, dial: null, cord, rocker: null, noSwitch: true, top, z: Z };
  }
  // the strain relief tapers along an arc bending `bend` toward +y, the cord stub straight on from its end
  function cordParts(P, SR, C) {
    const bend = (SR.bend || 0) * Math.PI / 180, secs = [];
    let p1 = SR.at, dir = [-1, 0, 0];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8, ph = bend * f, rr = SR.d / 2 + (C.d / 2 + 0.6 - SR.d / 2) * f;
      const c = bend > 1e-6 ? add(SR.at, [-SR.l / bend * Math.sin(ph), SR.l / bend * (1 - Math.cos(ph)), 0]) : add(SR.at, [-SR.l * f, 0, 0]);
      const tn = [-Math.cos(ph), Math.sin(ph), 0];
      secs.push([c, tn, rr]);
      p1 = c; dir = tn;
    }
    const ring = ([c, tn, r]) => {
      const u = [0, 0, 1], v = cross(tn, u);
      return Array.from({ length: 24 }, (_, i) => { const t = 2 * Math.PI * i / 24; return add(c, add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t)))); });
    };
    const tube = (s) => sweep([ring([s[0][0], s[0][1], 0]), ...s.map(ring), ring([s[s.length - 1][0], s[s.length - 1][1], 0])]);
    append(P.strain_relief, tube(secs));
    if (C.out > 0) append(P.cord, tube([[add(p1, mul(dir, -0.5)), dir, C.d / 2], [add(p1, mul(dir, C.out)), dir, C.d / 2]]));
    return { cord: { tip: add(p1, mul(dir, C.out || 0)), dir } };
  }
  // into a frame: turned a (rad) about z, then moved to o
  function place(m, f) {
    const c = Math.cos(f.a), s = Math.sin(f.a), pos = new Array(m.pos.length);
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i], y = m.pos[i + 1];
      pos[i] = f.o[0] + c * x - s * y; pos[i + 1] = f.o[1] + s * x + c * y; pos[i + 2] = f.o[2] + m.pos[i + 2];
    }
    return { pos, idx: m.idx.slice() };
  }
  const placeV = (v, f, dirOnly) => {
    const c = Math.cos(f.a), s = Math.sin(f.a), o = dirOnly ? [0, 0, 0] : f.o;
    return [o[0] + c * v[0] - s * v[1], o[1] + s * v[0] + c * v[1], o[2] + v[2]];
  };

  const api = { PARTS, build, colletPart, expand, stackTop, overall, transitionEdgeMax, place, placeV, topAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4RouterBody = api;
})(typeof self !== "undefined" ? self : this);
