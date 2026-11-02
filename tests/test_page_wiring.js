// Part 51a in headless Chrome: the wiring. The stand-in Jackpot board inside the box (the user's own board is never in
// the public data), Layers > Wiring: a line per run (but the mains to the wall), the core's runs along the cable
// cord / hose, the ends riding their parts (the gantry moves: the X motor's end moves with it, the board's stays), hover
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
    ok(b.by["x-motor"].len > 2 * b.by["y0-motor"].len, `the core's X motor along the cord / hose (${b.by["x-motor"].len} mm) - longer than the near Y0's straight line (${b.by["y0-motor"].len})`);
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
    // 51b: the routes over the travel - the far side's motors reach on lead + extender, the near ones on their lead; the
    // Y1 run passes every brace from its end to the box; the pose is put back after
    const e = await page.val(`(() => { const before = [HOME.pose.x, HOME.pose.y, HOME.pose.z].join(), r = LR4WiringView.report(), by = Object.fromEntries(r.map((q) => [q.id, q]));
      const p = wrPath(LR4Wiring.RUNS.find((q) => q.id === "y1-motor"));
      return { y1: by["y1-motor"], y0: by["y0-motor"], pts: p.length, braces: meshes.filter((m) => /^Brace_/.test(m.userData.name) && !/__/.test(m.userData.name)).length, back: before === [HOME.pose.x, HOME.pose.y, HOME.pose.z].join() }; })()`);
    ok(e.y1.reaches && e.y0.reaches && e.y1.worst > 2 * e.y0.worst, `26 x 50: Y1 reaches on lead + extender (${e.y1.need} of ${e.y1.have} mm), Y0 on its lead (${e.y0.need} of ${e.y0.have})`);
    ok(e.pts >= e.braces + 2 - 1 && e.back, `Y1 routed out its YZ plate + along the braces to the box (${e.pts} points, ${e.braces} braces); the pose put back`);
    // the joins: one taped join per extender (the core, Y1, Z1), on its run
    const jn = await page.val(`(() => { const js = WR.joins ? WR.joins.children : []; return { n: js.length, vis: js.every((j) => j.visible),
      far: js.map((j) => Math.round(j.position.distanceTo(wrEnd(LR4Wiring.RUNS.find((r) => r.id === j.userData.run).from)))) }; })()`);
    ok(jn.n === 3 && jn.vis && jn.far.every((d) => d > 100 && d < 700), `3 taped joins (lead meets extender), each 100-700 mm in a straight line from its motor (the core's loops back with the hose) (${jn.far.join(", ")})`);
    // the supply's mains: into the beam at the gantry's end nearer the supply, along the braces (user 2026-11-02; GUESS)
    const mains = await page.val(`(() => { const p = wrPath(LR4Wiring.RUNS.find((q) => q.id === "psu-ac")), psu = meshes.find((m) => m.userData.name === "PSU_24V");
      const pc = new THREE.Box3().setFromObject(psu).getCenter(new THREE.Vector3()), bs = wrBraces(), mid = (bs[0].min.x + bs[bs.length - 1].max.x) / 2;
      const pl = new THREE.Box3().setFromObject(meshes.find((m) => m.userData.name === "YZ_Plate_" + (pc.x < mid ? "Min" : "Max")));
      const ties = p.filter((v) => bs.some((bb) => Math.abs(v.distanceTo(wrTie(bb))) < 1)).length;
      return { side: pc.x < mid ? "Min" : "Max", atPlate: p.some((v) => v.x >= pl.min.x - 1 && v.x <= pl.max.x + 1 && v.y >= pl.min.y - 1 && v.y <= pl.max.y + 1), ties, free: p.free, len: Math.round(wrLen(p)) }; })()`);
    ok(mains.atPlate && mains.ties >= 1 && mains.free === 1, `the supply's mains: into the beam at the ${mains.side} end's YZ plate, ${mains.ties} brace ties (${mains.len} mm now)`);
    // the BOM: the extenders counted from the routes at this size + the endstops' own wire
    const bom = await page.val(`(() => { const t0 = performance.now(); renderBom(); const ms = performance.now() - t0;
      const rows = [...document.querySelectorAll("#bom-body tr")].map((tr) => tr.textContent);
      return { ext: rows.find((t) => /Stepper wire extension/.test(t)) || "", own: rows.find((t) => /2-wire lead for the endstops/.test(t)) || "", ms: Math.round(ms) }; })()`);
    ok(/^3\s*Stepper wire extension.*X 1, Y1 1, Z1 1/.test(bom.ext) && /X [\d.]+, Y0 [\d.]+/.test(bom.own),
      `BOM at 26 x 50: 3 extenders (X / Y1 / Z1 one each), the endstops' own wire listed (${bom.ext.slice(0, 60)} | ${bom.own.slice(0, 50)})`);
    ok(bom.ms < 2000, `the BOM with the wiring fit: ${bom.ms} ms (cached per scene after the first)`);
    await page.val(`(LR4WiringView.set(false), true)`);
    ok(await page.val("!WR.lines && !document.getElementById('lay-wiring').checked"), "off: the lines gone, the box unticked");
    ok(!(await page.val("window.__errors && window.__errors.length")), "no page errors");
  } finally { page.close(); srv.kill(); console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`); process.exit(fails ? 1 : 0); }
})();
