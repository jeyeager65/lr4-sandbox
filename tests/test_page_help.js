// Part 43b in headless Chrome: Help videos. The Help menu lists help/index.json; a video reloads the page as the
// temporary machine "Help: <title>" (fresh, yours untouched), the start card's ▶ plays it live on FluidNC: a title
// shows, homing ends, ⏸ holds the director and FluidNC, a drag takes the camera (Follow gives it back), it plays to
// the end; Exit reloads back to your machine byte for byte as it was (settings, SD card).
//   node tests/test_page_help.js   (not in npm test: needs Chrome + Python + parts/; ~3-4 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100), { gpu: true });   // live frames: SwiftShader is far too slow
  const base = `http://127.0.0.1:${port}/web/index.html?parts=/parts/`;
  const loaded = async () => {                        // after a navigation / reload: the page up again
    await sleep(1200);
    for (let i = 0; i < 200; i++) {
      try { if (await page.val("document.readyState === 'complete' && document.getElementById('status').hidden && !!window.MS && !!window.LR4Help")) return true; } catch (e) { /* reloading */ }
      await sleep(500);
    }
    return false;
  };
  const until = async (js, secs) => { for (let i = 0; i < secs * 4; i++) { try { if (await page.val(js)) return true; } catch (e) { /* reloading */ } await sleep(250); } return false; };
  // your machine: its id, every setting, its SD card's files (path + bytes)
  // keys sorted: localStorage.key(i)'s order isn't kept (any write can reshuffle it), the values are what count
  const mine = () => page.val(`(async () => JSON.stringify({ id: MS.id, temp: MS.temp,
    s: Object.fromEntries(Object.entries(MS.settingsOf(MS.id)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    sd: (await SdCard.store.all()).map((r) => [r.path, Array.from(r.bytes).join(",")]) }))()`);
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: base });
    ok(await loaded(), "page loaded");
    // something of yours to keep: router off, a file on the card
    await page.val(`(async () => { const r = document.getElementById("opt-router"); if (r.checked) r.click();
      await SdCard.store.put("/mine.nc", "(Video Title: TEXT=Mine)\\nG0 X1\\n"); return true; })()`);
    await sleep(500);
    await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);   // what a plain reload writes is in "before" too
    await page.send("Page.navigate", { url: base });
    await loaded(); await sleep(1500);
    const before = await mine();
    // the Help menu
    const rows = await page.val(`(async () => { document.getElementById("hv-btn").click();
      for (let i = 0; i < 40 && !document.querySelector("#hv-list .hv-row"); i++) await new Promise((r) => setTimeout(r, 100));
      return [...document.querySelectorAll("#hv-list .hv-row")].map((b) => b.querySelector("b").textContent + " | " + b.querySelector("em").textContent); })()`);
    ok(rows.length >= 1 && rows.some((r) => /^Why home\? \| about/.test(r)), `Help menu: ${rows.join("; ")}`);
    ok(await page.val(`!document.getElementById("hv-pop").hidden`), "the menu opens");
    // the SD card file with (Video ...) lines: "▶ Play as a video" in its menu
    ok(await page.val(`(async () => { await sdRefresh(); const row = [...document.querySelectorAll("#sd-list .sd-row")].find((r) => /mine/.test(r.textContent));
      row.querySelector(".sd-more").click(); const t = document.getElementById("row-menu").textContent; document.getElementById("row-menu").hidden = true; return /Play as a video/.test(t); })()`),
      "an SD file with (Video ...) lines offers ▶ Play as a video");
    // play one: the page reloads as the help machine
    try { await page.val(`[...document.querySelectorAll("#hv-list .hv-row")].find((b) => /Why home/.test(b.textContent)).click()`); } catch (e) { /* reloading */ }
    ok(await loaded(), "reloaded");
    const h = await page.val(`({ id: MS.id, help: MS.help, hash: location.hash, btn: document.getElementById("mc-btn").textContent,
      router: document.getElementById("opt-router").checked, banner: !document.getElementById("mc-banner").hidden })`);
    ok(h.id === "help" && h.help && h.hash === "#help=why_home" && !h.banner, `help machine: ${JSON.stringify(h)}`);
    ok(h.router, "fresh: the router option at its default (yours is off)");
    ok(await until(`!document.getElementById("hv-start").hidden`, 60), "the start card shows once the page is up");
    ok(await page.val(`document.getElementById("hv-start-h").textContent === "Why home?"`), "start card: the video's title");
    await page.val(`document.getElementById("hv-go").click()`);
    ok(await until(`!document.getElementById("rec-title").hidden && /Why home/.test(document.getElementById("rec-title").textContent)`, 90),
      "▶: the title card shows");
    ok(await page.val(`document.body.classList.contains("view-only") && !document.getElementById("hv-bar").hidden`), "machine video: view only, the player bar");
    ok(await page.val(`!!SND.s && SND.s.on()`), "sound on for the video");
    // ⏸: the director holds (no frames), FluidNC too
    await until(`!document.getElementById("rec-caption").hidden`, 30);
    await page.val(`document.getElementById("hv-play").click()`);
    const f0 = await page.val("LR4Director.frames()"); await sleep(1500); const f1 = await page.val("LR4Director.frames()");
    ok(f0 === f1 && await page.val("LR4Help.state().paused"), `⏸ holds (frames ${f0} -> ${f1})`);
    await page.val(`document.getElementById("hv-play").click()`);
    await sleep(1000);
    ok(await page.val(`LR4Director.frames() > ${f1}`), "▶ goes on");
    // a drag on the view takes the camera; Follow gives it back
    const drag = async (x0, y0, x1, y1) => {
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", clickCount: 1 });
      for (let k = 1; k <= 6; k++) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x1 - x0) * k / 6, y: y0 + (y1 - y0) * k / 6, button: "left", buttons: 1 });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button: "left", clickCount: 1 });
    };
    await drag(700, 500, 820, 520);
    ok(await page.val(`LR4Help.state().free && !document.getElementById("hv-follow").hidden && !LR4Help.state().paused`), "a drag takes the camera (Follow shows, still playing)");
    await page.val(`document.getElementById("hv-follow").click()`);
    ok(await page.val(`!LR4Help.state().free && document.getElementById("hv-follow").hidden`), "Follow hands it back");
    // a click on the view pauses
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 500, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 500, button: "left", clickCount: 1 });
    ok(await page.val("LR4Help.state().paused"), "a click on the view pauses");
    await page.val(`document.getElementById("hv-play").click()`);
    // homing, then the job, then the end
    ok(await until("CTL.homed", 150), "homing ends ($H on the help machine)");
    ok(await until("LR4Help.state().done", 240), `it plays to the end (${await page.val(`document.getElementById("hv-msg").textContent`)})`);
    ok(await page.val(`!document.getElementById("hv-again").hidden`), "Watch again offered at the end");
    // Exit: yours, as it was
    try { await page.val(`document.querySelector("#hv-bar .hv-exit").click()`); } catch (e) { /* reloading */ }
    ok(await loaded(), "Exit reloads");
    const after = await mine();
    const diff = (() => {                            // which keys changed, to say what leaked
      const a = JSON.parse(before), b = JSON.parse(after), out = [];
      for (const k of ["id", "temp"]) if (a[k] !== b[k]) out.push(`${k}: ${a[k]} -> ${b[k]}`);
      const sa = a.s || {}, sb = b.s || {};
      for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) out.push(`${k}: ${JSON.stringify(sa[k])} -> ${JSON.stringify(sb[k])}`.slice(0, 160));
      if (JSON.stringify(a.sd) !== JSON.stringify(b.sd)) out.push("the SD card");
      const ka = Object.keys(sa), kb = Object.keys(sb), i = ka.findIndex((k, j) => k !== kb[j]);
      if (!out.length && i >= 0) out.push(`same values, key order changed at ${ka[i]} / ${kb[i]}`);
      return out;
    })();
    ok(after === before, `Exit: your machine byte for byte as it was (${after.length} chars of settings + SD)${diff.length ? ": " + diff.join("; ") : ""}`);
    if (after !== before) {
      const A = JSON.parse(before), B = JSON.parse(after);
      for (const k of new Set([...Object.keys(A.s), ...Object.keys(B.s)])) if (A.s[k] !== B.s[k]) console.log(`    setting ${k}: ${String(A.s[k]).slice(0, 120)} -> ${String(B.s[k]).slice(0, 120)}`);
      const sd = (x) => x.sd.map(([p, b]) => p + ":" + b.length).join(" ");
      if (sd(A) !== sd(B)) console.log(`    SD: ${sd(A)} -> ${sd(B)}`);
      for (const [p, b] of A.sd) { const q = B.sd.find((x) => x[0] === p); if (q && q[1] !== b) {
        const x = b.split(",").map(Number), y = q[1].split(",").map(Number), i = x.findIndex((v, j) => v !== y[j]);
        console.log(`    SD ${p} differs at byte ${i}: "${String.fromCharCode(...x.slice(Math.max(0, i - 40), i + 40))}" -> "${String.fromCharCode(...y.slice(Math.max(0, i - 40), i + 40))}"`); } }
      if (A.id !== B.id) console.log(`    id ${A.id} -> ${B.id}`);
    }
    ok(await page.val(`location.hash === "" && !MS.temp && !document.getElementById("opt-router").checked`), "back on yours (router still off)");
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
