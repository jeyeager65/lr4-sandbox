// G-code playback (simulator stage 1): the G-code TEXT -> moves, messages, M0 pauses and probes, parsed by
// cnc-gcode-tools' GCodeParser (its expander does the #<vars>, StockProbe stops G38.2 on the stock) and timed by its
// Animator (acceleration + junction speeds, rates from the FluidNC config). The page plays the very file it
// downloads, or one the user brings. Needs js/lib/cnc-gcode-tools/*.js loaded first (classic scripts: their classes
// are globals). tests/test_gcode_play.js checks it.
(function (root) {
  "use strict";
  // V1E's JP3_LR config.yaml (FluidNC_Configs): X / Y 9000 mm/min at 200 mm/s^2, Z 900 at 80
  const V1E = { maxRateX: 9000, maxRateY: 9000, maxRateZ: 900, accelX: 200, accelY: 200, accelZ: 80 };
  const STOPS = new Set(["pause", "alarm"]);           // playback halts here: M0 and a failed probe

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
  // G20 / G21: the parser keeps each move in the units in force when it was read (a file may switch), so this
  // subclass tags every move with them and load() turns everything into mm - the scene, the stock and the clock.
  // It also converts the current position + offsets on a switch (the parser doesn't - fix in cnc-gcode-tools), else
  // a move after G20 without a Z reads the old mm Z as inches.
  const IN = 25.4;
  let Parser = null;
  function parser() {
    if (!Parser) Parser = class extends GCodeParser {
      addSegment(s) { s.inch = this.units === "inches"; super.addSegment(s); }
      processGCode(code, words, lineNum, value = code) {
        const to = code === 20 ? "inches" : code === 21 ? "mm" : null;
        if (to && to !== this.units) {
          const k = to === "inches" ? 1 / IN : IN, sc = (q) => { q.x *= k; q.y *= k; q.z *= k; };
          [this.position, this.g92, this.g92Saved, ...this.wcsOffsets].forEach((q) => q && sc(q));
          this.feedRate *= k;                        // a modal F is a speed: it carries over (FluidNC keeps mm/min)
        }
        return super.processGCode(code, words, lineNum, value);
      }
    };
    return new Parser();
  }

  async function load(text, rates) {
    const p = parser();
    let segs = await p.parseString(text);
    if (p.expansion && p.expansion.error) throw new Error(`G-code variables: ${p.expansion.error}`);
    const inches = segs.filter((s) => s.inch).length;
    if (inches) {
      const sc = (q) => ({ x: q.x * IN, y: q.y * IN, z: q.z * IN });
      segs = segs.map((s) => !s.inch ? s : Object.assign({}, s, { start: sc(s.start), end: sc(s.end), feedRate: (s.feedRate || 0) * IN },
        s.probe ? { probe: { surface: s.probe.surface * IN, plate: s.probe.plate * IN } } : {}));
    }
    // the (Stock:) / (ToolDef:) header: in its CNCSIM UNITS=, else the units the file starts moving in
    let stock = p.simMeta.stock, tools = p.simMeta.tools;
    if (p.simMeta.units ? p.simMeta.units === "inches" : segs.length && segs[0].inch) {
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
    const events = p.events.map((e) => Object.assign({}, e, { time: timeOf(e.index) }));
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
      plates.push({ x: s.start.x, y: s.start.y, z: s.probe.surface, thick: s.probe.plate,
        t0: before ? before.time : timeOf(i), t1: after ? after.time : timeOf(i + 2) });
    });
    return { segs, t, total, events, stock, tools, plates, anim, lines: text.split("\n").length,
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

  const api = { V1E, motion, load, at, step, pending, message, pauseText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GcodePlay = api;
})(typeof self !== "undefined" ? self : this);
