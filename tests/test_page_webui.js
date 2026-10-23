// Web UIs (Part 30): a tiny web UI on the virtual SD card (tinyui.html.gz) and one on the Flash (index.html) open in
// windows of their own (web/device/ + web/fluidnc/vnet_host.js), served by the page's FluidNC web server: the Web UIs
// list names them by <title>, Open opens /sd/tinyui.html (WebDAV sends the .gz), its /command reaches FluidNC and a
// G0 moves the machine, its WebSocket (page port + 2, as WebUI 3 does it) opens and gets messages, a WebDAV PUT from
// the window lands on the page's SD card list, and the Flash's index.html opens at /.
//   node tests/test_page_webui.js [headers|plain]   (both by default; not in npm test: needs Chrome + Python)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

const MODES = process.argv[2] ? [process.argv[2]] : ["headers", "plain"];
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const TINY = `<!doctype html><html><head><title>Tiny UI</title></head><body><pre id="o">tiny</pre><script>
window.TINY = { ws: [], open: false, cmd: null, err: null };
const ws = new WebSocket("ws://" + location.hostname + ":" + (Number(location.port || 80) + 2) + "/", ["arduino"]);
ws.onopen = () => { TINY.open = true; };
ws.onmessage = (e) => { TINY.ws.push(typeof e.data === "string" ? e.data : "[binary]"); };
fetch("/command?plain=" + encodeURIComponent("$I")).then((r) => r.text()).then((t) => { TINY.cmd = t; }, (e) => { TINY.err = String(e); });
</script></body></html>`;
const FLASH_UI = `<!doctype html><html><head><title>Flash UI</title></head><body>flash</body></html>`;

// a CDP session on another tab of the same Chrome (the Web UI window)
async function attach(cport, match) {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    target = (await (await fetch(`http://127.0.0.1:${cport}/json`)).json()).find((t) => t.type === "page" && match(t.url));
  }
  if (!target) return null;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const val = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { url: target.url, val, close: () => ws.close() };
}

