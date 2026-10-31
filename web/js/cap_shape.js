// The motor cap's shape from three views (Part 46b, user 2026-10-30: "more flexibility on shaping the router head"),
// named by where you stand at the machine (user 2026-10-30): model.motor_cap.shape = { top, front, section }, each a list
// of points { x, y, s, r, t } in mm, drawn in the router editor's shape editor (js/page/cap_edit.js):
//   top     - the outline from above, one half: x left-right along the gantry (+x right = the router's switch / dial
//             end, 0 = the router's axis), y out from the middle (>= 0, toward the back); from a point on the middle
//             line round to another one, mirrored front-back
//   front   - the outline from the machine's front, all round: x as the top's, y up from the cap's bottom (the turned
//             part's top); the left and right ends free
//   section - a cross-section seen from the right, one half: x out from the middle, y up; from the top's middle round
//             to the bottom's middle, mirrored front-back. May be a list of { at: x, pts } sections, blended between.
// Each point's s = the span to the next: "line" | "arc" (a circular arc, radius r; r > 0 bulges to the left of the
// way the points run, < 0 to the right) | "curve" (a smooth Bezier, its handles worked out from the neighbours, or
// t = [dx, dy]: the out-handle, the in-handle mirrored). A point between two lines: r = its corner radius.
// The cap: every slice across x = the section stretched to the top view's width there and the front view's bottom /
// top there. Plain JS (tests/test_cap_shape.js).
(function (root) {
  "use strict";
  const SPANS = ["line", "arc", "curve"];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], addv = (a, b) => [a[0] + b[0], a[1] + b[1]], sc = (a, k) => [a[0] * k, a[1] * k];
  const len = (a) => Math.hypot(a[0], a[1]), unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const P = (p) => [p.x, p.y];

  // a view's points -> a polyline [[x, y]...]; closed: the last point joins the first. axis: an open half's mirror
  // line ("x": y = 0, the top view; "y": x = 0, the section) - its end points' curves leave square to it
  // the unit tangent a curve takes through point i: along a straight span next to it, else from its neighbours; an
  // open half's end: square to its mirror line
  function tangent(pts, closed, axis, i) {
    const n = pts.length, at = (j) => pts[(j + n) % n], p = P(at(i));
    const kind = (j) => (closed || (j >= 0 && j < n - 1) ? at(j).s || "line" : null);
    if (!closed && (i === 0 || i === n - 1)) {
      const o = P(at(i === 0 ? 1 : n - 2)), d = i === 0 ? sub(o, p) : sub(p, o);
      if (axis === "x") return [0, Math.sign(d[1]) || 1];
      if (axis === "y") return [Math.sign(d[0]) || 1, 0];
      return unit(d);
    }
    if (kind(i - 1) === "line") return unit(sub(p, P(at(i - 1))));
    if (kind(i) === "line") return unit(sub(P(at(i + 1)), p));
    return unit(sub(P(at(i + 1)), P(at(i - 1))));
  }
  // point i's out-handle (its t, else the automatic one: a third of the way to the next point)
  function handle(pts, closed, axis, i) {
    const n = pts.length, p = pts[i];
    if (p.t) return p.t.slice();
    const q = pts[(i + 1) % n], L = closed || i < n - 1 ? len(sub(P(q), P(p))) : len(sub(P(p), P(pts[i - 1])));
    return sc(tangent(pts, closed, axis, i), L / 3);
  }
  function path(pts, closed, axis) {
    const n = pts.length;
    if (n < 2) return pts.map(P);
    const at = (i) => pts[(i + n) % n], spans = closed ? n : n - 1;
    const kind = (i) => (closed || (i >= 0 && i < n - 1) ? at(i).s || "line" : null);   // the span from point i
    const dir = (i) => tangent(pts, closed, axis, (i + n) % n);
    const out = [], corner = [];                     // corner: [index in out, r] for a line-line point to round
    for (let i = 0; i < spans; i++) {
      const a = at(i), b = at(i + 1), pa = P(a), pb = P(b), k = kind(i);
      if (k === "line" && a.r > 0 && kind(i - 1) === "line") corner.push([out.length, a.r]);
      out.push(pa);
      if (k === "arc") {
        const c = sub(pb, pa), L = len(c), R = Math.max(Math.abs(a.r || 0), L / 2), h = Math.sqrt(Math.max(R * R - L * L / 4, 0));
        if (L < 1e-9) continue;
        const nl = [-c[1] / L, c[0] / L], front = (a.r || 0) >= 0 ? 1 : -1;   // + bulges left: the centre to the right
        const ctr = addv(addv(pa, sc(c, 0.5)), sc(nl, -front * h));
        const a0 = Math.atan2(pa[1] - ctr[1], pa[0] - ctr[0]);
        let a1 = Math.atan2(pb[1] - ctr[1], pb[0] - ctr[0]), da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const m = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 24)));
        for (let j = 1; j < m; j++) { const t = a0 + da * j / m; out.push([ctr[0] + R * Math.cos(t), ctr[1] + R * Math.sin(t)]); }
      } else if (k === "curve") {
        const L = len(sub(pb, pa));
        const c1 = a.t ? addv(pa, a.t) : addv(pa, sc(dir(i), L / 3)), c2 = b.t && kind(i + 1) === "curve" ? sub(pb, b.t) : sub(pb, sc(dir(i + 1), L / 3));
        for (let j = 1; j < 16; j++) {
          const t = j / 16, u = 1 - t;
          out.push([u * u * u * pa[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * pb[0],
            u * u * u * pa[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * pb[1]]);
        }
      }
    }
    if (!closed) out.push(P(at(n - 1)));
    for (let c = corner.length - 1; c >= 0; c--) {  // round the corners, last first (the indices before stay put)
      const [i, r] = corner[c], m = out.length, p = out[i], pin = out[(i - 1 + m) % m], pout = out[(i + 1) % m];
      const a = unit(sub(pin, p)), b = unit(sub(pout, p)), cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])), th = Math.acos(cos);
      if (th < 1e-3 || th > Math.PI - 1e-3) continue;
      const d = Math.min(r / Math.tan(th / 2), len(sub(pin, p)) / 2, len(sub(pout, p)) / 2), rr = d * Math.tan(th / 2);
      const q0 = addv(p, sc(a, d)), q1 = addv(p, sc(b, d)), bis = unit(addv(a, b)), ctr = addv(p, sc(bis, rr / Math.sin(th / 2)));
      const a0 = Math.atan2(q0[1] - ctr[1], q0[0] - ctr[0]);
      let da = Math.atan2(q1[1] - ctr[1], q1[0] - ctr[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.max(3, Math.ceil(Math.abs(da) / (Math.PI / 24))), arc = [];
      for (let j = 0; j <= k; j++) { const t = a0 + da * j / k; arc.push([ctr[0] + rr * Math.cos(t), ctr[1] + rr * Math.sin(t)]); }
      out.splice(i, 1, ...arc);
    }
    return out;
  }
  // where a polyline (closed or not) crosses x: [min y, max y], or null
  function across(pl, x, closed) {
    let lo = Infinity, hi = -Infinity;
    const m = pl.length, n = closed ? m : m - 1;
    for (let i = 0; i < n; i++) {
      const a = pl[i], b = pl[(i + 1) % m];
      if ((a[0] - x) * (b[0] - x) > 0) continue;
      if (Math.abs(b[0] - a[0]) < 1e-12) { lo = Math.min(lo, a[1], b[1]); hi = Math.max(hi, a[1], b[1]); continue; }
      const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return hi >= lo ? [lo, hi] : null;
  }
  const bounds = (pl) => pl.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  // the half section resampled to M points by length, normalised: u 0..1 out, v 0..1 up
  const M = 65;                                     // points round the half section (fine enough for a brush cap's recess)
  function section(pts) {
    const pl = path(pts, false, "y"), b = bounds(pl), W = Math.max(b[2], 1e-6), H = Math.max(b[3] - b[1], 1e-6);
    const L = [0];
    for (let i = 1; i < pl.length; i++) L.push(L[i - 1] + len(sub(pl[i], pl[i - 1])));
    const T = L[L.length - 1] || 1, out = [];
    for (let k = 0, j = 0; k < M; k++) {
      const s = T * k / (M - 1);
      while (j < pl.length - 2 && L[j + 1] < s) j++;
      const f = L[j + 1] > L[j] ? (s - L[j]) / (L[j + 1] - L[j]) : 0, p = addv(pl[j], sc(sub(pl[j + 1], pl[j]), Math.min(Math.max(f, 0), 1)));
      out.push([Math.max(p[0], 0) / W, (p[1] - b[1]) / H]);
    }
    out[0][0] = 0; out[M - 1][0] = 0;
    out.flat = Math.max(...pl.filter((p) => p[1] - b[1] <= 1e-6 * H).map((p) => Math.max(p[0], 0) / W), 0);   // how far out its bottom line runs (u)
    return out;
  }
  // the parsed views: polylines, the x range, width / bottom / top / section at x
  function views(shape) {
    if (shape._v) return shape._v;
    const top = path(shape.top, false, "x"), front = path(shape.front, true);
    const secs = (Array.isArray(shape.section) && shape.section.length && shape.section[0].pts ? shape.section : [{ at: null, pts: shape.section }])
      .map((e) => ({ at: Number.isFinite(e.at) ? e.at : null, n: section(e.pts) })).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const bt = bounds(top), bs = bounds(front), x0 = Math.max(bt[0], bs[0]), x1 = Math.min(bt[2], bs[2]);
    const w = (x) => { const c = across(top, Math.min(Math.max(x, bt[0] + 1e-4), bt[2] - 1e-4), false); return c ? Math.max(Math.abs(c[0]), Math.abs(c[1])) : 0; };
    const zz = (x) => across(front, Math.min(Math.max(x, bs[0] + 1e-4), bs[2] - 1e-4), true) || [0, 0];
    const sec = (x) => {                             // blended between the sections either side of x
      if (secs.length === 1) return secs[0].n;
      if (x <= secs[0].at) return secs[0].n;
      for (let i = 1; i < secs.length; i++) if (x <= secs[i].at) {
        const a = secs[i - 1], b = secs[i], f = (x - a.at) / Math.max(b.at - a.at, 1e-9);
        return a.n.map((p, k) => [p[0] + (b.n[k][0] - p[0]) * f, p[1] + (b.n[k][1] - p[1]) * f]);
      }
      return secs[secs.length - 1].n;
    };
    const flat = (x) => {                            // the bottom line's reach at x (blended as the sections are)
      if (secs.length === 1 || x <= secs[0].at) return secs[0].n.flat;
      for (let i = 1; i < secs.length; i++) if (x <= secs[i].at) { const a = secs[i - 1], c = secs[i], f = (x - a.at) / Math.max(c.at - a.at, 1e-9); return a.n.flat + (c.n.flat - a.n.flat) * f; }
      return secs[secs.length - 1].n.flat;
    };
    let wmax = 0;
    for (const p of top) wmax = Math.max(wmax, Math.abs(p[1]));
    shape._v = { top, flat, front, x0, x1, w, zz, sec, L: x1 - x0, W: 2 * wmax, zmin: bs[1], zmax: bs[3] };
    Object.defineProperty(shape, "_v", { enumerable: false });
    return shape._v;
  }
  // the size the shape takes: { L, W, H (top above the bottom 0), at: [the x middle, 0], zmin }
  function size(shape) {
    const v = views(shape);
    return { L: +v.L.toFixed(2), W: +v.W.toFixed(2), H: +v.zmax.toFixed(2), zmin: +v.zmin.toFixed(2), at: [+((v.x0 + v.x1) / 2).toFixed(2), 0] };
  }
  // the top surface's height at a plan point (z up from the cap's bottom), or null off it
  function topAt(shape, x, y) {
    const v = views(shape);
    if (x < v.x0 || x > v.x1) return null;
    const w = v.w(x), [zb, zt] = v.zz(x), u = w > 0 ? Math.abs(y) / w : 2;
    if (u > 1) return null;
    const n = v.sec(x);
    let best = -Infinity;
    for (let k = 0; k + 1 < M; k++) {               // the highest of the section where it crosses u
      const a = n[k], b = n[k + 1];
      if ((a[0] - u) * (b[0] - u) > 0) continue;
      const f = Math.abs(b[0] - a[0]) < 1e-12 ? 0 : (u - a[0]) / (b[0] - a[0]);
      best = Math.max(best, a[1] + (b[1] - a[1]) * f);
    }
    return best > -Infinity ? zb + best * (zt - zb) : null;
  }
  // where the front view's outline is at height z (up from the cap's bottom): [left x, right x], or null
  function ends(shape, z) {
    const v = views(shape), c = across(v.front.map(([x, y]) => [y, x]), z, true);
    return c ? [Math.max(c[0], v.x0), Math.min(c[1], v.x1)] : null;
  }
  // a closed polygon's signed distance (< 0 inside)
  function polySd(poly) {
    return (x, y) => {
      let d = Infinity, inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i], e = sub(b, a), w = [x - a[0], y - a[1]];
        const t = Math.max(0, Math.min(1, (w[0] * e[0] + w[1] * e[1]) / (e[0] * e[0] + e[1] * e[1] || 1)));
        d = Math.min(d, Math.hypot(w[0] - e[0] * t, w[1] - e[1] * t));
        if ((a[1] > y) !== (b[1] > y) && x < a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])) inside = !inside;
      }
      return inside ? -d : d;
    };
  }
  // the plan outline's signed distance (the widest the cap is, from above)
  function planSd(shape) {
    const v = views(shape);
    return polySd(v.top.concat(v.top.slice(1, -1).reverse().map(([x, y]) => [x, -y])));
  }
  // the cap's footprint: where its underside is down at its bottom (the front view's lowest), each spot as wide as the
  // cross-section's bottom there - what the turned part's transition lofts up to (user 2026-10-30: not the widest
  // outline: a head raised at the cord end overhung it)
  function footSd(shape) {
    const v = views(shape), runs = [[]], n = Math.max(8, Math.ceil(v.L));
    for (let k = 0; k <= n; k++) {
      const x = v.x0 + v.L * k / n, [zb] = v.zz(x);
      if (zb <= v.zmin + 0.5) {
        const sec = v.sec(x);
        const ub = v.flat(x);                        // its width along the bottom line (where the under-edge's rounding starts)
        runs[runs.length - 1].push([x, Math.max(v.w(x) * ub, 0.01)]);
      } else if (runs[runs.length - 1].length) runs.push([]);
    }
    const run = runs.reduce((a, b) => (b.length > a.length ? b : a));
    if (run.length < 2) return planSd(shape);
    return polySd(run.concat(run.slice().reverse().map(([x, y]) => [x, -y])));
  }
  // the cap's closed mesh, its bottom at z0: rings across x (the section stretched), each end closed by a ring
  // squeezed onto the middle line
  function mesh(shape, z0) {
    const v = views(shape), xs = new Set();
    const STEP = 2;
    for (const p of v.top.concat(v.front)) if (p[0] > v.x0 && p[0] < v.x1) xs.add(+p[0].toFixed(4));
    for (let k = 1, n = Math.ceil(v.L / STEP); k < n; k++) xs.add(+(v.x0 + v.L * k / n).toFixed(4));
    const e = Math.min(1e-3, v.L / 100), list = [v.x0, v.x0 + e, ...[...xs].filter((x) => x > v.x0 + e && x < v.x1 - e).sort((a, b) => a - b), v.x1 - e, v.x1];
    const pos = [], idx = [], R = 2 * M - 2;
    list.forEach((x, j) => {
      const tip = j === 0 || j === list.length - 1, w = tip ? 0 : v.w(x), [zb, zt] = v.zz(x), h = Math.max(zt - zb, 1e-3), n = v.sec(x);
      const ring = n.map(([u, q]) => [x, u * w, z0 + zb + q * h]);
      for (let k = M - 2; k >= 1; k--) ring.push([x, -n[k][0] * w, z0 + zb + n[k][1] * h]);
      for (const p of ring) pos.push(p[0], p[1], p[2]);
    });
    for (let j = 0; j + 1 < list.length; j++) for (let i = 0; i < R; i++) {
      const a = j * R + i, b = j * R + (i + 1) % R, c = (j + 1) * R + (i + 1) % R, d = (j + 1) * R + i;
      idx.push(a, b, c, a, c, d);
    }
    const c0 = pos.length / 3, last = (list.length - 1) * R;   // the ends: a fan to a middle point each (flat, but closed)
    for (const [x, base] of [[v.x0, 0], [v.x1, last]]) { const [zb, zt] = v.zz(x); pos.push(x, 0, z0 + (zb + zt) / 2); }
    for (let i = 0; i < R; i++) {
      const i1 = (i + 1) % R;
      idx.push(i1, i, c0, last + i, last + i1, c0 + 1);
    }
    let vol = 0;                                     // faces out: flip if the signed volume came out negative
    for (let t = 0; t < idx.length; t += 3) {
      const [i, j, k] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
      vol += pos[i] * (pos[j + 1] * pos[k + 2] - pos[j + 2] * pos[k + 1]) - pos[i + 1] * (pos[j] * pos[k + 2] - pos[j + 2] * pos[k])
        + pos[i + 2] * (pos[j] * pos[k + 1] - pos[j + 1] * pos[k]);
    }
    if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    return { pos, idx };
  }

  // ---- starting shapes, to the size given { L, W, H, at: x middle } ----
  const pt = (x, y, s, r) => (r ? { x: +x.toFixed(2), y: +y.toFixed(2), s, r: +r.toFixed(2) } : { x: +x.toFixed(2), y: +y.toFixed(2), s });
  // today's rounded box: corner r per end (back_r left / front_r right), top / under edge rounding
  function box(o) {
    const { L, W, H } = o, cx = o.at || 0, x0 = cx - L / 2, x1 = cx + L / 2, w = W / 2;
    const rb = Math.min(o.back_r ?? 10, w, L / 2), rf = Math.min(o.front_r ?? 10, w, L / 2), rt = Math.min(o.top_r ?? 6, H / 2, w), ru = Math.min(o.bot_r ?? 2, H / 2, w);
    return {
      top: [pt(x0, 0, "line"), pt(x0, w, "line", rb), pt(x1, w, "line", rf), pt(x1, 0, "line")],
      front: [pt(x0, 0, "line", ru), pt(x1, 0, "line", ru), pt(x1, H, "line", rt), pt(x0, H, "line", rt)],
      section: [pt(0, H, "line"), pt(w, H, "line", rt), pt(w, 0, "line", ru), pt(0, 0, "line")],
    };
  }
  function can(o) {                                  // round from above (its Ø the smaller of L / W), flat top
    const { H } = o, cx = o.at || 0, R = Math.min(o.L, o.W) / 2, e = Math.min(4, H / 3, R / 3);
    return {
      top: [pt(cx - R, 0, "arc", R), pt(cx, R, "arc", R), pt(cx + R, 0, "line")],
      front: [pt(cx - R, 0, "line", 1), pt(cx + R, 0, "line", 1), pt(cx + R, H, "line", e), pt(cx - R, H, "line", e)],
      section: [pt(0, H, "line"), pt(R, H, "line", e), pt(R, 0, "line", 1), pt(0, 0, "line")],
    };
  }
  function dome(o) {                                 // round from above, a rounded top
    const { L, W, H } = o, cx = o.at || 0, R = Math.min(L, W) / 2, hs = Math.min(H * 0.35, R);
    return {
      top: [pt(cx - R, 0, "arc", R), pt(cx, R, "arc", R), pt(cx + R, 0, "line")],
      front: [pt(cx - R, 0, "line"), pt(cx + R, 0, "line"), pt(cx + R, hs, "curve"), pt(cx, H, "curve"), pt(cx - R, hs, "line")],
      section: [pt(0, H, "curve"), pt(R, hs, "line"), pt(R, 0, "line"), pt(0, 0, "line")],
    };
  }
  function pear(o) {                                 // a neck at the left (the cord end), widest toward the right, a round nose
    const { L, W, H } = o, cx = o.at || 0, x0 = cx - L / 2, x1 = cx + L / 2, w = W / 2, rt = Math.min(o.top_r ?? 8, H / 3);
    return {
      top: [pt(x0, 0, "line"), pt(x0, w * 0.35, "curve"), pt(x0 + L * 0.35, w * 0.8, "curve"), pt(x0 + L * 0.68, w, "curve"), pt(x1, 0, "line")],
      front: [pt(x0, 0, "line", 2), pt(x1, 0, "line", 2), pt(x1, H, "line", rt), pt(x0, H * 0.85, "line", rt)],
      section: [pt(0, H, "curve"), pt(w * 0.8, H * 0.92, "curve"), pt(w, H * 0.5, "line"), pt(w, 0, "line", 2), pt(0, 0, "line")],
    };
  }
  const STARTS = { box, can, dome, pear };
  // the shape scaled to a new size (any of L / W / H; about its x middle, the middle line and its bottom)
  function scaled(shape, to) {
    const s = size(shape), fx = to.L > 0 && s.L > 0 ? to.L / s.L : 1, fw = to.W > 0 && s.W > 0 ? to.W / s.W : 1, fh = to.H > 0 && s.H > 0 ? to.H / s.H : 1;
    const cx = s.at[0], q = (p, kx, ky, ox) => Object.assign({}, p, { x: +(ox + (p.x - ox) * kx).toFixed(2), y: +(p.y * ky).toFixed(2) },
      p.t ? { t: [+(p.t[0] * kx).toFixed(2), +(p.t[1] * ky).toFixed(2)] } : {});
    const secs = Array.isArray(shape.section) && shape.section.length && shape.section[0].pts
      ? shape.section.map((e) => ({ at: Number.isFinite(e.at) ? +(cx + (e.at - cx) * fx).toFixed(2) : e.at, pts: e.pts.map((p) => q(p, fw, fh, 0)) }))
      : shape.section.map((p) => q(p, fw, fh, 0));
    return { top: shape.top.map((p) => q(p, fx, fw, cx)), front: shape.front.map((p) => q(p, fx, fh, cx)), section: secs };
  }
  // a stored shape, checked: null if it can't be drawn
  function clean(sh) {
    const ptOk = (p) => p && Number.isFinite(+p.x) && Number.isFinite(+p.y) && Math.abs(p.x) < 1000 && Math.abs(p.y) < 1000;
    const one = (p) => {
      const o = { x: +(+p.x).toFixed(3), y: +(+p.y).toFixed(3), s: SPANS.includes(p.s) ? p.s : "line" };
      if (Number.isFinite(+p.r) && +p.r !== 0) o.r = +(+p.r).toFixed(3);
      if (Array.isArray(p.t) && p.t.length === 2 && p.t.every((v) => Number.isFinite(+v))) o.t = [+p.t[0], +p.t[1]];
      return o;
    };
    const list = (a, n) => (Array.isArray(a) && a.length >= n && a.length <= 200 && a.every(ptOk) ? a.map(one) : null);
    if (!sh || typeof sh !== "object") return null;
    const top = list(sh.top, 3), front = list(sh.front, 3);
    let sec = null;
    if (Array.isArray(sh.section) && sh.section.length && sh.section[0] && sh.section[0].pts) {
      sec = sh.section.slice(0, 8).map((e) => ({ at: Number.isFinite(+e.at) && e.at !== null ? +e.at : null, pts: list(e.pts, 3) }));
      if (sec.some((e) => !e.pts)) sec = null;
      else if (sec.length === 1) sec = sec[0].pts;
    } else sec = list(sh.section, 3);
    if (!top || !front || !sec) return null;
    top[0].y = 0; top[top.length - 1].y = 0;         // the half outlines start and end on the middle line
    const halves = Array.isArray(sec[0].pts) ? sec.map((e) => e.pts) : [sec];
    for (const e of halves) { e[0].x = 0; e[e.length - 1].x = 0; }
    const o = { top, front, section: sec };
    const v = views(o);
    return v.L > 1 && v.W > 1 && v.zmax - v.zmin > 1 ? o : null;
  }

  const api = { SPANS, STARTS, path, tangent, handle, across, size, topAt, ends, planSd, footSd, mesh, scaled, clean, views, M };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4CapShape = api;
})(typeof self !== "undefined" ? self : this);
