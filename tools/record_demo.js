// Record a demo video of the configurator: a turn round the workshop, a turn round the LR4, then a G-code file
// running on it (the view framed on its stock; probe close-ups as the page does them; each M0 popup shown, then
// resumed after --pause seconds), and at the end the gantry driven to the back to show the result. QHD by default. The page's clock (performance.now) is taken over and stepped one
// frame at a time, so the video runs at true speed however long each frame takes to render. Frames are JPEGs piped
// into ffmpeg (H.264 MP4).
//   python tools/serve.py configurator        (serves the repo on 127.0.0.1:8767; the page loads parts/)
//   node tools/record_demo.js <file.nc> [out.mp4] [--size 2560x1440] [--fps 30] [--job 75] [--pause 2] [--orbit 10]
//        [--url http://127.0.0.1:8767/web/index.html?parts=/parts/] [--swiftshader]
// --job: seconds of video for the job's moves (sets the playback speed; pauses and probes come on top).
// Needs Chrome (CHROME env or the usual path), ffmpeg on PATH, Node 22+. Uses the page's window.LR4Demo handle.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");

const args = process.argv.slice(2), opt = { size: [2560, 1440], fps: 30, job: 75, pause: 2, orbit: 10,
  url: "http://127.0.0.1:8767/web/index.html?parts=/parts/", gpu: true };
