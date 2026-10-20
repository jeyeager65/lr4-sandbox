// LR4 strut plates - a JS port of Vector76's generator (his SCAD, not shipped; twin of freecad/strut_plate.py).
// Same shapes, same polygon circles ($fn 36 holes, 30 dogbones) so the outlines match the
// SCAD's DXF vertex for vertex (tests/test_strut_plate.js checks it against OpenSCAD).
// Needs a polygon boolean lib: polygon-clipping (global `polygonClipping` in the page, require() in node).
(function (root) {
  "use strict";
  const H = 67.5;            // plate height (SCAD y)
  const MARGIN = 0.25;       // SCAD `margin`

  function braces(xlen, nbraces) {
    const n = nbraces || Math.floor((xlen - 18) / (165 + 18)) + 1;
    const pitch = (xlen - 18) / (n - 1);
    return { n, pitch, spaceBetween: pitch - 18 };
  }

  const rect = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];

  // OpenSCAD circle(d, $fn): vertex i at angle 360 * i / fn. `pre` shifts it before turning it
  // `rot` degrees about the origin, `post` shifts it after (= tx(post) rz(rot) tx(pre) circle()).
  function circle(d, fn, pre, rot, post) {
    const r = d / 2, a = (rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const ring = [];
    for (let i = 0; i < fn; i++) {
      const t = 2 * Math.PI * i / fn;
      const x = r * Math.cos(t) + (pre ? pre[0] : 0), y = r * Math.sin(t) + (pre ? pre[1] : 0);
      ring.push([c * x - s * y + (post ? post[0] : 0), s * x + c * y + (post ? post[1] : 0)]);
    }
    ring.push(ring[0].slice());
    return [ring];
  }

  // One plate as a polygon-clipping MultiPolygon, SCAD coordinates (x along the strut, y 0..67.5).
  // bottom: the bottom plate (no notches). extra: wing size (front: front_wing_size, bottom: 5.5).
  function plate(pc, xlen, opts) {
    const o = Object.assign({ nbraces: 0, bottom: false, extra: 8, dogbones: 3.5 }, opts);
    const { n, pitch } = braces(xlen, o.nbraces);
    const add = [rect(MARGIN, 0, xlen - 2 * MARGIN, H)];
    for (let i = 0; i <= n - 2; i++)
      add.push(rect(18 + MARGIN + i * pitch, -o.extra, pitch - 18 - 2 * MARGIN, H + 2 * o.extra));
    const cut = [];
    for (const y of [5.75, H - 5.75])
      for (let i = 0; i < n; i++) cut.push(circle(5.3, 36, null, 0, [i * pitch + 9, y]));
    if (!o.bottom) {
      cut.push(rect(0, 30.49, 5.25, 12));
      cut.push(rect(xlen - 35.25, 10.85, 35, 19.1));     // right side large notch
    }
    const d = o.dogbones;
    if (d > 0) {
      const w = pitch - 18 - 2 * MARGIN;
      for (let i = 0; i <= n - 2; i++) {
        const x0 = 18 + MARGIN + i * pitch;
        cut.push(circle(d, 30, [-d / 2, 0], 45, [x0, 0]));
        cut.push(circle(d, 30, [-d / 2, 0], -45, [x0, H]));
        cut.push(circle(d, 30, [d / 2, 0], -45, [x0 + w, 0]));
        cut.push(circle(d, 30, [d / 2, 0], 45, [x0 + w, H]));
      }
    }
    return pc.difference(pc.union(...add), ...cut);
  }

  // Both plates, as the SCAD's plates_2d(): front at y 0, bottom shifted to y -95 if `layout`.
  function plates(pc, strutLength, opts) {
    const o = Object.assign({ nbraces: 0, dogbones: 3.5, wing: 8, front: true, bottom: true, layout: true }, opts);
    const out = { braces: braces(strutLength, o.nbraces) };
    if (o.front) out.front = plate(pc, strutLength, { nbraces: o.nbraces, extra: o.wing, dogbones: o.dogbones });
    if (o.bottom) {
      let b = plate(pc, strutLength, { nbraces: o.nbraces, bottom: true, extra: 5.5, dogbones: o.dogbones });
      if (o.layout) b = b.map(poly => poly.map(ring => ring.map(([x, y]) => [x, y - 95])));
      out.bottom = b;
    }
    return out;
  }

  // ---- downloads ----------------------------------------------------------------------------------
  // Rings of a MultiPolygon, closed (first == last) as polygon-clipping returns them.
  const rings = mp => mp.flatMap(poly => poly);

  // DXF R12, mm, one closed POLYLINE per ring (CAM-friendly; LINE soup is what OpenSCAD writes).
  function toDXF(mps) {
    const L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES"];
    for (const mp of mps) for (const ring of rings(mp)) {
      L.push("0", "POLYLINE", "8", "0", "66", "1", "70", "1");
      for (const [x, y] of ring.slice(0, -1)) L.push("0", "VERTEX", "8", "0", "10", x.toFixed(6), "20", y.toFixed(6));
      L.push("0", "SEQEND", "8", "0");
    }
    L.push("0", "ENDSEC", "0", "EOF");
    return L.join("\n") + "\n";
  }

  // SVG in mm, y up -> y down, evenodd fill so holes show.
  function toSVG(mps, pad = 2) {
    const all = mps.flatMap(rings).flat();
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const w = x1 - x0, h = y1 - y0;
    const d = mps.flatMap(rings).map(r => "M" + r.slice(0, -1).map(([x, y]) =>
      `${(x - x0).toFixed(4)},${(y1 - y).toFixed(4)}`).join("L") + "Z").join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" ` +
      `viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}"><path d="${d}" fill="none" stroke="black" stroke-width="0.1" ` +
      `fill-rule="evenodd"/></svg>\n`;
  }

  const api = { braces, plate, plates, toDXF, toSVG, H };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StrutPlate = api;
})(typeof self !== "undefined" ? self : this);
