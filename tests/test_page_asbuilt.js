// Part 32 in headless Chrome (serve.py's headers): the machine as built.
//  - a power-up leaves the gantry racked / the beam off level (within the limits); the drawing racks / tilts it (x50);
//  - FluidNC $H: each side to its own switch - V1E's config (equal pulloffs) leaves it out by the GUESS stops (0.8 / 0.5);
//    stops set to 0 square it;
//  - a New spoilboard is warped (its high spot at the top); the router 0.5 deg out of tram leaves ridges between
//    surfacing passes (~ step-over x tan 0.5 deg), trammed = flat;
//  - FluidNC: each motor boots where its side is (side 2 = side 1 + E, read back from the motors' steps) and $H on
//    the per-motor switches leaves the same residual. (Part 34: all on FluidNC; Basic's homing / playback were retired.)
//   node tests/test_page_asbuilt.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const A_HELPERS = `
  window.A = {
    async play(text, name) {
      await LR4Job.add([new File([text], name)]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/" + name && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();   // Run on FluidNC (10x): wait for it to start, then to end
      await T.sleep(500);                            // the Start check (a different bit in the router): its ▶ Start
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      const started = await T.until(() => LR4Job.running(), 20000);
      if (!started) (window.A.misses = window.A.misses || []).push(name + ": " + document.getElementById("job-status").textContent + " / " + LR4Ctl.state() + " homed " + LR4Ctl.homed());
      const t0 = performance.now();                  // M0 holds (the touch plate's): resumed
      while (LR4Job.running() && performance.now() - t0 < 300000) {
        await T.sleep(200);
        if (LR4Job.held() && !document.getElementById("job-pop").hidden) document.getElementById("job-resume").click();
      }
      await T.until(() => !LR4Job.running() && /^Done\\./.test(document.getElementById("job-status").textContent), 30000);
    },
    // the spoilboard's heights across a row (table y), x from..to: { lo, hi }
    row(y, x0, x1) {
      const s = LR4Job.spoil(), j = Math.round((y - s.stock.ymin) / s.dy); let lo = Infinity, hi = -Infinity;
      for (let i = Math.ceil((x0 - s.stock.xmin) / s.dx); i <= Math.floor((x1 - s.stock.xmin) / s.dx); i++) { const h = s.heights[j * s.vx + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); }
      return { lo, hi };
    },
    async homeNC() {                               // FluidNC (re)boots with the power-up error set (AB.E), then $H at 10x
      const prev = window.LR4FluidNC;
      LR4Ctl.start();
      await T.booted(prev); await T.idle();
      const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle(); LR4Ctl.sync();
      return LR4Ctl.homed();
    },
  };
  askBox.auto = () => true;
  true`;
// passes along Y at 40% step-over of a 25.4 mm bit, 1.5 mm into the spoilboard (below its warp)
const PASSES = (() => {
  const L = ["(LR4 surfacing test)", "(ToolDef 1: SHAPE=flat D=25.4 NAME=surfacing)", "G21 G90", "T1", "G0 Z5", "G0 X100 Y100", "G1 Z-1.5 F600"];
  for (let i = 0; i < 12; i++) L.push(`G1 X${(100 + i * 10.16).toFixed(3)} F3000`, `G1 Y${i % 2 ? 100 : 300} F3000`);
  return L.concat(["G0 Z5", "M30", ""]).join("\n");
})();

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4AsBuilt && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4Job.spoil() && !!LR4AsBuilt.geo()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    const e0 = await page.val("LR4AsBuilt.E()");      // before HELPERS (they turn it off): the power-up
    await page.val(HELPERS); await page.val(A_HELPERS);
    ok(e0.y === 0 && e0.z === 0, `off by default: no power-up error ${JSON.stringify(e0)}`);

    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      LR4AsBuilt.set({ on: true, exag: 50, stop: { y: null, z: null }, tram: { x: 0, y: 0 } });
      LR4AsBuilt.setE({ y: 1.5, z: 1 });
      const out = { drawn: LR4AsBuilt.drawn(), geo: LR4AsBuilt.geo(), note: LR4AsBuilt.note(), stops: LR4AsBuilt.stops() };
      await A.homeNC();
      out.home = LR4AsBuilt.E(); out.after = LR4AsBuilt.note();
      LR4AsBuilt.set({ stop: { y: 0, z: 0 } });
      LR4AsBuilt.setE({ y: -1, z: 0.6 });
      await A.homeNC();
      out.square = LR4AsBuilt.E();
      LR4AsBuilt.set({ stop: { y: null, z: null }, exag: 1 });
      out.drawn1 = LR4AsBuilt.drawn();
      return out;
    })()`);
    const want = (e) => Math.atan2(e * 50, a.drawn.span);
    ok(near(a.drawn.rack, want(1.5), 1e-4) && near(a.drawn.tilt, want(1), 1e-4), `drawn x50: rack ${a.drawn.rack.toFixed(4)} / tilt ${a.drawn.tilt.toFixed(4)} rad (span ${a.drawn.span.toFixed(0)} mm)`);
    ok(a.geo.span > 500 && /racked 1\.50 mm/.test(a.note) && /diagonals would differ/.test(a.note), `note: ${a.note}`);
    ok(a.stops.from.y === "guess" && near(a.home.y, 0.8, 0.02) && near(a.home.z, 0.5, 0.02), `FluidNC $H with V1E's pulloffs: out by the stops ${JSON.stringify(a.home)}`);
    ok(/\$H leaves it racked 0\.80 mm/.test(a.after), `after: ${a.after}`);
    ok(near(a.square.y, 0, 0.02) && near(a.square.z, 0, 0.02), `stops at 0: $H squares it ${JSON.stringify(a.square)}`);

    // warped New spoilboard; tram 0.5 deg -> ridges, trammed -> flat
    const b = await page.val(`(async () => {
      document.getElementById("hs-off").click();
      document.getElementById("hs-new").click(); await T.sleep(300);
      const s = LR4Job.spoil(); let lo = Infinity, hi = -Infinity;
      for (const v of s.heights) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const out = { lo, hi };
      LR4AsBuilt.set({ tram: { x: 0.5 }, stop: { y: 0, z: 0 } });   // square + level after $H: only the tram
      await A.homeNC();
      await A.play(${JSON.stringify(PASSES)}, "passes.gcode");
      out.tram = A.row(200, 130, 190);
      document.getElementById("hs-new").click(); await T.sleep(300);
      LR4AsBuilt.set({ tram: { x: 0 } });
      await A.homeNC();
      await A.play(${JSON.stringify(PASSES)}, "passes2.gcode");
      out.flat = A.row(200, 130, 190);
      out.flatWhy = { status: document.getElementById("job-status").textContent, min: LR4Job.spoil().heights.reduce((m, v) => Math.min(m, v), Infinity), E: LR4AsBuilt.E(), misses: (A.misses || []).slice(), log: [...document.querySelectorAll("#ctl-log > div")].slice(-25).map((d) => d.textContent) };
      LR4AsBuilt.set({ stop: { y: null, z: null } });
      return out;
    })()`);
    ok(near(b.hi, 0, 1e-6) && b.lo < -0.3, `New spoilboard warped: ${b.lo.toFixed(3)} .. ${b.hi}`);
    const ridge = 10.16 * Math.tan(0.5 * Math.PI / 180);
    ok(Math.abs(b.tram.hi - b.tram.lo - ridge) < 0.03, `0.5 deg out of tram: ridges ${(b.tram.hi - b.tram.lo).toFixed(3)} mm (~${ridge.toFixed(3)})`);
    ok(b.flat.hi - b.flat.lo < 0.01, `trammed: flat ${(b.flat.hi - b.flat.lo).toFixed(4)} mm ${b.flat.hi - b.flat.lo < 0.01 ? "" : JSON.stringify(b.flatWhy)}`);

    // two bits, racked and off level, a probe first: the second bit's pass is cut with that bit, full width. (The bug
    // it was written for - T1's V-bit carving the 1in passes thin, 2026-10-26 - only showed in a help video's frame
    // clock: test_page_help_all checks the As built video's surfacing. This one passes with or without that fix.)
    const tb = await page.val(`(async () => {
      document.getElementById("hs-new").click(); await T.sleep(300);
      LR4AsBuilt.set({ tram: { x: 0, y: 0 }, stop: { y: 1.5, z: 0.5 } });
      LR4AsBuilt.setE({ y: 4, z: 2 });                // racked + off level at power-up, as the help video
      await A.homeNC();
      await A.play(${JSON.stringify(["(LR4 two bits)", "(Stock: XMIN=-10 XMAX=300 YMIN=-10 YMAX=260 ZMIN=-12.7 ZMAX=0)",
        "(ToolDef 1: SHAPE=vbit D=12.7 ANGLE=60 NAME=V)", "(ToolDef 2: SHAPE=flat D=25.4 NAME=surfacing)",
        "G21 G90", "T1", "G10 L20 P0 X0 Y0 Z0", "G0 X-5 Y-5", "M0 (MSG, Attach Probe)", "G38.2 Z-110 F200 P0.5", "G0 Z5",
        "M0 (MSG, Remove Probe and Turn On Router at Dial 4)", "G0 X10 Y10 Z3", "G1 Z-1 F300", "G1 X60 F1500", "G0 Z15",
        "T2", "G0 X60 Y60", "G0 Z3", "G1 Z-1.5 F300", "G1 Y220 F1500", "G0 Z20", "M30", ""].join("\n"))}, "two_bits.gcode");
      const why = { status: document.getElementById("job-status").textContent, src: LR4Job.src() && LR4Job.src().name };
      const s = LR4Job.sim(), j = Math.round((140 - s.stock.ymin) / s.dy); let n = 0;   // the stock across the pass
      for (let x = 30; x <= 90; x += s.dx) if (s.heights[j * s.vx + Math.round((x - s.stock.xmin) / s.dx)] < -0.3) n++;
      LR4AsBuilt.set({ stop: { y: null, z: null } });
      return { wide: n * s.dx, why };
    })()`);
    ok(tb.wide > 22 && tb.wide < 28, `switches apart, T1 then T2: the 1in pass is ${tb.wide.toFixed(1)} mm wide ${tb.wide > 22 ? "" : JSON.stringify(tb.why)}`);

    // follow-ups: the drawn tip moves by tipErr (X shift too); a warp change lays an uncut board again, asks for a cut
    // one; the stock follows the board (or not); the squareness test read off the cut, racked vs square
    const d = await page.val(`(async () => {
      const out = {};
      LR4AsBuilt.set({ exag: 1, stop: { y: 0, z: 0 }, tram: { x: 0, y: 0 } });
      LR4AsBuilt.setE({ y: 0, z: 0 }); const t0 = LR4AsBuilt.tip();
      LR4AsBuilt.setE({ y: 8, z: 5 }); const t1 = LR4AsBuilt.tip();
      out.tip = { moved: t1.map((v, i) => v - t0[i]), want: LR4AsBuilt.tipErr(t0[0]), geo: LR4AsBuilt.geo() };
      LR4AsBuilt.setE({ y: 0, z: 0 });
      // warp: the board above was cut (passes) -> the form asks; No keeps it, Yes lays it again; uncut -> at once
      const wx = document.getElementById("ab-wx"), form = (v) => { wx.value = String(v); wx.dispatchEvent(new Event("change")); };
      askBox.auto = () => false; form(0.5); await T.sleep(50);
      out.kept = JSON.stringify(LR4AsBuilt.laid());
      askBox.auto = () => true; form(0.6); await T.sleep(50);
      out.relaid = JSON.stringify(LR4AsBuilt.laid());
      let asked = false;
      askBox.auto = () => { asked = true; return true; };
      LR4AsBuilt.set({ warp: { x: 0.3 } });
      out.uncut = JSON.stringify(LR4AsBuilt.laid()); out.asked = asked;
      askBox.auto = () => true;
      // the stock follows the board: its cuts / plate go through a rest field
      document.getElementById("hs-x").value = "100"; document.getElementById("hs-w").value = "400";
      document.getElementById("hs-y").value = "100"; document.getElementById("hs-d").value = "300"; document.getElementById("hs-t").value = "18";
      document.getElementById("hs-use").click(); await T.sleep(200);
      const h = LR4Job.handSim(); out.follow = [Imperfect.restAt(h, 110, 110), Imperfect.restAt(h, 300, 250)];
      document.getElementById("hs-off").click(); await T.sleep(100);
      // squareness: racked 2 mm after homing square, then square
      const job = Imperfect.squareJob(LR4AsBuilt.sqRect()), r = LR4AsBuilt.sqRect(), rect = { x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h };
      document.getElementById("hs-new").click(); await T.sleep(300);
      LR4AsBuilt.set({ stop: { y: 2, z: 0 } }); await A.homeNC();   // $H leaves it racked by the 2 mm stop
      out.wantR = Imperfect.squareness(LR4AsBuilt.E(), LR4AsBuilt.geo(), rect).diff;
      await A.play(job, "sq1.gcode");
      out.racked = LR4AsBuilt.measure(); out.noteR = document.getElementById("ab-sq-note").textContent;
      document.getElementById("hs-new").click(); await T.sleep(300);
      out.none = LR4AsBuilt.measure();
      LR4AsBuilt.set({ stop: { y: 0, z: 0 } }); await A.homeNC();   // square again
      out.homedE = LR4AsBuilt.E();
      await A.play(job, "sq2.gcode");
      out.square = LR4AsBuilt.measure(); out.noteS = document.getElementById("ab-sq-note").textContent;
      out.depth = r.z;
      LR4AsBuilt.set({ stop: { y: null, z: null } });
      return out;
    })()`);
    const tm = d.tip.moved, tw = d.tip.want;
    ok(near(tm[0], tw.dx, 0.05) && near(tm[1], tw.dy, 0.05) && near(tm[2], tw.dz, 0.05) && Math.abs(tw.dx) > 0.2,
      `drawn tip moves as the cuts: ${tm.map((v) => v.toFixed(3)).join(" / ")} vs ${[tw.dx, tw.dy, tw.dz].map((v) => v.toFixed(3)).join(" / ")} (ty ${d.tip.geo.ty.toFixed(1)}, tz ${d.tip.geo.tz.toFixed(1)})`);
    ok(!/"x":0\.5/.test(d.kept) && /"x":0\.6/.test(d.relaid) && /"x":0\.3/.test(d.uncut) && !d.asked, `warp change: cut board kept on No (${d.kept}), laid again on Yes (${d.relaid}), uncut at once without asking (${d.uncut})`);
    ok(d.follow[0] < -0.05 && near(d.follow[1], 0, 0.05) || d.follow[0] < d.follow[1] - 0.05, `stock follows: sag ${d.follow.map((v) => v.toFixed(3)).join(" / ")}`);
    ok(d.racked && !d.racked.missing && Math.abs(d.racked.diff - d.wantR) < 0.15, `measured racked: ${d.racked.diff && d.racked.diff.toFixed(3)} vs ${d.wantR.toFixed(3)} (${d.depth} mm deep) - ${d.noteR}`);
    ok(d.none.missing && d.none.missing.length === 4, "new board: nothing to measure");
    ok(d.square && !d.square.missing && Math.abs(d.square.diff) < 0.1 && near(d.homedE.y, 0, 0.02), `measured after $H: ${d.square.diff && d.square.diff.toFixed(3)} - ${d.noteS}`);

    // FluidNC: boots racked, reads it back from the motors, $H leaves the stops' residual
    const c = await page.val(`(async () => {
      LR4AsBuilt.setE({ y: 1.2, z: -0.7 });
      const prev = window.LR4FluidNC;
      LR4Ctl.start();
      await T.booted(prev);
      await T.idle();
      const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
      LR4Ctl.sync();
      const out = { boot: LR4AsBuilt.E() };
      document.getElementById("home").click();
      await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle();
      LR4Ctl.sync();
      out.home = LR4AsBuilt.E(); out.status = document.getElementById("home-status").textContent;
      return out;
    })()`);
    ok(near(c.boot.y, 1.2, 0.01) && near(c.boot.z, -0.7, 0.01), `FluidNC boots racked: ${JSON.stringify(c.boot)}`);
    ok(/^Homed by FluidNC/.test(c.status) && near(c.home.y, 0.8, 0.02) && near(c.home.z, 0.5, 0.02), `FluidNC $H on the per-motor switches: ${JSON.stringify(c.home)} (${c.status})`);
    const misses = await page.val("window.A.misses || []");
    ok(!misses.length, `every Run started${misses.length ? ": " + misses.join(" ; ") : ""}`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
