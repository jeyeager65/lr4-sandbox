// Record a demo video of the sandbox page running a G-code file. The file can script the video in its comments - settings,
// shots, captions, titles, homing, work zero, the pace - see web/js/demo_script.js (e.g. (Video Text: TIME=4 TEXT=Front
// holes)); MSG / PRINT lines show on top as playback reaches them. Without a script: a
// turn round the workshop, the LR4 homing (it starts 30 mm off its switches, so $H is short and in real time; the view
// holds still), a turn round the LR4, then the job (the view framed on its stock; probe close-ups as the page does them;
// each M0 popup shown, then resumed after --pause seconds), and at the end the gantry driven to the back to show the
// result. QHD by default.
// The director (what each frame shows) is the page's own (web/js/page/director.js, Part 43a: the same one plays help
// videos live in the page); this opens the page in headless Chrome, has the director run on its recording clock - the
// page's clock (performance.now) frozen and stepped one frame at a time, so the video runs at true speed however long
// each frame takes to render - and grabs each frame as a JPEG piped into ffmpeg (H.264 MP4). Sound (the page's machine
// sounds, js/sounds.js): the page keeps what its voices do on each frame and renders that offline to a WAV at the end;
// ffmpeg adds it as AAC (--no-sound: a silent video).
//   python tools/serve.py sandbox --no-open   (serves the repo on 127.0.0.1:8767, cross-origin isolated; the page loads parts/)
//   node tools/record_demo.js <file.nc> [out.mp4] [--size 2560x1440] [--fps 30] [--job 75] [--pause 2] [--orbit 10]
//        [--url http://127.0.0.1:8767/web/index.html?parts=/parts/] [--swiftshader] [--no-sound] [--volume 0.6] [--voice machine|robot] [--pendant] [--no-home] [--real 5]
//        [--kmax 5] [--log events.txt]
// --job: seconds of video for the job's moves (sets the playback speed; pauses and probes come on top).
// --real: at the first cut of each section (after a message or an M0), this many seconds at 1x (real time, real
// sound), then it eases up to the job's speed; a badge shows the speed ("1× real time", "62×"). 0 = off.
// --log: the director's event log (time, then the shots / titles / captions / messages / Home / jogs, and each second's
// speed + G-code line) - diff two of them to check a change leaves the video as it was.
// The job runs on the page's FluidNC (its real $H, jogs, $SD/Run of the file on its SD card, M0 holds resumed with ~;
// Part 34 retired Basic's playback, so --mode / MODE= only take fluidnc). FluidNC runs on its own threads in real time, so
// it keeps running at a scale under the frames' pace, each frame tops it up to the frame's machine time and shows the pose then
// (LR4Demo.ncUntil; scale at most --kmax, default 5: FluidNC in WASM falls behind above ~5x on rapids - a 300 mm Y jog
// at 9000 mm/min took 3.0 s of machine time at 1x and 5x, 5.1 at 10x, 8.9 at 20x).
// Flags given on the command line win over the file's (Video: ...) settings. LR4_NC_TRACE=1: FluidNC's clock per frame.
// Needs Chrome (CHROME env or the usual path), ffmpeg on PATH, Node 22+. Uses the page's window.LR4Director + LR4Demo.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const DS = require("../web/js/demo_script.js");

const args = process.argv.slice(2), opt = Object.assign({ url: "http://127.0.0.1:8767/web/index.html?parts=/parts/", gpu: true },
  JSON.parse(JSON.stringify(DS.DEFAULTS)));
