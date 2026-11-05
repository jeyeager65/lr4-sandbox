// Part 45a in headless Chrome (serve.py's headers): the router + its speed dial.
//  - the dial wheel has its numbered ring; Run's slider turns it (50 deg a step) and it's kept per machine;
//  - in the view: a click on the wheel = the next number, a drag up / right = faster (the big readout shows);
//  - a job on the Kobalt at dial 3 with M3 S24000 "(Turn On Router at Dial 4)": it runs at 18000 (the dial), the
//    terminal + Run note the file's dial 4; the bit turns ~2 rev/s with its blur discs; switched to the AutoSpin T1
//    mid-job: 24000 (S). A screenshot of the dial close-up: ROUTER_SHOT=path.
//   node tests/test_page_router.js   (not in npm test: needs Chrome + Python; ~2 min)
"use strict";
const fs = require("fs");
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const STOCK = "(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-12 ZMAX=0)";
const JOBTXT = ["(LR4 router test)", STOCK, "(ToolDef 1: SHAPE=flat D=6.35 FLUTES=2 LEN=19 NAME=1/4in flat)", "G21 G90 G54", "T1",
  "M3 S24000 (Turn On Router at Dial 4)", "G0 Z5", "G0 X20 Y50", "G1 Z-1 F300", "G1 X180 F300", "G1 X20", "G0 Z5", "M5", "M30", ""].join("\n");

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 480 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Router && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const a = await page.val(`(async () => {
      const out = {}, dial = document.getElementById("rt-dial");
      LR4Router.set({ router: "kobalt", dial: 3 });
      out.ring3 = LR4Router.ring();
      dial.value = 5; dial.dispatchEvent(new Event("input"));
      out.ring5 = LR4Router.ring();
      out.kept = JSON.parse(MS.get("lr4-router") || "null");
      out.rpmText = document.getElementById("rt-rpm").textContent;
      // the camera at the wheel's open edge
      const dm = meshes.find((m) => m.userData.name === "Router_Dial"), ring = dm.userData.ring;
      const c = ring.getWorldPosition(new THREE.Vector3()), o = new THREE.Vector3(...dm.userData.dial.out).normalize();
      camera.position.copy(c).addScaledVector(o, 160).add(new THREE.Vector3(0, -60, 40)); controls.target.copy(c); controls.update(); camera.updateMatrixWorld();
      await T.sleep(300);
      const [x, y] = LR4Router.screen();
      const ev = (t, X, Y) => (t === "pointerdown" ? canvas : window).dispatchEvent(new PointerEvent(t, { clientX: X, clientY: Y, button: 0, buttons: t === "pointerup" ? 0 : 1, bubbles: true, pointerId: 1 }));
      ev("pointerdown", x, y); ev("pointerup", x, y);
      out.click = LR4Router.state().dial;
      ev("pointerdown", x, y); ev("pointermove", x - 30, y + 10); ev("pointermove", x - 70, y + 10);
      out.readout = !!document.querySelector(".rt-readout.on") && document.querySelector(".rt-readout").textContent;
      ev("pointerup", x - 70, y + 10);
      out.drag = LR4Router.state().dial;
      const wh = (dy, shift) => canvas.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: dy, shiftKey: !!shift, bubbles: true, cancelable: true }));
      LR4Router.set({ dial: 3 });
      wh(-100); out.wheel = [LR4Router.state().dial];
      for (let i = 0; i < 10; i++) wh(-10);          // a touchpad: 10 small deltas = one notch
      out.wheel.push(LR4Router.state().dial);
      wh(100); out.wheel.push(LR4Router.state().dial);
      LR4Router.set({ dial: 3.2 }); out.half = LR4Router.state().dial === 3 && (ev("pointerdown", x, y), ev("pointermove", x + 18, y), ev("pointermove", x + 22, y), ev("pointerup", x + 22, y), LR4Router.state().dial);
      LR4Router.set({ dial: 3 });

      document.getElementById("t-run").click();
      const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed(), 180000); await T.idle();
      await LR4Job.add([new File([${JSON.stringify(JOBTXT)}], "router.gcode")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/router.gcode" && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.sleep(500);
      const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
      await T.until(() => LR4Job.running(), 30000);
      await T.until(() => JOB.spinning, 20000);
      await T.sleep(2500);
      const j = soundJob();
      out.run = { rpm: j && j.rpm, rps: +(JOB.rps || 0).toFixed(2), ghost: [GHOST.bit.visible, +GHOST.bit.material.opacity.toFixed(2), GHOST.nut.visible],
        note: document.getElementById("rt-note").textContent, log: [...document.querySelectorAll("#ctl-log div")].some((d) => /asks for dial 4/.test(d.textContent)) };
      // the close-up while it turns (the readout on)
      ring.getWorldPosition(c);                      // the machine moved since
      camera.position.copy(c).addScaledVector(o, 200).add(new THREE.Vector3(0, -110, -40)); controls.target.copy(c).add(new THREE.Vector3(0, 0, -70)); controls.update();
      LR4Router.set({ dial: 3 }); rtReadout();
      await T.sleep(400);
      return out;
    })()`);
    if (process.env.ROUTER_SHOT) {
      const s = await page.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(process.env.ROUTER_SHOT, Buffer.from(s.data, "base64"));
    }
    const b = await page.val(`(async () => {
      // Part 45b: the model from the preset, swapped mid-job (Carbide: motor cap 75 wide)
      LR4WiringView.set(true);                       // (Part 53c: the cord is drawn only with Layers > Wiring on)
      const look = () => {
        const m = (n) => meshes.find((q) => q.userData.name === n), h = new THREE.Box3().setFromObject(m("Router_MotorCap"));
        const ring = m("Router_Dial").userData.ring, ax = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.getWorldQuaternion(new THREE.Quaternion()));
        const cp = cordMesh && cordMesh.geometry.attributes.position;
        return { w: +(h.max.y - h.min.y).toFixed(1), top: +h.max.z.toFixed(1), ax: ax.toArray().map((v) => +Math.abs(v).toFixed(2)),
          label: m("Router_Housing").userData.label, cord: cp ? new THREE.Vector3(cp.getX(0), cp.getY(0), cp.getZ(0)).sub(new THREE.Box3().setFromObject(m("Router_ColletNut")).getCenter(new THREE.Vector3())).toArray().map((v) => +v.toFixed(1)) : null, running: LR4Job.running() };
      };
      const kob = look();
      LR4Router.set({ router: "t1" });
      await T.sleep(300);
      const j = soundJob(), out = { rpm: j && j.rpm, slider: document.getElementById("rt-dial").disabled, text: document.getElementById("rt-rpm").textContent };
      out.kob = kob;
      out.t1 = look();
      LR4Router.set({ router: "carbide" });
      await T.sleep(300);
      out.carb = look();
      LR4Router.set({ router: "kobalt", dial: 3 });
      await T.sleep(300);
      out.kob2 = look();
      return out;
    })()`);
    ok(b.kob.w === 80 && b.t1.w === 75.2 && b.carb.w === 75.2 && b.kob2.w === 80 && b.carb.top < b.kob.top, `the model from the preset: motor cap 80 wide (Kobalt) -> 75.2 (T1: the Makita's body) -> 75.2 (Carbide: the Makita's body too, lower) -> 80 (${JSON.stringify([b.kob.w, b.t1.w, b.carb.w, b.kob2.w, b.kob.top, b.carb.top])})`);
    ok(b.kob.ax[2] > 0.99 && Math.abs(b.carb.ax[2]) < 0.01, `the wheel's axis: upright (Kobalt); the Carbide's on top stands across its head (Part 46d) (${JSON.stringify([b.kob.ax, b.carb.ax])})`);
    ok(/Carbide/.test(b.carb.label) && /Kobalt/.test(b.kob2.label), `the housing's label follows (${b.carb.label})`);
    ok(b.carb.cord && b.kob.cord && Math.hypot(...b.carb.cord.map((v, i) => v - b.kob.cord[i])) > 10 && JSON.stringify(b.kob2.cord) === JSON.stringify(b.kob.cord),
      `the cord leaves where the router's does, from the nut (${JSON.stringify([b.kob.cord, b.carb.cord])})`);
    ok(b.carb.running && b.kob2.running, "the job keeps running through the swaps");
    ok(a.ring3 !== null && Math.abs(a.ring3 - a.ring5 - 100 * Math.PI / 180) < 1e-3, `the ring turns 50 deg a step (dial 3 -> 5: ${a.ring3} -> ${a.ring5})`);
    ok(a.kept && a.kept.dial === 5 && a.kept.router === "kobalt", `kept per machine ${JSON.stringify(a.kept)}`);
    ok(/26,000 RPM/.test(a.rpmText), `Run shows the dial's speed (${a.rpmText})`);
    ok(a.click === 6, `a click on the wheel: the next number (5 -> ${a.click})`);
    ok(a.drag === 4, `a drag left 70 / down 10 px: 2 steps slower (6 -> ${a.drag})`);
    ok(JSON.stringify(a.wheel) === "[3.5,4,3.5]" && a.half === 3.5, `0.5 stops: scroll a stop a notch, small deltas summed; a drag snaps (3 -> ${a.half} / ${JSON.stringify(a.wheel)})`);
    ok(a.readout && /Dial/.test(a.readout), `the big readout while it turns (${a.readout})`);
    ok(a.run.rpm === 18000, `Kobalt dial 3, the file's S24000: runs at 18000 (${a.run.rpm})`);
    ok(/dial 4/.test(a.run.note) && a.run.log, `the file's dial 4 noted in Run + the terminal (${a.run.note})`);
    ok(a.run.rps > 1.8 && a.run.rps <= 2.05, `the bit turns ~2 rev/s (${a.run.rps})`);
    ok(a.run.ghost[0] && a.run.ghost[1] > 0.2 && a.run.ghost[2], `the blur discs round the bit + nut (${JSON.stringify(a.run.ghost)})`);
    ok(b.rpm === 24000 && b.slider && /S/.test(b.text), `AutoSpin T1 mid-job: S24000 = 24000, the dial off (${JSON.stringify(b)})`);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
