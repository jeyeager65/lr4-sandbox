// sim_config.js: the config.yaml in use -> the copy FluidNC runs in the browser. For V1E's JP3_LR (fetched from
// GitHub at the page's pinned commit into build/fixtures/, skipped offline) and a user-style file (comments, tabs,
// quotes, odd drivers, limit_all / two limit pins, an A axis, a spindle, an active-low probe): every motor is a
// standard_stepper on its own gpio pair, limit / probe pins on the known gpios and active high, nothing of TMC / I2SO
// / UART left, rates / accel / travel / homing / pulloff / hard_limits as in the source, the dropped list right.
//   node tests/test_sim_config.js
"use strict";
const fs = require("fs"), path = require("path");
const C = require("../web/js/sim_config.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const V1E = "https://raw.githubusercontent.com/V1EngineeringInc/FluidNC_Configs/3bb36506b0fcd2b0caca7c108ec150ccbb0c055c/LowRider%20CNC/Jackpot3/JP3_LR/config.yaml";
const FIX = path.join(__dirname, "..", "build", "fixtures", "JP3_LR.yaml");

const USER = [
  "# my LowRider",
  'name: "Shop LR4"',
  "board: MKS DLC32",
  "stepping:",
  "  engine: RMT",
  "  idle_ms: 250",
  "axes:",
  "  shared_stepper_disable_pin: gpio.13:low",
  "  x:",
  "    steps_per_mm: 100   # 1/16",
  "    max_rate_mm_per_min: 6000",
  "    acceleration_mm_per_sec2: 150",
  "    max_travel_mm: 700",
  "    homing:",
  "      cycle: 2",
  "      mpos_mm: 0",
  "    motor0:",
  "      limit_all_pin: gpio.36:low:pu",
  "      hard_limits: true",
  "      pulloff_mm: 2.5",
  "      stepstick:",
  "        step_pin: gpio.12",
  "        direction_pin: gpio.14:low",
  "        disable_pin: gpio.13",
  "  y:",
  "    steps_per_mm: 80",
  "    max_rate_mm_per_min: 5000",
  "    motor0:",
  "      limit_neg_pin: gpio.39",
  "      limit_pos_pin: gpio.34:low",
  "      tmc_2130:",
  "        cs_pin: i2so.3",
  "        step_pin: I2SO.2",
  "        direction_pin: I2SO.1",
  "    motor1:",
  "      limit_neg_pin: NO_PIN",
  "      standard_stepper:",
  "        step_pin: gpio.26",
  "  z:",
  "    steps_per_mm: 400",
  "    motor0:",
  "      unipolar:",
  "        phase0_pin: gpio.1",
  "  a:",
  "    steps_per_mm: 10",
  "    motor0:",
  "      standard_stepper:",
  "        step_pin: gpio.2",
  "spindle:",
  "Laser:",
  "  output_pin: gpio.2",
  "probe:",
  "  pin: gpio.35:low",
  "  check_mode_start: false",
  "macros:",
  "  startup_line0: G21",
  "  macro0: $H",
  "parking:",
  "  enable: false",
  "  pullout_rate_mm_per_min: 600",
  "coolant:",
  "  flood_pin: gpio.21",
].join("\n");

// the translated text, read back: every motor's driver, pins, numbers
function check(name, src) {
  const r = C.translate(src), s = C.parse(src), t = C.parse(r.text);
  const ch = (n, k) => n && n.children.find((c) => c.key === k), v = (n, k) => { const c = ch(n, k); return c ? c.value : undefined; };
  ok(!/tmc_|I2SO|i2so|uart|stepstick|unipolar|:low|RMT|I2S_STATIC/.test(r.text), `${name}: no TMC / I2SO / UART / active-low left`);
  ok(v(ch(t, "stepping"), "engine") === "timed" && v(ch(t, "stepping"), "segments") === "20" && v(t, "board") === "lr4-sandbox simulator", `${name}: timed engine, 20 segments, board`);
  const used = new Set(), sa = ch(s, "axes"), ta = ch(t, "axes");
  for (const m of r.pins.motors) {
    const mn = ch(ch(ta, m.axis), "motor" + m.motor), st = ch(mn, "standard_stepper");
    ok(mn && st && v(st, "step_pin") === `gpio.${m.step}` && v(st, "direction_pin") === `gpio.${m.dir}`, `${name}: ${m.axis}${m.motor} standard_stepper`);
    ok(mn.children.filter((c) => !/^limit_|^hard_limits$|^pulloff_mm$|^standard_stepper$/.test(c.key)).length === 0, `${name}: ${m.axis}${m.motor} only limits / pulloff / stepper`);
    for (const g of [m.step, m.dir, ...Object.values(m.limits)]) { ok(!used.has(g), `${name}: gpio.${g} used once`); used.add(g); }
    for (const [k, g] of Object.entries(m.limits)) {
      ok(v(mn, `limit_${k}_pin`) === `gpio.${g}` && g >= 35 && g <= 46, `${name}: ${m.axis}${m.motor} limit_${k} -> gpio.${g}`);
      ok(v(ch(ch(sa, m.axis), "motor" + m.motor), `limit_${k}_pin`) === m.from[k], `${name}: ${m.axis}${m.motor} limit_${k} from the source`);
    }
    for (const k of ["hard_limits", "pulloff_mm"]) ok(v(mn, k) === v(ch(ch(sa, m.axis), "motor" + m.motor), k), `${name}: ${m.axis}${m.motor} ${k} kept`);
  }
  for (const a of r.axes) {
    const sx = ch(sa, a), tx = ch(ta, a);
    const want = Math.min(Number(v(sx, "steps_per_mm")), C.MAX_STEPS);
    ok(v(tx, "steps_per_mm") === String(want) && r.steps[a].to === want, `${name}: ${a} steps_per_mm ${want}`);
    for (const k of ["max_rate_mm_per_min", "acceleration_mm_per_sec2", "max_travel_mm", "soft_limits"])
      ok(v(tx, k) === v(sx, k), `${name}: ${a} ${k} kept (${v(sx, k)})`);
    const sh = ch(sx, "homing"), th = ch(tx, "homing");
    ok(!sh || (th && sh.children.every((c) => v(th, c.key) === c.value)), `${name}: ${a} homing block kept`);
    ok(r.rates[a] === (Number(v(sx, "max_rate_mm_per_min")) || 1000), `${name}: ${a} rate ${r.rates[a]}`);
  }
  return { r, t, ch, v };
}

(async () => {
  // a user-style file
  const u = check("user", USER), { r, t, ch, v } = u;
  ok(v(t, "name") === "Shop LR4", "user: quoted name unquoted");
  ok(r.axes.join("") === "xyz" && !ch(ch(t, "axes"), "a"), "user: A axis left out");
  ok(r.pins.motors.map((m) => m.axis + m.motor).join(" ") === "x0 y0 y1 z0", "user: motors x0 y0 y1 z0: " + r.pins.motors.map((m) => m.axis + m.motor));
  const y0 = r.pins.motors.find((m) => m.axis === "y" && m.motor === 0);
  ok(y0.limits.neg === 37 && y0.limits.pos === 43, "user: y0's two limit pins -> 37 + 43");
  ok(r.pins.motors[0].limits.all === 35, "user: x0 limit_all -> 35");
  ok(Object.keys(r.pins.motors.find((m) => m.axis === "y" && m.motor === 1).limits).length === 0, "user: y1 NO_PIN limit left out");
  ok(v(ch(ch(t, "axes"), "y"), "max_rate_mm_per_min") === "5000", "user: y rate read");
  ok(r.pins.probe.gpio === 47 && r.pins.probe.from === "gpio.35:low" && v(ch(t, "probe"), "pin") === "gpio.47", "user: probe -> gpio.47, active high");
  ok(v(ch(t, "probe"), "check_mode_start") === "false", "user: probe check_mode_start kept");
  ok(v(ch(t, "macros"), "startup_line0") === "G21" && v(ch(t, "macros"), "macro0") === "$H", "user: macros kept");
  ok(v(ch(t, "parking"), "pullout_rate_mm_per_min") === "600", "user: parking kept");
  ok(v(ch(t, "stepping"), "idle_ms") === "250", "user: idle_ms kept");
  ok(["spindle", "Laser", "coolant", "axes/a"].every((k) => r.dropped.includes(k)), "user: dropped " + r.dropped.join(", "));
  ok(r.steps.x.from === 100 && r.steps.x.to === 100 && r.steps.z.from === 400 && r.steps.z.to === C.MAX_STEPS, "user: steps from / to (capped)");
  let threw = false;
  try { C.translate("name: x\nstepping:\n  engine: timed\n"); } catch (e) { threw = /axes/.test(e.message); }
  ok(threw, "no axes -> an error");

  // V1E's JP3_LR
  let jp3 = fs.existsSync(FIX) ? fs.readFileSync(FIX, "utf8") : null;
  if (!jp3) {
    try {
      const res = await fetch(V1E);
      if (res.ok) { jp3 = await res.text(); fs.mkdirSync(path.dirname(FIX), { recursive: true }); fs.writeFileSync(FIX, jp3); }
    } catch (e) { /* offline */ }
  }
  if (!jp3) console.log("JP3_LR: skipped (offline, no build/fixtures/JP3_LR.yaml)");
  else {
    const j = check("JP3_LR", jp3).r;
    ok(j.pins.motors.map((m) => m.axis + m.motor + ":" + Object.entries(m.limits).map(([k, g]) => k + g)).join(" ") ===
      "x0:neg35 y0:neg37 y1:neg38 z0:pos39 z1:pos40", "JP3_LR: motors + limits " + j.pins.motors.map((m) => m.axis + m.motor + JSON.stringify(m.limits)).join(" "));
    ok(j.pins.probe && j.pins.probe.from === "gpio.36:low", "JP3_LR: probe");
    ok(j.dropped.join(",") === "uart1,i2so,coolant,control,user_outputs", "JP3_LR: dropped " + j.dropped.join(","));
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
