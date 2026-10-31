// Part 49 (three.js r147 -> r187): the same set of screenshots on the real GPU each step, the load's stage timings
// (cold, then a warm reload) and every console warning / error, so one step can be compared with the last.
//   node tools/three_shots.js <out dir> [--only a,b] [--no-job]     (serves the repo itself; needs Chrome + parts/)
// Writes <out dir>/<name>.png, report.json ({ times, warm, warnings, errors, shots }); compare two sets with
// python tools/img_diff.py <dir a> <dir b>. --no-job skips the homed carve + fire (~3 min of the ~5).
"use strict";
const fs = require("fs"), path = require("path");
const { CHROME, sleep, server, chromePage, HELPERS } = require("../tests/test_page_fluidnc.js");

const args = process.argv.slice(2), out = args[0];
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const noJob = args.includes("--no-job");
if (!out) { console.log("usage: node tools/three_shots.js <out dir> [--only a,b] [--no-job]"); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// every console warning / error from the first script on (three's deprecations are console.warn)
const COLLECT = `(() => { const W = window.__warns = []; for (const k of ["warn", "error"]) { const f = console[k];
  console[k] = function (...a) { W.push([k, a.map((x) => (x && x.message) || String(x)).join(" ").slice(0, 400)]); return f.apply(this, a); }; }
  addEventListener("error", (e) => W.push(["exception", String(e.message)])); })();`;

// in-page helpers: a camera from a direction at a distance (x the machine's size), damping off so it holds still
const SHOT = `window.TS = {
  still() { LR4Demo.controls.enableDamping = false; },
  look(dir, k = 1, target) { TS.still(); const T3 = LR4Demo.THREE, b = LR4Demo.machineBox(), c = target ? new T3.Vector3(...target) : b.getCenter(new T3.Vector3());
    const r = b.getSize(new T3.Vector3()).length() / 2, d = new T3.Vector3(...dir).normalize();
    LR4Demo.camera.position.copy(c).addScaledVector(d, r * 2.3 * k); LR4Demo.controls.target.copy(c); LR4Demo.camera.up.set(0, 0, 1); LR4Demo.controls.update(); },
  at(re) { const b = Object.values(LR4Demo.boxes(re))[0]; return b && b[0].map((v, i) => (v + b[1][i]) / 2); },
  click(sel) { const e = document.querySelector(sel); if (e) e.click(); return !!e; },
  async router(i) { const p = document.getElementById("rb-pick"); p.value = p.options[i].value; p.dispatchEvent(new Event("change"));
    await T.sleep(1500); if (!document.documentElement.classList.contains("rte-on")) TS.click("#rb-view"); await T.sleep(1500); TS.still(); return p.options[i].text; },
  routerOff() { if (document.getElementById("rte-back").getClientRects().length) TS.click("#rte-back"); },
}; true`;

const STOCK = "(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-12 ZMAX=0)";
const HEAD = ["(LR4 three shots)", STOCK, "(ToolDef 1: SHAPE=flat D=6.35 FLUTES=2 LEN=19 NAME=1/4in flat)", "G21 G90 G54", "T1", "M3 S18000", "G0 Z5"];
const CARVE = HEAD.concat(["G0 X20 Y20", "G1 Z-3 F600", "G1 X180 F1500", "G1 Y80", "G1 X20", "G1 Y20", "G1 Z-6", "G1 X180", "G1 Y80",
  "G1 X20", "G1 Y20", "G0 Z5", "M5", "M30", ""]).join("\n");
const DWELL = HEAD.concat(["G0 X100 Y50", "G1 Z-3 F300", "G4 P40", "G0 Z5", "M5", "M30", ""]).join("\n");

// [name, js (run in the page, awaited)]; each is shot 1.5 s after its js
const VIEWS = [
  ["overview", ""],
  ["front", "TS.look([0.05, -1, 0.25], 0.9)"],
  ["top", "TS.look([0.001, -0.001, 1], 0.9)"],
  ["workshop", "TS.look([1.2, -1.6, 0.7], 2.2)"],
  ["core", "TS.look([0.9, -1.2, 0.6], 0.35, TS.at('^Core$'))"],
  ["lite", "TS.click('#detail [data-v=lite]'); await T.sleep(3000); TS.look([1, -1.15, 0.85])"],
  ["full_again", "TS.click('#detail [data-v=full]'); await T.sleep(3000); TS.look([1, -1.15, 0.85])"],
  ["router0", "return await TS.router(0)"],
  ["router1", "return await TS.router(1)"],
  ["router2", "return await TS.router(2)"],
  ["router3", "const n = await TS.router(3); return n"],
  ["router_back", "TS.routerOff(); await T.sleep(1500); const p = document.getElementById('rb-pick'); p.value = p.options[0].value; p.dispatchEvent(new Event('change')); await T.sleep(1500); TS.look([1, -1.15, 0.85])"],
  ["insp_core", "LR4Inspect.open('core'); await T.sleep(2500); TS.still()"],
  ["insp_section", "TS.click('#insp-sec [data-v=x]'); await T.sleep(1500)"],
  ["insp_xray", "TS.click('#insp-sec [data-v=\"\"]'); TS.click('#insp-look [data-v=xray]'); await T.sleep(1500)"],
  ["insp_lines", "TS.click('#insp-look [data-v=lines]'); await T.sleep(1500)"],
  ["insp_explode", "TS.click('#insp-look [data-v=solid]'); const e = document.getElementById('insp-ex'); e.value = '0.8'; e.dispatchEvent(new Event('input')); await T.sleep(2000)"],
  ["insp_done", "const e = document.getElementById('insp-ex'); e.value = '0'; e.dispatchEvent(new Event('input')); TS.click('#insp-back'); await T.sleep(2000); TS.look([1, -1.15, 0.85])"],
];

// the homed machine carving, then a fire (As built > Heat + Fire, no auto extinguisher): Run, as test_page_heat.js
const JOB = `(async () => {
  window.askBox && (askBox.auto = () => true);
  document.getElementById("t-run").click();
  LR4AsBuilt.set({ on: true, power: false, stop: { y: 0, z: 0 }, tram: { x: 0, y: 0 }, slip: { on: false }, heat: { on: true, fire: false, auto: true } });
  LR4AsBuilt.setE({ y: 0, z: 0 });
  const prev = window.LR4FluidNC; LR4Ctl.start(); await T.booted(prev); await T.idle();
  const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
  document.getElementById("home").click(); await T.sleep(500);
  await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC/.test(document.getElementById("home-status").textContent), 180000);
  await T.idle(); return LR4Ctl.homed(); })()`;
const play = (text, name) => `(async () => {
  await LR4Job.add([new File([${JSON.stringify(text)}], "${name}")]);
  await T.until(() => LR4Job.src() && LR4Job.src().name === "/${name}" && LR4Job.tl(), 15000);
  document.getElementById("job-play").click(); await T.sleep(500);
  const go = document.getElementById("start-go"); if (go && go.getClientRects().length && !go.disabled) go.click();
  return !!(await T.until(() => LR4Job.running(), 20000)); })()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100), { gpu: true });
  const report = { url: "", times: null, warm: null, warnings: [], errors: [], shots: {} };
  const shot = async (name) => {
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64"));
  };
  const loaded = async () => {                       // the status box hidden + the part files placed (Director's waitLoaded)
    const t0 = Date.now();
    for (let i = 0; i < 360; i++) {
      await sleep(500);
      try { if (await page.val("!!window.LR4Director && !!LR4Ctl.travel() && document.getElementById('status').hidden && (document.getElementById('parts-chip').hidden || /✓/.test(document.getElementById('parts-chip').textContent))")) break; } catch (e) { /* loading */ }
    }
    await sleep(1500);
    return { wall: (Date.now() - t0) / 1000, stages: await page.val("(window.LR4LoadTimes || []).map(([k, v]) => [k, Math.round(v)])") };
  };
  try {
    await sleep(800);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECT });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    report.url = `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50`;
    await page.send("Page.navigate", { url: report.url });
    report.times = await loaded();
    console.log("cold:", JSON.stringify(report.times));
    await page.send("Page.reload", {});
    report.warm = await loaded();
    console.log("warm:", JSON.stringify(report.warm));
    report.three = await page.val("THREE.REVISION");
    await page.val(HELPERS); await page.val(SHOT);
    for (const [name, js] of VIEWS) {
      if (only && !only.includes(name)) continue;
      let v;
      try { v = await page.val(`(async () => { ${js} })()`); } catch (e) { v = "ERR " + e.message; }
      await sleep(1500);
      await shot(name);
      report.shots[name] = v === undefined ? true : v;
      console.log("shot", name, v === undefined ? "" : JSON.stringify(v));
    }
    if (!noJob && (!only || only.includes("carve") || only.includes("fire"))) {
      console.log("homing:", await page.val(JOB));
      console.log("carve started:", await page.val(play(CARVE, "carve.gcode")));
      await page.val("T.until(() => !LR4Job.running(), 240000)");
      await page.val(`TS.look([0.6, -1, 0.9], 0.3, TS.at('^Core$'))`); await sleep(2000); await shot("carve"); report.shots.carve = true;
      await page.val("LR4AsBuilt.set({ heat: { fire: true, auto: false } })");
      console.log("dwell started:", await page.val(play(DWELL, "dwell.gcode")));
      report.shots.fire = await page.val("(async () => { const ok = await T.until(() => LR4Heat.burning() > 0 && LR4Heat.particles() > 30, 60000); for (let i = 0; i < 40; i++) { LR4Heat.tick(0.05); await T.sleep(50); } return !!ok; })()");
      await page.val(`TS.look([0.6, -1, 0.9], 0.3, TS.at('^Core$'))`); await sleep(1500); await shot("fire");
      console.log("fire:", report.shots.fire);
    }
    const W = await page.val("window.__warns || []");
    report.warnings = [...new Set(W.filter(([k]) => k === "warn").map(([, m]) => m))];
    report.errors = [...new Set(W.filter(([k]) => k !== "warn").map(([, m]) => m))];
    console.log(`three r${report.three}; ${report.warnings.length} distinct warnings, ${report.errors.length} errors`);
    for (const m of report.warnings.filter((m) => /THREE/.test(m))) console.log("  [THREE]", m);
  } finally {
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
    await page.close(); srv.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
