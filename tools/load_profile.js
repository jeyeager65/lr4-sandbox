// A CPU profile of the page's warm reload (the part files already kept in IndexedDB, as a returning user): the load's
// stage times, inclusive time of the named functions and the top functions by self time.
//   node tools/load_profile.js [--fn a,b,...] [--top N] [--out profile.cpuprofile]     (serves the repo; needs Chrome + parts/)
// The .cpuprofile opens in Chrome DevTools' Performance panel.
"use strict";
const fs = require("fs");
const { CHROME, sleep, server, chromePage } = require("../tests/test_page_fluidnc.js");

const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const FNS = opt("--fn", "warmGeometry,recGeometry,srcGeometry,soup,readSTL,place,bend,components,honeyGeo,dxfGeo,soupGeo,liteGeo,dress,entry,creaseNormals,toNonIndexed,setupSize").split(",");
const TOP = +opt("--top", 25), OUT = opt("--out", null);

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100), { gpu: true });
  const loaded = async () => {
    for (let i = 0; i < 600; i++) {
      await sleep(200);
      try { if (await page.val("!!window.LR4Director && !!LR4Ctl.travel() && document.getElementById('status').hidden")) break; } catch (e) { /* loading */ }
    }
    return page.val("(window.LR4LoadTimes || []).map(([k, v]) => [k, Math.round(v)])");
  };
  try {
    await sleep(800);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    await loaded();                                  // the first visit: the files fetched + kept
    await sleep(1500);
    await page.send("Profiler.enable");
    await page.send("Profiler.setSamplingInterval", { interval: 200 });
    await page.send("Profiler.start");
    await page.send("Page.reload", {});
    const stages = await loaded();
    const { profile } = await page.send("Profiler.stop");
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(profile));
    console.log("stages:", stages.map(([k, v]) => `${k} ${v}`).join(" | "));
    // samples per node; a node's time = its samples x the mean interval
    const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map();
    for (const s of profile.samples) self.set(s, (self.get(s) || 0) + 1);
    const ms = (profile.endTime - profile.startTime) / 1000 / profile.samples.length;
    const name = (n) => n.callFrame.functionName || "(anon)";
    const where = (n) => `${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
    // inclusive per function name: a subtree counted once even when the name recurs inside it
    const incl = new Map(FNS.map((f) => [f, 0]));
    const walk = (n, open) => {
      const f = name(n), mine = incl.has(f) && !open.has(f);
      if (mine) open = new Set(open).add(f);
      for (const g of open) incl.set(g, incl.get(g) + (self.get(n.id) || 0));
      for (const c of n.children || []) walk(byId.get(c), open);
    };
    walk(profile.nodes[0], new Set());
    console.log("\ninclusive (ms):");
    for (const [f, n] of incl) if (n) console.log(`  ${(n * ms).toFixed(0).padStart(6)}  ${f}`);
    const selfBy = new Map();
    for (const n of profile.nodes) { const k = `${name(n)}  ${where(n)}`; selfBy.set(k, (selfBy.get(k) || 0) + (self.get(n.id) || 0)); }
    console.log(`\ntop ${TOP} self (ms):`);
    for (const [k, n] of [...selfBy].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(`  ${(n * ms).toFixed(0).padStart(6)}  ${k}`);
  } finally {
    await page.close();
    srv.kill();
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
