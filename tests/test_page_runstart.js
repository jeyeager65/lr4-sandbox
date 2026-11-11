// Start?'s options (user 2026-11-09) in headless Chrome (serve.py's headers):
//  - ▶ Start opens Start? with the options (a trusted click);
//  - with As built on Real-world it offers "run this on the Ideal machine instead", which turns Real-world off;
//  - Bit changes & probing: Automatic (kept in the browser) - the job's T2 change pops up, then resumes by itself
//    (the change animates) and the job runs to the end with no clicks.
//   node tests/test_page_runstart.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS, STALL } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const STOCK = "(Stock: XMIN=0 XMAX=120 YMIN=0 YMAX=80 ZMIN=-12 ZMAX=0)";
const JOBTXT = ["(LR4 run start test)", STOCK, "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12 NAME=1/8in flat)",
  "(ToolDef 2: SHAPE=flat D=6.35 FLUTES=2 LEN=19 NAME=1/4in flat)", "G21 G90 G54", "T1 M6", "G0 Z5", "G0 X20 Y40", "G1 Z-0.5 F300",
  "G1 X60 F600", "G0 Z5", "M5", "T2 M6", "G0 X80 Y40", "G1 Z-0.5 F300", "G1 X100 F600", "G0 Z5", "M30", ""].join("\n");

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9390 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9700 + Math.floor(Math.random() * 100));
  const realClick = async (id) => {                  // a trusted click (CDP input), unlike element.click()
    const r = await page.val(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await page.send("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 });
    }
    await sleep(300);
  };
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 480 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4ToolChange && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const ready = await page.val(`(async () => {
      LR4ToolChange.speed(4);
      document.getElementById("t-run").click();
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed(), 180000); await T.idle();
      await LR4Job.add([new File([${JSON.stringify(JOBTXT)}], "rs.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/rs.gcode" && LR4Job.tl(), 15000);
      return LR4Ctl.homed();
    })()`);
    ok(ready, "booted, homed, job loaded");
    // Ideal: ▶ Start opens Start? with the mode choice, no As built line; nothing runs yet
    await page.val(`(document.getElementById("ab-on").checked = false, abSet(abRead(), false), true)`);
    await realClick("job-start");
    const s1 = await page.val(`({ open: !document.getElementById("start-pop").hidden, ab: !document.getElementById("start-ab").hidden,
      mode: !!document.getElementById("start-auto").querySelector('[data-v="me"][aria-pressed="true"]'), running: LR4Job.running() })`);
    ok(s1.open && !s1.ab && s1.mode && !s1.running, `▶ Start opens Start? (I do them; no As built line on Ideal) ${JSON.stringify(s1)}`);
    await page.val(`(document.getElementById("start-no").click(), true)`);
    // Real-world: the line shows; tick it, pick Automatic, Start
    await page.val(`(document.getElementById("ab-on").checked = true, abSet(abRead(), false), true)`);
    await realClick("job-start");
    const s2 = await page.val(`({ open: !document.getElementById("start-pop").hidden, ab: !document.getElementById("start-ab").hidden })`);
    ok(s2.open && s2.ab, `on Real-world, Start? offers the Ideal machine ${JSON.stringify(s2)}`);
    const r = await page.val(`(async () => {
      document.getElementById("start-ideal").checked = true;
      document.getElementById("start-auto").querySelector('[data-v="auto"]').click();
      const kept = localStorage.getItem("lr4-run-auto");
      askBox.auto = () => true;                      // (a new flat spoilboard, if the old one has cuts)
      document.getElementById("start-go").click();
      await T.until(() => LR4Job.running(), 30000);
      const out = { kept, abOff: !AB.set.on, pops: [], clicks: 0 };
      document.getElementById("job-resume").addEventListener("click", (e) => { if (e.isTrusted) out.clicks++; });
      await T.until(() => !document.getElementById("job-pop").hidden, 90000);
      out.pops.push(document.getElementById("job-pop-h").textContent);
      await T.until(() => !LR4Job.running(), 240000);
      out.hand = HAND.bit && HAND.bit.d;
      out.status = document.getElementById("job-status").textContent;
      askBox.auto = null;
      return out;
    })()`);
    ok(r.kept === "auto", `Automatic is kept in the browser (${r.kept})`);
    ok(r.abOff, "Run on the Ideal machine turned Real-world off");
    ok(/Bit change: T2/.test(r.pops[0]) && Math.abs(r.hand - 6.35) < 0.01, `T2's change popped up, then went in by itself (${JSON.stringify(r)})`);
    ok(/Done/.test(r.status), `the job ran to the end with no clicks (${r.status})`);
    // the post's pattern (fluidnc_post): one M0 "Change to Tool T2 ... and Attach Probe", G38.2, M0 "Remove Probe".
    // Automatic: the plate + clip stay off while the bit is changed, go on after, come off at the remove pause
    const PROBE = ["(LR4 run start probe test)", STOCK, "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12 NAME=1/8in flat)",
      "(ToolDef 2: SHAPE=flat D=6.35 FLUTES=2 LEN=19 NAME=1/4in flat)", "G21 G90 G54", "T1", "G0 Z5", "G0 X20 Y40", "G1 Z-0.5 F300",
      "G1 X60 F600", "G0 Z5", "M5", "T2", "G0 X10 Y10", "M0 (MSG, Change to Tool T2 1/4in flat and Attach Probe - keep X0 Y0)",
      "G38.2 Z-110 F200 P0.5", "G0 Z10", "M0 (MSG, Remove Probe and Turn On Router)", "G0 X80 Y40", "G1 Z-0.5 F300", "G1 X100 F600",
      "G0 Z5", "M30", ""].join("\n");
    const q = await page.val(`(async () => {
      handBit({ shape: "flat", d: 3.175, len: 38, flen: 12 }); await T.sleep(100);
      await LR4Job.add([new File([${JSON.stringify(PROBE)}], "rp.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/rp.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-start").click(); await T.sleep(300);
      document.getElementById("start-go").click();
      await T.until(() => LR4Job.running(), 30000);
      const out = { plateInChange: false, changed: false, plateAfter: false, pops: [], alarm: false };
      const t0 = performance.now();
      while (LR4Job.running()) {
        if (performance.now() - t0 > 360000) { out.stall = ${STALL}; break; }   // (the first job takes ~1 min; never wait for ever)
        const pop = !document.getElementById("job-pop").hidden && document.getElementById("job-pop-h").textContent;
        if (pop && out.pops[out.pops.length - 1] !== pop) out.pops.push(pop);
        if (LR4ToolChange.busy()) { out.changed = true; if (FJ.job && FJ.job.plate) out.plateInChange = true; }
        else if (out.changed && FJ.job && FJ.job.plate) out.plateAfter = true;
        if (/Alarm/.test(document.getElementById("job-pill").textContent || "")) out.alarm = true;
        await T.sleep(40);
      }
      out.status = document.getElementById("job-status").textContent;
      out.plateEnd = !!CTL.jobPlate;
      out.hand = HAND.bit && HAND.bit.d;
      return out;
    })()`);
    ok(!q.stall, `the probe job finished within 6 min${q.stall ? " - stalled at " + JSON.stringify(q.stall) : ""}`);
    ok(q.changed && !q.plateInChange, `the plate + clip stay off while the bit is changed (${JSON.stringify(q)})`);
    ok(q.plateAfter && !q.plateEnd, "the plate goes on after the new bit is in, and is put away after the probe");
    ok(/Done/.test(q.status) && !q.alarm && Math.abs(q.hand - 6.35) < 0.01, `the probe job ran to the end by itself (${q.status})`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.val("LR4ToolChange.speed(1)").catch(() => {});
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
