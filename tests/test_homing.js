// homing.js: the Home button's plan, as FluidNC homes V1E's JP3_LR (Z first, then X + Y; seek, pull off, feed, pull
// off; MPos = mpos_mm at the pulled-off spot).   node tests/test_homing.js
// From a few poses: Z's moves all come before X / Y's, every axis ends at its trip + pulloff, both switch passes
// click at the trip, MPos there = mpos_mm, the clock follows the rates, GcodePlay.at plays the plan. Settings from
// V1E's layout of config.yaml, a yaml with no homing block (fallback), and Z homed down (sign).
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = vm.createContext({ console, performance, Math, Map, Set, Float64Array, Float32Array, Uint8Array, Symbol });
for (const f of ["lib/cnc-gcode-tools/gcode-expander.js", "lib/cnc-gcode-tools/parser.js", "lib/cnc-gcode-tools/animator.js",
  "gcode_play.js", "homing.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "js", f), "utf8"), ctx, { filename: f });
const H = vm.runInContext("self = this; Homing", ctx), GP = vm.runInContext("GcodePlay", ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// V1E's JP3_LR axes, cut down (same nesting, comments and a commented-out pulloff)
const YAML = ["axes:", "  x:", "    max_travel_mm: 1220", "    homing:", "      cycle: 2", "      positive_direction: false",
  "      mpos_mm: 3", "      feed_mm_per_min: 300.000", "      seek_mm_per_min: 1500.000", "      settle_ms: 500", "    #X",
  "    motor0:", "      pulloff_mm: 4.000", "  y:", "    homing:", "      cycle: 2", "      positive_direction: false",
  "      mpos_mm: 3", "      feed_mm_per_min: 300.000", "      seek_mm_per_min: 1500.000", "      settle_ms: 500",
  "    motor0:", "      pulloff_mm: 4.000", "    motor1:", "      pulloff_mm: 4.000", "  z:", "    homing:", "      cycle: 1",
  "      positive_direction: true", "      mpos_mm: 3", "      feed_mm_per_min: 300.000", "      seek_mm_per_min: 800.000",
  "      settle_ms: 500", "    motor0:", "      pulloff_mm: 4.000", "#      pulloff_mm: 3.000"].join("\n");

const strip = (o) => Object.fromEntries(Object.entries(o).map(([a, v]) => [a, Object.assign({}, v, { from: undefined })]));
const S = H.settings(YAML);
ok(JSON.stringify(strip(S)) === JSON.stringify(strip(H.V1E)) && S.x.from === "yaml", `V1E yaml -> ${JSON.stringify(S)}`);
const none = H.settings("axes:\n  x:\n    max_travel_mm: 600\n");
ok(["x", "y", "z"].every((a) => none[a].from === "fallback" && none[a].cycle === H.V1E[a].cycle), "no homing block -> fallback");
const mine = H.settings(YAML.replace("pulloff_mm: 4.000\n  y", "pulloff_mm: 2.5\n  y").replace("mpos_mm: 3\n      feed_mm_per_min: 300.000\n      seek_mm_per_min: 1500.000\n      settle_ms: 500\n    #X", "mpos_mm: 0\n      feed_mm_per_min: 300.000\n      seek_mm_per_min: 1500.000\n      settle_ms: 500\n    #X"));
ok(mine.x.pulloff === 2.5 && mine.x.mpos === 0 && mine.y.pulloff === 4, `own values ${JSON.stringify(mine.x)}`);

// 26 x 50 in travel (pose space, mm from the parked pose; as config_model.travel)
const TV = { x: [-10.2, 651.9], y: [-20.4, 1251.1], z: [-80, 22] };
for (const [name, speed] of [["fast", undefined], ["real", { seek: 1, feed: 1 }]]) {
  for (const pose of [{ x: 0, y: 0, z: 0 }, { x: 640, y: 1200, z: -75 }, { x: -10.2, y: -20.4, z: 22 }, { x: 300, y: 5, z: 21 }]) {
    const tag = `${name} from ${JSON.stringify(pose)}`, pl = H.plan(pose, TV, S, speed), k = Object.assign({}, H.FAST, speed);
    const end = pl.segs[pl.segs.length - 1].end;
    ok(near(end.x, TV.x[0] + 4) && near(end.y, TV.y[0] + 4) && near(end.z, TV.z[1] - 4), `${tag}: end ${JSON.stringify(end)}`);
    ok(near(pl.home.x, end.x) && near(pl.home.y, end.y) && near(pl.home.z, end.z), `${tag}: home`);
    const m = H.mpos(S, pl.home, end);
    ok(near(m.x, 3) && near(m.y, 3) && near(m.z, 3), `${tag}: MPos at home ${JSON.stringify(m)}`);
    // order: every Z move (cycle 1) before any X / Y move (cycle 2); Z alone in cycle 1, X / Y alone in cycle 2
    const lastZ = pl.segs.map((g) => g.cycle).lastIndexOf(1), firstXY = pl.segs.findIndex((g) => g.cycle === 2);
    ok(lastZ < firstXY, `${tag}: Z before X / Y`);
    ok(pl.segs.every((g) => g.cycle === 1 ? near(g.start.x, g.end.x) && near(g.start.y, g.end.y) : near(g.start.z, g.end.z)), `${tag}: axes per cycle`);
    ok(pl.segs.every((g, i) => i === 0 || (near(g.start.x, pl.segs[i - 1].end.x) && near(g.start.y, pl.segs[i - 1].end.y)
      && near(g.start.z, pl.segs[i - 1].end.z))), `${tag}: continuous`);
    // clicks: two per axis (seek, feed), at the trip
    for (const a of ["x", "y", "z"]) {
      const ev = pl.events.filter((e) => e.axis === a && e.kind === "trip");
      const rel = pl.events.filter((e) => e.axis === a && e.kind === "release");
      ok(rel.length === 2 && rel.every((e, i) => e.time > ev[i].time && e.phase === "pulloff"), `${tag}: ${a} releases after each trip`);
      ok(ev.length === 2 && ev[0].phase === "seek" && ev[1].phase === "feed", `${tag}: ${a} clicks ${JSON.stringify(ev)}`);
      for (const e of ev) { const q = GP.at(pl, e.time - 1e-9); ok(near(q[a], H.trip(S, TV, a), 1e-3), `${tag}: ${a} at trip ${q[a]}`); }
    }
    // clock: seek legs at seek x k, the rest at feed x k, settles at settle / k.feed
    const dist = (a, from) => Math.abs(H.trip(S, TV, a) - from);
    const zT = dist("z", pose.z) / (800 * k.seek / 60) + 3 * 4 / (300 * k.feed / 60) + 4 * 0.5 / k.feed;
    const xyT = Math.max(dist("x", pose.x), dist("y", pose.y)) / (1500 * k.seek / 60) + 3 * 4 / (300 * k.feed / 60) + 4 * 0.5 / k.feed;
    ok(near(pl.total, zT + xyT, 1e-6), `${tag}: total ${pl.total} vs ${zT + xyT}`);
    // X and Y each stop at their own trip while the other goes on (squaring)
    const xStop = pl.events.find((e) => e.axis === "x").time, yStop = pl.events.find((e) => e.axis === "y").time;
    if (Math.abs(xStop - yStop) > 1e-6) {
      const first = xStop < yStop ? "x" : "y", mid = (xStop + yStop) / 2, q = GP.at(pl, mid);
      ok(near(q[first], H.trip(S, TV, first)), `${tag}: ${first} waits at its trip`);
    }
    // GcodePlay plays it: step to the end without stops
    let t = 0, n = 0;
    while (t < pl.total && n++ < 1e5) t = GP.step(Object.assign({}, pl, { events: [] }), t, 1 / 60, 1, 0).t;
    ok(near(t, pl.total) && near(GP.at(pl, t).x, end.x), `${tag}: GcodePlay.step runs it`);
  }
}

// Z homed down (positive_direction false): trips at travel.z[0], pulls off upward; MPos still mpos at home and soft
// range below / above it
{
  const s = H.settings(YAML.replace("cycle: 1\n      positive_direction: true", "cycle: 1\n      positive_direction: false"));
  const pl = H.plan({ x: 0, y: 0, z: 0 }, TV, s), end = pl.segs[pl.segs.length - 1].end;
  ok(near(end.z, TV.z[0] + 4), `Z down: end ${end.z}`);
  ok(near(H.mpos(s, pl.home, { x: end.x, y: end.y, z: end.z + 10 }).z, 13), "Z down: MPos up from home");
  ok(H.softRange(s.z, 98).join() === "3,101" && H.softRange(S.z, 98).join() === "-95,3", "soft ranges");
}
// an axis with cycle 0 isn't homed: stays put, MPos null
{
  const s = H.settings(YAML.replace("cycle: 2\n      positive_direction: false\n      mpos_mm: 3\n      feed_mm_per_min: 300.000\n      seek_mm_per_min: 1500.000\n      settle_ms: 500\n    #X", "cycle: 0\n    #X"));
  const pl = H.plan({ x: 100, y: 0, z: 0 }, TV, s);
  ok(pl.segs.every((g) => g.start.x === 100 && g.end.x === 100) && H.mpos(s, pl.home, { x: 100, y: 0, z: 0 }).x === null, "X cycle 0");
}

console.log(`${checks - fails}/${checks} homing checks passed`);
process.exit(fails ? 1 : 0);
