// The config.yaml in use (V1E's JP3_LR or the user's own, max_travel_mm already set for the size) -> the copy FluidNC
// runs in the browser (js/fluidnc_sim.js). The wasm build has no TMC drivers, I2SO, UART or real GPIO, so every motor
// becomes a standard_stepper on its own gpio pair and every limit / probe pin moves to a known gpio, active high
// (wasm gpio reads 0, so an active-low pin would read as tripped). Part 16's virtual switches drive those pins.
// What carries over unchanged: each axis' max rate, acceleration, max_travel_mm, soft_limits, the homing block, each
// motor's hard_limits + pulloff_mm (both Y and both Z motors are kept: each its own switch = squaring), probe
// check_mode_start, start, macros, kinematics. Everything else (uart, i2so, spindles, coolant, control, user I/O, ...)
// is dropped and listed. steps_per_mm is the file's own, at most MAX_STEPS (so the step loop stays light): with
// too few steps per mm FluidNC stretches its step segments, and a feed hold / probe stop overshoots.
// The copy is never shown or downloaded: the page's config.yaml download stays the real file.
// tests/test_sim_config.js checks it (V1E's JP3_LR + a user-style file).
(function (root) {
  "use strict";
  const MAX_STEPS = 200;
  // the simulator's pin layout (Part 16 reads it from translate().pins): ESP32-S3 numbering (the wasm build's
  // capability table): gpio 0-21 and 35-48 are usable
  const AXES = ["x", "y", "z"], MOTORS = ["motor0", "motor1"];
  const STEP = (i) => [2 * i, 2 * i + 1];        // motor i (x0 x1 y0 y1 z0 z1 = 0..5) -> [step, dir] = gpio 0..11
  const LIMIT = (i, k) => [35 + i, 41 + i][k];   // the motor's first limit pin -> 35..40, a second one -> 41..46
  const PROBE = 47, TOOLSETTER = 48;
  const SD = { miso: 19, mosi: 21, sck: 18, cs: 12 };
  const SCALARS = ["name", "meta", "planner_blocks", "arc_tolerance_mm", "junction_deviation_mm", "verbose_errors",
    "report_inches", "enable_parking_override_control", "use_line_numbers"];
  const COPIED = ["start", "macros", "kinematics", "parking"];   // copied as they are (any *_pin in them -> NO_PIN)
  const AXIS_KEYS = ["max_rate_mm_per_min", "acceleration_mm_per_sec2", "max_travel_mm", "soft_limits"];
  const isPin = (v) => v !== undefined && v !== "" && !/^no_pin$/i.test(v);

  // FluidNC's yaml subset: "key: value" lines nested by indentation; comments (# at the start or after a space)
  // dropped. -> { children: [{ key, value, children }] }
  function parse(text) {
    const top = { key: "", value: "", children: [] }, stack = [{ ind: -1, node: top }];
    for (const raw of text.split(/\r?\n/)) {
      const ln = raw.replace(/\t/g, "  ").replace(/(^|\s)#.*$/, "");
      const m = /^(\s*)([^\s:][^:]*?)\s*:\s*(.*?)\s*$/.exec(ln);
      if (!m) continue;
      const ind = m[1].length;
      while (stack[stack.length - 1].ind >= ind) stack.pop();
      const node = { key: m[2], value: m[3].replace(/^(["'])(.*)\1$/, "$2"), children: [] };
      stack[stack.length - 1].node.children.push(node);
      stack.push({ ind, node });
    }
    return top;
  }
  const child = (n, k) => n && n.children.find((c) => c.key === k);
  const val = (n, k) => { const c = child(n, k); return c ? c.value : undefined; };

  // text -> { text (the simulator's config.yaml), pins: { motors: [{ axis, motor, step, dir, limits: { neg | pos |
  // all: gpio }, from: { neg: "gpio.25:high", ... } }], probe: { gpio, from } | null, toolsetter, sd }, dropped: [top-level
  // keys left out], steps: { x: { from, to }, ... }, rates: { x: max_rate_mm_per_min, ... }, axes: ["x", "y", "z"]
  // (the ones present) }
  function translate(text) {
    const y = parse(text), out = [], dropped = [];
    const L = (ind, k, v) => out.push(" ".repeat(ind) + k + ":" + (v === undefined || v === "" ? "" : " " + v));
    const copy = (n, ind) => {
      for (const c of n.children) {
        L(ind, c.key, /_pin$/.test(c.key) && isPin(c.value) ? "NO_PIN" : c.value);
        copy(c, ind + 2);
      }
    };
    const axesN = child(y, "axes");
    if (!axesN || !AXES.some((a) => child(axesN, a))) throw new Error("no axes x / y / z - is this a FluidNC config.yaml?");
    out.push("# lr4-sandbox: the browser simulator's copy of your config.yaml - plain steppers, pins renumbered;",
      "# rates, acceleration, travel, homing and limits as in yours. Not for a real controller.");
    for (const k of SCALARS) if (val(y, k) !== undefined) L(0, k, val(y, k));
    L(0, "board", "lr4-sandbox simulator");
    L(0, "stepping");
    L(2, "engine", "timed"); L(2, "idle_ms", val(child(y, "stepping"), "idle_ms") || "255");
    L(2, "pulse_us", "1"); L(2, "dir_delay_us", "0"); L(2, "disable_delay_us", "0");

    const pins = { motors: [], probe: null, toolsetter: null, sd: SD }, steps = {}, rates = {}, axes = [];
    L(0, "axes");
    AXES.forEach((a, ai) => {
      const an = child(axesN, a);
      if (!an) return;
      axes.push(a);
      L(2, a);
      const from = Number(val(an, "steps_per_mm")) || 80;
      steps[a] = { from, to: Math.min(from, MAX_STEPS) };
      rates[a] = Number(val(an, "max_rate_mm_per_min")) || 1000;
      L(4, "steps_per_mm", String(steps[a].to));
      for (const k of AXIS_KEYS) if (val(an, k) !== undefined) L(4, k, val(an, k));
      const h = child(an, "homing");
      if (h) { L(4, "homing"); copy(h, 6); }
      MOTORS.forEach((mk, mi) => {
        const mn = child(an, mk);
        if (!mn) return;
        const i = ai * 2 + mi, [s, d] = STEP(i), m = { axis: a, motor: mi, step: s, dir: d, limits: {}, from: {} };
        L(4, mk);
        let used = 0;
        for (const kind of ["neg", "pos", "all"]) {
          const v = val(mn, `limit_${kind}_pin`);
          if (!isPin(v) || used > 1) continue;
          m.limits[kind] = LIMIT(i, used++);
          m.from[kind] = v;
          L(6, `limit_${kind}_pin`, `gpio.${m.limits[kind]}`);
        }
        for (const k of ["hard_limits", "pulloff_mm"]) if (val(mn, k) !== undefined) L(6, k, val(mn, k));
        L(6, "standard_stepper"); L(8, "step_pin", `gpio.${s}`); L(8, "direction_pin", `gpio.${d}`);
        pins.motors.push(m);
      });
    });
    for (const c of axesN.children) if (!AXES.includes(c.key) && c.children.length) dropped.push(`axes/${c.key}`);

    L(0, "spi"); L(2, "miso_pin", `gpio.${SD.miso}`); L(2, "mosi_pin", `gpio.${SD.mosi}`); L(2, "sck_pin", `gpio.${SD.sck}`);
    L(0, "sdcard"); L(2, "cs_pin", `gpio.${SD.cs}`);
    const pr = child(y, "probe");
    if (pr) {
      L(0, "probe");
      if (isPin(val(pr, "pin"))) { pins.probe = { gpio: PROBE, from: val(pr, "pin") }; L(2, "pin", `gpio.${PROBE}`); }
      if (isPin(val(pr, "toolsetter_pin"))) { pins.toolsetter = { gpio: TOOLSETTER, from: val(pr, "toolsetter_pin") }; L(2, "toolsetter_pin", `gpio.${TOOLSETTER}`); }
      for (const k of ["check_mode_start", "hard_stop"]) if (val(pr, k) !== undefined) L(2, k, val(pr, k));
    }
    for (const k of COPIED) {
      const n = child(y, k);
      if (n) { L(0, k, n.value); copy(n, 2); }
    }
    const handled = new Set([...SCALARS, ...COPIED, "board", "stepping", "axes", "spi", "sdcard", "probe"]);
    for (const c of y.children) if (!handled.has(c.key)) dropped.push(c.key);
    return { text: out.join("\n") + "\n", pins, dropped, steps, rates, axes };
  }

  const api = { MAX_STEPS, parse, translate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SimConfig = api;
})(typeof self !== "undefined" ? self : this);