const pos = [], given = new Set();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--size") opt.size = args[++i].split("x").map(Number);
  else if (["--fps", "--job", "--pause", "--orbit", "--volume", "--real", "--kmax"].includes(a)) opt[a.slice(2)] = Number(args[++i]);
  else if (a === "--mode") opt.mode = args[++i].toLowerCase();
  else if (a === "--no-sound") opt.sound = false;
  else if (a === "--no-home") opt.home = false;
  else if (a === "--url") opt.url = args[++i];
  else if (a === "--log") { opt.log = path.resolve(args[++i]); continue; }
  else if (a === "--voice") opt.voice = args[++i];
  else if (a === "--pendant") opt.pendant = true;
  else if (a === "--swiftshader") opt.gpu = false;
  else { pos.push(a); continue; }
  given.add(a.replace(/^--(no-)?/, ""));
}
if (!pos[0]) { console.log("usage: node tools/record_demo.js <file.nc> [out.mp4] [options] (see the top of this file)"); process.exit(1); }
const gcodePath = path.resolve(pos[0]);
const gcodeText = fs.readFileSync(gcodePath, "utf8");
const script = DS.parse(gcodeText);                  // the file's (Video ...) lines (the page parses them again; this is for its settings)
for (const [k, v] of Object.entries(script.settings)) {
  if (v === undefined || given.has(k)) continue;
  if (k === "machine") opt.url = opt.url.replace(/#.*$/, "") + `#${v[0]}x${v[1]}`;
  else opt[k] = v;
}
if (script.settings.kind === "ui" && !given.has("size") && !script.settings.size) opt.size = [1920, 1080];   // ui videos: the whole page
opt.mode = String(opt.mode).toLowerCase();   // (fluidnc only: Basic was retired in Part 34)
if (opt.mode !== "fluidnc") { console.log(`--mode / MODE=${opt.mode}: videos run on FluidNC now (Basic was retired; leave MODE out)`); process.exit(1); }
opt.trace = !!process.env.LR4_NC_TRACE;
const out = path.resolve(pos[1] || path.join(__dirname, "..", "exports", "video", path.basename(gcodePath).replace(/\.\w+$/, "") + "_demo.mp4"));
fs.mkdirSync(path.dirname(out), { recursive: true });
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const print = (lines) => { for (const l of lines || []) console.log(l); };
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
    for (let i = 0; i < 600 && !await val("!!window.LR4Director").catch(() => false); i++) await sleep(100);
    await val("LR4Director.waitLoaded()");
    const gpu = await val(`(() => { const gl = document.createElement("canvas").getContext("webgl"), e = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()`);
    console.log("renderer:", gpu, /SwiftShader/i.test(gpu) ? "(software: slow)" : "");
    // the page set up as the file says (detail, background, My machine, as built, FluidNC, the file on its SD card)
    const prep = await val(`LR4Director.prepare(${JSON.stringify(gcodeText)}, ${JSON.stringify(path.basename(gcodePath))}, ${JSON.stringify(opt)})`);
    print(prep.lines);
    const vid = opt.sound ? out.replace(/(\.\w+)?$/, ".video.mp4") : out;   // frames first; the sound is muxed in at the end
    ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(opt.fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", vid], { stdio: ["pipe", "inherit", "inherit"] });
    let frames = 0, t0 = Date.now();
    // the director's frames, one at a time: drawn -> grabbed -> next
    for (let r = await val("LR4Director.recStart()"); ; r = await val("LR4Director.next()")) {
      print(r.log);
      if (r.error) throw new Error("the director: " + r.error);
      if (r.done) break;
      const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
      if (!ffmpeg.stdin.write(Buffer.from(data, "base64"))) await new Promise((q) => ffmpeg.stdin.once("drain", q));
      if (++frames % (opt.fps * 5) === 0) {
        const per = (Date.now() - t0) / frames, st = r.st;
        console.log(`${(frames / opt.fps).toFixed(0)} s of video, ${per.toFixed(0)} ms a frame${st.total ? `, job ${(100 * st.t / st.total).toFixed(0)} %` : ""}`);
      }
    }
    ffmpeg.stdin.end();
    await new Promise((r) => ffmpeg.on("close", r));
    const note = async (s) => { console.log(s); await val(`LR4Director.note(${JSON.stringify(s)})`); };
    if (opt.sound) {                                 // the sound of those frames -> WAV -> AAC alongside the video
      await note("sound: " + JSON.stringify(await val("LR4Demo.soundStats()")));
      if (process.env.LR4_SOUND_TIMELINE) console.log("per second (steppers/router/cut/vac):", await val("LR4Demo.soundTimeline()"));
      const chunks = await val("LR4Demo.soundWav()"), parts = [];
      for (let i = 0; i < chunks; i++) parts.push(Buffer.from(await val(`LR4Demo.soundChunk(${i})`), "base64"));
      const wav = out.replace(/(\.\w+)?$/, ".wav");
      fs.writeFileSync(wav, Buffer.concat(parts));
      const mux = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", vid, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], { stdio: "inherit" });
      const code = await new Promise((r) => mux.on("close", r));
      if (code) throw new Error("ffmpeg couldn't add the sound (the silent video: " + vid + ")");
      fs.rmSync(vid); fs.rmSync(wav);
    }
    await note(`${out}: ${frames} frames, ${(frames / opt.fps).toFixed(1)} s, rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (opt.log) fs.writeFileSync(opt.log, (await val("LR4Director.events()")).join("\n") + "\n");
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
