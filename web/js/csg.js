// Real booleans for the page's own meshes (Part 46c, user 2026-10-30: "the FreeCAD equivalent of pocket"): manifold-3d
// (Apache-2.0, web/manifold/, vendored unmodified) behind {pos, idx} meshes. Load it once with init() before the first
// router build (the page's startup, tools/router_export.js, the node tests); until then (or if it fails to load)
// subtract / union return null and the caller keeps its old look: nothing breaks.
//   init() -> Promise<bool>     ready() -> bool
//   weld(mesh, eps) -> a copy with coincident points merged and collapsed triangles dropped (a sweep's cap centres)
//   subtract(a, b) / union(a, b) -> { pos, idx } | null   (a, b: closed meshes; welded here)
//   levelSet(f, lo, hi, edge) -> the solid where f > 0 in the box lo..hi | null
(function (root) {
  "use strict";
  let M = null, loading = null;
  function init() {
    if (M) return Promise.resolve(true);
    if (loading) return loading;
    const url = typeof document !== "undefined" ? new URL("manifold/manifold.js", document.baseURI).href
      : require("url").pathToFileURL(require("path").join(__dirname, "..", "manifold", "manifold.js")).href;
    loading = import(url).then((mod) => mod.default()).then((w) => { w.setup(); M = w; return true; })
      .catch((e) => { console.warn("csg: manifold-3d did not load, pockets off:", e && e.message); return false; });
    return loading;
  }
  // points in one eps cell share one index (a number hash, positions checked); a triangle down to two corners goes.
  // Two near points either side of a cell's edge stay apart: Mesh.merge() (toManifold) joins those
  function weld(m, eps) {
    eps = eps || 1e-4;
    const cell = new Map(), map = new Int32Array(m.pos.length / 3), pos = [];
    for (let i = 0; i < map.length; i++) {
      const x = m.pos[3 * i], y = m.pos[3 * i + 1], z = m.pos[3 * i + 2];
      const gx = Math.round(x / eps), gy = Math.round(y / eps), gz = Math.round(z / eps);
      const k = ((gx * 73856093) ^ (gy * 19349663) ^ (gz * 83492791)) | 0;
      let hit = -1, l = cell.get(k);
      if (l) for (const j of l) if (Math.round(pos[3 * j] / eps) === gx && Math.round(pos[3 * j + 1] / eps) === gy && Math.round(pos[3 * j + 2] / eps) === gz) { hit = j; break; }
      if (hit < 0) {
        hit = pos.length / 3; pos.push(x, y, z);
        if (l) l.push(hit); else cell.set(k, [hit]);
      }
      map[i] = hit;
    }
    const idx = [];
    for (let t = 0; t < m.idx.length; t += 3) {
      const a = map[m.idx[t]], b = map[m.idx[t + 1]], c = map[m.idx[t + 2]];
      if (a !== b && b !== c && a !== c) idx.push(a, b, c);
    }
    return { pos, idx };
  }
  const toManifold = (m) => {
    const w = weld(m);
    const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(w.pos), triVerts: new Uint32Array(w.idx) });
    mesh.merge();
    return new M.Manifold(mesh);
  };
  const fromManifold = (mf) => {
    const g = mf.getMesh(), n = g.numProp, pos = new Array(g.numVert * 3);
    for (let i = 0; i < g.numVert; i++) { pos[3 * i] = g.vertProperties[i * n]; pos[3 * i + 1] = g.vertProperties[i * n + 1]; pos[3 * i + 2] = g.vertProperties[i * n + 2]; }
    return { pos, idx: Array.from(g.triVerts) };
  };
  function op(a, b, how) {
    if (!M) return null;
    const live = [];
    try {
      const A = toManifold(a); live.push(A);
      const B = toManifold(b); live.push(B);
      const R = A[how](B); live.push(R);
      if (R.isEmpty() && !A.isEmpty() && how === "union") return null;
      return fromManifold(R);
    } catch (e) {                                    // not closed (or another mesh problem): the caller's fallback
      console.warn("csg:", how, "failed:", e && e.message);
      return null;
    } finally { for (const o of live) o.delete(); }
  }
  // a solid where f(x, y, z) > 0 (a distance-like function, positive inside) over the box lo..hi, triangles ~edge long
  function levelSet(f, lo, hi, edge) {
    if (!M) return null;
    let R = null;
    try {
      R = M.Manifold.levelSet((p) => f(p[0], p[1], p[2]), { min: lo, max: hi }, edge);
      return R.isEmpty() ? null : fromManifold(R);
    } catch (e) {
      console.warn("csg: levelSet failed:", e && e.message);
      return null;
    } finally { if (R) R.delete(); }
  }
  const api = { init, ready: () => !!M, weld, levelSet, subtract: (a, b) => op(a, b, "subtract"), union: (a, b) => op(a, b, "add") };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Csg = api;
})(typeof self !== "undefined" ? self : this);
