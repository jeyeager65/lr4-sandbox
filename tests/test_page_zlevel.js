// docs/examples/z_level.gcode in headless Chrome (serve.py's headers), on the page's FluidNC with As built's beam tilt:
//  - the second Z switch trips 0.6 mm off (As built stop z), the config's pulloffs 4 / 4: homed, the beam isn't level;
//  - the script probes the spoilboard at two X spots (M0s resumed), works out the pulloffs, sets them, saves, homes;
//  - after its $H the beam is level (the Max end within 0.05 mm of the Min end) and the pulloffs differ by the tilt.
//   node tests/test_page_zlevel.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const fs = require("fs"), path = require("path");
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const GCODE = fs.readFileSync(process.env.ZFILE || path.join(__dirname, "..", "docs", "examples", "z_level.gcode"), "utf8").replace(process.env.NOH ? "\n$H\n" : "\u0000", "\n");
const STOP = 0.6;

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
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4AsBuilt && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4AsBuilt.geo()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const a = await page.val(`(async () => {
      const out = {}, sim = () => window.LR4FluidNC;
      document.getElementById("t-run").click();
      LR4AsBuilt.set({ on: true, power: false, stop: { y: 0, z: ${STOP} }, tram: { x: 0, y: 0 }, slip: { on: false }, heat: { on: false } });
      LR4AsBuilt.setE({ y: 0, z: 0 });
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed(), 180000); await T.idle();
      out.geo = { zspan: LR4AsBuilt.geo().zspan, span: LR4AsBuilt.geo().span };
      out.E0 = LR4AsBuilt.E().z;
      await LR4Job.add([new File([${JSON.stringify(GCODE)}], "z_level.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/z_level.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      await T.until(() => LR4Job.running(), 30000);
      out.pauses = 0; out.segs = JOB.tl.segs.length; out.carved = 0; out.dbg = [];
      const t0 = Date.now();
      let k = 0;
      while (LR4Job.running() && Date.now() - t0 < 600000) {
        const pop = document.getElementById("job-pop"), b = document.getElementById("job-resume");
        if (pop && !pop.hidden && b && !b.disabled) { out.pauses++; b.click(); await T.sleep(1500); }
        await T.sleep(200);
        const C = FJ.job && FJ.job.C;                  // the progress tracker follows G53 and $HZ mid-file
        if (C) out.carved = Math.max(out.carved, C.carved);
        if (C && ++k % 10 === 0) {
          const p = fjWork(ctlRaw()), s = JOB.tl.segs[C.i], f = (q) => q ? [q.x, q.y, q.z].map((v) => v.toFixed(1)).join(",") : "-";
          out.dbg.push(\`i=\${C.i} f=\${C.f.toFixed(2)} at \${f(p)} seg \${f(s && s.start)} -> \${f(s && s.end)} \${s && s.type}\`);
        }
      }
      out.status = document.getElementById("job-status").textContent;
      out.log = [...document.querySelectorAll("#ctl-log div")].map((d) => d.textContent).slice(-40);
      await T.sleep(1000); await T.idle();
      const pl = async (m) => { const r = await sim().command("$/axes/z/motor" + m + "/pulloff_mm"); const l = r.lines.find((e) => e.line.includes("=")); return l ? Number(l.line.split("=")[1]) : NaN; };
      out.pull = [await pl(0), await pl(1)];
      out.E1 = LR4AsBuilt.E().z;
      return out;
    })()`);
    if (process.env.ZLOG) console.log(a.log.join("\n") + "\n" + a.dbg.join("\n"));
    ok(a.carved >= a.segs - 1, `the page followed the job to its end (G53, $HZ mid-file): ${a.carved} of ${a.segs} moves`);
    ok(Math.abs(a.geo.zspan - 893) < 2, `the beam tilts on the Z leadscrews: zspan ${a.geo.zspan?.toFixed(1)} (gantry span ${a.geo.span?.toFixed(1)})`);
    ok(Math.abs(Math.abs(a.E0) - STOP) < 0.05, `homed with equal pulloffs, the beam is off by the switch offset: ${a.E0?.toFixed(3)} mm`);
    ok(a.pauses >= 3 && /Done/.test(a.status), `the script ran to the end (${a.pauses} pauses resumed): ${a.status}`);
    const d = a.pull[1] - a.pull[0];
    ok(Math.min(...a.pull) > 3.99 && Math.min(...a.pull) < 4.01 && Math.abs(Math.abs(d) - STOP) < 0.1,
      `new pulloffs ${a.pull.map((p) => p.toFixed(3)).join(" / ")}: the smaller is minPulloff, they differ by the offset`);
    ok(Math.abs(a.E1) < 0.1, `after the script's $H the beam is level: ${a.E1?.toFixed(3)} mm (was ${a.E0?.toFixed(3)})`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
