// Service Worker for the sandbox's Web UI windows: makes FluidNC's own web server, running in a sandbox tab, look like
// a real board to WebUI / FigUI / any web UI loaded from the virtual SD card or Flash.
// Adapted from FluidNC's FluidNC/wasm/demo/vnet-sw.js (Mitch Bradley, GPL-3.0); the demo shows FluidNC in an iframe
// of the page that runs it, this one serves a window of its own.
//
// Registered by device/index.html with scope device/. A window is device/nc/<token>/<path>: <token> names the sandbox
// tab that runs FluidNC (web/fluidnc/vnet_host.js), <path> is the address on FluidNC ("/", "/ui/figui/",
// "/sd/webui.html"). Every request such a window makes goes to FluidNC:
//   - under device/nc/<token>/  -> that path (relative URLs, as from a page at <path> on the board)
//   - any other path on this site -> the path as it is ("/command", "/files", "/sd/...": absolute URLs, as on a board)
// The worker sees those too: once it controls a window it gets all of that window's requests, in scope or not.
// Other origins (CDNs) are left alone, and so is everything outside the Web UI windows (the sandbox page itself).
//
// Each request goes to the sandbox tab as {type:'vnet-http', method, path, headers, body} + a MessagePort on which
// the tab streams back {head}, {data}..., {end}. This worker only adapts to and from the Fetch API, plus:
//   - gzip: FluidNC sends index.html.gz with Content-Encoding: gzip, and a browser doesn't decode a Response a worker
//     builds, so it's decoded here.
//   - WebSockets are invisible to Service Workers: HTML documents get device/shim.js inlined at the top of <head>,
//     replacing window.WebSocket; its sockets come here as {type:'vnet-ws-open'} + a port, passed on to the tab.
//   - No sandbox tab running FluidNC: a page that says so and retries.

const NC = new URL('nc/', self.registration.scope).pathname;   // e.g. /web/device/nc/ or /lr4-sandbox/device/nc/

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// "/web/device/nc/<token>/sd/x.html" -> "<token>"
function tokenOf(pathname) {
  if (!pathname.startsWith(NC)) return null;
  const t = pathname.slice(NC.length).split('/')[0];
  return t || null;
}

// Posts msg to a client with a reply port; resolves to the reply, or null if none comes in time.
function ask(client, msg, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    const timer = setTimeout(() => { port1.close(); resolve(null); }, timeoutMs);
    port1.onmessage = (e) => { clearTimeout(timer); port1.close(); resolve(e.data); };
    client.postMessage(msg, [port2]);
  });
}

// The sandbox tab for a token: the one that owns it, or, if that tab is gone (closed, or a new tab), the only tab
// running FluidNC. Only a tab with FluidNC running counts when looking; once found it's used while it's open (no
// round trip per request: a busy tab can take seconds to answer; if FluidNC stops there, its requests fail there).
// A cache: the browser may stop this worker.
const hostByToken = new Map();
const looking = new Map();   // token -> Promise<client | null>, so a page's first burst of requests looks once
async function findHost(token) {
  const known = hostByToken.get(token);
  const page = known && (await self.clients.get(known));
  if (page) return page;
  hostByToken.delete(token);
  if (!looking.has(token)) looking.set(token, lookForHost(token).finally(() => looking.delete(token)));
  return looking.get(token);
}
async function lookForHost(token) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const scope = new URL(self.registration.scope).pathname;
  const pages = all.filter((c) => c.frameType === 'top-level' && !new URL(c.url).pathname.startsWith(scope));
  const replies = await Promise.all(pages.map((p) => ask(p, { type: 'vnet-who-has', token }, 8000)));
  const ready = pages.map((p, i) => ({ p, r: replies[i] })).filter((x) => x.r && x.r.ready);
  const pick = ready.find((x) => x.r.mine) || (ready.length === 1 ? ready[0] : null);
  if (pick) hostByToken.set(token, pick.p.id);
  return pick ? pick.p : null;
}

const WAITING = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Waiting for the sandbox</title><meta http-equiv="refresh" content="2">
<body style="font: 15px system-ui, sans-serif; margin: 40px; color: #333; background: #f6f6f4">
<h2>Waiting for the sandbox…</h2>
<p>This window shows FluidNC's web server, and FluidNC runs in the LowRider 4 Sandbox tab. Open the sandbox in this
browser and pick <b>Run &gt; Controller &gt; Runs on FluidNC</b>; this page reloads every 2 s until it's running.</p>`;

// Fetched per document load, so an edited shim works without replacing this worker.
async function getShim() {
  const res = await fetch(new URL('shim.js', self.registration.scope), { cache: 'no-cache' });
  return res.ok ? res.text() : '';
}

