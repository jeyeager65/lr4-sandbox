// Basic mode's FluidNC stand-in (Part 24): a small, clearly labelled imitation of FluidNC's web server, so the unmodified
// FluidTouch (js/fluidtouch_sim.js) can drive Basic mode (the page moving the machine itself, no firmware). It has
// the same raw-TCP face as js/fluidnc_sim.js (vconn: FluidTouch's WebSocket client writes bytes, gets bytes), answers
// the HTTP upgrade, reads the masked client frames and speaks FluidNC's protocol back (output lines in binary frames,
// "currentID:" / "PING:" in text frames). What it knows - the rest gets "error: not in Basic mode ...":
//   ? (status now)  ! (hold)  ~ (resume)  0x18 (reset)  0x85 (jog cancel)  other realtime bytes (overrides): ignored
//   $Report/Interval=ms (auto reports, every ms)  $Build/Info  $G  $#  $X  $I
//   $H (home all; $HX / $HY / $HZ: Basic homes every axis)  $J=[G91|G90|G53|G20|G21] X Y Z F (jog; queued like FluidNC)
//   $Files/ListGcode=/sd/dir  $SD/List  $SD/Run=/sd/file  $SD/Delete=/sd/file
// Basic has no work offsets: WPos = MPos (so G10 L20 zeroing is one of the "not in Basic" commands).
//   const nc = BasicNC.create(page)
//     page.status() -> { state: "Idle" | "Run" | "Hold:0" | "Jog" | "Home" | "Alarm", mpos: [x, y, z], feed, rpm, sd: [pct, path] | null }
//     page.home(), page.jog({ rel, machine, x, y, z, f }), page.jogCancel(), page.hold(), page.resume(), page.reset()
//       -> null (ok) or an error string; page.files(dir) -> [{ name, size (-1 = folder) }]; page.run(path), page.del(path)
//       (may return promises)
//   nc.vconn.open(port, onData, onClose) -> id; nc.vconn.send(id, bytes); nc.vconn.close(id)   (as FluidNC's)
//   nc.message(text)   a [MSG:INFO: ...] line to every pendant (an M0's text);  nc.stop()
// Pure helpers for tests/test_basic_nc.js: sha1, acceptKey, clientFrames, serverFrame, parseJog.
(function (root) {
  "use strict";
  const NAME = "Basic mode";
  const NOT = `error: not in ${NAME} - switch the Run tab's controller to FluidNC for that`;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // SHA-1 of bytes -> 20 bytes (the WebSocket accept key; FluidTouch's client checks it)
  function sha1(msg) {
    const n = msg.length, words = new Uint32Array((((n + 8) >> 6) + 1) * 16);
    for (let i = 0; i < n; i++) words[i >> 2] |= msg[i] << (24 - (i & 3) * 8);
    words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
    words[words.length - 1] = n * 8;
    let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const w = new Uint32Array(80), rol = (x, k) => (x << k) | (x >>> (32 - k));
    for (let o = 0; o < words.length; o += 16) {
      for (let i = 0; i < 80; i++) w[i] = i < 16 ? words[o + i] : rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let [A, B, C, D, E] = [a, b, c, d, e];
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (B & C) | (~B & D) : i < 40 ? B ^ C ^ D : i < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D;
        const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const t = (rol(A, 5) + f + E + k + w[i]) >>> 0;
        E = D; D = C; C = rol(B, 30) >>> 0; B = A; A = t;
      }
      a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0; e = (e + E) >>> 0;
    }
    const out = new Uint8Array(20);
    [a, b, c, d, e].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v; });
    return out;
  }
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const acceptKey = (key) => b64(sha1(enc.encode(key.trim() + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));

  // client -> server frames (masked): { frames: [{ op, data: Uint8Array }], rest }
  function clientFrames(buf) {
    const out = [];
    let i = 0;
    while (buf.length - i >= 2) {
      const op = buf[i] & 15, masked = buf[i + 1] & 128;
      let len = buf[i + 1] & 127, h = 2;
      if (len === 126) { if (buf.length - i < 4) break; len = (buf[i + 2] << 8) | buf[i + 3]; h = 4; }
      else if (len === 127) { if (buf.length - i < 10) break; len = ((buf[i + 6] << 24) | (buf[i + 7] << 16) | (buf[i + 8] << 8) | buf[i + 9]) >>> 0; h = 10; }
      const k = masked ? 4 : 0;
      if (buf.length - i < h + k + len) break;
      const data = buf.slice(i + h + k, i + h + k + len);
      if (masked) for (let j = 0; j < len; j++) data[j] ^= buf[i + h + (j & 3)];
      out.push({ op, data });
      i += h + k + len;
    }
    return { frames: out, rest: buf.slice(i) };
  }
  // server -> client frame (unmasked, final): op 1 text, 2 binary, 8 close, 10 pong
  function serverFrame(op, data) {
    const n = data.length, h = n < 126 ? 2 : n < 65536 ? 4 : 10, f = new Uint8Array(h + n);
    f[0] = 0x80 | op;
    if (n < 126) f[1] = n;
    else if (n < 65536) { f[1] = 126; f[2] = n >> 8; f[3] = n & 255; }
    else { f[1] = 127; for (let j = 0; j < 4; j++) f[9 - j] = (n >>> (8 * j)) & 255; }
    f.set(data, h);
    return f;
  }

  // "$J=G91 X1.5 Y-2 F3000" (after "$J=") -> { rel, machine, x, y, z, f } (mm, mm/min) or null
  function parseJog(s) {
    const o = { rel: false, machine: false };
    let inch = false;
    for (const [, l, v] of s.toUpperCase().matchAll(/([A-Z])\s*([-+]?[\d.]+)/g)) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      if (l === "G") {
        if (n === 91) o.rel = true; else if (n === 90) o.rel = false; else if (n === 53) o.machine = true;
        else if (n === 20) inch = true; else if (n === 21) inch = false; else return null;
      } else if ("XYZF".includes(l)) o[l.toLowerCase()] = n;
      else return null;
    }
    if (inch) for (const a of ["x", "y", "z", "f"]) if (o[a] !== undefined) o[a] *= 25.4;
    return o.f > 0 && ["x", "y", "z"].some((a) => o[a] !== undefined) ? o : null;
  }

  const f3 = (v) => (Number.isFinite(v) ? v : 0).toFixed(3);
  function report(s) {
    const m = (s.mpos || [0, 0, 0]).map(f3).join(",");
    let r = `<${s.state || "Idle"}|MPos:${m}|FS:${Math.round(s.feed || 0)},${Math.round(s.rpm || 0)}`;
    if (s.sd) r += `|SD:${s.sd[0].toFixed(2)},${s.sd[1]}`;
    return r + ">";
  }

  function create(page) {
    const conns = new Map();
    let nextId = 1, stopped = false;
    const sendLines = (c, lines) => {
      if (stopped || !conns.has(c.id) || !lines.length) return;
      c.onData(serverFrame(2, enc.encode(lines.map((l) => l + "\n").join(""))));
    };
    const sendText = (c, t) => { if (!stopped && conns.has(c.id)) c.onData(serverFrame(1, enc.encode(t))); };
    const result = (c, r) => sendLines(c, [r ? String(r) : "ok"]);
    const later = (c, p) => Promise.resolve(p).then((r) => result(c, r), (e) => result(c, "error: " + (e && e.message || e)));
    const sdPath = (p) => p.replace(/^\/sd(?=\/|$)/i, "") || "/";

    function realtime(c, ch) {
      if (ch === "?") sendLines(c, [report(page.status())]);
      else if (ch === "!") page.hold();
      else if (ch === "~") page.resume();
      else if (ch === "\x18") { page.reset(); sendLines(c, ["", `Grbl 3.9 [FluidNC stand-in for ${NAME} (the page moves the machine), '$' for help]`]); }
      else if (ch === "\x85") page.jogCancel();
      // the rest (feed / rapid / spindle overrides 0x90-0x9D, door 0x84 ...) do nothing here
    }
    function line(c, t) {
      t = t.trim();
      if (!t) return;
      const u = t.toUpperCase();
      let m;
      if ((m = /^\$REPORT\/INTERVAL=(\d+)/.exec(u))) {
        clearInterval(c.timer);
        const ms = Number(m[1]);
        if (ms > 0) c.timer = setInterval(() => sendLines(c, [report(page.status())]), Math.max(50, ms));
        sendLines(c, [`[MSG:INFO: websocket auto report interval set to ${ms} ms]`, "ok"]);
      } else if (u === "$BUILD/INFO" || u === "$I") {
        sendLines(c, [`[VER:3.9 FluidNC v4.0.0-basic (stand-in: ${NAME}, the page moves the machine):]`, "[OPT:PHSJ]", "ok"]);
      } else if (u === "$G") sendLines(c, ["[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]", "ok"]);
      else if (u === "$#") {
        sendLines(c, [...["G54", "G55", "G56", "G57", "G58", "G59", "G28", "G30", "G92"].map((g) => `[${g}:0.000,0.000,0.000]`),
          "[TLO:0.000]", "[PRB:0.000,0.000,0.000:0]", "ok"]);
      } else if (u === "$X") result(c, null);
      else if (/^\$H[XYZ]*$/.test(u)) later(c, page.home());
      else if (u.startsWith("$J=")) {
        const j = parseJog(t.slice(3));
        result(c, j ? page.jog(j) : "error: bad jog (Basic mode takes $J=[G91|G90|G53] X Y Z F)");
      } else if ((m = /^\$(?:FILES\/LISTGCODE|SD\/LIST)(?:=(.*))?$/i.exec(t))) {
        const dir = (m[1] || "/sd/").trim();
        Promise.resolve(page.files(sdPath(dir))).then((files) => {
          sendLines(c, ["[JSON:" + JSON.stringify({ files, path: dir }) + "]", "ok"]);
        }, (e) => result(c, "error: " + (e && e.message || e)));
      } else if ((m = /^\$SD\/RUN=(.+)$/i.exec(t))) later(c, page.run(sdPath(m[1].trim())));
      else if ((m = /^\$SD\/DELETE=(.+)$/i.exec(t))) later(c, page.del(sdPath(m[1].trim())));
      else result(c, `${NOT} (${t.slice(0, 40)})`);
    }
    function data(c, bytes) {
      if (c.head) {                                  // the HTTP upgrade request
        const b = new Uint8Array(c.buf.length + bytes.length);
        b.set(c.buf); b.set(bytes, c.buf.length);
        const text = dec.decode(b), e = text.indexOf("\r\n\r\n");
        if (e < 0) { c.buf = b; return; }
        const key = /^Sec-WebSocket-Key:\s*(.+)$/im.exec(text.slice(0, e));
        c.head = false;
        c.buf = b.slice(enc.encode(text.slice(0, e + 4)).length);
        if (!key) { c.onData(enc.encode("HTTP/1.1 400 Bad Request\r\n\r\n")); close(c.id); return; }
        c.onData(enc.encode("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${acceptKey(key[1])}\r\n\r\n`));
        sendText(c, "currentID:" + c.id);
        sendText(c, "CURRENT_ID:" + c.id);
        bytes = new Uint8Array(0);
      }
      const b = new Uint8Array(c.buf.length + bytes.length);
      b.set(c.buf); b.set(bytes, c.buf.length);
      const r = clientFrames(b);
      c.buf = r.rest;
      for (const f of r.frames) {
        if (f.op === 8) { close(c.id); return; }
        if (f.op === 9) { c.onData(serverFrame(10, f.data)); continue; }
        if (f.op !== 1 && f.op !== 2 && f.op !== 0) continue;
        if (f.op === 1 && dec.decode(f.data.slice(0, 5)) === "PING:") { sendText(c, "PING:60000:60000"); continue; }
        for (const by of f.data) {                     // bytes: realtime ones act at once, wherever they are (as in FluidNC);
          if (by === 0x3f || by === 0x21 || by === 0x7e || by === 0x18 || by >= 0x80) realtime(c, String.fromCharCode(by));   // >= 0x80: no UTF-8 names
          else if (by === 10 || by === 13) { const l = c.line; c.line = ""; line(c, l); }
          else c.line += String.fromCharCode(by);
        }
      }
    }
    function close(id) {
      const c = conns.get(id);
      if (!c) return;
      conns.delete(id);
      clearInterval(c.timer);
      c.onClose();
    }
    return {
      name: NAME,
      get stopped() { return stopped; },
      vconn: {
        open(port, onData, onClose) {
          if (stopped) return 0;                    // any port: FluidTouch's machine says 80
          const id = nextId++;
          conns.set(id, { id, onData, onClose, head: true, buf: new Uint8Array(0), line: "", timer: null });
          return id;
        },
        send(id, bytes) { const c = conns.get(id); if (c) data(c, bytes); },
        close(id) { const c = conns.get(id); if (c) { conns.delete(id); clearInterval(c.timer); } },
      },
      message(text) {
        const t = String(text).replace(/[[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim();   // a ] would end FluidTouch's MSG
        for (const c of conns.values()) if (!c.head) sendLines(c, [`[MSG:INFO: ${t}]`]);
      },
      stop() {
        if (stopped) return;
        for (const id of [...conns.keys()]) close(id);
        stopped = true;
      },
    };
  }

  const api = { create, sha1, acceptKey, clientFrames, serverFrame, parseJog, report, NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BasicNC = api;
})(typeof self !== "undefined" ? self : this);
