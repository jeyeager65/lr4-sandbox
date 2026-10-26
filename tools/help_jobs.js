// The small jobs inside the help videos (web/help/*.gcode, Part 43d): G-code moves made here, pasted below each
// script's (Video ...) lines by hand. One stroke font (L R 4 S A N D B O X, on a 6 x 10 grid) for the tour's name plate.
//   node tools/help_jobs.js nameplate    -> the tour's job: "LR4 SANDBOX" + a border, 60 deg V-bit, 1 mm deep
//   node tools/help_jobs.js square       -> As built's job: a 500 x 300 mm rectangle + its diagonals, 1 mm deep
"use strict";
const FONT = {                                       // strokes, x 0-6, y 0-10 (baseline 0)
  L: [[[0, 10], [0, 0], [6, 0]]],
  R: [[[0, 0], [0, 10], [4.5, 10], [6, 8.5], [6, 6.5], [4.5, 5], [0, 5]], [[3, 5], [6, 0]]],
  4: [[[5, 0], [5, 10], [0, 3], [6, 3]]],
  S: [[[6, 8.5], [4.5, 10], [1.5, 10], [0, 8.5], [0, 6.5], [1.5, 5], [4.5, 5], [6, 3.5], [6, 1.5], [4.5, 0], [1.5, 0], [0, 1.5]]],
  A: [[[0, 0], [3, 10], [6, 0]], [[1.05, 3.5], [4.95, 3.5]]],
  N: [[[0, 0], [0, 10], [6, 0], [6, 10]]],
  D: [[[0, 0], [0, 10], [3.5, 10], [6, 7.5], [6, 2.5], [3.5, 0], [0, 0]]],
  B: [[[0, 0], [0, 10], [4.5, 10], [6, 8.5], [6, 6.5], [4.5, 5], [0, 5]], [[4.5, 5], [6, 3.5], [6, 1.5], [4.5, 0], [0, 0]]],
  O: [[[1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [4.5, 10], [6, 8.5], [6, 1.5], [4.5, 0], [1.5, 0]]],
  X: [[[0, 0], [6, 10]], [[0, 10], [6, 0]]],
};
const f = (v) => (+v.toFixed(3)).toString();
function strokes(paths, depth, feed, plunge) {      // each path: rapid over, plunge, cut along, lift
  const out = [];
  for (const p of paths) {
    out.push(`G0 X${f(p[0][0])} Y${f(p[0][1])}`, `G1 Z${f(-depth)} F${plunge}`);
    out.push(...p.slice(1).map(([x, y], i) => `G1 X${f(x)} Y${f(y)}${i ? "" : ` F${feed}`}`), "G0 Z3");
  }
  return out;
}
function nameplate() {                               // a 240 x 70 plate, the text 22 mm high
  const s = 2.2, adv = 9, text = "LR4 SANDBOX", x0 = (240 - (text.length * adv - 3) * s) / 2, y0 = (70 - 10 * s) / 2, paths = [];
  [...text].forEach((ch, i) => { for (const st of FONT[ch] || []) paths.push(st.map(([x, y]) => [x0 + (i * adv + x) * s, y0 + y * s])); });
  return [...strokes(paths, 1, 900, 300), ...strokes([[[6, 6], [234, 6], [234, 64], [6, 64], [6, 6]]], 1, 900, 300)];
}
function square() {                                  // squareness: a rectangle and both diagonals
  const W = 500, H = 300;
  return strokes([[[0, 0], [W, 0], [W, H], [0, H], [0, 0]], [[0, 0], [W, H]], [[W, 0], [0, H]]], 1, 1500, 300);
}
const which = process.argv[2];
const jobs = { nameplate, square };
if (!jobs[which]) { console.log("usage: node tools/help_jobs.js nameplate|square"); process.exit(1); }
console.log(jobs[which]().join("\n"));
