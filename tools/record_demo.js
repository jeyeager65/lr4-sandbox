// Record a demo video of the sandbox page running a G-code file. The file can script the video in its comments - settings,
// shots, captions, titles, homing, work zero, the pace - see tools/demo_script.js (e.g. (Video Text: TIME=4 TEXT=Front
// holes)); MSG / PRINT lines show on top as playback reaches them. Without a script: a
// turn round the workshop, the LR4 homing (it starts 30 mm off its switches, so $H is short and in real time; the view
// holds still), a turn round the LR4, then the job (the view framed on its stock; probe close-ups as the page does them;
// each M0 popup shown, then resumed after --pause seconds), and at the end the gantry driven to the back to show the
// result. QHD by default. The page's clock (performance.now) is taken over and stepped one
// frame at a time, so the video runs at true speed however long each frame takes to render. Frames are JPEGs piped
// into ffmpeg (H.264 MP4). Sound (the page's machine sounds, js/sounds.js): the page keeps what its voices do on each
// frame and renders that offline to a WAV at the end; ffmpeg adds it as AAC (--no-sound: a silent video, as before).
//   python tools/serve.py sandbox             (serves the repo on 127.0.0.1:8767; the page loads parts/)
//   node tools/record_demo.js <file.nc> [out.mp4] [--size 2560x1440] [--fps 30] [--job 75] [--pause 2] [--orbit 10]
//        [--url http://127.0.0.1:8767/web/index.html?parts=/parts/] [--swiftshader] [--no-sound] [--volume 0.6] [--voice machine|robot] [--pendant] [--no-home] [--real 5]
// --job: seconds of video for the job's moves (sets the playback speed; pauses and probes come on top).
// --real: at the first cut of each section (after a message or an M0), this many seconds at 1x (real time, real
// sound), then it eases up to the job's speed; a badge shows the speed ("1× real time", "62×"). 0 = off.
// Flags given on the command line win over the file's (Video: ...) settings.
// Needs Chrome (CHROME env or the usual path), ffmpeg on PATH, Node 22+. Uses the page's window.LR4Demo handle.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const DS = require("./demo_script.js");

const args = process.argv.slice(2), opt = { size: [2560, 1440], fps: 30, job: 75, pause: 2, orbit: 10,
  url: "http://127.0.0.1:8767/web/index.html?parts=/parts/", gpu: true, sound: true, volume: 0.6, home: true, real: 5, voice: "machine", pendant: false };
