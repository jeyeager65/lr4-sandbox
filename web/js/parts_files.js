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

  const api = { readSTL, place, components, bend, flipWinding, dxfLoops, nest, area, sha256, matcher, identify, wanted, store };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Files = api;
})(typeof self !== "undefined" ? self : this);
