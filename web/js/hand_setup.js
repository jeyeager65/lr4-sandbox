// The machine set up by hand (Part 31): what a job leaves out comes from what's on the table / in the router, every
// move carves (the stock and the spoilboard), and the spoilboard keeps its cuts in this browser. The page does the
// drawing; this is the plain part: which stock / bits a file brings, an offset view of a StockSimulator (a job's work
// mm carving the table's spoilboard), the spoilboard's level and the height under the touch plate, its IndexedDB
// store, and the page-made surfacing job. Plain JS: tests/test_hand_setup.js.
(function (root) {
  "use strict";

  // what a file brings, read from its text before parsing (a header ToolDef would win over the file's own, so only the
  // bits it doesn't define go in the header): { stock: has a (Stock:) line, tools: T numbers used with no ToolDef }.
  // No T word at all = T1 (the parser's default).
  function needs(text) {
    const defined = new Set([...text.matchAll(/\(\s*ToolDef\s+(\d+)/gi)].map((m) => +m[1]));
    const used = new Set([...text.matchAll(/^[^;(\n]*?\bT(\d+)/gim)].map((m) => +m[1]));
    if (!used.size) used.add(1);
    // the units a header is read in (GcodePlay.load): its CNCSIM UNITS=, else the first G20 / G21
    const u = /CNCSIM[^)\n]*UNITS\s*=\s*(\w+)/i.exec(text), g = /^[^;(\n]*?\bG2([01])\b/im.exec(text);
    return { stock: /\(\s*Stock:/i.test(text), tools: [...used].filter((n) => !defined.has(n)).sort((a, b) => a - b),
      surfacing: /\(LR4 surfacing\)/i.test(text), inch: u ? /^in/i.test(u[1]) : !!g && g[1] === "0" };
  }

  // the page's bit form { shape, d, angle, len } <-> cnc-gcode-tools' tool def { shape, diameter, angle, overallLength }
  const toDef = (b) => ({ shape: b.shape, diameter: b.d, angle: b.shape === "vbit" ? b.angle || 90 : undefined,
    overallLength: b.len > 0 ? b.len : undefined });
  const fromDef = (d) => ({ shape: ["flat", "ball", "vbit"].includes(d.shape) ? d.shape : "flat", d: d.diameter,
    angle: d.angle > 0 ? d.angle : 90, len: d.overallLength > 0 ? d.overallLength : 0 });
  const bitName = (b) => `${b.shape === "vbit" ? `${+(b.angle || 90)}° V-bit` : b.shape === "ball" ? "ball end" : "flat end mill"} ` +
    `${+(+b.d).toFixed(3)} mm` + (Math.abs(b.d - 25.4 / 4) < 0.01 ? ` (1/4")` : Math.abs(b.d - 25.4 / 8) < 0.01 ? ` (1/8")` :
      Math.abs(b.d - 25.4) < 0.01 ? ` (1")` : "");

  // a StockSimulator seen through an offset, for motion_carve.carve / carveOne: moves in one frame (off = that frame's
  // origin in the sim's) carve the sim, with the given (compiled) tools
  function shifted(sim, off, tools, defaultTool) {
    const sh = (q) => ({ x: q.x + off[0], y: q.y + off[1], z: q.z + off[2] });
    const seg = (s) => s && Object.assign({}, s, { start: sh(s.start), end: sh(s.end) });
    return {
      tools, defaultTool, stock: { zmax: sim.stock.zmax - off[2] },
      sweep: (x0, y0, z0, x1, y1, z1, tool) => sim.sweep(x0 + off[0], y0 + off[1], z0 + off[2], x1 + off[0], y1 + off[1], z1 + off[2], tool),
      carveOne: (s, prev, t, fb) => sim.carveOne(seg(s), seg(prev), t, fb),
    };
  }

  // the highest point within r of (x, y) (sim coordinates), or null off the sim: where a touch plate's pad rests
  function topAt(sim, x, y, r = 9) {
    const S = sim.stock;
    if (x < S.xmin - r || x > S.xmax + r || y < S.ymin - r || y > S.ymax + r) return null;
    const i0 = Math.max(0, Math.ceil((x - r - S.xmin) / sim.dx)), i1 = Math.min(sim.nx, Math.floor((x + r - S.xmin) / sim.dx));
    const j0 = Math.max(0, Math.ceil((y - r - S.ymin) / sim.dy)), j1 = Math.min(sim.ny, Math.floor((y + r - S.ymin) / sim.dy));
    let top = -Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) top = Math.max(top, sim.heights[j * sim.vx + i]);
    if (top === -Infinity) {                         // smaller than a cell: the nearest point
      const i = Math.min(sim.nx, Math.max(0, Math.round((x - S.xmin) / sim.dx))), j = Math.min(sim.ny, Math.max(0, Math.round((y - S.ymin) / sim.dy)));
      top = sim.heights[j * sim.vx + i];
    }
    return top;
  }
  // the spoilboard's level: the median height (marks don't move it; a surfacing pass does), from up to n samples;
  // src = a heights array, or a sim + box { x: [from, to], y: [from, to] } (the cutting area: the table's edge beyond
  // the bit's reach is never surfaced)
  function level(src, box, n = 20000) {
    let heights = src;
    if (src.heights) {
      const S = src.stock, b = box || { x: [S.xmin, S.xmax], y: [S.ymin, S.ymax] }, c = [];
      const i0 = Math.max(0, Math.ceil((b.x[0] - S.xmin) / src.dx)), i1 = Math.min(src.nx, Math.floor((b.x[1] - S.xmin) / src.dx));
      const j0 = Math.max(0, Math.ceil((b.y[0] - S.ymin) / src.dy)), j1 = Math.min(src.ny, Math.floor((b.y[1] - S.ymin) / src.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) c.push(src.heights[j * src.vx + i]);
      heights = c;
    }
    const k = Math.max(1, Math.floor(heights.length / n)), s = [];
    for (let i = 0; i < heights.length; i += k) s.push(heights[i]);
    s.sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 0;
  }
  // heights kept at one grid (nx, ny) onto another (the page's cell size follows Lite): nearest point
  function resample(src, snx, sny, nx, ny) {
    const out = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      const sj = Math.round(j / ny * sny);
      for (let i = 0; i <= nx; i++) out[j * (nx + 1) + i] = src[sj * (snx + 1) + Math.round(i / nx * snx)];
    }
    return out;
  }

  // the spoilboard store: one record per machine size (key), { key, nx, ny, heights, mtime }
  const DB = "lr4-spoilboard", STORE = "boards";
  function tx(mode, fn) {
    return new Promise((res, rej) => {
      const r = globalThis.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key" });
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const d = r.result, t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
        t.oncomplete = () => { d.close(); res(out && out.result); };
        t.onerror = () => { d.close(); rej(t.error); };
      };
    });
  }
  const board = {
    get: (key) => tx("readonly", (st) => st.get(key)),
    put: (key, sim) => tx("readwrite", (st) => { st.put({ key, nx: sim.nx, ny: sim.ny, heights: sim.heights.slice(), mtime: Date.now() }); }),
    remove: (key) => tx("readwrite", (st) => { st.delete(key); }),
  };

  // a surfacing job for the cut area (mm, work zero = the spoilboard's original top, as a job with no stock):
  // o = { x: [from, to], y: [from, to] (the bit's centre), d (bit mm), over (step-over, 0-1), z (cut depth, negative),
  // feed, plunge (mm/min), rpm }. Passes along Y (the long way), stepping over in X; T1 is its bit (ToolDef).
  function surfacing(o) {
    const f = (v) => (+v).toFixed(3), step = o.d * o.over, nx = Math.max(1, Math.ceil((o.x[1] - o.x[0]) / step));
    const L = [`(LR4 surfacing) (Made by the LowRider 4 Sandbox: a ${f(o.d)} mm bit, ${Math.round(o.over * 100)}% step-over, Z ${f(o.z)})`,
      `(ToolDef 1: SHAPE=flat D=${f(o.d)} NAME=surfacing ${f(o.d)} mm)`,
      "G21 G90 G54", "T1", `M3 S${o.rpm || 18000}`, "G0 Z5", `G0 X${f(o.x[0])} Y${f(o.y[0])}`, `G1 Z${f(o.z)} F${o.plunge || 300}`];
    for (let i = 0; i <= nx; i++) {
      const x = Math.min(o.x[0] + i * step, o.x[1]);
      if (i) L.push(`G1 X${f(x)} F${o.feed || 1500}`);
      L.push(`G1 Y${f(i % 2 ? o.y[0] : o.y[1])} F${o.feed || 1500}`);
    }
    L.push("G0 Z5", "M5", `G0 X${f(o.x[0])} Y${f(o.y[0])}`, "M30", "");
    return L.join("\n");
  }

  const api = { needs, toDef, fromDef, bitName, shifted, topAt, level, resample, board, surfacing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HandSetup = api;
})(typeof self !== "undefined" ? self : this);
