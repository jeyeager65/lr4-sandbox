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
    const pts = [[px, py, pz, "core"], [px, py, (pz + zc - Rb) / 2, "core"]];
    for (let k = 0; k < 5; k++) {
      const a = 22.5 * k * Math.PI / 180;
      pts.push([px, py + Rb * (1 - Math.cos(a)), zc - Rb + Rb * Math.sin(a), "core"]);
    }
    for (let k = 0; k < 5; k++) {
      const a = (180 - 22.5 * k) * Math.PI / 180;
      pts.push([px + T + T * Math.cos(a), yh - T + T * Math.sin(a), zc + (zr - zc) * k / 4, "core"]);
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
    const x0s = px + T, nseg = Math.max(2, Math.ceil((xu - x0s) / 20.0));
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
    pts.push([h.exit_x + h.floor[0], h.floor_y, h.table_t + h.floor[2], "table"]);
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
    hoseWire.encoding = THREE.sRGBEncoding;
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
    if (meta.hose.sleeve) sleeveMesh = cable("Cable_Sleeve", `Cable sleeve, ${meta.hose.sleeve.d} mm braided (X motor, X endstop, touch plate; GUESS)`,
      [0.12, 0.12, 0.13], 0.85);
  }
  function updateHose(dx, dy, dz) {
    const pts = hoseRoute(meta.hose, dx, dz).map(([x, y, z, f]) =>
      f === "table" ? new THREE.Vector3(x, y, z) : new THREE.Vector3(x, y + dy, z + dz));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength();
    hoseMesh.geometry.dispose();
    hoseMesh.geometry = new THREE.TubeGeometry(curve, Math.ceil(len / 4), meta.hose.od / 2, 28, false);
    hoseWire.repeat.set(len / 10, 1);                    // wire pitch ~10 mm
    if (cordMesh || sleeveMesh) {                        // cord + sleeve tied along it: low-poly, rebuilt with it
      const dense = curve.getPoints(12 * (pts.length - 1)).map((p) => [p.x, p.y, p.z]);
      const tube = (mesh, cp, d) => {
        const cc = new THREE.CatmullRomCurve3(cp.map((p) => new THREE.Vector3(...p)), false, "centripetal");
        mesh.geometry.dispose();
        mesh.geometry = new THREE.TubeGeometry(cc, Math.ceil(cc.getLength() / 12), d / 2, 8, false);
      };
      const c = meta.hose.cord, sh = (p) => [p[0] + dx, p[1] + dy, p[2] + dz];
      if (cordMesh) tube(cordMesh, cordRoute(dense, meta.hose, c, sh(c.tip), sh(c.tip2), dx), c.d);
      if (sleeveMesh) tube(sleeveMesh, cordRoute(dense, meta.hose, meta.hose.sleeve, null, null, dx, [0, dy, dz]), meta.hose.sleeve.d);
    }
  }
  // cordRoute mirrors lr4.cord_route (Python) - keep the two in step
  let cordMesh = null, sleeveMesh = null;
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
    const secs = bomAtSize(), body = document.getElementById("bom-body"), sum = document.getElementById("bom-sum");
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

