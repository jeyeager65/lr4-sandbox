// Part 38 in headless Chrome: the part files. With every file (?parts=): the Parts chip says N/N ✓ and the welcome
// card stays shut. One file taken away: its parts become grey stand-in boxes ("file missing"), the hardware joined
// to them hides, the chip turns amber and opens the card (one Download row per Printables source). The file back:
// the stand-ins go and the card closes itself. A file dragged over the page shows the whole-window drop.
//   node tests/test_page_parts.js   (not in npm test: needs Chrome + Python + parts/; ~1 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 160 && !up; i++) {
      await sleep(500);
      try { up = await page.val("document.getElementById('status').hidden && /✓/.test(document.getElementById('parts-chip').textContent)"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded with every part file");
    if (!up) return;
    const a = await page.val(`({ chip: document.getElementById("parts-chip").textContent, card: document.getElementById("welcome").hidden,
      standins: meshes.filter((m) => m.userData.standin).length })`);
    ok(/^Parts (\d+)\/\1 ✓$/.test(a.chip) && a.card && a.standins === 0, `all there: "${a.chip}", card shut, ${a.standins} stand-ins`);
    // take one file away (as if never loaded): the part that uses it
    const b = await page.val(`(async () => {
      const path = [...needed.keys()].find((p) => p.endsWith("YZ_Plate_Max.stl")) || [...needed.keys()].find((p) => needed.get(p).length === 1 && /\\.stl$/.test(p));
      const keep = userFiles.get(path);
      window.__keep = [path, keep];
      userFiles.delete(path); dropSrcGeometry(); rebuild(); renderFiles();
      await new Promise((r) => setTimeout(r, 300));
      const names = needed.get(path), st = meshes.filter((m) => m.userData.standin);
      const hw = meshes.filter((m) => m.userData.joins && m.userData.joins.some((n) => names.includes(n)));
      document.getElementById("parts-chip").click();
      return { path, names, standins: st.map((m) => m.userData.name), label: st[0] && st[0].userData.label,
        hwHidden: hw.length && hw.every((m) => m.userData.missingHw && !m.visible), hw: hw.length,
        chip: document.getElementById("parts-chip").textContent, amber: document.getElementById("parts-chip").classList.contains("warn"),
        card: !document.getElementById("welcome").hidden, rows: document.querySelectorAll("#wc-src .wc-row").length,
        sources: Object.keys(cfg.files.sources).filter((s) => [...needed.keys()].some((p) => cfg.files.files[p].source === s)).length };
    })()`);
    ok(b.names.every((n) => b.standins.includes(n)) && / \(file missing\)$/.test(b.label || ""), `${b.path.split("/").pop()} missing: stand-in ${b.standins.join(", ")} ("${b.label}")`);
    ok(b.hw > 0 && b.hwHidden, `its ${b.hw} hardware parts hidden with it`);
    ok(/^Parts \d+\/\d+ · add files$/.test(b.chip) && b.amber, `chip: "${b.chip}" (amber)`);
    ok(b.card && b.rows === b.sources, `the chip opens the card: ${b.rows} Download rows for ${b.sources} sources`);
    // the file back (as dropped): the stand-in goes, the card closes itself
    const c = await page.val(`(async () => {
      const [path] = window.__keep;
      await addFiles([{ name: path, read: () => fetch("/parts/" + path).then((q) => q.arrayBuffer()) }]);
      return { standins: meshes.filter((m) => m.userData.standin).length, card: document.getElementById("welcome").hidden,
        chip: document.getElementById("parts-chip").textContent };
    })()`);
    ok(c.standins === 0 && c.card && /✓/.test(c.chip), `file back: ${c.standins} stand-ins, card closed itself, "${c.chip}"`);
    const d = await page.val(`(() => {
      const dt = new DataTransfer(); dt.items.add(new File(["x"], "x.stl"));
      document.querySelector("canvas").dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      const on = document.getElementById("drop").classList.contains("over");
      document.getElementById("sd-list").dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      return { on, sd: document.getElementById("drop").classList.contains("over") };
    })()`);
    ok(d.on && !d.sd, `drag a file over the page: the whole-window drop (${d.on}); over the SD card list: its own (${!d.sd})`);
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
