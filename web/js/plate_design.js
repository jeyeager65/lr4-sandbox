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
  // polygon-clipping: the page's global; node passes it as toolpaths' opts.pc (as strut_plate's functions take it)

  const DEFAULTS = {
    engraveDepth: 0.5,   // mm, V-bit
    angle: 90,           // V-bit included angle (60 / 90)
    vbitD: 6.35,         // V-bit diameter (the simulator's tool; engraving never gets near it)
    pocketDepth: 1.5,    // mm, unless the layer's name says ("Pocket 2mm")
    pocketBit: 3.175,    // 3.175 = the strut job's 1/8" only; 1.5875 = then a 1/16" (T3) cleans up what the 1/8" left
    detailStep: 0.75, detailFeed: 10, detailPlunge: 2,   // the 1/16": depth per pass (mm), feeds (mm/s)
    stepover: 0.4,       // pockets, of the bit
    edge: 2,             // keep-out: mm from the plate's edge
    hole: 6,             // keep-out: mm round a bolt hole's centre (the button head + a little)
    throughTabs: 2,      // tabs on a cut-through longer than tabMin
    belt: null,          // [y0, y1]: the X belt's band across the plate, in front of it (the page measures it)
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
    const belt = k.belt ? `    <rect x="${f(x0)}" y="${f(-k.belt[1])}" width="${f(x1 - x0)}" height="${f(k.belt[1] - k.belt[0])}" fill="#555" fill-opacity="0.35"/>\n` +
      `    <text x="${f(x0 + 40)}" y="${f(-(k.belt[0] + k.belt[1]) / 2 + 1.2)}" font-size="3.5" fill="#333">X belt in front: hidden once installed</text>\n` : "";
    const guide = `    <path d="${path(P.rings)}" fill="#e8e1d4" fill-rule="evenodd" stroke="#7a6a55" stroke-width="0.3"/>\n` + belt +
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
    if (k.belt) {                                    // behind the belt: allowed, but you won't see it
      const hit = (pts) => pts.some((p) => p[1] > k.belt[0] && p[1] < k.belt[1]);
      const n2 = D.engrave.filter(hit).length + [...D.pockets, ...D.through].filter((s) => s.rings.some(hit)).length;
      if (n2) out.push({ level: "warn", text: `${n2} shape${n2 > 1 ? "s" : ""} partly behind the X belt (the gray band): cut, but hidden once installed.` });
    }
    if (bad.hole) out.push({ level: "error", text: "Shapes over the bolt holes / screw heads (the red circles)." });
    if (bad.edge) out.push({ level: "error", text: `Shapes off the plate or within ${k.edge} mm of its edge.` });
    if (D.ignored) out.push({ level: "warn", text: `${D.ignored} shape${D.ignored > 1 ? "s" : ""} on other layers ignored (only Engrave, Pocket and Cut through are cut).` });
    const pb = Math.min(bit, k.pocketBit || bit), bitName = (d) => (Math.abs(d - 3.175) < 1e-3 ? '1/8"' : Math.abs(d - 1.5875) < 1e-3 ? '1/16"' : d + " mm");
    const narrow = D.pockets.filter((s) => !pocketLines(s.rings, pb / 2, pb * k.stepover).length).length;
    if (narrow) out.push({ level: "error", text: `${narrow} pocket${narrow > 1 ? "s" : ""} narrower than the ${bitName(pb)} bit` +
      (pb > 1.6 ? ' (the 1/16" clean-up may reach them).' : ".") });
    const pcl = o.pc || root.polygonClipping;
    const small = D.through.filter((s) => !s.rings.some((r) => outerOf(r, s.rings) && (offsetPath(r, bit / 2, true) || (pcl && eroded([r], bit / 2, pcl).length)))).length;
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
    // pockets (T1): each with the 1/8" - per pass, the zigzag (pen down while the link between lines stays where the bit
    // fits), then the walls. With the 1/16" clean-up (T3): the same with the 1/16", but only where it reaches material the
    // 1/8" left (rest machining: narrow strokes, inside corners) - full depth there, so it can run before the 1/8".
    const cleanup = (k.pocketBit || o.bit) < o.bit - 1e-9, r2 = (k.pocketBit || o.bit) / 2, pc = o.pc || root.polygonClipping;
    const pk = mv("Front plate pockets"), cu = mv("Front plate pocket clean-up");
    for (const s of D.pockets) {
      const depth = s.depth > 0 ? s.depth : k.pocketDepth, rough = pocketOp(s, r, o.bit * k.stepover, null, pc);
      pocketMoves(pk.moves, rough, passes(depth, k.step), k);
      if (!cleanup) continue;
      const need = restNeed(s.rings, r, rough, r2);
      if (!need) continue;
      pocketMoves(cu.moves, pocketOp(s, r2, 2 * r2 * k.stepover, need, pc), passes(depth, k.detailStep), k);
    }
    // cut-throughs (T1): the outer rings' inside profiles to the strut job's depth, tabs on the long ones
    const th = mv("Front plate cut-throughs"), final = -(o.t + o.through);   // (pc from the pockets above)
    for (const s of D.through) for (const ring of s.rings.filter((q) => outerOf(q, s.rings))) {
      const p = offsetPath(ring, r, true) || (() => {   // else: the eroded boundary, as lines (the biggest loop)
        const w = wallRings([ring], r, pc).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
        if (!w) return null;
        const q = area(w) < 0 ? w.slice(0, -1) : w.slice(0, -1).reverse();   // clockwise, as offsetPath's inward
        return q.map((a, i) => ({ type: "line", a, b: q[(i + 1) % q.length] }));
      })();
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
    return { engrave: eng.moves.length ? eng : null, t1: [pk, th].filter((q) => q.moves.length),
      t3: cu.moves.length ? [cu] : [], detail: cu.moves.length ? { d: 2 * r2, feed: k.detailFeed, plunge: k.detailPlunge } : null };
  }
  // a pocket's paths for a bit of radius rad: runs [{ pts, closed }] - the zigzag lines, then the walls (offset rings).
  // keep(p) (or null = all): only the stretches where the bit does something (sampled every 0.1 mm)
  function pocketOp(s, rad, step, keep, pc) {
    const lines = pocketLines(s.rings, rad, step), runs = [], segs = ringSegs(s.rings);
    const fits = (p) => inRings(p, s.rings) && segs.every(([a, b]) => segDist(p, a, b) >= rad - 1e-6);
    const split = (pts) => {                          // a polyline -> the runs keep() wants
      if (!keep) return [pts];
      const out = [];
      let cur = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(len(sub(b, a)) / 0.1));
        for (let j = 0; j <= n; j++) {
          if (i && !j) continue;
          const p = add(a, mul(sub(b, a), j / n));
          if (keep(p)) { if (!cur) out.push(cur = []); cur.push(p); } else cur = null;
        }
      }
      return out.filter((r) => r.length > 1).map((r) => r.filter((p, i) => i === 0 || i === r.length - 1 || (i % 5 === 0)));
    };
    let flip = false, lastY = null;
    for (const L of lines) {
      if (L.y !== lastY) { flip = !flip; lastY = L.y; }
      for (const pts of split(flip ? [[L.x0, L.y], [L.x1, L.y]] : [[L.x1, L.y], [L.x0, L.y]])) runs.push({ pts, line: true });
    }
    for (const pts of wallRings(s.rings, rad, pc)) for (const p of split(pts)) runs.push({ pts: p });
    return { runs, fits, rad };
  }
  // the walls: the boundary of where the bit's centre may go - the shape (even-odd) less a band of the bit's radius
  // round every edge (rectangles + 24-gons: within 0.015 mm of round), exactly; loops split where the shape narrows.
  // Each a closed polyline.
  function eroded(rings, rad, pc) {
    // coordinates snapped to 0.0001 mm and the band taken off in batches (polygon-clipping can lose a segment when many
    // near-coincident edges meet: "Unable to find segment ... in SweepLine tree"); a failed batch is retried smaller
    const snap = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
    const close = (r) => { const q = r.map(snap); return [...q, q[0]]; };
    let region = pc.xor(...rings.map((r) => [[close(r)]]));
    const band = [];
    for (const [a, b] of ringSegs(rings)) {
      const d = sub(b, a), L = len(d);
      if (L < 1e-9) continue;
      const n = mul([-d[1], d[0]], rad / L);
      band.push([[close([add(a, n), add(b, n), sub(b, n), sub(a, n)])]]);
      band.push([[close(Array.from({ length: 24 }, (_, i) => [a[0] + rad / Math.cos(Math.PI / 24) * Math.cos(Math.PI * i / 12), a[1] + rad / Math.cos(Math.PI / 24) * Math.sin(Math.PI * i / 12)]))]]);
    }
    const take = (from, list) => {
      try { return pc.difference(from, ...list); }
      catch (e) {
        if (list.length === 1) throw e;
        const h = Math.ceil(list.length / 2);
        return take(take(from, list.slice(0, h)), list.slice(h));
      }
    };
    for (let i = 0; i < band.length && region.length; i += 50) region = take(region, band.slice(i, i + 50));
    return region;
  }
  const wallRings = (rings, rad, pc) => eroded(rings, rad, pc).flatMap((poly) => poly.map((r) => r.slice()));
  // runs -> moves, every pass: pen down from one run to the next while the link stays where the bit fits
  function pocketMoves(mv, op, zs, k) {
    if (!op.runs.length) return;
    for (const z of zs) {
      let pen = null;
      for (const r of op.runs) {
        const a = r.els ? r.els[0].a : r.pts[0];
        const link = pen && r.line && [0.25, 0.5, 0.75].every((t) => op.fits(add(pen, mul(sub(a, pen), t)))) && op.fits(a) && len(sub(a, pen)) < 6 * op.rad;
        if (link) mv.push({ g: 1, x: a[0], y: a[1], z, f: "feed" });
        else {
          if (pen) mv.push({ g: 0, z: k.safe });
          mv.push({ g: 0, z: k.clear }, { g: 0, x: a[0], y: a[1] }, { g: 0, z: k.safe }, { g: 1, z, f: "plunge" });
        }
        if (r.els) elMoves(r.els, z, mv);
        else for (let i = 1; i < r.pts.length; i++) mv.push({ g: 1, x: r.pts[i][0], y: r.pts[i][1], z, f: "feed" });
        pen = r.els ? r.els[r.els.length - 1].b : r.pts[r.pts.length - 1];
      }
      mv.push({ g: 0, z: k.clear });
    }
  }
  // what the 1/8" leaves in a pocket: a 0.1 mm grid of the shape, less every cell within its radius of its paths; then
  // grown by the 1/16"'s radius -> need(p): the 1/16" at p would cut some of it. null = nothing left.
  function restNeed(rings, r1, rough, r2) {
    const h = 0.1, all = rings.flat(), x0 = Math.min(...all.map((p) => p[0])) - h, y0 = Math.min(...all.map((p) => p[1])) - h;
    const nx = Math.ceil((Math.max(...all.map((p) => p[0])) + h - x0) / h), ny = Math.ceil((Math.max(...all.map((p) => p[1])) + h - y0) / h);
    const left = new Uint8Array(nx * ny), segs = ringSegs(rings);
    for (let j = 0; j < ny; j++) {                    // inside (even-odd, per row)
      const y = y0 + (j + 0.5) * h, xs = [];
      for (const [a, b] of segs) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2)
        for (let i = Math.max(0, Math.ceil((xs[n] - x0) / h - 0.5)); i <= Math.min(nx - 1, Math.floor((xs[n + 1] - x0) / h - 0.5)); i++) left[j * nx + i] = 1;
    }
    const cover = (a, b, rr) => {                     // cells within rr of segment ab: no longer left
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - rr - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + rr - x0) / h));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - rr - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + rr - y0) / h));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        if (left[j * nx + i] && segDist([x0 + (i + 0.5) * h, y0 + (j + 0.5) * h], a, b) <= rr) left[j * nx + i] = 0;
    };
    for (const run of rough.runs) {
      const pts = run.pts || [run.els[0].a, ...run.els.flatMap((el) => el.type === "line" ? [el.b] : [arcMid(el), el.b])];
      for (let i = 0; i + 1 < pts.length; i++) cover(pts[i], pts[i + 1], r1 + 0.05);
      if (run.els) for (const el of run.els) if (el.type === "arc") {   // an arc's chords cut inside it: sweep it finer
        const rr = len(sub(el.a, el.c)), sw = arcSweep(el), a0 = Math.atan2(el.a[1] - el.c[1], el.a[0] - el.c[0]), n = Math.max(2, Math.ceil(rr * sw / 0.1));
        let p = el.a;
        for (let i = 1; i <= n; i++) { const t = a0 + (el.ccw ? 1 : -1) * sw * i / n, q = [el.c[0] + rr * Math.cos(t), el.c[1] + rr * Math.sin(t)]; cover(p, q, r1 + 0.05); p = q; }
      }
    }
    // specks: a cell left only if a neighbour is too (a lone cell = the grid, not material)
    const need = new Uint8Array(nx * ny), g = Math.ceil((r2 + h) / h);
    let any = false;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const c = j * nx + i;
      if (!left[c] || !(left[c - 1] || left[c + 1] || left[c - nx] || left[c + nx])) continue;
      any = true;
      for (let dj = -g; dj <= g; dj++) for (let di = -g; di <= g; di++) {
        const jj = j + dj, ii = i + di;
        if (jj >= 0 && jj < ny && ii >= 0 && ii < nx && (di * di + dj * dj) * h * h <= (r2 + h) * (r2 + h)) need[jj * nx + ii] = 1;
      }
    }
    if (!any) return null;
    return (p) => { const i = Math.floor((p[0] - x0) / h), j = Math.floor((p[1] - y0) / h); return i >= 0 && j >= 0 && i < nx && j < ny && !!need[j * nx + i]; };
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
