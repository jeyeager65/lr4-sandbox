// Part 47.2 in headless Chrome: Learn's "On your machine" clips. The bit change plays on your own router (its steps
// listed, the current one lit, ⏸ holds it, a click on a step jumps there) and ends with your bit back; Stop mid-way
// puts everything back; the touch plate goes out and back (the shoe's bottom, the clip, the plate) and leaves the
// touch plate button as it was; leaving Learn mid-clip stops it.
//   node tests/test_page_learn.js   (not in npm test: needs Chrome + Python + parts/; ~1-2 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9290 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9600 + Math.floor(Math.random() * 100), { gpu: true });
  const until = async (js, secs) => { for (let i = 0; i < secs * 4; i++) { try { if (await page.val(js)) return true; } catch (e) { /* loading */ } await sleep(250); } return false; };
  const st = () => page.val("LR4Help.mine.state()");
  // what the clips mustn't change: the bit drawn, the touch plate button, the parts' spots
  const snap = () => page.val(`JSON.stringify({ bit: meshes.filter((m) => m.visible && /Bit/.test(m.userData.name || "")).map((m) => m.userData.name),
    plate: document.getElementById("ctl-plate").textContent, hand: !!HAND.plate, tp: TOUCH_PLATE,
    anim: [TOUCH_ANIM.out, TOUCH_ANIM.skirt, TOUCH_ANIM.clip, TOUCH_ANIM.plate],
    at: meshes.filter((m) => /^(TouchPlate|Dust_Skirt|Router_ColletNut|Router_Bit)/.test(m.userData.name || "")).map((m) => m.userData.name + ":" + m.visible + ":" + m.position.toArray().map((v) => v.toFixed(2)).join(",")) })`);
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/` });
    ok(await until("document.readyState === 'complete' && document.getElementById('status').hidden && !!window.LR4Help && !!HOME.pose", 100), "page loaded");
    await sleep(1500);
    const before = await snap();
    await page.val(`document.getElementById("t-learn").click()`);
    ok(await until(`!!document.querySelector('#ln-list .hv-row[data-id="bit_change"]')`, 10), "Learn lists the bit change");
    const kinds = await page.val(`[...document.querySelectorAll("#ln-list .hv-row")].map((b) => b.dataset.id + ":" + b.querySelector("i").textContent).join(" ")`);
    ok(/bit_change:On your machine/.test(kinds) && /touch_plate:On your machine/.test(kinds) && /tour:Demo/.test(kinds), `types shown: ${kinds}`);
    // the bit change, from its row
    await page.val(`document.querySelector('#ln-list .hv-row[data-id="bit_change"]').click()`);
    await sleep(400);
    let s = await st();
    ok(s.on && s.id === "bit_change" && s.steps.length >= 8 && !!s.lit, `playing: ${s.steps.length} steps, lit "${s.lit}"`);
    ok(await page.val(`!document.getElementById("ln-now").hidden && document.getElementById("ln-next").hidden`), "the box shows (no Next: the only clip in Bits and collets)");
    // ⏸ holds it
    await page.val(`document.getElementById("ln-pause").click()`);
    const k0 = (await st()).k; await sleep(1500); const k1 = (await st()).k;
    ok(k0 === k1 && await page.val(`LR4ToolChange.busy()`), `⏸ holds (step ${k0} -> ${k1})`);
    // a click on a step jumps there (held: it stays)
    const jump = await page.val(`(() => { const b = [...document.querySelectorAll("#ln-steps button")][5]; b.click(); return +b.dataset.k; })()`);
    await sleep(300);
    s = await st();
    ok(s.k === jump && s.lit === (await page.val(`[...document.querySelectorAll("#ln-steps button")][5].textContent`)), `a step's click jumps there (k ${s.k}, lit "${s.lit}")`);
    await page.val(`document.getElementById("ln-pause").click()`);
    await page.val("LR4ToolChange.speed(4)");
    ok(await until(`LR4Help.mine.state().msg.startsWith("Done")`, 60), "it plays to the end");
    await page.val("LR4ToolChange.speed(1)");
    await sleep(500);
    const after1 = await snap();
    ok(after1 === before, `the bit change changed nothing${after1 === before ? "" : ": " + after1.slice(0, 400) + " vs " + before.slice(0, 400)}`);
    // Stop mid-way: back as it was
    await page.val(`LR4Help.mine.play("bit_change")`);
    await sleep(2500);
    await page.val(`document.getElementById("ln-stop").click()`);
    await sleep(500);
    ok(!(await page.val("LR4ToolChange.busy()")) && await page.val(`document.getElementById("ln-now").hidden`), "Stop ends it, the box closes");
    ok(await snap() === before, "Stop: everything back as it was");
    // the touch plate out and back
    await page.val(`document.querySelector('#ln-list .hv-row[data-id="touch_plate"]').click()`);
    await sleep(300);
    s = await st();
    ok(s.on && s.steps.length === 6 && s.lit === "The dust shoe's bottom off", `touch plate: ${s.steps.length} steps, lit "${s.lit}"`);
    ok(await page.val(`!document.getElementById("ln-next").hidden && /Probing and zero/.test(document.getElementById("ln-next").title)`), "Next: the next clip in Probing / zero");
    ok(await until(`LR4Help.mine.state().lit === "The plate out under the bit"`, 15), "the plate goes out (its step lit)");
    ok(await until(`LR4Help.mine.state().msg.startsWith("Done")`, 30), "and comes back to the end");
    await sleep(500);
    const after2 = await snap();
    ok(after2 === before, `the touch plate changed nothing${after2 === before ? "" : ": " + after2.slice(0, 400)}`);
    // a jump back mid-way, then leaving Learn stops it
    await page.val(`LR4Help.mine.play("touch_plate")`);
    ok(await until(`LR4Help.mine.state().k >= 3`, 15), "on its way back");
    await page.val(`[...document.querySelectorAll("#ln-steps button")][1].click()`);
    await sleep(200);
    ok((await st()).k === 1 || (await st()).k === 2, `a jump back to the clip step (k ${(await st()).k})`);
    await page.val(`document.getElementById("t-design").click()`);
    await sleep(800);
    ok(!(await st()).on && await snap() === before, "leaving Learn stops it, all back");
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();
