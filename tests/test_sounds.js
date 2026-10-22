// web/js/sounds.js pure helpers: the stepper voice (TMC2209 StealthChop: the electrical frequency = full steps / 4),
// the smoothed velocity at the real machine's speed, config.yaml parsing, the WAV writer.
//   node tests/test_sounds.js   (in npm test)
"use strict";
const S = require("../web/js/sounds.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// V1E JP3_LR-style axes (trimmed): X / Y 50 steps/mm, Z 200, 8 microsteps, StealthChop; Y in SpreadCycle here to see it read
const YAML = `
axes:
  shared_stepper_disable_pin: NO_PIN
  x:
    steps_per_mm: 50.000
    max_rate_mm_per_min: 6000.000
    motor0:
      tmc_2209:
        microsteps: 8
        run_mode: StealthChop
  y:
    steps_per_mm: 50.000
    motor0:
      tmc_2209:
        microsteps: 8
        run_mode: SpreadCycle
    motor1:
      tmc_2209:
        microsteps: 16
  z:
    steps_per_mm: 200.000
    motor0:
      tmc_2209:
        microsteps: 8
spindle:
  microsteps: 99
`;
const st = S.stepsFromYaml(YAML);
ok(st.x.perMm === 50 && st.x.micro === 8 && st.x.mode === "StealthChop", "x: " + JSON.stringify(st.x));
ok(st.y.perMm === 50 && st.y.micro === 8 && st.y.mode === "SpreadCycle", "y (first motor's): " + JSON.stringify(st.y));
ok(st.z.perMm === 200 && st.z.micro === 8 && st.z.mode === "StealthChop", "z (no run_mode = StealthChop): " + JSON.stringify(st.z));
const none = S.stepsFromYaml("");
ok(none.x.perMm === 50 && none.z.perMm === 200 && none.x.micro === 8, "no config: V1E's numbers");

// full steps and the voice: X at 50 mm/s = 312.5 full steps/s -> 78.1 Hz; a 5 mm/s Z plunge -> 31.25 Hz; a creep is silent
ok(near(S.fullStepHz(50, 50, 8), 312.5), "full-step rate");
const vx = S.voice(50, st.x), vz = S.voice(-5, st.z), slow = S.voice(0.5, st.x);
ok(near(vx.hz, 78.125) && near(vx.gain, 1), "X 50 mm/s: " + JSON.stringify(vx));
ok(near(vz.hz, 31.25) && vz.gain > 0.3 && vz.gain < 1, "Z -5 mm/s (direction doesn't matter): " + JSON.stringify(vz));
ok(slow.gain === 0 && slow.whir > 0.3, "0.5 mm/s: no stepper tone, the mechanics whir");
ok(S.voice(1.67, st.z).gain > 0 || S.voice(1.67, st.z).whir > 0.3, "a probe (Z 1.7 mm/s) is heard");
ok(S.voice(0.05, st.x).whir === 0, "standing still: silent");
// time-lapse: at 62x a zig-zag (+-2 mm/s real, every frame) blends into a steady speed, not into silence
let zz = null, zp = [0, 0, 0];
for (let i = 1; i <= 120; i++) { const q = [zp[0] + (i % 2 ? 1 : -1) * 2 * 62 / 30, 0, 0]; zz = S.velocity(zp, q, 1 / 30, 62, zz); zp = q; }
ok(near(zz[0], 2, 0.05), "62x zig-zag: steady 2 mm/s (" + zz[0].toFixed(3) + ")");
ok(S.voice(10000, st.x).hz === 2000, "pitch held at the top");

// velocity: steady motion converges to the real speed; the time scale divides it out; no previous pose = 0
let v = null, p = [0, 0, 0];
for (let i = 1; i <= 90; i++) { const q = [i * 5, 0, -i * 0.5]; v = S.velocity(p, q, 1 / 30, 10, v); p = q; }
ok(near(v[0], 15, 1e-3) && near(v[2], 1.5, 1e-3), "5 mm a frame at 30 fps, 10x replay = 15 mm/s real (speeds, not signs): " + v.map((x) => x.toFixed(3)));
ok(S.velocity(null, [5, 5, 5], 1 / 30, 1, null).every((x) => x === 0), "first frame: no velocity");
ok(S.velocity([0, 0, 0], [5, 0, 0], 0, 1, [3, 0, 0])[0] === 3, "dt = 0 (a second draw in one frame): unchanged");

// WAV: header + samples
const w = S.wavBytes([Float32Array.from([0, 1, -1, 2])], 48000), dv = new DataView(w.buffer);
ok(w.length === 44 + 8 && String.fromCharCode(...w.slice(0, 4)) === "RIFF" && String.fromCharCode(...w.slice(8, 12)) === "WAVE", "WAV header");
ok(dv.getUint32(24, true) === 48000 && dv.getUint16(34, true) === 16, "48 kHz, 16-bit");
ok(dv.getInt16(46, true) === 32767 && dv.getInt16(48, true) === -32767 && dv.getInt16(50, true) === 32767, "samples, clipped");

// the router plan: the strut job's hand-switched router (its header's dial table, the M0 messages), M3 / M5 files
const STRUT = ["(===== T1: 1/8in 1-flute upcut - Kobalt trim router dial 3 = ~18000 RPM, ~26 min =====)", "G21", "M0 (MSG, Attach Probe)",
  "G38.2 Z-20 F100", "M0 (MSG, Remove Probe and Turn On Router at Dial 3)", "G1 X10 F1000", "(MSG, Done - Turn Off Router)", "M30"].join("\n");
const sp = S.routerPlan(STRUT);
ok(sp.said && sp.events.length === 2 && sp.events[0].line === 5 && sp.events[0].rpm === 18000 && sp.events[1].line === 7 && sp.events[1].rpm === 0,
  "strut job plan: " + JSON.stringify(sp.events));
ok(S.routerAt(sp, 4) === 0 && S.routerAt(sp, 6) === 18000 && S.routerAt(sp, 8) === 0, "off while probing, on for the cuts, off at the end");
const mp = S.routerPlan("G21\nM3 S12000\nG1 X5\nS16000\nM5\n");
ok(S.routerAt(mp, 1) === 0 && S.routerAt(mp, 3) === 12000 && S.routerAt(mp, 4) === 16000 && S.routerAt(mp, 5) === 0, "M3 S / S / M5: " + JSON.stringify(mp.events));
ok(!S.routerPlan("G1 X5").said && S.routerAt(S.routerPlan("G1 X5"), 1) === S.DEFAULT_RPM, "a file that never says: dial 3 the whole job");
ok(S.dialRpm(3.5) === 20000 && S.dialRpm(6) === 35000 && S.dialRpm(0.5) === 10000, "Kobalt dial table, half steps interpolated");

// the engine without Web Audio (node): spin-up / run-down, load, the vac, clicks in the trace
const e = S.create();
e.record(true);
const run = (secs, o) => { for (let i = 0; i < secs * 30; i++) e.update([0, 0, 0], 1 / 30, 1, st, o); };
run(2, { rpm: 18000 });
let L = e.levels();
ok(L.router.rpm > 17500 && L.router.gain > 0.95 && L.vac.spin > 0.85, `2 s after on: ${L.router.rpm.toFixed(0)} RPM, vac ${L.vac.spin.toFixed(2)}`);
run(1, { rpm: 18000, mrr: 150, flutes: 1 });
L = e.levels();
ok(L.cut.load > 0.95 && L.cut.gain > 0.95 && L.router.rpm < 17100 && near(L.cut.tooth, L.router.hz, 1e-9), `full load: ${L.router.rpm.toFixed(0)} RPM (sags), cut ${L.cut.gain.toFixed(2)}, 1 flute`);
e.event("switch"); e.event("nope");
run(1.5, { rpm: 0 });
L = e.levels();
ok(L.router.rpm > 4000 && L.router.rpm < 9000 && L.cut.gain === 0 && L.vac.spin > 0.5, `1.5 s after off: ${L.router.rpm.toFixed(0)} RPM, vac still ${L.vac.spin.toFixed(2)} (coasting)`);
ok(e.events().length === 1 && e.events()[0][1] === "switch" && near(e.events()[0][0], 3, 1e-9) && e.traceLength() === 135, "click kept at its frame's time: " + JSON.stringify(e.events()));

console.log(fails ? `sounds: ${fails} of ${checks} failed` : `sounds: all ${checks} passed`);
process.exit(fails ? 1 : 0);
