// Part 51a in headless Chrome: the wiring. The stand-in Jackpot board inside the box (the user's own board is never in
// the public data), Show > Wiring: a line per run (but the mains to the wall), the core's runs along the cable
// cord / hose, the ends riding their parts (the gantry moves: the X motor's end moves with it, the board's stays), hover
// picks a run (51e: the drawn wire), Show > Wiring (Wires, X-ray parts, trace a run), the lid fan's lead + the plugs, off = gone.
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
    const DRAWN = /^(Router_Cord_Run|Core_Wires|Cable_Sleeve|PSU_LeadCable|Beam_Wires|Beam_ZipTies)$/;   // (the supply's mains cord: only with the hub)
    const moveMs = `(() => { const t = meta.travel, ts = [];
      for (let i = 0; i < 20; i++) { const f = i / 19, a = performance.now(); move([t.x[0] + (t.x[1] - t.x[0]) * f, t.y[0] + (t.y[1] - t.y[0]) * (1 - f), t.z[1]]); ts.push(performance.now() - a); }
      move([HOME.pose.x, HOME.pose.y, HOME.pose.z]); ts.sort((p, q) => p - q); return +ts[10].toFixed(1); })()`;
    const shownNow = `(() => { const v = (re) => meshes.filter((m) => re.test(m.userData.name || "")).map((m) => m.visible);
      return { drawn: v(${DRAWN}), hose: v(/^Vacuum_Hose$/) }; })()`;
    const off0 = await page.val(shownNow), ms0 = await page.val(moveMs);
    ok(off0.drawn.length >= 3 && off0.drawn.every((x) => !x) && off0.hose.length === 1 && off0.hose[0], `Wiring off: the drawn wires hidden (${off0.drawn.length}), the hose shown`);
    ok(ms0 < 15, `Wiring off: a move ${ms0} ms (budget 15)`);
    await page.val(`(() => { document.getElementById("show-wiring").click(); return true; })()`);   // Show > Wiring > Wires
    await sleep(600);
    const on1 = await page.val(shownNow), ms1 = await page.val(moveMs);
    ok(on1.drawn.every((x) => x) && on1.hose[0], `Wiring on: the drawn wires shown (${on1.drawn.length}) + the hose`);
    ok(ms1 < 40, `Wiring on: a move ${ms1} ms (budget 40)`);
    const b = await page.val(`(() => { const r = LR4WiringView.runs(), by = Object.fromEntries(r.map((q) => [q.id, q])); return { n: r.length, shown: r.filter((q) => q.shown).length, by }; })()`);
    ok(b.n === 15 && b.shown === 14 && !b.by.mains.shown, `Show > Wiring: a line per run, the mains (to the wall) not drawn (${b.shown} of ${b.n})`);
    ok(b.by["x-motor"].len > 2 * b.by["y0-motor"].len, `the core's X motor along the cord / hose (${b.by["x-motor"].len} mm) - longer than the near Y0's straight line (${b.by["y0-motor"].len})`);
    // the gantry moves 200 mm in Y: the X motor's end rides it, the board's stays (the box is on the gantry too: both move)
    const c = await page.val(`(async () => {
      const ends = () => { const l = (id) => LR4WiringView.runs().find((q) => q.id === id); return [l("x-motor").len, l("psu-dc").len]; };
      const before = ends(); move([HOME.pose.x + 150, HOME.pose.y + 200, HOME.pose.z]); await new Promise((r) => setTimeout(r, 300)); wrTick();
      return { before, after: ends() };
    })()`);
    ok(c.before[0] !== c.after[0] && Math.abs(c.before[1] - c.after[1]) < 1, `ends ride their parts: the X motor's run changes as X moves (${c.before[0]} -> ${c.after[0]}), the supply's to the board stays (${c.before[1]} -> ${c.after[1]})`);
    // 51e: hover picks the drawn wire (the straight lines are built hidden): a wire's middle on screen -> its run
    const d = await page.val(`(() => {
      const r = canvas.getBoundingClientRect(), at = (p, obj) => { const v = p.clone().applyMatrix4(obj.matrixWorld).project(camera); return LR4WiringView.pick(r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height); };
      wrTick(); const lead = meshes.find((m) => m.userData.name === "PSU_LeadCable"), cord = meshes.find((m) => m.userData.name === "PSU_MainsCord");
      const fanOk = !!WR.fan && WR.fan.visible && at(WR.fan.userData.curves[0].getPoint(0.55), WR.fan);
      return { dc: at(lead.userData.pick.getPoint(0.5), lead), ac: cord.visible || !!cord.userData.pick, fan: fanOk,
        lines: WR.lines.visible }; })()`);
    ok(d.dc === "psu-dc" && !d.ac && d.fan === "fan", `51e: hover picks the drawn wire: the 24 V lead (${d.dc}), the lid fan's lead (${d.fan}); no hub: no mains cord drawn from the e-stop panel (user 2026-11-05) (${d.ac})`);
    ok(!d.lines, "the straight lines (the old rat's nest) not drawn");
    // Show > Wiring (2026-11-05; X-ray off at first - user 2026-11-11): X-ray parts - the machine see-through (printed parts), the table and the
    // electronics solid, the sleeves clear; off puts them back. The run list: one button per drawn run; tracing one
    // outlines its wires (a tube per drawn curve), its details shown; again = off
    const xr = await page.val(`(() => { const m = (n) => wrMesh(n), op = () => [m("YZ_Plate_Min").material.opacity, m("TableBase") ? m("TableBase").material.opacity : 1, m("Y_Stepper_Min").material.opacity, HR.sleeveClear];
      const pressed = () => document.getElementById("show-xray").getAttribute("aria-pressed"), first = [pressed(), op()[0]];
      LR4WiringView.xray(true); const on = op(), chip = pressed(); LR4WiringView.xray(false); const off = op(); LR4WiringView.xray(true);
      const btns = [...document.querySelectorAll("#show-runs button[data-run]")].map((b) => b.dataset.run);
      LR4WiringView.trace("y1-motor"); wrTick(); const t = { id: LR4WiringView.traced(), hl: WR_HL.objs.length, info: /Y1 motor/.test(document.querySelector("#show-runs .wr-info").textContent) };
      LR4WiringView.trace(null); wrTick();
      return { on, off, btns, t, cleared: WR_HL.objs.length, chip, first }; })()`);
    ok(xr.first[0] === "false" && xr.first[1] === 1, `Wiring on: X-ray parts off at first (${xr.first})`);
    ok(xr.on[0] < 0.5 && xr.on[1] === 1 && xr.on[2] === 1 && xr.on[3] && xr.off[0] === 1 && !xr.off[3] && xr.chip === "true",
      `X-ray parts: the YZ plate see-through (${xr.on[0]}), the table + a stepper solid, the sleeves clear; off: back (${xr.off[0]})`);
    ok(xr.btns.length >= 13 && xr.btns.includes("fan") && xr.t.id === "y1-motor" && xr.t.hl >= 4 && xr.t.info && !xr.cleared,
      `the run list (${xr.btns.length} runs); tracing Y1 outlines its ${xr.t.hl} drawn pieces + shows its details; off clears it`);
    // 51e: the lid fan's lead - each wire from the fan's top center to the power terminal's pin, inside nothing (the box, its
    // lid, the fan, the supply); a plug on each header a wire lands on (+ the terminal's 2 screws), with Wiring
    const fan = await page.val(`(() => { const out = { ends: [], inside: {} }, box = wrMesh("Jackpot3_Box"); box.updateMatrixWorld();
      const solid = meshes.filter((m) => /^(Jackpot3_(Box|Lid|Fan)|PSU_24V)$/.test(m.userData.name || "")), bx = solid.map((m) => new THREE.Box3().setFromObject(m));
      const rc = new THREE.Raycaster(), dir = new THREE.Vector3(0.31, 0.53, 0.79).normalize();
      WR.fan.userData.curves.forEach((c, k) => {
        // its start (user 2026-11-05: the wires leave the top center under the sticker): over the sticker's middle third,
        // in its hub cap (a ray down meets the fan within 1 mm); the model's side stubs hidden
        const lb = new THREE.Box3().setFromObject(wrMesh("Jackpot3_Fan_Label")), lc = lb.getCenter(new THREE.Vector3()), ls = lb.getSize(new THREE.Vector3());
        const pin = box.localToWorld(wrTermPin(box, k).at), w = (t) => c.getPoint(t).applyMatrix4(WR.fan.matrixWorld), s0 = w(0);
        const mid = Math.max(Math.abs(s0.x - lc.x) / ls.x, Math.abs(s0.y - lc.y) / ls.y) <= 1 / 6;
        rc.set(s0, new THREE.Vector3(0, 0, -1)); const hit = rc.intersectObject(wrMesh("Jackpot3_Fan"), false)[0];
        out.ends.push(mid ? 0 : 9, hit ? +hit.distance.toFixed(2) : 99, +w(1).distanceTo(pin).toFixed(2));
        out.stub = (out.stub || 0) + (wrMesh("Jackpot3_Fan_Lead_" + (k ? "Black" : "Red")).visible ? 1 : 0);
        // (under the sticker it runs in the hub cap's channel, which the model doesn't have: the fan not checked there)
        const lab = wrMesh("Jackpot3_Fan_Label"), up = (q) => { rc.set(q.clone().setZ(400), new THREE.Vector3(0, 0, -1)); return rc.intersectObject(lab, false).length > 0; };
        for (const q0 of c.getSpacedPoints(Math.ceil(c.getLength() / 1.5))) { const q = q0.applyMatrix4(WR.fan.matrixWorld), skipFan = up(q);
          solid.forEach((m, i) => { if (!bx[i].containsPoint(q) || (skipFan && m.userData.name === "Jackpot3_Fan")) return; rc.set(q, dir); if (rc.intersectObject(m, false).length % 2) out.inside[m.userData.name] = (out.inside[m.userData.name] || 0) + 1; }); }
      });
      { const [a, b] = WR.fan.userData.curves.map((c) => c.getSpacedPoints(Math.ceil(c.getLength() / 0.5)));   // the pair side by side, never through each other
        out.gap = +Math.min(...a.map((p) => Math.min(...b.map((q) => p.distanceTo(q))))).toFixed(2); }
      out.plugs = WR.plugs ? WR.plugs.children.length : 0; out.plugsOn = !!WR.plugs && WR.plugs.visible; return out; })()`);
    ok(fan.ends.length === 6 && fan.ends.every((d, i) => d <= (i % 3 === 2 ? 2 : 1)) && !fan.stub, `51e: the lid fan's 2 wires from its top center under the sticker (the side stubs hidden: ${!fan.stub}) to the power terminal's pins (middle / on the top / pin: ${fan.ends.join(", ")} mm)`);
    ok(!Object.keys(fan.inside).length, `the fan's lead inside no box wall / lid / fan / supply (${JSON.stringify(fan.inside)})`);
    ok(fan.gap >= 1.2, `the fan's red and black side by side all the way, not through each other (closest ${fan.gap} mm apart; 1.3 = touching, 1.2 at a twist)`);
    ok(fan.plugs === 13 && fan.plugsOn, `a plug on each header a wire lands on (5 motors, 6 inputs) + the terminal's 2 screws (${fan.plugs}), shown with Wiring`);
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
    // box / lid / XZ plates / supply / hose holders (ray parity; each piece + its mesh's offset now: the curves are in the build
    // pose's frame, the page's load pose); a Y move only moves them, a Z move rebuilds only the spans plate -> beam
    const bw = await page.val(`(() => { wrTick(); const b = LR4WiringView.beam(), want = { "y0-motor": 4, "z0-motor": 4, "y0-stop": 2, "z0-stop": 2, "y1-motor": 8, "z1-motor": 8, "y1-stop": 4, "z1-stop": 4 };
      const bad = [], ends = [];
      for (const [id, n] of Object.entries(want)) { const q = b.info[id]; if (!q || q.wires !== n) bad.push(id + " " + (q ? q.wires : 0));
        else ends.push(...q.from, ...q.to.filter((d) => d !== "join")); }
      const solid = meshes.filter((m) => m.visible !== false && /^(Endstop_[YZ]_(Min|Max)$|Brace_|StrutPlate_|Jackpot3_(Box|Lid)$|(XZ|YZ)_Plate_(Min|Max)$|[YZ]_Stepper_(Min|Max)$|PSU_24V$|Hose_Holder|(Back|Front)Wheel_|RailStrip_)/.test(m.userData.name || "") && !/~thread/.test(m.userData.name));
      const boxes = solid.map((m) => new THREE.Box3().setFromObject(m));
      const rc = new THREE.Raycaster(), dir = new THREE.Vector3(0.31, 0.53, 0.79).normalize(), inside = {};
      const nb = BW.baseCurves.length - BW.plateCurves.length, dB = BW.mesh.position, dP = BW.span.position;
      for (const [cs, d] of [[BW.baseCurves.slice(0, nb).concat(BW.tieCurves, BW.sleeveCurves), dB], [BW.plateCurves.concat(BW.spanCurves, BW.sleeveSpanCurves), dP]])
      for (const c of cs) for (const q of c.getSpacedPoints(Math.ceil(c.getLength() / 4)).map((v) => v.add(d))) {   // (4 mm: the plates' meshes are big)
        solid.forEach((m, k) => { if (!boxes[k].containsPoint(q)) return; rc.set(q, dir); if (rc.intersectObject(m, false).length % 2) inside[m.userData.name] = (inside[m.userData.name] || 0) + 1; });
      }
      const P = [HOME.pose.x, HOME.pose.y, HOME.pose.z], t = meta.travel, k0 = BW.key;
      move([P[0], P[1] + 150, P[2]]); wrTick(); const yKept = BW.key === k0;
      const s0 = BW.spanKey; move([P[0], P[1], t.z[0]]); wrTick(); const zSpan = BW.key === k0 && BW.spanKey !== s0;
      // 51d: the span a rope a side - at the travel's bottom / top its ends on their pins, its length held (<= 10 % over
      // its rest: the solver gives a little against the colliders), no wire / sleeve of it inside a solid there
      const rope = { n: Object.keys(BW.ropes || {}).length, worst: 0, end: 0, inside: {} };
      for (const z of [t.z[0], t.z[1]]) {
        move([P[0], P[1], z]); wrTick();
        for (const R of Object.values(BW.ropes)) {
          const q = R.cable.points(), w = R.ss.w.clone().add(R.rel);
          rope.worst = Math.max(rope.worst, +(R.cable.length() / R.len).toFixed(3));
          rope.end = Math.max(rope.end, +Math.hypot(q[0][0] - R.ss.a.x, q[0][1] - R.ss.a.y, q[0][2] - R.ss.a.z).toFixed(2), +w.distanceTo(new THREE.Vector3(...q[q.length - 1])).toFixed(2));
        }
        const bx = solid.map((m) => new THREE.Box3().setFromObject(m)), off = BW.span.position;
        for (const c of BW.spanCurves.concat(BW.sleeveSpanCurves)) for (const q0 of c.getSpacedPoints(Math.ceil(c.getLength() / 2))) {
          const q = q0.clone().add(off);
          solid.forEach((m, k) => { if (!bx[k].containsPoint(q)) return; rc.set(q, dir); if (rc.intersectObject(m, false).length % 2) rope.inside[m.userData.name] = (rope.inside[m.userData.name] || 0) + 1; });
        }
      }
      move(P); wrTick();
      return { bad, maxEnd: Math.max(...ends), n: ends.length, ties: b.ties, braces: wrBraces().length, inside, yKept, zSpan, rope,
        shown: meshes.filter((m) => /^Beam_(Wires|ZipTies|Sleeve)/.test(m.userData.name || "")).every((m) => m.visible), sleeves: BW.sleeveCurves.length }; })()`);
    ok(!bw.bad.length && bw.maxEnd <= 2 && bw.shown, `51c: the beam's runs wire by wire, each from its part to its pin within 2 mm (${bw.n} ends, worst ${bw.maxEnd} mm${bw.bad.length ? "; wrong: " + bw.bad.join(", ") : ""})`);
    ok(bw.ties === bw.braces, `a zip tie beside each brace the bundle passes (${bw.ties} of ${bw.braces} braces)`);
    // the endstops' wires (user 2026-11-05: the kit's): each switch's red + black from its two OUTER tabs (COM + NC - V1E's
    // NC standard; within 0.8 mm of the tab metal, > 5 mm apart), each under heatshrink (a tube there)
    const sw = await page.val(`(() => { wrTick(); const out = {};
      for (const n of ["Endstop_X", "Endstop_Y_Min", "Endstop_Z_Min", "Endstop_Y_Max", "Endstop_Z_Max"]) {
        const lv = wrVerts(wrMesh(n + "_Lever")), h = [0, 1].map((k) => wrSwitchHead(n, k));
        out[n] = h.every(Boolean) ? { metal: +Math.max(...h.map((q) => Math.min(...lv.map((v) => v.distanceTo(q.pts[0]))))).toFixed(2), apart: +h[0].pts[0].distanceTo(h[1].pts[0]).toFixed(1) } : null;
      }
      return out; })()`);
    ok(Object.values(sw).every((q) => q && q.metal <= 0.8 && q.apart > 5), `51e: each endstop's 2 wires from its outer tabs (COM + NC), under heatshrink (${JSON.stringify(sw)})`);
    ok(!Object.keys(bw.inside).length, `no wire / tie / sleeve inside an endstop, a YZ plate (through its channels), a stepper, a wheel, a rail strip, a brace, the strut plate, the box, its lid, an XZ plate, the supply or a hose holder (${JSON.stringify(bw.inside)})`);
    ok(bw.sleeves === 2, `a sleeve over each side's bundle, plate -> box (${bw.sleeves})`);
    ok(bw.yKept && bw.zSpan, `a Y move only moves the beam's wires (${bw.yKept}); a Z move rebuilds only the spans (${bw.zSpan})`);
    ok(bw.rope.n === 2 && bw.rope.end <= 0.5 && bw.rope.worst <= 1.1, `51d: the span plate -> beam a rope a side (${bw.rope.n}), at Z's bottom / top its ends on their pins (${bw.rope.end} mm), its length within 10 % of its rest (worst x${bw.rope.worst})`);
    ok(!Object.keys(bw.rope.inside).length, `the span's wires / sleeve inside no solid at Z's bottom / top (${JSON.stringify(bw.rope.inside)})`);
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
    ok(await page.val("!WR.lines && document.getElementById('show-wiring').getAttribute('aria-pressed') === 'false' && document.getElementById('show-runs').hidden && wrMesh('YZ_Plate_Min').material.opacity === 1"),
      "off: the lines gone, the Wires chip off, the run list hidden, the parts solid again");
    { const s = await page.val(shownNow); ok(s.drawn.every((x) => !x) && s.hose[0], "off: the drawn wires hidden again, the hose shown"); }
    // Show > Reset (2026-11-05): wires on + a kind off + an area off + a part hidden -> all back, wires off, Reset greyed
    const rs = await page.val(`(() => { const reset = document.getElementById("show-reset"), d0 = reset.disabled;
      LR4WiringView.set(true); document.querySelector('#show-kinds button[data-kind="hardware"]').click(); document.querySelector('#show-areas button[data-asm="beam"]').click();
      hidePart(wrMesh("Core")); const d1 = reset.disabled; reset.click();
      return { d0, d1, d2: reset.disabled, off: showOff.size, wires: LR4WiringView.on(), core: wrMesh("Core").visible, chip: document.getElementById("unhide").hidden }; })()`);
    ok(rs.d0 && !rs.d1 && rs.d2 && !rs.off && !rs.wires && rs.core && rs.chip, `Show > Reset: kinds, areas, hidden parts back, wires off (${JSON.stringify(rs)})`);
    // the table hub (user 2026-11-11): Wiring off, the cords into its sockets and the hose's ground lead still show
    // (and follow a move); the other wires stay hidden
    await page.val(`(() => { document.getElementById("opt-hub").click(); return true; })()`);
    for (let i = 0; i < 300 && !(await page.val("!!wrMesh('TableHub_HoseGround') && !!wrMesh('PSU_MainsCord') && document.getElementById('status').hidden")); i++) await sleep(200);
    await sleep(500);
    const hb = await page.val(`(() => { const v = (n) => { const m = wrMesh(n); return !!m && m.visible && m.geometry.attributes.position.count > 0; };
      const end = () => { const p = wrMesh("Router_Cord_Run").geometry.attributes.position; return p.getX(0) + p.getY(0); }, e0 = end(), t = meta.travel;
      move([t.x[1], t.y[1], t.z[1]]); const e1 = end(); move([HOME.pose.x, HOME.pose.y, HOME.pose.z]);
      return { wires: LR4WiringView.on(), cord: v("Router_Cord_Run"), relief: v("Router_Cord_Relief"), psu: v("PSU_MainsCord"), gnd: v("TableHub_HoseGround"),
        core: wrMesh("Core_Wires").visible, lead: wrMesh("PSU_LeadCable").visible, moved: Math.abs(e1 - e0) > 5 }; })()`);
    ok(!hb.wires && hb.cord && hb.relief && hb.psu && hb.gnd && !hb.core && !hb.lead && hb.moved, `the hub on, Wiring off: the router cord, the supply's power cord and the hose ground shown, the cord follows a move (${JSON.stringify(hb)})`);
    ok(!(await page.val("window.__errors && window.__errors.length")), "no page errors");
  } finally { page.close(); srv.kill(); console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`); process.exit(fails ? 1 : 0); }
})();
