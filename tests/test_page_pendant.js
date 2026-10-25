// Part 20 in headless Chrome (serve.py's headers): the pendant works. FluidNC mode starts FluidTouch on the pendant;
//  - its screen is the pendant screen's texture (the texture's canvas = FluidTouch's pixels);
//  - a real mouse click on the pendant screen in the view touches FluidTouch (the camera doesn't orbit, nothing is
//    picked); the pop-out window shows the same screen and its clicks touch it too;
//  - VR preview: a controller tip pressed into the glass touches it, pulled back lets go;
//  - jog from the pendant (Control > Jog X+ Y+, clicked in the view);
//  - from the pendant alone, twice (every tap a mouse click on the screen in the view; then VR-preview pokes, the pendant
//    carried): $H (Control > Home All), then Files > LR4_strut_plates_<length>mm_....gcode > play; the page follows the
//    job (FluidNC's $SD/Run waits until the page is ready), each M0 resumed from the pendant's HOLD dialog, to Done,
//    carving the same stock as Playback (as test_page_sdjob.js).
// Screenshots: build/pendant_*.png.
//   node tests/test_page_pendant.js [--no-job]   (not in npm test: needs Chrome + Python; ~8 min: the job twice at 10x)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

const NO_JOB = process.argv.includes("--no-job");
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

// FluidTouch's screen (800 x 480 px) - where its buttons are (from build/pendant_*.png)
const UI = {
  tab: { status: [67, 30], control: [200, 30], files: [333, 30] },
  homeAll: [475, 321], pauseResume: [255, 132],   // Control > Actions
  sub: { actions: [75, 97], jog: [75, 168] },        // Control's side tabs
  jog: { xPlus: [435, 210], yPlus: [355, 130] },    // Control > Jog (XY step 10 mm, its default)
  play: [725, 165],                               // Files: the first file's play button
  holdResume: [260, 337],                         // the HOLD dialog (M0) on the Status tab
};

const P_HELPERS = `
  window.PT = {
    ft: () => LR4Pendant.ft(),
    hash(x0, y0, w, h) { const ft = PT.ft(), p = ft.pixels(); let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * ft.width + x) * 4; s = (s * 31 + p[i] * 7 + p[i + 1] * 3 + p[i + 2]) >>> 0; } return s; },
    shot() { const ft = PT.ft(), c = document.createElement("canvas"); c.width = ft.width; c.height = ft.height; ft.draw(c.getContext("2d")); return c.toDataURL("image/png"); },
    async tap(x, y) { const ft = PT.ft(); ft.touch(x, y, true); await T.sleep(150); ft.touch(x, y, false); await T.sleep(700); },
    // look straight at the pendant's screen from 350 mm out; -> client px of screen pixel (x, y)
    face() {
      const { camera, controls } = LR4Demo, c = LR4Pendant.point(0.5, 0.5, 0), e = LR4Pendant.point(0.5, 0.5, 350);
      camera.position.copy(e); controls.target.copy(c); camera.up.set(0, 0, 1); controls.update(); camera.updateMatrixWorld();
    },
    client(x, y) {
      const ft = PT.ft(), p = LR4Pendant.point(x / ft.width, 1 - y / ft.height, 0).project(LR4Demo.camera);
      const r = document.querySelector("canvas").getBoundingClientRect();
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
    },
    popClient(x, y) { const r = document.getElementById("ft-pop-c").getBoundingClientRect(); return [r.left + x / 800 * r.width, r.top + y / 480 * r.height]; },
  };
  true`;

