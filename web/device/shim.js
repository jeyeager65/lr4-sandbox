// WebSocket stand-in for a web UI in a sandbox Web UI window; device/sw.js inlines it at the top of every HTML
// document it serves from FluidNC, after `window.__lr4Vnet = { base: "/.../device/nc/<token>" }`.
// Adapted from FluidNC's FluidNC/wasm/demo/vnet-ws-shim.js (Mitch Bradley, GPL-3.0).
//
// A Service Worker can't see WebSockets, so this replaces window.WebSocket with an object that behaves the same but
// carries the connection over a MessagePort - handed to device/sw.js, which passes it to the sandbox tab
// (web/fluidnc/vnet_host.js), which runs the real WebSocket protocol against FluidNC's web server.
// Only URLs that point at "the device" are redirected: this page's own host on any port (WebUI 3 uses the page's
// port + 2, FigUI the port from [ESP800]), <name>.local, and VirtualNet's 192.168.0.1. Anything else gets a real one.
//
// Links and window.open to the device by an absolute path ("/", "/files") stay in the window: they go to
// <base><path>, which the worker serves from FluidNC (a plain "/x" would leave the worker's scope).

(function () {
  if (window.__lr4VnetShim || !window.__lr4Vnet) return;
  window.__lr4VnetShim = true;

  const base = window.__lr4Vnet.base;
  const token = base.split('/').pop();
  const RealWebSocket = window.WebSocket;
  const isDevice = (u) => u.hostname === location.hostname || /\.local$/i.test(u.hostname) || u.hostname === '192.168.0.1';
  // where a device URL loads in this window
  const inWindow = (u) => location.origin + (u.pathname.startsWith(base + '/') ? '' : base) + u.pathname + u.search + u.hash;

  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (!/^https?:$/.test(u.protocol) || !isDevice(u)) return;
    const target = (a.target || '').toLowerCase();
    const href = inWindow(u);
    if (href === u.href && (target === '' || target === '_self')) return;   // an ordinary link
    e.preventDefault();
    if (target === '' || target === '_self') location.href = href;
    else window.open(href, a.target);
  });

  const realOpen = window.open;
  window.open = function (url, target, features) {
    if (url) {
      const u = new URL(url, location.href);
      if (/^https?:$/.test(u.protocol) && isDevice(u)) return realOpen.call(this, inWindow(u), target, features);
    }
    return realOpen.apply(this, arguments);
  };

  class VnetWebSocket extends EventTarget {
    constructor(url, protocols) {
      super();
      const u = new URL(url, location.href);
      if (!isDevice(u) || !navigator.serviceWorker || !navigator.serviceWorker.controller) return new RealWebSocket(url, protocols);
      this.url = u.href;
      this.readyState = VnetWebSocket.CONNECTING;
      this.protocol = '';
      this.extensions = '';
      this.bufferedAmount = 0;
      this._binaryType = 'blob';
      this.onopen = this.onmessage = this.onclose = this.onerror = null;

      const ch = new MessageChannel();
      this._port = ch.port1;
      this._port.onmessage = (e) => this._fromHost(e.data);
      const list = protocols == null ? [] : [].concat(protocols);
      const path = u.pathname.startsWith(base + '/') ? u.pathname.slice(base.length) : u.pathname;
      navigator.serviceWorker.controller.postMessage({ type: 'vnet-ws-open', token, path: path + u.search, protocols: list }, [ch.port2]);
    }

    get binaryType() { return this._binaryType; }
    set binaryType(v) { if (v === 'blob' || v === 'arraybuffer') this._binaryType = v; }

    _fire(type, init) {
      const ev = type === 'message' ? new MessageEvent('message', init) : type === 'close' ? new CloseEvent('close', init) : new Event(type);
      this.dispatchEvent(ev);
      const handler = this['on' + type];
      if (typeof handler === 'function') handler.call(this, ev);
    }

    _fromHost(m) {
      const origin = new URL(this.url).origin;
      switch (m.type) {
        case 'open':
          this.readyState = VnetWebSocket.OPEN;
          this.protocol = m.protocol || '';
          this._fire('open');
          break;
        case 'text':
          this._fire('message', { data: m.data, origin });
          break;
        case 'binary':
          this._fire('message', { data: this._binaryType === 'arraybuffer' ? m.data : new Blob([m.data]), origin });
          break;
        case 'error':
          this._fire('error');
          break;
        case 'close':
          if (this.readyState === VnetWebSocket.CLOSED) return;
          this.readyState = VnetWebSocket.CLOSED;
          this._fire('close', { code: m.code || 1006, reason: m.reason || '', wasClean: !!m.clean });
          this._port.close();
          break;
      }
    }

    send(data) {
      if (this.readyState === VnetWebSocket.CONNECTING) {
        throw new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError');
      }
      if (this.readyState !== VnetWebSocket.OPEN) return;
      if (typeof data === 'string') this._port.postMessage({ type: 'text', data });
      else if (data instanceof Blob) data.arrayBuffer().then((b) => this._port.postMessage({ type: 'binary', data: b }, [b]));
      else if (ArrayBuffer.isView(data)) {
        const b = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        this._port.postMessage({ type: 'binary', data: b }, [b]);
      } else if (data instanceof ArrayBuffer) {
        const b = data.slice(0);
        this._port.postMessage({ type: 'binary', data: b }, [b]);
      } else this._port.postMessage({ type: 'text', data: String(data) });
    }

    close(code, reason) {
      if (this.readyState === VnetWebSocket.CLOSING || this.readyState === VnetWebSocket.CLOSED) return;
      this.readyState = VnetWebSocket.CLOSING;
      this._port.postMessage({ type: 'close', code, reason });
    }
  }
  for (const [name, value] of [['CONNECTING', 0], ['OPEN', 1], ['CLOSING', 2], ['CLOSED', 3]]) {
    Object.defineProperty(VnetWebSocket, name, { value });
    Object.defineProperty(VnetWebSocket.prototype, name, { value });
  }
  window.WebSocket = VnetWebSocket;
})();
