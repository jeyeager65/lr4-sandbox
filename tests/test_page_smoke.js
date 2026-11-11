// The page as a first visitor gets it - no part files - in headless Chrome: it loads, draws the machine (grey boxes
// for the printed parts), survives a size change and both tabs, and nothing throws on the way (js/page_errors.js's
// LR4Errors). Then one error on purpose: the bar at the bottom says so.
// Needs no parts/, build/ or FreeCAD, so CI runs it (.github/workflows/ci.yml).
//   node tests/test_page_smoke.js   (~1 min; needs Chrome + Python)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9490 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  const errors = () => page.val(`(window.LR4Errors ? LR4Errors.list.map((e) => e.kind + ": " + e.msg + " " + e.at) : ["no LR4Errors"])`);
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html#26x50` });
    let up = false;
    for (let i = 0; i < 480 && !up; i++) {
      await sleep(500);
      try { up = await page.val("!!window.LR4Errors && !!window.LR4Ctl && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "the page loaded with no part files");
    const first = await page.val(`({ n: meshes.length, strut: S.strut, version: document.getElementById("version").textContent,
      chip: document.getElementById("parts-chip").textContent, iso: window.crossOriginIsolated === true })`);
    ok(first.n > 50 && first.strut > 0, `the machine is drawn (${first.n} meshes, strut ${first.strut} mm)`);
    ok(/lr4-sandbox \d+\.\d+\.\d+/.test(first.version), `the footer has the version (${first.version})`);
    ok(/add files|\d+\/\d+/.test(first.chip), `the Parts chip asks for the files (${first.chip.trim()})`);
    let e = await errors();
    ok(!e.length, `no errors after loading${e.length ? ": " + e.join(" | ") : ""}`);

    const sized = await page.val(`(async () => { const i = document.getElementById("cut-x"); i.value = "33"; i.dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 2500)); return { n: meshes.length, strut: S.strut }; })()`);
    ok(sized.n > 50 && sized.strut > first.strut, `a wider machine is drawn (33 in: strut ${sized.strut} mm)`);
    const tabs = await page.val(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById("t-run").click(); await w(1500);
      const run = document.documentElement.dataset.mode;
      document.getElementById("t-design").click(); await w(1000);
      return { run, design: document.documentElement.dataset.mode }; })()`);
    ok(tabs.run === "run" && tabs.design === "design", `Run and back to Configure (${JSON.stringify(tabs)})`);
    e = await errors();
    ok(!e.length, `no errors after a size change and the tabs${e.length ? ": " + e.join(" | ") : ""}`);

    // an error on purpose: the bar
    page.mute(true);                                 // (not "[exception]" lines: tools/page_tests.js counts those as failures)
    const bar = await page.val(`(async () => { setTimeout(() => { throw new Error("smoke test error"); }, 0);
      Promise.reject(new Error("smoke test rejection"));
      const p = document.createElement("audio").play(); if (p) p.catch(() => {});
      Promise.reject(new DOMException("not a fault", "AbortError"));
      await new Promise((r) => setTimeout(r, 500));
      const b = document.getElementById("errbar");
      return { text: b && b.textContent, n: LR4Errors.list.length, kinds: LR4Errors.list.map((q) => q.kind).sort().join(),
        report: !!b && /issues\\/new/.test(b.querySelector("a").href), alert: b && b.getAttribute("role") }; })()`);
    ok(bar.n === 2 && bar.kinds === "error,promise", `an uncaught error and a rejected promise are caught, an AbortError is not (${bar.n}: ${bar.kinds})`);
    ok(bar.text && /smoke test error/.test(bar.text) && /and 1 more/.test(bar.text) && /Reload/.test(bar.text) && bar.report && bar.alert === "alert",
      `the bar says what went wrong, with Reload and Report (${bar.text})`);
    const gone = await page.val(`([...document.querySelectorAll("#errbar button")].find((b) => b.textContent === "Dismiss").click(), !document.getElementById("errbar"))`);
    ok(gone, "Dismiss closes it");
  } catch (err) {
    ok(false, "threw: " + (err && err.stack || err));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
