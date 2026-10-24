// FluidTouch (the pendant's firmware UI) in the page: web/fluidtouch/fluidtouch.js + .wasm (jeyeager65/FluidTouch
// `feature/wasm-sim`, sim/wasm; built by tools/build_fluidtouch_wasm.py). It connects to the FluidNC that
// js/fluidnc_sim.js runs, through FluidNC's own web server: FluidTouch's WebSocket client writes raw TCP bytes,
// which go into sim.vconn (FluidNC's virtual connections), so both ends speak the real protocol.
// FluidTouch boots with one machine, "LowRider (browser)" (sim/wasm/wasm_main.cpp), straight into its tabs.
// Like FluidNC it needs a cross-origin isolated page (pthreads) and runs in a hidden iframe, so stop() ends its workers.
//   const ft = await FluidTouchSim.start({ fluidnc: sim, base: "fluidtouch/", onPrint(line) })
//   ft.frame()            counter, changes when the screen was redrawn
//   ft.draw(ctx2d)        copy the 800 x 480 screen into a canvas (RGB565 -> RGBA)
//   ft.touch(x, y, down)  finger on the screen (screen pixels)
//   ft.stop(); ft.info = web/fluidtouch/build.json; ft.width / ft.height
// The FluidNC end may be swapped (setFluidNC(sim)) after FluidNC restarts: FluidTouch sees its socket close and
// reconnects by itself, as on a real machine.
// opts.onCommand(text): each WebSocket text frame FluidTouch sends ("$SD/Run=/sd/x.gcode", "?", "!" ...), before
// FluidNC gets it; a promise back holds that frame (and the rest of that connection) until it settles, so the page
// can get ready for a job the pendant starts.
(function (root) {
  "use strict";

  function loadScript(doc, src) {
    return new Promise((res, rej) => {
      const s = doc.createElement("script");
      s.src = (typeof lr4v === "function" ? lr4v : (u) => u)(src);   // cache busting on GitHub Pages (index.html)
      s.onload = res;
      s.onerror = () => rej(new Error("could not load " + src));
      doc.head.appendChild(s);
    });
  }

  // FluidTouch -> FluidNC on one connection: its HTTP upgrade request, then masked WebSocket client frames.
  // frames(buf) -> { frames: [[bytes, text | null]], rest } (text for whole text frames; anything else passes as is)
  const dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
  function frames(buf) {
    const out = [];
    let i = 0;
    while (buf.length - i >= 2) {
      const op = buf[i] & 15, masked = buf[i + 1] & 128;
      let len = buf[i + 1] & 127, h = 2;
      if (len === 126) { if (buf.length - i < 4) break; len = (buf[i + 2] << 8) | buf[i + 3]; h = 4; }
      else if (len === 127) { if (buf.length - i < 10) break; len = ((buf[i + 6] << 24) | (buf[i + 7] << 16) | (buf[i + 8] << 8) | buf[i + 9]) >>> 0; h = 10; }
      const k = masked ? 4 : 0;
      if (buf.length - i < h + k + len) break;
      const f = buf.slice(i, i + h + k + len);
      let text = null;
      if (op === 1 && (buf[i] & 128) && dec) {
        const pl = f.slice(h + k);
        if (masked) for (let j = 0; j < pl.length; j++) pl[j] ^= f[h + (j & 3)];
        text = dec.decode(pl);
      }
      out.push([f, text]);
      i += h + k + len;
    }
    return { frames: out, rest: buf.slice(i) };
  }

  // RGB565 (little-endian words) -> RGBA bytes
  function rgb565ToRgba(src, dst) {
    for (let i = 0, j = 0; i < src.length; i++, j += 4) {
      const p = src[i];
      const r = p >> 11, g = (p >> 5) & 63, b = p & 31;
      dst[j] = (r << 3) | (r >> 2);
      dst[j + 1] = (g << 2) | (g >> 4);
      dst[j + 2] = (b << 3) | (b >> 2);
      dst[j + 3] = 255;
    }
  }

  async function start(opts = {}) {
    if (!root.crossOriginIsolated) throw new Error("FluidTouch needs a cross-origin isolated page (SharedArrayBuffer)");
    const base = new URL(opts.base || "fluidtouch/", root.location.href).href;
    const info = await fetch((typeof lr4v === "function" ? lr4v : (u) => u)(base + "build.json")).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    let fluidnc = opts.fluidnc || null;
    const frameEl = document.createElement("iframe");
    frameEl.hidden = true;
    frameEl.setAttribute("aria-hidden", "true");
    frameEl.tabIndex = -1;
    document.body.appendChild(frameEl);
    const win = frameEl.contentWindow;
    let stopped = false, M = null;
    const conns = new Map();   // FluidTouch's id = FluidNC's vconn id -> { sim, buf, head, wait, queue }

    const toFluidTouch = (id, bytes) => {
      if (stopped || !M) return;
      const p = M._malloc(bytes.length);
      M.HEAPU8.set(bytes, p);
      M._ft_net_data(id, p, bytes.length);
      M._free(p);
    };
    const closed = (id) => { conns.delete(id); if (!stopped && M) M._ft_net_closed(id); };
    const net = {
      ftNetOpen(port) {
        if (!fluidnc || fluidnc.stopped || !fluidnc.vconn) return 0;
        const sim = fluidnc;
        const id = sim.vconn.open(port, (b) => toFluidTouch(id, b), () => closed(id));
        if (id) conns.set(id, { id, sim, buf: new Uint8Array(0), head: true, wait: null, queue: [] });
        return id;
      },
      ftNetSend(id, bytes) {
        const c = conns.get(id);
        if (!c) return;
        const b = new Uint8Array(c.buf.length + bytes.length);
        b.set(c.buf); b.set(bytes, c.buf.length);
        c.buf = b;
        if (c.head) {                                  // the upgrade request goes as it is
          let e = -1;
          for (let i = 3; i < b.length; i++) if (b[i] === 10 && b[i - 1] === 13 && b[i - 2] === 10 && b[i - 3] === 13) { e = i + 1; break; }
          if (e < 0) return;
          c.head = false;
          pass(c, b.slice(0, e), null);
          c.buf = b.slice(e);
        }
        const r = frames(c.buf);
        c.buf = r.rest;
        for (const [f, t] of r.frames) pass(c, f, t);
      },
      ftNetClose(id) { const c = conns.get(id); conns.delete(id); if (c) c.sim.vconn.close(id); },
    };
    const fwd = (c, bytes) => { if (!stopped && conns.get(c.id) === c) c.sim.vconn.send(c.id, bytes); };
    function pass(c, bytes, text) {                  // in order; a promise from onCommand holds the rest back
      if (c.wait) { c.queue.push([bytes, text]); return; }
      let r = null;
      if (text !== null && opts.onCommand) { try { r = opts.onCommand(text); } catch (e) { r = null; } }
      if (!r || typeof r.then !== "function") { fwd(c, bytes); return; }
      c.wait = Promise.resolve(r).catch(() => {}).then(() => {
        c.wait = null;
        fwd(c, bytes);
        for (const [b, t] of c.queue.splice(0)) pass(c, b, t);
      });
    }
    const print = (t) => opts.onPrint && opts.onPrint(String(t));
    try {
      await loadScript(win.document, base + "fluidtouch.js");
      M = await win.createFluidTouch(Object.assign({
        locateFile: (f) => (typeof lr4v === "function" ? lr4v : (u) => u)(base + f), print, printErr: print,
        onRestart: () => opts.onRestart && opts.onRestart(),
        onPowerOff: () => opts.onPowerOff && opts.onPowerOff(),
      }, net));
    } catch (e) { frameEl.remove(); throw e; }

    const W = M._ft_width(), H = M._ft_height();
    const fb = M._ft_framebuffer();
    let image = null;
    const ft = {
      Module: M, info, width: W, height: H,
      frame: () => (stopped ? 0 : M._ft_frame() >>> 0),
      pixels(out) {   // RGBA bytes of the current screen (out: Uint8ClampedArray of W * H * 4, optional)
        out = out || new Uint8ClampedArray(W * H * 4);
        rgb565ToRgba(M.HEAPU16.subarray(fb >> 1, (fb >> 1) + W * H), out);
        return out;
      },
      draw(ctx) {
        if (!image) image = ctx.createImageData(W, H);
        ft.pixels(image.data);
        ctx.putImageData(image, 0, 0);
      },
      touch: (x, y, down) => stopped || M._ft_touch(Math.round(x), Math.round(y), down ? 1 : 0),
      setFluidNC(sim) { fluidnc = sim; },
      stop() {
        if (stopped) return;
        stopped = true;
        for (const [id, c] of conns) c.sim.vconn.close(id);
        conns.clear();
        frameEl.remove();
      },
    };
    Object.defineProperty(ft, "stopped", { get: () => stopped });
    return ft;
  }

  const api = { start, rgb565ToRgba, frames };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FluidTouchSim = api;
})(typeof self !== "undefined" ? self : this);
