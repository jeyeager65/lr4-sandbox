// Part 44a in headless Chrome (serve.py's headers): lost steps on FluidNC (As built > Lost steps).
//  - off by default; a sane cut (1/8" bit, 3 mm deep, 1000 mm/min) loses nothing with it on;
//  - too deep + too fast (9 mm at 2500 mm/min) slips X: the motor ends short of where FluidNC thinks, the slot is
//    carved short by that much, the job's message says so;
//  - $H finds the machine where it really is (back at the first $H's pose);
//  - a video's NOW= slip on Y racks the gantry by that much.
//   node tests/test_page_slip.js   (not in npm test: needs Chrome + Python; ~2 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const S_HELPERS = `
  window.A = {
    async play(text, name) {
      await LR4Job.add([new File([text], name)]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/" + name && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      const started = await T.until(() => LR4Job.running(), 20000);
      if (!started) return "didn't start: " + document.getElementById("job-status").textContent;
      const t0 = performance.now();
      while (LR4Job.running() && performance.now() - t0 < 300000) {
        await T.sleep(200);
        if (LR4Job.held() && !document.getElementById("job-pop").hidden) document.getElementById("job-resume").click();
      }
      await T.until(() => !LR4Job.running() && /^Done\\./.test(document.getElementById("job-status").textContent), 30000);
      return document.getElementById("job-status").textContent;
    },
    async home() {
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle(); LR4Ctl.sync(); await T.sleep(300);
      return LR4Ctl.pose();
    },
    // the last x (work mm) along row y where the stock is cut deeper than 'below' under its top
    slotEnd(y, below) {
      const s = LR4Job.sim(), j = Math.round((y - s.stock.ymin) / s.dy); let end = null;
      for (let i = 0; i <= s.nx; i++) if (s.heights[j * s.vx + i] < s.stock.zmax - below) end = s.stock.xmin + i * s.dx;
      return end;
    },
  };
  askBox.auto = () => true;
  true`;
// a slot along +X at Y 50 of a 200 x 100 x 12 mm stock: depth, feed
const SLOT = (depth, feed, hard) => ["(LR4 slip test)", "(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-12 ZMAX=0)", ...(hard ? [hard] : []),
  "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12.7 NAME=1/8in flat)", "G21 G90 G54", "T1", "M3 S18000", "G0 Z5", "G0 X20 Y50",
  `G1 Z${-depth} F300`, `G1 X150 F${feed}`, "G0 Z5", "M5", "M30", ""].join("\n");

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
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4AsBuilt && !!window.LR4Slip && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4AsBuilt.geo()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    ok(await page.val("LR4AsBuilt.get().slip.on === false && document.getElementById('ab-ls').checked === false"), "lost steps off by default");
    await page.val(HELPERS); await page.val(S_HELPERS);

    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      LR4AsBuilt.set({ on: true, power: false, stop: { y: 0, z: 0 }, tram: { x: 0, y: 0 }, slip: { on: true, x: 0.3, y: 0.3, z: 0.5 } });
      LR4AsBuilt.setE({ y: 0, z: 0 });
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
      const out = { form: document.getElementById("ab-ls").checked && !document.getElementById("ab-ls-box").hidden, lx: document.getElementById("ab-lx-out").textContent };
      out.home0 = await A.home();
      out.gentle = await A.play(${JSON.stringify(SLOT(3, 1000))}, "gentle.gcode");
      out.gentleLost = LR4Slip.lost(); out.gentleN = LR4Slip.count();
      out.hard = await A.play(${JSON.stringify(SLOT(9, 2500))}, "hard.gcode");
      out.hardLost = LR4Slip.lost(); out.hardN = LR4Slip.count(); out.load = LR4Slip.load();
      out.end = A.slotEnd(50, 6); out.note = LR4AsBuilt.note();
      out.home1 = await A.home();
      const e0 = LR4AsBuilt.E().y;
      LR4Slip.force("y", 1, 1.28); LR4Ctl.sync(); await T.sleep(300);
      out.rack = LR4AsBuilt.E().y - e0;
      // Part 44c: the same pushy cut in clear wood, then through a knot
      out.home2 = await A.home();
      const n0 = LR4Slip.count();
      out.clear = await A.play(${JSON.stringify(SLOT(3, 2500))}, "clear.gcode");
      out.clearN = LR4Slip.count() - n0;
      out.knot = await A.play(${JSON.stringify(SLOT(3, 2500, "(Stock Hard: KNOT=100,50,12)"))}, "knot.gcode");
      out.knotN = LR4Slip.count() - n0 - out.clearN;
      return out;
    })()`);
    const lostX = (l) => (l && l.length ? l[0] : NaN);   // V1E's config: motor 0 = X
    ok(a.form && a.lx === "30%", `the form shows it: ${a.form} ${a.lx}`);
    ok(/^Done\./.test(a.gentle) && a.gentleN === 0 && a.gentleLost.every((v) => v === 0), `sane cut: no slips (${a.gentleN}) - ${a.gentle}`);
    ok(/^Done\./.test(a.hard) && a.hardN > 0 && lostX(a.hardLost) > 0.5, `9 mm at 2500 slips X: ${a.hardN} slips, lost ${JSON.stringify(a.hardLost)}`);
    ok(/lost steps: X/.test(a.hard), `the job says so: ${a.hard}`);
    ok(a.end !== null && near(a.end, 150 - lostX(a.hardLost) + 3.175 / 2, 2), `the slot ends short: x ${a.end} (FluidNC 150 + the bit radius, lost ${lostX(a.hardLost).toFixed(2)})`);   // 2 mm: a runaway (~107 mm) ends its last slips past the carve by up to ~1.9 mm (timing)
    ok(/lost steps/.test(a.note), `Run's note: ${a.note}`);
    ok(a.home0 && a.home1 && a.home0.every((v, i) => near(v, a.home1[i], 0.1)), `$H finds it: ${JSON.stringify(a.home0)} / ${JSON.stringify(a.home1)}`);
    ok(near(Math.abs(a.rack), 1.28, 0.01), `NOW= slip on Y racks it 1.28 mm: ${a.rack}`);
    ok(/^Done\./.test(a.clear) && a.clearN === 0, `3 mm at 2500 in clear wood: no slips (${a.clearN}) - ${a.clear}`);
    ok(/^Done\./.test(a.knot) && a.knotN > 0, `the same through a knot slips: ${a.knotN} - ${a.knot}`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
