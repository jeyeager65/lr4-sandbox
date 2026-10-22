// FluidNC in the page, in headless Chrome, served two ways: with serve.py's COOP / COEP headers, and from plain
// `python -m http.server` (no headers = GitHub Pages), where web/coi-serviceworker.js has to make the page
// cross-origin isolated (one reload). Each way:
//  - the module on its own (js/fluidnc_sim.js + the wasm demo's config): boots, $I, "?", G0 X10 ends at MPos X 10,
//    stop() removes its iframe;
//  - the page (Run > Controller > FluidNC): boots V1E's JP3_LR through js/sim_config.js, max_travel_mm = the size's
//    travel less pulloff, G0 moves the model by MPos from where it started (greyed: not homed),
//    the jog pad jogs it, the console shows the traffic; Home ($H on the virtual switches, at 10x) ends at MPos = mpos_mm on Part 13's homed
//    spot (trip + pulloff) with both Y motors level; G38.2 stops with the tip on the touch plate; an unplugged switch
//    makes $HX alarm; a move takes 1/5 and 1/10 of its time at 5x / 10x; a new config.yaml and a new size each
//    restart it (new pulloff / travel); back to Playback: FluidNC gone, the sliders move the model directly again.
//   node tests/test_page_fluidnc.js [headers|plain]      (both by default; not in npm test: needs Chrome + Python
//   and build/fixtures/JP3_LR.yaml - node tests/test_sim_config.js fetches it)
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..");
const MODES = process.argv[2] ? [process.argv[2]] : ["headers", "plain"];
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));
const PY = process.env.PYTHON || (os.platform() === "win32" ? "python" : "python3");
const FIX = path.join(ROOT, "build", "fixtures", "JP3_LR.yaml");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

function server(mode, port) {
  const code = mode === "headers"
    ? `import sys, functools, http.server; sys.path.insert(0, r"${path.join(ROOT, "tools")}"); import serve; ` +
      `http.server.ThreadingHTTPServer(("127.0.0.1", ${port}), functools.partial(serve.Isolated, directory=r"${ROOT}")).serve_forever()`
    : null;
  const args = code ? ["-c", code] : ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", ROOT];
  return spawn(PY, args, { stdio: "ignore" });
}

async function chromePage(cport) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "fluidnc_test_"));
  const chrome = spawn(CHROME, ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${cport}`, `--user-data-dir=${prof}`, "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${cport}/json`)).json()).find((t) => t.type === "page"); } catch (e) { /* not up */ }
  }
  if (!target) throw new Error("Chrome didn't start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method === "Runtime.exceptionThrown") console.log("  [exception]", m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      console.log("  [console.error]", m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const val = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  const close = async () => { ws.close(); chrome.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* held */ } };
  return { send, val, close };
}

// in-page helpers, defined once per page load
const HELPERS = `
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async until(fn, ms = 20000) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await T.sleep(100); } },
    async idle() { await T.sleep(300); return T.until(() => LR4Ctl.state() === "Idle" && LR4Ctl.mpos(), 20000); },
    async setting(sim, k) { const r = await sim.command("$" + k); const l = r.lines.find((e) => e.line.includes("=")); return l ? Number(l.line.split("=")[1]) : NaN; },
    async booted(prev) { return T.until(() => window.LR4FluidNC && window.LR4FluidNC !== prev && LR4Ctl.state() ? window.LR4FluidNC : null, 30000); },
    travelX: () => { const t = LR4Ctl.travel(); return t.x[1] - t.x[0]; },
  };
  true`;