async function run(mode) {
  console.log(`${mode}:`);
  const port = 8790 + Math.floor(Math.random() * 100), srv = server(mode, port);
  const cport = 9300 + Math.floor(Math.random() * 500);
  const page = await chromePage(cport);
  let win = null;
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let iso = false;
    for (let i = 0; i < 120 && !iso; i++) {
      await sleep(500);
      try { iso = await page.val("window.crossOriginIsolated === true && !!window.LR4Ctl && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* reloading */ }
    }
    ok(iso, "page is cross-origin isolated and loaded");
    if (!iso) return;
    await page.val(HELPERS);

    // the UIs onto the card / Flash (kept in this browser), then FluidNC mode boots with them
    const a = await page.val(`(async () => {
      const gz = new Uint8Array(await new Response(new Blob([${JSON.stringify(TINY)}]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
      await SdCard.store.put("/tinyui.html.gz", gz);
      await SdCard.flash.store.put("/index.html", ${JSON.stringify(FLASH_UI)});
      document.getElementById("t-run").click();
      document.querySelector('#ctl-mode [data-v="fluidnc"]').click();
      const sim = await T.booted(null);
      if (!sim) return { err: "FluidNC didn't boot" };
      const rows = await T.until(() => { const r = [...document.querySelectorAll("#ui-list .sd-row")]; return r.length >= 2 && r.every((x) => !x.querySelector("button").disabled) ? r : null; }, 10000);
      return { vnet: !!window.LR4Vnet, rows: (rows || []).map((r) => r.querySelector(".sd-name").textContent + " @ " + r.querySelector("small").textContent) };
    })()`);
    if (a.err) { ok(false, a.err); return; }
    ok(a.vnet, "the page serves Web UI windows (VnetHost.serve)");
    ok(a.rows.includes("Tiny UI @ /sd/tinyui.html") && a.rows.includes("Flash UI @ /"), `Web UIs list: ${a.rows.join(", ")}`);

    // Open (a click = user gesture, so no pop-up blocker)
    await page.send("Runtime.evaluate", { userGesture: true, expression:
      `[...document.querySelectorAll("#ui-list .sd-row")].find((r) => /tinyui/.test(r.querySelector("small").textContent)).querySelector("button").click()` });
    win = await attach(cport, (u) => /\/device\/nc\/[A-Za-z0-9]+\/sd\/tinyui\.html$/.test(u));
    ok(!!win, `a window opens at ${win ? win.url.replace(/^https?:\/\/[^/]+/, "") : "?"}`);
    if (!win) return;
    let b = null;
    for (let i = 0; i < 80 && !(b && b.title === "Tiny UI" && b.cmd && b.open && b.ws.length); i++) {
      await sleep(250);
      try { b = await win.val(`({ title: document.title, cmd: window.TINY && TINY.cmd, err: window.TINY && TINY.err, open: window.TINY && TINY.open, ws: window.TINY ? TINY.ws.slice(0, 5) : [] })`); } catch (e) { /* loading */ }
    }
    b = b || {};
    ok(b.title === "Tiny UI", `the window shows the card's tinyui.html.gz (title "${b.title}")`);
    ok(/^\[VER:.*FluidNC/.test(b.cmd || ""), `its /command?plain=$I reaches FluidNC: ${JSON.stringify((b.cmd || b.err || "").slice(0, 80))}`);
    ok(b.open && b.ws.length > 0, `its WebSocket (page port + 2) opens and gets messages: ${JSON.stringify(b.ws || []).slice(0, 100)}`);

    // the UI drives the machine
    const m0 = await page.val(`(async () => (await LR4FluidNC.status()).MPos)()`);
    await win.val(`fetch("/command?plain=" + encodeURIComponent("G0 X20 Y10")).then((r) => r.text())`);
    await page.val(`T.idle()`);
    const m1 = await page.val(`(async () => (await LR4FluidNC.status()).MPos)()`);
    ok(Math.abs(m1[0] - m0[0] - 20) < 0.01 && Math.abs(m1[1] - m0[1] - 10) < 0.01, `G0 X20 Y10 from the window moves the machine: MPos ${m0} -> ${m1}`);

    // a WebDAV upload from the window lands on the page's SD card
    const put = await win.val(`fetch("/sd/fromui.gcode", { method: "PUT", body: "G0 X1\\n" }).then((r) => r.status)`);
    const listed = await page.val(`T.until(() => LR4Job.files().includes("/fromui.gcode"), 5000).then((v) => !!v)`);
    ok(put >= 200 && put < 300 && listed, `PUT /sd/fromui.gcode from the window (${put}) shows in the page's SD card list`);

    // the Flash's index.html at /
    await win.val(`location.href = window.__lr4Vnet.base + "/"; true`);
    let t = "";
    for (let i = 0; i < 40 && t !== "Flash UI"; i++) { await sleep(250); try { t = await win.val("document.title"); } catch (e) { /* loading */ } }
    ok(t === "Flash UI", `/ in the window is the Flash's index.html (title "${t}")`);

    // folders: New folder on the SD card (and adding into it), one a web UI makes over WebDAV, one on the Flash
    const f = await page.val(`(async () => {
      window.prompt = () => "jobs"; window.confirm = () => true;
      document.getElementById("sd-mkdir").click();
      await T.until(() => [...document.querySelectorAll("#sd-list .sd-dir .sd-name")].some((n) => n.textContent === "jobs/"), 5000);
      const dt = new DataTransfer(); dt.items.add(new File(["G0 X1\\n"], "in_jobs.gcode"));
      const input = document.getElementById("job-file"); input.files = dt.files; input.dispatchEvent(new Event("change"));
      await T.until(() => LR4Job.files().includes("/jobs/in_jobs.gcode"), 5000);
      [...document.querySelectorAll("#sd-list .sd-dir .sd-name")].find((n) => n.textContent === "jobs/").click();   // back to the top
      window.prompt = () => "flashdir";
      document.getElementById("flash-mkdir").click();
      await T.until(() => [...document.querySelectorAll("#flash-list .sd-dir .sd-name")].some((n) => n.textContent === "flashdir/"), 5000);
      const FS = LR4FluidNC.FS, isDir = (p) => { try { return FS.isDir(FS.stat(p).mode); } catch (e) { return false; } };
      return { dirs: await SdCard.store.dirs(), flash: await SdCard.flash.store.dirs(), live: isDir("/native_sd/jobs") && isDir("/native_localfs/flashdir"),
        file: (() => { try { return FS.readFile("/native_sd/jobs/in_jobs.gcode", { encoding: "utf8" }); } catch (e) { return null; } })() };
    })()`);
    ok(f.dirs.includes("/jobs") && f.flash.includes("/flashdir") && f.live, `New folder on the SD card and the Flash (store ${f.dirs} / ${f.flash}, FluidNC sees them: ${f.live})`);
    ok(f.file === "G0 X1\n",`a file added with /jobs picked goes in it (/jobs/in_jobs.gcode on FluidNC's card)`);
    const mk = await win.val(`fetch("/sd/made_by_ui", { method: "MKCOL" }).then((r) => r.status)`);
    const seen = await page.val(`(async () => { for (let i = 0; i < 50; i++) { if ((await SdCard.store.dirs()).includes("/made_by_ui")) return true; await T.sleep(100); } return false; })()`);
    ok(mk >= 200 && mk < 300 && seen, `MKCOL /sd/made_by_ui from the window (${mk}): the empty folder is kept on the page's SD card`);

    // back to Basic: the window says it's waiting for the sandbox
    await page.val(`document.querySelector('#ctl-mode [data-v="play"]').click(); true`);
    await win.val(`location.reload(); true`);
    t = "";
    for (let i = 0; i < 40 && !/Waiting/.test(t); i++) { await sleep(250); try { t = await win.val("document.title"); } catch (e) { /* loading */ } }
    ok(/Waiting for the sandbox/.test(t), `with FluidNC off the window shows "${t}"`);

    // adding a release (index.html.gz) to the SD card: its own /ui/<name>/ folder; UI files on the card aren't jobs
    const c = await page.val(`(async () => {
      const gz = new Uint8Array(await new Response(new Blob([${JSON.stringify(TINY)}]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
      const dt = new DataTransfer(); dt.items.add(new File([gz], "index.html.gz"));
      const input = document.getElementById("ui-file-sd"); input.files = dt.files; input.dispatchEvent(new Event("change"));
      const row = await T.until(() => [...document.querySelectorAll("#ui-list .sd-row small")].find((s) => s.textContent === "/ui/tiny-ui/"), 5000);
      const sdRow = [...document.querySelectorAll("#sd-list .sd-row")].find((r) => /tinyui/.test(r.textContent));
      return { row: !!row, play: sdRow ? [...sdRow.querySelectorAll("button")].some((b) => b.textContent === "▶") : null, job: LR4Job.src() && LR4Job.src().name };
    })()`);
    ok(c.row, "index.html.gz added to the SD card goes to /ui/tiny-ui/ (served at /ui/tiny-ui/)");
    ok(c.play === false && !/html/.test(c.job || ""), `a web UI on the SD card has no ▶ and isn't loaded as the job (job: ${c.job || "none"})`);

    // Open in Basic: switches to FluidNC, and the waiting window comes up with the UI
    await page.send("Runtime.evaluate", { userGesture: true, expression:
      `[...document.querySelectorAll("#ui-list .sd-row")].find((r) => /tinyui/.test(r.querySelector("small").textContent)).querySelector("button").click()` });
    const mode = await page.val(`T.booted(null).then(() => LR4Ctl.mode ? LR4Ctl.mode() : document.querySelector('#ctl-mode [aria-pressed="true"]').dataset.v)`);
    // (a new window: the first one, now at /, left the page's browsing context group, so its name isn't reused)
    const win2 = await attach(cport, (u) => /\/device\/nc\/[A-Za-z0-9]+\/sd\/tinyui\.html$/.test(u));
    t = "";
    for (let i = 0; win2 && i < 80 && t !== "Tiny UI"; i++) { await sleep(250); try { t = await win2.val("document.title"); } catch (e) { /* reloading */ } }
    if (win2) win2.close();
    ok(mode === "fluidnc" && t === "Tiny UI", `Open in Basic switches to FluidNC (${mode}) and the window comes up ("${t}")`);

    // the restarted FluidNC has the empty folders; ✕ on a folder deletes it and what's in it
    const g = await page.val(`(async () => {
      const FS = LR4FluidNC.FS, isDir = (p) => { try { return FS.isDir(FS.stat(p).mode); } catch (e) { return false; } };
      const after = isDir("/native_sd/made_by_ui") && isDir("/native_localfs/flashdir");
      const row = [...document.querySelectorAll("#sd-list .sd-dir")].find((r) => r.querySelector(".sd-name").textContent === "jobs/");
      row.querySelector(".sd-act").click();
      await T.until(() => !LR4Job.files().includes("/jobs/in_jobs.gcode"), 5000);
      return { after, why: [isDir("/native_sd/made_by_ui"), isDir("/native_localfs/flashdir"), FS.readdir("/native_sd").join(" "), (await SdCard.store.dirs()).join(" ")], gone: !isDir("/native_sd/jobs") && !(await SdCard.store.dirs()).includes("/jobs") && !LR4Job.files().includes("/jobs/in_jobs.gcode") };
    })()`);
    ok(g.after, `empty folders are back on the card and Flash after FluidNC restarts${g.after ? "" : " " + JSON.stringify(g.why)}`);
    ok(g.gone, "✕ on /jobs deletes the folder and its file (store and FluidNC)");
  } finally {
    if (win) win.close();
    await page.close();
    srv.kill();
  }
}

if (require.main === module) (async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  for (const m of MODES) await run(m);
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
