// The page's file readers (web/js/parts_files.js) vs the private page data: every part the share data places from a
// file is rebuilt from parts/ the way the page does it and compared with the reference build's mesh.
//   node tests/test_parts_files.js       (needs parts/, web/data/ and web/data/share/ - local only)
// stl / bent: the same vertex set both ways (grid match, TOL) + the same triangle count; peter open: the piece's
// vertices all on the built plate (the build fills openings), closed: >= 99 % on the open piece; dxf: every reference
// vertex within DXF_TOL of an outline and inside the slab (back through A), the same face / hole count, area x depth = the mesh's volume.
// Peter honeycomb: cells inside the border, clear of the holes, not overlapping; lite (decimate): volume kept, fewer triangles.
// Also: every needed file is recognised by its SHA-256, and a renamed copy still is.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const F = require("../web/js/parts_files.js");

const ROOT = path.join(__dirname, ".."), PARTS = path.join(ROOT, "parts"), DATA = path.join(ROOT, "web", "data");
const TOL = 0.002, DXF_TOL = 0.02;
const cfg = JSON.parse(fs.readFileSync(path.join(DATA, "lr4_config.json"), "utf8"));
const share = JSON.parse(fs.readFileSync(path.join(DATA, "share", "lr4_config.json"), "utf8"));
const blob = zlib.gunzipSync(fs.readFileSync(path.join(DATA, "lr4_config_geometry.bin.gz")));
const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
const ref = {};
for (const p of cfg.parts) if (p.mesh) {
  const idx = p.mesh.idx[2] === 32 ? new Uint32Array(ab, p.mesh.idx[0], p.mesh.idx[1]) : new Uint16Array(ab, p.mesh.idx[0], p.mesh.idx[1]);
  ref[p.meta.name] = { pos: new Float32Array(ab, p.mesh.pos[0], p.mesh.pos[1] * 3), idx };
}
const buf = (rel) => { const b = fs.readFileSync(path.join(PARTS, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const key = (x, y, z) => `${Math.floor(x / TOL)},${Math.floor(y / TOL)},${Math.floor(z / TOL)}`;
function inside(a, b) {          // fraction of a's points with one of b's within 0.4 TOL per axis (test_share.py's rule)
  const kb = new Set();
  for (let i = 0; i < b.length; i += 3) kb.add(key(b[i], b[i + 1], b[i + 2]));
  let hit = 0, n = 0;
  const seen = new Set();
  for (let i = 0; i < a.length; i += 3) {
    const k0 = `${a[i]},${a[i + 1]},${a[i + 2]}`;
    if (seen.has(k0)) continue;
    seen.add(k0); n++;
    let ok = false;
    for (const dx of [-0.4, 0.4]) for (const dy of [-0.4, 0.4]) for (const dz of [-0.4, 0.4])
      ok = ok || kb.has(key(a[i] + dx * TOL, a[i + 1] + dy * TOL, a[i + 2] + dz * TOL));
    if (ok) hit++;
  }
  return hit / n;
}
function volume(m) {
  let v = 0;
  const P = m.pos, I = m.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return Math.abs(v) / 6;
}
function invA(A) {               // rigid / mirrored: inverse = transpose of the 3x3
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
  return R.map((r) => [...r, -(r[0] * A[0][3] + r[1] * A[1][3] + r[2] * A[2][3])]);
}
function segDist(p, loops) {
  let best = Infinity;
  for (const l of loops) for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy));
  }
  return best;
}

