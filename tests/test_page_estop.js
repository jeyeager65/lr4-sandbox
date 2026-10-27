// Part 44f in headless Chrome (serve.py's headers): the switch panel.
//  - the panel is drawn on the table's front face: lamp + rockers lit, the e-stop out;
//  - a click on the vac rocker in the view switches it (dark), Run's Vac button back on;
//  - mid-job with a fire burning (Heat + Fire, no auto extinguisher), E-STOP: the job stops, FluidNC down (not homed),
//    the head in, the lamp + rockers dark, the pill says so, a boot is refused; the fire burns on and spreads, the bit cools;
//  - released (Run's button): FluidNC boots, not homed, the lamp lit;
//  - the router's rocker off: a job runs with the router still (no spin), Run says why; the router's own switch slides.
// Headless Chrome barely draws frames: the test drives the fx tick (LR4Heat.tick) itself.
//   node tests/test_page_estop.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const STOCK = "(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-12 ZMAX=0)";
const HEAD = ["(LR4 e-stop test)", STOCK, "(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12.7 NAME=1/8in flat)", "G21 G90 G54", "T1", "M3 S18000", "G0 Z5"];
const DWELL = HEAD.concat(["G0 X60 Y50", "G1 Z-3 F300", "G4 P40", "G0 Z5", "M5", "M30", ""]).join("\n");
const SHORT = HEAD.concat(["G0 X20 Y50", "G1 Z-1 F300", "G1 X120 F600", "G0 Z5", "M5", "M30", ""]).join("\n");

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
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Power && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4AsBuilt.geo()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const a = await page.val(`(async () => {
      const out = {}, look = () => Object.fromEntries(LR4Power.look().map(([n, y, rx, g]) => [n.replace("SwitchPanel_", ""), { y, rx, g }]));
      const panel = meshes.filter((m) => /^SwitchPanel_/.test(m.userData.name));
      const tb = tableBox(true), box = new THREE.Box3().setFromObject(panel.find((m) => m.userData.name === "SwitchPanel_Box"));
      out.panel = { n: panel.length, back: +(box.max.y - tb.min.y).toFixed(1), top: +(tb.min.z - box.max.z).toFixed(1), inX: box.min.x >= tb.min.x && box.max.x <= tb.max.x };
      out.look0 = look();
      // a click on the vac rocker in the view (the camera straight at the panel)
      const c = box.getCenter(new THREE.Vector3());
      camera.position.set(c.x, c.y - 500, c.z + 60); controls.target.copy(c); controls.update(); camera.updateMatrixWorld();
      const [x, y] = LR4Power.screen("SwitchPanel_Vac");
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1 }));
      out.vacClick = { vac: LR4Power.state().vac, look: look().Vac, btn: document.getElementById("pwr-vac").getAttribute("aria-pressed") };
      document.getElementById("pwr-vac").click();
      out.vacBack = LR4Power.state().vac;

      document.getElementById("t-run").click();
      LR4AsBuilt.set({ on: true, power: false, stop: { y: 0, z: 0 }, tram: { x: 0, y: 0 }, slip: { on: false }, heat: { on: true, fire: true, auto: false } });
      LR4AsBuilt.setE({ y: 0, z: 0 });
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle();
      await LR4Job.add([new File([${JSON.stringify(DWELL)}], "dwell.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/dwell.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      await T.until(() => LR4Job.running(), 30000);
      for (let i = 0; i < 100 && !(LR4Heat.state() && LR4Heat.state().t > 2); i++) { LR4Heat.tick(0.05); await T.sleep(100); }   // at depth
      out.fired = LR4Heat.fire(1);
      for (let i = 0; i < 80 && !LR4Heat.burning(); i++) { LR4Heat.tick(0.05); await T.sleep(100); }
      out.spinBefore = JOB.spinning;
      const st0 = LR4Heat.state(), r0 = Math.max(0, ...st0.fires.map((f) => f.r || 0)), bit0 = st0.bit = 300;   // (the fire was scripted: a hot bit)
      out.pressed = LR4Power.press();
      out.after = { running: LR4Job.running(), sim: !!window.LR4FluidNC, homed: LR4Ctl.homed(), pill: document.getElementById("st-pill").textContent,
        status: document.getElementById("job-status").textContent, look: look(), btn: document.getElementById("pwr-estop").textContent };
      LR4Ctl.start(); await T.sleep(1500);
      out.refused = !window.LR4FluidNC;
      for (let i = 0; i < 60; i++) LR4Heat.tick(0.05);   // 3 s, no job
      const st1 = LR4Heat.state();
      out.heat = { burning: LR4Heat.burning(), r0, r1: Math.max(0, ...st1.fires.map((f) => f.r || 0)), bit0, bit1: LR4Heat.bit(), spin: JOB.spinning };
      LR4Heat.extinguish(); for (let i = 0; i < 400 && (LR4Heat.flying() || LR4Heat.burning()); i++) { LR4Heat.tick(0.05); await T.sleep(20); }

      const prev2 = window.LR4FluidNC;
      document.getElementById("pwr-estop").click();
      await T.booted(prev2); await T.idle();
      out.released = { sim: !!window.LR4FluidNC, homed: LR4Ctl.homed(), look: look(), pill: document.getElementById("st-pill").textContent };

      // the router's rocker off: the job runs, the router doesn't
      LR4AsBuilt.set({ on: false });
      document.getElementById("pwr-router").click();
      out.why = document.getElementById("pwr-note").textContent;
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed(), 180000); await T.idle();
      await LR4Job.add([new File([${JSON.stringify(SHORT)}], "short.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/short.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go2 = document.getElementById("start-go"); if (go2 && go2.getClientRects().length && !go2.disabled) go2.click();
      await T.until(() => LR4Job.running(), 30000);
      let spun = false;
      for (let i = 0; i < 40 && LR4Job.running(); i++) { await T.sleep(100); spun = spun || JOB.spinning; }
      out.rockerOff = { ran: true, spun };
      document.getElementById("pwr-router").click();
      for (let i = 0; i < 40 && LR4Job.running() && !JOB.spinning; i++) await T.sleep(100);
      out.rockerOn = JOB.spinning || !LR4Job.running();
      const sw = meshes.find((m) => m.userData.name === "Router_Switch"), z0 = sw && sw.position.z;
      LR4Power.set("body", false);
      out.body = { dz: sw ? +(sw.position.z - z0).toFixed(2) : null, why: LR4Power.why() };
      LR4Power.set("body", true);
      return out;
    })()`);
    ok(a.panel.n >= 9 && a.panel.back <= 0.01 && a.panel.top > 0 && a.panel.inX, `the panel on the table's front face, under its top: ${JSON.stringify(a.panel)}`);
    ok(a.look0.Lamp.g > 0.2 && a.look0.Router.g > 0 && a.look0.Vac.g > 0, `lamp + rockers lit at the start ${JSON.stringify(a.look0)}`);
    ok(a.vacClick.vac === false && a.vacClick.look.g === 0 && a.vacClick.btn === "false" && a.vacBack === true, `a click on the vac rocker in the view: off, dark; Run's Vac: on ${JSON.stringify(a.vacClick)}`);
    ok(a.fired && a.spinBefore, "mid-job, router turning, a fire lit");
    ok(a.pressed && !a.after.running && !a.after.sim && !a.after.homed, `E-STOP: the job stopped, FluidNC down, not homed ${JSON.stringify(a.after)}`);
    ok(/E-STOP/.test(a.after.pill) && /E-STOP/.test(a.after.status) && /Release/.test(a.after.btn), `the pill / job status / button say so (${a.after.pill} · ${a.after.status})`);
    ok(Math.abs(a.after.look.EStop.y - a.look0.EStop.y - 6) < 0.01 && a.after.look.Lamp.g === 0 && a.after.look.Router.g === 0 && a.after.look.Vac.g === 0,
      `the head pushed in 6 mm, the lamp and rockers dark ${JSON.stringify(a.after.look)}`);
    ok(a.refused, "no boot while it's pressed");
    ok(a.heat.burning > 0 && a.heat.r1 > a.heat.r0 && a.heat.bit1 < a.heat.bit0 && !a.heat.spin, `the fire burns on and spreads, the bit cools, no spin ${JSON.stringify(a.heat)}`);
    ok(a.released.sim && !a.released.homed && a.released.look.Lamp.g > 0.2 && Math.abs(a.released.look.EStop.y - a.look0.EStop.y) < 0.01 && !/E-STOP/.test(a.released.pill),
      `released: FluidNC up, not homed, lamp lit, head out ${JSON.stringify(a.released)}`);
    ok(/rocker is off/.test(a.why), `Run says why: ${a.why}`);
    ok(!a.rockerOff.spun && a.rockerOn, `the router rocker off: no spin in a job; on again: it turns ${JSON.stringify(a.rockerOff)}`);
    ok(a.body.dz === -3 && /own switch/.test(a.body.why), `the router's own switch off: slid 3 mm, Run says why ${JSON.stringify(a.body)}`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