function savePng(dataUrl, name) {
  const out = path.join(ROOT, "build", name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  return out;
}

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  for (const f of ["fluidnc/program.wasm", "fluidtouch/fluidtouch.wasm"])
    if (!fs.existsSync(path.join(ROOT, "web", f))) { console.log(`web/${f} missing`); process.exit(1); }
  const port = 8990 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9600 + Math.floor(Math.random() * 100));
  const click = async ([x, y]) => {               // a real mouse click (CDP), so the page's own listeners see it
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await page.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      if (type === "mousePressed") await sleep(150);
    }
    await sleep(700);
  };
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Pendant && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded, cross-origin isolated");
    if (!up) return;
    await page.val(HELPERS);
    await page.val(P_HELPERS);

    // FluidNC mode: FluidTouch starts with it and connects
    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      LR4Pendant.set(true);                          // the option (off by default)
      document.getElementById("job-temp").click();   // the strut job on the card
      const sim = await T.booted(null);
      if (!sim) return { err: "FluidNC didn't boot" };
      const ft = await T.until(() => LR4Pendant.ft(), 30000);
      if (!ft) return { err: "FluidTouch didn't start" };
      const conn = await T.until(() => LR4Pendant.log().some((l) => /WebSocket connected/.test(l)), 30000);
      await T.sleep(2500);
      return { conn: !!conn, btn: !document.getElementById("ft-pop-btn").disabled, log: LR4Pendant.log().slice(-15) };
    })()`);
    if (a.err) { ok(false, a.err); return; }
    ok(a.conn, "FluidNC mode starts FluidTouch on the pendant; it connects to FluidNC");
    if (!a.conn) console.log(a.log.join("\n"));
    ok(a.btn, "the Pendant screen button is on");

    // a click on the pendant's screen in the view: Control tab; the camera stays, nothing picked
    await page.val("PT.face(); true");
    await sleep(500);
    const before = await page.val(`({ h: PT.hash(0, 60, 800, 360), cam: LR4Demo.camera.position.toArray() })`);
    await click(await page.val(`PT.client(${UI.tab.control})`));
    const after = await page.val(`({ h: PT.hash(0, 60, 800, 360), cam: LR4Demo.camera.position.toArray(), pick: !document.getElementById("pick").hidden, shot: PT.shot() })`);
    ok(after.h !== before.h, "a click on the pendant's screen in the view opens FluidTouch's Control tab");
    ok(!after.pick && after.cam.every((v, i) => Math.abs(v - before.cam[i]) < 1e-6), "... and doesn't orbit or pick a part");
    console.log("  screenshot:", savePng(after.shot, "pendant_control.png"));

    // the pop-out: same screen; a click on its Files tab
    await page.val(`document.getElementById("ft-pop-btn").click(); true`);
    await sleep(500);
    const pop = await page.val(`(() => { const c = document.getElementById("ft-pop-c"), d = c.getContext("2d").getImageData(0, 0, 800, 480).data;
      let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return { open: LR4Pendant.popOpen(), lit, h: PT.hash(0, 60, 800, 360) }; })()`);
    ok(pop.open && pop.lit > 10000, `the pop-out shows FluidTouch's screen (${pop.lit} lit px)`);
    await click(await page.val(`PT.popClient(${UI.tab.files})`));
    const files = await page.val(`(async () => { await T.sleep(1500); return { h: PT.hash(0, 60, 800, 360), shot: PT.shot() }; })()`);
    ok(files.h !== pop.h, "a click in the pop-out opens the Files tab");
    console.log("  screenshot:", savePng(files.shot, "pendant_files.png"));
    await page.val(`document.getElementById("ft-pop-x").click(); true`);

    // VR preview: the controller's tip pressed into the glass on the Status tab, then pulled back
    const vr = await page.val(`(async () => {
      LR4VR.page.preview("one");
      const h0 = PT.hash(0, 60, 800, 360), [x, y] = ${JSON.stringify(UI.tab.status)};
      const at = (d) => LR4Pendant.point(x / 800, 1 - y / 480, d);
      const far = LR4VR.page.probe.poke(at(20)), down = LR4VR.page.probe.poke(at(1)), held = LR4VR.page.probe.poke(at(-2));
      await T.sleep(150);
      const lift = LR4VR.page.probe.poke(at(20));
      await T.sleep(1200);
      const h1 = PT.hash(0, 60, 800, 360);
      // pick it up, lift the hand 200 mm, poke Control where the screen is now, put it down
      const pr = LR4VR.page.probe, home = LR4Pendant.point(0.5, 0.5, 0).clone();
      const picked = pr.pickUp(LR4Pendant.point(0.5, 0.5, 10));
      LR4VR.page.rig.position.z += 200; LR4VR.page.rig.updateMatrixWorld(); pr.carryTick();
      const moved = LR4Pendant.point(0.5, 0.5, 0).distanceTo(home);
      const c0 = PT.hash(0, 60, 800, 360), cp = (d) => LR4Pendant.point(200 / 800, 1 - 30 / 480, d);
      const cd = pr.poke(cp(1)); await T.sleep(150); pr.poke(cp(20)); await T.sleep(1200);
      const carriedTouch = PT.hash(0, 60, 800, 360) !== c0;
      pr.putDown(); LR4VR.page.rig.position.z -= 200;
      const back = LR4Pendant.point(0.5, 0.5, 0).distanceTo(home);
      LR4VR.page.preview(null);
      return { picked, moved, cd, carriedTouch, back, far, down, held, lift, changed: h1 !== h0 };
    })()`);
    ok(vr.far === false && vr.down === "down" && vr.held === "on" && vr.lift === false, `VR poke: 20 mm out ${vr.far}, 1 mm ${vr.down}, 2 mm in ${vr.held}, back out ${vr.lift}`);
    ok(vr.changed, "the VR poke opens FluidTouch's Status tab");
    ok(vr.picked && Math.abs(vr.moved - 200) < 1, `VR grip near the pendant picks it up; it follows the hand (${vr.moved.toFixed(1)} mm for 200)`);
    ok(vr.cd === "down" && vr.carriedTouch, "the carried pendant's screen still takes pokes (Control)");
    ok(vr.back < 0.01, `let go: back on its stand (${vr.back.toFixed(3)} mm off)`);
    if (NO_JOB) return;

    // the pendant's taps two ways: real mouse clicks on its screen in the 3D view (CDP), or a VR-preview finger
    // poking the glass while the other hand carries the pendant
    const blocked = [];                             // what covered the pendant's screen when a click went in
    const viaView = async ([x, y]) => {             // look back at the pendant first: a hold's probe close-up turns the view away
      await sleep(1200);
      await page.val("PT.face(); true");
      await sleep(200);
      const c = await page.val(`PT.client(${x}, ${y})`);
      const over = await page.val(`(() => { const e = document.elementFromPoint(${c[0]}, ${c[1]});
        return e && e.tagName !== "CANVAS" ? ((e.closest("[id]") || e).id || e.tagName) : ""; })()`);
      if (over) blocked.push(over);
      await click(c);
    };
    const viaVR = async ([x, y]) => {
      await page.val(`(async () => { const p = LR4VR.page.probe, at = (d) => LR4Pendant.point(${x} / 800, 1 - ${y} / 480, d);
        p.carryTick(); p.poke(at(1)); await T.sleep(150); p.poke(at(20)); await T.sleep(700); return true; })()`);
    };
    const st = () => page.val(`({ homed: LR4Ctl.homed(), state: LR4Ctl.state(), mpos: LR4Ctl.mpos(), running: LR4Job.running(), held: LR4Job.held(),
      pop: !document.getElementById("job-pop").hidden, msg: document.getElementById("job-pop-msg").textContent,
      plate: LR4Ctl.plate(), status: document.getElementById("job-status").textContent })`);
    const waitFor = async (fn, ms) => { const t0 = Date.now(); for (;;) { const s = await st(); if (fn(s)) return s; if (Date.now() - t0 > ms) return null; await sleep(200); } };

    // the strut job from the pendant alone at 10x: Home All, Files > play, Resume in its HOLD dialog at each M0
    async function job(tap, name) {
      const out = { holds: [], plates: [] };
      await page.val(`(() => { const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change")); return true; })()`);
      await tap(UI.tab.control); await tap(UI.sub.actions); await tap(UI.homeAll);
      out.homed = !!(await waitFor((s) => s.homed && s.state === "Idle", 120000));
      if (!out.homed) { out.homeWhy = await page.val(`[document.getElementById("home-status").textContent, LR4Ctl.state(), ...[...document.querySelectorAll("#ctl-log > div")].slice(-10).map((d) => d.textContent)]`); return out; }
      await tap(UI.tab.files); await sleep(1500);
      await tap(UI.play);
      const s0 = await waitFor((s) => s.running, 15000);
      out.started = !!s0; out.startStatus = s0 && s0.status;
      const t0 = Date.now();
      for (;;) {
        const s = await st();
        if (!s.running) { out.status = s.status; break; }
        if (s.held && s.pop) {
          out.holds.push(s.msg); out.plates.push(s.plate);
          if (out.holds.length === 1) savePng(await page.val("PT.shot()"), `pendant_${name}_hold.png`);
          await sleep(300);
          await tap(UI.holdResume);
          await waitFor((q) => !q.held || !q.running, 10000);
        }
        if (Date.now() - t0 > 900000 || out.holds.length > 12) { out.status = "timed out"; break; }
        await sleep(200);
      }
      out.secs = (Date.now() - t0) / 1000;
      Object.assign(out, await page.val(`(() => {
        const a = LR4Job.sim(), b = LR4Job.playbackHeights();
        let n = 0, big = 0, cut = 0;
        for (let i = 0; i < a.heights.length; i++) {
          const d = Math.abs(a.heights[i] - b.heights[i]);
          if (d > 0.05) n++;
          if (d > a.dx + 0.01) big++;
          if (a.heights[i] < a.stock.zmax - 1e-3) cut++;
        }
        return { off: n / a.heights.length, big, cut, log: [...document.querySelectorAll("#ctl-log > div")].slice(-12).map((d) => d.textContent) };
      })()`));
      return out;
    }
    function report(j, how) {
      ok(j.homed, `${how}: Home All on the pendant homes FluidNC ($H)`);
      if (!j.homed) console.log("    " + (j.homeWhy || []).join(" | "));
      ok(j.started, `${how}: Files > play on the pendant, the page follows the job (${j.startStatus})`);
      ok(j.status === "Done." && j.holds.length >= 2, `${how}: ${j.holds.length} M0 holds resumed on the pendant, ${j.status} (${(j.secs || 0).toFixed(0)} s)`);
      if (j.status !== "Done.") console.log((j.log || []).join(String.fromCharCode(10)));
      ok(j.plates.some((v) => v) && !j.plates.every((v) => v), `${how}: touch plate on / off at the holds (${j.plates})`);
      ok(j.cut > 1000 && j.big === 0 && j.off < 0.001, `${how}: the carve matches Playback (${j.cut} cells cut, ${(100 * (j.off || 0)).toFixed(3)}% differ, ${j.big} beyond a cell's slope)`);
    }

    // 1. desktop: every tap a mouse click on the screen in the view. First a jog: Control > Jog, X+ and Y+ by 10 mm
    await page.val("PT.face(); true");
    await sleep(500);
    const m0 = (await st()).mpos;
    await viaView(UI.tab.control); await viaView(UI.sub.jog);
    await viaView(UI.jog.xPlus); await viaView(UI.jog.yPlus);
    const m1 = (await waitFor((s) => s.state === "Idle" && s.mpos && Math.abs(s.mpos[1] - m0[1]) > 1, 20000) || {}).mpos;
    savePng(await page.val("PT.shot()"), "pendant_jog.png");
    ok(m1 && Math.abs(m1[0] - m0[0] - 10) < 0.01 && Math.abs(m1[1] - m0[1] - 10) < 0.01,
      `jog on the pendant (clicks in the view): X+ Y+ 10 mm (MPos ${m0 && m0.map((v) => v.toFixed(2))} -> ${m1 && m1.map((v) => v.toFixed(2))})`);
    report(await job(viaView, "view"), "clicks in the view");
    if (blocked.length) console.log("  covered the pendant at a click:", [...new Set(blocked)].join(", "), "x" + blocked.length);
    if (blocked.length) console.log("  covered the pendant at a click:", [...new Set(blocked)].join(", "), "x" + blocked.length);

    // 2. VR preview at 1:1: the pendant picked up off its stand, every tap a poke with the other hand
    const vrUp = await page.val(`(() => { const V = LR4VR.page; V.preview("one"); V.probe.menu(false);
      return V.probe.pickUp(LR4Pendant.point(0.5, 0.5, 10)); })()`);
    ok(vrUp, "VR preview: the pendant picked up for the job");
    report(await job(viaVR, "vr"), "VR pokes");
    await page.val(`(() => { LR4VR.page.probe.putDown(); LR4VR.page.preview(null); return true; })()`);
  } finally {
    await page.close();
    srv.kill();
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