async function run(mode) {
  console.log(`${mode}:`);
  const port = 8790 + Math.floor(Math.random() * 100), srv = server(mode, port);
  const page = await chromePage(9300 + Math.floor(Math.random() * 500));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    // plain: the first load registers the service worker and reloads; then wait for the model (the status box hides)
    let iso = false;
    for (let i = 0; i < 120 && !iso; i++) {
      await sleep(500);
      try { iso = await page.val("window.crossOriginIsolated === true && !!window.LR4Ctl && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* reloading */ }
    }
    ok(iso, "page is cross-origin isolated" + (mode === "plain" ? " (service worker)" : " (headers)") + " and loaded");
    if (!iso) return;
    if (mode === "plain") ok(await page.val("!!navigator.serviceWorker.controller"), "service worker controls the page");
    ok(await page.val("typeof THREE === 'object'"), "CDN scripts still load (three.js)");
    await page.val(HELPERS);

    // the module on its own, with the wasm demo's config
    const raw = await page.val(`(async () => {
      const sim = await FluidNCSim.start({ config: await (await fetch("fluidnc/demo_config.yaml")).text() }), out = {};
      out.greeting = sim.greeting;
      out.i = (await sim.command("$I")).lines.map((e) => e.line);
      out.s0 = (await sim.status()).MPos;
      out.g0 = (await sim.command("G0 X10")).ok;
      let s;
      for (let k = 0; k < 100; k++) { await T.sleep(100); s = await sim.status(); if (s.state === "Idle" && Math.abs(s.MPos[0] - 10) < 1e-3) break; }
      out.s1 = [s.state, s.MPos];
      out.frames = document.querySelectorAll("iframe").length;
      sim.stop();
      out.after = document.querySelectorAll("iframe").length;
      return out;
    })()`);
    ok(/FluidNC/.test(raw.greeting) && raw.i.some((l) => /^\[VER:/.test(l)), `module boots, $I: ${raw.i[0]}`);
    ok(raw.s0.every((v) => v === 0) && raw.g0 && raw.s1[0] === "Idle" && Math.abs(raw.s1[1][0] - 10) < 1e-3, `"?" at 0, G0 X10 ends ${raw.s1[0]} at ${raw.s1[1]}`);
    ok(raw.frames === 1 && raw.after === 0, "one iframe while running, none after stop()");

    // the page: FluidNC mode with V1E's JP3_LR
    const p1 = await page.val(`(async () => {
      document.getElementById("t-run").click();
      document.querySelector('#ctl-mode [data-v="fluidnc"]').click();
      const sim = await T.booted(null), out = {};
      if (!sim) return { msg: document.getElementById("ctl-msg").textContent, log: document.getElementById("ctl-log").textContent.slice(-300) };
      out.greeting = sim.greeting;
      out.ui = { play: document.getElementById("job-play").textContent, home: document.getElementById("home").disabled,
        sliders: document.getElementById("pos-play").hidden, jog: document.getElementById("pos-jog").hidden,
        status: document.getElementById("home-status").textContent, grey: document.getElementById("mx").style.opacity };
      const i = await sim.command("$I");
      out.machine = i.lines.map((e) => e.line).find((l) => /Machine:/.test(l));
      out.mt = await T.setting(sim, "/axes/x/max_travel_mm");
      out.mty = await T.setting(sim, "/axes/y/max_travel_mm");
      out.span = [T.travelX(), LR4Ctl.travel().y[1] - LR4Ctl.travel().y[0]];
      await T.idle(); LR4Ctl.sync();
      out.boot = LR4Ctl.boot(); out.mpos0 = LR4Ctl.mpos(); out.pose0 = LR4Ctl.pose();
      await sim.command("G0 X100 Y200");
      await T.until(() => LR4Ctl.mpos() && Math.abs(LR4Ctl.mpos()[1] - 200) < 0.01 && LR4Ctl.state() === "Idle");
      LR4Ctl.sync();
      out.mpos1 = LR4Ctl.mpos(); out.pose1 = LR4Ctl.pose();
      out.dro = ["mx", "my"].map((id) => document.getElementById(id).textContent);
      // the jog pad: 10 mm steps, X+ twice, Z- once
      document.getElementById("jog-step").value = "10";
      document.querySelector('#pos-jog [data-jog="X+"]').click();
      document.querySelector('#pos-jog [data-jog="X+"]').click();
      document.querySelector('#pos-jog [data-jog="Z-"]').click();
      await T.sleep(500);
      await T.until(() => LR4Ctl.state() === "Idle" && Math.abs(LR4Ctl.mpos()[0] - 120) < 0.01 && Math.abs(LR4Ctl.mpos()[2] + 10) < 0.01, 20000);
      LR4Ctl.sync();
      out.mpos2 = LR4Ctl.mpos(); out.pose2 = LR4Ctl.pose();
      // the console: $I from its button
      document.querySelector('#ctl-box [data-ctl="$I"]').click();
      await T.sleep(500);
      out.log = document.getElementById("ctl-log").textContent;
      out.state = document.getElementById("ctl-state").textContent;
      return out;
    })()`);
    if (!p1.greeting) { ok(false, "FluidNC mode boots: " + JSON.stringify(p1)); return; }
    ok(/\$SD\/Run/.test(p1.ui.play) && !p1.ui.home && p1.ui.sliders && !p1.ui.jog, `FluidNC mode: Play = ${p1.ui.play}, Home on, sliders hidden, jog pad shown`);
    ok(/^Not homed/.test(p1.ui.status) && p1.ui.grey === "0.55", `not homed: MPos greyed, "${p1.ui.status.slice(0, 60)}…"`);
    ok(p1.machine === "[MSG:Machine: LowRider]", `boots V1E's JP3_LR (${p1.machine})`);
    ok(Math.abs(p1.mt - (p1.span[0] - 4)) < 0.06 && Math.abs(p1.mty - (p1.span[1] - 4)) < 0.06,
      `max_travel_mm ${p1.mt} / ${p1.mty} = travel ${p1.span.map((v) => v.toFixed(1))} less pulloff 4`);
    ok(p1.mpos0.every((v) => v === 0) && p1.boot.every((v, k) => Math.abs(v - p1.pose0[k]) < 0.01), "MPos 0 = where it started");
    const d1 = p1.pose1.map((v, k) => v - p1.boot[k]);
    ok(Math.abs(d1[0] - 100) < 0.01 && Math.abs(d1[1] - 200) < 0.01 && Math.abs(d1[2]) < 0.01, `G0 X100 Y200 moves the model by ${d1.map((v) => v.toFixed(2))}`);
    ok(p1.dro[0] === "100.000" && p1.dro[1] === "200.000", `MPos DRO ${p1.dro}`);
    const d2 = p1.pose2.map((v, k) => v - p1.boot[k]);
    ok(Math.abs(d2[0] - 120) < 0.01 && Math.abs(d2[1] - 200) < 0.01 && Math.abs(d2[2] + 10) < 0.01,
      `jog pad X+ X+ Z- (10 mm): MPos ${p1.mpos2}, the model by ${d2.map((v) => v.toFixed(2))}`);
    ok(/> \$I/.test(p1.log) && /\[VER:/.test(p1.log) && !/\$J=/.test(p1.log), "console shows the typed $I and its reply (jogs stay out of it)");
    ok(p1.state.startsWith("<Idle|MPos:120.000,200.000,-10.000"), `console status line: ${p1.state}`);

    // Part 16: home on the virtual switches, probe the touch plate, an unplugged switch, the time scale
    const h = await page.val(`(async () => {
      const sim = window.LR4FluidNC, out = {}, sp = document.getElementById("ctl-speed");
      const speed = (k) => { sp.value = String(k); sp.dispatchEvent(new Event("change")); };
      speed(10);
      const t0 = performance.now();
      document.getElementById("home").click();
      await T.until(() => /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 120000);
      out.secs = (performance.now() - t0) / 1000;
      out.status = document.getElementById("home-status").textContent;
      await T.idle(); await T.sleep(600); await T.idle(); LR4Ctl.sync();
      out.mpos = LR4Ctl.mpos(); out.pose = LR4Ctl.pose(); out.t = LR4Ctl.travel(); out.grey = document.getElementById("mx").style.opacity;
      out.steps = Object.fromEntries(LR4Ctl.cfg().pins.motors.map((m) => [m.axis + m.motor, sim.motorSteps(m.step)]));
      // the touch plate on the stock under the bit: G38.2 down stops with the bit's end on it
      document.getElementById("ctl-plate").click();
      const pr = await sim.command("G38.2 Z-200 F300", 120000);
      out.probe = { ok: pr.ok, code: pr.code, lines: pr.lines.map((e) => e.line) };
      await T.idle(); await T.sleep(300); LR4Ctl.sync();
      out.endZ = LR4Ctl.pose()[2] + LR4Ctl.tip();     // where it came to rest (FluidNC's motion cancel decelerates)
      const prb = out.probe.lines.find((l) => l.startsWith("[PRB:"));      // where it tripped, in MPos; homed: MPos 3 = pose tz[1] - 4
      out.tripZ = prb ? LR4Ctl.travel().z[1] - 4 + (Number(prb.slice(5).split(",")[2].split(":")[0]) - 3) + LR4Ctl.tip() : NaN;
      out.plateTop = LR4Ctl.TOUCH_PLATE.stock + LR4Ctl.TOUCH_PLATE.plate;
      document.getElementById("ctl-plate").click();
      await sim.command("G53 G0 Z-10");
      await T.idle();
      // the time scale: G1 X at F600
      const xm = LR4Ctl.cfg().pins.motors.find((m) => m.axis === "x");
      out.timing = [];
      for (const [k, d] of [[1, 20], [5, 50], [10, 100]]) {
        speed(k);
        const s0 = sim.motorSteps(xm.step), goal = s0 + d * LR4Ctl.cfg().steps.x.to, a = performance.now();
        await sim.command("G91 G1 X" + d + " F600");
        await T.until(() => sim.motorSteps(xm.step) >= goal, 60000);
        out.timing.push([k, d, (performance.now() - a) / 1000, d / 10]);
        await sim.command("G90");
      }
      speed(10);
      // unplug the X switch: $HX runs past it and alarms, as on the real machine
      const xg = Object.values(xm.limits)[0];
      sim.clearSwitch(xg);
      const al = sim.waitFor((e) => e.type === "alarm", 120000).catch(() => null);
      await sim.command("$HX", 120000).catch(() => null);
      const alarm = await al;
      out.unplug = { alarm: alarm && alarm.line, homed: LR4Ctl.homed() };
      await sim.command("$X");
      return out;
    })()`);
    const tv = h.t;
    ok(/^Homed by FluidNC/.test(h.status) && h.grey === "", `Home ($H) at 10x: "${h.status}" in ${h.secs.toFixed(1)} s, MPos no longer greyed`);
    ok(h.mpos.every((v) => Math.abs(v - 3) < 1e-6), `homed: MPos = mpos_mm (${h.mpos})`);
    const spot = [tv.x[0] + 4, tv.y[0] + 4, tv.z[1] - 4];
    ok(h.pose.every((v, k) => Math.abs(v - spot[k]) < 0.15), `homed at Part 13's spot (trip + pulloff): ${h.pose.map((v) => v.toFixed(2))} vs ${spot.map((v) => v.toFixed(2))}`);
    // level within a few steps: where each motor stops past its switch varies a step or three from run to run in the
    // browser build (0.004 mm at 800 steps/mm), on the committed page too
    ok(Math.abs(h.steps.y0 - h.steps.y1) <= 5 && Math.abs(h.steps.z0 - h.steps.z1) <= 5, `each Y / Z motor on its own switch, level: ${JSON.stringify(h.steps)}`);
    ok(h.probe.ok && h.probe.lines.some((l) => /^\[PRB:.*:1\]$/.test(l)), `G38.2 stops on the plate: ${h.probe.lines.join(" ")}`);
    ok(Math.abs(h.tripZ - h.plateTop) < 0.15, `G38.2 trips with the bit's end on the plate: ${h.tripZ.toFixed(2)} mm above the table ` +
      `(plate top ${h.plateTop}); comes to rest ${(h.tripZ - h.endZ).toFixed(2)} mm further down`);
    for (const [k, d, secs, want] of h.timing) {
      // fast is the bug (the time scale ignored): 30%. Slow is headless software rendering competing for the CPU (short
      // 10x moves ran up to ~25% long, a 1x move once 61%): 75%
      const real = want / k, tol = Math.max(0.3 * real, 0.12);
      ok(secs > real - tol && secs < real + Math.max(0.75 * real, 0.12),`${k}x: G1 X${d} F600 (${want} s machine time) took ${secs.toFixed(2)} s (want ${real.toFixed(2)})`);
    }
    ok(h.unplug.alarm && /^ALARM:(8|9)$/.test(h.unplug.alarm) && !h.unplug.homed, `X switch unplugged: $HX -> ${h.unplug.alarm}, not homed`);

    // a new config.yaml (pulloff 2, another name) restarts it
    if (!fs.existsSync(FIX)) { ok(false, "build/fixtures/JP3_LR.yaml missing - run node tests/test_sim_config.js"); return; }
    const mine = fs.readFileSync(FIX, "utf8").replace("name: LowRider", "name: Test LR").replace(/pulloff_mm: 4\.000/g, "pulloff_mm: 2.000");
    const p2 = await page.val(`(async () => {
      const prev = window.LR4FluidNC, inp = document.getElementById("f-yaml"), dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(mine)}], "mine.yaml"));
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change"));
      const sim = await T.booted(prev), out = {};
      if (!sim) return {};
      out.machine = (await sim.command("$I")).lines.map((e) => e.line).find((l) => /Machine:/.test(l));
      out.mt = await T.setting(sim, "/axes/x/max_travel_mm");
      out.span = T.travelX();
      out.frames = document.querySelectorAll("iframe").length;
      // a new size restarts it too
      const cx = document.getElementById("cut-x");
      cx.value = "30"; cx.dispatchEvent(new Event("input"));
      const sim2 = await T.booted(sim);
      if (!sim2) return out;
      out.mt2 = await T.setting(sim2, "/axes/x/max_travel_mm");
      out.span2 = T.travelX();
      out.frames2 = document.querySelectorAll("iframe").length;
      return out;
    })()`);
    ok(p2.machine === "[MSG:Machine: Test LR]" && Math.abs(p2.mt - (p2.span - 2)) < 0.06, `new config.yaml restarts it: ${p2.machine}, max_travel ${p2.mt} = ${p2.span && p2.span.toFixed(1)} - 2`);
    ok(p2.span2 > p2.span + 90 && Math.abs(p2.mt2 - (p2.span2 - 2)) < 0.06, `new size (30 in) restarts it: max_travel ${p2.mt2} = ${p2.span2 && p2.span2.toFixed(1)} - 2`);
    ok(p2.frames === 1 && p2.frames2 === 1, "one FluidNC iframe at a time");

    // back to Playback: FluidNC gone, the sliders move the model directly
    const p3 = await page.val(`(async () => {
      document.querySelector('#ctl-mode [data-v="play"]').click();
      await T.sleep(300);
      const out = { sim: window.LR4FluidNC, frames: document.querySelectorAll("iframe").length, box: document.getElementById("ctl-box").hidden,
        home: document.getElementById("home").disabled, sliders: !document.getElementById("pos-play").hidden && document.getElementById("pos-jog").hidden };
      const sy = document.getElementById("sy");
      sy.value = "10"; sy.dispatchEvent(new Event("input"));
      out.y = LR4Ctl.pose()[1]; out.want = 10 * 25.4 + LR4Ctl.travel().y[0];
      return out;
    })()`);
    ok(p3.sim === null && p3.frames === 0 && p3.box && !p3.home && p3.sliders, "Playback: FluidNC stopped, console hidden, sliders back");
    ok(Math.abs(p3.y - p3.want) < 0.01, `Playback: the Y slider moves the model at once (${p3.y.toFixed(1)})`);
  } finally {
    await page.close();
    srv.kill();
  }
}

module.exports = { ROOT, CHROME, FIX, sleep, server, chromePage, HELPERS };
if (require.main === module) (async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, "web", "fluidnc", "program.wasm"))) { console.log("web/fluidnc/program.wasm missing - run python tools/build_fluidnc_wasm.py"); process.exit(1); }
  for (const m of MODES) await run(m);
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
