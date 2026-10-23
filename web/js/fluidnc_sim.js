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

  function loadScript(doc, src) {
    return new Promise((res, rej) => {
      const s = doc.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("could not load " + src));
      doc.head.appendChild(s);
    });
  }

  // start({ base: "fluidnc/", config: yaml text, files: { "/native_sd/job.gcode": text | Uint8Array },
  //   dirs: ["/native_sd/jobs"] (folders to make, empty ones too), onLine, timeout })
  // (onLine = sim.on("line") from before the boot, so it sees the boot messages too)
  // -> Promise<sim>, resolved once FluidNC has printed its greeting. Each FluidNC runs in its own hidden same-origin
  // iframe (the module's output hook is that window's fluidncOnOutput, and fluidnc_start runs once per module):
  // sim.stop() removes it, which ends its threads, so stop() + start() = a fresh boot (a new config.yaml).
  //   sim.on(type | "line", fn)       every parsed line ("line") or one type ("status", "msg", "alarm", ...)
  //   sim.send(text)                  a line (newline added); sim.realtime(byte) a realtime command ("?", "!", "~",
  //                                   0x18 reset, 0x85 jog cancel, ...)
  //   sim.command(text) -> Promise<{ ok, code, lines }>   lines up to its ok / error (status reports left out)
  //   sim.status() -> Promise<status>                       sends "?" and waits for the report
  //   sim.waitFor(fn, ms) -> Promise<event>                 the next parsed line fn(ev) is true for
  //   sim.writeFile(path, data) / sim.readFile(path)        the module's filesystem
  //   sim.info = web/fluidnc/build.json (repo, commit, source link, ...); sim.stop(); sim.stopped
  // The simulated pins (wasm/VirtualPins.cpp on the wasm-sim branch; sim.pins false in an older build):
  //   sim.setSwitch(gpio, stepPin, dirPin, tripSteps, activeBelow)   gpio reads high while that motor's step count
  //                                   is <= tripSteps (activeBelow) / >= tripSteps; sim.clearSwitch(gpio) = no switch
  //   sim.addMotor(stepPin, dirPin)   count a motor's steps with no switch on it; sim.motorSteps(stepPin)
  //   sim.pinMask()                   the pin levels (bit n = gpio n); sim.setTimeScale(k) machine time k x real
  // Raw TCP into FluidNC's own web server (BrowserAsyncTCP's fluidnc_vconn_*; FluidTouch's WebSocket rides on it):
  //   sim.vconn.open(port, onData(Uint8Array), onClose()) -> id (0 = nothing listening yet)
  //   sim.vconn.send(id, bytes); sim.vconn.close(id)
  async function start(opts = {}) {
    if (!root.crossOriginIsolated) throw new Error("FluidNC needs a cross-origin isolated page (SharedArrayBuffer)");
    const base = new URL(opts.base || "fluidnc/", root.location.href).href;
    const info = await fetch(base + "build.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const frame = document.createElement("iframe");   // about:blank: same origin, inherits the page's isolation
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    let stopped = false;
    let pumpId = () => 0;
    const stop = () => {
      stopped = true; clearInterval(pumpId()); win.fluidncOnOutput = () => {};
      for (const c of vconns.values()) c.onClose();
      vconns.clear(); frame.remove();
    };
    const vconns = new Map();   // id -> { onData, onClose }
    win.fluidncOnVconnData = (id, bytes) => { const c = vconns.get(id); if (c) c.onData(bytes); };
    win.fluidncOnVconnClose = (id) => { const c = vconns.get(id); if (c) { vconns.delete(id); c.onClose(); } };
    const listeners = new Map();
    const emit = (ev) => {
      for (const k of ["line", ev.type]) for (const fn of listeners.get(k) || []) fn(ev);
    };
    const feed = splitter((l) => emit(parseLine(l)));
    win.fluidncOnOutput = feed;
    let Module;
    try {
      await loadScript(win.document, base + "program.js");
      Module = await win.FluidNCModule({ locateFile: (f) => base + f, print: () => {}, printErr: () => {} });
    } catch (e) { stop(); throw e; }
    const FS = Module.FS;
    // queued output (wasm-sim): FluidNC appends, the page takes it on a timer - so a busy page never stalls FluidNC
    // (its synchronous default waits for this thread, and a stalled main loop lets the step buffer run dry)
    let pump = 0;
    if (typeof Module._fluidnc_output_queue === "function") {
      Module.ccall("fluidnc_output_queue", null, ["number"], [1]);
      pump = setInterval(() => { const t = Module.ccall("fluidnc_take_output", "string", [], []); if (t) feed(t); }, 4);
    }
    pumpId = () => pump;
    const writeFile = (path, data) => {
      FS.mkdirTree(path.slice(0, path.lastIndexOf("/")) || "/");
      FS.writeFile(path, data);
    };
    for (const d of ["/native_localfs", "/native_sd", ...(opts.dirs || [])]) FS.mkdirTree(d);
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
    const sendBytes = (bytes) => stopped || Module.ccall("fluidnc_send_text", null, ["array"], [Uint8Array.from([...bytes, 0])]);
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
    let greeting;
    try { greeting = await booted; } catch (e) { stop(); throw e; }
    const pins = typeof Module._fluidnc_set_switch === "function", N = "number";
    const call = (f, ret, args) => (pins && !stopped ? Module.ccall(f, ret, args.map(() => N), args) : ret ? 0 : undefined);
    const sim = { Module, FS, info, greeting: greeting.text, on, waitFor, send, realtime, command, status, writeFile, pins,
      setSwitch: (g, st, d, trip, below) => call("fluidnc_set_switch", null, [g, st, d, Math.round(trip), below ? 1 : 0]),
      clearSwitch: (g) => call("fluidnc_clear_switch", null, [g]),
      addMotor: (st, d) => call("fluidnc_add_motor", null, [st, d]),
      motorSteps: (st) => call("fluidnc_motor_steps", N, [st]),
      pinMask: () => call("fluidnc_pin_mask", N, []),
      setTimeScale: (k) => call("fluidnc_set_time_scale", null, [k]),
      readFile: (p, enc) => FS.readFile(p, enc ? { encoding: enc } : undefined),
      vconn: {
        open(port, onData, onClose) {
          // registered in the same tick as the open: FluidNC's output reaches this thread only after we yield
          const id = stopped || typeof Module._fluidnc_vconn_open !== "function" ? 0 : Module.ccall("fluidnc_vconn_open", N, [N], [port]);
          if (id) vconns.set(id, { onData, onClose });
          return id;
        },
        send(id, bytes) {
          for (let o = 0; !stopped && vconns.has(id) && o < bytes.length; o += 8192) {   // ccall copies via the stack
            const part = bytes.subarray(o, o + 8192);
            Module.ccall("fluidnc_vconn_send", null, [N, "array", N], [id, part, part.length]);
          }
        },
        close(id) { if (vconns.delete(id) && !stopped) Module.ccall("fluidnc_vconn_close", null, [N], [id]); },
      },
      stop: () => { stop(); for (const q of queue.splice(0)) clearTimeout(q.timer); } };
    Object.defineProperty(sim, "stopped", { get: () => stopped });
    return sim;
  }

  const api = { parseLine, parseStatus, splitter, start };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FluidNCSim = api;
})(typeof self !== "undefined" ? self : this);
