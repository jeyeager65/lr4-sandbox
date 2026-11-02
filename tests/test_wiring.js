// the wiring list (web/data/wiring.js, Part 51a): its ends exist, the Jackpot 3 pinout is followed (docs/WIRING.md),
// the board's spots sit on the board in the box. node tests/test_wiring.js
const W = require("../web/data/wiring.js");
const cfg = require("../web/data/lr4_config.json");
let checks = 0, fails = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("  FAIL " + m); } else console.log("  ok   " + m); };

const names = new Set(cfg.parts.map((p) => p.meta && p.meta.name).filter(Boolean));
const PAGE_MADE = new Set(["SwitchPanel_Box", "TableHub_Boxes", "TableHub_Inlet"]);   // drawn by the page itself (scene.js), not in the build's data
const ends = W.runsFor(true).concat(W.RUNS).flatMap((r) => [r.from, r.to]).filter(Boolean);   // the hub variants too (Part 52c)
const badPart = ends.filter((e) => e.part && !names.has(e.part) && !PAGE_MADE.has(e.part)).map((e) => e.part);
ok(!badPart.length, `every part end is a part of the model (${badPart.join() || "all"})`);
const badSpot = ends.filter((e) => e.board && !W.JP3.spots[e.board]).map((e) => e.board);
ok(!badSpot.length, `every board end is one of the Jackpot's spots (${badSpot.join() || "all"})`);
ok(new Set(W.RUNS.map((r) => r.id)).size === W.RUNS.length, "run ids unique");

// the V1E pinout for the LowRider: X, Y0, Z0, Y1 (A), Z1 (B); endstops 25 / 33 / 32 / 35 / 34; the probe 36
const to = (id) => (W.RUNS.find((r) => r.id === id) || {}).to || {};
ok(["x-motor:X", "y0-motor:Y", "z0-motor:Z", "y1-motor:A", "z1-motor:B"].every((s) => { const [id, p] = s.split(":"); return to(id).board === "jp3.motor." + p; }),
  "motors: X, Y0, Z0 on X / Y / Z, Y1 on A, Z1 on B (V1E's LowRider pinout)");
ok(["x-stop:25", "y0-stop:33", "z0-stop:32", "y1-stop:35", "z1-stop:34", "probe:36"].every((s) => { const [id, g] = s.split(":"); return to(id).board === "jp3.in." + g; }),
  "endstops on gpio 25 / 33 / 32 / 35 / 34, the probe on 36");
const used = W.RUNS.map((r) => r.to && r.to.board).filter((b) => b && b !== "jp3.power");
ok(new Set(used).size === used.length, "no two runs on one header (but the power input: the supply + the fan)");

// V1E's extenders: 3 (the core, Y1, Z1), each a motor + its endstop
const ext = W.RUNS.flatMap((r) => r.segs.filter((s) => s.kind === "ribbon").map((s) => [r.id, s.shares]));
const pairs = new Set(ext.map(([a, b]) => [a, b].sort().join("+")));
ok(pairs.size === 3 && [...pairs].every((p) => /^x-motor\+x-stop$|^y1-motor\+y1-stop$|^z1-motor\+z1-stop$/.test(p)) && ext.every(([a, b]) => ext.some(([c, d]) => c === b && d === a)),
  `3 extenders, each shared by a motor + its endstop both ways (${[...pairs].join(", ")})`);
ok(W.RUNS.filter((r) => r.group === "motor").every((r) => r.segs[0].kind === "lead" && r.segs[0].len === 760), "every motor starts with its own ~760 mm lead");

// fit (51b): extenders by the motor's need past its lead; the endstop shares them + its own wire cut to fit
{
  const f = W.fit({ "x-motor": 2033, "x-stop": 2103, "y1-motor": 2300, "y1-stop": 1300, "z1-motor": 1214, "z1-stop": 1201, "y0-stop": 538, probe: 2144 });
  const R = f.runs;
  ok(R["x-motor"].ext === 1 && R["x-motor"].reaches && R["y1-motor"].ext === 2 && R["z1-motor"].ext === 1, `motors: 1 extender while 760 + 1500 reaches, 2 past it (x ${R["x-motor"].ext}, y1 ${R["y1-motor"].ext}, z1 ${R["z1-motor"].ext})`);
  ok(f.extenders === 4, `extenders counted by the motors (${f.extenders})`);
  ok(R["x-stop"].ext === 1 && R["x-stop"].cut === 610 && R["x-stop"].reaches, `the X endstop: its motor's 1 extender + its own wire cut to fit (${R["x-stop"].cut} mm)`);
  ok(R["y1-stop"].ext === 2 && R["y1-stop"].cut === 150 && R["z1-stop"].cut === 150, "an endstop with spare extender length: the shortest own wire (150 mm)");
  ok(R["y0-stop"].ext === 0 && R["y0-stop"].cut === 540, `a near endstop: its own wire only (${R["y0-stop"].cut} mm)`);
  ok(!R.probe.reaches && R.probe.short === 144 && R.probe.cut === null, `the touch plate's 2 m wire: ${R.probe.short} mm short of 2144`);
}

// the spots: on the board, inside the box (its size from the data: hi_ref - lo_ref)
const box = cfg.parts.find((p) => p.meta && p.meta.name === "Jackpot3_Box"), size = box.hi_ref.map((v, i) => v - box.lo_ref[i]);
const out = Object.entries(W.JP3.spots).filter(([, s]) => s.at.some((v, i) => v < 0 || v > size[i]));
ok(!out.length, `the board's spots inside the box ${size.map((v) => v.toFixed(0)).join(" x ")} (${out.map(([k]) => k).join() || "all"})`);
ok(Object.values(W.JP3.spots).every((s) => Math.abs(Math.hypot(...s.out) - 1) < 0.01), "each spot's way out is a unit vector");
const M = ["X", "Y", "Z", "A", "B", "C"].map((p) => W.JP3.spots["jp3.motor." + p].at[0]);
ok(M.every((x, i) => i === 0 || x > M[i - 1]) && Math.abs(M[1] - M[0] - 15.1) < 0.3, `the 6 motor headers in a row, ~15.1 mm apart (${M.map((x) => x.toFixed(1)).join(" ")})`);

console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
