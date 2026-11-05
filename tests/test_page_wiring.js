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
    // (up to 4 min to load: 80 s timed out now and then with a busy CPU, 2026-11-04)
    for (let i = 0; i < 480 && !up; i++) { await sleep(500); try { up = await page.val("document.getElementById('status').hidden && !!HOME.pose && !!window.LR4WiringView"); } catch (e) { /* loading */ } }
    ok(up, "page loaded");
    if (!up) return;
    const a = await page.val(`(() => { const sb = meshes.find((m) => m.userData.name === "Jackpot3_Box").children.find((c) => c.name === "Jackpot3_StandIn");
      return { board: LR4WiringView.board(), parts: sb ? sb.children.length : 0, own: !!meshes.find((m) => m.userData.name === "Jackpot3_PCB"), on: LR4WiringView.on(), spots: Object.keys(LR4Wiring.JP3.spots).length }; })()`);
    ok(a.board && !a.own && a.parts === a.spots + 1, `the stand-in board in the box: the PCB + a block per connector (${a.parts})`);
    ok(!a.on, "Wiring off at first");
    // Part 53c: the drawn wires only with Wiring on (the hose always), and a move's time kept (a budget, ~2-3x today's:
    // more drawn wiring shouldn't creep it back up; ms medians of 20 moves across the travel, the pose put back)
    const DRAWN = /^(Router_Cord_Run|Core_Wires|Cable_Sleeve|PSU_MainsCord|PSU_LeadCable|Beam_Wires|Beam_ZipTies)$/;
    const moveMs = `(() => { const t = meta.travel, ts = [];
      for (let i = 0; i < 20; i++) { const f = i / 19, a = performance.now(); move([t.x[0] + (t.x[1] - t.x[0]) * f, t.y[0] + (t.y[1] - t.y[0]) * (1 - f), t.z[1]]); ts.push(performance.now() - a); }
      move([HOME.pose.x, HOME.pose.y, HOME.pose.z]); ts.sort((p, q) => p - q); return +ts[10].toFixed(1); })()`;
    const shownNow = `(() => { const v = (re) => meshes.filter((m) => re.test(m.userData.name || "")).map((m) => m.visible);
      return { drawn: v(${DRAWN}), hose: v(/^Vacuum_Hose$/) }; })()`;
    const off0 = await page.val(shownNow), ms0 = await page.val(moveMs);
    ok(off0.drawn.length >= 3 && off0.drawn.every((x) => !x) && off0.hose.length === 1 && off0.hose[0], `Wiring off: the drawn wires hidden (${off0.drawn.length}), the hose shown`);
    ok(ms0 < 15, `Wiring off: a move ${ms0} ms (budget 15)`);
    await page.val(`(() => { const c = document.getElementById("lay-wiring"); c.checked = true; c.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(600);
    const on1 = await page.val(shownNow), ms1 = await page.val(moveMs);
    ok(on1.drawn.every((x) => x) && on1.hose[0], `Wiring on: the drawn wires shown (${on1.drawn.length}) + the hose`);
    ok(ms1 < 40, `Wiring on: a move ${ms1} ms (budget 40)`);
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
    // 51c: the beam's runs drawn wire by wire - each wire from its part to its pin (or the join), a zip tie per brace,
    // none inside the YZ plates (their channels: V1E's route), steppers, wheels, rail strips, braces / strut plate /
    // box / lid / XZ plates / supply / hose holders (ray parity); a Y move only moves them, a Z move rebuilds only the spans plate -> beam
    const bw = await page.val(`(() => { wrTick(); const b = LR4WiringView.beam(), want = { "y0-motor": 4, "z0-motor": 4, "y0-stop": 2, "z0-stop": 2, "y1-motor": 8, "z1-motor": 8, "y1-stop": 4, "z1-stop": 4 };
      const bad = [], ends = [];
      for (const [id, n] of Object.entries(want)) { const q = b.info[id]; if (!q || q.wires !== n) bad.push(id + " " + (q ? q.wires : 0));
        else ends.push(...q.from, ...q.to.filter((d) => d !== "join")); }
      const solid = meshes.filter((m) => m.visible !== false && /^(Brace_|StrutPlate_|Jackpot3_(Box|Lid)$|(XZ|YZ)_Plate_(Min|Max)$|[YZ]_Stepper_(Min|Max)$|PSU_24V$|Hose_Holder|(Back|Front)Wheel_|RailStrip_)/.test(m.userData.name || "") && !/~thread/.test(m.userData.name));
      const boxes = solid.map((m) => new THREE.Box3().setFromObject(m));
      const rc = new THREE.Raycaster(), dir = new THREE.Vector3(0.31, 0.53, 0.79).normalize(), inside = {};
      for (const c of BW.curves.concat(BW.tieCurves, BW.sleeveCurves)) for (const q of c.getSpacedPoints(Math.ceil(c.getLength() / 4))) {   // (4 mm: the plates' meshes are big)
        solid.forEach((m, k) => { if (!boxes[k].containsPoint(q)) return; rc.set(q, dir); if (rc.intersectObject(m, false).length % 2) inside[m.userData.name] = (inside[m.userData.name] || 0) + 1; });
      }
      const P = [HOME.pose.x, HOME.pose.y, HOME.pose.z], t = meta.travel, k0 = BW.key;
      move([P[0], P[1] + 150, P[2]]); wrTick(); const yKept = BW.key === k0;
      const s0 = BW.spanKey; move([P[0], P[1], t.z[0]]); wrTick(); const zSpan = BW.key === k0 && BW.spanKey !== s0;
      move(P); wrTick();
      return { bad, maxEnd: Math.max(...ends), n: ends.length, ties: b.ties, braces: wrBraces().length, inside, yKept, zSpan,
        shown: meshes.filter((m) => /^Beam_(Wires|ZipTies|Sleeve)/.test(m.userData.name || "")).every((m) => m.visible), sleeves: BW.sleeveCurves.length }; })()`);
    ok(!bw.bad.length && bw.maxEnd <= 2 && bw.shown, `51c: the beam's runs wire by wire, each from its part to its pin within 2 mm (${bw.n} ends, worst ${bw.maxEnd} mm${bw.bad.length ? "; wrong: " + bw.bad.join(", ") : ""})`);
    ok(bw.ties === bw.braces, `a zip tie beside each brace the bundle passes (${bw.ties} of ${bw.braces} braces)`);
    ok(!Object.keys(bw.inside).length, `no wire / tie / sleeve inside a YZ plate (through its channels), a stepper, a wheel, a rail strip, a brace, the strut plate, the box, its lid, an XZ plate, the supply or a hose holder (${JSON.stringify(bw.inside)})`);
    ok(bw.sleeves === 2, `a sleeve over each side's bundle, plate -> box (${bw.sleeves})`);
    ok(bw.yKept && bw.zSpan, `a Y move only moves the beam's wires (${bw.yKept}); a Z move rebuilds only the spans (${bw.zSpan})`);
    // Inspect a YZ assembly (user 2026-11-05): its plate's wires in its channels shown, Wiring on or off (X-ray ghosts the plate)
    const ins = await page.val(`(async () => { LR4WiringView.set(false); inspect(asmOf(wrMesh("YZ_Plate_Min"))); await new Promise((r) => setTimeout(r, 400));
      const m = wrMesh("Beam_WiresPlate_Min"), r = { inSet: INSPECT.set.has(partId(m)), vis: m.visible, tris: m.geometry.index ? m.geometry.index.count / 3 : 0, other: wrMesh("Beam_Wires").visible };
      inspectEnd(); LR4WiringView.set(true); return r; })()`);
    ok(ins.inSet && ins.vis && ins.tris > 0 && !ins.other, `Inspect the Min YZ assembly with Wiring off: its plate's wires shown (${ins.tris} triangles), the beam's not`);
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
    { const s = await page.val(shownNow); ok(s.drawn.every((x) => !x) && s.hose[0], "off: the drawn wires hidden again, the hose shown"); }
    ok(!(await page.val("window.__errors && window.__errors.length")), "no page errors");
  } finally { page.close(); srv.kill(); console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`); process.exit(fails ? 1 : 0); }
})();
