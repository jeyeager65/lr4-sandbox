// FluidNC in the page (web/js/fluidnc_sim.js + web/fluidnc/, built by tools/build_fluidnc_wasm.py), in headless
// Chrome, served two ways: with serve.py's COOP / COEP headers, and from plain `python -m http.server` (no headers =
// GitHub Pages), where web/coi-serviceworker.js has to make the page cross-origin isolated (one reload).
// Each: the page is isolated, FluidNC boots with the wasm demo's config.yaml, $I answers with its version, "?" gives
// a status report, G0 X10 ends Idle at MPos X 10, and the page's Controller console shows the same.
//   node tests/test_page_fluidnc.js [headers|plain]      (both by default; not in npm test: needs Chrome + Python)
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..");
const MODES = process.argv[2] ? [process.argv[2]] : ["headers", "plain"];
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));
const PY = process.env.PYTHON || (os.platform() === "win32" ? "python" : "python3");
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

async function run(mode) {
  console.log(`${mode}:`);
  const port = 8790 + Math.floor(Math.random() * 100), srv = server(mode, port);
  const page = await chromePage(9300 + Math.floor(Math.random() * 500));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    // plain: the first load registers the service worker and reloads; wait for the isolated page with the module
    let iso = false;
    for (let i = 0; i < 60 && !iso; i++) {
      await sleep(500);
      try { iso = await page.val("window.crossOriginIsolated === true && !!window.FluidNCSim && !!document.getElementById('ctl-start')"); } catch (e) { /* reloading */ }
    }
    ok(iso, "page is cross-origin isolated" + (mode === "plain" ? " (service worker)" : " (headers)"));
    if (!iso) return;
    if (mode === "plain") ok(await page.val("!!navigator.serviceWorker.controller"), "service worker controls the page");
    ok(await page.val("typeof THREE === 'object'"), "CDN scripts still load (three.js)");
    // the console: open it and start FluidNC the way a user does
    await page.val("document.getElementById('t-run').click(); document.getElementById('ctl-box').open = true; document.getElementById('ctl-start').click(); true");
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await sleep(500); up = await page.val("!!window.LR4FluidNC"); }
    ok(up, "FluidNC started from the console's Start button");
    if (!up) { console.log("  console:", await page.val("document.getElementById('ctl-log').textContent.slice(-400)")); return; }
    const r = await page.val(`(async () => {
      const sim = window.LR4FluidNC, out = {};
      out.greeting = sim.greeting;
      const i = await sim.command("$I");
      out.$I = { ok: i.ok, lines: i.lines.map((e) => e.line) };
      const s0 = await sim.status();
      out.state0 = s0.state; out.mpos0 = s0.MPos;
      // G0 through the console, as typed (form submit), waiting for its ok
      const okp = sim.waitFor((e) => e.type === "ok" || e.type === "error", 5000);
      document.getElementById("ctl-in").value = "G0 X10";
      document.getElementById("ctl-form").requestSubmit();
      out.g0 = (await okp).type === "ok";
      let s;
      for (let k = 0; k < 100; k++) { await new Promise((r) => setTimeout(r, 100)); s = await sim.status(); if (s.state === "Idle" && Math.abs(s.MPos[0] - 10) < 1e-3) break; }
      out.state1 = s.state; out.mpos1 = s.MPos;
      return out;
    })()`);
    ok(/FluidNC/.test(r.greeting), `boots: ${r.greeting}`);
    ok(r.$I.ok && r.$I.lines.some((l) => /^\[VER:/.test(l)), `$I answers: ${r.$I.lines.join(" / ")}`);
    ok(r.state0 === "Idle" && r.mpos0 && r.mpos0.every((v) => v === 0), `"?" reports ${r.state0} at MPos ${r.mpos0}`);
    ok(r.g0 && r.state1 === "Idle" && Math.abs(r.mpos1[0] - 10) < 1e-3 && Math.abs(r.mpos1[1]) < 1e-3,
      `G0 X10 ends ${r.state1} at MPos ${r.mpos1}`);
    // the page's console shows the traffic and the last status
    const log = await page.val("document.getElementById('ctl-log').textContent");
    ok(/\[VER:/.test(log) && /> G0 X10/.test(log), "console log shows the boot messages and the typed G0 line");
    ok(/MPos:10\.000/.test(await page.val("document.getElementById('ctl-state').textContent")), "console status line shows MPos X 10");
  } finally {
    await page.close();
    srv.kill();
  }
}

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, "web", "fluidnc", "program.wasm"))) { console.log("web/fluidnc/program.wasm missing - run python tools/build_fluidnc_wasm.py"); process.exit(1); }
  for (const m of MODES) await run(m);
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