(async () => {
  const fails = [];
  let done = 0;
  const check = (nm, ok, msg) => { done++; console.log((ok ? "ok   " : "FAIL ") + `${nm}: ${msg}`); if (!ok) fails.push(nm); };
  const soups = new Map(), soup = (rel) => soups.get(rel) || soups.set(rel, F.readSTL(buf(rel))).get(rel);

  // recognition: every file the page needs, by checksum, and by name with a changed checksum
  const needed = new Set();
  for (const p of share.parts) if (p.src) for (const r of p.src.kind === "peter" ? [p.src.open, p.src.closed] : [p.src]) needed.add(r.file);
  const match = F.matcher(share.files.files, needed);
  const items = [...needed].map((rel) => ({ name: "renamed_" + path.basename(rel), buf: buf(rel) }));
  items.push({ name: "x/" + path.basename([...needed][0]).toUpperCase(), buf: new ArrayBuffer(84) });
  const got = await F.identify(items, match, null);
  const bad = got.filter((g) => g.ok).length !== needed.size || got.length !== needed.size + 1 || got[got.length - 1].ok;
  check("files", !bad, `${got.filter((g) => g.ok).length}/${needed.size} recognised by SHA-256, a changed copy matched by name with a warning`);

  for (const p of share.parts) {
    const s = p.src, nm = p.meta.name;
    if (!s) continue;
    const r = ref[nm];
    if (s.kind === "stl" || s.kind === "bent") {
      let t = soup(s.file);
      if (s.kind === "bent") t = F.bend(t, s);
      t = F.place(t, s.A);
      const a = inside(t, r.pos), b = inside(r.pos, t);
      check(nm, a === 1 && b === 1 && t.length / 9 === r.idx.length / 3, `${s.file}${s.kind === "bent" ? " bent" : ""}: ${a.toFixed(4)} / ${b.toFixed(4)} of vertices match, ${t.length / 9} vs ${r.idx.length / 3} triangles`);
    } else if (s.kind === "peter") {
      const piece = F.place(F.components(soup(s.open.file))[s.open.piece], s.open.A);
      const closed = F.place(soup(s.closed.file), s.closed.A);
      const a = inside(piece, r.pos), c = inside(closed, piece);
      check(nm, a === 1 && c >= 0.99, `open piece ${s.open.piece} on the plate ${a.toFixed(4)}, closed on the open piece ${c.toFixed(4)}`);
    } else if (s.kind === "dxf") {
      const { loops, open } = F.dxfLoops(fs.readFileSync(path.join(PARTS, s.file), "utf8"));
      const faces = F.nest(loops), B = invA(s.A);
      let worst = 0, offz = 0;
      for (let i = 0; i < r.pos.length; i += 3) {
        const q = [0, 1, 2].map((k) => B[k][0] * r.pos[i] + B[k][1] * r.pos[i + 1] + B[k][2] * r.pos[i + 2] + B[k][3]);
        offz = Math.max(offz, Math.min(0, s.depth) - q[2], q[2] - Math.max(0, s.depth));   // outside the slab
        worst = Math.max(worst, segDist(q, loops));
      }
      const ar = faces.reduce((a, f) => a + Math.abs(F.area(f.outer)) - f.holes.reduce((h, l) => h + Math.abs(F.area(l)), 0), 0);
      const vol = volume(r), dv = Math.abs(ar * Math.abs(s.depth) - vol) / vol;
      check(nm, !open && worst < DXF_TOL && offz < 1e-3 && dv < 0.002,
        `${s.file}: ${faces.length} face(s), ${faces.reduce((a, f) => a + f.holes.length, 0)} holes, ${open} open chains, z outside the slab by ${Math.max(0, offz).toExponential(1)}; reference vertices within ${worst.toFixed(4)} mm of the outline; volume off by ${(100 * dv).toFixed(3)} %`);
    } else check(nm, false, `unknown kind ${s.kind}`);
  }

  // honeycomb (Peter "Honeycomb" style): every cell inside the cover, >= 0.9 border from its edge, clear of the screw
  // rings, no two cells overlapping; the slab as thick as the cover
  for (const file of ["peter/PeterPlateT.stl", "peter/PeterPlateB.stl"]) {
    const t = soup(file), h = F.honeycomb(t), f = h.faces[0];
    const own = f.holes.slice(0, f.holes.length - h.cells);   // the cover's holes: screws (< 20 mm^2) get a ring
    const screws = own.filter((l) => Math.abs(F.area(l)) < 20), big = own.filter((l) => Math.abs(F.area(l)) >= 20);
    const cells = f.holes.slice(f.holes.length - h.cells);
    const ctr = (l) => [l.slice(0, -1).reduce((a, p) => a + p[0], 0) / (l.length - 1), l.slice(0, -1).reduce((a, p) => a + p[1], 0) / (l.length - 1)];
    let edge = Infinity, ring = Infinity, overlap = 0;
    for (const c of cells) for (const p of c) edge = Math.min(edge, segDist([p[0], p[1], 0], [f.outer, ...big]));
    for (const s of screws) { const q = ctr(s); for (const c of cells) ring = Math.min(ring, segDist([q[0], q[1], 0], [c])); }
    const cs = cells.map(ctr);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.hypot(cs[i][0] - cs[j][0], cs[i][1] - cs[j][1]) < 2.5) overlap++;
    check(file + " honeycomb", h.cells > 250 && edge >= 3.6 && ring >= 3.8 - 1e-6 && !overlap && own.length >= 5,
      `${h.cells} cells, ${screws.length} screw + ${big.length} bigger holes, slab ${(h.hi - h.lo).toFixed(2)} mm; cells >= ${edge.toFixed(2)} mm from an edge, >= ${ring.toFixed(2)} from a screw centre, ${overlap} overlapping`);
  }
  // lite mode: clustering keeps the winding (signed volume within 3 %) and cuts the triangles
  for (const file of ["lr4/Core.stl", "kobalt/Dust_Shoe_Kobalt.stl"]) {
    const t = soup(file), d = F.decimate(t, null, 1.0);
    const sv = (pos, idx) => { let v = 0; const n = idx ? idx.length / 3 : pos.length / 9;
      for (let k = 0; k < n; k++) { const [a, b, c] = [0, 1, 2].map((j) => (idx ? idx[k * 3 + j] : k * 3 + j) * 3);
        v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
          + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; } return v; };
    const v0 = sv(t, null), v1 = sv(d.pos, d.idx), dv = Math.abs(v1 - v0) / Math.abs(v0);
    check(file + " lite", v1 * v0 > 0 && dv < 0.03 && d.idx.length / 3 < 0.6 * t.length / 9,
      `${t.length / 9} -> ${d.idx.length / 3} triangles, volume off by ${(100 * dv).toFixed(2)} %`);
  }
  console.log(`${done - fails.length}/${done} pass` + (fails.length ? `; FAIL: ${fails.join(", ")}` : ""));
  if (fails.length) process.exit(1);
})();
