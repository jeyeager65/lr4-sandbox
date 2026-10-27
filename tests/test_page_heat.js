// Part 44b in headless Chrome (serve.py's headers): heat on FluidNC (As built > Heat).
//  - off by default; a proper cut (1/8" bit, 1500 mm/min) makes no smoke with Heat on;
//  - a 25 s dwell with the router on, 3 mm in: Heat only = smoke, scorch and the "would catch" warning, no fire;
//  - Fire + auto: it catches, the extinguisher flies off its bracket, sprays, puts it out and goes home; the scorch stays;
//  - a video's (Video Fire: TIME=2) catches at the bit.
// Headless Chrome barely draws frames: the test drives the fx tick (LR4Heat.tick) itself.
//   node tests/test_page_heat.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const H_HELPERS = `
  window.A = {
    ticking: false,
    tickLoop() { if (A.ticking) return; A.ticking = true; (async () => { while (A.ticking) { LR4Heat.tick(0.05); A.watch(); await T.sleep(50); } })(); },
    seen: {},
    watch() {                                        // what happened along the way
      const f = LR4Heat.flying(), e = LR4Heat.extinguisher();
      if (f) A.seen[f] = true;
      if (LR4Heat.burning()) A.seen.burning = true;
      if (/^Smoke/.test(LR4Heat.note())) A.seen.smoke = true;
      if (/catch fire/.test(LR4Heat.note())) A.seen.would = true;
      if (/^Out\./.test(LR4Heat.note())) A.seen.outNote = true;
      if (LR4Heat.particles() > 20) A.seen.particles = true;
      if (e && A.home0 && Math.hypot(e[0] - A.home0[0], e[1] - A.home0[1], e[2] - A.home0[2]) > 300) A.seen.away = true;
    },
    async play(text, name, after = 0) {
      await LR4Job.add([new File([text], name)]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/" + name && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      if (!await T.until(() => LR4Job.running(), 20000)) return "didn't start: " + document.getElementById("job-status").textContent;
      const t0 = performance.now();
      while (LR4Job.running() && performance.now() - t0 < 300000) {
        await T.sleep(200);
        if (LR4Job.held() && !document.getElementById("job-pop").hidden) document.getElementById("job-resume").click();
      }
      await T.until(() => !LR4Job.running(), 30000);
      await T.until(() => !LR4Heat.flying() && !LR4Heat.burning(), after);   // the extinguisher's trip
      return document.getElementById("job-status").textContent;
    },
  };
  askBox.auto = () => true;
  true`;
const STOCK = "(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-12 ZMAX=0)";
const HEAD = ["(LR4 heat test)", STOCK, "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12.7 NAME=1/8in flat)", "G21 G90 G54", "T1", "M3 S18000", "G0 Z5"];
const CUT = HEAD.concat(["G0 X20 Y50", "G1 Z-3 F300", "G1 X150 F1500", "G0 Z5", "M5", "M30", ""]).join("\n");
const DWELL = HEAD.concat(["G0 X60 Y50", "G1 Z-3 F300", "G4 P25", "G0 Z5", "M5", "M30", ""]).join("\n");
const VIDEO = HEAD.concat(["G0 X120 Y50", "G1 Z-3 F300", "G4 P6", "G0 Z5", "M5", "M30", ""]).join("\n");

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
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Heat && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4AsBuilt.geo()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    ok(await page.val("LR4AsBuilt.get().heat.on === false && LR4AsBuilt.get().heat.fire === false"), "heat off by default");
    ok(await page.val("!!LR4Heat.extinguisher()"), "the extinguisher is in the shop");
    await page.val(HELPERS); await page.val(H_HELPERS);

    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      LR4AsBuilt.set({ on: true, power: false, stop: { y: 0, z: 0 }, tram: { x: 0, y: 0 }, slip: { on: false }, heat: { on: true, fire: false, auto: true } });
      LR4AsBuilt.setE({ y: 0, z: 0 });
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle();
      A.home0 = LR4Heat.extinguisher(); A.tickLoop();
      const out = { boxes: !document.getElementById("ab-fi").disabled };
      await A.play(${JSON.stringify(CUT)}, "cut.gcode");
      out.cut = { note: LR4Heat.note(), bit: LR4Heat.bit(), scorched: LR4Heat.scorched() };
      A.seen = {};
      await A.play(${JSON.stringify(DWELL)}, "dwell.gcode");
      out.heatOnly = { note: LR4Heat.note(), scorched: LR4Heat.scorched(), seen: A.seen };
      LR4AsBuilt.set({ heat: { fire: true } });
      A.seen = {};
      await A.play(${JSON.stringify(DWELL)}, "dwell2.gcode", 30000);
      out.fire = { note: LR4Heat.note(), scorched: LR4Heat.scorched(), seen: A.seen, home: LR4Heat.extinguisher(), burning: LR4Heat.burning() };
      out.dmg = LR4Heat.damage().filter((d) => d.char > 0.25 || d.melt > 0.1).length;
      out.dmgNote = !document.getElementById("heat-dmg").hidden;
      document.getElementById("heat-repair").click();
      out.repaired = { left: LR4Heat.damage().length, note: !document.getElementById("heat-dmg").hidden };
      A.seen = {};
      const pv = A.play(${JSON.stringify(VIDEO)}, "video.gcode", 30000);
      await T.until(() => LR4Job.running(), 30000); await T.sleep(1500); out.fired = LR4Heat.fire(2);
      await pv;
      out.video = { seen: A.seen, burning: LR4Heat.burning() };
      A.ticking = false;
      out.home0 = A.home0;
      return out;
    })()`);
    ok(a.boxes, "Fire / auto enabled with Heat on");
    ok(!/Smoke/.test(a.cut.note) && a.cut.scorched === 0, `proper cut: no smoke, no scorch (bit ${a.cut.bit && a.cut.bit.toFixed(0)} °C)`);
    ok(a.heatOnly.seen.smoke && a.heatOnly.scorched > 0 && a.heatOnly.seen.would && !a.heatOnly.seen.burning,
      `Heat only: smoke, scorch (${a.heatOnly.scorched} cells), the warning, no fire - ${a.heatOnly.note} ${JSON.stringify(a.heatOnly.seen)}`);
    ok(a.heatOnly.seen.particles, "smoke particles drawn");
    ok(a.fire.seen.burning && a.fire.seen.out && a.fire.seen.spray && a.fire.seen.back && a.fire.seen.away, `Fire: caught, the extinguisher flew (${Object.keys(a.fire.seen).join(", ")})`);
    ok(a.fire.burning === 0 && a.fire.seen.outNote && a.fire.scorched > 0, `put out ("Out." said), the scorch stays (${a.fire.scorched} cells)`);
    ok(a.dmg > 0 && a.dmgNote, `the fire under the router damaged ${a.dmg} parts, Run says so`);
    ok(a.repaired.left === 0 && !a.repaired.note, `Repair the machine: ${JSON.stringify(a.repaired)}`);
    ok(a.fire.home && a.home0 && a.fire.home.every((v, i) => Math.abs(v - a.home0[i]) < 0.01), `back on its bracket ${JSON.stringify(a.fire.home)}`);
    ok(a.fired && a.video.seen.burning && a.video.burning === 0, `LR4Heat.fire(2) ((Video Fire: TIME=2)) catches, put out (${Object.keys(a.video.seen).join(", ")})`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
