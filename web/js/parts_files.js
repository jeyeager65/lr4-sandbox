// Bring your own files: the public page ships no V1E / Printables geometry, so each user loads the files they
// downloaded (zips, a folder or loose files) and the page places them from the share data's `src` records
// (pipeline/share_data.py). Files are recognised by SHA-256 (renames don't matter); a file with a manifest name but
// another checksum (V1E updated it) is still used, with a warning. Kept in IndexedDB, so it's once per browser.
// Readers: STL (binary / ASCII) -> triangle soup; DXF (LINE, ARC, CIRCLE, LWPOLYLINE + bulges, POLYLINE, SPLINE)
// -> closed loops nested outer / holes. Geometry helpers: place by A (3x4, file -> machine; a mirror flips the winding),
// Peter piece (connected components, highest ZMax first), bend (fclib mesh.bend_strip). Checked against the private
// meshes by tests/test_parts_files.js. No THREE here: soups are Float32Array (9 floats a triangle).
(function (root) {
  "use strict";

  // ---- STL ----
  function readSTL(buf) {
    const dv = new DataView(buf);
    const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : -1;
    if (buf.byteLength === 84 + 50 * n) {
      const out = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) {
        const o = 84 + 50 * t + 12;
        for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(o + 4 * k, true);
      }
      return out;
    }
    const v = [], re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, text = new TextDecoder().decode(buf);
    let m;
    while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
    if (!v.length || v.length % 9) throw new Error("not an STL");
    return new Float32Array(v);
  }

  function flipWinding(p) {                           // swap each triangle's 2nd and 3rd vertex
    for (let o = 0; o < p.length; o += 9)
      for (let k = 0; k < 3; k++) { const t = p[o + 3 + k]; p[o + 3 + k] = p[o + 6 + k]; p[o + 6 + k] = t; }
    return p;
  }

  // A: [[a, b, c, tx], [d, e, f, ty], [g, h, i, tz]] (file -> machine); a negative det = mirrored: flip the winding
  function place(pos, A) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      for (let r = 0; r < 3; r++) out[i + r] = A[r][0] * x + A[r][1] * y + A[r][2] * z + A[r][3];
    }
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
      + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    return det < 0 ? flipWinding(out) : out;
  }

  // connected components (triangles sharing a vertex position), highest ZMax first - the Peter "w_locations" file
  // holds both covers: piece 0 = T, 1 = B (pipeline/source_frames.py)
  function components(pos) {
    const nt = pos.length / 9, id = new Map(), parent = [];
    const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const tv = new Int32Array(nt * 3);
    for (let i = 0; i < nt * 3; i++) {
      const k = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`;
      let v = id.get(k);
      if (v === undefined) { v = parent.length; id.set(k, v); parent.push(v); }
      tv[i] = v;
    }
    for (let t = 0; t < nt; t++) {
      const a = find(tv[t * 3]);
      for (let c = 1; c < 3; c++) { const b = find(tv[t * 3 + c]); if (a !== b) parent[b] = a; }
    }
    const groups = new Map();
    for (let t = 0; t < nt; t++) {
      const r = find(tv[t * 3]);
      let g = groups.get(r);
      if (!g) groups.set(r, g = { tris: [], zmax: -Infinity });
      g.tris.push(t);
      for (let c = 0; c < 3; c++) g.zmax = Math.max(g.zmax, pos[t * 9 + c * 3 + 2]);
    }
    return [...groups.values()].sort((a, b) => b.zmax - a.zmax).map((g) => {
      const out = new Float32Array(g.tris.length * 9);
      g.tris.forEach((t, i) => out.set(pos.subarray(t * 9, t * 9 + 9), i * 9));
      return out;
    });
  }

  // fclib mesh.bend_strip: a flat strip bent along a 2D path. s = {path, along: [axis, from], height: [axis, from,
  // sign], across: [axis, from], z0, start, scale, reverse} (share data "bent")
  function bend(pos, s) {
    const P = s.path, n = P.length, S = new Float64Array(n), nv = [];
    const tang = [];
    for (let i = 0; i + 1 < n; i++) {
      const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy);
      S[i + 1] = S[i] + l;
      tang.push([dx / l, dy / l]);
    }
    for (let i = 0; i < n; i++) {                     // vertex tangents: averaged neighbours; left normals
      const a = tang[Math.max(0, i - 1)], b = tang[Math.min(n - 2, i)];
      const [tx, ty] = i === 0 ? b : i === n - 1 ? a : [a[0] + b[0], a[1] + b[1]];
      const l = Math.hypot(tx, ty);
      nv.push([-ty / l, tx / l]);
    }
    const interp = (t, f) => {                        // numpy.interp on S
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= t) lo = m; else hi = m; }
      const u = S[hi] > S[lo] ? (t - S[lo]) / (S[hi] - S[lo]) : 0;
      return [f(lo, 0) + u * (f(hi, 0) - f(lo, 0)), f(lo, 1) + u * (f(hi, 1) - f(lo, 1))];
    };
    const [ai, a0] = s.along, [hi_, h0, hs] = s.height, [ci, c0] = s.across, dir = s.reverse ? -1 : 1;
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const t = Math.min(S[n - 1], Math.max(0, s.start + dir * s.scale * (pos[i + ai] - a0)));
      const xy = interp(t, (j, c) => P[j][c]), nn = interp(t, (j, c) => nv[j][c]), l = Math.hypot(nn[0], nn[1]);
      const off = pos[i + ci] - c0;
      out[i] = xy[0] + nn[0] / l * off;
      out[i + 1] = xy[1] + nn[1] / l * off;
      out[i + 2] = s.z0 + hs * (pos[i + hi_] - h0);
    }
    return s.reverse !== (hs < 0) ? flipWinding(out) : out;
  }

  // ---- DXF ----
  function dxfPairs(text) {
    const L = text.split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < L.length; i += 2) out.push([parseInt(L[i], 10), L[i + 1].trim()]);
    return out;
  }
  function dxfEntities(text) {                        // ENTITIES section: [{type, codes: [[code, value]...]}]
    const pr = dxfPairs(text), ents = [];
    let inEnt = false, cur = null;
    for (let i = 0; i < pr.length; i++) {
      const [c, v] = pr[i];
      if (c === 2 && i > 0 && pr[i - 1][0] === 0 && pr[i - 1][1] === "SECTION") inEnt = v === "ENTITIES";
      if (!inEnt) continue;
      if (c === 0) { cur = { type: v, codes: [] }; ents.push(cur); }
      else if (cur) cur.codes.push([c, v]);
    }
    return ents;
  }
  const one = (e, c, d = 0) => { const p = e.codes.find((q) => q[0] === c); return p ? parseFloat(p[1]) : d; };
  const all = (e, c) => e.codes.filter((q) => q[0] === c).map((q) => parseFloat(q[1]));

  const TOL = 0.01;                                   // mm: max chord sag for arcs / splines
  function arcPts(cx, cy, r, a0, a1) {                // radians, counter-clockwise from a0 to a1
    while (a1 <= a0) a1 += 2 * Math.PI;
    const step = 2 * Math.acos(Math.max(-1, 1 - TOL / r)), n = Math.max(2, Math.ceil((a1 - a0) / step));
    const out = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function bulgePts(p, q, b) {                        // LWPOLYLINE segment p -> q with bulge b (tan of a quarter of the sweep)
    if (Math.abs(b) < 1e-12) return [p, q];
    const dx = q[0] - p[0], dy = q[1] - p[1], c = Math.hypot(dx, dy);
    const h = (1 - b * b) / (4 * b);                  // centre: chord midpoint + h * chord along the left normal
    const cx = (p[0] + q[0]) / 2 - dy * h, cy = (p[1] + q[1]) / 2 + dx * h, r = c * (1 + b * b) / (4 * Math.abs(b));
    const a0 = Math.atan2(p[1] - cy, p[0] - cx), a1 = Math.atan2(q[1] - cy, q[0] - cx);
    const pts = b > 0 ? arcPts(cx, cy, r, a0, a1) : arcPts(cx, cy, r, a1, a0).reverse();   // b > 0: counter-clockwise
    pts[0] = p; pts[pts.length - 1] = q;
    return pts;
  }
  function splinePts(e) {                             // NURBS by de Boor, sampled evenly in the parameter
    const deg = one(e, 71, 3), knots = all(e, 40), w = all(e, 41);
    const cx = all(e, 10), cy = all(e, 20), fx = all(e, 11), fy = all(e, 21);
    if (!cx.length) return fx.map((x, i) => [x, fy[i]]);
    const ctrl = cx.map((x, i) => [x, cy[i], w.length === cx.length ? w[i] : 1]);
    const t0 = knots[deg], t1 = knots[knots.length - deg - 1];
    let len = 0;
    for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]);
    const n = Math.max(8 * ctrl.length, Math.ceil(len / 0.5)), out = [];
    for (let k = 0; k <= n; k++) {
      const t = Math.min(t0 + (t1 - t0) * k / n, t1 - 1e-12 * (t1 - t0));
      let s = deg;
      while (s < knots.length - deg - 2 && knots[s + 1] <= t) s++;
      const d = [];
      for (let j = 0; j <= deg; j++) { const c = ctrl[s - deg + j]; d.push([c[0] * c[2], c[1] * c[2], c[2]]); }
      for (let r = 1; r <= deg; r++)
        for (let j = deg; j >= r; j--) {
          const i = s - deg + j, a = (t - knots[i]) / (knots[i + deg - r + 1] - knots[i]);
          for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
        }
      out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
    }
    if (knots[0] === knots[deg]) out[0] = [cx[0], cy[0]];                       // clamped: ends on the end control points
    if (knots[knots.length - 1] === knots[knots.length - 1 - deg]) out[out.length - 1] = [cx[cx.length - 1], cy[cy.length - 1]];
    return out;
  }
  const ocs = (e) => one(e, 230, 1) < 0 ? (p) => [-p[0], p[1]] : (p) => p;   // extrusion (0, 0, -1): OCS x = -WCS x

  // -> {loops: [[[x, y]...] closed, last point = first], open: number of chains left open}
  function dxfLoops(text) {
    const chains = [], loops = [];
    let pend = null;                                  // POLYLINE: collects its VERTEX entities until SEQEND
    for (const e of dxfEntities(text)) {
      const f = ocs(e);
      if (pend && e.type === "VERTEX") { pend.v.push([one(e, 10), one(e, 20), one(e, 42)]); continue; }
      if (pend) { polyline(pend.v, pend.closed, pend.f); pend = null; }
      if (e.type === "LINE") chains.push([[one(e, 10), one(e, 20)], [one(e, 11), one(e, 21)]]);
      else if (e.type === "ARC") chains.push(arcPts(one(e, 10), one(e, 20), one(e, 40), one(e, 50) * Math.PI / 180, one(e, 51) * Math.PI / 180).map(f));
      else if (e.type === "CIRCLE") loops.push(arcPts(one(e, 10), one(e, 20), one(e, 40), 0, 2 * Math.PI).map(f));
      else if (e.type === "LWPOLYLINE") {
        const v = [];                                 // 10 / 20 per vertex, 42 (bulge) belongs to the vertex before it
        for (const [c, s] of e.codes) {
          if (c === 10) v.push([parseFloat(s), 0, 0]);
          else if (c === 20 && v.length) v[v.length - 1][1] = parseFloat(s);
          else if (c === 42 && v.length) v[v.length - 1][2] = parseFloat(s);
        }
        polyline(v, (one(e, 70) & 1) === 1, f);
      } else if (e.type === "POLYLINE") pend = { v: [], closed: (one(e, 70) & 1) === 1, f };
      else if (e.type === "SPLINE") chains.push(splinePts(e));
    }
    if (pend) polyline(pend.v, pend.closed, pend.f);
    function polyline(v, closed, f) {
      const pts = [];
      const m = closed ? v.length : v.length - 1;
      for (let i = 0; i < m; i++) {
        const seg = bulgePts([v[i][0], v[i][1]], [v[(i + 1) % v.length][0], v[(i + 1) % v.length][1]], v[i][2]);
        pts.push(...(i ? seg.slice(1) : seg));
      }
      (closed ? loops : chains).push(pts.map(f));
    }
    // join the open chains end to end
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3;
    let open = 0;
    while (chains.length) {
      let cur = chains.shift();
      if (cur.length > 2 && near(cur[0], cur[cur.length - 1])) { loops.push(cur); continue; }
      for (;;) {
        const end = cur[cur.length - 1];
        let i = chains.findIndex((c) => near(c[0], end) || near(c[c.length - 1], end));
        if (i < 0) break;
        let c = chains.splice(i, 1)[0];
        if (!near(c[0], end)) c = c.slice().reverse();
        cur = cur.concat(c.slice(1));
        if (near(cur[0], cur[cur.length - 1])) break;
      }
      if (near(cur[0], cur[cur.length - 1])) loops.push(cur); else open++;
    }
    for (const l of loops) l[l.length - 1] = l[0];
    return { loops, open };
  }

  const area = (l) => { let a = 0; for (let i = 0; i + 1 < l.length; i++) a += l[i][0] * l[i + 1][1] - l[i + 1][0] * l[i][1]; return a / 2; };
  function insidePt(p, l) {
    let c = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++)
      if ((l[i][1] > p[1]) !== (l[j][1] > p[1]) && p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c;
    return c;
  }
  // loops -> [{outer, holes}] the way FreeCAD's FaceMakerBullseye nests them: even depth = a face, odd = its hole
  function nest(loops) {
    const L = loops.map((l) => ({ l, a: Math.abs(area(l)), depth: 0, parent: null })).sort((p, q) => q.a - p.a);
    for (let i = 0; i < L.length; i++)
      for (let j = i - 1; j >= 0; j--)
        if (insidePt(L[i].l[0], L[j].l)) { L[i].parent = L[j]; L[i].depth = L[j].depth + 1; break; }
    const faces = L.filter((x) => x.depth % 2 === 0).map((x) => ({ x, outer: x.l, holes: [] }));
    for (const x of L) if (x.depth % 2) faces.find((f) => f.x === x.parent).holes.push(x.l);
    return faces.map(({ outer, holes }) => ({ outer, holes }));
  }

  // ---- lite mode: vertex clustering on a `cell` mm grid (each cell's vertices -> their mean; triangles that collapse
  // are dropped). pos = a soup (idx null) or indexed positions; -> {pos, idx} indexed. Keeps the winding. ----
  function decimate(pos, idx, cell) {
    const id = new Map(), sum = [], tri = [];
    const nv = pos.length / 3, map = new Int32Array(nv);
    for (let v = 0; v < nv; v++) {
      const k = `${Math.floor(pos[v * 3] / cell)},${Math.floor(pos[v * 3 + 1] / cell)},${Math.floor(pos[v * 3 + 2] / cell)}`;
      let c = id.get(k);
      if (c === undefined) { c = sum.length / 4; id.set(k, c); sum.push(0, 0, 0, 0); }
      sum[c * 4] += pos[v * 3]; sum[c * 4 + 1] += pos[v * 3 + 1]; sum[c * 4 + 2] += pos[v * 3 + 2]; sum[c * 4 + 3]++;
      map[v] = c;
    }
    const nt = idx ? idx.length / 3 : nv / 3, seen = new Set();
    for (let t = 0; t < nt; t++) {
      const a = map[idx ? idx[t * 3] : t * 3], b = map[idx ? idx[t * 3 + 1] : t * 3 + 1], c = map[idx ? idx[t * 3 + 2] : t * 3 + 2];
      if (a === b || b === c || a === c) continue;
      const k = a < b && a < c ? `${a},${b},${c}` : b < c ? `${b},${c},${a}` : `${c},${a},${b}`;
      if (seen.has(k)) continue;                      // (the same triangle twice after the collapse)
      seen.add(k);
      tri.push(a, b, c);
    }
    const out = new Float32Array(sum.length / 4 * 3);
    for (let c = 0; c < sum.length / 4; c++) for (let k = 0; k < 3; k++) out[c * 3 + k] = sum[c * 4 + k] / sum[c * 4 + 3];
    return { pos: out, idx: new Uint32Array(tri) };
  }

  // ---- Peter Plates honeycomb: the closed cover (PeterPlateT / B.stl, flat as printed) sectioned across its thin
  // axis -> outline + holes; open hex cells (lr4.peter_variants: 5 mm across flats, 0.8 walls) wherever a whole cell
  // fits inside a solid `border`, clear of a `ring` round each screw hole. A flat look-alike of the private build's
  // (which clips cells to the border and keeps the drafted edges / counterbores). peterplateb_dxf.dxf is broken
  // (open chains, 56 of the 80.8 mm), so the outline comes from the STL for both plates. ----
  function section(pos, axis, h) {                    // loops in the plane pos[axis] = h, in the other two axes
    const [a, b] = [[1, 2], [2, 0], [0, 1]][axis];
    const segs = [];
    for (let o = 0; o < pos.length; o += 9) {
      const pts = [];
      for (let k = 0; k < 3; k++) {
        let p = o + 3 * k, q = o + 3 * ((k + 1) % 3);
        if (pos[p + axis] > pos[q + axis] || (pos[p + axis] === pos[q + axis] && p > q)) [p, q] = [q, p];  // same
        const dp = pos[p + axis] - h, dq = pos[q + axis] - h;                       // edge -> same point both ways
        if ((dp < 0) !== (dq < 0)) {
          const t = dp / (dp - dq);
          pts.push([pos[p + a] + t * (pos[q + a] - pos[p + a]), pos[p + b] + t * (pos[q + b] - pos[p + b])]);
        }
      }
      if (pts.length === 2) segs.push(pts);
    }
    const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
    const at = new Map();
    segs.forEach((s, i) => s.forEach((p) => { const k = key(p); (at.get(k) || at.set(k, []).get(k)).push(i); }));
    const used = new Uint8Array(segs.length), loops = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const l = [segs[i][0], segs[i][1]];
      for (;;) {
        const end = l[l.length - 1], j = (at.get(key(end)) || []).find((n) => !used[n]);
        if (j === undefined) break;
        used[j] = 1;
        l.push(key(segs[j][0]) === key(end) ? segs[j][1] : segs[j][0]);
      }
      if (l.length > 3 && key(l[0]) === key(l[l.length - 1])) { l[l.length - 1] = l[0]; loops.push(l); }
    }
    return loops;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  const loopDist = (p, l) => { let d = Infinity; for (let i = 0; i + 1 < l.length; i++) d = Math.min(d, segDist(p, l[i], l[i + 1])); return d; };
  function inset(l, d) {                              // closed CCW loop moved d inwards (mitred, capped at 2 d)
    const n = l.length - 1, out = [];
    const nrm = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; };
    for (let i = 0; i < n; i++) {
      const a = nrm(l[(i + n - 1) % n], l[i]), b = nrm(l[i], l[i + 1]);
      const k = Math.min(2, 1 / Math.max(0.5, (1 + a[0] * b[0] + a[1] * b[1]) / 2) ** 0.5) * d;
      const m = [a[0] + b[0], a[1] + b[1]], L = Math.hypot(...m) || 1;
      out.push([l[i][0] + k * m[0] / L, l[i][1] + k * m[1] / L]);
    }
    out.push(out[0]);
    return out;
  }
  function clipConvex(subj, win) {                    // Sutherland-Hodgman: subj (any closed loop) inside convex CCW win
    let out = subj.slice(0, -1);
    for (let i = 0; i + 1 < win.length && out.length; i++) {
      const a = win[i], b = win[i + 1], side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const inp = out;
      out = [];
      for (let k = 0; k < inp.length; k++) {
        const p = inp[k], q = inp[(k + 1) % inp.length], sp = side(p), sq = side(q);
        if (sp >= 0) out.push(p);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
      }
    }
    if (out.length < 3) return null;
    out.push(out[0]);
    return out;
  }
  // -> {axis, lo, hi, faces: [{outer, holes}]} with points in the two other axes ([y, z] / [z, x] / [x, y])
  function honeycomb(pos, { cell = 5.0, wall = 0.8, border = 4.0, ring = 3.8, screw = 20 } = {}) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
    const axis = [0, 1, 2].reduce((m, k) => (hi[k] - lo[k] < hi[m] - lo[m] ? k : m), 0), th = hi[axis] - lo[axis];
    let best = null;                                  // the section with the biggest outline (the face plate)
    for (const fr of [0.13, 0.25, 0.37, 0.5, 0.63]) {
      const faces = nest(section(pos, axis, lo[axis] + fr * th + 1e-4));
      const f = faces.length && faces.reduce((m, x) => (Math.abs(area(x.outer)) > Math.abs(area(m.outer)) ? x : m));
      if (f && (!best || Math.abs(area(f.outer)) > Math.abs(area(best.outer)) + 1)) best = f;
    }
    if (!best) return null;
    const small = best.holes.filter((h) => Math.abs(area(h)) < screw), big = best.holes.filter((h) => Math.abs(area(h)) >= screw);
    const centre = (l) => { let x = 0, y = 0; for (let i = 0; i + 1 < l.length; i++) { x += l[i][0]; y += l[i][1]; } return [x / (l.length - 1), y / (l.length - 1)]; };
    const screws = small.map(centre);
    const xs = best.outer.map((p) => p[0]), ys = best.outer.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pitch = cell + wall, r = cell / Math.sqrt(3), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rows = Math.ceil((y1 - y0) / 2 / (pitch * Math.sqrt(3) / 2)) + 1, cols = Math.ceil((x1 - x0) / 2 / pitch) + 1;
    const outer = area(best.outer) > 0 ? best.outer : best.outer.slice().reverse(), inner = inset(outer, border);
    const cells = [];
    for (let j = -rows; j <= rows; j++)
      for (let i = -cols; i <= cols; i++) {
        const u = cx + (i + (j & 1 ? 0.5 : 0)) * pitch, v = cy + j * pitch * Math.sqrt(3) / 2;
        let hex = [];                                 // CCW
        for (let k = 0; k <= 6; k++) hex.push([u + r * Math.cos(Math.PI / 6 + k * Math.PI / 3), v + r * Math.sin(Math.PI / 6 + k * Math.PI / 3)]);
        if (screws.some((s) => insidePt(s, hex) || loopDist(s, hex) < ring)) continue;
        const test = hex.slice(0, 6).concat(hex.slice(0, 6).map((p, k) => [(p[0] + hex[k + 1][0]) / 2, (p[1] + hex[k + 1][1]) / 2]));
        if (big.some((h) => test.some((p) => insidePt(p, h) || loopDist(p, h) < border))) continue;
        if (!test.every((p) => insidePt(p, inner))) {   // an edge cell: cut to the border's inside edge
          if (!test.some((p) => insidePt(p, outer) && loopDist(p, outer) > border * 0.5)) continue;
          hex = clipConvex(inner, hex);
          if (!hex || Math.abs(area(hex)) < 2 || hex.some((p) => !insidePt(p, outer) || loopDist(p, outer) < border * 0.9)) continue;
        }
        cells.push(area(hex) > 0 ? hex : hex.reverse());
      }
    return { axis, lo: lo[axis], hi: hi[axis], cells: cells.length, faces: [{ outer: best.outer, holes: best.holes.concat(cells) }] };
  }

  // ---- files: SHA-256, zips, matching to the manifest, IndexedDB ----
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  async function sha256(buf) { return hex(await globalThis.crypto.subtle.digest("SHA-256", buf)); }
  const base = (p) => p.split(/[\\/]/).pop().toLowerCase();

  // files: share data cfg.files.files ({path: {source, use, sha256: [..]}}); only the ones the page places matter
  function matcher(files, needed) {
    const bySha = new Map(), byName = new Map();
    for (const p of needed) {
      for (const h of files[p].sha256) bySha.set(h, p);
      byName.set(base(p), p);
    }
    return (name, sha) => bySha.has(sha) ? { path: bySha.get(sha), ok: true }
      : byName.has(base(name)) ? { path: byName.get(base(name)), ok: false } : null;
  }

  // a list of {name, buf} or {name, read: () => Promise<ArrayBuffer>} (zips opened, nested zips too) -> the matched
  // ones {path, name, sha256, ok, buf}. Only .zip / .stl / .dxf are read at all.
  const wanted = (name) => /\.(zip|stl|dxf)$/i.test(name);
  async function identify(items, match, JSZip, onItem) {
    const out = [];
    const walk = async (name, read) => {
      if (!wanted(name)) return;
      const buf = await read();
      if (onItem) onItem(name);
      if (/\.zip$/i.test(name)) {
        if (!JSZip) throw new Error("zip reader not loaded");
        const z = await JSZip.loadAsync(buf);
        for (const f of Object.values(z.files)) if (!f.dir) await walk(f.name, () => f.async("arraybuffer"));
        return;
      }
      const sha = await sha256(buf), m = match(name, sha);
      if (m) out.push({ path: m.path, name: name.split(/[\\/]/).pop(), sha256: sha, ok: m.ok, buf });
    };
    for (const it of items) await walk(it.name, it.read || (async () => it.buf));
    return out;
  }

  const DB = "lr4-sandbox-parts", STORE = "files";
  function db() {
    return new Promise((res, rej) => {
      const r = globalThis.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "path" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
      t.oncomplete = () => { d.close(); res(out && out.result); };
      t.onerror = () => { d.close(); rej(t.error); };
    });
  }
  const store = {
    all: () => tx("readonly", (st) => st.getAll()),
    put: (recs) => tx("readwrite", (st) => { for (const r of recs) st.put(r); }),
    clear: () => tx("readwrite", (st) => st.clear()),
  };

  const api = { readSTL, place, components, bend, flipWinding, dxfLoops, nest, area, section, honeycomb, decimate, sha256, matcher, identify, wanted, store };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Files = api;
})(typeof self !== "undefined" ? self : this);
