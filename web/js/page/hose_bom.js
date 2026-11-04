// lr4-sandbox page, part 9 of 14: the vacuum hose, the BOM, picking.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- vacuum hose: clamped in the Min-end holder; between the clamp and the core it folds like a drag
  // chain (lower run in the trays, U-turn, upper run on top back to the core), so it is re-swept for every
  // pose. hoseRoute mirrors lr4.hose_route (Python) - keep the two in step. ----
  let hoseMesh = null, hoseWire = null;
  function hoseRoute(h, dx, dz) {
    const r = h.od / 2, od = h.od, R = h.loop_r;
    const px = h.port[0] + dx, py = h.port[1], pz = h.port[2] - h.cuff_in;
    const ztop = h.top + h.clear + r;
    const ty = h.tray_y, tz = h.tray_z, [x0, x1, zl] = h.bump, zb = Math.max(zl + r + 2.0, tz);
    const xa = h.clamp_x, xn = h.bump_next;
    const trayZ = (x) => {
      if (x >= xa && x < x0) return tz + (zb - tz) * (x - xa) / (x0 - xa);
      if (x >= x0 && x <= x1) return zb;
      if (x > x1 && x < xn) return zb + (tz - zb) * (x - x1) / (xn - x1);
      return tz;
    };
    const runXs = (hi, lo) => {
      const cor = [xn, x1, x0, xa], xs = [];
      const brk = [xn - 30, xn + 30, x1 - 30, x1 + 30, x0 + 30, xa].filter((b) => lo <= b && b < hi);
      for (let x = hi; x > lo; x -= h.pitch) if (cor.every((b) => Math.abs(x - b) > 40) && brk.every((b) => Math.abs(x - b) > 25)) xs.push(x);
      return xs.concat(brk).sort((a, b) => b - a);
    };
    const Rb = h.rise_r, T = h.turn, L = h.out_dx, zc = h.over_z, yh = h.tie_y, zr = h.tie_z;
    // Part 53 (page only - lr4.hose_route still has the old rise + turn; 53c drops the FreeCAD hose; user 2026-11-02):
    // out of the shoe's socket, pulled in snug against the upper router mount's arm at its zip tie (TIE.mount.at: the
    // hose's axis there), then round the router's head on its left (-X) side and up to the core's tie line, straight
    // along X from just before the first zip tie - a Bezier, its end at socket X + 5
    const M = [px + TIE.mount.at[0], py + TIE.mount.at[1], pz + TIE.mount.dz], tie0 = px + TIE.core.dx[0] - 50;   // 50 mm straight into the 1st tie
    const pts = [[px, py, pz, "core"], [px, py, pz + 30, "core"], M.concat("core")];   // straight up out of the socket, then to the tie
    // over the top of the strain relief (user 2026-11-02), not out past it: up the head's front-left corner, then back
    // ... bulging out to the left in plan (user: "more of a curve" from above), over the relief
    // level across (no hump - user 2026-11-02), just over the relief, then one bend down to the mount
    const P0 = M, P1 = [M[0] - 35, M[1] + 20, zr + 44], P2 = [tie0 - 110, yh - 45, zr + 31], P3 = [tie0, yh, zr];
    for (let k = 1; k <= 10; k++) {
      const u = k / 10, v = 1 - u, b = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
      pts.push([0, 1, 2].map((q) => b[0] * P0[q] + b[1] * P1[q] + b[2] * P2[q] + b[3] * P3[q]).concat("core"));
    }
    const xe = px + h.core_end_dx, zt = zr;
    const ch = h.uturn_gap, Ld = L, xu = Math.max(xe + ch, (h.run + xa + xe) / 2), g = xu - xe;
    const Ly = Math.min(L, g), Af = (Ly / L) ** 2, dip = Math.min(1, (g / (2 * Ld)) ** 2);
    const [ry, rz, rr] = h.rail_up;
    const nest = (zl) => {                       // on the lower hose (ty, zl), against the upper X rail
      const ay = ty, az = zl, ra = od + 1.0, rb = r + rr + 1.0, d = Math.hypot(ry - ay, rz - az);
      const a_ = (ra * ra - rb * rb + d * d) / (2 * d), hh = Math.sqrt(Math.max(ra * ra - a_ * a_, 0));
      const py_ = ay + a_ * (ry - ay) / d, pz_ = az + a_ * (rz - az) / d;
      return [py_ + hh * (rz - az) / d, pz_ - hh * (ry - ay) / d];
    };
    const S = (q) => (1 - Math.cos(Math.PI * Math.min(Math.max(q, 0), 1))) / 2;
    const S5 = (q) => { const v = Math.min(Math.max(q, 0), 1); return v * v * v * (v * (6 * v - 15) + 10); };
    const yu = yh + (nest(trayZ(xu))[0] - yh) * Af;
    const reach = (x0) => Math.min(1, Math.max(0, (xu + R + r - x0 + 40) / 40));
    let zu = zt;
    for (const [x0, x1, ey, ez0, fr] of h.plates) {
      const ez = fr === "gantry" ? ez0 - dz : ez0;
      if (ez + r + 3 > zt) zu = Math.max(zu, zt + (ez + r + 3 - zt) * reach(x0));
    }
    const dyz = [ty - yu, tz - zu], Lc = Math.hypot(dyz[0], dyz[1]);
    const u = [dyz[0] / Lc, dyz[1] / Lc], nv = [-u[1], u[0]];
    let bulge = 0;
    for (const [x0, x1, ey, ez0, fr] of h.plates) {
      const ez = fr === "gantry" ? ez0 - dz : ez0;
      const cy = ey - yu, cz = ez - zu;
      const sc = nv[0] * cy + nv[1] * cz, tc = (u[0] * cy + u[1] * cz) / Lc;
      if (tc > 0 && tc < 1 && sc > -(r + 3)) {
        const need = (r + 3 + sc) / Math.sqrt(Math.max(0.2, 1 - (1 - 2 * tc) ** 2));
        bulge = Math.max(bulge, need * reach(x0));
      }
    }
    const x0s = tie0, nseg = Math.max(2, Math.ceil((xu - x0s) / 20.0));
    for (let i = 1; i < nseg; i++) {
      const x = x0s + (xu - x0s) * i / nseg;
      if (x <= xe) { pts.push([x, yh, zr, "core"]); continue; }
      const t = x - xe, [ys, zs] = nest(trayZ(x)), zl = zt + (zu - zt) * S(t / g);
      pts.push([x, yh + (ys - yh) * Af * S5(t / Ly), zl - (zl - zs) * dip * S5(t / Ld) * S5((g - t) / Ld), "beam"]);
    }
    const acc = Math.hypot(dyz[0] / 2 + 2 * bulge * nv[0], dyz[1] / 2 + 2 * bulge * nv[1]);
    const Rx = Math.max(R, Math.sqrt(40.0 * acc));
    for (let k = g >= 30 ? 0 : 1; k < 13; k++) {
      const a = (90 - 15 * k) * Math.PI / 180, f = (1 - Math.sin(a)) / 2, b = bulge * Math.cos(a) ** 2;
      pts.push([xu + Rx * Math.cos(a), yu + f * dyz[0] + b * nv[0], zu + f * dyz[1] + b * nv[1], "beam"]);
    }
    pts.push([xu - 40, ty, trayZ(xu - 40), "beam"]);
    for (const x of runXs(xu - 100, Math.max(xa, h.exit_x + 60))) pts.push([x, ty, trayZ(x), "beam"]);
    pts.push([h.exit_x, ty, trayZ(h.exit_x), "beam"]);
    const [ddx, ddy, ddz] = h.drop;
    pts.push([h.exit_x + ddx * 0.55, ty + ddy * 0.4, tz + ddz * 0.25, "beam"]);
    pts.push([h.exit_x + ddx, ty + ddy, tz + ddz, "beam"]);
    const hub = typeof HUB !== "undefined" && HUB.port && optsOn().hub && HUB.port;   // Part 52 (page only): into the hub's dust port
    if (hub) pts.push([hub[0] - 150, hub[1], hub[2] + 130, "table"], [hub[0] - 90, hub[1], hub[2] + 5, "table"], [hub[0] + 35, hub[1], hub[2], "table"]);   // in level, along +X
    else pts.push([h.exit_x + h.floor[0], h.floor_y, h.table_t + h.floor[2], "table"]);
    return pts;
  }
  function makeHose() {
    // clear PVC with a steel wire helix: one tile = one turn (u along the hose, v round it), the wire a
    // diagonal line across it, the rest translucent
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(225,233,238,0.30)"; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(95,100,106,1)"; g.lineWidth = 7;
    for (const o of [-64, 0, 64]) { g.beginPath(); g.moveTo(o, 0); g.lineTo(o + 64, 64); g.stroke(); }
    hoseWire = new THREE.CanvasTexture(c);
    hoseWire.wrapS = hoseWire.wrapT = THREE.RepeatWrapping;
    hoseWire.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: hoseWire, transparent: true, depthWrite: false,
      roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide });
    hoseMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    hoseMesh.renderOrder = 1;
    hoseMesh.userData = { name: "Vacuum_Hose", label: `Vacuum hose, 2-1/2" clear PVC wire (${meta.hose.od} mm OD)`,
      source: "hardware", group: "Hose", motion: "hose" };
    scene.add(hoseMesh);
    meshes.push(hoseMesh);
    const cable = (name, label, rgb, rough) => {
      const mm = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
        color: new THREE.Color(...rgb).convertSRGBToLinear(), roughness: rough, metalness: 0.0 }));
      mm.userData = { name, label, source: "hardware", group: "Hose", motion: "hose" };
      scene.add(mm);
      meshes.push(mm);
      return mm;
    };
    if (meta.hose.cord) cordMesh = cable("Router_Cord_Run", `Router cord (${meta.hose.cord.d} mm), zip-tied along the hose`, [0.07, 0.07, 0.08], 0.6);
    if (meta.hose.cord) reliefMesh = cable("Router_Cord_Relief", "Router cord strain relief (bends with the cord)", [0.06, 0.06, 0.065], 0.5);
    if (meta.hose.cord) {
      wireMesh = cable("Core_Wires", "The core's wires, each drawn (X motor 4, X endstop 2, touch plate 2): up the core's -X face, along the router cord, into the Jackpot box's slot to their connectors (GUESS route)", [1, 1, 1], 0.5);
      wireMesh.material.vertexColors = true;
      sleeveMesh = cable("Cable_Sleeve", "Cable sleeve (3/8 in PET) over the core's wires, from the top of the core into the Jackpot box (Layers > See through sleeves)", [0.12, 0.12, 0.13], 0.75);
      hrSleeveClear(HR.sleeveClear);
    }
    // no cable sleeve for now (user 2026-11-02: "we'll worry about cable sleeves later")
    tieMesh = cable("Hose_ZipTies", "Zip ties (the hose to the upper router mount; hose + router cord to the core's two tie channels and the Min-end holder)", [0.1, 0.1, 0.11], 0.5);
  }
  // ---- Part 53 (user 2026-11-02: "I want them all to be ropes now"): the whole hose and the router cord are ropes
  // (js/cable_sim.js). The hose: out of the dust shoe's socket (its first segment pinned, up), ZIP-TIED to the core at
  // its two tie tunnels (X +35 / +82 from the socket, on the core's top: they ride with it) and in the Min-end holder
  // (the clamp: pinned lying in its tray) - only there (user: tying it to every holder would stop it rolling); the run
  // along the beam lies in the holder trays (shelves + lips: colliders), its upper run on its lower (self-collision),
  // the U-turn wherever the length puts it; past the clamp it hangs to the hub's port / the floor point. It stretches
  // (wire-helix PVC: up to x1.15, GUESS). The router cord: limp, out of the router, tied to the hose at the same zip
  // ties (on top of it), the hose a collider; past the clamp to ROUTER (hub) or along to the hose's end. hoseRoute
  // only lays them out and places the pins (and the BOM's lengths). Settles on a jump, a few steps a move.
  const HR = { key: "", hose: null, cord: null, ix: null, cx: null, last: null, segH: 45, segC: 25, slack: 1.05, stretch: 1.15, give: 0.4,
    wire: null, wireP: null, wireFold: 0, wireD: 7,  // the core's wire bundle (Part 53b): ~7 mm (stepper + 2 two-wire leads; GUESS)
    gk: 0.3 };                                        // gk: the guide's pull a pass (GUESS: enough to keep the shape, loose enough to sag)
  let reliefMesh = null, wireMesh = null;
  // phones (Part 53b): the ropes freeze while the machine moves and settle once when it stops (a move costs ~25 ms here)
  const HR_PHONE = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
  // where the cord starts: the strain relief's base on the router (its first segment straight out, the relief's stiff
  // part) - or the old tip (+ its lead) if the router gives no base
  function hrCordStart(dx, dy, dz) {
    const c = meta.hose.cord, sh = (v) => new THREE.Vector3(v[0] + dx, v[1] + dy, v[2] + dz);
    if (c.base) return { A: sh(c.base), dir: new THREE.Vector3(...c.baseDir).normalize() };
    return { A: sh(c.tip), dir: new THREE.Vector3(...c.tip2).sub(new THREE.Vector3(...c.tip)).normalize() };
  }
  const hrV = (v) => [v.x, v.y, v.z];
  // the zip ties' paths, measured in the meshes (private/page_tools/section_map.js + a ray scan, 2026-11-02), [y, z] relative
  // to the hose's axis there (y across, z up), from where the strap goes in at the front to where it comes out at the
  // back; from there it goes round the hose (and the cord on it) over the top, back to the start.
  // Core (each tie): ONE straight channel through the print, from the top just in front of the ridge (Y 713, Z 259.5)
  // diagonally down to the sloped back face (Y 733, Z 246.5); then out behind the top's back edge (Y ~745) and up to the
  // hose. Over the channels at X 485 / 533 = the dust shoe's socket + 35.2 / + 83.2 (tie_y 727.5, tie_z 293.3).
  // Min-end holder (Hose_Holder_Shorty at the clamp): two vertical slots through its thin curved tray floor at X 87.5,
  // Y 766.5 (the curved front, just under the hose) and Y 802 (the low point); the strap runs under the floor between
  // them (tray_y 793, tray_z 194.45).
  // core: in at the top, down the channel, out the hole in the back face (Y 744, Z 244.5 - user 2026-11-02: it skipped
  // those holes), up the outside of the back face, then round the hose pulled tight
  const TIE = { core: { dx: [35.2, 83.2], path: [[-14.5, -31], [-14.5, -33.8], [5.5, -46.8], [16.5, -48.8]] },
    clamp: { x: 87.5, path: [[-26.5, -20.5], [-26.5, -28], [-18, -32.5], [-8, -37], [2, -38.6], [9, -38.6], [9, -33.5]] },
    // the upper router mount (Tool_Mount_T, user 2026-11-02): a channel through its arm, level at Z 176.5 (174-179),
    // from (X 484, Y 605.5) to (X 475, Y 615.5) - just behind the hose rising out of the shoe; the strap lies flat
    // round the upright hose. [x, y] off the hose's axis (the socket's X / Y), dz = its height over the socket's top
    // the hose pulled in to it (user: "pull it tighter to the mount"): its axis there at.[x, y] off the socket's, ~15 mm
    // toward the channel (the hose's side ~4 mm off the arm); path: the channel's ends off that axis
    mount: { dz: 176.5 - 115.8, at: [8.2, 12.7], path: [[25.96, 28.4], [16.96, 38.4]] } };
  function hrWorld(route, dy, dz) {
    return route.map(([x, y, z, f]) => (f === "table" ? new THREE.Vector3(x, y, z) : new THREE.Vector3(x, y + dy, z + dz)));
  }
  function hrArc(w) { const a = [0]; for (let i = 1; i < w.length; i++) a.push(a[i - 1] + w[i].distanceTo(w[i - 1])); return a; }
  function hrCross(w, x, from, to, step) {            // where the polyline crosses x, walking from -> to: { p, s (arc) }
    const arc = hrArc(w);
    for (let i = from; i !== to; i += step) {
      const a = w[i], b = w[i + step];
      if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) {
        const t = (x - a.x) / (b.x - a.x);
        return { p: a.clone().lerp(b, t), s: arc[i] + (arc[i + step] - arc[i]) * t };
      }
    }
    return null;
  }
  function hrPoints(route, w, dx) {                  // the tie points + the clamp on this pose's route
    const h = meta.hose, nCore = route.filter((q) => q[3] === "core").length;
    const t1 = hrCross(w, h.port[0] + dx + TIE.core.dx[0], 1, nCore - 1, 1), t2 = hrCross(w, h.port[0] + dx + TIE.core.dx[1], 1, nCore - 1, 1);
    let iExit = -1;
    route.forEach((q, i) => { if (q[3] === "beam") iExit = i; });
    const cl = hrCross(w, h.clamp_x, iExit - 2, nCore, -1);   // back from the beam's exit along the lower run
    if (!(t1 && t2 && cl)) return null;
    // the hose's axis through the core's two zip ties: over the tunnels (X socket + 35 / + 82), at the tie line (tie_y,
    // tie_z: the hose on the core's top between the hole pairs) - the arc lengths from the route
    const dy = w[0].y - h.port[1], dz = w[0].z - (h.port[2] - h.cuff_in);
    t1.p = new THREE.Vector3(h.port[0] + dx + TIE.core.dx[0], h.tie_y + dy, h.tie_z + dz);
    t2.p = new THREE.Vector3(h.port[0] + dx + TIE.core.dx[1], h.tie_y + dy, h.tie_z + dz);
    let ex = null;                                       // where the hose leaves the beam's Min end (the cord follows it to here)
    for (let i = iExit; i < w.length; i++) if (w[i].x < h.exit_x - 40) { ex = { p: w[i], s: hrArc(w)[i] }; break; }
    return { t1, t2, cl, ex };
  }
  function hrTrayZ(x) {                                 // hoseRoute's trayZ: the lower run's floor (+ the Jackpot3 lid bump)
    const h = meta.hose, r = h.od / 2, [x0, x1, zl] = h.bump, zb = Math.max(zl + r + 2.0, h.tray_z), xa = h.clamp_x, xn = h.bump_next, tz = h.tray_z;
    if (x >= xa && x < x0) return tz + (zb - tz) * (x - xa) / (x0 - xa);
    if (x >= x0 && x <= x1) return zb;
    if (x > x1 && x < xn) return zb + (tz - zb) * (x - x1) / (xn - x1);
    return tz;
  }
  function hrBeamCols(dy, dz) {                         // the holders' trays (a shelf + front / back lips), the lid, the upper rail, the end plates
    const h = meta.hose, r = h.od / 2, ty = h.tray_y + dy, cols = [];
    if (!HR.holders) HR.holders = meshes.filter((m) => /^(Hose_Holder|Hose_Hook)/.test(m.userData.name || "") && m.visible !== false)
      .map((m) => { const b = new THREE.Box3().setFromObject(m); return [b.min.x, b.max.x]; });   // x spans: they don't change with Y / Z
    for (const [bx0, bx1] of HR.holders) {
      const b = { min: { x: bx0 }, max: { x: bx1 } }, xc = (bx0 + bx1) / 2, fz = hrTrayZ(xc) + dz - r;
      cols.push({ box: [b.min.x, ty - r - 10, fz - 30, b.max.x, ty + r + 10, fz] },
        // the lips thick (a node is a ball of the hose's radius: thin ones let a wobble pop it through to the far side)
        { box: [b.min.x, ty - r - 50, fz, b.max.x, ty - r - 6, fz + 30] }, { box: [b.min.x, ty + r + 6, fz, b.max.x, ty + r + 50, fz + 40] });
    }
    const [x0, x1, zl] = h.bump;
    cols.push({ box: [x0, ty - 60, zl + dz - 60, x1, ty + 60, zl + dz] });
    const [ry, rz, rr] = h.rail_up, xs = h.plates.map((q) => q[1]);
    cols.push({ box: [h.exit_x, ry + dy - rr, rz + dz - rr, Math.max(...xs), ry + dy + rr, rz + dz + rr] });
    return cols;                                         // (the Max end plates: the guide bows round them; boxes fought it)
  }
  function hrColliders() {                             // the table's, cached a scene (they don't move)
    if (HR.cols) return HR.cols;
    const cols = HR.cols = [], bb = (m) => { const b = new THREE.Box3().setFromObject(m); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
    const tb = typeof tableBox === "function" && tableBox();
    if (tb) cols.push({ box: [tb.min.x, tb.min.y, tb.min.z, tb.max.x, tb.max.y, tb.max.z] });
    for (const b of (typeof LEG_BOXES !== "undefined" ? LEG_BOXES : []).concat(typeof APRON_BOXES !== "undefined" && U.base !== "torsion" ? APRON_BOXES : [])) cols.push({ box: b });
    for (const m of meshes) if (/^(TableHub_Panel|SwitchPanel_Box)$/.test(m.userData.name || "") && m.visible !== false) cols.push({ box: bb(m) });
    const vac = meshes.find((m) => m.userData.name === "ShopVac_Drum" && m.visible !== false);
    if (vac) { const b = new THREE.Box3().setFromObject(vac); cols.push({ cyl: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.max.x - b.min.x) / 2, b.min.z, b.max.z + 130] }); }
    const lg = meshes.find((m) => m.userData.name === "TableLegs");
    if (lg) cols.push({ floor: new THREE.Box3().setFromObject(lg).min.z });
    return cols;
  }
  function hrFree(h) {                                  // the hose past the clamp, relaxed: the far Y stop's (taut) x slack
    const t = meta.travel;
    let L = 0;
    for (const dy of t.y) for (const dz of [t.z[0], t.z[1]]) {
      const r = hoseRoute(h, t.x[0], dz), w = hrWorld(r, dy, dz), P = hrPoints(r, w, t.x[0]);
      if (P) L = Math.max(L, hrArc(w)[w.length - 1] - P.cl.s);
    }
    return L * HR.slack;
  }
  const hubOn = () => typeof HUB !== "undefined" && HUB.port && optsOn().hub;
  function hrBuild(route, w, dx, P) {                   // a new rope pair for this scene: lay along the route, the pins' nodes
    // the segment from the shoe-to-clamp length exactly (so that part is as long as the route it's guided along - any
    // more and it snakes), then the free span past the clamp added in whole segments
    const h = meta.hose, arc = hrArc(w), Lfree = hrFree(h), ncl = Math.max(8, Math.round(P.cl.s / HR.segH)), seg = P.cl.s / ncl;
    const nH = ncl + Math.max(4, Math.round(Lfree / seg)) + 1, Lh = seg * (nH - 1);
    const k = w.findIndex((v, i) => arc[i] > P.cl.s), lay = w.slice(0, k).concat([P.cl.p]).concat(w.slice(k));
    HR.ix = { t1: Math.round(P.t1.s / seg), t2: Math.round(P.t2.s / seg), cl: ncl, ex: Math.min(nH - 3, P.ex ? Math.round(P.ex.s / seg) : ncl + 2) };
    HR.hose = LR4Cable.make(lay.map(hrV), { n: nH, len: Lh, r: h.od / 2, stiff: 0.25, stretch: HR.stretch, give: HR.give, damp: 0.08, iters: 12,
      self: [HR.ix.t2 + 2, HR.ix.cl - 2] });
    HR.cord = null;
  }
  function hrCordBuild(hp, dx, dy, dz) {              // the cord: out of the router, along the settled hose (on top) between the ties, then off
    const c = meta.hose.cord, r = meta.hose.od / 2, up = (i) => hrUp(hp, i).multiplyScalar(r + c.d / 2), H = (i) => new THREE.Vector3(...hp[i]);
    const { A, dir } = hrCordStart(dx, dy, dz), T1 = new THREE.Vector3(...hp[HR.ix.t1]);
    // out of the relief, then a loop up and back over the core's top to the hose at the first tie (user 2026-11-02)
    const A1 = A.clone().addScaledVector(dir, 70), A2 = new THREE.Vector3(A1.x - 20, (A1.y + T1.y) / 2, T1.z + r + 30);
    const lay = [A, A1, A2], marks = {};
    for (let i = HR.ix.t1; i <= HR.ix.ex; i++) {
      lay.push(H(i).add(up(i)));
      if (i === HR.ix.t1) marks.t1 = lay.length - 1;
      if (i === HR.ix.t2) marks.t2 = lay.length - 1;
      if (i === HR.ix.cl) marks.cl = lay.length - 1;
    }
    marks.ex = lay.length - 1;
    const tail = hrCordTail(hp);
    lay.push(...tail.slice(1));
    const la = hrArc(lay), L = la[la.length - 1] * 1.03, n = Math.max(20, Math.round(L / HR.segC) + 1), at = (k) => Math.round(la[k] / la[la.length - 1] * (n - 1));
    HR.cx = { t1: at(marks.t1), t2: at(marks.t2), cl: at(marks.cl), ex: at(marks.ex) };
    HR.cord = LR4Cable.make(lay.map(hrV), { n, len: L, r: c.d / 2, stiff: 0, damp: 0.08, iters: 10 });
  }
  function hrCoreCols(dx, dy, dz) {                    // the core's top (30 mm slab) + the router's motor cap: the cord lies on them
    if (!HR.core) {                                    // their boxes once a scene, at this pose; moved with the core after
      const bx = (n) => { const m = meshes.find((q) => q.userData.name === n); return m && new THREE.Box3().setFromObject(m); };
      const cb = bx("Core"), mc = bx("Router_MotorCap");
      HR.core = { d: [dx, dy, dz], top: cb && [cb.min.x, cb.min.y, cb.max.z - 30, cb.max.x, cb.max.y, cb.max.z], cap: mc && [mc.min.x, mc.min.y, mc.min.z, mc.max.x, mc.max.y, mc.max.z] };
    }
    const [ox, oy, oz] = [dx - HR.core.d[0], dy - HR.core.d[1], dz - HR.core.d[2]], mv = (b) => [b[0] + ox, b[1] + oy, b[2] + oz, b[3] + ox, b[4] + oy, b[5] + oz];
    return [HR.core.top, HR.core.cap].filter(Boolean).map((b) => ({ box: mv(b) }));
  }
  function hrUp(hp, i) {                                // up, square to the hose at node i (where the cord sits on it)
    const a = hp[Math.max(0, i - 1)], b = hp[Math.min(hp.length - 1, i + 1)], t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const u = new THREE.Vector3(0, 0, 1).addScaledVector(t, -t.z);
    return u.lengthSq() > 1e-6 ? u.normalize() : new THREE.Vector3(0, 1, 0);
  }
  function hrCordTail(hp) {                             // past the clamp: down to the ROUTER plug (hub), or along the hose to its end
    const o = hubOn() && HUB.outlet, r = meta.hose.od / 2, c = meta.hose.cord, k = HR.ix.ex, C = new THREE.Vector3(...hp[k]).add(hrUp(hp, k).multiplyScalar(r + c.d / 2));
    if (o) { const B = new THREE.Vector3(o.router[0] - 31, o.router[1], o.router[2]); return [C, new THREE.Vector3(C.x - 40, (C.y + B.y) / 2, Math.min(C.z, B.z) - 150), B.clone().add(new THREE.Vector3(-60, 0, -20)), B]; }
    const out = [C];
    for (let i = k + 1; i < hp.length; i++) out.push(new THREE.Vector3(...hp[i]).add(hrUp(hp, i).multiplyScalar(r + c.d / 2)));
    return out;
  }
  function hoseRopes(route, w, dx, dy, dz) {           // settle both for this pose; null: fall back to the route
    if (typeof LR4Cable === "undefined") return null;
    const h = meta.hose, P = hrPoints(route, w, dx);
    if (!P) return null;
    const hub = hubOn(), key = JSON.stringify([meta.travel, !!hub, hub && HUB.port, U.base, !!cordMesh]);
    let jump = false;
    if (HR.key !== key || !HR.hose) { HR.key = key; HR.cols = HR.holders = HR.core = HR.wire = HR.need = null; hrBuild(route, w, dx, P); jump = true; }
    const hc = HR.hose, s = hc.seg, Pn = w[w.length - 1], dirN = hub ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
    // guided (Part 53, after it flopped off the beam unguided): from the shoe to the clamp each node is pulled softly
    // toward the drag-chain route's point at its share of the length - the shape a stiff hose + the tray walls keep;
    // it still sags and swings. Past the clamp: free.
    const arc = hrArc(w), at = (sv) => { let i = 1; while (i < w.length - 1 && arc[i] < sv) i++; const t = (sv - arc[i - 1]) / ((arc[i] - arc[i - 1]) || 1); return hrV(w[i - 1].clone().lerp(w[i], Math.min(1, Math.max(0, t)))); };
    HR.gH = Array.from({ length: hc.n }, (_, i) => (i <= HR.ix.cl ? at(P.cl.s * i / HR.ix.cl) : null));
    hc.guide(HR.gH, HR.gk);
    // out of the shoe's socket and through the mount's zip tie: on the line from the socket to the tie's point
    // (user: "a bit extra hose where it goes into the shoe so it's not angled"): straight up out of it one segment, then
    // over to the mount's tie (the 2nd node over the tie's spot, a segment higher)
    hc.pin(0, hrV(w[0])); hc.pin(1, HR.gH[1]); hc.unpin(2);   // on the route (no index / length mismatch: it stretched there)
    hc.pin(HR.ix.t1, hrV(P.t1.p)); hc.pin(HR.ix.t2, hrV(P.t2.p));                       // the core's two zip ties,
    hc.pin(HR.ix.t1 - 1, hrV(P.t1.p.clone().add(new THREE.Vector3(-s, 0, 0))));          // straight along X through them
    hc.pin(HR.ix.t2 + 1, hrV(P.t2.p.clone().add(new THREE.Vector3(s, 0, 0))));
    hc.pin(HR.ix.cl, hrV(P.cl.p));                                                        // the Min-end holder's zip tie, lying in its tray
    hc.pin(HR.ix.cl - 1, hrV(P.cl.p.clone().add(new THREE.Vector3(s, 0, 0)))); hc.pin(HR.ix.cl + 1, hrV(P.cl.p.clone().add(new THREE.Vector3(-s, 0, 0))));
    hc.pin(-1, hrV(Pn)); hc.pin(-2, hrV(Pn.clone().addScaledVector(dirN, -s)));
    if (HR.last && HR.last.distanceTo(P.t2.p) > 150) jump = true;
    HR.last = P.t2.p.clone();
    const cols = hrColliders().concat(hrBeamCols(dy, dz));
    const rel = [];                                    // the strain relief (last drawn): the hose rides over it
    if (reliefMesh && reliefMesh.geometry.attributes.position) { reliefMesh.geometry.computeBoundingBox(); const b = reliefMesh.geometry.boundingBox;
      if (b && isFinite(b.min.x)) rel.push({ box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z + 4] }); }
    if (jump) hc.snap(HR.gH);                          // on a jump: onto the guide first, then a short settle (load perf)
    hc.settle(jump ? (HR.quick ? 25 : 90) : 10, cols);   // quick: the wiring report's corner moves (lengths, not looks)                  // (no head box: the guide holds the arc round it; the box fought it - stretched 1.6x)   // + the router's head + the core's top: it wraps round them
    const hp = hc.points();
    let cp = null;
    if (cordMesh && meta.hose.cord) {
      // the cord where it always was (user 2026-11-02: "look where the router cord was before... not on top of the
      // hose"): cordRoute run over the SETTLED hose gives its path round the hose (its angles along it); that path,
      // from the strain relief's base, is the cord rope's guide to the beam's end (with the hub: then it hangs to
      // ROUTER, unguided). Pinned where the path crosses the zip ties.
      const c = meta.hose.cord, r = h.od / 2, sh = (v) => [v[0] + dx, v[1] + dy, v[2] + dz];
      const dense = new THREE.CatmullRomCurve3(hp.map((q) => new THREE.Vector3(...q)), false, "centripetal").getPoints(12 * (hp.length - 1)).map((q) => [q.x, q.y, q.z]);
      const { A, dir } = hrCordStart(dx, dy, dz);
      let G = cordRoute(dense, h, c, sh(c.tip), sh(c.tip2), dx);
      const near = (P) => G.reduce((m, q, i) => (Math.hypot(q[0] - P[0], q[1] - P[1], q[2] - P[2]) < Math.hypot(G[m][0] - P[0], G[m][1] - P[1], G[m][2] - P[2]) ? i : m), 0);
      {                                                // from the relief: a smooth curve round and up into the back of the core's
        const k1 = near(hp[HR.ix.t1]), T = new THREE.Vector3(...G[k1]), Tn = new THREE.Vector3(...G[Math.min(G.length - 1, k1 + 1)]);   // first zip tie
        // straight out, then curving up and back - low, no arc into the air (user 2026-11-02: no square section; room above the relief)
        const Tb = new THREE.Vector3(T.x, hp[HR.ix.t1][1] + 0.62 * (r + c.d / 2 + 0.5), hp[HR.ix.t1][2] - 0.78 * (r + c.d / 2 + 0.5));   // the tie's spot (low at the back)
        // the relief points away from the ties (-X): one wide, smooth U - out, round toward the back, in along the core's back edge
        const bz = new THREE.CubicBezierCurve3(A, A.clone().addScaledVector(dir, 95), Tb.clone().add(new THREE.Vector3(-130, 0, 0)), Tb);   // wide: round the core's end
        G = bz.getPoints(28).map(hrV).concat(G.slice(k1 + 1));
      }
      if (hub) G = G.slice(0, near(hp[HR.ix.ex]) + 1);   // to the beam's end; then it drops (not round the hose)
      let tailFrom = G.length;                         // with the hub: from the beam's end down to ROUTER (user 2026-11-02: no
      if (hub && HR.cord) {                            // wrapping the hose; "fix this mess"): one clean U below the outlet - down
        // the outside, round the bottom, up in front of the VAC plug (-Y of the vac cord) into ROUTER; the U's depth
        // takes up exactly the slack (bisection on its low point)
        const E = new THREE.Vector3(...G[G.length - 1]), Bq = new THREE.Vector3(HUB.outlet.router[0] - 31, HUB.outlet.router[1], HUB.outlet.router[2]);
        const lg = meshes.find((m) => m.userData.name === "TableLegs"), fl = lg ? new THREE.Box3().setFromObject(lg).min.z : Bq.z - 700;
        // close to the table (user 2026-11-03: "closer to the table instead of on the hose"), and a natural hang (user:
        // "this point ... doesn't make sense" - a sharp fold at the U's bottom): the U in the panel's plane, along its
        // face - down a leg toward the back, a round bottom (r 45), up into ROUTER; slack the U can't take (the gantry
        // near the hub) lengthens its bottom along the floor
        const yr = Bq.y - 16, xi = Bq.x - 20, cr2 = c.d / 2, RU = 45, s45 = 0.29;
        const path = (zl, Lf = 0) => {
          const yD = yr + 2 * RU + Lf, V3 = (y, z) => new THREE.Vector3(xi, y, z);
          return new THREE.CatmullRomCurve3([E, new THREE.Vector3((E.x + xi) / 2, (E.y + yD) / 2, Math.max(zl + 140, (E.z + zl) / 2)),
            V3(yD, zl + RU), V3(yD - s45 * RU, zl + s45 * RU), V3(yD - RU, zl), ...(Lf > 1 ? [V3(yr + RU, zl)] : []),
            V3(yr + s45 * RU, zl + s45 * RU), V3(yr, zl + RU), V3(yr, Bq.z - 70), new THREE.Vector3(Bq.x - 22, Bq.y, Bq.z - 8), Bq], false, "centripetal");
        };
        const gA = hrArc(G.map((q) => new THREE.Vector3(...q))), want = HR.cord.len * 0.997 - gA[gA.length - 1];
        let lo = fl + cr2, hi = Bq.z - 130;
        for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (path(m).getLength() > want) lo = m; else hi = m; }
        // no slack for a U (the far Y stop): straight in from the beam, up into the plug from below-front
        const direct = new THREE.CatmullRomCurve3([E, new THREE.Vector3(xi, yr + RU, Math.min(E.z, Bq.z) - 110), new THREE.Vector3(xi, yr, Bq.z - 70),
          new THREE.Vector3(Bq.x - 22, Bq.y, Bq.z - 8), Bq], false, "centripetal");
        let cur = path(hi).getLength() > want ? direct : path(Math.max(fl + cr2, (lo + hi) / 2));
        if (path(fl + cr2).getLength() < want) {       // more than the U holds: the hairpin on the floor
          let a0 = 0, a1 = 3000;
          for (let it = 0; it < 22; it++) { const m = (a0 + a1) / 2; if (path(fl + cr2, m).getLength() < want) a0 = m; else a1 = m; }
          cur = path(fl + cr2, (a0 + a1) / 2);
        }
        G = G.concat(cur.getPoints(40).slice(1).map(hrV));
        HR.tailGuided = true;
        HR.cordE = E.toArray();                       // (the supply's cord joins it here: hrPowerMeshes)
      }
      const CORE_SIDE = new THREE.Vector3(0, 0.62, -0.78).normalize(), cr = r + c.d / 2 + 0.5;   // low at the back: just over the core's back edge (user: lower)
      {                                                // the whole core run on that side (user: low along the back, blue line),
        const x0 = hp[HR.ix.t1 - 1][0] - 5, x1 = h.port[0] + dx + h.core_end_dx, ramp = 80;   // blending back past the core's end
        const Ly = hp[HR.ix.t1][1] + CORE_SIDE.y * cr, Lz = hp[HR.ix.t1][2] + CORE_SIDE.z * cr;
        let xmax = -1e9, turned = false;                 // only the outbound run (not back along the lower run past the U-turn)
        G = G.map((q, i) => {
          if (q[0] < xmax - 2) turned = true;
          xmax = Math.max(xmax, q[0]);
          if (turned || i < 3 || q[0] < x0) return q;  // the curve in from the relief: as is
          const f = q[0] <= x1 ? 1 : Math.max(0, 1 - (q[0] - x1) / ramp), e = f * f * (3 - 2 * f);
          return [q[0], q[1] + (Ly - q[1]) * e, q[2] + (Lz - q[2]) * e];
        });
      }
      {                                                // never through the hose (user 2026-11-02), and smooth: push each path point
        const near = (q) => {                          // out to the hose's surface (+ the cord), smooth, again
          let best = null, bd = 1e9;
          for (let i = 1; i < hp.length; i++) {
            const a0 = hp[i - 1], ab = [0, 1, 2].map((k) => hp[i][k] - a0[k]), L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
            const u = Math.max(0, Math.min(1, ((q[0] - a0[0]) * ab[0] + (q[1] - a0[1]) * ab[1] + (q[2] - a0[2]) * ab[2]) / (L2 || 1)));
            const n = [0, 1, 2].map((k) => a0[k] + ab[k] * u), d = Math.hypot(q[0] - n[0], q[1] - n[1], q[2] - n[2]);
            if (d < bd) { bd = d; best = n; }
          }
          return [best, bd];
        };
        const out = (q) => { const [n, d] = near(q); if (d >= cr) return q; const k = d > 1e-6 ? cr / d : 0; return d > 1e-6 ? n.map((v, j) => v + (q[j] - v) * k) : [q[0], q[1], q[2] + cr]; };
        for (let pass = 0; pass < 4; pass++) {
          G = G.map(out);
          G = G.map((q, i) => (i < 2 || i > G.length - 2 ? q : q.map((v, j) => 0.25 * G[i - 1][j] + 0.5 * v + 0.25 * G[i + 1][j])));
        }
        G = G.map(out);
      }
      const gArc = hrArc(G.map((q) => new THREE.Vector3(...q))), gL = gArc[gArc.length - 1];
      const tArc = (k) => { const q = ties[k]; return q.i > 0 ? gArc[q.i - 1] + (gArc[q.i] - gArc[q.i - 1]) * q.f : gArc[q.i]; };
      // the cord's tie points: where its path crosses each tie's X (the core's run along X; the clamp's too), set out
      // on the hose's surface (cord in the zip tie against the hose) - not the path's nearest sample (it's coarse)
      const gV = G.map((q) => new THREE.Vector3(...q)), ties = {}, tieP = {};
      for (const k of ["t1", "t2", "cl"]) {
        const X0 = k === "cl" ? TIE.clamp.x : hp[HR.ix[k]][0], c0 = near(hp[HR.ix[k]]);
        let hit = null;
        for (let i = Math.max(1, c0 - 6); i < Math.min(G.length, c0 + 7) && !hit; i++) if ((G[i - 1][0] - X0) * (G[i][0] - X0) <= 0 && G[i][0] !== G[i - 1][0])
          hit = { i, f: (X0 - G[i - 1][0]) / (G[i][0] - G[i - 1][0]) };
        const P = hit ? gV[hit.i - 1].clone().lerp(gV[hit.i], hit.f) : gV[c0].clone();
        const ax = new THREE.Vector3(...hp[HR.ix[k]]); ax.x = P.x;           // the hose's axis there
        // the core's ties: the cord on the hose's back-lower side, low along the core's top (user 2026-11-02: green line),
        // not under the hose (no room) - both at that angle, straight along between them
        const off = k === "cl" ? P.clone().sub(ax) : CORE_SIDE.clone();
        off.x = 0;
        tieP[k] = ax.clone().add(off.lengthSq() > 1e-6 ? off.normalize().multiplyScalar(r + c.d / 2 + 0.5) : new THREE.Vector3(0, 0, r + c.d / 2 + 0.5));
        ties[k] = hit ? { arcAt: null, i: hit.i, f: hit.f } : { i: c0, f: 0 };
      }
      const B = hub && new THREE.Vector3(HUB.outlet.router[0] - 31, HUB.outlet.router[1], HUB.outlet.router[2]);
      const fresh = !HR.cord;
      if (!HR.cord) {                                   // laid along the path (+ down to the plug), a little slack
        const lay = G.map((q) => new THREE.Vector3(...q));
        // the guided part + a little slack; the hanging tail (hub) long enough for the far Y stop (it stretched 1.6x there)
        const Ee = lay[tailFrom - 1], tl = B ? Math.max(...meta.travel.y.map((yv) => Math.hypot(Ee.x - B.x, Ee.y + (yv - dy) - B.y, Ee.z - B.z))) * 1.15 + 150 : 0;
        const la = hrArc(lay), L = B ? gArc[tailFrom - 1] * 1.03 + tl : la[la.length - 1] * 1.03, n = Math.max(20, Math.round(L / HR.segC) + 1);
        HR.cord = LR4Cable.make(lay.map(hrV), { n, len: L, r: c.d / 2, stiff: 0.3, damp: 0.08, iters: 8 });   // stiff enough for smooth, rounded bends only
        HR.cG = Math.round(gL / L * (n - 1));          // the guided nodes: 0 .. cG
        HR.cx = {}; for (const k of ["t1", "t2", "cl"]) HR.cx[k] = Math.round(tArc(k) / L * (n - 1));
        jump = true;
      }
      {                                                // the tie nodes in proportion to the path at THIS pose (the path round
        const Lc = HR.cord.len, old = Object.assign({}, HR.cx);   // the hose changes length with it; fixed ones stretched 2x)
        for (const k of ["t1", "t2", "cl"]) HR.cx[k] = Math.round(tArc(k) / Lc * (HR.cord.n - 1));
        HR.cG = hub ? HR.cord.n - 1 : Math.round(gL / Lc * (HR.cord.n - 1));   // hub: guided right to the plug (no loose bit to bunch there)
        for (const k of ["t1", "t2", "cl"]) if (old[k] !== undefined && old[k] !== HR.cx[k]) HR.cord.unpin(old[k]);
      }
      const cc = HR.cord, cs = cc.seg, at = (sv) => { let i = 1; while (i < G.length - 1 && gArc[i] < sv) i++; const t = (sv - gArc[i - 1]) / ((gArc[i] - gArc[i - 1]) || 1);
        return [0, 1, 2].map((k) => G[i - 1][k] + (G[i][k] - G[i - 1][k]) * Math.min(1, Math.max(0, t))); };
      // each node's place along the path: piecewise between the ties at THIS pose (the path's length to each tie changes
      // with X as the U-turn rolls - spread over the whole stretch, not taken up by one segment at a pin)
      const anc = [[0, 0], [HR.cx.t1, tArc("t1")], [HR.cx.t2, tArc("t2")], [HR.cx.cl, tArc("cl")], [HR.cG, gL]];
      const arcOf = (i) => { let k = 1; while (k < anc.length - 1 && anc[k][0] < i) k++; const [i0, s0] = anc[k - 1], [i1, s1] = anc[k]; return s0 + (s1 - s0) * (i - i0) / ((i1 - i0) || 1); };
      const tailArc = gArc[tailFrom - 1];
      const gC = Array.from({ length: cc.n }, (_, i) => { if (i > HR.cG) return null; const sv = arcOf(i), q = at(sv); return sv > tailArc ? q.concat(0.8) : q; });
      cc.guide(gC, 0.3);
      cc.pin(0, hrV(A)); cc.unpin(1);                   // the relief bends from its base to come round the core (user 2026-11-02)
      HR.cordAt = {};
      for (const k of ["t1", "t2", "cl"]) { cc.pin(HR.cx[k], hrV(tieP[k])); HR.cordAt[k] = hrV(tieP[k]); }   // in the zip ties
      if (B) { cc.pin(-1, hrV(B)); cc.pin(-2, hrV(B.clone().add(new THREE.Vector3(-cs, 0, 0))));   // out of the socket,
        cc.unpin(-3); }
      else { cc.pin(-1, G[G.length - 1]); cc.unpin(-2); cc.unpin(-3); }
      const balls = hp.map((q) => ({ sph: [q[0], q[1], q[2], r] }));   // every node (every 2nd left gaps the cord slipped into)
      // the hose last (it wins: never inside it - user); the router's cap only (the core-top box is crude and squeezed it into the hose)
      // the core's top (trimmed 6 mm at the back: the cord lies on its back edge at the ties - the full box squeezed it into
      // the hose), the router's cap, the VAC plug (the hanging cord caught on it), then the hose last (it wins)
      const cc0 = hrCoreCols(dx, dy, dz), top = cc0[0] && { box: cc0[0].box.slice() };
      if (top) top.box[4] -= 6;
      const plug = meshes.find((m) => m.userData.name === "ShopVac_Plug" && m.visible !== false), pb = plug && new THREE.Box3().setFromObject(plug);
      // the VAC plug + its cord's first bit out of it (the router cord crossed it)
      if (jump || HR.cordJump) cc.snap(gC);
      cc.settle(jump || HR.cordJump ? (HR.quick ? 15 : 60) : 5, cols.concat(top ? [top] : [], cc0.slice(1), pb ? [{ box: [pb.min.x, pb.min.y, pb.min.z, pb.max.x, pb.max.y, pb.max.z] }] : [], balls));
      HR.cordJump = false;
      if (fresh && hub) { HR.cordJump = true; return hoseRopes(route, w, dx, dy, dz); }   // again, now with its tail's path (it needs the cord's length)
      cp = cc.points();
      hrWires(hp, cp, dy, dz);
    }
    return { hp, cp };
  }
  // ---- Part 53b: the core's wires (X motor, X endstop, touch plate). Through the core as V1E's core assembly docs
  // (cl-ct) and the Core STL (sections / ray maps 2026-11-02, user: "this isn't where the endstop and touchplate wires
  // run"): the touch plate's wire in at its hole beside the tool mount (straight through the wall front to back at
  // X 549, Z 134.5), along the TUNNEL in the back of the wall (a ~3 x 12 mm slot at Y 674, Z 133-146, X 425-545) to the
  // -X end; the X endstop's (on the back face at that end) in there too; both out to the front through the OPENING under
  // the stepper (X 431-444, Z 152-158, through the wall) - "guide the black plug through the opening at the front side
  // of the core"; then "run all the wires together up from behind the stepper" (the 6-10 mm gap between its back and the
  // wall), the motor's leads joining above it; over the top onto the router cord (V1E w6-w8: bundled with it), beside it
  // on the hose (tied: the settled cord's shape, no sim) round the U-turn to the lower run just past the Jackpot box,
  // then a limp rope into the box's wire slot in its +X wall (JP3_SLOT), settled once a scene in the beam's frame.
  // HR.wireP: the opening's front -> the slot; HR.wireJ: where the motor's leads join (HR.wireMotor: its plug -> there);
  // HR.wirePre.stop / .probe: each wire's way to the opening's front; HR.wireFold: where it leaves the cord. GUESS bits:
  // the exact paths inside the tunnel / gap (no LR4 to check).
  // WCORE: points in mm off the Core's bounding-box min (415.5, 609.8, 68.8 as built)
  const WCORE = { holeF: [133.5, 40.2, 65.7], holeB: [133.5, 64.2, 65.7], tunE: [128, 64.2, 70.5], tunW: [24.5, 64.2, 71],
    stopUp: [14.5, 64.2, 79], openB: [21.5, 62, 86.2], openF: [21.5, 40.2, 86.2],
    // up behind the stepper (its back y 658 / the wall's front 664-668, z 170-215), out over its top, up the wall's
    // sloping front to the core's top
    up: [[21.5, 51.2, 99.5], [21.5, 52, 143.5], [21.5, 45.5, 157.5], [21.5, 50.5, 169.5], [21.5, 60, 181.5], [21.5, 72, 195]],
    join: 2 };                                         // the motor's leads join at up[join] (just over the stepper)
  // JP3_SLOT: the box's wire slot, ~10 x 18 mm in its +X wall, center mm off the box's min (y, z) (section_map 2026-11-02)
  const JP3_SLOT = { y: 31, z: 19 };
  function hrMerge(gs) {                               // indexed geometries with position / normal / uv -> one
    const at = { position: [], normal: [], uv: [] }, idx = [];
    if (gs.every((g) => g.getAttribute("color"))) at.color = [];
    let base = 0;
    for (const g of gs) {
      for (const k in at) at[k].push(...g.getAttribute(k).array);
      for (const i of g.index.array) idx.push(i + base);
      base += g.getAttribute("position").count;
      g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute("position", new THREE.Float32BufferAttribute(at.position, 3));
    m.setAttribute("normal", new THREE.Float32BufferAttribute(at.normal, 3));
    m.setAttribute("uv", new THREE.Float32BufferAttribute(at.uv, 2));
    if (at.color) m.setAttribute("color", new THREE.Float32BufferAttribute(at.color, 3));
    m.setIndex(idx);
    return m;
  }
  function hrWires(hp, cp, dy, dz) {
    HR.wireP = HR.wireMotor = HR.wirePre = null;
    const mesh = (nm) => meshes.find((m) => m.userData.name === nm && m.visible !== false);
    const box = mesh("Jackpot3_Box"), core = mesh("Core"), plug = mesh("X_Stepper_Plug");
    if (!box || !core || !wireMesh || !HR.cx || !cp) return;
    const R = meta.hose.od / 2, cd = meta.hose.cord.d, wr = HR.wireD / 2, rr = R + wr + 0.5, dl = (cd / 2 + wr) / (R + cd / 2);
    const cb = new THREE.Box3().setFromObject(core), bx = new THREE.Box3().setFromObject(box);
    const C0 = (q) => new THREE.Vector3(cb.min.x + q[0], cb.min.y + q[1], cb.min.z + q[2]);
    const trunk = [C0(WCORE.openF)].concat(WCORE.up.map(C0)), J1 = trunk[trunk.length - 1];
    // the cord nodes it rides: from the one nearest the core's top (round the core's corner) out, round the U-turn, back along the
    // lower run to the one nearest just past the box (between it and the next brace)
    const dJ = (k) => Math.hypot(cp[k][0] - J1.x, cp[k][1] - J1.y, cp[k][2] - J1.z);
    let kj = 0, ku = HR.cx.t1;
    for (let k = 1; k <= HR.cx.t1; k++) if (dJ(k) < dJ(kj)) kj = k;
    for (let k = HR.cx.t1; k <= HR.cx.cl; k++) if (cp[k][0] > cp[ku][0]) ku = k;
    // where it leaves the cord (user 2026-11-02: "drop down through the prior brace before going to the Jackpot box"): just
    // past the brace on the box's far side (toward the core), then down through that brace's window to the box's slot
    const brs = meshes.filter((m) => /^Brace_(\d+|Max)$/.test(m.userData.name || "") && m.visible !== false).map((m) => new THREE.Box3().setFromObject(m))
      .filter((b) => b.min.x > bx.max.x).sort((p, q) => p.min.x - q.min.x), br = brs[0] || null;
    // it leaves at the brace before that one (user: "start dropping at the prior brace") and slopes down from there
    const br2 = brs[1] || null, Xl = br2 ? br2.min.x - 4 : br ? br.max.x + 22 : bx.max.x + 25;
    let kl = ku;
    for (let k = ku; k <= HR.cx.cl; k++) if (Math.abs(cp[k][0] - Xl) < Math.abs(cp[kl][0] - Xl)) kl = k;
    const out = trunk.slice(), C = new THREE.Vector3(), A = new THREE.Vector3(), T = new THREE.Vector3(), a = new THREE.Vector3(), ab = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = kj; i <= kl; i++) {
      C.set(...cp[i]);
      let bd = 1e9;                                    // the hose's axis nearest this cord node, and its way there
      for (let k = 1; k < hp.length; k++) {
        a.set(...hp[k - 1]); ab.set(...hp[k]).sub(a);
        const u = Math.max(0, Math.min(1, n.copy(C).sub(a).dot(ab) / (ab.lengthSq() || 1)));
        n.copy(a).addScaledVector(ab, u);
        const d = n.distanceTo(C);
        if (d < bd) { bd = d; A.copy(n); T.copy(ab).normalize(); }
      }
      const e = C.clone().sub(A); e.addScaledVector(T, -e.dot(T));
      if (bd > R + cd + 4 || e.lengthSq() < 1e-6) { out.push(C.clone().add(new THREE.Vector3(0, 0, cd / 2 + wr))); continue; }   // off the hose (on the core): on top of the cord
      e.normalize();
      const s = T.clone().cross(e); if (s.z < 0) s.negate();   // beside the cord, on its upper side
      out.push(A.clone().add(e.multiplyScalar(Math.cos(dl)).addScaledVector(s, Math.sin(dl)).multiplyScalar(rr)));
    }
    for (let pass = 0; pass < 3; pass++)              // smooth (the on-hose / on-core offsets meet at the corner: lumps)
      for (let i = trunk.length; i < out.length - 1; i++) out[i] = out[i - 1].clone().add(out[i + 1]).multiplyScalar(0.25).addScaledVector(out[i], 0.5);
    const Lv = out[out.length - 1], H =new THREE.Vector3(bx.max.x - 2, bx.min.y + JP3_SLOT.y, bx.min.z + JP3_SLOT.z);
    if (!HR.wire) {                                    // the drop, once a scene: through the brace's window, into the slot square to the wall (-X)
      // the window (Brace_x, rays along X 2026-11-02): open over y min+36..min+88, z min+38..min+98 (a plate with an arched
      // opening); the wire through its middle, pinned there
      // it lies on the window's bottom edge (user 2026-11-03: "more gradual and less droopy ... lay on the bottom of the
      // brace"): a straight slope down from the brace before to there (a taut rope sagged 4 mm below it between the
      // braces), then a smooth curve, level into the slot
      const Wb = br ? new THREE.Vector3(br.min.x, br.min.y + 64, br.min.z + 38 + wr + 0.5) : Lv.clone().lerp(H, 0.6);
      const sl = Wb.clone().sub(Lv), pts = [];
      for (let i = 0, m = Math.max(2, Math.round(sl.length() / 12)); i < m; i++) pts.push(Lv.clone().addScaledVector(sl, i / m));
      const c1 = Wb.clone().addScaledVector(sl.clone().normalize(), Math.min(30, Wb.distanceTo(H) / 2)), c2 = H.clone().add(new THREE.Vector3(Math.min(30, Wb.distanceTo(H) / 2), 0, 0));
      const bz = new THREE.CubicBezierCurve3(Wb, c1, c2, H);
      for (let i = 0, m = Math.max(3, Math.round(bz.getLength() / 8)); i <= m; i++) pts.push(bz.getPoint(i / m));
      HR.wire = { pts, dy, dz };
    }
    const o = new THREE.Vector3(0, dy - HR.wire.dy, dz - HR.wire.dz);
    HR.wireP = out.concat(HR.wire.pts.slice(1).map((q) => q.clone().add(o)));
    HR.wireFold = out.length - 1;
    HR.wireJ = 1 + WCORE.join;
    if (plug) {                                        // the motor's lead: out of its plug, up and back over the stepper to the join
      const P = new THREE.Box3().setFromObject(plug).getCenter(new THREE.Vector3()), Jn = HR.wireP[HR.wireJ];
      HR.wireMotor = [P, P.clone().add(new THREE.Vector3(-3, 0, 14)), Jn.clone().add(new THREE.Vector3(-14, -6, 3)), Jn];
      // its 4 leads (the build's 12 mm stubs, hidden while these draw - panel.js): each wire starts at its stub's base and
      // carries on its way (up), so they come out of the plug (user 2026-11-02: "deal with the short wires on the steppers")
      // each stub's own shape (hw.nema17: out of the bushing 1.5, a quarter bend r 3, then up the body; the stepper sits a
      // little turned): its root = the mean of its vertices nearest the body, its tip = of those at its far end (world)
      const first = !HR.wireLeads;
      HR.wireLeads = {};
      for (const c of ["Red", "Green", "Blue", "Black"]) {
        const lm = meshes.find((m) => m.userData.name === "X_Stepper_Lead_" + c);   // (hidden: these draw instead)
        if (!lm) continue;
        lm.updateMatrixWorld();
        const pa = lm.geometry.getAttribute("position"), vs = [], v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) vs.push(v.fromBufferAttribute(pa, i).clone().applyMatrix4(lm.matrixWorld));
        const P = HR.wireP[0], mean = (f) => { const q = vs.filter(f); return q.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / (q.length || 1)); };
        const zt = Math.max(...vs.map((q) => q.z)), zb = Math.min(...vs.map((q) => q.z));
        const tip = mean((q) => q.z > zt - 0.4), lowEnd = vs.filter((q) => q.z < zb + 1.4);
        const far = Math.max(...lowEnd.map((q) => q.distanceTo(tip)));   // the root: the low end farthest from the tip
        const root = mean((q) => q.z < zb + 1.4 && q.distanceTo(tip) > far - 0.6);
        root.z = Math.min(...lowEnd.map((q) => q.z)) + 0.6;   // on its axis (the wire's r 0.6)
        HR.wireLeads[c] = { root, tip };
      }
      if (first && typeof applyVisibility === "function") applyVisibility();   // the stubs off (panel.js), once known
    }
    const es = mesh("Endstop_X"), oB = C0(WCORE.openB);
    HR.wirePre = {                                     // each one's way to the opening's front (HR.wireP[0]), not incl. it
      stop: es ? [new THREE.Box3().setFromObject(es).getCenter(new THREE.Vector3()), C0(WCORE.stopUp), oB] : [oB],
      probe: [C0(WCORE.holeF), C0(WCORE.holeB), C0(WCORE.tunE), C0(WCORE.tunW), oB] };
  }
  // the strain relief: a tube tapering r0 -> r1 over the curve's first L mm (it bends with the cord; user 2026-11-02)
  function hrTaper(curve, L, r0, r1) {
    const total = curve.getLength(), n = 16, m = 20, pos = [], nor = [], idx = [];
    let up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= n; i++) {
      const u = Math.min(1, (L * i / n) / total), p = curve.getPointAt(u), t = curve.getTangentAt(u);
      if (Math.abs(up.dot(t)) > 0.95) up = new THREE.Vector3(0, 1, 0);
      const a = new THREE.Vector3().crossVectors(t, up).normalize(), b = new THREE.Vector3().crossVectors(a, t).normalize();
      const r = r0 + (r1 - r0) * Math.pow(i / n, 0.8);
      for (let j = 0; j < m; j++) {
        const th = 2 * Math.PI * j / m, nv = a.clone().multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
        pos.push(p.x + nv.x * r, p.y + nv.y * r, p.z + nv.z * r); nor.push(nv.x, nv.y, nv.z);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + (j + 1) % m, c = a + m, d = b + m;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  // the zip ties (user 2026-11-02: "flat and go through the slots"): a 4.8 x 1.3 mm strap - at the core, down through
  // the hole in front of the top's ridge, under the top skin through the tunnel, up through the hole behind it, then
  // round the hose and the cord on top of it; the head by the front hole. At the Min-end holder the same, under the
  // tray's floor. One mesh, rebuilt with them.
  const ZT = { w: 4.8, t: 1.3 };
  function hrStrap(C, X, r, d, cordAt, H) {            // C: the hose axis at the tie, X: along the hose (the strap's width)
    // like a real zip tie (user 2026-11-02: no sharp bends): straight through the part (H.path: front entry -> back
    // exit, [y, z] off the axis), out of each hole in a smooth curve tangent to the hole AND to the hose, then one even
    // arc round the hose over the top, rising gently over the cord
    const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    const P2 = (y, z) => C.clone().addScaledVector(Y, y).addScaledVector(Z, z), V2 = (y, z) => new THREE.Vector3().addScaledVector(Y, y).addScaledVector(Z, z);
    const Hp = H.path, F = Hp[0], L = Hp[Hp.length - 1], L2 = Hp[Hp.length - 2], F2 = Hp[1];
    const dOut = V2(L[0] - L2[0], L[1] - L2[1]).normalize(), dIn = V2(F2[0] - F[0], F2[1] - F[1]).normalize();   // out of the back hole / down into the front one
    const ang = (q) => Math.atan2(q[1], q[0]), aB = ang(L) + 0.3, aF = ang(F) + 2 * Math.PI - 0.3;   // the arc, from the back over the top to the front
    let ac = Math.PI / 2;                              // the cord round the hose: the strap rises over it
    if (cordAt) { const v = new THREE.Vector3(...cordAt).sub(C); ac = Math.atan2(v.dot(Z), v.dot(Y)); if (ac < aB - 0.6) ac += 2 * Math.PI; }
    const R0 = r + ZT.t / 2 + 0.3, Ra = (a) => R0 + (d ? (d + 0.5) * Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(a - ac) * 1.3))) ** 2 : 0);
    const onArc = (a) => P2(Ra(a) * Math.cos(a), Ra(a) * Math.sin(a)), tanArc = (a) => V2(-Math.sin(a), Math.cos(a));
    const bez = (p0, t0, p3, t3, n) => {               // a cubic from p0 (heading t0) to p3 (arriving along t3), handles a third of the gap
      const h = p0.distanceTo(p3) / 2.5, c = new THREE.CubicBezierCurve3(p0, p0.clone().addScaledVector(t0, h), p3.clone().addScaledVector(t3, -h), p3);
      return c.getPoints(n).slice(1, -1);
    };
    const pts = Hp.map(([y, z]) => P2(y, z));          // through the part (hidden inside it)
    pts.push(...bez(P2(L[0], L[1]), dOut, onArc(aB), tanArc(aB), 10));
    for (let k = 0; k <= 48; k++) pts.push(onArc(aB + (aF - aB) * k / 48));
    pts.push(...bez(onArc(aF), tanArc(aF), P2(F[0], F[1]), dIn, 10));
    const head = new THREE.BoxGeometry(6.5, 5, 7.5).toNonIndexed();   // the head (its latch), by the front hole
    head.applyMatrix4(new THREE.Matrix4().makeBasis(Y, Z, X)).translate(...hrV(P2(F[0] - 5, F[1] + 2)));
    return hrSweep(pts, X, head);
  }
  function hrStrapFlat(C, r, M) {                      // C: the hose axis at the tie height; M.path: the channel's ends ([x, y] off it)
    const Z = new THREE.Vector3(0, 0, 1), [E, F] = M.path, pts = [], P = (x, y) => C.clone().add(new THREE.Vector3(x, y, 0));
    // like a real zip tie (user 2026-11-03: "a zip tie doesn't do right angles"): out of each channel end along the
    // channel, a smooth curve tangent to it AND to the hose, then round the hose's far side (the long way, angle rising)
    const R = r + ZT.t / 2 + 0.3, u = new THREE.Vector2(F[0] - E[0], F[1] - E[1]).normalize();
    const tg = (q, s) => { const d = Math.hypot(q[0], q[1]); return Math.atan2(q[1], q[0]) + s * Math.acos(Math.min(1, R / Math.max(d, R))); };
    const aF = tg(F, 1), aE = tg(E, -1);                 // where it meets the hose, past the out end / before the in end
    const on = (a) => [R * Math.cos(a), R * Math.sin(a)], dir = (a) => [-Math.sin(a), Math.cos(a)];
    const bz = (p0, t0, p1, t1) => {                    // p0 -> p1, leaving along t0, arriving along t1
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 3, c = new THREE.CubicBezierCurve(new THREE.Vector2(...p0),
        new THREE.Vector2(p0[0] + t0[0] * L, p0[1] + t0[1] * L), new THREE.Vector2(p1[0] - t1[0] * L, p1[1] - t1[1] * L), new THREE.Vector2(...p1));
      return c.getPoints(10).slice(1, -1).map((v) => P(v.x, v.y));
    };
    let span = aE - aF; while (span <= 0) span += 2 * Math.PI;
    pts.push(P(E[0], E[1]), P(F[0], F[1]));             // through the channel
    pts.push(...bz(F, [u.x, u.y], on(aF), dir(aF)));
    for (let k = 0; k <= 40; k++) pts.push(P(...on(aF + span * k / 40)));
    pts.push(...bz(on(aE), dir(aE), E, [u.x, u.y]));
    return hrSweep(pts, Z, null);
  }
  function hrSweep(raw, W, head) {                      // a closed strap along raw (smoothed: it rounds into / out of the slots), its width along W
    const pts = new THREE.CatmullRomCurve3(raw, true, "centripetal").getSpacedPoints(160).slice(0, 160);
    const pos = [], nor = [], N = pts.length;
    const ring = (i) => {
      const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N], t = b.clone().sub(a).normalize(), o = new THREE.Vector3().crossVectors(t, W).normalize();
      return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([u, v]) => pts[i].clone().addScaledVector(W, u * ZT.w / 2).addScaledVector(o, v * ZT.t / 2));
    };
    const R0 = pts.map((p, i) => ring(i));
    for (let i = 0; i < N; i++) {
      const A = R0[i], B = R0[(i + 1) % N];
      for (let k = 0; k < 4; k++) {
        const a = A[k], b = A[(k + 1) % 4], c = B[(k + 1) % 4], e = B[k], n = new THREE.Vector3().crossVectors(b.clone().sub(a), e.clone().sub(a)).normalize();
        for (const v of [a, b, c, a, c, e]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); }
      }
    }
    if (head) { pos.push(...head.attributes.position.array); nor.push(...head.attributes.normal.array); head.dispose(); }
    return { pos, nor };
  }
  function hrTies(hp) {
    const r = meta.hose.od / 2, d = meta.hose.cord && cordMesh ? meta.hose.cord.d : 0, pos = [], nor = [];
    for (const k of ["t1", "t2", "cl"]) {
      const i = HR.ix[k], a = hp[Math.max(0, i - 1)], b = hp[Math.min(hp.length - 1, i + 1)];
      const X = new THREE.Vector3(1, 0, 0);            // the channels / slots are square to X: the strap stays upright (user: not angled)
      const C = new THREE.Vector3(...hp[i]);
      if (k === "cl") C.x = TIE.clamp.x;              // the holder's slots, a little past the clamp point (the hose is straight there)
      const S = hrStrap(C, X, r, d, HR.cordAt && HR.cordAt[k], k === "cl" ? TIE.clamp : TIE.core);
      pos.push(...S.pos); nor.push(...S.nor);
    }
    const S0 = new THREE.Vector3(...hp[0]), zt = S0.z + TIE.mount.dz;   // the upper mount's: round the hose where it is at that height
    let Ca = S0.clone().add(new THREE.Vector3(TIE.mount.at[0], TIE.mount.at[1], TIE.mount.dz));
    for (let i = 1; i < hp.length; i++) if ((hp[i - 1][2] - zt) * (hp[i][2] - zt) <= 0 && hp[i][2] !== hp[i - 1][2]) {
      const f = (zt - hp[i - 1][2]) / (hp[i][2] - hp[i - 1][2]); Ca = new THREE.Vector3(...hp[i - 1]).lerp(new THREE.Vector3(...hp[i]), f); break;
    }
    const Mpath = TIE.mount.path.map(([x, y]) => [S0.x + TIE.mount.at[0] + x - Ca.x, S0.y + TIE.mount.at[1] + y - Ca.y]);   // the channel, fixed
    const Mt = hrStrapFlat(Ca, r + 1.5, Object.assign({}, TIE.mount, { path: Mpath }));
    pos.push(...Mt.pos); nor.push(...Mt.nor);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }
  function updateHose(dx, dy, dz) {
    if (HR_PHONE && HR.hose && !HR.quick && !HR.now) {   // phones: frozen while it moves, settled once 250 ms after it stops
      HR.pend = [dx, dy, dz]; clearTimeout(HR.timer);
      HR.timer = setTimeout(() => { HR.now = true; try { if (hoseMesh) updateHose(...HR.pend); } finally { HR.now = false; } }, 250);
      return;
    }
    const route = hoseRoute(meta.hose, dx, dz), w = hrWorld(route, dy, dz), R = hoseRopes(route, w, dx, dy, dz);
    const pts = R ? R.hp.map((q) => new THREE.Vector3(...q)) : w;
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength();
    hoseMesh.geometry.dispose();
    hoseMesh.geometry = new THREE.TubeGeometry(curve, Math.ceil(len / 4), meta.hose.od / 2, 28, false);
    hoseWire.repeat.set(len / 10, 1);                    // wire pitch ~10 mm
    if (cordMesh && R && R.cp) {
      const cc = new THREE.CatmullRomCurve3(R.cp.map((p) => new THREE.Vector3(...p)), false, "centripetal");
      cordMesh.geometry.dispose();
      cordMesh.geometry = new THREE.TubeGeometry(cc, Math.ceil(cc.getLength() / 12), meta.hose.cord.d / 2, 8, false);
      const rl = meta.hose.cord.relief;
      if (reliefMesh && rl && meta.hose.cord.base) { reliefMesh.geometry.dispose(); reliefMesh.geometry = hrTaper(cc, rl.l + 5, rl.d / 2, rl.cd / 2 + 0.6); }
    }
    if (tieMesh && R) { tieMesh.geometry.dispose(); tieMesh.geometry = hrTies(R.hp); }
    if (wireMesh) hrWireMeshes(R && HR.wireP);
    hrPowerMeshes(R && R.cp);
  }
  // ---- the core's wires drawn one by one (user 2026-11-02: "run separately", see through the sleeves): each wire its
  // own tube in its colour, at its own place across the bundle (packed in the sleeve), from its own start (the motor's
  // 4 off its plug up behind the stepper; the endstop's pair off the switch; the touch plate's pair out of the tunnel)
  // along the bundle's path, out of the slot inside the box to its own connector. The sleeve (3/8" PET, V1E's): over the
  // bundle from the top of the core's -X face into the box's slot; Layers > See through sleeves makes it clear.
  const WIRE_SET = [   // run, colour, r (mm), [across, up] in the bundle (mm)
    // the motor's 4 in the stubs' order (hw.nema17: red, green, blue, black side by side; user: "the same color order")
    ["motor", [0.8, 0.1, 0.1], 0.6, [-1.9, 0.6], "Red"], ["motor", [0.1, 0.6, 0.25], 0.6, [-0.6, 0.6], "Green"],
    ["motor", [0.12, 0.3, 0.85], 0.6, [0.6, 0.6], "Blue"], ["motor", [0.05, 0.05, 0.05], 0.6, [1.9, 0.6], "Black"],
    ["stop", [0.8, 0.1, 0.1], 0.6, [3.4, 0.6]], ["stop", [0.05, 0.05, 0.05], 0.6, [3.4, -0.9]],
    ["probe", [0.85, 0.12, 0.12], 1.0, [-3.3, 0.6]], ["probe", [0.05, 0.05, 0.05], 1.0, [-1.0, -3.3]]];
  const WIRE_TO = { motor: "jp3.motor.X", stop: "jp3.in.25", probe: "jp3.in.36" };
  const SLEEVE_R = 4.9;                                 // 3/8" sleeve over the wires
  // ---- the 24 V supply's cables, drawn (user 2026-11-03: "I still don't see the wires"): its mains cord and its 24 V
  // lead. With the hub: the cord from the CONTROLLER plug tied along the router cord - up its tail to the beam's end,
  // to the Min-end clamp, then along the hose's lower run in the holders past the middle one (Hose_Holder_Shorty_2,
  // by the brick's far end), then a loop back under into the side of the brick's far end (user: "run with the router
  // cord past the middle hose guide, then loop around under to the side of the power brick"); else the Wiring layer's
  // route as it hangs (wrDrawn). The lead: one black cable out of the brick's near end to the box's +X slot, split into
  // red + black inside to the power terminal (user: "comes out of the brick as a black wire before splitting").
  let PWR_MESH = null;                                 // { cord, red, black }
  function hrPowerMeshes(cp) {
    if (typeof wrPath !== "function" || typeof LR4Wiring === "undefined") return;
    const V = (x, y, z) => new THREE.Vector3(x, y, z), hub = optsOn().hub, runs = LR4Wiring.runsFor(hub);
    const ac = runs.find((r) => r.id === "psu-ac"), dc = runs.find((r) => r.id === "psu-dc");
    if (!PWR_MESH) {
      const mk = (name, label, c) => { const m = addMesh(new THREE.BufferGeometry(), material(c), { name, label, group: "Electronics", motion: "hose", source: "hardware", color: c }); return m; };
      PWR_MESH = { cord: mk("PSU_MainsCord", "24 V supply's mains cord (with the hub: from the CONTROLLER socket, tied along the router cord to the beam's end, then along the braces to the supply's far end)", [0.06, 0.06, 0.065]),
        red: mk("PSU_Lead24V", "24 V lead (+, red): the supply's near end into the Jackpot's power terminal", [0.75, 0.08, 0.06]),
        black: mk("PSU_Lead0V", "24 V lead (-, black)", [0.05, 0.05, 0.06]),
        lead: mk("PSU_LeadCable", "24 V lead: the supply's own 2-core cable (black jacket) to the Jackpot box, split into red / black inside", [0.07, 0.07, 0.075]) };
    }
    const tube = (m, pts, r) => {
      const q = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1);
      m.geometry.dispose();
      if (q.length < 2) { m.geometry = new THREE.BufferGeometry(); m.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3)); m.visible = false; return; }
      const c = new THREE.CatmullRomCurve3(q, false, "centripetal");
      m.geometry = new THREE.TubeGeometry(c, Math.max(8, Math.ceil(c.getLength() / 6)), r, 8, false);
      m.visible = true;
    };
    const p = ac && wrPath(ac);
    let pts = null;
    const brick = meshes.find((m) => m.userData.name === "PSU_24V"), guide = meshes.find((m) => m.userData.name === "Hose_Holder_Shorty_2");
    if (p && hub && cp && HR.cordE && HR.cx && HR.cx.cl !== undefined && brick && typeof HUB !== "undefined" && HUB.outlet && HUB.outlet.psu) {
      const E = V(...HR.cordE), pb = new THREE.Box3().setFromObject(brick), F = wrEnd(ac.to);   // F: the brick's far end
      const xg = guide ? new THREE.Box3().setFromObject(guide).max.x + 8 : F.x + 40;          // just past the middle guide
      let kE = HR.cx.cl; cp.forEach((q, i) => { if (i > HR.cx.cl && V(...q).distanceTo(E) < V(...cp[kE]).distanceTo(E)) kE = i; });
      // the hose's lower run back from the clamp (its x rising, toward the U-turn), as far as the middle guide
      let kS = HR.cx.cl;
      while (kS > 0 && cp[kS - 1][0] >= cp[kS][0] - 1 && cp[kS][0] < xg) kS--;
      const run = cp.slice(kS, kE + 1).map((q) => V(...q).add(V(0, 0, 8)));          // on top of the router cord, along the beam
      if (run[0].x < xg) run.unshift(V(xg, run[0].y, run[0].z));                      // (the U-turn short of it: on along the holders)
      const S = run[0];
      // a wide, gradual loop past the guide, back into the brick's end level - above the bottom strut plate it sits on
      // (user 2026-11-03: "goes down at a sharp angle and goes through the bottom strut plate")
      // and through the window of the brace between them (open y min+36..88, z min+38..98: the core wires' sleeve's too)
      const zF = Math.max(F.z, pb.min.z + 8);
      const bw = meshes.filter((m) => /^Brace_(\d+|Max)$/.test(m.userData.name || "")).map((m) => new THREE.Box3().setFromObject(m))
        .find((b) => b.min.x > F.x - 1 && b.max.x < xg + 10);
      const win = bw ? [bw.min.x - 10, bw.min.x + 2, bw.max.x - 2, bw.max.x + 10].map((x) => V(x, bw.min.y + 62, bw.min.z + 60)) : [];   // straight through it
      const W1 = win.length ? win[1] : V(F.x + 30, F.y, zF + 10);
      const loop = [V(F.x, F.y, zF), V(F.x + 6, F.y - 4, zF + 2), ...win, V(xg + 30, (W1.y + S.y) / 2, (W1.z + S.z) / 2), V(xg + 18, S.y, S.z - 12)];
      const tail = cp.slice(kE).map((q) => V(...q).add(V(-11, 0, 0)));               // beside it, outside (away from the panel)
      // with it down and round the bottom of its U (in the panel's plane), on along the bottom past where it turns up
      // into ROUTER, then its own round turn up into CONTROLLER (further toward the front) - user 2026-11-03
      const zMin = Math.min(...tail.map((q) => q.z));
      let kB = tail.length - 1; while (kB > 1 && tail[kB].z > zMin + 3) kB--;            // the bottom's last point (it rises after)
      const t2 = tail.slice(1, kB + 1), B0 = t2[t2.length - 1], P = V(...HUB.outlet.psu).add(V(-31, 0, 0)), xu = B0.x, R2 = 40;
      const yT = Math.min(B0.y - 10, P.y + R2);
      pts = [...loop, ...run, ...t2, V(xu, yT, B0.z), V(xu, P.y + 0.29 * R2, B0.z + 0.29 * R2), V(xu, P.y, B0.z + R2),
        V(xu, P.y, P.z - 70), V(P.x - 12, P.y, P.z - 8), P];
    } else if (p) pts = typeof wrDrawn === "function" && typeof wrLen === "function" ? wrDrawn(ac, p, wrLen(p)) : p;
    tube(PWR_MESH.cord, pts || [], 3.5);
    const d = dc && wrPath(dc);                       // [near end, outside the slot, in the slot, ..., the terminal]
    tube(PWR_MESH.lead, d ? d.slice(0, 3).concat(d[2].clone().add(V(-6, 0, 0))) : [], 2.4);
    const pr = d ? [d[2].clone().add(V(-6, 0, 0)), ...d.slice(3)] : [];
    tube(PWR_MESH.red, pr.map((q, i) => q.clone().add(V(0, 0, i ? 1.4 : 0.6))), 1.1);
    tube(PWR_MESH.black, pr.map((q, i) => q.clone().add(V(0, 0, i ? -1.4 : -0.6))), 1.1);
  }
  function hrWireMeshes(on) {
    const empty = () => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    wireMesh.geometry.dispose();
    if (sleeveMesh) sleeveMesh.geometry.dispose();
    if (!on) { wireMesh.geometry = empty(); if (sleeveMesh) sleeveMesh.geometry = empty(); return; }
    if (typeof wrBoard === "function") wrBoard();      // the stand-in board + the ESP32's keep-out under the wires' ends
    const V = (...a) => new THREE.Vector3(...a), P = HR.wireP, trunk = new THREE.CatmullRomCurve3(P, false, "centripetal");
    const N = Math.max(8, Math.ceil(trunk.getLength() / 10)), S = trunk.getSpacedPoints(N), F = trunk.computeFrenetFrames(N, false);
    let k1 = 0;                                       // the trunk's sample where the motor's leads join (the sleeve starts there)
    S.forEach((q, i) => { if (q.distanceTo(P[HR.wireJ]) < S[k1].distanceTo(P[HR.wireJ])) k1 = i; });
    const off = (i, o) => S[i].clone().addScaledVector(F.normals[i], o[0]).addScaledVector(F.binormals[i], o[1]);
    const box = meshes.find((m) => m.userData.name === "Jackpot3_Box"), bq = box ? box.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    // each wire to its own pin (user 2026-11-02): the header's pins 2.54 mm apart, centred on the spot - along the PCB's
    // x for a motor's 4 (wiring.js wrBoard's blocks: 10.2 mm that way), along its y for an input's 2. Pin order: the
    // WIRE_SET order (GUESS - the stepper's colour order varies; match your lead to the board's A+ A- B+ B- label)
    const PCB = LR4Wiring.JP3.pcb, seen = {}, up = V(...PCB.n).applyQuaternion(bq);   // up: off the board's top
    const spot = (id, k) => { const s = LR4Wiring.JP3.spots[id], at = wrEnd({ board: id }); if (!at) return null;
      const ax = V(...(/motor/.test(id) ? PCB.x : PCB.y)).applyQuaternion(bq);
      return { at: at.addScaledVector(ax, (k - (s.pins - 1) / 2) * 2.54), out: V(...s.out).applyQuaternion(bq) }; };
    const geos = [];
    for (const [run, rgb, r, o, lead] of WIRE_SET) {
      const k = seen[run] = (seen[run] === undefined ? 0 : seen[run] + 1);   // this wire's pin on its header
      let pts = [];
      const lb = lead && HR.wireLeads && HR.wireLeads[lead];
      if (run === "motor" && lb) {                    // out of the side like the stubs (user): out 1.5, the bend, up - in a row
        const d = lb.tip.clone().sub(lb.root).setZ(0).normalize(), p1 = lb.root.clone().addScaledVector(d, 5), pc = p1.clone().add(V(0, 0, 3));
        pts = [lb.root, lb.root.clone().addScaledVector(d, 2.5), p1];   // out of the plug's outer face, level
        for (const t of [0.3, 0.6, 0.9, 1.2, Math.PI / 2]) pts.push(pc.clone().addScaledVector(d, 3 * Math.sin(t)).add(V(0, 0, -3 * Math.cos(t))));
        const p2 = pts[pts.length - 1], up = lb.tip.clone().sub(p2).normalize(), Jn = P[HR.wireJ];
        for (const h of [6, 12, 18]) pts.push(p2.clone().addScaledVector(up, h));   // up the body's side, still side by side
        void Jn;                                       // then on to the bundle at the join (its next points)
      }
      else if (run === "motor" && HR.wireMotor) pts = HR.wireMotor.slice(0, 2).map((q) => q.clone().add(V(0, o[0] * 0.6, o[1] * 0.6)));
      else if ((run === "stop" || run === "probe") && HR.wirePre) pts = HR.wirePre[run].map((q) => q.clone().add(V(o[0] * 0.25, 0, o[1] * 0.25)));   // through the tunnel / opening
      for (let i = run === "motor" ? k1 : 0; i <= N; i++) pts.push(off(i, o));
      const sp = spot(WIRE_TO[run], k), end = pts[pts.length - 1];
      // straight down into the connector's top (user 2026-11-02), each onto its own pin: square to the board
      if (sp) pts.push(end.clone().add(V(-14, 0, 0)), ...hrBoxRoute(run, o), sp.at.clone().addScaledVector(up, 14), sp.at.clone().addScaledVector(up, 6), sp.at.clone().addScaledVector(up, 1), sp.at);
      const c = new THREE.CatmullRomCurve3(pts, false, "centripetal"), g = new THREE.TubeGeometry(c, Math.max(6, Math.ceil(c.getLength() / (lb ? 4 : 10))), r, 6, false);
      const col = new THREE.Color().setRGB(...rgb).convertSRGBToLinear(), n = g.getAttribute("position").count, ca = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) col.toArray(ca, j * 3);
      g.setAttribute("color", new THREE.BufferAttribute(ca, 3));
      geos.push(g);
    }
    wireMesh.geometry = hrMerge(geos);
    if (sleeveMesh) {
      const sc = new THREE.CatmullRomCurve3(S.slice(k1 + 2, N - 1), false, "centripetal");
      sleeveMesh.geometry = new THREE.TubeGeometry(sc, Math.ceil(sc.getLength() / 8), SLEEVE_R, 12, false);
    }
  }
  { const c = document.getElementById("lay-sleeve"); if (c) c.addEventListener("change", () => hrSleeveClear(c.checked)); }
  // inside the Jackpot box, from the slot (its +X wall, in front of the board's motor edge) to each header - round the
  // board's edges, not across it: the ESP32's antenna hangs off the +y edge by the inputs (user 2026-11-02: keep wires
  // off it). Board frame (wiring.js wrBoardPt): the motor's along the front
  // edge to its header; the inputs' along the front, up the -X end (the box's open end) and along the back edge from
  // that side - the headers are at x 8-24, the antenna at x 44-62 (>= 20 mm off); then straight down onto the pins. GUESS.
  // [x, y, z] board frame; inside the box + lid (user: "stay within the bounds of the Jackpot box, including the lid";
  // section 2026-11-02: floor z 113, back wall y 832, the lid's top sloping 176 -> 146 front to back, its fan down to
  // z 162 at the front): the front run low under the fan, corners rounded in (a sharp one overshot the walls)
  const JP3_ROUTE = { motor: [[62, -7, 20], [22, -7, 20]],
    in: [[62, -7, 20], [6, -7, 20], [0, -1, 21], [0, 40, 22], [0, 74, 24], [4, 80, 24]] };
  function hrBoxRoute(run, o) {
    if (typeof wrBoardPt !== "function" || typeof LR4Wiring === "undefined") return [];
    const d = 0.7;                                    // the wires side by side
    return (run === "motor" ? JP3_ROUTE.motor : JP3_ROUTE.in).map(([x, y, z]) => wrBoardPt(x + o[0] * d, y + o[1] * d, z + o[1] * d)).filter(Boolean);
  }
  function hrSleeveClear(on) {                         // Layers > See through sleeves
    HR.sleeveClear = !!on;
    if (!sleeveMesh) return;
    const m = sleeveMesh.material;
    m.transparent = HR.sleeveClear; m.opacity = HR.sleeveClear ? 0.22 : 1; m.depthWrite = !HR.sleeveClear; m.needsUpdate = true;
    sleeveMesh.renderOrder = HR.sleeveClear ? 2 : 0;
  }
  // Part 52b: the hose length this size needs - the route's longest over the travel's corners (the span from the
  // beam's end to the fixed end - the hub's port, or the floor point - stretches as the gantry runs in Y).
  // Part 53b: along the settled rope (HR.need: the wiring report's corner moves measure it), else the taut route
  function hoseNeed() {
    if (!meta || !meta.hose) return null;
    if (HR.need) return HR.need;
    const t = meta.travel, L = [];
    for (const dx of t.x) for (const dy of t.y) for (const dz of [t.z[0], t.z[1]]) {
      const pts = hoseRoute(meta.hose, dx, dz).map(([x, y, z, f]) => (f === "table" ? new THREE.Vector3(x, y, z) : new THREE.Vector3(x, y + dy, z + dz)));
      L.push(new THREE.CatmullRomCurve3(pts, false, "centripetal").getLength());
    }
    return { max: Math.max(...L), min: Math.min(...L) };
  }
  // cordRoute mirrors lr4.cord_route (Python) - keep the two in step
  let cordMesh = null, sleeveMesh = null;   // sleeveMesh: over the core's wires (Part 53b)
  function cordRoute(curve, h, c, tip, tip2, dx, pose) {
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const xStart = h.port[0] + dx + h.turn + 10.0, xe = h.port[0] + dx + h.core_end_dx;
    const i0 = curve.findIndex((p) => p[0] >= xStart);
    let iTurn = 0;
    for (let i = 1; i < curve.length; i++) if (curve[i][0] > curve[iTurn][0]) iTurn = i;
    let iEnd = iTurn;
    for (let i = i0; i < iTurn; i++) if (curve[i][0] >= xe) { iEnd = i; break; }
    const arc = [0];
    for (let i = 1; i < curve.length; i++) arc.push(arc[i - 1] + dist(curve[i], curve[i - 1]));
    const square = (v, t) => {               // v made square to the unit tangent t, unit length (or null)
      const k = v.reduce((s, x, q) => s + x * t[q], 0);
      const w = v.map((x, q) => x - k * t[q]), wl = Math.hypot(...w);
      return wl > 1e-6 ? w.map((x) => x / wl) : null;
    };
    const cross = (t, e) => [t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0]];
    // a frame carried along the hose (e1 up at the core-top run's start): each cable's place is an angle in it
    const tans = [], e1s = [];
    let e1 = null;
    for (let i = i0; i < curve.length; i++) {
      const a = curve[Math.max(i - 1, 0)], b = curve[Math.min(i + 1, curve.length - 1)];
      const tn = dist(a, b) || 1, t = b.map((v, k) => (v - a[k]) / tn);
      e1 = square(e1 || [0, 0, 1], t) || e1;
      tans[i] = t; e1s[i] = e1;
    }
    const ang = (v, i) => {
      const e = e1s[i], e2 = cross(tans[i], e);
      return Math.atan2(v.reduce((s, x, q) => s + x * e2[q], 0), v.reduce((s, x, q) => s + x * e[q], 0));
    };
    const at = (s_) => { let best = i0; for (let i = i0; i < curve.length; i++) if (Math.abs(arc[i] - s_) < Math.abs(arc[best] - s_)) best = i; return best; };
    const a1 = arc[iEnd], a2 = arc[iTurn];
    const keys = [a1, a1 + c.wrap, a2 - c.turn_blend, a2 + c.turn_blend];
    for (let k = 1; k < keys.length; k++) keys[k] = Math.max(keys[k], keys[k - 1]);
    const th = [ang(c.core_side, i0), ang(c.up_dir, at(keys[1])), 0, ang(c.lo_dir, at(keys[3]))];
    th[2] = th[1];
    for (let k = 1; k < th.length; k++) {   // (no jumps across +-180)
      while (th[k] - th[k - 1] > Math.PI) th[k] -= 2 * Math.PI;
      while (th[k] - th[k - 1] < -Math.PI) th[k] += 2 * Math.PI;
    }
    const rads = [c.core_r, c.up_r, c.up_r, c.lo_r];
    let pts = [], acc = c.step;
    for (let i = i0; i < curve.length; i++) {
      if (i > i0) acc += arc[i] - arc[i - 1];
      if (acc < c.step && i !== curve.length - 1) continue;
      acc = 0;
      const s = arc[i];
      let k = keys.findIndex((q) => s < q);
      if (k < 0) k = keys.length;
      let q, r;
      if (k === 0) { q = th[0]; r = rads[0]; }
      else if (k === keys.length) { q = th[th.length - 1]; r = rads[rads.length - 1]; }
      else {
        const w = (s - keys[k - 1]) / ((keys[k] - keys[k - 1]) || 1);
        q = (1 - w) * th[k - 1] + w * th[k];
        r = (1 - w) * rads[k - 1] + w * rads[k] + (k === 1 ? c.lift * Math.sin(Math.PI * w) : 0);
      }
      const e = e1s[i], e2 = cross(tans[i], e);
      pts.push(curve[i].map((x, j) => x + (Math.cos(q) * e[j] + Math.sin(q) * e2[j]) * r));
      if (c.exit && i > iTurn && pts[pts.length - 1][0] < c.exit.x) break;
    }
    if (c.exit) {                            // off the lower run, down into the box's opening (it rides the beam)
      const sh = (p) => p.map((v, k) => v + (pose ? pose[k] : 0));
      const e = sh(c.exit.p), d = c.exit.d, last = pts[pts.length - 1], via = (c.exit.via || []).map(sh);
      const pOut = e.map((v, k) => v - d[k] * 12.0), first = via.length ? via[0] : pOut;
      const n = Math.max(1, Math.floor(Math.hypot(...first.map((v, k) => v - last[k])) / 35.0));
      for (let k = 1; k <= n; k++) {           // a gradual descent (eased) to the first via point
        const f = k / (n + 1), e_ = (1 - Math.cos(Math.PI * f)) / 2;
        pts.push([last[0] + (first[0] - last[0]) * f, last[1] + (first[1] - last[1]) * e_, last[2] + (first[2] - last[2]) * e_]);
      }
      pts.push(...via);
      pts.push(pOut, e.map((v, k) => v - d[k] * 1.0));   // stops at the wall, the wires go in
    }
    if (tip) {                               // from the router: out of the stub, then straight back
      const td = tip2.map((v, k) => v - tip[k]), tl = Math.hypot(...td);
      const p1 = tip.map((v, k) => v + td[k] / tl * c.lead);
      pts = [tip, p1, [p1[0], pts[0][1], (p1[2] + pts[0][2]) / 2]].concat(pts);
    }
    return pts;
  }

  // ---- bill of materials (build/bom.json via lr4.json): one collapsible section per table ----
  // ---- BOM at this size (LR4Model.bom: the reference BOM with the size-dependent rows redone) ----
  const bomAtSize = () => LR4Model.bomOptions(LR4Model.bom(cfg, S, meshes.filter(fitted).map((m) => m.userData.name)), optsOn());
  let bomReady = false;
  function renderBom() {
    if (!bomReady) return;
    let secs = bomAtSize();
    const body = document.getElementById("bom-body"), sum = document.getElementById("bom-sum");
    if (bristleLen === "long")                        // the Options step's extra-long bristles: that file to print
      secs = secs.map((sec) => Object.assign({}, sec, { rows: (sec.rows || []).map((r) => (r[1] === "TPU_Bristles_22mm" ? [r[0], "TPU_Bristles_32mm_Extra_Long", ...r.slice(2)] : r)) }));
    {                                                  // the router in use (Part 45b) + its mount's printed set (45c: Makita / DeWalt)
      const rt = typeof RT !== "undefined" && LR4Routers.ROUTERS[RT.set.router], mt = rt && rt.mount;
      const MS_ = { makita: ["Makita", "Makita 701 / T1 tool mount (Printables 1033926)"], dewalt: ["DeWalt", "DeWalt 611 tool mount (Printables 1034374)"] }[mt];
      if (rt) secs = secs.map((sec) => Object.assign({}, sec, { rows: (sec.rows || []).map((r) => {
        if (/trim router$/.test(r[1] || "")) return [r[0], rt.name, ...r.slice(2)];
        if (MS_ && /_Kobalt$/.test(r[1] || "") && /^Kobalt tool mount/.test(r[3] || "")) return [r[0], r[1].replace(/Kobalt$/, MS_[0]), r[2], MS_[1], ...r.slice(4)];
        return r;
      }) }));
    }
    {                                                  // the wiring at this size (Part 51b: the routes over the travel, wiring.js)
      const wf = typeof LR4WiringView !== "undefined" && LR4WiringView.fit(), R = wf && wf.runs, m = (v) => (v / 1000).toFixed(1);
      const hn = hoseNeed();
      if (R) {
        const by = (re) => LR4Wiring.RUNS.filter((r) => re.test(r.id) && R[r.id]);
        const ext = by(/-motor$/).filter((r) => R[r.id].ext).map((r) => `${r.name.replace(/ motor$/, "")} ${R[r.id].ext}`).join(", ");
        const own = by(/-stop$/).filter((r) => R[r.id].cut), tot = own.reduce((s, r) => s + R[r.id].cut, 0), pr = R.probe;
        secs = secs.map((sec) => Object.assign({}, sec, { rows: (sec.rows || []).flatMap((r) => {
          if (/^Stepper wire extension/.test(r[1] || "")) return [[wf.extenders, r[1], `${ext} - routed over the travel at this size (GUESS routes; Layers > Wiring)`],
            [1, `2-wire lead for the endstops, ~${m(tot)} m in all (your own)`, `crimped or soldered to each switch (V1E docs), cut to fit: ` +
              own.map((q) => `${q.name.replace(/ endstop$/, "")} ${m(R[q.id].cut)}`).join(", ") + " m; the far ones spliced to their extender"]];
          if (pr && !pr.reaches && /^V1E Tiny Touch Plate/.test(r[1] || "")) return [[r[0], r[1], `${r[2]}; its 2 m wire is ${pr.short} mm short at this size: extend it`]];
          if (/^2-1\/2" x 20 ft clear PVC/.test(r[1] || "") && hn) {   // Part 52b: the length this size needs
            const spare = 20 * 12 * IN - hn.max, to = optsOn().hub ? "the table hub's dust port" : "the floor off the Min end";
            return [[r[0], r[1], `${r[2]}; this size needs ~${m(hn.max)} m from the shoe to ${to} (${hn.rope ? "as it hangs, the longest over the travel" : "gantry at the far Y stop"}): ` +
              (spare >= 0 ? `~${m(spare)} m to spare` : `${m(-spare)} m SHORT - a longer hose`)],
              // its ground (user 2026-11-03; V1E docs: one end, to your power source's ground): the hub's inlet box, no outlet
              optsOn().hub ? [1, "Hose ground: a green panel binding post (e.g. NOYITO M5, 4 mm banana), 14 AWG green wire ~0.4 m, 2 ring terminals, a 2-1/2\" hose clamp",
                "bare the hose's steel wire at its port end, clamp a ring terminal to it; its short lead under the post's knob (unplugs without tools); the post in the " +
                "hub panel below the port (counterbore the 5/8\" plywood from behind if its thread is short), its back stud to the inlet box's ground nut (with the cables' bares and the inlet's ground pigtail) - no outlet used"]
                : [1, "Hose ground: 14 AWG green wire, a ring terminal, a 2-1/2\" hose clamp", "bare the hose's steel wire at one end, clamp the ring terminal to it; " +
                  "the lead to a grounded screw (the switch panel's box, or the 24 V supply's earth terminal) - no outlet used"],
              // the hub's mains cables (user 2026-11-03; scene.js hubCables: the drawn runs + 150 mm in each box)
              ...(optsOn().hub && HUB.cables && HUB.cables.len.Paddle ? [
                [1, `12-3 NM-B cable (12 AWG, yellow), ~${m(HUB.cables.len.Paddle + HUB.cables.len.Toggles + 300)} m`, "two runs stapled to the panels' backs: inlet box <-> paddle switch " +
                  `(~${m(HUB.cables.len.Paddle)} m: black = line out, red = switched back, white = neutral, bare = ground) and the router + vac toggles -> outlet box ` +
                  `(~${m(HUB.cables.len.Toggles)} m: black = router, red = vac); along the side and front panels' backs above the boxes; + spare`],
                [1, `12-2 NM-B cable (12 AWG, yellow), ~${m(HUB.cables.len.Accessory + HUB.cables.len.Jumper + 150)} m`, "jumpers: inlet box -> accessory box (stapled to the hub panel's back), " +
                  "the paddle's box -> the toggles' box (switched line, neutral, ground)"],
                [1, "Switch panel: 5/8\" plywood ~305 x 190 mm (the hub panel's height: a flush corner), a 1-gang + a 3-gang new-work box, a 3-gang combination plate (blank + 2 toggles)",
                  "hangs under the front apron by the hub's end; the paddle switch covers its 1-gang box; drill the plate's blank 22 mm for the power lamp"],
                [HUB.cables.staples + 4, "Insulated cable staples for 12 AWG NM", "within 12 in of each box, then <= 300 mm apart (+ spares)"],
                [5, "NM cable clamps / connectors for the box knockouts", "where each cable enters a box (the PVC boxes' built-in clamps may do)"]] : [])];
          }
          if (R["psu-ac"] && R["psu-ac"].cut && /^24 V power supply/.test(r[1] || ""))
            return [[r[0], r[1], `${r[2]}; on the gantry: its mains cord ${optsOn().hub ? "plugged into the hub's CONTROLLER socket (the accessory duplex's top)" : "from the switch panel"} ~${m(R["psu-ac"].cut)} m, into the beam along the braces (V1E docs; GUESS route)`]];
          return [r];
        }) }));
      }
    }
    const open = new Set([...body.querySelectorAll("details")].filter((d) => d.open).map((d) => d.dataset.title));
    body.textContent = "";
    if (!secs.length) { sum.textContent = "Not in this export."; return; }
    const ext = (url, text, title) => { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = text; if (title) a.title = title; return a; };
    {                                                  // buying from V1E: what the hardware kit covers (js/v1e_store.js)
      const S = V1EStore, p = document.createElement("div");
      p.className = "bom-store";
      const line = (...xs) => { const q = document.createElement("p"); q.append(...xs); p.appendChild(q); };
      line("V1 Engineering: the ", ext(S.KIT.url, S.KIT.name + " ↗"), ` covers the rows tagged "in the kit", and the Jackpot3 controller can be added to it (not the ${S.KIT_NOTE.not}); ` +
        `"store ↗" opens a part on its own. Printed parts: the `, ext(S.PRINTED.url, S.PRINTED.name + " ↗"), ".");
      line("EU: hawiwe.de sells the same ", ext(S.KIT_EU.url, "LowRider 4 hardware kit ↗"), ", ",
        ext(S.PRINTED_EU.url, "printed parts ↗"), ", the XZ plates and a screw set. Outside the US, the Jackpot3 also comes from ", ext(S.JP3_ELECROW.url, "Elecrow ↗"), ".");
      line("Built for you: Northwoods Custom Creations sells ", ext(S.NORTHWOODS.partial, "partly built ↗"), " and ",
        ext(S.NORTHWOODS.full, "fully built ↗"), " LR4s, or just the main parts in PET-CF if your printer can't print it (",
        ext(S.NORTHWOODS.petcf.url, "PET-CF printed parts ↗", S.NORTHWOODS.petcf.name), ").");
      const src = document.createElement("p"); src.className = "src";
      src.append(`We may have this wrong: kits, links and stock change. V1 Engineering's own pages are the source - `,
        ext("https://www.v1e.com/collections/lowrider-parts", "the V1E store ↗"), " and ", ext("https://docs.v1e.com/lowrider/", "LowRider docs ↗"),
        ` - and where they differ from this, they're right. (Checked ${S.CHECKED}.)`);
      p.appendChild(src);
      body.appendChild(p);
    }
    for (const s of secs) {
      const d = document.createElement("details"), sm = document.createElement("summary");
      d.dataset.title = s.title;
      d.open = open.has(s.title);
      sm.textContent = s.title;
      const em = document.createElement("em");
      em.textContent = `${s.rows.length} row${s.rows.length === 1 ? "" : "s"}`;
      sm.appendChild(em);
      d.appendChild(sm);
      if (s.note) { const nt = document.createElement("p"); nt.className = "note"; nt.textContent = s.note; d.appendChild(nt); }
      const sx = V1EStore.section(s.title);
      if (sx) {
        const nt = document.createElement("p"); nt.className = "note"; nt.append(sx.text + " ", ext(sx.url, sx.name + " ↗"));
        for (const a of sx.alt) nt.append(" · ", ext(a.url, `${a.label} ↗`, a.name));
        d.appendChild(nt);
      }
      const ic = s.columns.findIndex((c) => V1EStore.ITEM_COLS.includes(c));
      const shop = s.rows.map((r) => (ic >= 0 ? V1EStore.lookup(s.title, r[ic]) : null)), shopCol = shop.some(Boolean);
      const wrap = document.createElement("div"), t = document.createElement("table");
      wrap.className = "bom-wrap";
      const hr = t.createTHead().insertRow();
      for (const c of [...s.columns, ...(shopCol ? ["Where to buy"] : [])]) { const th = document.createElement("th"); th.textContent = c; hr.appendChild(th); }
      const tb = t.createTBody();
      for (const r of s.rows) {
        const tr = tb.insertRow();
        r.forEach((v, i) => {
          const td = tr.insertCell();
          td.textContent = v === null ? "" : String(v);
          if (typeof v === "number") td.className = "num";
          if (s.columns[i] === "Check") td.className = String(v).startsWith("CHECK") ? "bad" : "ok";
        });
        if (shopCol) {                                 // in the hardware kit, or its own store page
          const td = tr.insertCell(), x = shop[s.rows.indexOf(r)];
          td.className = "store";
          if (x && x.kit) {
            const k = document.createElement("span"), opt = x.kit === "option";
            k.className = opt ? "in-kit opt" : "in-kit"; k.textContent = opt ? "kit option" : "in the kit";
            k.title = opt ? `Can be added to the ${V1EStore.KIT.name}` : `Comes in the ${V1EStore.KIT.name}`;
            td.append(k);
          }
          if (x && x.url !== V1EStore.KIT.url) { if (x.kit) td.append(" "); td.append(ext(x.url, "store ↗", x.name)); }
          for (const a of x ? x.alt : []) td.append(" · ", ext(a.url, `${a.label} ↗`, a.name));   // EU / outside the US
        }
      }
      wrap.appendChild(t);
      d.appendChild(wrap);
      body.appendChild(d);
    }
    const hwSec = secs.find((s) => s.title.startsWith("Hardware: where"));
    const nFast = hwSec ? hwSec.rows.reduce((a, r) => a + (Number(r[0]) || 0), 0) : 0;
    sum.textContent = `${secs.length} sections · ${nFast} fasteners at this size`;
  }
  function setupBom() {                               // once
    const dlg = document.getElementById("bom"), btn = document.getElementById("bom-btn"), body = document.getElementById("bom-body");
    bomReady = true;
    renderBom();
    btn.disabled = false;
    btn.addEventListener("click", () => dlg.showModal());
    document.getElementById("bom-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    const all = document.getElementById("bom-all");
    all.addEventListener("click", () => {
      const ds = [...body.querySelectorAll("details")], open = !ds.every((d) => d.open);
      ds.forEach((d) => (d.open = open));
      all.textContent = open ? "Collapse all" : "Expand all";
    });
  }

  // ---- picking ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // the spoilboard and stock height fields aren't in meshes (and are far too big to raycast): picked and snapped as their
  // boxes (user 2026-10-25: a click on them selected the table under them; Measure didn't snap to them)
  // -> [{ box (world), owner: the model part it stands for or null, name }]
  function tableBlocks() {
    const out = [], tm = meshes.find((m) => m.userData.name === "Spoilboard");
    const add = (mesh, owner, name) => {
      if (!mesh || !mesh.visible || !mesh.userData.box || (mesh.parent && !mesh.parent.visible)) return;
      mesh.updateMatrixWorld();
      out.push({ box: mesh.userData.box.clone().applyMatrix4(mesh.matrixWorld), owner, name });
    };
    add(SPOIL.mesh, tm || null, "spoilboard"); add(HAND.mesh, null, "stock"); add(JOB.stock, null, "stock");
    return out;
  }
  // a ray's nearest hit on the parts or those boxes (keep(p): not cut away; noBolts: through screws, nuts and washers -
  // Measure, user 2026-10-25: "I never want to select the screw, but would want the hole center") -> { point, distance,
  // object | block } or null
  function pickRay(rc, keep = () => true, noBolts = false) {
    const ms = meshes.filter((m) => m.visible && !m.userData.shadowOnly && !(noBolts && (m.userData.name || "").includes("__")));
    let best = rc.intersectObjects(ms, false).find((h) => keep(h.point)) || null;
    for (const b of tableBlocks()) {
      const p = rc.ray.intersectBox(b.box, new THREE.Vector3());
      if (p && keep(p)) { const d = p.distanceTo(rc.ray.origin); if (!best || d < best.distance) best = { point: p, distance: d, block: b }; }
    }
    return best;
  }
  let down = null;
  canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    if (MEAS.on) return measureClick(e);         // inspect's Measure or the toolbar's
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = pickRay(ray);                         // the spoilboard selects its part; the stock, nothing
    if (typeof rxClick === "function" && rxClick(hit)) return;   // the router's close-up: a part of it to edit (router_edit.js)
    select(hit ? (hit.block ? hit.block.owner : hit.object) : null);
  });
  function select(m) {
    if (selected) selected.material.emissive.setHex(0x000000);
    selected = m;
    const box = document.getElementById("pick");     // a chip on the canvas, only while a part is selected
    box.hidden = !m;
    filPick(m);                                       // Part 40: Printed in
    if (!m) return;
    m.material.emissive.set(css("--accent") || "#c8241b");
    m.material.emissiveIntensity = 0.45;
    const p = m.userData, grp = asmLabel(m);
    box.querySelector("strong").textContent = p.label;
    box.querySelector("p").textContent = p.standin ? `File missing: a stand-in box · ${grp} (Parts in the top bar)` : `${SOURCE[p.source] || p.source} · ${grp}`;
  }

