// Homing stress test (not in npm test; ~15-25 min): FluidNC in the page homes ($H) again and again from a random spot,
// at 1x and 10x, then at 10x with the CPU kept busy (busy-loop child processes, as a loaded PC / several test pages).
// Each $H: ALARM or ok, how far the two Y and the two Z motors stop apart (steps: squaring), and how long it took.
// For the homing flake (user 2026-10-25): ALARM 9 "Homing Fail Approach" / "out by the stops" under load at 10x.
//   node tests/stress_homing.js [runs at 10x, default 15]
"use strict";
const os = require("os"), { fork } = require("child_process");
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

if (process.argv[2] === "--burn") { for (;;) { /* a busy CPU */ } }
const N10 = Number(process.argv[2]) || 15;

const HOME_ONCE = (k) => `(async () => {
  const sim = window.LR4FluidNC, t = LR4Ctl.travel(), cfg = LR4Ctl.cfg();
  const sp = document.getElementById("ctl-speed"); if (sp.value !== "${k}") { sp.value = "${k}"; sp.dispatchEvent(new Event("change")); }
  if (/Alarm/.test(LR4Ctl.state())) { await sim.command("$X"); await T.idle(); }
  // a random spot away from the switches (relative: this works homed or not)
  const r = (a, b) => (a + Math.random() * (b - a)).toFixed(1);
  await sim.command("G91 G21 G0 X" + r(20, 150) + " Y" + r(20, 200) + " Z-" + r(2, 20));   // the switches: X- / Y- ends, Z top
  await sim.command("G90");
  await T.idle();
  const alarms = [];
  const al = sim.waitFor((e) => e.type === "alarm", 240000).then((e) => alarms.push(e.line)).catch(() => {});
  const t0 = performance.now();
  const res = await sim.command("$H", 240000).catch((e) => ({ ok: false, code: String(e) }));
  await T.sleep(300);
  const st = Object.fromEntries(cfg.pins.motors.map((m) => [m.axis + m.motor, sim.motorSteps(m.step)]));
  const out = { ok: !!res.ok && !alarms.length, code: res.code, alarm: alarms[0] || null, secs: (performance.now() - t0) / 1000,
    dy: (st.y0 ?? 0) - (st.y1 ?? 0), dz: (st.z0 ?? 0) - (st.z1 ?? 0), state: LR4Ctl.state() };
  if (!out.ok) { await sim.command("$X").catch(() => {}); await T.idle(); }
  return out;
})()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9390 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9450 + Math.floor(Math.random() * 40));
  const burners = [];
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 160 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4FluidNC && LR4Ctl.state() === 'Idle' && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    if (!up) { console.log("page didn't come up"); return; }
    await page.val(HELPERS);
    const steps = await page.val("LR4Ctl.cfg().steps.y.to");
    const runs = [["1x", 1, 4, 0], ["10x", 10, N10, 0], ["10x + busy CPU", 10, N10, Math.max(2, os.cpus().length - 1)]];
    for (const [label, k, n, load] of runs) {
      while (burners.length < load) burners.push(fork(__filename, ["--burn"], { stdio: "ignore" }));
      const rows = [];
      for (let i = 0; i < n; i++) {
        const r = await page.val(HOME_ONCE(k));
        rows.push(r);
        console.log(`  ${label} #${i + 1}: ${r.ok ? "ok   " : "FAIL "}${r.alarm || (r.ok ? "" : "error:" + r.code)}  Y apart ${r.dy} steps, Z ${r.dz}  ${r.secs.toFixed(1)} s`);
      }
      const bad = rows.filter((r) => !r.ok).length, worst = Math.max(...rows.filter((r) => r.ok).map((r) => Math.max(Math.abs(r.dy), Math.abs(r.dz))), 0);
      console.log(`${label}: ${bad} of ${n} failed; worst squaring ${worst} steps (${(worst / steps).toFixed(3)} mm)`);
      while (burners.length) burners.pop().kill();
    }
  } finally {
    for (const b of burners) b.kill();
    await page.close();
    srv.kill();
    process.exit(0);
  }
})();
