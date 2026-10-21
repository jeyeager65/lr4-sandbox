// FluidNC in the page: web/fluidnc/program.js + program.wasm (jeyeager65/FluidNC `wasm-sim`, built by
// tools/build_fluidnc_wasm.py). start() loads the module, stages config.yaml (+ any SD files) and boots it; then send
// lines / realtime bytes and read its output as events. FluidNC's console echoes input and redraws the line with
// ANSI escapes like a serial terminal; those are stripped, and the echo comes through as type "text".
// parseLine / parseStatus / splitter are plain JS (tests/test_fluidnc_sim.js); start() needs a browser with
// cross-origin isolation (the build uses pthreads = SharedArrayBuffer): tools/serve.py's headers, or
// web/coi-serviceworker.js on a plain static host (GitHub Pages).
// FluidNC's folders in the module's filesystem: /native_localfs (config.yaml, LocalFS) and /native_sd (the SD card).
(function (root) {
  "use strict";
  const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]/g;
  const NUMS = new Set(["MPos", "WPos", "WCO", "FS", "F", "Ov", "A"]);

  // "<Idle|MPos:1.000,2.000,3.000|FS:0,0|Pn:XP>" -> { state: "Idle", sub: undefined, MPos: [1, 2, 3], FS: [0, 0], Pn: "XP" }
  // (any other field kept as text; "Hold:0" -> state "Hold", sub 0; "SD:12.30,/sd/job.gcode" -> SD: { pct, file })
  function parseStatus(line) {
    const body = line.trim().replace(/^</, "").replace(/>$/, "");
    const parts = body.split("|");
    const [state, sub] = parts[0].split(":");
    const out = { state, sub: sub === undefined ? undefined : Number(sub) };
    for (const p of parts.slice(1)) {
      const i = p.indexOf(":");
      const k = i < 0 ? p : p.slice(0, i), v = i < 0 ? "" : p.slice(i + 1);
      if (NUMS.has(k)) out[k] = v.split(",").map(Number);
      else if (k === "Ln" || k === "Bf") out[k] = k === "Ln" ? Number(v) : v.split(",").map(Number);
      else if (k === "SD") { const j = v.indexOf(","); out.SD = { pct: Number(j < 0 ? v : v.slice(0, j)), file: j < 0 ? "" : v.slice(j + 1) }; }
      else out[k] = v;
    }
    return out;
  }

  // one output line (no line ending) -> { type, ... }: status / ok / error {code} / alarm {code} / msg {level, text}
  // ([MSG:INFO: x] -> level "INFO"; [MSG:x] -> level "") / tag {tag, text} (other [TAG:...]) / greeting {text} / text
  function parseLine(raw) {
    const line = raw.replace(ANSI, "").replace(/\r/g, "").trim();
    if (!line) return { type: "blank", line };
    if (line[0] === "<" && line.endsWith(">")) return Object.assign({ type: "status", line }, parseStatus(line));
    if (line === "ok") return { type: "ok", line };
    let m = /^error:\s*(\d+)/.exec(line);
    if (m) return { type: "error", code: Number(m[1]), line };
    m = /^ALARM:\s*(\d+)/.exec(line);
    if (m) return { type: "alarm", code: Number(m[1]), line };
    m = /^\[MSG:(?:(INFO|WARN|ERR|ERROR|DBG|DEBUG|VERBOSE):\s*)?(.*)\]$/.exec(line);
    if (m) return { type: "msg", level: m[1] || "", text: m[2], line };
    m = /^\[([A-Z][A-Za-z0-9 ]*):(.*)\]$/.exec(line);
    if (m) return { type: "tag", tag: m[1], text: m[2], line };
    if (/^Grbl\b.*FluidNC/.test(line)) return { type: "greeting", text: line, line };
    return { type: "text", line };
  }

  // output arrives in chunks of any size; splitter(fn) -> feed(chunk), calling fn(line) once per complete line
  function splitter(onLine) {
    let buf = "";
    return (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, i).replace(/\r$/, ""));
        buf = buf.slice(i + 1);
      }
    };
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("could not load " + src));
      document.head.appendChild(s);
    });
  }

  // start({ base: "fluidnc/", config: yaml text, files: { "/native_sd/job.gcode": text | Uint8Array }, onLine, timeout })
  // (onLine = sim.on("line") from before the boot, so it sees the boot messages too)
  // -> Promise<sim>, resolved once FluidNC has printed its greeting. One FluidNC per page (the module's output hook is
  // the global self.fluidncOnOutput, and fluidnc_start runs once per module).
  //   sim.on(type | "line", fn)       every parsed line ("line") or one type ("status", "msg", "alarm", ...)
  //   sim.send(text)                  a line (newline added); sim.realtime(byte) a realtime command ("?", "!", "~",
  //                                   0x18 reset, 0x85 jog cancel, ...)
  //   sim.command(text) -> Promise<{ ok, code, lines }>   lines up to its ok / error (status reports left out)
  //   sim.status() -> Promise<status>                       sends "?" and waits for the report
  //   sim.waitFor(fn, ms) -> Promise<event>                 the next parsed line fn(ev) is true for
  //   sim.writeFile(path, data) / sim.readFile(path)        the module's filesystem
  //   sim.info = web/fluidnc/build.json (repo, commit, source link, ...)
  async function start(opts = {}) {
    if (!root.crossOriginIsolated) throw new Error("FluidNC needs a cross-origin isolated page (SharedArrayBuffer)");
    if (root.__fluidncStarted) throw new Error("FluidNC is already running on this page");
    root.__fluidncStarted = true;
    const base = opts.base || "fluidnc/";
    const info = await fetch(base + "build.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (typeof root.FluidNCModule !== "function") await loadScript(base + "program.js");
    const listeners = new Map();
    const emit = (ev) => {
      for (const k of ["line", ev.type]) for (const fn of listeners.get(k) || []) fn(ev);
    };
    const feed = splitter((l) => emit(parseLine(l)));
    root.fluidncOnOutput = feed;
    const Module = await root.FluidNCModule({ locateFile: (f) => base + f, print: () => {}, printErr: () => {} });
    const FS = Module.FS;
    const writeFile = (path, data) => {
      FS.mkdirTree(path.slice(0, path.lastIndexOf("/")) || "/");
      FS.writeFile(path, data);
    };
    for (const d of ["/native_localfs", "/native_sd"]) FS.mkdirTree(d);
    if (opts.config !== undefined) writeFile("/native_localfs/config.yaml", opts.config);
    for (const [p, d] of Object.entries(opts.files || {})) writeFile(p, d);

    const on = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    };
    const waitFor = (pred, ms = 5000) => new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(new Error("FluidNC: timed out")); }, ms);
      const off = on("line", (ev) => { if (pred(ev)) { clearTimeout(t); off(); res(ev); } });
    });
    // bytes, not a JS string: a string would go in as UTF-8 (0x85 -> C2 85); fluidnc_send_text reads to the NUL
    const sendBytes = (bytes) => Module.ccall("fluidnc_send_text", null, ["array"], [Uint8Array.from([...bytes, 0])]);
    const send = (text) => sendBytes(new TextEncoder().encode(text.replace(/\r?\n?$/, "") + "\n"));
    const realtime = (b) => sendBytes([typeof b === "string" ? b.charCodeAt(0) : b]);
    // replies come in order, one ok / error per line sent; FIFO of the commands waiting on theirs
    const queue = [];
    on("line", (ev) => {
      if (!queue.length || ev.type === "status" || ev.type === "blank") return;
      const q = queue[0];
      if (ev.type === "ok" || ev.type === "error") {
        queue.shift();
        clearTimeout(q.timer);
        q.res({ ok: ev.type === "ok", code: ev.code, lines: q.lines });
      } else if (!(ev.type === "text" && ev.line === q.text)) q.lines.push(ev);  // skip the console's echo
    });
    const command = (text, ms = 10000) => new Promise((res, rej) => {
      const q = { text: text.trim(), lines: [], res };
      q.timer = setTimeout(() => { const i = queue.indexOf(q); if (i >= 0) queue.splice(i, 1); rej(new Error("FluidNC: no reply to " + q.text)); }, ms);
      queue.push(q);
      send(text);
    });
    const status = (ms = 2000) => { const p = waitFor((ev) => ev.type === "status", ms); realtime("?"); return p; };

    if (opts.onLine) on("line", opts.onLine);
    const booted = waitFor((ev) => ev.type === "greeting", opts.timeout || 15000);
    Module.ccall("fluidnc_start", null, [], []);
    const greeting = await booted;
    return { Module, FS, info, greeting: greeting.text, on, waitFor, send, realtime, command, status, writeFile,
      readFile: (p, enc) => FS.readFile(p, enc ? { encoding: enc } : undefined) };
  }

  const api = { parseLine, parseStatus, splitter, start };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FluidNCSim = api;
})(typeof self !== "undefined" ? self : this);
