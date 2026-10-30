// A router's body from its preset (Part 45b, user 2026-10-28): web/data/routers.js `body` -> triangle meshes in the
// router's own frame (mm, z up from the collet nut's bottom, +x = the head's switch / dial end; see the data file's
// header). Pieces: turned stack (nut, spindle, nose, grip, cast, lathe), slabs (plan = a box with its own corner
// radius per end, or a trapezoid; top edges rounded, the top domed down at the ends, bottom chamfered / rounded),
// bosses (cylinders), the dial wheel, switch, cord relief + stub, dark vents / slot patches on the head's top.
// No booleans: pieces overlap. Plain JS, no THREE (tests/test_router_body.js); the page wraps the arrays.
//   build(body) -> { parts: { body, head, cap, dial, switch, cord, nut }: { pos: number[], idx: number[] }, labels,
//                    dial: { c, axis, out, r, t }, cord: { tip, dir } }
//   place(mesh, frame) -> a copy moved into frame { o: [x, y, z], a: rad about z }
(function (root) {
  "use strict";
  const N = 96;                                      // points round a slab / turned piece
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
  const perp = (d) => norm(Math.abs(d[2]) < 0.9 ? cross(d, [0, 0, 1]) : cross(d, [1, 0, 0]));
  const mesh = () => ({ pos: [], idx: [] });
  function append(m, o, id) {                        // m.sec (the body): each vertex's section, o's own or id
    const k = m.pos.length / 3;
    for (const v of o.pos) m.pos.push(v);
    for (const i of o.idx) m.idx.push(i + k);
    if (m.sec) for (let i = 0, n = o.pos.length / 3; i < n; i++) m.sec.push(o.sec ? o.sec[i] : id || 0);
    return m;
  }
  // rings (each N points, in profile order: the first and last may be one point = a cap's centre) -> a closed
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
  // turned piece about an axis: prof = [[r, h]...] from the bottom centre (r 0) to the top centre (r 0)
  function turned(prof, o, dir, n) {
    n = n || N;
    const d = norm(dir), u = perp(d), v = cross(d, u);
    return sweep(prof.map(([r, h]) => Array.from({ length: n }, (_, i) => {
      const t = 2 * Math.PI * i / n;
      return add(add(o, mul(d, h)), add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t))));
    })));
  }
  // a domed dial (Kobalt, user 2026-10-28): the lower half a plain rim, the upper half a dome (parabolic) up to a flat
  // top (dome.top x its radius); [r, h] up its axis from the bottom face, h 0..t. The page puts the numbers on the shoulder.
  function dialProfile(D, n) {
    const R = D.d / 2, h = D.t / 2, rt = R * D.dome.top, out = [[R, 0], [R, h]];
    n = n || 10;
    for (let i = 1; i <= n; i++) { const u = 1 - i / n; out.push([rt + (R - rt) * u, 2 * h - h * u * u]); }   // sloped at the rim, flat on top
    out.push([0, D.t]);
    return out;
  }
  const cyl = (o, dir, d, l, n) => turned([[0, 0], [d / 2, 0], [d / 2, l], [0, l]], o, dir, n);

  // ---- slabs: plan signed distance (negative inside), centred on the slab's own (0, 0) ----
  function polyInset(pts, r) {                       // a convex CCW polygon moved in by r (offset lines intersected)
    const n = pts.length, L = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], e = norm([b[0] - a[0], b[1] - a[1], 0]), nn = [e[1], -e[0]];
      L.push({ p: [a[0] - nn[0] * r, a[1] - nn[1] * r], e });
    }
    return L.map((l, i) => {
      const k = L[(i + n - 1) % n], den = k.e[0] * l.e[1] - k.e[1] * l.e[0];
      const t = ((l.p[0] - k.p[0]) * l.e[1] - (l.p[1] - k.p[1]) * l.e[0]) / den;
      return [k.p[0] + k.e[0] * t, k.p[1] + k.e[1] * t];
    });
  }
  function sdPoly(pts, x, y) {                       // convex CCW polygon
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
    const rn = s.r ? s.r[0] : 0, rp = s.r ? s.r[1] : 0;
    if (s.hw) {                                      // [[x, half width]...] from -x to +x, mirrored front / back (the
      // Kobalt: read off the user's top photo 2026-10-28); linear between, so a few points per round corner
      const top = s.hw.map(([x, y]) => [x, y]);
      const pts = top.map(([x, y]) => [x, -y]).concat(top.slice().reverse());   // CCW
      s.plan = (x, y) => sdPoly(pts, x, y);
    } else if (s.w) {                                       // trapezoid: w at -x, w at +x; one corner radius (the larger)
      const r = Math.max(rn, rp), h = s.L / 2;
      const ins = polyInset([[-h, -s.w[0] / 2], [h, -s.w[1] / 2], [h, s.w[1] / 2], [-h, s.w[0] / 2]], r);
      s.plan = (x, y) => sdPoly(ins, x, y) - r;
    } else {                                         // box, corner r per end (iq's rounded box)
      const bx = s.L / 2, by = s.W / 2;
      s.plan = (x, y) => {
        const r = Math.min(x > 0 ? rp : rn, bx, by), qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r;
        return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
      };
    }
    return s.plan;
  }
  const half = (s) => [s.L / 2, (s.w ? Math.max(...s.w) : s.W) / 2];
  // the slab's top at a plan point (slab frame): the top edge rounding by the distance in, the domed ends by x
  function topAt(s, x, y) {
    const d = -planSd(s)(x, y), top = s.z[1], rt = s.top_r || s.top_ch || 0, [hx] = half(s);
    if (d < 0) return null;
    let z = top;
    if (rt > 0 && d < rt) z = s.top_ch ? top - rt + d : top - rt + Math.sqrt(Math.max(rt * rt - (rt - d) * (rt - d), 0));   // top_ch: a 45 deg bevel
    const dm = s.dome || [0, 0];
    for (const [r, sx] of [[dm[0], -1], [dm[1], 1]]) {
      if (!(r > 0)) continue;
      const u = sx * x - (hx - r);                  // past the dome's centre toward that end
      if (u > 0) z = Math.min(z, top - r + Math.sqrt(Math.max(r * r - u * u, 0)));
    }
    const sl = s.slope || [null, null];                // straight chamfers down at the ends: [drop, run] (Kobalt dial housing)
    for (const [q, sx] of [[sl[0], -1], [sl[1], 1]]) {
      if (!q) continue;
      const u = sx * x - (hx - q[1]);
      if (u > 0) z = Math.min(z, top - q[0] * u / q[1]);
    }
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
    const cb = s.chamfer || s.bot_r || 0, rt = s.top_r || s.top_ch || 0;
    const dmax = -sd(0, 0), ray = rayOf(s);
    const prof = [[dmax, () => z0]];                // [d in, z(x, y)] from the bottom centre round to the top centre
    if (s.chamfer) prof.push([cb, () => z0], [0, () => z0 + cb]);
    else if (s.bot_r) for (let k = 0; k <= 6; k++) { const f = Math.PI / 2 * k / 6; prof.push([cb - cb * Math.sin(f), () => z0 + cb - cb * Math.cos(f)]); }
    else prof.push([0, () => z0]);
    const tz = (x, y) => topAt(s, x, y) ?? z0;
    prof.push([0, (x, y) => Math.min(s.z[1] - rt, tz(x, y))]);
    if (rt > 0) for (let k = 1; k <= 8; k++) prof.push([s.top_ch ? rt * k / 8 : rt * (1 - Math.cos(Math.PI / 2 * k / 8)), tz]);
    const dIn = Math.max(rt, 0.5);
    for (let k = 1; k <= 8; k++) prof.push([dIn + (dmax - dIn) * k / 8, tz]);
    const rings = prof.map(([d, zf]) => Array.from({ length: N }, (_, i) => {
      const [x, y] = ray(2 * Math.PI * i / N, d);
      return [x + at[0], y + at[1], zf(x, y)];
    }));
    return sweep(rings);
  }
  // the head's top (highest slab) at (x, y) body frame, or null off every slab
  function surface(slabs, x, y) {
    let z = null;
    for (const s of slabs) { const at = s.at || [0, 0], t = topAt(s, x - at[0], y - at[1]); if (t !== null && (z === null || t > z)) z = t; }
    return z;
  }
  function patch(slabs, c, size, lift, cut, skirt) {  // a thin plate laid on the top surface (vents, the dial's window); skirt:
    // walls down from its edge to the surface (a raised shaped area)
    const m = mesh();
    if (cut) {                                       // corners cut off this far (a long hexagon-ish window): its outline,
      const hx = size[0] / 2, hy = size[1] / 2, corner = [[hx, hy - cut], [hx - cut, hy]];   // ringed in to the centre
      const q = [];
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const pts = sx * sy > 0 ? corner : corner.slice().reverse();
        for (const [x, y] of pts) q.push([sx * x, sy * y]);
      }
      const dense = [];                              // each side in 4, so the plate follows a curved top
      for (let i = 0; i < q.length; i++) {
        const a = q[i], b = q[(i + 1) % q.length];
        for (let k = 0; k < 4; k++) dense.push([a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4]);
      }
      const n = dense.length, R = 5;
      for (let r = R; r >= 0; r--) for (const [x, y] of r ? dense : [[0, 0]]) {
        const px = c[0] + x * r / R, py = c[1] + y * r / R, z = surface(slabs, px, py);
        m.pos.push(px, py, (z === null ? 0 : z) + lift);
      }
      for (let r = 0; r < R - 1; r++) for (let i = 0; i < n; i++) {   // outer ring r -> the next one in
        const a = r * n + i, b = r * n + (i + 1) % n;
        m.idx.push(a, b, b + n, a, b + n, a + n);
      }
      const ctr = R * n;
      for (let i = 0; i < n; i++) m.idx.push((R - 1) * n + i, (R - 1) * n + (i + 1) % n, ctr);
      if (skirt) {                                   // the outer ring again on the surface, walls between
        const base = m.pos.length / 3;
        for (const [x, y] of dense) { const px = c[0] + x, py = c[1] + y, z = surface(slabs, px, py); m.pos.push(px, py, (z === null ? 0 : z) - 0.3); }
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; m.idx.push(i, base + i, base + j, i, base + j, j); }
      }
      return m;
    }
    const nx = 6, ny = 6, p = (i, j) => [c[0] + size[0] * (i / nx - 0.5), c[1] + size[1] * (j / ny - 0.5)];
    const off = [];                                  // off the head: those cells are left out
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const [x, y] = p(i, j), z = surface(slabs, x, y);
      off.push(z === null);
      m.pos.push(x, y, (z === null ? 0 : z) + lift);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j, b = (i + 1) * (ny + 1) + j;
      if (off[a] || off[b] || off[a + 1] || off[b + 1]) continue;
      m.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    return m;
  }
  function prismX(poly, x0, x1) {                    // a convex [y, z] outline (counter-clockwise seen from +x) from x0 to x1
    const m = mesh(), n = poly.length;
    for (const x of [x0, x1]) for (const [y, z] of poly) m.pos.push(x, y, z);
    for (let i = 1; i + 1 < n; i++) m.idx.push(0, i + 1, i, n, n + i, n + i + 1);   // the -x cap, the +x cap
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; m.idx.push(i, j, n + j, i, n + j, n + i); }
    return m;
  }
  function box(c, size) {                            // axis-aligned, centred on c
    const [hx, hy, hz] = size.map((v) => v / 2), m = mesh();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) m.pos.push(c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz);
    m.idx.push(0, 3, 2, 0, 1, 3, 4, 7, 5, 4, 6, 7, 0, 5, 1, 0, 4, 5, 2, 7, 6, 2, 3, 7, 0, 6, 4, 0, 2, 6, 1, 7, 3, 1, 5, 7);
    return m;
  }

  // the generic head (user 2026-10-28): a preset with `head` and no `slabs` gets a box with rounded edges sized by it,
  // the dial, switch and cord placed on it unless the preset gives its own (merged over these). For every router whose
  // head isn't modelled photo by photo; the turned part below stays per router (the mounts / checks need it).
  //   head: { L (x), W (y), H (z; its top = `overall`, default down to the turned stack), top_r: the top edges' fillet,
  //   front_r / back_r: the upright corners' fillet at the +x (switch / dial) end / the -x (cord) end, bot_r: the
  //   bottom edges (default 2), at: [x, y], dial: "end" (lying flat, rim out of the +x end) | "top" (across the head,
  //   rim up through the top) or { place, d, t } }; the switch goes on the +x end, the cord out of the -x end
  function stackTop(b) {
    let z = b.nut[1];
    for (const k of ["spindle", "nose", "grip", "cast"]) { const [d, l] = b[k] || [0, 0]; if (d > 0 && l > 0) z += l; }
    for (const [, zz] of b.lathe || []) z = zz;
    if (b.trans && b.trans.l > 0) z += b.trans.l;
    return z;
  }
  function expand(b) {
    const h = b.head;
    if (!h || b.slabs) return b;
    const at = h.at || [0, 0], z0 = stackTop(b), H = h.H || b.overall - z0, z1 = z0 + H, x1 = at[0] + h.L / 2;
    const fit = (v, dflt) => Math.min(v ?? dflt, h.W / 2, h.L / 2);
    const rf = fit(h.front_r, 10), rb = fit(h.back_r, 10), e = Math.min(h.top_r ?? 6, H / 2), r = rf;
    const dp = typeof h.dial === "string" ? { place: h.dial } : Object.assign({ place: "end" }, h.dial);
    const d = dp.d || 24, t = dp.t || 6;
    const dial = dp.place === "top"
      ? { axis: "y", at: [x1 - d / 2 - Math.max(e, 8), at[1], z1 - d / 2 + 5], d, t, out: 90, slot: [d + 4, t + 3] }
      : { axis: "z", at: [x1 - d / 2 + 5, at[1], z1 - e - t / 2 - 1], d, t, out: 0 };
    const sw = Math.max(Math.min(20, h.W - 2 * r - 2), 6), sh = Math.min(14, H * 0.4);   // on the flat of the +x end
    const swz = dp.place === "top" ? z0 + H / 2 : Math.min(z0 + H * 0.4, dial.at[2] - t / 2 - sh / 2 - 3);
    return Object.assign({}, b, {
      slabs: [{ name: "head", at, L: h.L, W: h.W, r: [rb, rf], z: [z0, z1], top_r: e, bot_r: Math.min(h.bot_r ?? 2, H / 2 - e) }],
      dial: Object.assign(dial, b.dial),
      switch: Object.assign({ at: [x1 + 0.75, at[1], swz], size: [1.5, sw, sh], rocker: [3.0, sw * 0.7, sh * 0.65] }, b.switch),
      cord: Object.assign({ at: [at[0] - h.L / 2, at[1], z0 + H * 0.6], d: 7.4, relief: [40.0, 12.0], bend: 45.0, out: 15.0 }, b.cord),
      vents: [], louvers: null, labels: [], pockets: [], seam: null,
    });
  }

  // a spindle (user 2026-10-29: some run a 65 mm spindle instead of a router): kind "spindle" = the nut, nose
  // (the bearing cap) and the can - one cylinder up to the top, a dark end cap on it; air-cooled: a fan grille on
  // top, water-cooled: two hose barbs up out of the cap; the cable plug on the -x side near the top, the cable out of
  // it toward -x. No dial, no switch (a VFD runs it).
  //   { kind: "spindle", nut, nose: [d, length], can: [d, length], cooling: "air" | "water" }
  function spindle(b) {
    const P = { body: mesh(), head: mesh(), cap: mesh(), dial: mesh(), switch: mesh(), switch_off: mesh(), cord: mesh(), nut: mesh() };
    const [nf, nh, nk] = b.nut, [cd, cl] = b.can, [sd, sl] = b.nose || [0, 0];
    if (nk === "hex") {
      const rc = nf / 2 / Math.cos(Math.PI / 6);
      append(P.nut, slab({ plan: (x, y) => sdPoly(Array.from({ length: 6 }, (_, i) => [rc * Math.cos(Math.PI / 3 * i), rc * Math.sin(Math.PI / 3 * i)]), x, y),
        L: 2 * rc, W: nf, z: [0, nh], chamfer: 1.2 }));
    } else append(P.nut, turned([[0, 0], [nf / 2 - 1, 0], [nf / 2, 1], [nf / 2, nh], [0, nh]], [0, 0, 0], [0, 0, 1]));
    let z = nh;
    const prof = [[0, z]];
    if (sd > 0 && sl > 0) { prof.push([sd / 2, z], [sd / 2, z + sl]); z += sl; }
    const capH = Math.min(8, cl / 4), top = z + cl;
    prof.push([cd / 2 - 1, z], [cd / 2, z + 1], [cd / 2, top - capH], [0, top - capH]);
    append(P.body, turned(prof, [0, 0, 0], [0, 0, 1]));
    append(P.head, turned([[0, top - capH], [cd / 2, top - capH], [cd / 2, top - 1.5], [cd / 2 - 1.5, top], [0, top]], [0, 0, 0], [0, 0, 1]));
    if (b.cooling === "water")                       // two barbs up out of the cap, either side of the axis
      for (const y of [-cd * 0.22, cd * 0.22]) { append(P.cap, cyl([cd * 0.18, y, top - 1], [0, 0, 1], 10, 6, 24)); append(P.cap, cyl([cd * 0.18, y, top + 5], [0, 0, 1], 6, 12, 24)); }
    else for (let i = 0; i < 4; i++) {               // the fan grille: dark rings on the cap
      const r = cd * (0.12 + 0.1 * i);
      append(P.cap, turned([[r, top + 0.15], [r + cd * 0.04, top + 0.15], [r + cd * 0.04, top + 0.3], [r, top + 0.3]], [0, 0, 0], [0, 0, 1], 48));
    }
    const pz = top - capH - 12;                      // the plug: a boss out of the -x side, the cable on out of it
    append(P.cap, cyl([-cd / 2 + 1, 0, pz], [-1, 0, 0], 16, 14, 32));
    const C = Object.assign({ d: 7.4, relief: [20.0, 10.0], bend: 30.0, out: 15.0 }, b.cord, { at: [-cd / 2 - 13, 0, pz] });
    return { P, top, cord: C };
  }

  // the turned part (user 2026-10-29: "limit to 3 sections. The main section, the section above that, and the
  // transition to the head"): spindle + nose, the grip (its collet end chamfered grip_ch at 45 deg), the collar (cast),
  // the transition trans { l, d, shape: "round" (a cone to its top d) | "head" (lofted from round to the head's plan),
  // edge: "none" | "fillet" | "chamfer", e } - its edge where it meets the head. Each vertex keeps its section (sec:
  // 0 spindle / nose, 1 grip, 2 collar, 3 transition) so the page can color + finish them apart. A legacy lathe (rows
  // above the collar): still turned, as the transition.
  const SEC = { base: 0, grip: 1, cast: 2, trans: 3 };
  // the biggest edge (fillet / chamfer) the transition can have where it meets the head: no longer than the transition;
  // round: its flare stays under the head (to its narrower half); shaped to the head: the loft's top (the head's plan
  // inset by the under-fillet + the edge) keeps some size. b: expanded (its head slab) or not
  function transEdgeMax(b) {
    const T = b.trans;
    if (!T || !(T.l > 0)) return 0;
    const H = (b.slabs || []).find((q) => q.name === "head") || (b.slabs || [])[0];
    const hh = H ? Math.min(...half(H)) : b.head ? Math.min(b.head.L, b.head.W) / 2 : 1e9;
    const bot = H ? H.bot_r || H.chamfer || 0 : b.head ? b.head.bot_r ?? 2 : 0;
    const lim = T.shape === "head" ? hh - bot - 8 : hh - Math.max(T.d > 0 ? T.d / 2 : 0, 0.5) - 0.5;
    return Math.max(0, +Math.min(T.l - 0.2, lim).toFixed(1));
  }
  function stack(b, z) {
    const prof = [[0, z]], ids = [SEC.base], out = [];
    let r = 0, id = SEC.base;
    const pt = (rr, zz, i) => { prof.push([rr, zz]); ids.push(i); id = i; };
    for (const k of ["spindle", "nose", "grip", "cast"]) {
      const [d, l] = b[k] || [0, 0];
      if (!(d > 0 && l > 0)) continue;
      const i = SEC[k] ?? SEC.base;
      pt(r, z, i);                                    // the step's ring again: its face is this section's (a clean color edge)
      const c = k === "grip" ? Math.min(b.grip_ch || 0, l / 2, Math.max(d / 2 - r - 0.5, 0)) : 0;
      if (c > 0) { pt(d / 2 - c, z, i); pt(d / 2, z + c, i); } else pt(d / 2, z, i);
      pt(d / 2, z + l, i);
      z += l; r = d / 2;
    }
    if ((b.lathe || []).length) { pt(r, z, SEC.trans); for (const [d, zz] of b.lathe) { pt(d / 2, zz, SEC.trans); z = zz; r = d / 2; } }
    const T = b.trans, H = (b.slabs || []).find((q) => q.name === "head") || (b.slabs || [])[0];
    if (T && T.l > 0) {
      const z1 = z + T.l, emax = transEdgeMax(b);
      if (T.shape === "head" && H) {                 // its own piece: the turned part closes at the collar
        pt(0, z, id);
        out.push(transLoft(H, r, z, z1, T, emax));
        z = z1;
      } else {
        const rt = Math.max(T.d > 0 ? T.d / 2 : r, 0.5);
        const e = T.edge === "fillet" || T.edge === "chamfer" ? Math.min(T.e || 0, emax) : 0;
        pt(r, z, SEC.trans);
        const re = r + (rt - r) * (T.l - e) / T.l;
        pt(re, z1 - e, SEC.trans);
        if (e > 0 && T.edge === "fillet") for (let k = 1; k <= 8; k++) { const f = Math.PI / 2 * k / 8; pt(re + e - e * Math.cos(f), z1 - e + e * Math.sin(f), SEC.trans); }
        else if (e > 0) pt(re + e, z1, SEC.trans);
        z = z1;
      }
    }
    if (prof[prof.length - 1][0] !== 0) pt(0, z, id);
    const m = turned(prof, [0, 0, 0], [0, 0, 1]);
    m.sec = ids.flatMap((i) => Array(N).fill(i));
    return [m, ...out];
  }
  // round (radius r at z0) up to the head's plan (inset by its under-fillet + the edge) at z1, then the edge out into
  // the head's underside (fillet: a concave quarter round; chamfer: 45 deg)
  function transLoft(H, r, z0, z1, T, emax) {
    const ray = rayOf(H), at = H.at || [0, 0], bot = H.bot_r || H.chamfer || 0;
    const e = T.edge === "fillet" || T.edge === "chamfer" ? Math.min(T.e || 0, emax) : 0;
    const m0 = bot + e, K = 12, th = Array.from({ length: N }, (_, i) => 2 * Math.PI * i / N);
    const out = (ins) => th.map((t) => { const [x, y] = ray(t, ins); return [x + at[0], y + at[1]]; });
    const o0 = out(m0), rings = [th.map(() => [0, 0, z0]), th.map((t) => [r * Math.cos(t), r * Math.sin(t), z0])];
    for (let j = 1; j <= K; j++) {
      const u = j / K, w = u * u * (3 - 2 * u), zz = z0 + (z1 - e - z0) * u;   // smoothstep: round at the collar, square under the head
      rings.push(th.map((t, i) => [r * Math.cos(t) * (1 - w) + o0[i][0] * w, r * Math.sin(t) * (1 - w) + o0[i][1] * w, zz]));
    }
    if (e > 0) for (let k = 1; k <= 8; k++) {
      const f = Math.PI / 2 * k / 8, ins = T.edge === "fillet" ? m0 - e + e * Math.cos(f) : m0 - e * k / 8;
      const zz = T.edge === "fillet" ? z1 - e + e * Math.sin(f) : z1 - e + e * k / 8, o = out(ins);
      rings.push(o.map(([x, y]) => [x, y, zz]));
    }
    rings.push(th.map(() => [at[0], at[1], z1]));
    const m = sweep(rings);
    m.sec = Array(m.pos.length / 3).fill(SEC.trans);
    return m;
  }
  function build(b) {
    if (b.kind === "spindle") {
      const S = spindle(b);
      return Object.assign(cordPart(S.P, S.cord), { parts: S.P, dial: null, labels: [], rocker: null, pockets: [], noSwitch: true });
    }
    b = expand(b);
    const P = { body: Object.assign(mesh(), { sec: [] }), head: mesh(), cap: mesh(), dial: mesh(), switch: mesh(), switch_off: mesh(), cord: mesh(), nut: mesh() };
    // the turned stack up from the nut
    const [nf, nh, nk] = b.nut;
    if (nk === "hex") {
      const rc = nf / 2 / Math.cos(Math.PI / 6);
      append(P.nut, slab({ plan: (x, y) => sdPoly(Array.from({ length: 6 }, (_, i) => [rc * Math.cos(Math.PI / 3 * i), rc * Math.sin(Math.PI / 3 * i)]), x, y),
        L: 2 * rc, W: nf, z: [0, nh], chamfer: 1.2 }));
    } else append(P.nut, turned([[0, 0], [nf / 2 - 1, 0], [nf / 2, 1], [nf / 2, nh], [0, nh]], [0, 0, 0], [0, 0, 1]));
    for (const piece of stack(b, nh)) append(P.body, piece);
    if (b.lock) {                                    // the spindle lock (builder): a boss out of the turned part, its button on the end
      const L = b.lock, a = L.a * Math.PI / 180, dir = [Math.cos(a), Math.sin(a), 0];
      append(P.body, cyl([0, 0, L.z], dir, L.d, L.r, 48), SEC.grip);
      append(P.cap, cyl(mul(dir, L.r).map((v, i) => i === 2 ? L.z : v), dir, L.d * 0.7, 1.4, 48));
    }
    for (const s of b.slabs || []) append(P[s.part || "head"], slab(Object.assign({}, s)));
    for (const q of b.prisms || []) append(P[q.part || "head"], prismX(q.poly, q.x[0], q.x[1]));
    for (const q of b.bosses || []) {
      let o = q.from, dir = q.dir;
      if (q.from_r) {                                // [r out from the axis, deg from +x, z]
        const a = q.from_r[1] * Math.PI / 180;
        dir = [Math.cos(a), Math.sin(a), 0];
        o = [dir[0] * q.from_r[0], dir[1] * q.from_r[0], q.from_r[2]];
      }
      append(P[q.part || "head"], cyl(o, dir, q.d, q.l, 48));
    }
    const slabs = (b.slabs || []).filter((s) => (s.part || "head") === "head").map((s) => Object.assign({}, s));
    // the dial wheel (its numbered ring: js/page/router.js)
    const D = b.dial, ax = Array.isArray(D.axis) ? norm(D.axis) : D.axis === "y" ? [0, 1, 0] : [0, 0, 1];   // [x, y, z]: tilted (Kobalt: angled back)
    if (D.dome) append(P.dial, turned([[0, 0], ...dialProfile(D)], add(D.at, mul(ax, -D.t / 2)), ax, 72));   // rim + domed top
    else append(P.dial, cyl(add(D.at, mul(ax, -D.t / 2)), ax, D.d, D.t, 72));
    const oa = Array.isArray(D.out) ? 0 : (D.out || 0) * Math.PI / 180;
    const out = Array.isArray(D.out) ? norm(D.out) : D.axis === "y" ? [Math.cos(oa), 0, Math.sin(oa)] : [Math.cos(oa), Math.sin(oa), 0];
    if (D.slot) append(P.cap, patch(slabs, D.at, D.slot, 0.12));
    for (const v of b.vents || []) for (let i = 0; i < v.n; i++)
      append(P[v.part || "cap"], patch(slabs, [v.at[0] + v.step[0] * i, v.at[1] + v.step[1] * i], v.size, v.raise || (v.cut ? 0.4 : 0.12), v.cut, !!v.raise));
    const pockets = b.pockets || [];                 // boxes cut out of the head (the page clips it: Kobalt's dial)
    for (const q of pockets) {
      const m = mesh(), [x0, x1] = q.x, [y0, y1] = q.y, z = q.z, top = (x, y) => (surface(slabs, x, y) ?? z) + 0.05;
      const wall = (pts) => {                        // [x, y] along the wall, the pocket on its left: a strip from z up
        const k = m.pos.length / 3;
        for (const [x, y] of pts) m.pos.push(x, y, z, x, y, Math.max(top(x, y), z + 0.1));
        for (let i = 0; i + 1 < pts.length; i++) { const a = k + 2 * i; m.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      };
      const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
      const e = 0.05;
      wall(line([x1, y0 - e], [x0 - e, y0 - e], 16));   // front-side wall (-y), the back, the +y side: round the inside
      wall(line([x0 - e, y0 - e], [x0 - e, y1 + e], 12));
      wall(line([x0 - e, y1 + e], [x1, y1 + e], 16));
      const k = m.pos.length / 3;                    // the floor
      m.pos.push(x0, y0, z - e, x1, y0, z - e, x1, y1, z - e, x0, y1, z - e);
      m.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      append(P.head, m);
    }
    const LV = b.louvers;                            // slots across the head's top, broken by lengthwise ribs (Kobalt photo)
    if (LV) for (let i = 0; i < LV.n; i++) {
      const x = LV.x[0] + (LV.x[1] - LV.x[0]) * i / (LV.n - 1);
      let lo = 0, hi = 100;                          // the head's half width at x
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (surface(slabs, x, m) !== null && surface(slabs, x, -m) !== null) lo = m; else hi = m; }
      const e = lo - LV.inset, cuts = [-e, ...LV.ribs.flatMap((r) => [r - LV.rib_w / 2, r + LV.rib_w / 2]), e];
      for (let k = 0; k < cuts.length; k += 2)
        if (cuts[k + 1] - cuts[k] > 1 && !(LV.skip || []).some(([r, q]) => r === i && q === k / 2)) append(P.cap, patch(slabs, [x, (cuts[k] + cuts[k + 1]) / 2], [LV.w, cuts[k + 1] - cuts[k]], 0.4));   // 0.4: clear of the head's coarser mesh on the rounded edges
    }
    const head = (b.slabs || []).find((s) => s.name === "head");
    if (b.seam && head && head.hw)                   // the parting line: a thin dark band just proud of the head's sides
      append(P.cap, slab({ name: "seam", hw: head.hw.map(([x, y]) => [x, y + b.seam.out]), L: head.L, W: head.W, z: [b.seam.z, b.seam.z + b.seam.h] }));
    const labels = [];                               // flat decals on the head's sides (the page draws the text)
    let rocker = null;                               // the rocker's centre, size, tip (deg): the page marks its face O | I
    for (const l of b.labels || []) for (const s of l.sides || [1]) {
      let lo = 0, hi = 100;                          // the head's half width at the label's x
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (surface(head ? [head] : slabs, l.x, s * m) !== null) lo = m; else hi = m; }
      labels.push({ text: l.text, color: l.color, w: l.w, h: l.h, c: [l.x, s * (lo + 0.3), l.z], n: [0, s, 0] });
    }
    if (b.switch) {                                  // the bezel (or the whole switch) + the rocker standing out of it
      append(b.switch.rocker ? P.cap : P.switch, box(b.switch.at, b.switch.size));   // with a rocker: the bezel stays put (black)
      const k = b.switch.rocker;
      if (k) for (const [part, a] of [["switch", 8], ["switch_off", -8]]) {   // the rocker tipped about its upright middle: on = its +y ("I") end in
        const c = add(b.switch.at, [(k[0] - b.switch.size[0]) / 2, 0, 0]), r = box(c, k), ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
        for (let i = 0; i < r.pos.length; i += 3) { const x = r.pos[i] - c[0], y = r.pos[i + 1] - c[1]; r.pos[i] = c[0] + ca * x - sa * y; r.pos[i + 1] = c[1] + sa * x + ca * y; }
        append(P[part], r);
        rocker = { c, size: k, a: 8 };
      }
    }
    const { cord } = cordPart(P, b.cord);
    return { parts: P, dial: { c: D.at, axis: ax, out, r: D.d / 2, t: D.t, dome: D.dome || null }, cord, labels, rocker, pockets };
  }
  // the cord: the relief tapers along an arc bending `bend` toward +y, the stub straight on from its end
  function cordPart(P, C) {
    const [rl, rd] = C.relief, bend = (C.bend || 0) * Math.PI / 180, secs = [];
    let p1 = C.at, dir = [-1, 0, 0];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8, ph = bend * f, rr = rd / 2 + (C.d / 2 + 0.6 - rd / 2) * f;
      const c = bend > 1e-6 ? add(C.at, [-rl / bend * Math.sin(ph), rl / bend * (1 - Math.cos(ph)), 0]) : add(C.at, [-rl * f, 0, 0]);
      const tn = [-Math.cos(ph), Math.sin(ph), 0];
      secs.push([c, tn, rr]);
      p1 = c; dir = tn;
    }
    if (C.out > 0) secs.push([add(p1, mul(dir, 0.01)), dir, C.d / 2], [add(p1, mul(dir, C.out)), dir, C.d / 2]);
    const ring = ([c, tn, r]) => {
      const u = [0, 0, 1], v = cross(tn, u);
      return Array.from({ length: 24 }, (_, i) => { const t = 2 * Math.PI * i / 24; return add(c, add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t)))); });
    };
    append(P.cord, sweep([ring([secs[0][0], secs[0][1], 0]), ...secs.map(ring), ring([secs[secs.length - 1][0], dir, 0])]));
    return { cord: { tip: add(p1, mul(dir, C.out || 0)), dir } };
  }
  // into a frame: turned a (rad) about z, then moved to o
  function place(m, f) {
    const c = Math.cos(f.a), s = Math.sin(f.a), pos = new Array(m.pos.length);
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i], y = m.pos[i + 1];
      pos[i] = f.o[0] + c * x - s * y; pos[i + 1] = f.o[1] + s * x + c * y; pos[i + 2] = f.o[2] + m.pos[i + 2];
    }
    return m.sec ? { pos, idx: m.idx.slice(), sec: m.sec.slice() } : { pos, idx: m.idx.slice() };
  }
  const placeV = (v, f, dirOnly) => {
    const c = Math.cos(f.a), s = Math.sin(f.a), o = dirOnly ? [0, 0, 0] : f.o;
    return [o[0] + c * v[0] - s * v[1], o[1] + s * v[0] + c * v[1], o[2] + v[2]];
  };

  const api = { build, expand, stackTop, transEdgeMax, place, placeV, surface, topAt, dialProfile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4RouterBody = api;
})(typeof self !== "undefined" ? self : this);
