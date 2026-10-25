// Part 39 in headless Chrome at phone size (390 x 844, touch): Design = the steps under the view; Run = the view on
// top, Hold / Stop, the readout, Home / Zero / Jog / Files and the job; Jog and Files open as bottom sheets; the
// console is a line at the bottom that opens as a sheet; no Flash, Pendant & WebUI or pendant option.
// Screenshots: build/phone_run.png, build/phone_files.png.
//   node tests/test_page_phone.js   (not in npm test: needs Chrome + Python + parts/; ~1 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const LOOK = `(() => {
  const shown = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const pos = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).position : ""; };
  const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.top, r.bottom].map(Math.round); };
  return { w: innerWidth, h: innerHeight, steps: shown("#steps"), phRow: shown("#ph-row"), hz: shown(".side-l .hz"), jog: shown("#pos-jog"), jogPos: pos("#pos-jog"),
    sd: shown("#sd-box"), job: shown("#h-job"), right: pos("#run-right"), pw: shown("#pw-btn"), flash: shown("#src-flash"), ftOpt: shown(".no-phone"),
    con: pos("#ctl-box"), conBox: box("#ctl-box"), pill: shown("#st-pill"), dro: shown("#dro"), hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
})()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9290 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9500 + Math.floor(Math.random() * 100));
  try {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 160 && !up; i++) {
      await sleep(500);
      try { up = await page.val("document.getElementById('status').hidden && /✓/.test(document.getElementById('parts-chip').textContent)"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded at phone size");
    if (!up) return;
    const d = await page.val(`(() => { document.getElementById("t-design").click(); return ${LOOK}; })()`);
    ok(d.w === 390 && d.steps && !d.ftOpt && !d.hscroll, `Design: ${d.w} px wide, the steps shown, no pendant option, no sideways scroll`);
    const r = await page.val(`(async () => { document.getElementById("t-run").click(); await new Promise((q) => setTimeout(q, 500)); return ${LOOK}; })()`);
    ok(r.pill && r.dro && r.phRow && !r.hz && !r.jog && r.job && !r.sd, `Run: pill, readout, Home / Zero / Jog / Files, the job; no Home / Zero rows, jog or SD card inline`);
    ok(!r.pw && !r.flash, "Run: no Pendant & WebUI, no Flash");
    ok(r.con === "fixed" && Math.abs(r.conBox[1] - r.h) <= 1 && r.conBox[1] - r.conBox[0] < 60 && !r.hscroll, `the console: a line at the bottom (${r.conBox}), no sideways scroll`);
    const shot = async (name) => {
      const s = await page.send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
      fs.writeFileSync(path.join(ROOT, "build", name), Buffer.from(s.data, "base64"));
    };
    await shot("phone_run.png");
    const j = await page.val(`(async () => { document.getElementById("ph-jog").click(); await new Promise((q) => setTimeout(q, 300)); return ${LOOK}; })()`);
    ok(j.jog && j.jogPos === "fixed", `Jog opens the jog sheet (${j.jogPos})`);
    const f = await page.val(`(async () => { document.getElementById("ph-files").click(); await new Promise((q) => setTimeout(q, 300)); return ${LOOK}; })()`);
    ok(f.sd && f.right === "fixed" && !f.jog, `Files opens the files sheet (SD card, ${f.right}) and closes Jog`);
    await shot("phone_files.png");
    const x = await page.val(`(async () => { document.querySelector("#run-right .sheet-x").click(); document.getElementById("con-fold").click();
      await new Promise((q) => setTimeout(q, 300)); const o = ${LOOK}; document.getElementById("con-fold").click(); return o; })()`);
    ok(!x.sd && x.conBox[1] - x.conBox[0] > 200, `✕ closes it; the console opens as a sheet (${x.conBox[1] - x.conBox[0]} px)`);
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