// Inserts <script>prelude + shim</script> just after <head ...> (or the doctype, or at the very start), so it runs
// before any of the page's own scripts.
function injectScript(source) {
  const tag = '<script>' + source.replace(/<\/script/gi, '<\\/script') + '</script>';
  let pending = '';
  let done = false;
  function insert(text) {
    let at = 0;
    let m = /<head(\s[^>]*)?>/i.exec(text);
    if (m) at = m.index + m[0].length;
    else if ((m = /^\s*<!doctype[^>]*>/i.exec(text))) at = m[0].length;
    return text.slice(0, at) + tag + text.slice(at);
  }
  return new TransformStream({
    transform(chunk, controller) {
      if (done) { controller.enqueue(chunk); return; }
      pending += chunk;
      if (!/<head(\s[^>]*)?>/i.test(pending) && pending.length < 4096) return;   // wait for more before deciding
      controller.enqueue(insert(pending));
      pending = '';
      done = true;
    },
    flush(controller) { if (!done) controller.enqueue(insert(pending)); },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;   // CDNs etc.
  if (event.request.mode === 'navigate') {
    const token = tokenOf(url.pathname);
    if (token) event.respondWith(forward(event.request, token, url));
    return;   // device/index.html, sw.js, shim.js: the network
  }
  if (!event.clientId) return;
  event.respondWith(self.clients.get(event.clientId).then((c) => {
    const token = c && c.type === 'window' && tokenOf(new URL(c.url).pathname);
    return token ? forward(event.request, token, url) : fetch(event.request);
  }));
});

async function forward(req, token, url) {
  const own = NC + token;
  const path = (url.pathname.startsWith(own + '/') ? url.pathname.slice(own.length) : url.pathname) + url.search;
  const nav = req.mode === 'navigate';

  const host = await findHost(token);
  if (!host) {
    return nav
      ? new Response(WAITING, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      : new Response('No LowRider 4 Sandbox tab is running FluidNC', { status: 503 });
  }

  const headers = [];
  for (const [k, v] of req.headers) headers.push([k, v]);
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : null;
  const { port1, port2 } = new MessageChannel();
  host.postMessage({ type: 'vnet-http', method: req.method, path, headers, body }, body ? [port2, body] : [port2]);

  const shim = nav ? `window.__lr4Vnet = ${JSON.stringify({ base: own })};\n` + (await getShim()) : '';

  return new Promise((resolve) => {
    let controller = null;
    let resolved = false;
    const stream = new ReadableStream({
      start(c) { controller = c; },
      cancel() { port1.postMessage({ type: 'cancel' }); port1.close(); },
    });
    port1.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'head') {
        const h = new Headers();
        for (const [k, v] of m.headers) h.append(k, v);
        let bodyStream = stream;
        if (/gzip/i.test(h.get('content-encoding') || '')) {
          bodyStream = bodyStream.pipeThrough(new DecompressionStream('gzip'));
          h.delete('content-encoding');
          h.delete('content-length');
        }
        if (nav && shim && /text\/html/i.test(h.get('content-type') || '')) {
          bodyStream = bodyStream.pipeThrough(new TextDecoderStream()).pipeThrough(injectScript(shim)).pipeThrough(new TextEncoderStream());
          h.delete('content-length');
        }
        const noBody = req.method === 'HEAD' || [204, 205, 304].includes(m.status);
        resolved = true;
        resolve(new Response(noBody ? null : bodyStream, { status: m.status, statusText: m.statusText, headers: h }));
      } else if (m.type === 'data') {
        controller.enqueue(new Uint8Array(m.data));
      } else if (m.type === 'end') {
        controller.close();
        port1.close();
      } else if (m.type === 'error') {
        if (resolved) controller.error(new Error(m.message));
        else if (m.waiting && nav) resolve(new Response(WAITING, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        else resolve(new Response(m.message, { status: m.waiting ? 503 : 502 }));
        port1.close();
      }
    };
  });
}

// WebSockets from device/shim.js: {type:'vnet-ws-open', token, path, protocols} + a port -> the sandbox tab
self.addEventListener('message', (event) => {
  const m = event.data;
  if (!m || m.type !== 'vnet-ws-open' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(findHost(m.token).then((host) => {
    if (host) host.postMessage({ type: 'vnet-ws-open', path: m.path, protocols: m.protocols }, [port]);
    else { port.postMessage({ type: 'close', code: 1006, reason: 'no sandbox tab running FluidNC' }); port.close(); }
  }));
});
