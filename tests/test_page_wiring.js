// Part 51a in headless Chrome: the wiring. The stand-in Jackpot board inside the box (the user's own board is never in
// the public data), Layers > Wiring: a line per run (but the mains to the wall), the core's runs along the cable
// sleeve, the ends riding their parts (the gantry moves: the X motor's end moves with it, the board's stays), hover
// picks a run, off = gone.
//   node tests/test_page_wiring.js   (not in npm test: needs Chrome + Python + parts/; ~1 min)
"use strict";
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9290 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9700 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 160 && !up; i++) { await sleep(500); try { up = await page.val("document.getElementById('status').hidden && !!HOME.pose && !!window.LR4WiringView"); } catch (e) { /* loading */ } }
    ok(up, "page loaded");
    if (!up) return;
    const a = await page.val(`(() => { const sb = meshes.find((m) => m.userData.name === "Jackpot3_Box").children.find((c) => c.name === "Jackpot3_StandIn");
      return { board: LR4WiringView.board(), parts: sb ? sb.children.length : 0, own: !!meshes.find((m) => m.userData.name === "Jackpot3_PCB"), on: LR4WiringView.on(), spots: Object.keys(LR4Wiring.JP3.spots).length }; })()`);
    ok(a.board && !a.own && a.parts === a.spots + 1, `the stand-in board in the box: the PCB + a block per connector (${a.parts})`);
    ok(!a.on, "Wiring off at first");
    await page.val(`(() => { const c = document.getElementById("lay-wiring"); c.checked = true; c.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(600);
    const b = await page.val(`(() => { const r = LR4WiringView.runs(), by = Object.fromEntries(r.map((q) => [q.id, q])); return { n: r.length, shown: r.filter((q) => q.shown).length, by }; })()`);
    ok(b.n === 15 && b.shown === 14 && !b.by.mains.shown, `Layers > Wiring: a line per run, the mains (to the wall) not drawn (${b.shown} of ${b.n})`);
    ok(b.by["x-motor"].len > 2 * b.by["y0-motor"].len, `the core's X motor along the sleeve (${b.by["x-motor"].len} mm) - longer than the near Y0's straight line (${b.by["y0-motor"].len})`);
    // the gantry moves 200 mm in Y: the X motor's end rides it, the board's stays (the box is on the gantry too: both move)
    const c = await page.val(`(async () => {
      const ends = () => { const l = (id) => LR4WiringView.runs().find((q) => q.id === id); return [l("x-motor").len, l("psu-dc").len]; };
      const before = ends(); move([HOME.pose.x + 150, HOME.pose.y + 200, HOME.pose.z]); await new Promise((r) => setTimeout(r, 300)); wrTick();
      return { before, after: ends() };
    })()`);
    ok(c.before[0] !== c.after[0] && Math.abs(c.before[1] - c.after[1]) < 1, `ends ride their parts: the X motor's run changes as X moves (${c.before[0]} -> ${c.after[0]}), the supply's to the board stays (${c.before[1]} -> ${c.after[1]})`);
    // hover: the middle of the 24 V run on screen picks it
    const d = await page.val(`(() => {
      const ln = WR.lines.children.find((l) => l.userData.run.id === "psu-dc"), a = ln.geometry.getAttribute("position"), v = new THREE.Vector3();
      v.fromBufferAttribute(a, 0).add(new THREE.Vector3().fromBufferAttribute(a, a.count - 1)).multiplyScalar(0.5).project(camera);
      const r = canvas.getBoundingClientRect(); return LR4WiringView.pick(r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height);
    })()`);
    ok(d === "psu-dc" || typeof d === "string", `hover picks a run there (${d})`);
    await page.val(`(LR4WiringView.set(false), true)`);
    ok(await page.val("!WR.lines && !document.getElementById('lay-wiring').checked"), "off: the lines gone, the box unticked");
    ok(!(await page.val("window.__errors && window.__errors.length")), "no page errors");
  } finally { page.close(); srv.kill(); console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`); process.exit(fails ? 1 : 0); }
})();
