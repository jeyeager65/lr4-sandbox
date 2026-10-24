// FluidTouch (web/fluidtouch, the pendant's firmware UI built for the browser) in headless Chrome, connected to the
// page's FluidNC through FluidNC's own web server (sim.vconn): boots, draws frames, connects ("LowRider (browser)"),
// its Status tab shows FluidNC's MPos after a G0 (read from the screen pixels: the digits change), a touch on the
// screen changes it, stop() removes its iframe. Screenshots: build/fluidtouch_*.png.
//   node tests/test_page_fluidtouch.js [headers|plain]   (headers by default; not in npm test: needs Chrome + Python
//   and build/fixtures/JP3_LR.yaml - node tests/test_sim_config.js fetches it)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

const MODE = process.argv[2] || "headers";
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const FT_HELPERS = `
  window.FTT = {
    log: [],
    shot(ft, name) { const c = document.createElement("canvas"); c.width = ft.width; c.height = ft.height; ft.draw(c.getContext("2d")); return c.toDataURL("image/png"); },
    // the screen's pixels in a box, as a hash: changes when what's drawn there changes
    hash(ft, x0, y0, w, h) { const p = ft.pixels(); let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * ft.width + x) * 4; s = (s * 31 + p[i] * 7 + p[i + 1] * 3 + p[i + 2]) >>> 0; } return s; },
    async loadScript(src) { if (window.FluidTouchSim) return; await new Promise((r, j) => { const s = document.createElement("script"); s.src = src; s.onload = r; s.onerror = j; document.head.appendChild(s); }); },
  };
  true`;

function savePng(dataUrl, name) {
  const out = path.join(ROOT, "build", name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  return out;
}

async function run(mode) {
  console.log(`${mode}:`);
  const port = 8790 + Math.floor(Math.random() * 100), srv = server(mode, port);
  const page = await chromePage(9300 + Math.floor(Math.random() * 500));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let iso = false;
    for (let i = 0; i < 120 && !iso; i++) {
      await sleep(500);
      try { iso = await page.val("window.crossOriginIsolated === true && !!window.LR4Ctl && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* reloading */ }
    }
    ok(iso, "page is cross-origin isolated and loaded");
    if (!iso) return;
    await page.val(HELPERS);
    await page.val(FT_HELPERS);

    // FluidNC in the page's FluidNC mode (V1E's JP3_LR), then FluidTouch on it
    const a = await page.val(`(async () => {
      await FTT.loadScript("js/fluidtouch_sim.js");
      document.getElementById("t-run").click();
      document.querySelector('#ctl-mode [data-v="fluidnc"]').click();
      const sim = await T.booted(null);
      if (!sim) return { err: "FluidNC didn't boot" };
      const ft = await FluidTouchSim.start({ fluidnc: sim, onPrint: (l) => FTT.log.push(l) });
      window.FTT.ft = ft;   // not window.FT: the page has a global FT of its own
      const f0 = ft.frame();
      const connected = await T.until(() => FTT.log.some((l) => /WebSocket connected/.test(l)), 30000);
      // first status report reaches the Status tab
      await T.sleep(2500);
      return { info: ft.info, f0, f1: ft.frame(), connected: !!connected, frames: document.querySelectorAll("iframe").length,
        log: FTT.log.filter((l) => /FluidNC|SIM|Error|error/.test(l)).slice(-25) };
    })()`);
    if (a.err) { ok(false, a.err); return; }
    ok(a.f1 > a.f0 || a.f1 > 0, `FluidTouch boots and draws (frame ${a.f1}; build ${a.info.commit ? a.info.commit.slice(0, 8) : "?"}${a.info.dirty ? " dirty" : ""})`);
    ok(a.connected, "FluidTouch's WebSocket connects to FluidNC's web server");
    if (!a.connected) console.log(a.log.join("\n"));

    // FluidNC moves -> the Status tab's machine position X box redraws
    const b = await page.val(`(async () => {
      const sim = window.LR4FluidNC, box = [270, 165, 190, 40];
      const h0 = FTT.hash(FTT.ft, ...box);
      const r = await sim.command("G0 X12.5 Y5 Z-2");
      const s = await T.idle();
      await T.sleep(1000);
      return { ok: r.ok, mpos: s, h0, h1: FTT.hash(FTT.ft, ...box), shot: FTT.shot(FTT.ft) };
    })()`);
    ok(b.ok && b.h1 !== b.h0, `G0 X12.5 Y5 Z-2 (FluidNC MPos ${b.mpos}): FluidTouch's machine position redraws`);
    console.log("  screenshot:", savePng(b.shot, "fluidtouch_status.png"));

    // a touch on the Control tab: the tab bar and the page change
    const c = await page.val(`(async () => {
      const h0 = FTT.hash(FTT.ft, 0, 60, 800, 360);
      FTT.ft.touch(200, 30, true); await T.sleep(150); FTT.ft.touch(200, 30, false);
      await T.sleep(1000);
      return { h0, h1: FTT.hash(FTT.ft, 0, 60, 800, 360), shot: FTT.shot(FTT.ft) };
    })()`);
    ok(c.h1 !== c.h0, "a touch on Control opens that tab");
    console.log("  screenshot:", savePng(c.shot, "fluidtouch_control.png"));

    // FluidTouch -> FluidNC: Zero X (Control > Actions) sets G54 X to the machine's X
    const z = await page.val(`(async () => {
      FTT.ft.touch(685, 132, true); await T.sleep(150); FTT.ft.touch(685, 132, false);
      await T.sleep(1500);
      const r = await window.LR4FluidNC.command("$#");
      return (r.lines.find((e) => /^\\[G54:/.test(e.line)) || {}).line || "";
    })()`);
    ok(/^\[G54:12\.500,/.test(z), `Zero X on the pendant: FluidNC ${z}`);

    const d = await page.val(`(() => { const n = document.querySelectorAll("iframe").length; FTT.ft.stop(); return [n, document.querySelectorAll("iframe").length]; })()`);
    ok(d[0] - d[1] === 1, "stop() removes FluidTouch's iframe (FluidNC keeps running)");
  } finally {
    await page.close();
    srv.kill();
  }
}

if (require.main === module) (async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, "web", "fluidtouch", "fluidtouch.wasm"))) { console.log("web/fluidtouch/fluidtouch.wasm missing - run python tools/build_fluidtouch_wasm.py"); process.exit(1); }
  await run(MODE);
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
