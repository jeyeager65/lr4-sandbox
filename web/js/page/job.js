// lr4-sandbox page, part 6 of 12: version + feedback, strut plate G-code, Run G-code (the job, its stock and moves).
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- version + feedback: the issue link carries the size, data date and the loaded files' checksums ----
  const VERSION = "0.38.0";
  function setupAbout() {
    const bits = [`lr4-sandbox ${VERSION}`];
    if (cfg.built) bits.push(`model data built ${cfg.built}`);
    if (cfg.files) bits.push(`tested with the Printables files as of ${cfg.files.tested}`);
    $("version").textContent = bits.join(" · ");
    $("fb-issue").addEventListener("click", (ev) => {
      const files = [...userFiles.entries()].map(([p, f]) => `- ${p}: ${f.ok ? "match" : "DIFFERENT"} ${f.sha256.slice(0, 12)}${f.name.toLowerCase().endsWith(p.split("/").pop().toLowerCase()) ? "" : ` (${f.name})`}`);
      const body = [`**What happened:**\n\n\n**Expected:**\n\n`, "---",
        `- Page: ${VERSION}, data ${cfg.built || "?"}${cfg.files ? `, files as of ${cfg.files.tested}` : ""}`,
        `- Size: ${(S.cutX / IN).toFixed(2)} x ${(S.cutY / IN).toFixed(2)} in, ${S.n} braces (strut ${S.strut.toFixed(1)} mm)`,
        `- Peter Plates: ${peterStyle}; detail: ${lite ? "lite" : "full"}`,
        `- Browser: ${navigator.userAgent}`,
        ...(cfg.files ? [`- Files loaded: ${userFiles.size} of ${needed ? needed.size : "?"}`, ...files] : [])].join("\n");
      ev.currentTarget.href = "https://github.com/jeyeager65/lr4-sandbox/issues/new?" + new URLSearchParams({ template: "problem.md",
        title: `[${(S.cutX / IN).toFixed(1)}x${(S.cutY / IN).toFixed(1)}] `, body: body.slice(0, 4500) });   // GitHub drops URLs over ~8 KB
    });
  }
  const baseName = () => `LR4_strut_plates_${S.strut}mm_${S.n}br`;
  const laidOut = () => StrutPlate.plates(polygonClipping, S.strut,
    { nbraces: S.n === S.auto ? 0 : S.n, wing: WING, dogbones: DOGBONE });   // bottom at y -95, as the SCAD
  $("dl-dxf").addEventListener("click", () => { const q = laidOut();
    save(baseName() + ".dxf", StrutPlate.toDXF([q.front, q.bottom])); });
  $("dl-svg").addEventListener("click", () => { const q = laidOut(); save(baseName() + ".svg", StrutPlate.toSVG([q.front, q.bottom])); });

  // ---- strut plate G-code (strut_cam.js, twin of freecad/cam.py; defaults = cam.py). Settings kept per browser. ----
  const CAM_FIELDS = { "cam-t": "t", "cam-step": "step", "cam-plate": "plate", "cam-feed": "feed", "cam-plunge": "plunge",
    "cam-dial": "dial", "cam-tabs": "tabs", "cam-tabh": "tabH" };
  function camFill(o) {
    for (const [id, k] of Object.entries(CAM_FIELDS)) $(id).value = o[k] ?? StrutCam.DEFAULTS[k];
    $("cam-router").value = StrutCam.ROUTERS[o.router] ? o.router : StrutCam.DEFAULTS.router;
  }
  function camSettings() {
    const o = { router: $("cam-router").value };
    for (const [id, k] of Object.entries(CAM_FIELDS)) {
      const v = parseFloat($(id).value);
      o[k] = Number.isFinite(v) && v >= 0 ? v : StrutCam.DEFAULTS[k];
    }
    o.tabs = Math.round(o.tabs);
    o.dial = Math.min(6, Math.max(1, o.dial));
    return o;
  }
  const camJob = () => StrutCam.job(polygonClipping, S.strut,
    Object.assign(camSettings(), { nbraces: S.n === S.auto ? 0 : S.n, wing: WING, dogbones: DOGBONE }));
  function camNote() {
    let j;
    try { j = camJob(); } catch (e) { $("cam-note").textContent = `G-code: ${e.message}`; $("dl-nc").disabled = true; return; }
    $("dl-nc").disabled = false;
    $("cam-rpm").textContent = `(~${Math.round(j.rpm / 100) * 100} RPM)`;
    const w = j.stock.xmax, l = j.stock.ymax, ins = (v) => +(v / IN).toFixed(2);
    let note = `G-code: stock ${w.toFixed(0)} × ${l.toFixed(0)} mm (${ins(w)} × ${ins(l)} in), long side along Y, zero at its ` +
      `front-left corner on the top; screw it down outside the plates. ${j.depths.length} passes, ~${Math.round(j.minutes)} min, ` +
      `chip load ${j.chipLoad.toFixed(3)} mm per tooth.`;
    try {
      const t = LR4Model.travel(cfg, S);
      if (l > t.y[1] - t.y[0] || w > t.x[1] - t.x[0]) note += " The stock is bigger than this machine's travel: cut the plates on another machine.";
    } catch (e) { /* model data not loaded yet */ }
    $("cam-note").textContent = note;
    jobSetup(j);
  }
  for (const k of Object.keys(StrutCam.ROUTERS)) $("cam-router").add(new Option(StrutCam.ROUTERS[k].name, k));
  { let o = {}; try { o = JSON.parse(localStorage.getItem("lr4-cam") || "{}"); } catch (e) { /* defaults */ } camFill(o); }
  $("cam-box").addEventListener("change", () => {
    try { localStorage.setItem("lr4-cam", JSON.stringify(camSettings())); } catch (e) { /* not kept */ }
    camNote();
  });
  $("cam-reset").addEventListener("click", () => {
    camFill({});
    try { localStorage.removeItem("lr4-cam"); } catch (e) { /* nothing kept */ }
    camNote();
  });
  $("dl-nc").addEventListener("click", () => {
    try { const j = camJob(); save(`${baseName()}_T1_eighth.gcode`, j.gcode); }
    catch (e) { dlStatus(`G-code: ${e.message}`); }
  });

  // ---- Run G-code (simulator stage 1; js/gcode_play.js over js/lib/cnc-gcode-tools): the strut plate G-code above
  // (Temporary struts) or a file the user picks, parsed from its TEXT and played on the machine, all in mm whatever
  // G20 / G21 say. The bit follows it at FluidNC-like speeds (V1E's JP3_LR rates, or the user's config.yaml), the
  // moves are drawn, M0 pauses pop up their MSG, G38.2 stops on the stock (touch plate shown), the stock from the
  // (Stock:) header is carved as it goes. Work zero = the cutting area's front-left corner, stock top. Touching the
  // position sliders pauses it. ----
  const JOB = { tl: null, sim: null, group: null, done: null, at: null, t: 0, k: 0, playing: false,
    key: "", seq: 0, src: null, file: null, pageJob: null, last: 0, preview: null };   // preview: Preview is on (table.js)
  const PAGE_SD = "/LR4_strut_plates.gcode";                       // the SD card (below) and its strut plate file
  const SDC = { recs: [], sel: null, saved: null, saveTimer: 0 };
  const FJ = { job: null, pts: [], timer: 0, lastMsg: "" };        // a job running on FluidNC (fjRun)
  const MDF_RGB = [0.66, 0.52, 0.36];
  // move colours as cnc-gcode-tools (renderer3d): cuts in their tool's colour (TOOL_RGB, as the bit), rapids grey,
  // probes red (its dark / light theme shades)
  const RAPID_RGB = [0.6, 0.6, 0.6];
  const probeRgb = () => (matchMedia("(prefers-color-scheme: dark)").matches ? [1.0, 0.42, 0.42] : [0.84, 0.16, 0.16]);
  const toolOrder = (tl) => [...new Set(tl.segs.map((q) => q.toolNumber))];   // palette by the order tools are used
  const toolRgb = (tl, n) => { const o = toolOrder(tl), i = o.indexOf(n); return TOOL_RGB[(i < 0 ? o.length : i) % TOOL_RGB.length]; };
  function jobRates() {                              // the user's own config.yaml if they brought one, else V1E's
    try { if (yamlBase && /^From your/.test(yamlBase.note)) return GcodePlay.motion(parseFluidNCConfig(yamlBase.text).values); }
    catch (e) { /* V1E's */ }
    return GcodePlay.V1E;
  }
  function jobStockMaterial(top, bottom, through, skirt, rgb) {   // cnc-gcode-tools' stock shader (theme colours as there; rgb: MDF)
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      uniforms: { uLight: { value: new THREE.Vector3(0, 0, 1) }, uView: { value: new THREE.Vector3(0, 0, 1) },
        uStockColor: { value: new THREE.Vector3(...(rgb || (dark ? [0.80, 0.68, 0.50] : [0.87, 0.75, 0.56]))) },
        uCutColor: { value: new THREE.Vector3(...(rgb ? rgb.map((v) => v * 0.85) : dark ? [0.70, 0.55, 0.38] : [0.76, 0.60, 0.42])) },
        uTop: { value: top }, uBottom: { value: bottom }, uThroughZ: { value: through + (top - bottom) * 1e-5 },
        uSkirt: { value: skirt ? 1 : 0 } },
      // aRest: how far the vertex sits below where it would on flat stock (a stock following a warped spoilboard): depth
      // and cut-through are measured without it
      vertexShader: `uniform float uThroughZ; attribute float aRest; varying vec3 vPos; varying vec3 vNormal; varying float vThrough;
        void main() {
          vec3 p0 = position - vec3(0.0, 0.0, aRest);
          vPos = (modelMatrix * vec4(p0, 1.0)).xyz; vNormal = mat3(modelMatrix) * normal;
          vThrough = p0.z <= uThroughZ ? 1.0 : 0.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec3 vPos; varying vec3 vNormal; varying float vThrough;
        uniform vec3 uLight; uniform vec3 uView; uniform vec3 uStockColor; uniform vec3 uCutColor;
        uniform float uTop; uniform float uBottom; uniform float uSkirt;
        void main() {
          if (vThrough > 0.999) discard;
          vec3 n = normalize(vNormal);
          if (dot(n, uView) < 0.0) n = -n;
          float depth = clamp((uTop - vPos.z) / max(uTop - uBottom, 1e-6), 0.0, 1.0);
          vec3 base = depth < 1e-4 || uSkirt > 0.5 ? uStockColor : mix(uCutColor, uCutColor * 0.55, depth);
          float diffuse = max(dot(n, uLight), 0.0);
          float sky = 0.5 + 0.5 * n.z;
          gl_FragColor = vec4(base * (0.22 + 0.18 * sky + 0.62 * diffuse), 1.0);
        }` });
    m.userData.camLit = true;
    return m;
  }
  function camLight(mats) {                          // stock-sim draw(): light = back + 0.6 up - 0.3 right of the camera
    return (r, sc, cam) => {
      const e = cam.matrixWorld.elements, l = new THREE.Vector3(e[8] + e[4] * 0.6 - e[0] * 0.3, e[9] + e[5] * 0.6 - e[1] * 0.3,
        e[10] + e[6] * 0.6 - e[2] * 0.3).normalize();
      for (const m of mats) { m.uniforms.uLight.value.copy(l); m.uniforms.uView.value.set(e[8], e[9], e[10]).normalize(); }
    };
  }
  // rest(x, y) (sim frame, optional): how far the stock's bottom is below flat there (Part 32: it follows the spoilboard)
  function jobStockMesh(sim, at, rgb, rest) {        // the heightmap as one grid (top) + its four side walls
    const { nx, ny, vx, vy, dx, dy, stock: s } = sim;
    const pos = new Float32Array(vx * vy * 3), sag = new Float32Array(vx * vy);
    for (let j = 0, k = 0; j < vy; j++) for (let i = 0; i < vx; i++, k++) {
      pos[3 * k] = at[0] + s.xmin + i * dx; pos[3 * k + 1] = at[1] + s.ymin + j * dy;
      if (rest) sag[k] = rest(s.xmin + i * dx, s.ymin + j * dy);
    }
    const idx = new Uint32Array(nx * ny * 6);
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * vx + i;
      idx.set([a, a + 1, a + vx + 1, a, a + vx + 1, a + vx], q); q += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vx * vy * 3), 3));
    geo.setAttribute("aRest", new THREE.BufferAttribute(sag, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // shaded as cnc-gcode-tools shades its stock (StockMeshRenderer): cut surfaces in their own colour, darker with
    // depth, lit from beside the camera; cut-through triangles dropped so the table shows; pushed back (polygon offset)
    // so the moves on its surface stay visible
    const top = new THREE.Mesh(geo, jobStockMaterial(at[2] + s.zmax, at[2] + s.zmin, sim.bottom + at[2], false, rgb));
    const x0 = at[0] + s.xmin, x1 = at[0] + s.xmax, y0 = at[1] + s.ymin, y1 = at[1] + s.ymax, z0 = at[2] + s.zmin, z1 = at[2] + s.zmax;
    const w = [], rz = (x, y) => (rest ? rest(x - at[0], y - at[1]) : 0);   // the walls follow it too, in pieces
    for (const [a, b, c, d] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) {
      const m = rest ? Math.max(1, Math.ceil(Math.hypot(c - a, d - b) / 5)) : 1;
      for (let q = 0; q < m; q++) {
        const pa = [a + (c - a) * q / m, b + (d - b) * q / m], pb = [a + (c - a) * (q + 1) / m, b + (d - b) * (q + 1) / m];
        const ra = rz(...pa), rb = rz(...pb);
        w.push(...pa, z0 + ra, ...pb, z0 + rb, ...pb, z1 + rb, ...pa, z0 + ra, ...pb, z1 + rb, ...pa, z1 + ra);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(w, 3));
    wg.setAttribute("aRest", new THREE.BufferAttribute(new Float32Array(w.length / 3), 1));
    wg.computeVertexNormals();
    top.add(new THREE.Mesh(wg, jobStockMaterial(z1, z0, -Infinity, true, rgb)));
    top.userData.z = at[2];
    top.onBeforeRender = camLight([top.material]);
    top.children[0].onBeforeRender = camLight([top.children[0].material]);
    return top;
  }
  function jobUpdateMesh(all) { meshUpdate(JOB.sim, JOB.stock, all); }
  function meshUpdate(sim, mesh, all) {              // copy the carved rows into the grid: heights, normals, shading
    if (!sim || !mesh || (!all && !sim.isDirty)) return;
    const { vx, vy, dx, dy, heights: h, stock: s } = sim, z0 = mesh.userData.z, span = s.zmax - s.zmin || 1;
    const j0 = all ? 0 : Math.max(0, sim.dirtyMin - 1), j1 = all ? vy - 1 : Math.min(vy - 1, sim.dirtyMax + 1);
    const i0 = all ? 0 : Math.max(0, sim.dirtyMinI - 1), i1 = all ? vx - 1 : Math.min(vx - 1, sim.dirtyMaxI + 1);
    const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, sag = g.attributes.aRest.array;
    const p = P.array, n = N.array;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * vx + i, z = h[k];
      p[3 * k + 2] = z0 + z + sag[k];
      const gx = (h[j * vx + Math.min(vx - 1, i + 1)] - h[j * vx + Math.max(0, i - 1)]) / (2 * dx);
      const gy = (h[Math.min(vy - 1, j + 1) * vx + i] - h[Math.max(0, j - 1) * vx + i]) / (2 * dy);
      const l = Math.hypot(gx, gy, 1);
      n[3 * k] = -gx / l; n[3 * k + 1] = -gy / l; n[3 * k + 2] = 1 / l;
    }
    for (const a of [P, N]) { a.updateRange = { offset: j0 * vx * 3, count: (j1 - j0 + 1) * vx * 3 }; a.needsUpdate = true; }
    sim.clearDirty();
  }
  function jobMoves(tl, at) {                        // every move as a line: faint ahead, solid once done (drawRange)
    const n = tl.segs.length, pos = new Float32Array(n * 6), col = new Float32Array(n * 6), probe = probeRgb(), rgb = new Map();
    for (const t of toolOrder(tl)) rgb.set(t, new THREE.Color(toolRgb(tl, t)).toArray());
    tl.segs.forEach((sg, i) => {
      const { start: a, end: b } = sg, c = sg.type === "rapid" ? RAPID_RGB : sg.type === "probe" ? probe : rgb.get(sg.toolNumber);
      pos.set([at[0] + a.x, at[1] + a.y, at[2] + a.z, at[0] + b.x, at[1] + b.y, at[2] + b.z], 6 * i);
      col.set([...c, ...c], 6 * i);
    });
    const P = new THREE.BufferAttribute(pos, 3), C = new THREE.BufferAttribute(col, 3);
    const geo = () => { const g = new THREE.BufferGeometry(); g.setAttribute("position", P); g.setAttribute("color", C); return g; };
    const ahead = new THREE.LineSegments(geo(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }));
    const done = new THREE.LineSegments(geo(), new THREE.LineBasicMaterial({ vertexColors: true }));
    done.geometry.setDrawRange(0, 0);
    // the move in progress, from its start to the bit (as there)
    const now = new THREE.BufferGeometry();
    now.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    now.setAttribute("color", new THREE.BufferAttribute(new Float32Array(6), 3));
    const partial = new THREE.LineSegments(now, new THREE.LineBasicMaterial({ vertexColors: true }));
    partial.frustumCulled = false;
    return { ahead, done, partial, col };
  }
  // the modelled Tiny Touch Plate (TouchPlate + its spade + wire stub, stored in the top mount's slot) laid flat on
  // the stock for the probe: pad centred under the bit, the strip angled front-right off the front edge (user). Its frame comes
  // from the mesh: thinnest axis = the plate's normal, longest = the strip, the wider end = the pad. While held,
  // move() leaves the three meshes alone.
  const TOUCH_PARTS = ["TouchPlate", "TouchPlate_Spade", "TouchPlate_Spade_Metal", "TouchPlate_Wire"];
  function touchFrame(geo) {                         // geometry coords: { L (pad -> tab), W, N, pad centre }
    if (geo.userData.touch) return geo.userData.touch;
    const p = geo.attributes.position.array, n = p.length / 3, c = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += p[3 * i + a] / n;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (p[3 * i + a] - c[a]) * (p[3 * i + b] - c[b]);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], unit = (v) => v.map((x) => x / Math.hypot(...v));
    const power = (M, v) => { for (let it = 0; it < 80; it++) v = unit(M.map((r) => dot(r, v))); return v; };
    // the normal from the faces (area-weighted n n^T: the two big faces win - vertices bunch at the pad / tab, so their
    // spread alone tilts it), then the strip = the vertices' main spread within that plane
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ix = geo.index ? geo.index.array : null, nt = (ix ? ix.length : n) / 3;
    const vt = (k) => [p[3 * k], p[3 * k + 1], p[3 * k + 2]];
    for (let t = 0; t < nt; t++) {
      const [a, b, d] = [0, 1, 2].map((j) => vt(ix ? ix[3 * t + j] : 3 * t + j));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], ar = Math.hypot(...nn);
      if (ar > 0) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += nn[i] * nn[j] / ar;
    }
    const N0 = power(A, [0.3, 0.4, 0.9]), Pn = (v) => { const k = dot(v, N0); return v.map((x, a) => x - k * N0[a]); };
    const C2 = C.map((r) => Pn(r)), C3 = [0, 1, 2].map((a) => Pn(C2.map((r) => r[a])));   // P C P
    let L = power(C3, unit(Pn([0.6, 0.5, 0.4])));
    let W = [N0[1] * L[2] - N0[2] * L[1], N0[2] * L[0] - N0[0] * L[2], N0[0] * L[1] - N0[1] * L[0]];   // N x L
    const loc = (i, ax) => (p[3 * i] - c[0]) * ax[0] + (p[3 * i + 1] - c[1]) * ax[1] + (p[3 * i + 2] - c[2]) * ax[2];
    const range = (ax, keep) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) if (keep(i)) { const v = loc(i, ax); lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
    let [s0, s1] = range(L, () => true);
    const wid = (near) => { const r = range(W, near); return r[1] - r[0]; };
    if (wid((i) => loc(i, L) > s1 - 4) > wid((i) => loc(i, L) < s0 + 4)) { L = L.map((x) => -x); W = W.map((x) => -x); [s0, s1] = [-s1, -s0]; }
    const N = [L[1] * W[2] - L[2] * W[1], L[2] * W[0] - L[0] * W[2], L[0] * W[1] - L[1] * W[0]];
    const wr = range(W, (i) => loc(i, L) < s0 + 4), nr = range(N, () => true), pad = 18;   // lr4.TOUCH_PLATE pad
    const at = [s0 + pad / 2, (wr[0] + wr[1]) / 2, (nr[0] + nr[1]) / 2];
    const V = (v) => new THREE.Vector3(...v);
    return (geo.userData.touch = { L: V(L), W: V(W), N: V(N),
      pad: V(c).addScaledVector(V(L), at[0]).addScaledVector(V(W), at[1]).addScaledVector(V(N), at[2]) });
  }
  function jobTouch(pl) {                           // pl: the probe's tl.plates entry, or null = back on the core
    if (!pl && HAND.plate) pl = HAND.plate;          // the button's plate stays where it was laid (world mm)
    const parts = meshes.filter((m) => TOUCH_PARTS.includes(m.userData.name)), plate = parts.find((m) => m.userData.name === "TouchPlate");
    if (probing !== !!(pl && plate)) { probing = !!(pl && plate); applyVisibility(); }   // skirt off while probing
    if (!pl || !plate) {                             // back on the core: move() places them again
      const was = parts.some((m) => m.userData.held);
      for (const m of parts) { m.userData.held = false; m.quaternion.identity(); }
      return was;
    }
    const f = touchFrame(plate.geometry), at = pl.world ? [0, 0, 0] : JOB.at;
    const dir = new THREE.Vector3(1, -1, 0).normalize(), up = new THREE.Vector3(0, 0, 1), side = up.clone().cross(dir);
    const R = new THREE.Matrix4().makeBasis(dir, side, up).multiply(new THREE.Matrix4().makeBasis(f.L, f.W, f.N).transpose());
    const q = new THREE.Quaternion().setFromRotationMatrix(R);
    const target = new THREE.Vector3(at[0] + pl.x, at[1] + pl.y, at[2] + (pl.world ? pl.wz : pl.z) + Math.max(pl.thick, 0.5) / 2);
    const pos = target.sub(f.pad.clone().applyMatrix4(R));
    for (const m of parts) { m.userData.held = true; m.quaternion.copy(q); m.position.copy(pos); m.scale.set(1, 1, 1); }
    return true;
  }
  // the bit as cnc-gcode-tools draws it (StockMeshRenderer.buildToolMesh + fluted: lathe profile, helical flute
  // gullies), run unchanged against a stand-in gl that keeps the arrays, and shaded like it too: its tool shader
  // (light from the camera, sky term, highlight), the cutting part in the tool's colour (its palette), shank grey
  const TOOL_RGB = ["#00ccff", "#00ff88", "#ff4dff", "#ffff00", "#ff8800", "#8888ff", "#ff0088", "#00ffff"];   // controller.js
  function jobToolMaterial(rgb) {
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,                        // its triangles wind the other way (drawn without culling there)
      uniforms: { uColor: { value: new THREE.Vector3(...rgb) }, uLight: { value: new THREE.Vector3(0, 0, 1) }, uView: { value: new THREE.Vector3(0, 0, 1) } },
      vertexShader: `varying vec3 vNormal;
        void main() { vNormal = mat3(modelMatrix) * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; uniform vec3 uLight; uniform vec3 uView; uniform vec3 uColor;
        void main() {
          vec3 n = normalize(vNormal);
          float diffuse = max(dot(n, uLight), 0.0);
          float sky = 0.5 + 0.5 * n.z;
          float specular = pow(max(dot(reflect(-uLight, n), uView), 0.0), 24.0);
          gl_FragColor = vec4(uColor * (0.22 + 0.16 * sky + 0.6 * diffuse) + vec3(0.35 * specular), 1.0);
        }` });
    return m;
  }
  function jobBitMesh(def, colour) {
    const tool = compileStockTool(def);
    if (!tool) return null;
    let cur = null;
    const gl = { ARRAY_BUFFER: 0, STATIC_DRAW: 0, createBuffer: () => ({}), bindBuffer: (t, b) => { cur = b; },
      bufferData: (t, data) => { cur.data = data; } };
    const R = StockMeshRenderer.prototype, mb = R.buildToolMesh.call({ gl, fluted: R.fluted }, tool);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mb.position.data, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(mb.normal.data, 3));
    geo.addGroup(0, mb.cutterCount, 0); geo.addGroup(mb.cutterCount, mb.count - mb.cutterCount, 1);
    const mats = [jobToolMaterial(new THREE.Color(colour).toArray()), jobToolMaterial([0.62, 0.64, 0.67])];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.onBeforeRender = (r, sc, cam) => {         // stock-sim drawMesh: light = back + 0.6 up - 0.3 right of the camera
      const e = cam.matrixWorld.elements, right = [e[0], e[1], e[2]], up = [e[4], e[5], e[6]], back = [e[8], e[9], e[10]];
      const l = new THREE.Vector3(back[0] + up[0] * 0.6 - right[0] * 0.3, back[1] + up[1] * 0.6 - right[1] * 0.3, back[2] + up[2] * 0.6 - right[2] * 0.3).normalize();
      for (const m of mats) { m.uniforms.uLight.value.copy(l); m.uniforms.uView.value.set(...back).normalize(); }
    };
    return mesh;
  }
  // probe close-up (as cnc-gcode-tools): playing into a probe eases the view to a low front look at the touch plate
  // (65 deg down from the top, framed to the plate / bit), and back to the saved view once the plate is put away
  let camTween = null;
  function camEase(pos, tgt, ms = 700) {
    camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: tgt.clone(), start: performance.now(), ms };
  }
  function camStep() {
    if (!camTween) return;
    const k = Math.min(1, (performance.now() - camTween.start) / camTween.ms), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (k >= 1) camTween = null;
  }
  const PROBE_VIEW = 150, PROBE_UP = 45, PROBE_ELEV = 12;   // close-up: view height mm (user: good), centre over the plate mm, deg
  function jobCloseUp(pl) {
    if (pl && !JOB.camSaved && (JOB.playing || FJ.job) && $("job-closeup").checked && !vr.active()) {
      JOB.camSaved = { p: (camTween ? camTween.p1 : camera.position).clone(), t: (camTween ? camTween.t1 : controls.target).clone() };
      const def = JOB.tl.tools.get(pl.tool), d = def && def.diameter > 0 ? def.diameter : 6;
      const len = def && def.overallLength > 0 ? def.overallLength : d * 6, size = Math.max(30, d * 4);
      // low (PROBE_ELEV over the stock, from the front, a little right) to see the bit under the shoe's lip; centred PROBE_UP over
      // the plate so the bit + plate sit in the lower part of the view, below the pause popup
      const at = JOB.at, tgt = new THREE.Vector3(at[0] + pl.x, at[1] + pl.y, at[2] + pl.z + PROBE_UP);
      const el = PROBE_ELEV * Math.PI / 180, dir = new THREE.Vector3(0.482 * Math.cos(el), -0.876 * Math.cos(el), Math.sin(el));   // azimuth: user's pick
      const dist = Math.max(PROBE_VIEW, size * 4, len * 3.5) / 2 / Math.tan(camera.fov * Math.PI / 360);   // frame height
      camEase(tgt.clone().addScaledVector(dir, dist), tgt);
    } else if (!pl && JOB.camSaved) {
      camEase(JOB.camSaved.p, JOB.camSaved.t);
      JOB.camSaved = null;
    }
  }
  function jobClear(keepRun) {
    if (JOB.preview && JOB.done) previewEnd();      // a new file / size: the preview ends
    if (!keepRun) {
      jobCloseUp(null);
      if (jobTouch(null) && meta) move();
    }
    if (JOB.group) {
      scene.remove(JOB.group);
      JOB.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    }
    Object.assign(JOB, { tl: null, sim: null, group: null, done: null, ahead: null, stock: null, bits: null, t: 0, k: 0, key: "",
      spinning: false, tools: null, spoil: null });
    handShow();
    if (jobBit) { jobBit = false; applyVisibility(); }
    jobPlaying(false);
    $("job-pop").hidden = true;
  }
  // after a size / settings change (camNote): the strut plate job (Temporary struts) unless a file is playing
  function jobSetup(j) {
    JOB.pageJob = j || null;
    sdSavePage(j);
    const page = U.struts === "temp" && j ? { kind: "page", name: "The strut plate G-code above", text: j.gcode } : null;
    const src = JOB.file || page;
    $("job-off").hidden = !!src;
    $("job-back").hidden = !(JOB.file && page);
    if (meta) handRefresh();                         // the spoilboard / hand stock / bit for this size
    if (!src || !meta) { jobClear(); $("job-on").hidden = true; $("job-src").textContent = ""; return; }
    const head = handHeader(src);
    const spot = jobSpot();
    const key = `${src.kind}|${src.name}|${src.text.length}|${src.text.slice(-200)}|${S.cutX},${S.cutY},${S.n},${lite},${tableTop}|` +
      `${spot ? [spot.x, spot.y, spot.z].map((v) => v.toFixed(3)) : "-"}|${head}|${JOB.zero ? JOB.zero.join(",") : ""}`;
    if (key === JOB.key) return null;
    return jobLoad(src, key, head);
  }
  async function jobLoad(src, key, head) {
    const seq = ++JOB.seq;
    $("job-src").textContent = `${src.name}: reading…`;
    let tl;
    try { tl = await GcodePlay.load(src.text, jobRates(), jobStartAt(), { header: head }); }
    catch (e) { if (seq === JOB.seq) { jobClear(); $("job-on").hidden = true; $("job-src").textContent = `${src.name}: ${e.message}`; } return; }
    if (seq !== JOB.seq) return;                     // a newer one started meanwhile
    const keep = FJ.job && JOB.tl && JOB.tl.segs.length === tl.segs.length;   // the stock / bits given mid-run: same moves
    jobClear(keep);
    const fr = tableFrame();
    if (!fr || !tl.segs.length) { $("job-on").hidden = true; $("job-src").textContent = `${src.name}: no moves.`; return; }
    const zmin = tl.stock ? tl.stock.zmin : 0, z0 = jobZ0();
    const at = [fr[0] + z0[0], fr[1] + z0[1], fr[2] - zmin];   // work zero, world mm (off the corner: LR4Demo.zero)
    Object.assign(JOB, { tl, at, src, key, group: new THREE.Group() });
    // Part 31: the job's bits carve the spoilboard too (its moves seen from the table's frame), and the first one goes
    // in the router
    JOB.tools = StockSimulator.compileTools(tl.tools);
    JOB.spoil = SPOIL.sim ? HandSetup.shifted(SPOIL.sim, [z0[0], z0[1], -zmin], JOB.tools, JOB.tools.values().next().value || null) : null;
    JOB.spoilAt = 0;
    const t1 = tl.tools.get(tl.segs[0].toolNumber);
    if (t1 && !keep) handBit(HandSetup.fromDef(t1), false);
    if (tl.stock && tl.tools.size) {
      JOB.cells = lite ? 1.2e5 : 4e5;
      JOB.sim = Imperfect.attach(new StockSimulator(tl.stock, tl.tools, { maxCells: JOB.cells }), [z0[0], z0[1], -zmin], abState);
      const rest = stockRest({ x: [tl.stock.xmin + z0[0], tl.stock.xmax + z0[0]], y: [tl.stock.ymin + z0[1], tl.stock.ymax + z0[1]] });
      Imperfect.follow(JOB.sim, rest);
      JOB.sim.setSegments(tl.segs);
      JOB.stock = jobStockMesh(JOB.sim, at, undefined, rest && ((x, y) => rest.at(x + z0[0], y + z0[1])));
      JOB.group.add(JOB.stock);
      jobUpdateMesh(true);
    }
    JOB.bits = new Map();                            // T number -> its bit, shown while that tool's moves play
    for (const [n, def] of tl.tools) {
      const b = jobBitMesh(def, toolRgb(tl, n));
      if (b) { b.visible = false; JOB.bits.set(n, b); JOB.group.add(b); }
    }
    if (JOB.bits.size && !jobBit && JOB.preview) { jobBit = true; applyVisibility(); }
    const mv = jobMoves(tl, at);
    JOB.ahead = mv.ahead; JOB.done = mv.done; JOB.partial = mv.partial; JOB.moveRgb = mv.col;
    JOB.group.add(mv.ahead, mv.done, mv.partial);
    mv.ahead.visible = mv.done.visible = mv.partial.visible = $("job-moves").checked;
    scene.add(JOB.group);
    handShow();
    const tv = meta.travel, b = tl.segs.reduce((r, sg) => [Math.min(r[0], sg.end.x), Math.max(r[1], sg.end.x), Math.min(r[2], sg.end.y),
      Math.max(r[3], sg.end.y)], [Infinity, -Infinity, Infinity, -Infinity]);
    JOB.fits = b[0] + z0[0] >= -0.01 && b[2] + z0[1] >= -0.01 && b[1] + z0[0] <= tv.x[1] - tv.x[0] + 0.01 && b[3] + z0[1] <= tv.y[1] - tv.y[0] + 0.01;
    const units = { mm: "mm (G21)", in: "inches (G20), shown in mm", mixed: "G20 + G21, shown in mm" }[tl.units];
    // FluidNC stops a job on a line over 127 bytes, comments included ("14 Line too long", ALARM:17): say which, before Run finds it
    const longAt = src.text.split("\n").findIndex((l) => new TextEncoder().encode(l.replace(/\r$/, "")).length > 127);
    $("job-src").textContent = `${src.name}: ${tl.lines} lines, ${tl.segs.length} moves, ${units}; ~${clock(tl.total)} at ` +
      `${jobRates() === GcodePlay.V1E ? "V1E's JP3_LR" : "your config.yaml's"} speeds. ` +
      (tl.stock ? (JOB.handStock ? "On the stock set up by hand. " : "") : "No stock on the table (On the table > Stock): only the spoilboard carves. ") +
      (JOB.fits ? "" : "Some moves are outside this machine's travel: the bit stops at its limits. ") +
      (longAt < 0 ? "" : `Line ${longAt + 1} is too long for FluidNC (over 127 bytes): Run will stop there with ` +
        "error 14 (Line too long). Shorten or split it.");
    $("job-on").hidden = false;
    if (keep) fjReload(); else if (FJ.job) fjDone("The file changed: the page stopped following the job.");
    if (JOB.preview) jobSeek(0, false);
    else if (!keep) { JOB.done.geometry.setDrawRange(0, 0); JOB.partial.geometry.setDrawRange(0, 0); }   // the model follows the motors
  }
