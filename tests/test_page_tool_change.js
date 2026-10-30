// Part 45b step 3 in headless Chrome (serve.py's headers): a bit change, animated (tool_change.js).
//  - the Kobalt + Carbide (a lock and flats), held by the lock (1 wrench) or 2 wrenches: the lock presses in or both
//    wrenches go on, handles out the front; the nut comes down the thread length and turns the turns that takes; the
//    bit swaps 1/8" -> 1/4" with a collet swap (in its own nut, or out of the one nut); only the lower dust shoe
//    comes off; everything back where it was after;
//  - a job's tool change (M6; its first tool is asked by the Start check, not a popup): Install bit and resume plays
//    it, then the bit goes in and the job runs on.
//  TC_SHOT=dir: a screenshot of each router mid-change (wrenches on).
//   node tests/test_page_tool_change.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const fs = require("fs");
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const STOCK = "(Stock: XMIN=0 XMAX=120 YMIN=0 YMAX=80 ZMIN=-12 ZMAX=0)";
const JOBTXT = ["(LR4 tool change test)", STOCK, "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12 NAME=1/8in flat)",
  "(ToolDef 2: SHAPE=flat D=6.35 FLUTES=2 LEN=19 NAME=1/4in flat)", "G21 G90 G54", "T1 M6", "G0 Z5", "G0 X20 Y40", "G1 Z-0.5 F300",
  "G1 X60 F600", "G0 Z5", "M5", "T2 M6", "G0 X80 Y40", "G1 Z-0.5 F300", "G1 X100 F600", "G0 Z5", "M30", ""].join("\n");

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9390 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9700 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4ToolChange && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const shot = async (name) => {
      if (!process.env.TC_SHOT) return;
      const s = await page.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`${process.env.TC_SHOT}/${name}.png`, Buffer.from(s.data, "base64"));
    };
    const run = (router, hold, nuts) => page.val(`(async () => {
      const errs = []; window.addEventListener("error", (e) => errs.push(e.message));
      LR4Router.set({ router: ${JSON.stringify(router)} }); await T.sleep(300);
      TC_ON.hold = ${JSON.stringify(hold)}; TC_ON.nuts = ${JSON.stringify(nuts)};
      handBit({ shape: "flat", d: 3.175, len: 38, flen: 12 }); await T.sleep(100);   // a 1/8" in: the change to 1/4" swaps the collet
      const m = (n) => meshes.find((q) => q.userData.name === n), wc = (q) => new THREE.Box3().setFromObject(q).getCenter(new THREE.Vector3());
      const nut0 = wc(m("Router_ColletNut")), lock = m("Router_ShaftLock"), lock0 = lock && lock.position.clone();
      const c = nut0.clone(); camera.position.copy(c).add(new THREE.Vector3(70, -200, 25)); controls.target.copy(c).add(new THREE.Vector3(0, 0, -14)); controls.update();
      const up = m("Dust_Shoe_Kobalt"), up0 = up && up.position.clone();   // the upper shoe stays on
      const out = { router: ${JSON.stringify(router)}, maxDz: 0, minA: 0, press: 0, two: false, wrench: false, caps: new Set(), swap: null, fMin: 1, fMax: -1, upMove: 0, upHidden: false, each: false };
      const done = LR4ToolChange.play({ bit: { shape: "flat", d: 6.35, len: 38, flen: 19 } });
      let st, shot = false;
      while ((st = LR4ToolChange.state())) {
        out.maxDz = Math.max(out.maxDz, st.nutDz); out.minA = Math.min(out.minA, st.nutA); out.press = Math.max(out.press, st.press);
        out.two = out.two || st.two; out.swap = st.swap; out.each = out.each || st.nutEach; if (st.caption) out.caps.add(st.caption);
        if (st.front !== null) { out.fMin = Math.min(out.fMin, st.front); out.fMax = Math.max(out.fMax, st.front); }
        if (up) { out.upMove = Math.max(out.upMove, up.position.distanceTo(up0)); out.upHidden = out.upHidden || !up.visible; }
        if (st.wrench && !shot && st.k >= 3) { shot = true; out.wrench = true; window.__shot = true; await T.sleep(400); window.__shot = false; }
        await T.sleep(50);
      }
      await done;
      const nut1 = wc(m("Router_ColletNut"));
      out.back = +nut1.distanceTo(nut0).toFixed(3);
      out.lockBack = lock ? +lock.position.distanceTo(lock0).toFixed(3) : 0;
      out.hand = HAND.bit && HAND.bit.d;
      out.caps = [...out.caps];
      out.wrenchesHidden = Object.values(TC.wrench).every((w) => !w.visible);
      out.errs = errs;
      return out;
    })()`);
    // the Kobalt + Carbide both have a lock and flats: each held both ways, each nut mode
    for (const [router, hold, nuts] of [["kobalt", "lock", "each"], ["kobalt", "wrenches", "one"], ["carbide", "lock", "one"], ["carbide", "wrenches", "each"]]) {
      const p = run(router, hold, nuts), id = `${router} (${hold}, ${nuts})`;
      if (process.env.TC_SHOT) {                     // the frame with the wrench(es) on
        for (let i = 0; i < 200; i++) { await sleep(100); if (await page.val("!!window.__shot")) { await shot(`tc_${router}_${hold}`); break; } }
      }
      const r = await p;
      const E = 8;                                   // the thread length (both ER11 M13 x 0.75, 8 mm)
      ok(r.maxDz > E + 10 && r.maxDz < E + 13, `${id}: the nut comes off the thread and down (${r.maxDz.toFixed(1)} mm)`);
      ok(r.minA < -2 * Math.PI * (E / 0.75) * 0.95, `${id}: it turns ~${(E / 0.75).toFixed(1)} times to come off (${(-r.minA / 2 / Math.PI).toFixed(1)})`);
      ok(hold === "lock" ? r.press > 0.99 && !r.two : r.two && r.press === 0, `${id}: ${hold === "lock" ? "the shaft lock pressed, 1 wrench" : "2 wrenches, the lock not pressed"} (${r.press}, ${r.two})`);
      // 2 wrenches: the shaft turned so the swing is 30 deg either side of the front; the lock: the shaft stops where its
      // hole lines up, the wrench on the nut's flats nearest the front - the swing within 60 deg of it, through it
      const fLo = hold === "lock" ? 0.49 : 0.85;
      ok(r.fMin > fLo && r.fMax > 0.99, `${id}: the wrench's handle out the front, ${hold === "lock" ? 60 : 30} deg either side at most (cos ${r.fMin}..${r.fMax})`);
      ok(r.wrench && r.wrenchesHidden, `${id}: the wrench on the nut, put away after`);
      ok(r.swap === true && r.caps.some((c) => nuts === "each" ? /aside in its nut/.test(c) : /collet out/.test(c)) && r.each === (nuts === "each") && r.caps.some((c) => /new bit in/.test(c)),
        `${id}: 1/8" -> 1/4": the collet swapped, ${nuts === "each" ? "in its own nut" : "out of the one nut"} (${r.caps.length} captions)`);
      ok(r.upMove < 0.01 && !r.upHidden && r.caps.some((c) => /lower dust shoe off/.test(c)), `${id}: only the lower dust shoe comes off (the upper moved ${r.upMove})`);
      ok(r.back < 0.01 && r.lockBack < 0.01, `${id}: the nut + lock back where they were (${r.back}, ${r.lockBack})`);
      ok(r.errs.length === 0, `${id}: no page errors (${r.errs})`);
    }
    // a job's tool change: Install bit and resume plays the change, then the bit goes in and the job carries on
    const j = await page.val(`(async () => {
      LR4ToolChange.speed(4);                        // (headless frames are slow: the tick's dt cap stretches it)
      LR4Router.set({ router: "kobalt" });
      document.getElementById("t-run").click();
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed(), 180000); await T.idle();
      await LR4Job.add([new File([${JSON.stringify(JOBTXT)}], "tc.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/tc.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      const out = { pops: [] };
      await T.until(() => !document.getElementById("job-pop").hidden && /Bit change/.test(document.getElementById("job-pop-h").textContent), 90000);
      out.pops.push(document.getElementById("job-pop").hidden ? "" : document.getElementById("job-pop-h").textContent);
      document.getElementById("job-resume").click();
      await T.sleep(300);
      out.busy = LR4ToolChange.busy() && document.getElementById("job-resume").disabled;
      out.swap = LR4ToolChange.state() && LR4ToolChange.state().swap;
      await T.until(() => !LR4ToolChange.busy(), 90000);
      await T.until(() => document.getElementById("job-pop").hidden, 15000);
      await T.until(() => !LR4Job.running(), 120000);
      out.hand = HAND.bit && HAND.bit.d;
      return out;
    })()`);
    ok(j.pops[0] === "Bit change: T2" && j.busy && j.swap === true, `the job's T2 change (1/8" -> 1/4"): it plays before resuming, the collet swapped (${JSON.stringify(j)})`);
    ok(Math.abs(j.hand - 6.35) < 0.01, `the last bit (T2 1/4") is in the router after (${j.hand})`);
    await page.val("LR4ToolChange.speed(1)");
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
