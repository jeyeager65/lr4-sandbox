// Machine sounds in headless Chrome (Parts 21-22): a real click on the Sound toggle (under ⚙) starts Web Audio; moving X
// makes its stepper voice sound at the real speed's pitch; Playback homing clicks the switches; a short trace renders
// to a WAV that isn't silent.
//   node tests/test_page_sound.js   (not in npm test: needs Chrome + Python)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 8690 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9500 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("!!window.LR4Demo && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    if (!up) return;
    await page.val(HELPERS);
    const r = await page.val(`(() => { document.getElementById("v-more").click(); const b = document.getElementById("v-sound").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    for (const type of ["mousePressed", "mouseReleased"])
      await page.send("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
    await sleep(500);
    const a = await page.val(`({ pressed: document.getElementById("v-sound").getAttribute("aria-pressed"), state: LR4Demo.soundState() })`);
    ok(a.pressed === "true" && a.state === "running", `a click on Sound starts Web Audio (${a.state})`);

    const b = await page.val(`(async () => {
      LR4Demo.sound(true);
      // the page clock frozen and stepped a frame at a time, as tools/record_demo.js does (headless frames are slow)
      let vt = performance.now(); const realNow = performance.now.bind(performance); performance.now = () => vt;
      const step = async (ms) => { vt += ms; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
      const x = document.getElementById("sx"), v0 = Math.round((Number(x.min) + Number(x.max)) / 2), lv = [];
      x.value = String(v0); x.dispatchEvent(new Event("input"));
      for (let i = 0; i < 10; i++) await step(33.3);
      for (let i = 1; i <= 20; i++) { x.value = String(v0 + i * 0.1); x.dispatchEvent(new Event("input")); await step(33.3); lv.push(LR4Demo.soundLevels().x); }
      for (let i = 0; i < 20; i++) await step(33.3);
      const quiet = LR4Demo.soundLevels().x;
      performance.now = realNow;                     // homing in real time (its clicks; the motion is checked above)
      LR4Demo.home();
      await T.until(() => !LR4Demo.homing(), 120000);
      const stats = LR4Demo.soundStats(), chunks = await LR4Demo.soundWav();
      const wav = atob(LR4Demo.soundChunk(0));
      let peak = 0;
      for (let i = 44; i + 1 < wav.length; i += 2) { let v = wav.charCodeAt(i) | (wav.charCodeAt(i + 1) << 8); if (v > 32767) v -= 65536; peak = Math.max(peak, Math.abs(v)); }
      return { moving: lv[15], quiet, stats, chunks, peak };
    })()`);
    // 0.1 in a frame at 30 fps = 76 mm/s -> x 50 steps/mm / 8 microsteps / 4 = 119 Hz
    ok(b.moving.gain > 0.5 && Math.abs(b.moving.hz - 119) < 3, `X slider moving: X voice ${b.moving.hz.toFixed(0)} Hz, gain ${b.moving.gain.toFixed(2)}`);
    ok(b.quiet.gain === 0, "stopped: silent");
    ok(b.stats.clicks >= 3, `homing: ${b.stats.clicks} switch clicks`);
    ok(b.chunks > 0 && b.peak > 1000, `the trace renders to a WAV (peak ${b.peak})`);
  } finally {
    await page.close();
    srv.kill();
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
