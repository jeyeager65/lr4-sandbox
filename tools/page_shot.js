// Screenshot a page in headless Chrome over CDP (the configurator stalls under --virtual-time-budget, so no
// --screenshot): waits for #status to hide (and for files loaded by ?parts= to settle), runs optional JS, saves PNGs.
//   node tools/page_shot.js <url> <out.png> [--size 1500x1000] [--eval "js" --shot out2.png]... [--mobile]
// Each --eval runs (awaited) after the load; a --shot after it takes another picture. Logs console errors.
// Needs Chrome (CHROME env or the usual Windows / Mac / Linux path); Node 22+ (fetch + WebSocket built in).
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");

const args = process.argv.slice(2);
const url = args[0], steps = [{ shot: args[1] }];
let size = [1500, 1000], mobile = false;
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--size") size = args[++i].split("x").map(Number);
  else if (args[i] === "--mobile") mobile = true;
  else if (args[i] === "--eval") steps.push({ js: args[++i] });
  else if (args[i] === "--shot") steps.push({ shot: args[++i] });
}
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "page_shot_"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${size[0]},${size[1]}`, "about:blank"],
  { stdio: "ignore" });
  let ws, id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch (e) { /* not up */ }
    }
    if (!target) throw new Error("Chrome didn't start");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method === "Runtime.consoleAPICalled" && /error|warning/.test(m.params.type))
        console.log(`[console.${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(" "));
      else if (m.method === "Runtime.exceptionThrown") console.log("[exception]", m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    await send("Runtime.enable");
    await send("Page.enable");
    if (mobile) await send("Emulation.setDeviceMetricsOverride", { width: size[0], height: size[1], deviceScaleFactor: 2, mobile: true });
    if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    const val = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
    const t0 = Date.now();
    for (;;) {                                         // loaded = the status box hidden twice, 1 s apart
      await sleep(1000);
      if (await val("!!document.getElementById('status') && document.getElementById('status').hidden")) {
        await sleep(1500);
        if (await val("document.getElementById('status').hidden")) break;
      }
      if (Date.now() - t0 > 180000) { console.log("timeout; status:", await val("document.getElementById('status').innerText")); break; }
    }
    console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const s of steps) {
      if (s.js) { const v = await val(`(async () => { ${s.js} })()`); if (v !== undefined) console.log("eval:", JSON.stringify(v)); await sleep(1500); }
      if (s.shot) {
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(s.shot, Buffer.from(data, "base64"));
        console.log("saved", s.shot);
      }
    }
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* Chrome still holds it */ }
  }
})().catch((e) => { console.error(e); process.exit(1); });
