// Part 43d in headless Chrome: every help video in web/help/index.json played live, start to end, on the help
// machine: it reaches the end, its job ran on FluidNC (homed, the job started), the director said no "(Video):"
// problem (an unknown element, Show / Inspect id, a missing design file), and Exit gets back to yours.
//   node tests/test_page_help_all.js [id ...]   (not in npm test: needs Chrome (GPU) + Python + parts/; ~2-3 min a video)
"use strict";
const fs = require("fs"), path = require("path");
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "../web/help/index.json"), "utf8")).videos;
  const want = process.argv.slice(2), list = want.length ? index.filter((v) => want.includes(v.id)) : index;
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100), { gpu: true });
  const base = `http://127.0.0.1:${port}/web/index.html?parts=/parts/`;
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
    for (const v of list) {
      console.log(`${v.id} (${v.kind}, listed ~${v.secs} s):`);
      await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);
      await page.send("Page.navigate", { url: base + "#help=" + v.id });
      ok(await loaded() && await until(`!document.getElementById("hv-start").hidden`, 90), "start card");
      const t0 = Date.now();
      await page.val(`window.__homed = false; window.__job = false; setInterval(() => { if (CTL.homed) __homed = true; if (FJ.job) __job = true; }, 200);
        document.getElementById("hv-go").click()`);
      const done = await until("LR4Help.state().done", 420);
      const secs = Math.round((Date.now() - t0) / 1000);
      ok(done, `plays to the end (${secs} s live: ${await page.val(`document.getElementById("hv-msg").textContent`)})`);
      ok(await page.val("__homed && __job"), "homed, and its job ran on FluidNC");
      const bad = await page.val(`LR4Director.events().filter((e) => /^[\\d.]+ log \\(Video\\):/.test(e))`);
      ok(!bad.length, `no script problems${bad.length ? ": " + bad.join(" | ") : ""}`);
      ok(await page.val(`document.body.classList.contains("view-only") === ${v.kind === "machine"}`), `${v.kind} layout`);
    }
    try { await page.val(`document.querySelector("#hv-bar .hv-exit").click()`); } catch (e) { /* reloading */ }
    ok(await loaded() && await page.val("!MS.temp"), "Exit: back on yours");
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