const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--size") opt.size = args[++i].split("x").map(Number);
  else if (["--fps", "--job", "--pause", "--orbit"].includes(a)) opt[a.slice(2)] = Number(args[++i]);
  else if (a === "--url") opt.url = args[++i];
  else if (a === "--swiftshader") opt.gpu = false;
  else pos.push(a);
}
if (!pos[0]) { console.log("usage: node tools/record_demo.js <file.nc> [out.mp4] [options] (see the top of this file)"); process.exit(1); }
const gcodePath = path.resolve(pos[0]);
const out = path.resolve(pos[1] || path.join(__dirname, "..", "exports", "video", path.basename(gcodePath).replace(/\.\w+$/, "") + "_demo.mp4"));
fs.mkdirSync(path.dirname(out), { recursive: true });
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// runs in the page: the frozen clock and one-frame steps
const PAGE_REC = `(() => {
  let vt = performance.now();
  performance.now = () => vt;
  const D = window.LR4Demo;
  window.__rec = {
    async frame(cam, ms) {
      if (cam) { D.camera.position.set(...cam[0]); D.controls.target.set(...cam[1]); }
      vt += ms;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // a tick with the step, then a draw
      return D.job();
    },
  };
  return true;
})()`;

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "record_demo_"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const flags = opt.gpu ? ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const chrome = spawn(CHROME, ["--headless=new", ...flags, "--hide-scrollbars", `--remote-debugging-port=${port}`,
    `--user-data-dir=${prof}`, `--window-size=${opt.size[0]},${opt.size[1]}`, "about:blank"], { stdio: "ignore" });
  let ws, id = 0, ffmpeg = null;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const val = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const loaded = async () => {                       // the status box hidden twice, 1 s apart
    const t0 = Date.now();
    for (;;) {
      await sleep(1000);
      if (await val("!!document.getElementById('status') && document.getElementById('status').hidden")) {
        await sleep(1500);
        // and the part files (?parts=) placed: the files panel says "All N files loaded" (or there is none)
        if (await val(`document.getElementById('status').hidden && (document.getElementById('files-sec').hidden ||
            /All \\d+ files loaded/.test(document.getElementById('files-sec').textContent))`)) return;
      }
      if (Date.now() - t0 > 180000) throw new Error("page didn't load: " + await val("document.getElementById('status').innerText"));
    }
  };
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
      else if (m.method === "Runtime.exceptionThrown") console.log("[page exception]", m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: opt.size[0], height: opt.size[1], deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: opt.url });
    await loaded();
    const gpu = await val(`(() => { const gl = document.createElement("canvas").getContext("webgl"), e = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()`);
    console.log("renderer:", gpu, /SwiftShader/i.test(gpu) ? "(software: slow)" : "");
    // full detail, the workshop on, the 3D view filling the page
    if (await val(`(() => { const b = document.querySelector('#detail button[data-v="full"]');
        if (b && b.getAttribute("aria-pressed") !== "true") { b.click(); return true; } return false; })()`)) await loaded();
    await val(`(() => { const b = document.querySelector('#scenery button[data-v="shop"]'); if (b) b.click(); return true; })()`);
    await sleep(1500);
    await val("LR4Demo.recording(true)");
    await sleep(500);
    const job = await val(`LR4Demo.playFile(${JSON.stringify(path.basename(gcodePath))}, ${JSON.stringify(fs.readFileSync(gcodePath, "utf8"))})`);
    const speed = Math.max(1, Math.round(job.total / opt.job));
    await val(`LR4Demo.speed(${speed})`);
    console.log(`job: ${(job.total / 60).toFixed(1)} min of moves, ${job.pauses} M0 pauses -> ${speed}x`);
    const g = await val(`(() => { const D = LR4Demo, b = D.machineBox(), c = b.getCenter(new D.THREE.Vector3()), s = b.getSize(new D.THREE.Vector3());
      return { c: c.toArray(), s: s.toArray(), floor: D.floorZ(), fov: D.camera.fov, aspect: D.camera.aspect,
        cam: D.camera.position.toArray(), tgt: D.controls.target.toArray() }; })()`);
    await val(PAGE_REC);

    ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(opt.fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const dt = 1000 / opt.fps;
    let frames = 0, t0 = Date.now();
    const frame = async (cam) => {
      const st = await val(`window.__rec.frame(${JSON.stringify(cam || null)}, ${dt})`);
      const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
      if (!ffmpeg.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (++frames % (opt.fps * 5) === 0) {
        const per = (Date.now() - t0) / frames;
        console.log(`${(frames / opt.fps).toFixed(0)} s of video, ${per.toFixed(0)} ms a frame${st.total ? `, job ${(100 * st.t / st.total).toFixed(0)} %` : ""}`);
      }
      return st;
    };
    const n = (sec) => Math.max(1, Math.round(sec * opt.fps));

    // shots: [camera position, target] per frame
    const c = g.c, span = Math.max(g.s[0], g.s[1]);
    const orbit = (r, z, k, tz) => {                 // k: 0..1 of a turn, starting in front (-Y), counter-clockwise
      const a = k * 2 * Math.PI;
      return [[c[0] + r * Math.sin(a), c[1] - r * Math.cos(a), z], [c[0], c[1], tz]];
    };
    const shop = (k) => orbit(span * 1.55, g.floor + 1700, k, c[2]);                 // eye height, round the room
    const lr4 = (k) => orbit(span * 0.95, c[2] + span * 0.5, k, c[2]);                // closer, from above the table
    const st = job.stock, at = job.at;                                                 // the stock in the room
    const sc = st ? [at[0] + (st.xmin + st.xmax) / 2, at[1] + (st.ymin + st.ymax) / 2, at[2] + st.zmax] : [at[0], at[1], at[2]];
    const half = st ? Math.hypot(st.xmax - st.xmin, st.ymax - st.ymin) / 2 : 150;
    const dir = [0.42, -0.78, 0.72], dl = Math.hypot(...dir);                        // front-right, from above
    const dist = half * 1.35 / Math.tan(g.fov * Math.PI / 360);
    const jobView = [sc.map((v, i) => v + dir[i] / dl * dist), sc];
    const blend = (A, B, k) => [lerp(A[0], B[0], ease(k)), lerp(A[1], B[1], ease(k))];

    console.log("workshop turn"); for (let i = 0, m = n(1); i < m; i++) await frame(blend([g.cam, g.tgt], shop(0), i / m));
    for (let i = 0, m = n(opt.orbit); i <= m; i++) await frame(shop(i / m));
    console.log("LR4 turn"); for (let i = 0, m = n(2); i <= m; i++) await frame(blend(shop(1), lr4(0), i / m));
    for (let i = 0, m = n(opt.orbit); i <= m; i++) await frame(lr4(i / m));
    console.log("to the stock"); for (let i = 0, m = n(2.5); i <= m; i++) await frame(blend(lr4(1), jobView, i / m));
    for (let i = 0; i < n(0.5); i++) await frame(jobView);
    console.log("job");
    await val("LR4Demo.play()");
    let held = 0, endHold = 0, s;
    for (;;) {
      s = await frame(null);                         // the page's camera now (its probe close-ups)
      if (s.paused) { if (++held >= n(opt.pause)) { await val("LR4Demo.resume()"); held = 0; } }
      else held = 0;
      if (s.t >= s.total && !s.paused && ++endHold > n(1)) break;
    }
    // done: drive the gantry to the back and Z to the top to show the result, then hold on it
    console.log("park");
    const park = await val("LR4Demo.park()");
    for (let i = 0, m = n(4); i <= m; i++) {
      await val(`LR4Demo.pose(...${JSON.stringify(lerp(park.from, park.to, ease(i / m)))})`);
      await frame(null);
    }
    for (let i = 0; i < n(3); i++) await frame(null);
    ffmpeg.stdin.end();
    await new Promise((r) => ffmpeg.on("close", r));
    console.log(`${out}: ${frames} frames, ${(frames / opt.fps).toFixed(1)} s, rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    if (ffmpeg) ffmpeg.stdin.end();
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* Chrome still holds it */ }
  }
})();
