// G-code playback (simulator stage 1): the G-code TEXT -> moves, messages, M0 pauses and probes, parsed by
// cnc-gcode-tools' GCodeParser (its expander does the #<vars>, StockProbe stops G38.2 on the stock) and timed by its
// Animator (acceleration + junction speeds, rates from the FluidNC config). The page plays the very file it
// downloads, or one the user brings. Needs js/lib/cnc-gcode-tools/*.js loaded first (classic scripts: their classes
// are globals). tests/test_gcode_play.js checks it.
(function (root) {
  "use strict";
  // V1E's JP3_LR config.yaml (FluidNC_Configs): X / Y 9000 mm/min at 200 mm/s^2, Z 900 at 80
  const V1E = { maxRateX: 9000, maxRateY: 9000, maxRateZ: 900, accelX: 200, accelY: 200, accelZ: 80 };
  const STOPS = new Set(["pause", "alarm", "tool"]);   // playback halts here: M0, a failed probe, a change to an undefined bit

  // FluidNC config values (parseFluidNCConfig: {"/axes/x/max_rate_mm_per_min": 9000, ...}) -> Animator rates
  function motion(values) {
    const m = Object.assign({}, V1E);
    for (const a of ["x", "y", "z"]) {
      const r = values && values[`/axes/${a}/max_rate_mm_per_min`], c = values && values[`/axes/${a}/acceleration_mm_per_sec2`];
      if (r > 0) m["maxRate" + a.toUpperCase()] = r;
      if (c > 0) m["accel" + a.toUpperCase()] = c;
    }
    return m;
  }

  // text -> { segs, t (end time of each move, s), total, events [{index, time, kind, text, lineNum}], stock, tools,
  // plates [{x, y, z, t0, t1}] (touch plate on the stock from its "attach" pause to the next one), anim, lines }
  // G20 / G21: the parser keeps each move in the units in force when it was read (a file may switch; it carries the
  // position, offsets and feed over at the switch), so this subclass tags every move with them and load() turns
  // everything into mm - the scene, the stock and the clock
  const IN = 25.4;
  let Parser = null;
  // start: where the machine is when the file starts (work mm; the page's homed spot), else 0, 0, 0
  function parser(start) {
    if (!Parser) Parser = class extends GCodeParser {
      reset() { super.reset(); if (this.start) this.position = Object.assign({}, this.start); }
      addSegment(s) { s.inch = this.units === "inches"; super.addSegment(s); }
    };
    const p = new Parser();
    p.start = start || null;
    return p;
  }

  // start = {x, y, z} (work mm), or a function (stock from the header, or null) -> that, as the start can depend on
  // the stock (the page's work Z is on the stock top): then the file is read twice.
  // opts.header: (Stock:) / (ToolDef:) lines the user gave (header()), read before the file; line numbers stay the file's
  async function load(text, rates, start, opts = {}) {
    const head = opts.header ? opts.header.replace(/\n$/, "") : "", extra = head ? head.split("\n").length : 0;
    if (extra) text = head + "\n" + text;
    if (typeof start === "function") {
      const q = parser(), qs = await q.parseString(text), st = q.simMeta.stock;
      const inch = q.simMeta.units ? q.simMeta.units === "inches" : qs.length && qs[0].inch;
      start = start(st ? Object.fromEntries(Object.entries(st).map(([key, v]) => [key, inch ? v * IN : v])) : null);
    }
    const p = parser(start);
    let segs = await p.parseString(text);
    if (p.expansion && p.expansion.error) throw new Error(`G-code variables: ${p.expansion.error}`);
    // line numbers: the source file's (the expander's sourceMap for #<var> files), less the user's header lines
    const src = (n) => { const m = p.expansion && p.expansion.sourceMap ? p.expansion.sourceMap[n - 1] : n; return m == null ? m : m - extra; };
    for (const s of segs) s.srcLine = src(s.lineNum);
    const inches = segs.filter((s) => s.inch).length;
    if (inches) {
      const sc = (q) => ({ x: q.x * IN, y: q.y * IN, z: q.z * IN });
      segs = segs.map((s) => !s.inch ? s : Object.assign({}, s, { start: sc(s.start), end: sc(s.end), feedRate: (s.feedRate || 0) * IN },
        s.probe ? { probe: { surface: s.probe.surface * IN, plate: s.probe.plate * IN } } : {}));
    }
    // the (Stock:) / (ToolDef:) header: in its CNCSIM UNITS=, else the units the file starts moving in
    let stock = p.simMeta.stock, tools = p.simMeta.tools;
    const metaInch = !!(p.simMeta.units ? p.simMeta.units === "inches" : segs.length && segs[0].inch);
    if (metaInch) {
      if (stock) stock = Object.fromEntries(Object.entries(stock).map(([key, v]) => [key, v * IN]));
      const len = (v) => (v > 0 ? v * IN : v);
      tools = new Map([...tools].map(([n, d]) => [n, Object.assign({}, d, { diameter: d.diameter * IN, tip: (d.tip || 0) * IN,
        cornerRadius: (d.cornerRadius || 0) * IN, fluteLength: len(d.fluteLength), overallLength: len(d.overallLength) })]));
    }
    const anim = new Animator();
    Object.assign(anim, rates || V1E);                 // (setMotionParameters logs to the console)
    anim.setSegments(segs);
    const t = anim.segmentEndTimes, total = anim.totalAnimTime;
    const timeOf = (index) => (index > 0 ? t[Math.min(index, segs.length) - 1] : 0);
    const events = p.events.map((e) => Object.assign({}, e, { time: timeOf(e.index), lineNum: src(e.lineNum) ?? e.lineNum }));
    // a change to a bit with no ToolDef stops playback, so the user can say what it is (the first tool: at the start)
    // (on its M6 / T line: the last one before the move, after the move before it)
    const source = text.split("\n").slice(extra);
    segs.forEach((s, i) => {
      if (i && s.toolNumber !== segs[i - 1].toolNumber && !tools.has(s.toolNumber)) {
        let line = s.srcLine;
        for (let n = (s.srcLine || 1) - 1; n >= (segs[i - 1].srcLine || 0) + 1; n--) {
          if (/^[^;(]*\b(M0*6|T\d+)\b/i.test(source[n - 1] || "")) { line = n; break; }
        }
        const k = events.findIndex((e) => e.index > i || (e.index === i && e.lineNum > line));
        events.splice(k < 0 ? events.length : k, 0, { index: i, lineNum: line, kind: "tool", time: timeOf(i),
          text: `Tool change to T${s.toolNumber}: the file doesn't say which bit it is.` });
      }
    });
    // one per probe (a job re-probes after each tool change): from the pause before it ("attach") to the pause
    // after it ("remove"), only counting pauses with no cutting between them and the probe; without those, the
    // probe + its retract
    const plates = [];
    segs.forEach((s, i) => {
      if (s.type !== "probe" || !s.probe) return;
      let c0 = i - 1, c1 = i + 1;
      while (c0 >= 0 && segs[c0].type !== "cut") c0--;
      while (c1 < segs.length && segs[c1].type !== "cut") c1++;
      const before = events.filter((e) => e.kind === "pause" && e.index <= i && e.index > c0).pop();
      const after = events.find((e) => e.kind === "pause" && e.index > i && e.index <= c1);
      plates.push({ index: i, x: s.start.x, y: s.start.y, z: s.probe.surface, thick: s.probe.plate, tool: s.toolNumber,
        t0: before ? before.time : timeOf(i), t1: after ? after.time : timeOf(i + 2) });
    });
    return { segs, t, total, events, stock, tools, plates, anim, lines: text.split("\n").length - extra, metaInch,
      units: !inches ? "mm" : inches === segs.length ? "in" : "mixed" };
  }

  // the pose at time s: { index (move under way), progress (0-1), x, y, z }; past the end = the last point
  function at(tl, s) {
    const n = tl.segs.length;
    if (!n) return { index: 0, progress: 0, x: 0, y: 0, z: 0 };
    if (s >= tl.total) { const e = tl.segs[n - 1].end; return { index: n, progress: 0, x: e.x, y: e.y, z: e.z }; }
    const i = tl.anim.indexAtTime(s), t0 = i ? tl.t[i - 1] : 0, d = tl.t[i] - t0;
    const f = d > 0 ? Math.min(1, Math.max(0, (s - t0) / d)) : 1, { start: a, end: b } = tl.segs[i];
    return { index: i, progress: f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  }

  // one frame of playback from time s: { t, stop, k } - halts AT the first pause / alarm reached (stop = that
  // event; its moves are done); probes play slowly at high speed (Animator.advanceTime). k = the first event not
  // handled yet (pending(tl, s) after a scrub; the returned k after a stop, so resuming goes on past it).
  function step(tl, s, dt, speed, k) {
    tl.anim.speed = speed;
    const next = Math.min(tl.anim.advanceTime(s, dt), tl.total);
    for (let i = k; i < tl.events.length && tl.events[i].time <= next; i++) {
      if (STOPS.has(tl.events[i].kind)) return { t: tl.events[i].time, stop: tl.events[i], k: i + 1 };
    }
    return { t: next, stop: null, k };
  }
  function pending(tl, s) {                        // the first event still to come at time s
    const i = tl.events.findIndex((e) => e.time > s);
    return i < 0 ? tl.events.length : i;
  }

  // the last message shown by time s (MSG / PRINT / probe / alarm / end), or null
  function message(tl, s) {
    let m = null;
    for (const e of tl.events) { if (e.time > s) break; if (e.kind !== "pause") m = e; }
    return m;
  }
  // the text a pause shows: its own line's MSG (FluidNC prints it before holding), else the generic one
  function pauseText(tl, e) {
    const msg = tl.events.find((m) => m.kind === "msg" && m.lineNum === e.lineNum);
    return msg ? msg.text : e.text;
  }

  // what the file leaves out for the stock simulation: { stock (no (Stock:) line), tools: [T numbers used with no
  // ToolDef] }, and a guess to start the form from: the cut moves' extent (work mm, x / y from 0) and depth
  function missing(tl) {
    const used = [...new Set(tl.segs.filter((s) => s.type === "cut").map((s) => s.toolNumber))];
    const tools = used.filter((n) => !tl.tools.has(n));
    const b = [Infinity, -Infinity, Infinity, -Infinity, 0];
    for (const s of tl.segs) {
      if (s.type !== "cut") continue;
      for (const q of [s.start, s.end]) { b[0] = Math.min(b[0], q.x); b[1] = Math.max(b[1], q.x); b[2] = Math.min(b[2], q.y); b[3] = Math.max(b[3], q.y); b[4] = Math.min(b[4], q.z); }
    }
    const guess = Number.isFinite(b[0]) ? { xmin: Math.min(0, b[0]), xmax: b[1], ymin: Math.min(0, b[2]), ymax: b[3], thick: Math.max(3, -b[4]) } : null;
    return { stock: !tl.stock, tools, guess };
  }
  // the user's stock / bits (mm) -> header lines for load(opts.header). stock: { xmin, xmax, ymin, ymax, thick } (top at
  // Z0); tools: { n: { shape (flat / ball / vbit), d (mm), angle (vbit, deg) } }. inch (tl.metaInch): written in inches,
  // as load() reads a header in the units the file's own header / first moves are in
  function header(stock, tools, inch) {
    const f = (v) => +(+v / (inch ? IN : 1)).toFixed(5);
    const L = [];
    if (stock) L.push(`(Stock: XMIN=${f(stock.xmin)} XMAX=${f(stock.xmax)} YMIN=${f(stock.ymin)} YMAX=${f(stock.ymax)} ZMIN=${f(-stock.thick)} ZMAX=0)`);
    for (const [n, t] of Object.entries(tools || {})) {
      L.push(`(ToolDef ${n}: SHAPE=${t.shape} D=${f(t.d)}${t.shape === "vbit" ? ` ANGLE=${+(t.angle || 90)}` : ""} NAME=${t.shape} ${+(+t.d).toFixed(3)} mm)`);
    }
    return L.length ? L.join("\n") + "\n" : "";
  }

  const api = { V1E, motion, load, at, step, pending, message, pauseText, missing, header };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GcodePlay = api;
})(typeof self !== "undefined" ? self : this);
