// Part 42 in headless Chrome: My machines. Two machines keep their own settings and SD cards (switching reloads);
// Duplicate copies the SD card; a shared link opens as the temporary machine (banner, yours untouched) and Save keeps
// it; export -> import round trip; Delete drops the machine's databases. Calls the page's MS / MC (no prompts).
//   node tests/test_page_machines.js   (not in npm test: needs Chrome + Python + parts/; ~1-2 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  const base = `http://127.0.0.1:${port}/web/index.html?parts=/parts/`;
  const loaded = async () => {                        // after a navigation / MC.go: the page up again
    await sleep(1200);
    for (let i = 0; i < 160; i++) {
      try { if (await page.val("document.readyState === 'complete' && document.getElementById('status').hidden && !!window.MS")) return true; } catch (e) { /* reloading */ }
      await sleep(500);
    }
    return false;
  };
  const go = async (js) => { try { await page.val(js); } catch (e) { /* the page went away */ } return loaded(); };
  const state = () => page.val(`(async () => ({ id: MS.id, name: MS.name, temp: MS.temp, btn: document.getElementById("mc-btn").textContent,
    router: document.getElementById("opt-router").checked, banner: !document.getElementById("mc-banner").hidden,
    sd: (await SdCard.store.all()).map((r) => r.path).filter((p) => !p.startsWith("/LR4_strut")).join(), n: MS.list().length }))()`);
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: base + "#26x50" });
    ok(await loaded(), "page loaded");
    // a clean start: one machine
    await go(`(async () => { for (const m of MS.list()) if (m.id !== MS.id) { await MC.drop(m.id); MS.remove(m.id); }
      MS.clear(); for (const r of await SdCard.store.all()) await SdCard.store.remove(r.path); MS.rename(MS.id, "My LR4"); MC.go(); })()`);
    let a = await state();
    ok(a.n === 1 && a.btn === "My LR4 ▾" && !a.temp && !a.banner, `one machine: "${a.btn}"`);
    // machine 1: router off + a file on its card
    await page.val(`(async () => { document.getElementById("opt-router").click(); await SdCard.store.put("/one.nc", "G0 X1\\n"); return true; })()`);
    const first = a.id;
    // New -> defaults, its own (empty) card
    await go(`MC.go(MS.add("Second"))`);
    let b = await state();
    ok(b.id !== first && b.btn === "Second ▾" && b.router && b.sd === "", `New: "${b.btn}", router on (default), empty SD card`);
    // back to the first: as it was
    await go(`MC.go(${JSON.stringify(first)})`);
    a = await state();
    ok(a.id === first && !a.router && a.sd === "/one.nc", `switch back: router off, SD ${a.sd}`);
    // Duplicate: settings + SD card
    await go(`(async () => { const id = MS.add(MS.name + " copy", MS.id); await MC.write(id, await MC.data(MS.id)); MC.go(id); })()`);
    let c = await state();
    ok(c.btn === "My LR4 copy ▾" && !c.router && c.sd === "/one.nc", `Duplicate: "${c.btn}", router off, SD ${c.sd}`);
    // Delete it: its databases go
    const dupId = c.id;
    await go(`(async () => { await MC.drop(MS.id); MS.remove(MS.id); MC.go(); })()`);
    const dbs = await page.val(`indexedDB.databases().then((l) => l.map((d) => d.name).filter((n) => n.includes(${JSON.stringify(dupId)})))`);
    a = await state();
    ok(a.n === 2 && !(await page.val(`!!MS.find(${JSON.stringify(dupId)})`)) && dbs.length === 0, `Delete: ${a.n} machines left, its databases gone (${dbs.join() || "none"})`);
    // a shared link: temporary, banner, yours untouched
    await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);   // a hash change alone doesn't reload
    await page.send("Page.navigate", { url: base + "#26x50&router=0&fan=0&units=mm" });
    await loaded();
    let s = await state();
    const back = await page.val(`document.getElementById("mc-back").textContent`);
    ok(s.temp && s.btn === "Shared build ▾" && s.banner && !s.router && s.sd === "", `shared link: "${s.btn}", banner, "${back}", empty SD card`);
    await page.val(`(async () => { await SdCard.store.put("/shared.nc", "G0\\n"); return true; })()`);
    // Back: yours as it was (the link's fan=0 didn't touch it)
    await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);
    await page.send("Page.navigate", { url: base });
    await loaded();
    a = await state();
    ok(!a.temp && a.id === first && await page.val(`document.getElementById("opt-fan").checked`) === true && a.sd === "/one.nc", "Back to mine: unchanged");
    // the link again, then Save as one of my machines
    await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);   // a hash change alone doesn't reload
    await page.send("Page.navigate", { url: base + "#26x50&router=0&fan=0&units=mm" });
    await loaded();
    s = await state();
    ok(s.sd === "", "the link again: fresh (the last visit's file gone)");
    await page.val(`(async () => { await SdCard.store.put("/shared.nc", "G0\\n"); return true; })()`);
    await go(`(async () => { const id = MS.add("From a link", MS.SHARED); await MC.write(id, await MC.data(MS.SHARED)); MC.go(id); })()`);
    s = await state();
    ok(!s.temp && s.btn === "From a link ▾" && !s.router && s.sd === "/shared.nc" && s.n === 3, `Save: "${s.btn}", its settings + SD card, ${s.n} machines`);
    // export -> import
    await go(`(async () => {
      const m = Object.assign({ name: MS.name, settings: MS.settingsOf(MS.id) }, await MC.data(MS.id));
      const f = LR4Machines.importOf(JSON.parse(JSON.stringify(LR4Machines.exportOf(m))));
      const id = MS.add(MS.uniqueName(f.name)); MS.writeSettings(id, f.settings); await MC.write(id, f); MC.go(id); })()`);
    const im = await state();
    ok(im.btn === "From a link (2) ▾" && !im.router && im.sd === "/shared.nc", `export -> import: "${im.btn}", settings + SD card`);
    // the popover lists them
    const list = await page.val(`(() => { document.getElementById("mc-btn").click(); return [...document.querySelectorAll("#mc-list button")].map((b) => b.textContent + (b.getAttribute("aria-current") === "true" ? "*" : "")).join(", "); })()`);
    ok(/From a link \(2\)\*/.test(list) && list.split(", ").length === 4, `list: ${list}`);
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();

