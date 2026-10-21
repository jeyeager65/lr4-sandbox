// gcode_play.js: the page plays the strut plate G-code TEXT through cnc-gcode-tools (web/js/lib/cnc-gcode-tools).
//   node tests/test_gcode_play.js     (needs `npm install` in tests/ once for polygon-clipping)
// At a few strut lengths, on the file strut_cam.js writes: the pauses / probe / messages come out as FluidNC would
// show them, playback halts at each M0 and resumes past it, the touch plate shows between its two pauses, and
// carving the whole file frees both plates (holes + outlines through, tabs left, faces untouched, no rapid in the
// stock). G20: an inch copy of a file plays exactly like the mm one, and so does a file switching G20 / G21.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const pc = require("polygon-clipping");
const SC = require("../web/js/strut_cam.js");

// the page loads these as classic scripts (their classes are globals): one shared context here
const ctx = vm.createContext({ console, performance, Math, Map, Set, Float64Array, Float32Array, Uint8Array, Symbol });
for (const f of ["lib/cnc-gcode-tools/gcode-expander.js", "lib/cnc-gcode-tools/stock-sim.js", "lib/cnc-gcode-tools/parser.js",
  "lib/cnc-gcode-tools/animator.js", "gcode_play.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "js", f), "utf8"), ctx, { filename: f });
const GP = vm.runInContext("self = this; GcodePlay", ctx), StockSimulator = vm.runInContext("StockSimulator", ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

(async () => {
  for (const [strut, opts] of [[600, {}], [830, {}], [1200, { tabs: 0 }], [830, { step: 3.5, tabs: 6, plate: 0 }]]) {
    const tag = `L${strut} ${JSON.stringify(opts)}`;
    const job = SC.job(pc, strut, opts), o = job.opts, tl = await GP.load(job.gcode);
    const kinds = tl.events.map((e) => e.kind);
    ok(!kinds.includes("alarm"), `${tag}: alarm ${tl.events.filter((e) => e.kind === "alarm").map((e) => e.text)}`);
    ok(kinds[kinds.length - 1] === "end", `${tag}: ends with M30 (${kinds.slice(-3)})`);
    ok(tl.units === "mm" && tl.stock && tl.stock.xmax === +job.stock.xmax.toFixed(3), `${tag}: stock from the header`);
    const pauses = tl.events.filter((e) => e.kind === "pause");
    const probe = tl.events.find((e) => e.kind === "probe");
    if (o.plate) {
      ok(pauses.length === 2 && /Attach Probe/.test(GP.pauseText(tl, pauses[0])) && /Remove Probe/.test(GP.pauseText(tl, pauses[1])),
        `${tag}: pauses ${pauses.map((e) => GP.pauseText(tl, e))}`);
      ok(probe && /Z is now 0\.500/.test(probe.text), `${tag}: probe ${probe && probe.text}`);
      ok(tl.plates.length === 1 && tl.plates[0].t0 === pauses[0].time && tl.plates[0].t1 === pauses[1].time &&
        Math.abs(tl.plates[0].z) < 1e-9, `${tag}: touch plate ${JSON.stringify(tl.plates)}`);
    } else ok(pauses.length >= 1 && !probe && tl.plates.length === 0, `${tag}: no plate: ${pauses.length} pauses, probe ${!!probe}`);

    // play at a huge speed: halts at each pause, resumes past it, then runs to the end
    let s = 0, k = 0, stops = [];
    for (let n = 0; n < 1000 && s < tl.total; n++) {
      const r = GP.step(tl, s, 1, 1e6, k);
      s = r.t; k = r.k;
      if (r.stop) stops.push(r.stop);
    }
    ok(s >= tl.total && stops.length === pauses.length && stops.every((e, i) => e === pauses[i]), `${tag}: stops ${stops.length} / ${pauses.length}`);
    ok(GP.pending(tl, pauses[0].time) === tl.events.indexOf(pauses[0]) + 1 || tl.events[tl.events.indexOf(pauses[0]) + 1].time === pauses[0].time,
      `${tag}: pending() after the first pause`);
    const m = GP.message(tl, tl.total);
    ok(m && /Done - Turn Off Router|Program end/.test(m.text), `${tag}: last message ${m && m.text}`);
    const est = job.minutes * 60;
    ok(tl.total > 0.5 * est && tl.total < 1.5 * est, `${tag}: clock ${(tl.total / 60).toFixed(1)} min vs estimate ${job.minutes.toFixed(1)}`);
    let worst = 0;
    for (let i = 0; i < tl.segs.length; i += 37) {      // just before each move ends: at its end (moves can jump:
      if (tl.t[i] - (i ? tl.t[i - 1] : 0) < 1e-6) continue;   // a probe is drawn from 5 mm above its contact)
      const p = GP.at(tl, tl.t[i] - 1e-7), e = tl.segs[i].end;
      worst = Math.max(worst, Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z));
    }
    ok(worst < 1e-4, `${tag}: at() reaches each move's end (${worst})`);

    // carve it all
    const sim = new StockSimulator(tl.stock, tl.tools, { maxCells: 4e5, snapshots: false });
    sim.setSegments(tl.segs);
    sim.advanceTo(tl.segs.length);
    ok(sim.gouges.size === 0, `${tag}: ${sim.gouges.size} rapids cut the stock`);
    const S = tl.stock, h = (x, y) => sim.heights[Math.round((y - S.ymin) / sim.dy) * sim.vx + Math.round((x - S.xmin) / sim.dx)];
    const bottom = Math.fround(S.zmin), cell = Math.hypot(sim.dx, sim.dy), top = -o.t - o.through + o.tabH;
    let holes = 0, holesBad = 0, pathN = 0, pathBad = 0, face = 0, faceBad = 0, tabs = 0;
    for (const op of job.ops) {
      for (const c of op.holes || []) { holes++; if (h(c.x, c.y) > bottom + 1e-4) holesBad++; }
      for (const el of op.path || []) {
        if (el.type !== "line") continue;
        const L = Math.hypot(el.b[0] - el.a[0], el.b[1] - el.a[1]), d = [(el.b[0] - el.a[0]) / L, (el.b[1] - el.a[1]) / L];
        for (let q = 2; q < L - 2; q += 5) {
          const p = [el.a[0] + d[0] * q, el.a[1] + d[1] * q], z = h(p[0], p[1]);
          pathN++;                                     // on the path: through, or a tab (its top or a 45 deg ramp)
          if (z > bottom + 1e-4 && z < top + 0.15) tabs++;
          else if (z > bottom + 1e-4) pathBad++;
          const w = o.bit / 2 + 2 * cell + 0.5, f = [p[0] + d[1] * w, p[1] - d[0] * w];   // inside, past the bit
          if (!job.ops.some((op2) => (op2.holes || []).some((c) => Math.hypot(c.x - f[0], c.y - f[1]) < o.holeD / 2 + 1))) {
            face++; if (h(f[0], f[1]) < S.zmax - 1e-4) faceBad++;
          }
        }
      }
    }
    ok(holes > 0 && holesBad === 0, `${tag}: ${holesBad}/${holes} hole centres not through`);
    ok(pathBad === 0, `${tag}: ${pathBad}/${pathN} outline points not through`);
    ok(o.tabs ? tabs > 0 : tabs === 0, `${tag}: ${tabs} outline points at tab height (tabs ${o.tabs})`);
    ok(face > 50 && faceBad === 0, `${tag}: ${faceBad}/${face} plate face points cut`);
    console.log(`${tag}: ${tl.lines} lines -> ${tl.segs.length} moves, ${(tl.total / 60).toFixed(1)} min (estimate ${job.minutes.toFixed(1)}), ` +
      `${tl.events.length} events, holes ${holes}, outline ${pathN} (tabs ${tabs}), face ${face}`);
  }

  // G20 / G21: the same moves written in inches (and switching part way) play exactly as the mm file
  const mm = ["(CNCSIM 1 UNITS=mm)", "(Stock: XMIN=0 XMAX=50.8 YMIN=0 YMAX=25.4 ZMIN=-6.35 ZMAX=0)",
    "(ToolDef 1: SHAPE=flat D=3.175 NAME=eighth)", "G21 G90", "T1", "G0 Z5", "G0 X10 Y10", "G1 Z-3 F300",
    "G1 X40 Y12.7 F1200", "G2 X40 Y5 I0 J-3.85", "M0 (MSG, half way)", "G1 X10 Y5", "G0 Z5", "M30"];
  const num = /([XYZIJF])(-?[\d.]+)/g, inch = (l) => l.replace(num, (_, a, v) => a + (+v / 25.4).toFixed(6));
  const inFile = mm.map((l, i) => (i === 0 ? "(CNCSIM 1 UNITS=in)" : i === 1 ? "(Stock: XMIN=0 XMAX=2 YMIN=0 YMAX=1 ZMIN=-0.25 ZMAX=0)" :
    i === 2 ? "(ToolDef 1: SHAPE=flat D=0.125 NAME=eighth)" : i === 3 ? "G20 G90" : /^G[0-3]/.test(l) ? inch(l) : l));
  const mixed = mm.map((l, i) => (i >= 8 && i <= 9 ? inch(l) : l)).flatMap((l, i) => (i === 8 ? ["G20", l] : i === 10 ? ["G21", l] : [l]));
  const a = await GP.load(mm.join("\n")), b = await GP.load(inFile.join("\n")), c = await GP.load(mixed.join("\n"));
  // arcs are split by a chord tolerance in the file's units, so an inch file has fewer pieces: compare the paths -
  // every vertex of q on p's polyline (the inch file's chords sag up to ~0.07 mm here)
  const onPath = (p, q) => Math.max(...q.segs.map((s) => Math.min(...p.segs.map(({ start: u, end: v }) => {
    const d = [v.x - u.x, v.y - u.y, v.z - u.z], L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    const f = L2 ? Math.min(1, Math.max(0, ((s.end.x - u.x) * d[0] + (s.end.y - u.y) * d[1] + (s.end.z - u.z) * d[2]) / L2)) : 0;
    return Math.hypot(u.x + d[0] * f - s.end.x, u.y + d[1] * f - s.end.y, u.z + d[2] * f - s.end.z);
  }))));
  const same = (p, q) => Math.max(onPath(p, q), onPath(q, p));
  ok(b.units === "in" && c.units === "mixed" && a.units === "mm", `units ${a.units} ${b.units} ${c.units}`);
  ok(same(a, b) < 0.1, `G20 file: ${b.segs.length} moves, off the mm path by ${same(a, b).toFixed(4)}`);
  ok(same(a, c) < 0.1, `G20/G21 file: ${c.segs.length} moves, off the mm path by ${same(a, c).toFixed(4)}`);
  // G20 on the move's own line: the line's F word is already in inches (units switch before the other words)
  const d = await GP.load(mm.map((l, i) => (i === 8 ? "G20 " + inch(l) : i === 9 ? inch(l) : i === 10 ? "G21 " + l : l)).join("\n"));
  ok(same(a, d) < 0.1 && Math.abs(a.total - d.total) < 1e-3 * a.total,
    `G20 on the move's line: off the mm path by ${same(a, d).toFixed(4)}, clock ${d.total.toFixed(2)} vs ${a.total.toFixed(2)} s`);
  ok(Math.abs(b.stock.xmax - 50.8) < 1e-9 && Math.abs(b.tools.get(1).diameter - 3.175) < 1e-9, `G20 stock / tool in mm`);
  ok(Math.abs(a.total - b.total) < 1e-3 * a.total && Math.abs(a.total - c.total) < 1e-3 * a.total,
    `G20 clock ${a.total.toFixed(2)} / ${b.total.toFixed(2)} / ${c.total.toFixed(2)} s`);
  console.log(`G20/G21: ${a.segs.length} moves the same in mm, inch and mixed files; ${a.total.toFixed(1)} s`);

  // several tools: each tool change re-probes, so each probe gets its own touch plate window (attach -> remove
  // pause), and a probe with no pauses next to it only the probe + retract - never through a tool's cutting
  const tc = ["(CNCSIM 1 UNITS=mm)", "(Stock: XMIN=0 XMAX=100 YMIN=0 YMAX=100 ZMIN=-6 ZMAX=0)",
    "(ToolDef 1: SHAPE=flat D=3.175 NAME=eighth)", "(ToolDef 2: SHAPE=flat D=6.35 NAME=quarter)", "G21 G90",
    "T1", "G0 Z10", "G0 X6 Y6", "M0 (MSG, Attach Probe)", "G38.2 Z-50 F100 P0.5", "G0 Z10", "M0 (MSG, Remove Probe)",
    "G0 X20 Y20", "G1 Z-2 F300", "G1 X60 F900", "G0 Z10",
    "M0 (MSG, Change to T2)", "T2", "G0 X6 Y6", "M0 (MSG, Attach Probe)", "G38.2 Z-50 F100 P0.5", "G0 Z10", "M0 (MSG, Remove Probe)",
    "G0 X20 Y40", "G1 Z-3 F300", "G1 X60 F900", "G0 Z10",
    "G0 X80 Y80", "G38.2 Z-50 F100 P0.5", "G0 Z10", "G0 X20 Y60", "G1 Z-1 F300", "G1 X60 F900", "G0 Z10", "M0 (MSG, Done)", "M30"];
  const m3 = await GP.load(tc.join("\n"));
  const pz = m3.events.filter((e) => e.kind === "pause"), txt = (e) => GP.pauseText(m3, e);
  const att = pz.filter((e) => /Attach/.test(txt(e))), rem = pz.filter((e) => /Remove/.test(txt(e)));
  const probes = m3.segs.map((s, i) => [s, i]).filter(([s]) => s.type === "probe");
  ok(!m3.events.some((e) => e.kind === "alarm") && probes.length === 3 && m3.plates.length === 3, `tool changes: ${probes.length} probes, ${m3.plates.length} plates`);
  ok(m3.plates.slice(0, 2).every((q, n) => q.t0 === att[n].time && q.t1 === rem[n].time), `tool changes: plate windows = attach -> remove pauses`);
  const [, i3] = probes[2], q3 = m3.plates[2], change = pz.find((e) => /Change to T2/.test(txt(e)));
  ok(q3.t0 === m3.t[i3 - 1] && q3.t1 === m3.t[i3 + 1] && q3.t0 > rem[1].time, `tool changes: a probe without pauses = probe + retract (${q3.t0.toFixed(2)}-${q3.t1.toFixed(2)})`);
  ok(m3.plates[0].t1 < change.time && m3.plates[1].t0 > change.time, `tool changes: no plate through the tool change`);
  console.log(`tool changes: 3 probes, plates ${m3.plates.map((q) => `${q.t0.toFixed(1)}-${q.t1.toFixed(1)} s`).join(", ")}`);

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
