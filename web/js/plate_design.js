// The front strut plate's design (Part 41): the template SVG, the shapes read from the user's SVG sorted into engrave
// lines / pockets / cut-throughs, the checks, and their toolpaths. Everything in the plate's own frame - the strut
// generator's 2D (x along the plate from its left end as you face the machine, y up, 0..67.5 plus the wings), z = 0 at
// the plate's front face, negative = into it. That face is the stock's top when the strut job cuts it (strut_cam.js
// lays the plates turned, not mirrored), so the design is drawn as seen from the front and is never mirrored.
// The template's SVG user units are mm with y down: plate (x, y) = svg (x, -y). Reading the SVG (layers, transforms,
// curves) needs a DOM and lives in the page; this file is plain JS (tests/test_plate_design.js).
// Needs strut_plate.js (StrutPlate) and polygon-clipping, as strut_cam.js.
(function (root) {
  "use strict";
  const SP = typeof module !== "undefined" && module.exports ? require("./strut_plate.js") : root.StrutPlate;

  const DEFAULTS = {
    engraveDepth: 0.5,   // mm, V-bit
    angle: 90,           // V-bit included angle (60 / 90)
    vbitD: 6.35,         // V-bit diameter (the simulator's tool; engraving never gets near it)
    pocketDepth: 1.5,    // mm, unless the layer's name says ("Pocket 2mm")
    stepover: 0.4,       // pockets, of the bit
    edge: 2,             // keep-out: mm from the plate's edge
    hole: 6,             // keep-out: mm round a bolt hole's centre (the button head + a little)
    throughTabs: 2,      // tabs on a cut-through longer than tabMin
    tabMin: 80,
  };
  const LAYERS = ["Engrave", "Pocket", "Cut through"];

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len = (a) => Math.hypot(a[0], a[1]);
  const area = (ring) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  function segDist(p, a, b) {
    const ab = sub(b, a), L2 = dot(ab, ab), t = L2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
    return len(sub(p, add(a, mul(ab, t))));
  }
  function inRings(p, rings) {                       // even-odd
    let inside = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const ringSegs = (rings) => rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]]));

  // ---- the front plate (strut generator, plate frame): outline rings + the bolt holes' centres ----
  function plate(pc, strut, o = {}) {
    const q = SP.plates(pc, strut, { nbraces: o.nbraces || 0, wing: o.wing ?? 11.5, dogbones: o.dogbones ?? 3.5, bottom: false, layout: false });
    if (q.front.length !== 1) throw new Error(`front plate is ${q.front.length} pieces`);
    const rings = q.front[0].map((r) => r.slice(0, -1));
    const holes = rings.slice(1).map((h) => mul(h.reduce((s, p) => add(s, p), [0, 0]), 1 / h.length));
    const all = rings[0], xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    return { rings, holes, length: strut, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  }

  // ---- the template: an Inkscape-friendly SVG sized for this plate (its length in a <desc>, so a design made for
  // another length is caught) ----
  function template(pc, strut, o = {}) {
    const P = plate(pc, strut, o), k = Object.assign({}, DEFAULTS, o), pad = 10;
    const [x0, y0, x1, y1] = P.box, vb = [x0 - pad, -(y1 + pad), x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
    const f = (v) => String(+v.toFixed(3));
    const path = (rings) => rings.map((r) => "M" + r.map(([x, y]) => `${f(x)},${f(-y)}`).join("L") + "Z").join("");
    const circ = (c, r, attrs) => `<circle cx="${f(c[0])}" cy="${f(-c[1])}" r="${f(r)}" ${attrs}/>`;
    const layer = (label, body, extra = "") => `  <g inkscape:groupmode="layer" inkscape:label="${label}" id="layer-${label.replace(/\W+/g, "-").toLowerCase()}"${extra}>\n${body}  </g>\n`;
    const guide = `    <path d="${path(P.rings)}" fill="#e8e1d4" fill-rule="evenodd" stroke="#7a6a55" stroke-width="0.3"/>\n` +
      P.holes.map((c) => "    " + circ(c, k.hole, 'fill="#d9534f" fill-opacity="0.25" stroke="none"')).join("\n") + "\n" +
      `    <path d="${path(P.rings)}" fill="none" stroke="#d9534f" stroke-opacity="0.35" stroke-width="${f(2 * k.edge)}"/>\n`;
    const ex = (sub, body) => layer(sub, body);
    const cx = (x0 + x1) / 2, cy = 33.75;
    const example =
      ex("Engrave", `    <path d="M${f(cx - 120)},${f(-(cy + 18))}H${f(cx + 120)}M${f(cx - 120)},${f(-(cy - 18))}H${f(cx + 120)}" fill="none" stroke="#000" stroke-width="0.5"/>\n`) +
      ex("Pocket", `    <rect x="${f(cx - 60)}" y="${f(-(cy + 10))}" width="120" height="20" rx="4" fill="none" stroke="#0060ff" stroke-width="0.5"/>\n`) +
      ex("Cut through", `    <circle cx="${f(cx - 95)}" cy="${f(-cy)}" r="7" fill="none" stroke="#e00000" stroke-width="0.5"/>\n` +
        `    <circle cx="${f(cx + 95)}" cy="${f(-cy)}" r="7" fill="none" stroke="#e00000" stroke-width="0.5"/>\n`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="${f(vb[2])}mm" height="${f(vb[3])}mm" viewBox="${vb.map(f).join(" ")}">\n` +
      `  <desc id="lr4-plate">LR4 front strut plate ${P.length.toFixed(1)} mm</desc>\n` +
      `  <title>LowRider 4 front plate design (${P.length.toFixed(1)} mm)</title>\n` +
      layer("Plate (guide)", guide, ' sodipodi:insensitive="true"') +
      layer("Engrave", "") + layer("Pocket", "") + layer("Cut through", "") +
      layer("Notes", `    <text x="${f(x0)}" y="${f(-(y1 + 4))}" font-size="4" fill="#666">Seen from the front. Engrave: V-bit lines. Pocket / Cut through: closed shapes. Stay off the red areas. Text: Path &gt; Object to Path.</text>\n`) +
      layer("Example", example, ' style="display:none"') +
      `</svg>\n`;
  }
  const lengthOf = (svgText) => { const m = /LR4 front strut plate ([\d.]+) mm/.exec(svgText || ""); return m ? +m[1] : null; };

  // ---- shapes -> the design: items = [{ kind: "engrave" | "pocket" | "through", depth (mm, from the layer name, or
  // null), el (which SVG element: its rings form one shape), closed, pts: [[x, y] svg mm] }] ----
  function design(items) {
    const out = { engrave: [], pockets: [], through: [], open: { pocket: 0, through: 0 } };
    const toPlate = (pts) => pts.map(([x, y]) => [x, -y]);
    const byEl = new Map();
    for (const it of items) {
      const pts = toPlate(it.pts);
      if (it.kind === "engrave") { if (pts.length > 1) out.engrave.push(pts); continue; }
      if (!it.closed) { out.open[it.kind]++; continue; }
      const key = `${it.kind}|${it.el}`;
      if (!byEl.has(key)) byEl.set(key, { kind: it.kind, depth: it.depth, rings: [] });
      byEl.get(key).rings.push(pts);
    }
    for (const s of byEl.values()) (s.kind === "pocket" ? out.pockets : out.through).push({ rings: s.rings, depth: s.depth });
    return out;
  }

  // ---- checks: [{ level: "error" | "warn", text }] - errors keep the design off the plate and out of the job ----
  function check(D, P, o = {}) {
    const k = Object.assign({}, DEFAULTS, o), out = [], bit = o.bit || 3.175;
    const n = D.engrave.length + D.pockets.length + D.through.length;
    if (D.text) out.push({ level: "error", text: `${D.text} text object${D.text > 1 ? "s" : ""} not turned into paths (Inkscape: Path > Object to Path).` });
    if (!n) out.push({ level: "error", text: "Nothing on the Engrave, Pocket or Cut through layers." });
    for (const kind of ["pocket", "through"]) if (D.open[kind])
      out.push({ level: "error", text: `${D.open[kind]} open shape${D.open[kind] > 1 ? "s" : ""} on ${kind === "pocket" ? "Pocket" : "Cut through"}: close ${D.open[kind] > 1 ? "them" : "it"}.` });
    const plateSegs = ringSegs(P.rings), bad = { edge: 0, hole: 0 };
    const test = (p) => {
      if (P.holes.some((c) => len(sub(p, c)) < k.hole)) bad.hole++;
      else if (!inRings(p, P.rings) || plateSegs.some(([a, b]) => segDist(p, a, b) < k.edge)) bad.edge++;
    };
    const dense = (pts, closed) => {                  // vertices + points every mm along each segment
      const m = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], s = Math.max(1, Math.ceil(len(sub(b, a))));
        for (let j = 0; j < s; j++) test(add(a, mul(sub(b, a), j / s)));
      }
      if (!closed) test(pts[pts.length - 1]);
    };
    D.engrave.forEach((l) => dense(l, false));
    for (const s of [...D.pockets, ...D.through]) s.rings.forEach((r) => dense(r, true));
    if (bad.hole) out.push({ level: "error", text: "Shapes over the bolt holes / screw heads (the red circles)." });
    if (bad.edge) out.push({ level: "error", text: `Shapes off the plate or within ${k.edge} mm of its edge.` });
    if (D.ignored) out.push({ level: "warn", text: `${D.ignored} shape${D.ignored > 1 ? "s" : ""} on other layers ignored (only Engrave, Pocket and Cut through are cut).` });
    const narrow = D.pockets.filter((s) => !pocketLines(s.rings, bit / 2, bit * k.stepover).length).length;
    if (narrow) out.push({ level: "error", text: `${narrow} pocket${narrow > 1 ? "s" : ""} narrower than the ${bit === 3.175 ? '1/8"' : bit + " mm"} bit.` });
    const small = D.through.filter((s) => !s.rings.some((r) => outerOf(r, s.rings) && offsetPath(r, bit / 2, true))).length;
    if (small) out.push({ level: "error", text: `${small} cut-through shape${small > 1 ? "s" : ""} too small or too intricate for the bit.` });
    const islands = D.through.reduce((s, sh) => s + sh.rings.filter((r) => !outerOf(r, sh.rings)).length, 0);
    if (islands) out.push({ level: "warn", text: `${islands} shape${islands > 1 ? "s" : ""} inside cut-throughs (the middle of an O) will fall out with them.` });
    return out;
  }
  const outerOf = (r, rings) => rings.filter((q) => q !== r && inRings(r[0], [q])).length % 2 === 0;

  // ---- offsets: a ring pushed in (inward) or out by r, as lines + arcs (corners the offset goes round become arcs,
  // the others meet; edges it swallows are dropped) - strut_cam's offsetRing, both ways. null = it collapsed or
  // crossed itself (checked: every point at least r from the ring). ----
  function offsetPath(ring, r, inward) {
    const s = inward ? -1 : 1;
    let pts = ring.filter((p, i) => len(sub(p, ring[(i + 1) % ring.length])) > 1e-9);
    if (pts.length < 3) return null;
    if (area(pts) * s < 0) pts = pts.reverse();
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const edges = pts.map((p, i) => { const q = pts[(i + 1) % pts.length], d = mul(sub(q, p), 1 / len(sub(q, p))); return { p0: p, p1: q, d, n: [d[1], -d[0]] }; });
    const meet = (A, B) => {
      const c = cross(A.d, B.d);
      if (Math.abs(c) < 1e-12) return null;
      const a0 = add(A.p0, mul(A.n, r)), b0 = add(B.p0, mul(B.n, r));
      return add(a0, mul(A.d, cross(sub(b0, a0), B.d) / c));
    };
    for (let guard = 0; guard < 5000 && edges.length >= 3; guard++) {
      const m = edges.length, ends = [];
      for (let k = 0; k < m; k++) {
        const A = edges[(k - 1 + m) % m], B = edges[k], c = cross(A.d, B.d), corner = len(sub(A.p1, B.p0)) < 1e-9;   // the offset is on the right: a left turn goes round an arc
        if (corner && c > 1e-9 && dot(A.d, B.d) < Math.cos(0.2 * Math.PI / 180)) ends.push({ arc: true, at: A.p1 });
        else if (corner && c > -1e-9) ends.push({ arc: false, pt: add(A.p1, mul(A.n, r)), pt2: add(B.p0, mul(B.n, r)) });
        else { const p = meet(A, B); ends.push({ arc: false, pt: p, pt2: p }); }
      }
      let bad = -1;
      for (let k = 0; k < m; k++) {
        const E = edges[k], st = ends[k], en = ends[(k + 1) % m];
        const a = st.arc ? add(E.p0, mul(E.n, r)) : st.pt2, b = en.arc ? add(E.p1, mul(E.n, r)) : en.pt;
        if (!a || !b || dot(sub(b, a), E.d) <= 1e-9) { bad = k; break; }
        E.a = a; E.b = b;
      }
      if (bad >= 0) { edges.splice(bad, 1); continue; }
      const out = [];
      for (let k = 0; k < m; k++) {
        const E = edges[k], en = ends[(k + 1) % m], N = edges[(k + 1) % m];
        out.push({ type: "line", a: E.a, b: E.b });
        if (en.arc) out.push({ type: "arc", a: E.b, b: N.a, c: en.at, ccw: true });
        else if (len(sub(E.b, N.a)) > 1e-9) out.push({ type: "line", a: E.b, b: N.a });
      }
      // every element at least r - a hair from the ring (its ends and middles): else the offset crossed itself
      const segs = ringSegs([ring]), far = (p) => segs.every(([a, b]) => segDist(p, a, b) >= r - 1e-3);
      for (const el of out) {
        const mid = el.type === "line" ? mul(add(el.a, el.b), 0.5) : arcMid(el);
        if (!far(el.a) || !far(mid)) return null;
      }
      return out;
    }
    return null;
  }
  function arcSweep(el) {
    const a0 = Math.atan2(el.a[1] - el.c[1], el.a[0] - el.c[0]), a1 = Math.atan2(el.b[1] - el.c[1], el.b[0] - el.c[0]);
    let s = el.ccw ? a1 - a0 : a0 - a1;
    while (s <= 1e-12) s += 2 * Math.PI;
    return s;
  }
  function arcMid(el) {
    const r = len(sub(el.a, el.c)), a0 = Math.atan2(el.a[1] - el.c[1], el.a[0] - el.c[0]), m = a0 + (el.ccw ? 1 : -1) * arcSweep(el) / 2;
    return [el.c[0] + r * Math.cos(m), el.c[1] + r * Math.sin(m)];
  }
  const elLen = (el) => el.type === "line" ? len(sub(el.b, el.a)) : len(sub(el.a, el.c)) * arcSweep(el);
  const reverse = (els) => els.slice().reverse().map((el) => Object.assign({}, el, { a: el.b, b: el.a, ccw: el.type === "arc" ? !el.ccw : undefined }));

  // ---- pockets: zigzag lines along X where the bit fits (inside the shape, even-odd, and at least r from every edge:
  // per line, exactly), then each ring's offset as a finishing pass ----
  function pocketLines(rings, r, step) {
    const segs = ringSegs(rings), ys = rings.flat().map((p) => p[1]), y0 = Math.min(...ys) + r, y1 = Math.max(...ys) - r;
    if (!(y1 >= y0 - 1e-9)) return [];
    const n = Math.max(1, Math.ceil((y1 - y0) / step)), lines = [];
    for (let k = 0; k <= n; k++) {
      const y = n ? y0 + (y1 - y0) * k / n : y0, xs = [];
      for (const [a, b] of segs) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      xs.sort((a, b) => a - b);
      let ins = [];
      for (let i = 0; i + 1 < xs.length; i += 2) ins.push([xs[i], xs[i + 1]]);
      const no = segs.map(([a, b]) => capsuleX(a, b, r, y)).filter(Boolean);
      for (const [lo, hi] of no) ins = ins.flatMap(([u, v]) => (hi <= u || lo >= v) ? [[u, v]] : [[u, lo], [hi, v]].filter(([p, q]) => q - p > 1e-6));
      for (const [u, v] of ins) lines.push({ y, x0: u, x1: v });
    }
    return lines;
  }
  function capsuleX(a, b, r, y) {                    // x where (x, y) is within r of segment ab: [lo, hi] or null
    const iv = [];
    for (const c of [a, b]) { const dy = y - c[1]; if (Math.abs(dy) < r) { const w = Math.sqrt(r * r - dy * dy); iv.push([c[0] - w, c[0] + w]); } }
    const d = sub(b, a), L = len(d);
    if (L > 1e-12) {
      const u = mul(d, 1 / L), nrm = [-u[1], u[0]];
      // |nrm . (X - a)| <= r and 0 <= u . (X - a) <= L, X = (x, y): both linear in x
      const lin = (v, c0, lo, hi) => {                // lo <= v * x + c0 <= hi -> [x0, x1] or null
        if (Math.abs(v) < 1e-12) return c0 >= lo && c0 <= hi ? [-Infinity, Infinity] : null;
        const p = (lo - c0) / v, q = (hi - c0) / v;
        return [Math.min(p, q), Math.max(p, q)];
      };
      const A = lin(nrm[0], nrm[1] * (y - a[1]) - nrm[0] * a[0], -r, r), B = lin(u[0], u[1] * (y - a[1]) - u[0] * a[0], 0, L);
      if (A && B) { const lo = Math.max(A[0], B[0]), hi = Math.min(A[1], B[1]); if (hi > lo) iv.push([lo, hi]); }
    }
    if (!iv.length) return null;
    return [Math.min(...iv.map((v) => v[0])), Math.max(...iv.map((v) => v[1]))];
  }

  // ---- the toolpaths (plate frame): moves {g, x, y, z, i, j, f: "feed" | "plunge"} as strut_cam's ----
  function passes(depth, step) {
    const out = [];
    for (let z = -step; z > -depth + 1e-6; z -= step) out.push(z);
    out.push(-depth);
    return out;
  }
  function elMoves(els, z, mv) {                     // one pass round a loop of lines / arcs at z
    for (const el of els) {
      if (el.type === "arc") mv.push({ g: el.ccw ? 3 : 2, x: el.b[0], y: el.b[1], i: el.c[0] - el.a[0], j: el.c[1] - el.a[1], f: "feed" });
      else mv.push({ g: 1, x: el.b[0], y: el.b[1], z, f: "feed" });
    }
  }
  function toolpaths(D, o) {
    const k = Object.assign({}, DEFAULTS, o), r = o.bit / 2, mv = (n) => ({ name: n, moves: [] });
    // engraving (T2): nearest line next, either way round (closed: from its nearest point)
    const eng = mv("Front plate engraving"), left = D.engrave.map((l) => l.slice());
    let at = [0, 0];
    while (left.length) {
      let best = null;
      left.forEach((l, i) => {
        const closed = len(sub(l[0], l[l.length - 1])) < 1e-6;
        if (closed) l.forEach((p, j) => { const d = len(sub(p, at)); if (!best || d < best.d) best = { i, d, rot: j }; });
        else for (const [j, rev] of [[0, false], [l.length - 1, true]]) { const d = len(sub(l[j], at)); if (!best || d < best.d) best = { i, d, rev }; }
      });
      let l = left.splice(best.i, 1)[0];
      if (best.rev) l = l.reverse();
      if (best.rot !== undefined) l = [...l.slice(best.rot, -1), ...l.slice(0, best.rot), l[best.rot]];
      eng.moves.push({ g: 0, z: k.clear }, { g: 0, x: l[0][0], y: l[0][1] }, { g: 0, z: k.safe });
      for (const z of passes(k.engraveDepth, k.step)) {
        eng.moves.push({ g: 1, z, f: "plunge" });
        for (let i = 1; i < l.length; i++) eng.moves.push({ g: 1, x: l[i][0], y: l[i][1], z, f: "feed" });
        if (z !== -k.engraveDepth) eng.moves.push({ g: 0, z: k.safe }, { g: 0, x: l[0][0], y: l[0][1] });   // back for the next pass
      }
      eng.moves.push({ g: 0, z: k.clear });
      at = l[l.length - 1];
    }
    // pockets (T1): per pass, the zigzag (pen down while the link between lines stays where the bit fits), then the walls
    const pk = mv("Front plate pockets");
    for (const s of D.pockets) {
      const depth = s.depth > 0 ? s.depth : k.pocketDepth, lines = pocketLines(s.rings, r, o.bit * k.stepover);
      if (!lines.length) continue;
      const segs = ringSegs(s.rings), fits = (p) => inRings(p, s.rings) && segs.every(([a, b]) => segDist(p, a, b) >= r - 1e-6);
      const walls = s.rings.map((ring) => { const p = offsetPath(ring, r, outerOf(ring, s.rings)); return p && reverse(p); }).filter(Boolean);
      for (const z of passes(depth, k.step)) {
        let pen = null, flip = false, lastY = null;
        for (const L of lines) {
          if (L.y !== lastY) { flip = !flip; lastY = L.y; }
          const a = flip ? [L.x0, L.y] : [L.x1, L.y], b = flip ? [L.x1, L.y] : [L.x0, L.y];
          const link = pen && [0.25, 0.5, 0.75].every((t) => fits(add(pen, mul(sub(a, pen), t)))) && fits(a) && len(sub(a, pen)) < 3 * o.bit;
          if (link) pk.moves.push({ g: 1, x: a[0], y: a[1], z, f: "feed" });
          else {
            if (pen) pk.moves.push({ g: 0, z: k.safe });
            pk.moves.push({ g: 0, z: k.clear }, { g: 0, x: a[0], y: a[1] }, { g: 0, z: k.safe }, { g: 1, z, f: "plunge" });
          }
          pk.moves.push({ g: 1, x: b[0], y: b[1], z, f: "feed" });
          pen = b;
        }
        for (const w of walls) {
          pk.moves.push({ g: 0, z: k.clear }, { g: 0, x: w[0].a[0], y: w[0].a[1] }, { g: 0, z: k.safe }, { g: 1, z, f: "plunge" });
          elMoves(w, z, pk.moves);
          pen = null;
        }
        pk.moves.push({ g: 0, z: k.clear });
      }
    }
    // cut-throughs (T1): the outer rings' inside profiles to the strut job's depth, tabs on the long ones
    const th = mv("Front plate cut-throughs"), final = -(o.t + o.through);
    for (const s of D.through) for (const ring of s.rings.filter((q) => outerOf(q, s.rings))) {
      const p = offsetPath(ring, r, true);
      if (!p) continue;
      let els = reverse(p), k0 = 0;                   // climb, as the outlines; start on the longest straight
      els.forEach((el, i) => { if (el.type === "line" && elLen(el) > elLen(els[k0])) k0 = i; });
      els = els.slice(k0).concat(els.slice(0, k0));
      const total = els.reduce((t, el) => t + elLen(el), 0), tabs = total >= k.tabMin ? placeTabs(els, k.throughTabs, o) : [];
      const top = final + o.tabH;
      th.moves.push({ g: 0, z: k.clear }, { g: 0, x: els[0].a[0], y: els[0].a[1] }, { g: 0, z: k.safe });
      for (const z of passes(o.t + o.through, k.step)) {
        th.moves.push({ g: 1, z, f: "plunge" });
        els.forEach((el, i) => {
          if (el.type === "arc") { elMoves([el], z, th.moves); return; }
          const d = mul(sub(el.b, el.a), 1 / elLen(el)), pt = (q) => add(el.a, mul(d, q)), ramp = top - z;
          for (const t of z < top - 1e-6 ? tabs.filter((q) => q.k === i).sort((a, b) => a.off - b.off) : []) {
            const s0 = t.off - o.tabW / 2;
            for (const [q, zz, f] of [[s0 - ramp, z, "feed"], [s0, top, "feed"], [s0 + o.tabW, top, "feed"], [s0 + o.tabW + ramp, z, "plunge"]]) {
              const p2 = pt(q);
              th.moves.push({ g: 1, x: p2[0], y: p2[1], z: zz, f });
            }
          }
          th.moves.push({ g: 1, x: el.b[0], y: el.b[1], z, f: "feed" });
        });
      }
      th.moves.push({ g: 0, z: k.clear });
    }
    return { engrave: eng.moves.length ? eng : null, t1: [pk, th].filter((q) => q.moves.length) };
  }
  function placeTabs(els, n, o) {                    // strut_cam's: n tabs spread round, each on a long enough straight
    const half = o.tabW / 2 + o.tabH + 1, segs = [];
    let s = 0;
    els.forEach((el, k) => { const L = elLen(el); if (el.type === "line" && L >= 2 * half) segs.push({ k, s0: s, s1: s + L }); s += L; });
    const tabs = [];
    for (let i = 0; i < n; i++) {
      const target = s * (i + 0.5) / n;
      let best = null;
      for (const g of segs) {
        const c = Math.min(Math.max(target, g.s0 + half), g.s1 - half);
        if (tabs.some((t) => Math.abs(t.s - c) < 2 * half)) continue;
        if (!best || Math.abs(c - target) < Math.abs(best.s - target)) best = { s: c, k: g.k, off: c - g.s0 };
      }
      if (best) tabs.push(best);
    }
    return tabs;
  }

  // moves -> straight pieces (arcs in short chords) for the simulator: [[x0, y0, z0, x1, y1, z1]]
  function pieces(moves, from = [0, 0, 5]) {
    let [x, y, z] = from;
    const out = [];
    for (const m of moves) {
      const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
      if (m.g >= 2) {
        const c = [x + m.i, y + m.j], el = { a: [x, y], b: [nx, ny], c, ccw: m.g === 3 }, rad = len(sub(el.a, c)), sw = arcSweep(el);
        const n = Math.max(2, Math.ceil(sw * rad / 0.5)), a0 = Math.atan2(y - c[1], x - c[0]);
        let p = [x, y, z];
        for (let i = 1; i <= n; i++) {
          const a = a0 + (m.g === 3 ? 1 : -1) * sw * i / n, q = i === n ? [nx, ny, nz] : [c[0] + rad * Math.cos(a), c[1] + rad * Math.sin(a), z + (nz - z) * i / n];
          out.push([...p, ...q]); p = q;
        }
      } else out.push([x, y, z, nx, ny, nz]);
      [x, y, z] = [nx, ny, nz];
    }
    return out;
  }

  const api = { DEFAULTS, LAYERS, plate, template, lengthOf, design, check, offsetPath, pocketLines, toolpaths, pieces, inRings };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlateDesign = api;
})(typeof self !== "undefined" ? self : this);
