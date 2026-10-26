// Part 43c in headless Chrome: a ui video (KIND=ui, tests/video_ui.gcode) played live from the SD card (▶ Play as a
// video -> #help=file): the whole page stays on screen, Step opens the Run tab, Point rings Home with a caption, Click
// homes the machine and starts the job with the page's own Start - then the job runs and the video ends.
//   node tests/test_page_help_ui.js   (not in npm test: needs Chrome (GPU) + Python + parts/; ~2 min)
"use strict";
const fs = require("fs"), path = require("path");
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100), { gpu: true });
  const base = `http://127.0.0.1:${port}/web/index.html?parts=/parts/`;
  const text = fs.readFileSync(path.join(__dirname, "video_ui.gcode"), "utf8");
  const loaded = async () => {
    await sleep(1200);
    for (let i = 0; i < 200; i++) {
      try { if (await page.val("document.readyState === 'complete' && document.getElementById('status').hidden && !!window.LR4Help")) return true; } catch (e) { /* reloading */ }
      await sleep(500);
    }
    return false;
  };
  const until = async (js, secs) => { for (let i = 0; i < secs * 4; i++) { try { if (await page.val(js)) return true; } catch (e) { /* reloading */ } await sleep(250); } return false; };
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: base });
    ok(await loaded(), "page loaded");
    // the file on your SD card -> ⋯ > ▶ Play as a video
    try {
      await page.val(`(async () => { await SdCard.store.put("/video_ui.gcode", ${JSON.stringify(text)}); await sdRefresh();
        const row = [...document.querySelectorAll("#sd-list .sd-row")].find((r) => /video_ui/.test(r.textContent));
        row.querySelector(".sd-more").click();
        [...document.querySelectorAll("#row-menu button")].find((b) => /Play as a video/.test(b.textContent)).click(); })()`);
    } catch (e) { /* reloading */ }
    ok(await loaded(), "reloaded as the help machine");
    ok(await page.val(`MS.help && location.hash === "#help=file" && document.getElementById("mc-btn").textContent === "Help: video_ui.gcode"`), "help machine for the file");
    ok(await until(`!document.getElementById("hv-start").hidden`, 60), "start card");
    await page.val(`document.getElementById("hv-go").click()`);
    ok(await until(`/The Run tab/.test(document.getElementById("rec-title").textContent) && !document.getElementById("rec-title").hidden`, 90), "the title shows");
    ok(await page.val(`document.body.classList.contains("rec-ui") && !document.body.classList.contains("view-only") && !document.body.classList.contains("rec")`),
      "ui video: the whole page (no view-only)");
    ok(await until(`document.getElementById("t-run").getAttribute("aria-pressed") === "true"`, 20), "Step opened the Run tab");
    ok(await until(`(() => { const r = document.querySelector(".rec-ring"), h = document.getElementById("home"); if (!r || r.hidden) return false;
      const a = r.getBoundingClientRect(), b = h.getBoundingClientRect(); return a.left < b.left && a.right > b.right && a.top < b.top && a.bottom > b.bottom; })()`, 20),
      "Point: the ring round Home");
    ok(await page.val(`/every axis to its switch/.test(document.getElementById("rec-caption").textContent)`), "Point's caption");
    ok(await until("CTL.homing || CTL.homed", 20) && !!await page.val("document.querySelector('.rec-pointer')"), "Click on Home: the pointer, homing");
    ok(await until("CTL.homed", 120), "homed");
    ok(await until("!!FJ.job", 60), "Click on Start: the job runs from the page's own ▶");
    ok(await until("LR4Help.state().done", 180), "the video ends");
    ok(await page.val(`!document.querySelector(".rec-pointer") && !document.querySelector(".rec-ring")`), "pointer and ring gone at the end");
    try { await page.val(`document.querySelector("#hv-bar .hv-exit").click()`); } catch (e) { /* reloading */ }
    ok(await loaded() && await page.val(`!MS.temp && location.hash === ""`), "Exit: back on yours");
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
