// Part 33 in headless Chrome: the table = spoilboard + 2 rail strips on a base (Build > Table > Base: MDF sheet /
// torsion box). Checks the parts in the Show tree, the cut list rows, the spoilboard height field on the Spoilboard,
// the legs under the base, and the link / LR4Machine "base" setting. Screenshots: build/table_sheet.png, build/table_torsion.png.
//   node tests/test_page_table.js   (not in npm test: needs Chrome + Python; ~1 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const STATE = `(() => {
  const parts = LR4Show.tree().flatMap((a) => a.kinds.flatMap((k) => k.parts));
  const bom = document.querySelector(".bom-body") ? document.querySelector(".bom-body").textContent : "";
  const sp = LR4Job.spoil();
  return { parts: parts.filter((p) => /^(Table|Spoilboard|RailStrip)/.test(p)), bom: bom.match(/(Spoilboard|Rail strip, M..|Table sheet|Table top|Torsion box rib, along .)/g) || [],
    spoil: sp && [sp.stock.xmin, sp.stock.xmax, sp.stock.ymin, sp.stock.ymax, sp.stock.zmin], floor: LR4Demo.floorZ ? LR4Demo.floorZ() : null,
    pressed: document.querySelector('#table-variant button[aria-pressed="true"]').dataset.v, link: location.hash };
})()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9090 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9700 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("document.getElementById('status').hidden && !!window.LR4Job && !!LR4Job.spoil()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    await page.val(`LR4Machine.apply({ base: "sheet" }); true`);
    await sleep(1500);
    const a = await page.val(STATE);
    ok(["RailStrip_Min", "RailStrip_Max", "Spoilboard", "TableBase"].every((p) => a.parts.includes(p)) && !a.parts.includes("TableMDF") &&
      !a.parts.includes("TableRibs"), `sheet: ${a.parts.join(", ")}`);
    ok(a.bom.includes("Spoilboard") && a.bom.includes("Table sheet") && !a.bom.includes("Table top"), `sheet cut list: ${a.bom.join(", ")}`);
    // the spoilboard field = the Spoilboard (the bit's travel + 1/4 in a side: 674.8 x 1284.2 mm at 26 x 50), 3/4 in deep
    const w = a.spoil && a.spoil[1] - a.spoil[0], l = a.spoil && a.spoil[3] - a.spoil[2];
    ok(a.spoil && Math.abs(w - 674.8) < 3 && Math.abs(l - 1284.2) < 3 && Math.abs(a.spoil[4] + 19.05) < 0.1,
      `spoilboard field ${w && w.toFixed(1)} x ${l && l.toFixed(1)} mm, ${a.spoil && a.spoil[4]}`);
    const png0 = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ROOT, "build", "table_sheet.png"), Buffer.from(png0.data, "base64"));
    const bad = await page.val(`LR4Machine.apply({ base: "torsion" })`);
    await sleep(2500);
    const b = await page.val(STATE);
    ok(!bad.length && b.pressed === "torsion", `LR4Machine base=torsion (${bad.join("; ")})`);
    ok(b.parts.includes("TableRibs") && !b.parts.includes("TableBase") && b.parts.includes("Spoilboard"), `torsion: ${b.parts.join(", ")}`);
    ok(b.bom.includes("Torsion box rib, along Y") && b.bom.includes("Torsion box rib, along X") && !b.bom.includes("Table sheet"),
      `torsion cut list: ${b.bom.join(", ")}`);
    ok(a.floor !== null && Math.abs(a.floor - b.floor) < 0.5, `the floor stays put (table height = spoilboard top): ${a.floor} / ${b.floor}`);
    const png = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ROOT, "build", "table_torsion.png"), Buffer.from(png.data, "base64"));
    await page.val(`LR4Machine.apply({ base: "sheet" }); true`);
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    await page.close();
    srv.kill();
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
