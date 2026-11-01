// Part 47b in headless Chrome: your own Learn clips. Import a .gcode (a demo), a mine clip and a .zip (JSZip from
// cdnjs: needs the internet) - each listed as imported in its group (no GROUP: My clips); a file with errors isn't
// added and says why; Delete (confirmed) takes one off; the clips are this machine's (another machine doesn't see
// them); an imported demo plays on the help machine and Exit comes back to Learn; export round-trips (47b.3).
//   node tests/test_page_learn_files.js   (not in npm test: needs Chrome + Python + parts/; ~1-2 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const DEMO = ["(Video Learn: NAME=My squaring check)", "(Video Learn: GROUP=Setting up)", "(Video Learn: DESC=Home, then a short move.)",
  "(Video: MACHINE=26x50)", "(Video Home:)", "(Video Text: TIME=1 TEXT=Here it goes)", "G21 G90", "G0 X20 Y20", "G0 X30", ""].join("\n");
const MINE = ["(Video Learn: NAME=A quick bit swap)", "(Video Learn: KIND=mine)", "(Video Learn: DESC=Yours, and back.)",
  "(Video BitChange: BIT=1/8 HOLD=wrenches)", ""].join("\n");
const BAD = ["(Video Learn: NAME=Broken GROUP=x)", "G0 X1", "(Video Learn: DESC=late)", ""].join("\n");
const ZIPPED = ["(Video Learn: DESC=No name, no group.)", "(Video: MACHINE=26x50)", "(Video Home:)", "G0 X5", ""].join("\n");

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9490 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9300 + Math.floor(Math.random() * 100), { gpu: true });
  const base = `http://127.0.0.1:${port}/web/index.html?parts=/parts/`;
  const until = async (js, secs) => { for (let i = 0; i < secs * 4; i++) { try { if (await page.val(js)) return true; } catch (e) { /* loading */ } await sleep(250); } return false; };
  const loaded = async () => { await sleep(1200); return until("document.readyState === 'complete' && document.getElementById('status').hidden && !!window.LR4Help && !!window.MS", 100); };
  const rows = () => page.val(`[...document.querySelectorAll("#ln-list .ln-group")].map((g) => g.querySelector("h2").textContent + ": " +
    [...g.querySelectorAll(".hv-row")].map((b) => b.querySelector("b").textContent + (b.closest(".ln-imp") ? " [imported]" : "")).join(", ")).join(" / ")`);
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: base });
    ok(await loaded(), "page loaded");
    await page.val(`document.getElementById("t-learn").click()`);
    await until(`!!document.querySelector("#ln-list .hv-row")`, 10);
    // import: two files + a bad one + a zip (made in the page with JSZip)
    const r = await page.val(`(async () => {
      const Z = await loadJSZip(), z = new Z(); z.file("clips/zipped_clip.gcode", ${JSON.stringify(ZIPPED)}); z.file("clips/notes.pdf", "x");
      const data = await z.generateAsync({ type: "uint8array" });
      return LR4Help.import([{ name: "squaring.gcode", text: ${JSON.stringify(DEMO)} }, { name: "swap.nc", text: ${JSON.stringify(MINE)} },
        { name: "broken.gcode", text: ${JSON.stringify(BAD)} }, { name: "clips.zip", data }, { name: "photo.jpg", text: "x" }]); })()`);
    ok(r.added.length === 3 && r.added.includes("My squaring check") && r.added.includes("A quick bit swap") && r.added.includes("zipped_clip"),
      `added: ${r.added.join(", ")}`);
    ok(r.errors.some((e) => /^broken\.gcode: .*one key per/.test(e)) && r.errors.some((e) => /notes\.pdf: not a/.test(e)) && r.errors.some((e) => /photo\.jpg: not a/.test(e)),
      `the bad ones say why: ${r.errors.join(" | ")}`);
    const L = await rows();
    ok(/Setting up: [^/]*My squaring check \[imported\]/.test(L) && /My clips: [^/]*A quick bit swap \[imported\]/.test(L) && /My clips: [^/]*zipped_clip \[imported\]/.test(L),
      `listed in their groups (no GROUP: My clips): ${L}`);
    ok(!/Broken/.test(L), "the broken file isn't listed");
    // the Import button's message (a real file input: the same path)
    await page.val(`(async () => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(BAD)}], "broken2.gcode"));
      const i = document.getElementById("ln-file"); i.files = dt.files; i.dispatchEvent(new Event("change")); })()`);
    ok(await until(`/Not added:/.test(document.getElementById("ln-imp-msg").textContent) && /broken2\\.gcode/.test(document.getElementById("ln-imp-msg").textContent)`, 5),
      `Import… lists the errors: ${await page.val(`document.getElementById("ln-imp-msg").textContent`)}`);
    // the imported mine clip plays on your machine with its own HOLD=
    await page.val(`[...document.querySelectorAll("#ln-list .hv-row")].find((b) => /A quick bit swap/.test(b.textContent)).click()`);
    await sleep(500);
    ok(await page.val(`LR4Help.mine.state().on && LR4ToolChange.state().two`), "the imported mine clip plays (HOLD=wrenches: two wrenches)");
    await page.val(`LR4Help.mine.stop()`);
    // Delete, confirmed
    await page.val(`askBox.auto = () => true`);
    await page.val(`[...document.querySelectorAll("#ln-list .ln-imp")].find((w) => /zipped_clip/.test(w.textContent)).querySelector(".ln-del").click()`);
    ok(await until(`!/zipped_clip/.test(document.getElementById("ln-list").textContent)`, 5), "✕ deletes it (after the confirm)");
    await page.val(`askBox.auto = null`);
    // another machine doesn't see them
    ok(await page.val(`LR4Machines.DBS.includes("lr4-sandbox-learn") && MS.db("lr4-sandbox-learn").endsWith("@" + MS.id)`), "kept per machine (its own database)");
    // an imported demo plays on the help machine; Exit comes back to Learn, the clip still there
    try { await page.val(`[...document.querySelectorAll("#ln-list .hv-row")].find((b) => /My squaring check/.test(b.textContent)).click()`); } catch (e) { /* reloading */ }
    ok(await loaded(), "reloaded as the help machine");
    ok(await until(`!document.getElementById("hv-start").hidden && document.getElementById("hv-start-h").textContent === "My squaring check"`, 60),
      `its start card: ${await page.val(`document.getElementById("hv-start-h").textContent`)}`);
    try { await page.val(`document.querySelector("#hv-start .hv-exit").click()`); } catch (e) { /* reloading */ }
    ok(await loaded(), "Exit reloads");
    ok(await until(`document.documentElement.dataset.mode === "learn" && /My squaring check/.test(document.getElementById("ln-list").textContent)`, 10),
      "back in Learn, the imported clip still listed");
    // (47b.3: export round-trips)
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    try { await page.val(`(async () => { for (const r of await SdCard.card(MS.db("lr4-sandbox-learn"), "/learn").store.all()) await SdCard.card(MS.db("lr4-sandbox-learn"), "/learn").store.remove(r.path); })()`); } catch (e) { /* gone */ }
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
