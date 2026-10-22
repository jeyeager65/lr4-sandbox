// Part 24 in headless Chrome (serve.py's headers): Basic mode's pendant. FluidTouch starts in Basic mode on
// js/basic_nc.js (the stand-in for FluidNC) and drives the page, every tap on FluidTouch's own screen:
//  - it connects and gets status reports (Idle, the page's MPos);
//  - Control > Home All homes the page (Basic's homing), the pendant shows MPos;
//  - Control > Jog X+ / Y+ moves the machine 10 mm each, at the jog feed;
//  - Files lists the SD card; play starts the strut job in Basic; the first M0 is resumed from FluidTouch's HOLD dialog
//    and the job plays on; Ctrl-X from here stops it where it is (state back to Idle).
// Screenshots: build/basic_*.png.
//   node tests/test_page_basic.js   (not in npm test: needs Chrome + Python; ~2 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

// FluidTouch's screen (800 x 480 px), as tests/test_page_pendant.js
const UI = {
  tab: { status: [67, 30], control: [200, 30], files: [333, 30] },
  homeAll: [475, 321],
  sub: { actions: [75, 97], jog: [75, 168] },
  jog: { xPlus: [435, 210], yPlus: [355, 130] },
  play: [725, 165],
  holdResume: [260, 337],
};

const B_HELPERS = `
  window.PT = {
    ft: () => LR4Pendant.ft(),
    shot() { const ft = PT.ft(), c = document.createElement("canvas"); c.width = ft.width; c.height = ft.height; ft.draw(c.getContext("2d")); return c.toDataURL("image/png"); },
    async tap(x, y) { const ft = PT.ft(); ft.touch(x, y, true); await T.sleep(150); ft.touch(x, y, false); await T.sleep(700); },
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
  if (!fs.existsSync(path.join(ROOT, "web", "fluidtouch/fluidtouch.wasm"))) { console.log("web/fluidtouch/fluidtouch.wasm missing"); process.exit(1); }
  const port = 8990 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9600 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Basic && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded, cross-origin isolated");
    if (!up) return;
    await page.val(HELPERS);
    await page.val(B_HELPERS);
    const tap = (xy) => page.val(`PT.tap(${xy[0]}, ${xy[1]}).then(() => true)`);
    const st = () => page.val(`({ s: LR4Basic.status(), homed: LR4Basic.homed(), playing: LR4Basic.playing(), pop: LR4Basic.pop(), t: LR4Basic.t() })`);
    const waitFor = async (fn, ms) => { const t0 = Date.now(); for (;;) { const s = await st(); if (fn(s)) return s; if (Date.now() - t0 > ms) return null; await sleep(200); } };

    const off = await page.val(`(async () => { await T.sleep(4000);   // past Basic's 3 s start
      return { on: document.getElementById("ft-on").checked, ft: !!LR4Pendant.ft(), btn: document.getElementById("ft-pop-btn").hidden,
        row: document.getElementById("row-Pendant").hidden }; })()`);
    ok(!off.on && !off.ft && off.btn && off.row, "pendant off by default: no FluidTouch, no model, no button: " + JSON.stringify(off));
    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      LR4Basic.pendant(true);                        // the option (off by default)
      document.getElementById("job-temp").click();   // the strut job on the card
      const ft = await T.until(() => LR4Pendant.ft(), 40000);
      if (!ft) return { err: "FluidTouch didn't start in Basic mode" };
      const conn = await T.until(() => LR4Pendant.log().some((l) => /WebSocket connected/.test(l)), 30000);
      await T.sleep(2500);
      return { mode: LR4Ctl.mode(), nc: !!LR4Basic.nc(), conn: !!conn, status: LR4Pendant.log().some((l) => /First status report|Connection established/.test(l)),
        btn: !document.getElementById("ft-pop-btn").disabled, label: document.querySelector('#ctl-mode [data-v="play"]').textContent };
    })()`);
    ok(!a.err && a.mode === "play" && a.nc && a.conn && a.status, "FluidTouch on the stand-in in Basic: " + JSON.stringify(a));
    ok(a.label === "Basic" && a.btn, "the mode is called Basic; Pendant screen button on");
    if (a.err) return;
    savePng(await page.val("PT.shot()"), "basic_connected.png");

    await tap(UI.tab.control); await tap(UI.sub.actions); await tap(UI.homeAll);
    const h = await waitFor((s) => s.homed && s.s.state === "Idle", 120000);
    ok(!!h, "Home All from the pendant homes the page: " + JSON.stringify(h && h.s.mpos));
    savePng(await page.val("PT.shot()"), "basic_homed.png");

    const m0 = (await st()).s.mpos;
    await tap(UI.sub.jog); await tap(UI.jog.xPlus);
    const j1 = await waitFor((s) => s.s.state === "Idle" && Math.abs(s.s.mpos[0] - m0[0]) > 1, 20000);
    await tap(UI.jog.yPlus);
    const j2 = await waitFor((s) => s.s.state === "Idle" && Math.abs(s.s.mpos[1] - m0[1]) > 1, 20000);
    const d = j2 && [j2.s.mpos[0] - m0[0], j2.s.mpos[1] - m0[1]];
    ok(!!j1 && !!j2 && Math.abs(Math.abs(d[0]) - 10) < 0.01 && Math.abs(Math.abs(d[1]) - 10) < 0.01, "jog X+ then Y+ from the pendant: " + JSON.stringify(d));
    savePng(await page.val("PT.shot()"), "basic_jog.png");

    await tap(UI.tab.files); await sleep(1500);
    savePng(await page.val("PT.shot()"), "basic_files.png");
    await tap(UI.play);
    const r = await waitFor((s) => s.playing || s.pop, 15000);   // its first M0 comes within a second
    ok(!!r && /^(Run|Hold)/.test(r.s.state) &&/LR4_strut_plates\.gcode$/.test((r.s.sd || [])[1] || ""), "Files > play starts the job in Basic: " + JSON.stringify(r && r.s.sd));
    const hold = await waitFor((s) => s.pop, 120000);
    ok(!!hold && hold.s.state === "Hold:0", "M0: the pendant sees Hold");
    if (hold) {
      await sleep(800);
      savePng(await page.val("PT.shot()"), "basic_hold.png");
      const t0 = hold.t;
      await tap(UI.holdResume);
      const on = await waitFor((s) => s.playing && s.t > t0, 10000);
      ok(!!on && !on.pop, "Resume in FluidTouch's HOLD dialog plays on");
    }
    const stop = await page.val(`(async () => { const nc = LR4Basic.nc(), id = nc.vconn.open(80, () => {}, () => {});
      nc.vconn.send(id, new TextEncoder().encode("GET / HTTP/1.1\\r\\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\\r\\n\\r\\n"));
      const f = new Uint8Array([0x81, 0x81, 0, 0, 0, 0, 0x18]); nc.vconn.send(id, f); nc.vconn.close(id);
      await T.sleep(500); return { s: LR4Basic.status(), playing: LR4Basic.playing() }; })()`);
    ok(stop.s.state === "Idle" && !stop.playing && !stop.s.sd, "Ctrl-X stops the job where it is: " + stop.s.state);
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