Object.assign(opt, { park: true, hold: 3, detail: "full", scenery: "shop", messages: true, msgtime: 4 });
const pos = [], given = new Set();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--size") opt.size = args[++i].split("x").map(Number);
  else if (["--fps", "--job", "--pause", "--orbit", "--volume", "--real"].includes(a)) opt[a.slice(2)] = Number(args[++i]);
  else if (a === "--no-sound") opt.sound = false;
  else if (a === "--no-home") opt.home = false;
  else if (a === "--url") opt.url = args[++i];
  else if (a === "--voice") opt.voice = args[++i];
  else if (a === "--pendant") opt.pendant = true;
  else if (a === "--swiftshader") opt.gpu = false;
  else { pos.push(a); continue; }
  given.add(a.replace(/^--(no-)?/, ""));
}
if (!pos[0]) { console.log("usage: node tools/record_demo.js <file.nc> [out.mp4] [options] (see the top of this file)"); process.exit(1); }
const gcodePath = path.resolve(pos[0]);
const gcodeText = fs.readFileSync(gcodePath, "utf8");
const script = DS.parse(gcodeText);                  // the file's (Video ...) lines
for (const w of script.warnings) console.log("(Video):", w);
for (const [k, v] of Object.entries(script.settings)) {
  if (v === undefined || given.has(k)) continue;
  if (k === "machine") opt.url = opt.url.replace(/#.*$/, "") + `#${v[0]}x${v[1]}`;
  else opt[k] = v;
}
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
    // detail (full), the background (the workshop), the 3D view filling the page
    if (await val(`(() => { const b = document.querySelector('#detail button[data-v="${opt.detail}"]');
        if (b && b.getAttribute("aria-pressed") !== "true") { b.click(); return true; } return false; })()`)) await loaded();
    await val(`(() => { const b = document.querySelector('#scenery button[data-v="${opt.scenery}"]'); if (b) b.click(); return true; })()`);
    await sleep(1500);
    await val("LR4Demo.recording(true)");
    await sleep(500);
    if (opt.pendant) {                               // FluidTouch on the table, talking to Basic's stand-in; its screen in a corner
      const up = await val("LR4Demo.pendant()");
      if (!up) console.log("pendant: FluidTouch didn't connect (is the page cross-origin isolated? serve it with tools/serve.py)");
      else { await sleep(2500); await val(`LR4Demo.pip({ on: true })`); console.log("pendant: on, its screen at the bottom right"); }
    }
    const job = await val(`LR4Demo.playFile(${JSON.stringify(path.basename(gcodePath))}, ${JSON.stringify(gcodeText)})`);
    console.log(`job: ${(job.total / 60).toFixed(1)} min of moves, ${job.pauses} M0 pauses; script: ${script.intro.length} intro + ${script.at.length} later (Video) lines`);
    const g = await val(`(() => { const D = LR4Demo, b = D.machineBox(), c = b.getCenter(new D.THREE.Vector3()), s = b.getSize(new D.THREE.Vector3());
      return { c: c.toArray(), s: s.toArray(), floor: D.floorZ(), fov: D.camera.fov, aspect: D.camera.aspect,
        cam: D.camera.position.toArray(), tgt: D.controls.target.toArray() }; })()`);
    await val(PAGE_REC);
    const homeCmd = (DS.hasOwnIntro(script) ? script.intro : DS.defaultIntro(opt)).find((q) => q.kind === "home");
    if (opt.home && homeCmd) await val(`LR4Demo.nearHome(${Number(homeCmd.kv.offset) || 30})`);   // a little way off the switches from the first frame
    if (opt.sound) await val(`(() => { const v = document.getElementById("snd-vol"); v.value = ${opt.volume}; v.dispatchEvent(new Event("input")); return LR4Demo.sound(true, ${JSON.stringify(opt.voice)}); })()`);
    const vid = opt.sound ? out.replace(/(\.\w+)?$/, ".video.mp4") : out;   // frames first; the sound is muxed in at the end

    ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(opt.fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", vid], { stdio: ["pipe", "inherit", "inherit"] });
    const dt = 1000 / opt.fps;
    let frames = 0, t0 = Date.now();
    const frame = async (cam) => {
      const st = await val(`window.__rec.frame(${JSON.stringify(cam || null)}, ${dt})`);
      last = st;
      const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
      if (!ffmpeg.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (captionEnd && frames + 1 >= captionEnd) { captionEnd = 0; await val("LR4Demo.caption(null)"); }
      if (++frames % (opt.fps * 5) === 0) {
        const per = (Date.now() - t0) / frames;
        console.log(`${(frames / opt.fps).toFixed(0)} s of video, ${per.toFixed(0)} ms a frame${st.total ? `, job ${(100 * st.t / st.total).toFixed(0)} %` : ""}`);
      }
      return st;
    };
    const n = (sec) => Math.max(1, Math.round(sec * opt.fps));
    let captionEnd = 0;                              // the caption comes off at this frame (0 = none showing)
    const hold = async (secs, cam) => { for (let i = 0, m = n(secs); i < m; i++) await frame(cam); };

    // shots: [camera position, target]
    const c = g.c, span = Math.max(g.s[0], g.s[1]);
    const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const turn = ([p, t], k) => {                    // p turned k of a turn about the target (Z), counter-clockwise
      const a = k * 2 * Math.PI, dx = p[0] - t[0], dy = p[1] - t[1];
      return [[t[0] + dx * Math.cos(a) - dy * Math.sin(a), t[1] + dx * Math.sin(a) + dy * Math.cos(a), p[2]], t];
    };
    const from = (t, dir, dist) => { const d = norm(dir); return [t.map((v, i) => v + d[i] * dist), t]; };
    const viewOf = (st, at) => {                     // the stock in the room, framed front-right from above
      const sc = st ? [at[0] + (st.xmin + st.xmax) / 2, at[1] + (st.ymin + st.ymax) / 2, at[2] + st.zmax] : [at[0], at[1], at[2]];
      const half = st ? Math.hypot(st.xmax - st.xmin, st.ymax - st.ymin) / 2 : 150;
      return { t: sc, dist: half * 1.35 / Math.tan(g.fov * Math.PI / 360) };
    };
    let stockView = viewOf(job.stock, job.at), last = null, coreAt = null;
    const pendAt = opt.pendant ? await val("LR4Demo.pendantView()") : null;   // the pendant stays put on the table
    const pipCmd = (cmd) => val(`LR4Demo.pip(${JSON.stringify({ on: !/^(off|no|0)$/i.test(cmd.kv.show || "on"), corner: (cmd.kv.corner || "br").toLowerCase(), size: Number(cmd.kv.size) || 26 })})`);   // last: the latest frame's job state
    const VIEWS = { iso: [1, -1.15, 0.85], front: [0, -1, 0.18], top: [0, -0.001, 1], side: [1, 0, 0.18], back: [-0.6, 1, 0.55] };
    const shotAt = (sh) => {                         // where a shot looks from / at now
      const d = sh.dist;
      if (sh.name === "workshop") return from(c, [0, -span * 1.55, g.floor + 1700 - c[2]], d || Math.hypot(span * 1.55, g.floor + 1700 - c[2]));
      if (sh.name === "machine") return from(c, [0, -0.95, 0.5], d || span * 1.07);
      if (sh.name === "stock") return from(stockView.t, [0.42, -0.78, 0.72], d || stockView.dist);
      if (sh.name === "tool") return from((last && last.tip) || stockView.t, [0.42, -0.78, 0.55], d || 320);
      if (sh.name === "core") return from(coreAt || c, [0.55, -0.85, 0.45], d || 700);
      if (sh.name === "pendant") return pendAt ? from(pendAt.t, pendAt.n, d || 420) : from(c, [0, -0.95, 0.5], span * 1.07);
      return from(c, VIEWS[sh.name], d || span * 1.3);
    };
    const blend = (A, B, k) => [lerp(A[0], B[0], ease(k)), lerp(A[1], B[1], ease(k))];
    let cam = [g.cam, g.tgt];                        // where the camera is (the intro sets it every frame)
    // a shot, as a camera per frame: blend from where the camera is over secs, then orbit (turns once in orbit secs)
    const mkShot = (sh, start) => {
      const bf = n(sh.secs), of = sh.orbit ? n(sh.orbit) : 0;
      return { frames: bf + of, at: (f) => {
        const to = shotAt(sh);
        if (f < bf) return blend(start, to, (f + 1) / bf);
        return of ? turn(to, Math.min(1, (f - bf) / of)) : to;
      } };
    };

    // the job's pace
    const fit = (secs) => Math.max(1, Math.round(job.total / secs));
    const pace = { base: fit(opt.job), real: opt.real, badge: true, temp: null, wait: 0 };
    const paceCmd = async (cmd) => {
      const kv = cmd.kv;
      if (kv.real !== undefined) pace.real = Number(kv.real);
      if (kv.badge !== undefined) { pace.badge = !/^(off|no|0)$/i.test(kv.badge); if (!pace.badge) await val("LR4Demo.badge(null)"); }
      const r = kv.x !== undefined ? Number(kv.x) : kv.fit !== undefined ? fit(Number(kv.fit)) : null;
      if (r === null) return;
      if (kv.for !== undefined) pace.temp = { rate: r, left: n(Number(kv.for)) }; else pace.base = r;
    };
    const caption = async (cmd) => { await val(`LR4Demo.caption(${JSON.stringify(DS.titleText(cmd))})`); captionEnd = frames + n(DS.secsOf(cmd, 4)); };

    // work zero (Video Zero): the jog from the homed spot to it, in real time, then the job laid out from there
    let zero = null;
    const jogToZero = async () => {
      const j = await val(`LR4Demo.zero(${zero[0]}, ${zero[1]})`);
      if (!j) return;
      const dist = Math.hypot(j.to[0] - j.from[0], j.to[1] - j.from[1]);
      console.log(`jog to work zero (${zero.map((v) => v.toFixed(1)).join(", ")} mm, ${dist.toFixed(0)} mm away)`);
      for (let i = 0, m = n(Math.max(1, dist / 50)); i <= m; i++) {   // ~3000 mm/min, eased
        await val(`LR4Demo.movePose(...${JSON.stringify(lerp(j.from, j.to, ease(i / m)))})`);
        await frame(cam);
      }
      const lay = await val("LR4Demo.layout()");
      stockView = viewOf(lay.stock, lay.at);
    };

    // the intro: the file's own (or the default one), in order
    const intro = DS.hasOwnIntro(script) ? script.intro : [...DS.defaultIntro(opt), ...script.intro];
    let homed = false;
    for (const cmd of intro.filter((q) => opt.home || q.kind !== "home")) {
      if (cmd.kind === "shot") {
        const sh = DS.shotOf(cmd), s = mkShot(sh, cam);
        console.log(`shot ${sh.name}${sh.orbit ? ` orbit ${sh.orbit}` : ""}`);
        if (sh.name === "core") coreAt = await val("LR4Demo.coreCenter()");
        for (let f = 0; f < s.frames; f++) { cam = s.at(f); await frame(cam); }
      } else if (cmd.kind === "home") {              // close on the core, still; $H in real time
        console.log("homing");
        coreAt = await val("LR4Demo.coreCenter()");
        const s = mkShot({ name: "core", secs: DS.secsOf(cmd, 1.5), orbit: 0, dist: Number(cmd.kv.dist) || 700 }, cam);
        for (let f = 0; f < s.frames; f++) { cam = s.at(f); await frame(cam); }
        await hold(0.5, cam);
        await val("LR4Demo.home(true)");
        for (let i = 0; i < n(120) && await val("LR4Demo.homing()"); i++) await frame(cam);
        await hold(0.7, cam);
        homed = true;
        const lay = await val("LR4Demo.layout()");   // the job now starts from the homed spot
        stockView = viewOf(lay.stock, lay.at);
        if (zero) await jogToZero();
      } else if (cmd.kind === "zero") {
        zero = DS.zeroOf(cmd);
        if (homed || !opt.home) await jogToZero();   // else right after homing
      } else if (cmd.kind === "title") {
        await val(`LR4Demo.title(${JSON.stringify(DS.titleText(cmd))})`);
        await hold(DS.secsOf(cmd, 3), cam);
        await val("LR4Demo.title(null)");
      } else if (cmd.kind === "text") await caption(cmd);
      else if (cmd.kind === "pendant") await pipCmd(cmd);
      else if (cmd.kind === "wait") await hold(DS.secsOf(cmd, 1), cam);
      else await paceCmd(cmd);
    }

    console.log(`job (at ${(frames / opt.fps).toFixed(1)} s, ${pace.base}x)`);
    await val("LR4Demo.play()");
    let held = 0, endHold = 0, s, rate = 0, badge = "", section = -1, realLeft = 0, ramp = -1, k = 0;
    let shot = null, shotF = 0, titleEnd = 0, msgKey = null, msgEnd = 0;
    const setRate = async (r) => {
      if (Math.abs(r - rate) > 1e-9) { rate = r; await val(`LR4Demo.rate(${r})`); }
      const b = !pace.badge ? "" : pace.wait > 0 ? badge : r < 1.05 ? "1× real time" : `${Math.round(r)}×`;
      if (b !== badge) { badge = b; await val(`LR4Demo.badge(${JSON.stringify(b || null)})`); }
    };
    await setRate(pace.temp ? pace.temp.rate : pace.base);
    for (;;) {
      s = await frame(shot ? shot.at(Math.min(shotF++, shot.frames - 1)) : null);   // null: the page's camera (its close-ups)
      // the file's (Video ...) lines as playback reaches them
      for (; k < script.at.length && s.line >= script.at[k].line; k++) {
        const cmd = script.at[k];
        if (cmd.kind === "shot") {
          const sh = DS.shotOf(cmd);
          if (sh.name === "core") coreAt = await val("LR4Demo.coreCenter()");
          shot = sh.name === "page" ? null : mkShot(sh, s.cam); shotF = 0;
          if (shot && !sh.orbit) { const keep = shot; shot = { frames: Infinity, at: (f) => keep.at(Math.min(f, keep.frames - 1)) }; }
        } else if (cmd.kind === "text") await caption(cmd);
        else if (cmd.kind === "pendant") await pipCmd(cmd);
        else if (cmd.kind === "title") { titleEnd = frames + n(DS.secsOf(cmd, 3)); await val(`LR4Demo.title(${JSON.stringify(DS.titleText(cmd))})`); }
        else if (cmd.kind === "wait") pace.wait = n(DS.secsOf(cmd, 1));
        else await paceCmd(cmd);
      }
      if (titleEnd && frames >= titleEnd) { titleEnd = 0; await val("LR4Demo.title(null)"); }
      // the file's MSG / PRINT lines on top (not the one an M0 popup is already showing)
      if (opt.messages && s.msg && s.msg.key !== msgKey) {
        msgKey = s.msg.key;
        if (s.msg.text !== s.popText) { await val(`LR4Demo.msg(${JSON.stringify(s.msg.text)})`); msgEnd = frames + n(opt.msgtime); }
      }
      if (msgEnd && frames >= msgEnd) { msgEnd = 0; await val("LR4Demo.msg(null)"); }
      // real time at each section's first cut, then ease up to the job's speed; the badge says which
      if (pace.real > 0 && s.cut && s.section !== section) { section = s.section; realLeft = n(pace.real); ramp = -1; }
      let r;
      if (pace.wait > 0) { pace.wait--; r = 1e-9; }
      else if (pace.temp) { r = pace.temp.rate; if (--pace.temp.left <= 0) pace.temp = null; }
      else if (realLeft > 0) { r = 1; if (!s.paused && --realLeft === 0) ramp = 0; }
      else if (ramp >= 0) { const q = Math.min(1, ++ramp / n(1.5)); r = Math.exp(Math.log(pace.base) * ease(q)); if (q >= 1) ramp = -1; }
      else r = pace.base;
      await setRate(r);
      if (s.paused) { if (++held >= n(opt.pause)) { await val("LR4Demo.resume()"); held = 0; } }
      else held = 0;
      if (s.t >= s.total && !s.paused && ++endHold > n(1)) break;
    }
    await val("LR4Demo.badge(null)"); await val("LR4Demo.msg(null)");
    const endCam = shot ? shot.at(Math.min(shotF, shot.frames - 1)) : null;
    if (opt.park) {                                  // drive the gantry to the back and Z to the top to show the result
      console.log("park");
      const park = await val("LR4Demo.park()");
      for (let i = 0, m = n(4); i <= m; i++) {
        await val(`LR4Demo.pose(...${JSON.stringify(lerp(park.from, park.to, ease(i / m)))})`);
        await frame(endCam);
      }
    }
    await hold(opt.hold, endCam);
    ffmpeg.stdin.end();
    await new Promise((r) => ffmpeg.on("close", r));
    if (opt.sound) {                                 // the sound of those frames -> WAV -> AAC alongside the video
      console.log("sound:", JSON.stringify(await val("LR4Demo.soundStats()")));
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
