// lr4-sandbox page, part 1 of 12: the 3D scene: renderer, metals, the machine at the chosen size, Lite mode, your own files, legs, the table, the FluidTouch pendant model, the workshop, Peter Plates.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  const IN = 25.4;
  // Part 31: what's on the table / in the router, and the spoilboard ("On the table", below)
  const HAND = { stock: { on: false, x0: 0, x1: 300, y0: 0, y1: 300, t: 18 }, bit: { shape: "flat", d: 6.35, angle: 90, len: 0 },
    follow: true, tool: null, sim: null, mesh: null, bitMesh: null, plate: null, last: null, skip: true, key: "" };
  // laid = the warp the board was laid with (null = flat, undefined = not known), ver = bumped when it's laid again
  const SPOIL = { sim: null, mesh: null, key: "", frame: null, saveTimer: 0, loading: 0, laid: null, ver: 0 };
  // Part 32: the machine as built (js/imperfect.js; My LR4 > As built, its status + Power cycle in Run by Home). AB.E = its rack / beam tilt now (side 2 - side
  // 1, mm): from a power-up (page load, Power cycle), then the motors' own steps (FluidNC).
  // geo = the Y carriages in the table frame (xA, span) + the bit's tip from their line (ty in front, tz below
  // the beam's middle), piv = the drawing's pivots (world, at pose 0).
  const AB = { set: null, E: { y: 0, z: 0 }, geo: null, piv: null, posed: false, home: null, probeDz: 0 };
  try { AB.set = Imperfect.settings(JSON.parse(localStorage.getItem("lr4-asbuilt") || "null")); } catch (e) { AB.set = Imperfect.settings(); }
  AB.E = Imperfect.powerUp(AB.set);
  const abState = () => (AB.geo ? AB : null);
  const DUST_PARTS = /^(Dust_Skirt|Bristles_TPU)/;   // the shoe's bottom: own group (Shoe); its top stays with the core
  const SOURCE = {
    printed: "V1E printed part (STL from Printables)",
    hardware: "Purchased hardware (simplified shape)",
    made: "Cut part: MDF / aluminium",
    pendant: "FluidTouch case + stand (printed; github.com/jeyeager65/FluidTouch, MIT)"};
  const canvas = document.getElementById("c");
  const statusEl = document.getElementById("status");
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic: highlights roll off instead of clipping
  renderer.toneMappingExposure = 0.7;
  renderer.shadowMap.enabled = true;                  // the sun's soft shadows (off in Lite: setupDetail)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;             // straight belt runs are cut at the moving gantry / core
  const scene = new THREE.Scene();

  // ---- metals: they only look like metal when they have something to reflect, so the metal parts get a soft
  // studio environment (RoomEnvironment) as their envMap; the XZ plates also get a fine brushed grain ----
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  const brushed = (() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "rgb(200,200,200)"; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 1400; i++) {                 // long thin streaks along u
      const v = 175 + Math.random() * 80, y = Math.random() * 128;
      g.strokeStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.25})`;
      g.lineWidth = 0.5 + Math.random() * 0.8;
      const x = Math.random() * 512, len = 60 + Math.random() * 300;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
      if (x + len > 512) { g.beginPath(); g.moveTo(x - 512, y); g.lineTo(x + len - 512, y); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const spangle = (() => {                            // galvanizing: soft irregular crystal patches
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "rgb(225,225,225)"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 420; i++) {
      const v = 200 + Math.random() * 50, x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 14;
      g.fillStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.22})`;
      g.beginPath();
      for (let k = 0; k < 7; k++) {                 // ragged polygon, wrapped at the tile edges
        const a = k / 7 * Math.PI * 2 + Math.random() * 0.6, rr = r * (0.6 + Math.random() * 0.5);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  const FINISH = {                                    // colour (sRGB), roughness; all fully metallic
    aluminium: { c: [0.86, 0.87, 0.89], r: 0.36 },
    aluminium_plate: { c: [0.80, 0.81, 0.83], r: 0.40, brushed: true },
    steel: { c: [0.72, 0.73, 0.75], r: 0.28 },
    galvanized: { c: [0.79, 0.81, 0.83], r: 0.46, spangle: true },
    rail_steel: { c: [0.56, 0.58, 0.61], r: 0.30 },
    leadscrew: { c: [0.80, 0.81, 0.83], r: 0.30, thread: true },
    thread: { c: [0.76, 0.77, 0.79], r: 0.30, thread: true },
    brass: { c: [0.86, 0.69, 0.36], r: 0.32 },
    zinc: { c: [0.58, 0.60, 0.64], r: 0.34 },          // the touch plate's BU-45 clip + its screw (user: 0.80 / 0.22 too bright)
    spring_steel: { c: [0.60, 0.61, 0.63], r: 0.48 },
    stainless: { c: [0.70, 0.71, 0.72], r: 0.30, brushed: true },   // the touch plate
    copper: { c: [0.95, 0.64, 0.54], r: 0.30 }};
  function creaseNormals(geo, deg) {                  // smooth across shallow angles, keep sharp edges sharp
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position.array, nt = P.length / 9, fn = new Float32Array(nt * 3);
    // each vertex's spot (0.005 mm grid) as one number when the mesh's grid fits in 53 bits (else a string), made once
    // (strings for every vertex, twice, were ~0.5 s of the load)
    if (!g.boundingBox) g.computeBoundingBox();
    const b0 = g.boundingBox.min, span = g.boundingBox.getSize(new THREE.Vector3());
    const bits = Math.max(...span.toArray().map((v) => Math.ceil(Math.log2(v * 200 + 3))));
    const K = 2 ** bits, num = bits * 3 <= 53;
    const keys = new Array(nt * 3);
    for (let v = 0; v < nt * 3; v++) {
      const i = v * 3, x = Math.round((P[i] - b0.x) * 200), y = Math.round((P[i + 1] - b0.y) * 200), z = Math.round((P[i + 2] - b0.z) * 200);
      keys[v] = num ? x + K * (y + K * z) : `${x},${y},${z}`;
    }
    const key = (i) => keys[i / 3];
    const at = new Map();
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
      const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
      for (let k = 0; k < 3; k++) { const kk = key(o + k * 3); (at.get(kk) || at.set(kk, []).get(kk)).push(t); }
    }
    const cos = Math.cos(deg * Math.PI / 180), N = new Float32Array(P.length);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      let sx = 0, sy = 0, sz = 0;
      for (const f of at.get(key(t * 9 + k * 3))) {
        if (fn[f * 3] * fn[t * 3] + fn[f * 3 + 1] * fn[t * 3 + 1] + fn[f * 3 + 2] * fn[t * 3 + 2] < cos) continue;
        sx += fn[f * 3]; sy += fn[f * 3 + 1]; sz += fn[f * 3 + 2];
      }
      const l = Math.hypot(sx, sy, sz) || 1, o = t * 9 + k * 3;
      N[o] = sx / l; N[o + 1] = sy / l; N[o + 2] = sz / l;
    }
    g.setAttribute("normal", new THREE.BufferAttribute(N, 3));
    return g;
  }
  const thread = (() => {                             // one tile = one lead (u, along the axis) x one turn (v)
    const n = 256, c = document.createElement("canvas");
    c.width = c.height = n;
    const g = c.getContext("2d"), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = ((4 * (x - y) / n) % 1 + 1) % 1;                 // 4 starts: crests where u - v = k / 4
      const prof = Math.min(1, 1.6 * (1 - Math.abs(2 * t - 1)));  // trapezoid-ish (ACME) flank profile
      const v = 70 + 185 * prof, i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  const threadV = (() => {                            // per-part UVs from export_web: u = along / pitch, v = starts x turns
    const n = 128, c = document.createElement("canvas");
    c.width = c.height = n;
    const g = c.getContext("2d"), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = (((x - y) / n) % 1 + 1) % 1;                      // crest where u - v is a whole number
      const prof = Math.min(1, 1.25 * (1 - Math.abs(2 * t - 1)));  // 60 deg V, small flats
      const v = 55 + 200 * prof, i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  function threadUV(g, lead) {                        // u = axial / lead, v = turns round the longest axis
    g.computeBoundingBox();
    const bb = g.boundingBox, lo = bb.min.toArray(), hi = bb.max.toArray();
    const ax = [0, 1, 2].sort((a, b) => (hi[b] - lo[b]) - (hi[a] - lo[a]));
    const ca = (lo[ax[1]] + hi[ax[1]]) / 2, cb = (lo[ax[2]] + hi[ax[2]]) / 2;
    const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
      uv[j] = P[i + ax[0]] / lead;
      uv[j + 1] = Math.atan2(P[i + ax[2]] - cb, P[i + ax[1]] - ca) / (2 * Math.PI);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  function tubeUV(g, s) {                             // cylindrical UVs round a tube's longest axis (mm per tile)
    g.computeBoundingBox();
    const bb = g.boundingBox, lo = bb.min.toArray(), hi = bb.max.toArray();
    const ax = [0, 1, 2].sort((a, b) => (hi[b] - lo[b]) - (hi[a] - lo[a]));
    const ca = (lo[ax[1]] + hi[ax[1]]) / 2, cb = (lo[ax[2]] + hi[ax[2]]) / 2, r = (hi[ax[1]] - lo[ax[1]]) / 2;
    const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
      uv[j] = P[i + ax[0]] / s;
      uv[j + 1] = Math.atan2(P[i + ax[2]] - cb, P[i + ax[1]] - ca) * r / s;   // seam where atan2 wraps: hard to spot
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  function plateUV(g, su = 120, sv = 30) {            // planar UVs on a part's two long axes (mm per texture tile)
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3()).toArray(), ax = [0, 1, 2].sort((a, b) => s[b] - s[a]);
    const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) { uv[j] = P[i + ax[0]] / su; uv[j + 1] = P[i + ax[1]] / sv; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  const camera = new THREE.PerspectiveCamera(35, 1, 5, 20000);
  camera.up.set(0, 0, 1);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  // Inspect turns freely (user 2026-10-24: OrbitControls keeps Z up, so a part can't be laid on its side, e.g. the
  // touch plate clip as in a photo): a trackball sharing the orbit's target; fit / view buttons and leaving Inspect
  // stand it upright again. The near plane follows the distance so a small part can be looked at close up.
  const tball = new THREE.TrackballControls(camera, canvas);
  tball.target = controls.target;
  Object.assign(tball, { enabled: false, rotateSpeed: 3.0, zoomSpeed: 1.2, panSpeed: 0.8, dynamicDampingFactor: 0.15,
    keys: [] });                                      // no A / S / D mode keys: the page has its own shortcuts
  function freeTurn(on) {
    if (tball.enabled === on) return;
    tball.enabled = on; controls.enabled = !on;
    if (on) tball.handleResize();
    else upright();
  }
  function upright() {
    camera.up.set(0, 0, 1);
    controls.update();
  }
  function controlsTick() {
    (tball.enabled ? tball : controls).update();
    const near = tball.enabled ? Math.min(5, Math.max(0.1, camera.position.distanceTo(controls.target) / 100)) : 5;
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  }
  // light: the studio environment lights every surface (soft, directional ambient), a weak sky / ground fill, and a
  // sun that casts soft shadows (fitted to the table in updateShop)
  scene.environment = envMap;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6157, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.1);
  sun.position.set(-900, -1400, 1500);
  sun.castShadow = true;
  Object.assign(sun.shadow, { bias: -0.0002, normalBias: 1.2 });   // mm: no acne on the double-sided parts
  sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-900, -1400, 1500).normalize();   // lower than straight overhead: shadows you can see
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(1600, 2000, 600);
  scene.add(fill);

  // in the workshop its own lights (user 2026-10-22): the four 4 ft LED strips as soft area lights, a spot between
  // the two over the machine casting the shadows (straight down, as ceiling lights do), and daylight in through the
  // open garage door (+Y). Plain background and inspect: the studio sun above. Switched in tick() when that changes.
  THREE.RectAreaLightUniformsLib.init();
  // Show > Scene > Lighting: Realistic (all this, shadows on Full detail) or Simple (even light, no shadows, no tone
  // mapping - the page's earlier look, lightest on the GPU); unset = Realistic unless Lite
  const LIGHT = { mode: "", shop: null, rig: new THREE.Group(), saved: null };
  scene.add(LIGHT.rig);
  const lightQ = () => LIGHT.saved || (lite ? "simple" : "real");
  function lighting() {
    const real = lightQ() === "real", inShop = real && !!(shop && shop.visible && shop.userData.lamps);
    const mode = real ? (inShop ? "shop" : "studio") : "simple";
    if (mode === LIGHT.mode && (!inShop || LIGHT.shop === shop) && LIGHT.lite === lite) return;
    Object.assign(LIGHT, { mode, shop: inShop ? shop : null, lite });
    for (const l of [...LIGHT.rig.children]) { LIGHT.rig.remove(l); if (l.dispose) l.dispose(); }
    scene.environment = real ? envMap : null;
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = real ? 0.7 : 1.0;
    sun.visible = fill.visible = !inShop;
    sun.intensity = real ? 1.1 : 0.75;
    sun.castShadow = real && !inShop && !lite;
    hemi.intensity = !real ? 0.85 : inShop ? 0.18 : 0.3;
    if (!inShop) return;
    const ud = shop.userData, LED = 0xfff6ea;           // ~4000 K strips
    for (const L of ud.lamps) {                       // soft light from each strip's lens, facing down
      const a = new THREE.RectAreaLight(LED, L.machine ? 3.5 : 3, L.len, L.w);
      a.position.set(L.x, L.y, L.z);
      a.rotation.set(0, 0, L.rz);
      LIGHT.rig.add(a);
    }
    const ms = ud.lamps.filter((L) => L.machine);
    const x = ms.reduce((t, L) => t + L.x, 0) / ms.length, y = ms.reduce((t, L) => t + L.y, 0) / ms.length, z = ms[0].z - 10;
    const spot = new THREE.SpotLight(LED, 0.55, 0, Math.PI / 2.4, 0.95, 0);   // the shadows: from between the machine's strips
    spot.position.set(x, y, z);
    spot.target.position.set(x, y, ud.garage.z);
    spot.castShadow = !lite;
    Object.assign(spot.shadow, { bias: -0.0003, normalBias: 1.2 });
    spot.shadow.mapSize.set(4096, 4096);
    Object.assign(spot.shadow.camera, { near: 150, far: z - ud.garage.z + 200 });
    LIGHT.rig.add(spot, spot.target);
    const day = new THREE.DirectionalLight(0xdfe9ff, 0.35);   // daylight through the open garage door
    day.position.set(x, ud.garage.y + 6000, ud.garage.z + 1800);
    day.target.position.set(x, y, ud.garage.z);
    LIGHT.rig.add(day, day.target);
  }

  function setupLighting() {                          // once: the Lighting buttons
    try { LIGHT.saved = localStorage.getItem("lr4-lighting"); } catch (e) { /* auto */ }
    const box = document.getElementById("lighting");
    const mark = () => {
      const q = lightQ();
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === q)));
      document.getElementById("lighting-note").textContent = (LIGHT.saved ? "" : "Picked for this device. ")
        + (q === "real" ? "Realistic: the workshop's own lights, soft shadows (Full detail), filmic colour. Needs a decent GPU."
          : "Simple: even light, no shadows. Lightest on the GPU.");
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      LIGHT.saved = b.dataset.v;
      try { localStorage.setItem("lr4-lighting", LIGHT.saved); } catch (e2) { /* not kept */ }
      mark();
    });
    LIGHT.mark = mark;
    mark();
  }

  function paintBackground() {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, css("--scene-top") || "#d5dadf");
    grad.addColorStop(1, css("--scene-bottom") || "#f1f2f3");
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    scene.background = tex;
  }
  paintBackground();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintBackground);
  new MutationObserver(paintBackground).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(r.width, 1), Math.max(r.height, 1), false);
    camera.aspect = Math.max(r.width, 1) / Math.max(r.height, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);

  let meta = null, meshes = [], center = new THREE.Vector3(), radius = 1500, selected = null;

  function frame(dir, dist) {
    const d = new THREE.Vector3(...dir).normalize();
    camera.position.copy(center).addScaledVector(d, dist || radius * 2.3);
    controls.target.copy(center);
    upright();
  }

  // loading popup: a title, a bar (0..1, or null to leave it) and a detail line
  function progress(title, frac, detail) {
    document.getElementById("status-title").textContent = title;
    if (frac !== null) document.getElementById("status-bar").style.width = (100 * Math.min(1, frac)).toFixed(1) + "%";
    document.getElementById("status-detail").textContent = detail || "\u00a0";
  }
  const MB = (n) => (n / 1e6).toFixed(1) + " MB";
  const nextFrame = () => new Promise((res) => setTimeout(res, 0));   // yield so the popup repaints (rAF stalls in background tabs)
  async function fetchBytes(url, onChunk) {           // the body as an ArrayBuffer, reporting each chunk's size
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + " " + r.status);
    if (!r.body) { const b = await r.arrayBuffer(); onChunk(b.byteLength); return b; }
    const rd = r.body.getReader(), chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      chunks.push(value); n += value.length; onChunk(value.length);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out.buffer;
  }

  // ---- the machine at the chosen size. lr4_config.json (fit_config.py) holds each part's mesh once,
  // at the 26 x 50 in reference build, and how its position follows the size; config_model.js turns a size into
  // instances (offset + per-axis scale). The strut plates are drawn from the JS generator. ----
  const WING = 11.5, DOGBONE = 3.5, STRUT_T = 6.35;   // build.py: 1" EMT wings, 1/8" bit, 1/4" MDF
  let cfg = null, bin = null, S = null;
  const geoCache = new Map();
  function dress(geo, fin, hasUV) {                   // smooth-shaded (sharp edges kept); metal: textured by finish
    geo = creaseNormals(geo, 35);
    if (!fin) return geo;
    if (fin.brushed) plateUV(geo);
    if (fin.spangle) tubeUV(geo, 70);
    if (fin.thread && !hasUV) threadUV(geo, 8.0);
    return geo;
  }
  const entry = (geo, fin, hasUV) => ({ geo, fin, hasUV, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 });
  // ---- Lite mode (phones, software / weak GPUs): every mesh clustered on a 1 mm grid in the browser (about a fifth of
  // the triangles: LR4Files.decimate) and a pixel ratio of 1. Auto unless the viewer picked Full / Lite. ----
  const LITE_CELL = 1.0;
  let lite = false;
  function autoLite() {
    const gl = renderer.getContext(), dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
    return phone || /swiftshader|llvmpipe|softpipe|software/i.test(gpu) || (navigator.deviceMemory || 8) <= 2;
  }
  function liteGeo(pos, idx) {
    const r = LR4Files.decimate(pos, idx, LITE_CELL), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(r.pos, 3));
    g.setIndex(new THREE.BufferAttribute(r.idx, 1));
    return g;
  }
  function setupDetail() {                            // once, before the first build
    const box = document.getElementById("detail");
    let saved = null;
    try { saved = localStorage.getItem("detail"); } catch (e) { /* auto */ }
    const auto = autoLite();
    lite = saved ? saved === "lite" : auto;
    const mark = () => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "lite") === lite)));
      document.getElementById("detail-note").textContent = (saved ? "" : "Picked for this device. ")
        + (lite ? "Lite: simplified meshes (about a fifth of the triangles)." : "Full: every triangle of every file.");
      renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      if (LIGHT.mark) LIGHT.mark();                  // Lighting's default follows Lite
      resize();
    };
    let busy = false;
    // switching remakes every mesh: the loading popup with the same count as at load (user 2026-10-24: it sat for
    // seconds with no sign of life)
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      if (busy || (b.dataset.v === "lite") === lite) return;
      busy = true;
      lite = b.dataset.v === "lite";
      saved = b.dataset.v;
      try { localStorage.setItem("detail", saved); } catch (e) { /* not kept */ }
      const title = lite ? "Switching to Lite…" : "Switching to Full detail…";
      statusEl.hidden = false;
      progress(title, 0, "Preparing the part meshes");
      await nextFrame();
      try {
        for (const e of geoCache.values()) e.geo.dispose();
        geoCache.clear();
        dropSrcGeometry();
        mark();
        await warmGeometry((f, detail) => progress(title, f * 0.9, detail));
        progress(title, 0.9, `Placing the ${cfg.parts.length} parts`);
        await nextFrame();
        rebuild();
      } finally {
        statusEl.hidden = true;
        busy = false;
      }
    }));
    mark();
  }

  // null = not drawn (a part from a file the user hasn't loaded, or Peter Plates "none")
  function recGeometry(rec) {
    if (rec.src) return srcGeometry(rec);
    let e = geoCache.get(rec.key);
    if (e) return e;
    const p = rec.mesh, fin = FINISH[rec.meta.finish];
    const pos = new Float32Array(bin, p.pos[0], p.pos[1] * 3);
    const idx = p.idx[2] === 32 ? new Uint32Array(bin, p.idx[0], p.idx[1]) : new Uint16Array(bin, p.idx[0], p.idx[1]);
    if (lite) {                                       // clustered: the shipped UVs no longer fit, dress() makes its own
      e = entry(dress(liteGeo(pos, idx), fin, false), fin, false);
      geoCache.set(rec.key, e);
      return e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    if (p.uv !== undefined) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(bin, p.uv, p.pos[1] * 2), 2));
    e = entry(dress(geo, fin, p.uv !== undefined), fin, p.uv !== undefined);
    geoCache.set(rec.key, e);
    return e;
  }

  // ---- bring your own files (share data: cfg.files + a `src` per V1E part instead of its mesh - pipeline/share_data.py).
  // The user's files are matched by SHA-256 (js/parts_files.js), kept in IndexedDB, and placed by each part's A. ----
  const DATA = "data/";                                // pipeline/share_data.py (no V1E geometry); the same file published
  const userFiles = new Map();                        // manifest path -> {name, sha256, ok, buf}
  const srcCache = new Map(), soupCache = new Map();
  let needed = null;                                  // manifest path -> the part names placed from it
  function soup(rel) {                                // the raw STL triangles (file coordinates), or null
    if (soupCache.has(rel)) return soupCache.get(rel);
    const f = userFiles.get(rel);
    let t = null;
    if (f) try { t = LR4Files.readSTL(f.buf); } catch (e) { console.warn(rel, e); }
    soupCache.set(rel, t);
    return t;
  }
  const soupGeo = (pos) => {
    if (lite) return liteGeo(pos, null);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); return g;
  };
  function dxfGeo(s) {                                // the DXF's faces extruded `depth` along its z, then A
    const f = userFiles.get(s.file);
    if (!f) return null;
    const { loops } = LR4Files.dxfLoops(new TextDecoder().decode(f.buf));
    const v2 = (l) => l.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
    const shapes = LR4Files.nest(loops).map(({ outer, holes }) => {
      const sh = new THREE.Shape(v2(outer));
      sh.holes = holes.map((h) => new THREE.Path(v2(h)));
      return sh;
    });
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: Math.abs(s.depth), bevelEnabled: false, curveSegments: 1 });
    if (s.depth < 0) geo.translate(0, 0, s.depth);
    geo.deleteAttribute("normal");
    geo.deleteAttribute("uv");
    return geo.applyMatrix4(new THREE.Matrix4().set(...s.A.flat(), 0, 0, 0, 1));
  }
  function honeyGeo(t) {                              // the closed cover as a honeycomb slab, file coordinates: one
    const h = LR4Files.honeycomb(t);                  // extrusion per layer, so the screws keep their counterbores
    const v2 = (l) => l.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
    const [a, b] = [[1, 2], [2, 0], [0, 1]][h.axis];  // section points are [a, b]; the slab runs along h.axis
    const parts = h.layers.map(({ lo, hi, outer, holes }) => {
      const sh = new THREE.Shape(v2(outer));
      sh.holes = holes.map((l) => new THREE.Path(v2(l)));
      const g = new THREE.ExtrudeGeometry([sh], { depth: hi - lo, bevelEnabled: false, curveSegments: 1 });
      const p = g.attributes.position.array, out = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 3) { out[i + a] = p[i]; out[i + b] = p[i + 1]; out[i + h.axis] = p[i + 2] + lo; }
      g.dispose();
      return out;
    });
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    parts.reduce((o, p) => (out.set(p, o), o + p.length), 0);
    return out;
  }
  function srcGeometry(rec) {
    const s = rec.src, ck = rec.key + (s.kind === "peter" ? "|" + peterStyle : "");
    if (srcCache.has(ck)) return srcCache.get(ck);
    let geo = null;
    if (s.kind === "stl" || s.kind === "bent") {
      const t = soup(s.file);
      if (t) geo = soupGeo(LR4Files.place(s.kind === "bent" ? LR4Files.bend(t, s) : t, s.A));
    } else if (s.kind === "peter" && peterStyle === "honeycomb") {
      const t = soup(s.closed.file);
      if (t) try { geo = soupGeo(LR4Files.place(honeyGeo(t), s.closed.A)); } catch (e) { console.warn(s.closed.file, e); }
    } else if (s.kind === "peter" && peterStyle !== "none") {
      const r = s[peterStyle] || s.closed;
      let t = soup(r.file);
      if (t && r.piece !== undefined) {               // "open": one piece of the both-covers file
        const ck2 = r.file + "|pieces";
        if (!soupCache.has(ck2)) soupCache.set(ck2, LR4Files.components(t));
        t = soupCache.get(ck2)[r.piece];
      }
      if (t) geo = soupGeo(LR4Files.place(t, r.A));
    } else if (s.kind === "dxf") {
      try { geo = dxfGeo(s); } catch (e) { console.warn(s.file, e); }
    }
    const fin = FINISH[rec.meta.finish], e = geo ? entry(dress(geo, fin, false), fin, false) : null;
    srcCache.set(ck, e);
    return e;
  }
  function dropSrcGeometry() {                        // the user's files changed: rebuild their parts' geometry
    for (const e of srcCache.values()) if (e) e.geo.dispose();
    srcCache.clear();
    soupCache.clear();
  }
  function material(color, fin, hasUV, grain) {         // grain: "pine" / "ply" (woodTex; boxesGeo's UVs)
    if (fin) {                                        // metal: reflects the environment
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(...fin.c).convertSRGBToLinear(), metalness: 1.0, roughness: fin.r,
        envMap, envMapIntensity: 1.0, side: THREE.DoubleSide});
      if (fin.brushed) Object.assign(mat, { roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.04 });
      if (fin.spangle) Object.assign(mat, { map: spangle, roughnessMap: spangle });
      if (fin.thread && hasUV) Object.assign(mat, { map: threadV, bumpMap: threadV, bumpScale: 0.9 });
      else if (fin.thread) Object.assign(mat, { map: thread, bumpMap: thread, bumpScale: 1.2 });
      return mat;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(...color).convertSRGBToLinear(),
      roughness: 0.6, metalness: 0.0, envMapIntensity: 0.3, side: THREE.DoubleSide});
    if (grain) Object.assign(mat, { map: woodTex(grain), bumpMap: woodTex(grain), bumpScale: 0.25, roughness: 0.75 });
    return mat;
  }
  const pretty = (n) => n.replace(/_/g, " ").replace("29p5", "29.5").replace(" V1", "").replace("Kobalt", "(Kobalt)").trim();
  let platePolys = null;
  function updatePlatePolys() {                     // every size, Temporary struts too (the drawing + downloads use it)
    platePolys = StrutPlate.plates(polygonClipping, S.strut, { nbraces: S.n === S.auto ? 0 : S.n, wing: WING, dogbones: DOGBONE, layout: false });
  }
  function plateMeshes() {
    const out = [];
    for (const [key, mp] of [["StrutPlate_Front", platePolys.front], ["StrutPlate_Bottom", platePolys.bottom]]) {
      const rec = cfg.parts.find((q) => q.key === key);
      const shapes = mp.map((poly) => {
        const sh = new THREE.Shape(poly[0].slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
        sh.holes = poly.slice(1).map((r) => new THREE.Path(r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))));
        return sh;
      });
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: STRUT_T, bevelEnabled: false, curveSegments: 1 });
      geo.applyMatrix4(new THREE.Matrix4().set(...LR4Model.plateFrame(cfg, key, S), 0, 0, 0, 1));
      out.push({ rec, geo });
    }
    return out;
  }
  // ---- basic table legs - drawn here only (not in the FreeCAD model, cut list or BOM): doubled-2x4 legs inside a 2x4
  // apron round the MDF's edge, at most LEG_GAP apart; the MDF's top tableTop above the floor (View > Table height,
  // kept in this browser; default 34 in) ----
  const LEG = 3.5 * IN, APRON_T = 1.5 * IN, APRON_H = 3.5 * IN, LEG_GAP = 1800, TOP_DEFAULT = 34 * IN;
  let tableTop = TOP_DEFAULT;
  try { tableTop = +localStorage.getItem("lr4-table-top") || TOP_DEFAULT; } catch (e) { /* default */ }
  // [x0, y0, z0, x1, y1, z1] boxes as one flat-shaded geometry. UVs in mm / GRAIN_MM, u along each box's longest side
  // (the grain runs along the board; end grain gets the cross-section), for the wood textures (woodTex)
  const GRAIN_MM = [600, 150];
  function boxesGeo(list) {
    const pos = [], nor = [], uv = [];
    for (const [x0, y0, z0, x1, y1, z1] of list) {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const p = g.attributes.position.array, n = g.attributes.normal.array, d = [x1 - x0, y1 - y0, z1 - z0];
      const L = d.indexOf(Math.max(...d)), off = (x0 * 7.3 + y0 * 3.1 + z0) % 997;   // each board its own stretch of grain
      for (let i = 0; i < p.length; i += 3) {
        const na = [0, 1, 2].find((k) => Math.abs(n[i + k]) > 0.5), rest = [0, 1, 2].filter((k) => k !== na);
        const a = na === L ? rest[0] : L, b = rest.find((k) => k !== a);
        uv.push((p[i + a] + off) / GRAIN_MM[0], (p[i + b] + off) / GRAIN_MM[1]);
      }
      pos.push(...p); nor.push(...n);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  }
  // wood grain (procedural, once per kind): "pine" = 2x4s (wide soft streaks + a knot or two), "ply" = plywood faces
  // (finer, straighter); light / dark around white so the material's colour still sets the wood's tone. MDF stays plain.
  const woodTexs = {};
  function woodTex(kind) {
    if (woodTexs[kind]) return woodTexs[kind];
    const W = 512, H = 128, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
    let seed = kind === "pine" ? 7 : 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const waves = Array.from({ length: 5 }, () => [rnd() * 6 + 1, rnd() * Math.PI * 2, rnd() * (kind === "pine" ? 4.5 : 1.5)]);
    const knots = kind === "pine" ? Array.from({ length: 2 }, () => [rnd() * W, rnd() * H, 5 + rnd() * 7]) : [];
    const rings = kind === "pine" ? 0.22 : 0.4, depth = kind === "pine" ? 0.20 : 0.11;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = y;
      for (const [f, ph, a] of waves) v += a * Math.sin(x / W * Math.PI * 2 * f + ph);   // whole periods: tiles in u
      for (const [kx, ky, r] of knots) { const dx = (x - kx) / 2.5, dy = y - ky, q = Math.hypot(dx, dy); v += r * 2.2 * Math.exp(-(q * q) / (r * r * 2)); }
      const ring = 0.5 + 0.5 * Math.sin(v * rings * Math.PI * 2 / (H * rings / Math.round(H * rings)) );
      const fine = (rnd() - 0.5) * 0.05;
      const k = Math.min(1, 1.06 - depth * Math.pow(ring, 3) + fine), i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return (woodTexs[kind] = tex);
  }
  // ---- the table (Part 33, table_model.js): spoilboard + rail strips (z 0..T, the work surface) on the base (U.base:
  // the MDF sheet, or the torsion box's ribs drawn as one mesh, slots left out) ----
  const TABLE_PART = /^(TableBase|TableRibs|Spoilboard|RailStrip_(Min|Max)|RailEdge_(Min|Max))$/;
  function tableMeshes() {
    const list = LR4Table.parts(U.base, S.TW, S.TL, S.xtable, S.ytable, S.cutX, S.cutY), ribs = list.filter((p) => p.role === "rib");
    const ud = (name, label, color) => ({ name, label, group: "Table", motion: "table", source: "made", color, ownGeo: true });
    const LABEL = { Spoilboard: "Spoilboard (3/4 in MDF, the bit's full travel + 1/4 in a side)", RailStrip_Min: "Rail strip, Min (3/4 in MDF)",
      RailStrip_Max: "Rail strip, Max (3/4 in MDF)", TableBase: "Table sheet (3/4 in MDF)",
      RailEdge_Min: "Rail side board, Min (5/8 in plywood: the box's outer rib, full length under the strip)",
      RailEdge_Max: "Rail side board, Max (5/8 in plywood: the box's outer rib, full length under the strip)" };
    const out = list.filter((p) => p.role !== "rib").map((p) => [boxesGeo([p.box]),
      Object.assign(ud(p.name, LABEL[p.name], p.role === "spoil" ? [0.72, 0.60, 0.45] : p.role === "edge" ? [0.86, 0.68, 0.44] : [0.78, 0.66, 0.50]),
        p.role === "edge" ? { grain: "ply" } : {})]);
    if (ribs.length) out.push([boxesGeo(ribs.map((p) => p.box)), Object.assign(ud("TableRibs",
      `Torsion box ribs (${ribs.length}, 5/8 in plywood, half-lapped egg-crate)`, [0.86, 0.68, 0.44]), { grain: "ply" })]);
    return out;
  }
  function tableBox(base) {                           // the whole table (base: the sheet / box only), world mm; null before drawn
    const ts = meshes.filter((m) => (base ? /^(TableBase|TableRibs)$/ : TABLE_PART).test(m.userData.name));
    if (!ts.length) return null;
    const bb = new THREE.Box3();
    for (const m of ts) bb.union(new THREE.Box3().setFromObject(m));
    return bb;
  }
  // under the base (the torsion box is shorter than the strips). The torsion box is its own apron: the legs go right
  // under it, flush with its sides, no 2x4 apron (user 2026-10-23: "a table on a table" otherwise)
  function legMeshes() {
    const tb = tableBox(true), all = tableBox();
    if (!tb) return [];
    const box = U.base === "torsion", AP = box ? 0 : APRON_T, AH = box ? 0 : APRON_H;
    const lo = tb.min.toArray(), hi = tb.max.toArray();
    hi[2] = all.max.z;                                // the table height: the spoilboard's top
    const minTop = hi[2] - lo[2] + AH + 100;          // legs at least 100 mm below the apron / box
    const top = Math.max(tableTop, minTop), floor = hi[2] - top, under = lo[2];
    const spread = (a, z, n) => Array.from({ length: n }, (_, i) => a + (z - a) * i / (n - 1));
    const along = (a, z) => spread(a, z, Math.max(2, Math.ceil((z - a) / LEG_GAP) + 1));
    const x0 = lo[0] + AP, x1 = hi[0] - AP - LEG, y0 = lo[1] + AP, y1 = hi[1] - AP - LEG;
    const spots = new Set();
    for (const x of along(x0, x1)) for (const y of [y0, y1]) spots.add(`${x},${y}`);
    for (const y of along(y0, y1)) for (const x of [x0, x1]) spots.add(`${x},${y}`);
    const legs = [...spots].map((k) => k.split(",").map(Number)).map(([x, y]) => [x, y, floor, x + LEG, y + LEG, under]);
    const aprons = [[lo[0], lo[1], under - APRON_H, hi[0], lo[1] + APRON_T, under],
      [lo[0], hi[1] - APRON_T, under - APRON_H, hi[0], hi[1], under],
      [lo[0], lo[1] + APRON_T, under - APRON_H, lo[0] + APRON_T, hi[1] - APRON_T, under],
      [hi[0] - APRON_T, lo[1] + APRON_T, under - APRON_H, hi[0], hi[1] - APRON_T, under]];
    const ud = (name, label) => ({ name, label, group: "Table", motion: "table", source: "made", color: [0.88, 0.74, 0.54],
      ownGeo: true, floor: true, grain: "pine" });
    const out = [[boxesGeo(legs), ud("TableLegs", `Table legs (basic: ${legs.length} doubled 2x4s, ${+(top / IN).toFixed(1)} in top` +
      `${box ? ", right under the torsion box" : ""} - not in the cut list)`)]];
    if (!box) out.push([boxesGeo(aprons), ud("TableApron", "Table apron (basic: 2x4 on edge - not in the cut list)")]);
    return out;
  }
  function clearMachine() {
    select(null);
    for (const m of meshes) {
      scene.remove(m);
      if (m.userData.ownGeo || m.userData.motion === "hose") m.geometry.dispose();
      m.material.dispose();
    }
    if (hoseWire) hoseWire.dispose();
    meshes = [];
    hoseMesh = cordMesh = sleeveMesh = hoseWire = null;
  }
  function addMesh(geo, mat, ud) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    m.userData = ud;
    scene.add(m);
    meshes.push(m);
    return m;
  }
  // ---- FluidTouch pendant (Part 18): the CrowPanel Advance 7" in its printed case, on its table stand (the user's
  // FluidTouch repo, MIT; models/pendant/*.stl + pendant.json from pipeline/pendant_meshes.py, shared by every size). The stand
  // is screwed to the table's front face near the Min corner (its back mount holes; the gantry comes within 34 mm of the
  // front edge at its front stop, too close for the 51 mm deep stand on top), low: the case's bottom level with the
  // apron's (user 2026-10-21). The case leans back 15 deg and reaches 11.25 mm behind the stand, so a spacer block
  // (5/8" plywood) holds the stand out from the apron. The screen is a canvas texture: a placeholder status screen
  // (state + MPos) until FluidTouch itself runs in the page (Parts 19-20). ----
  // FluidTouch on the pendant (Part 20): the pendant's own firmware (js/fluidtouch_sim.js) runs while FluidNC does,
  // talking to it through FluidNC's web server. Its screen is the pendant screen's texture and the pop-out's canvas;
  // touches come from a click on the screen in the view, the pop-out, or a VR controller's tip (ftPoke). A $SD/Run from
  // its Files tab is held back until the page is ready to follow the job, as with the Run button (fjFromPendant).
  const FT = { ft: null, starting: null, frame: -1, popFrame: -1, drag: null, last: null, poker: null, log: [], homing: null };
  const PENDANT = { dir: "models/pendant/", x: 130, spacer: 15.9, parts: [["stand", "Pendant stand", "accent"], ["case_bottom", "Pendant case (back)", "main"],
    ["case_top", "Pendant case (bezel)", "main"]] };
  let pendant = null;                                 // { info, geos: { part: geometry }, screen: { geo, canvas, tex, key } }
  async function loadPendant() {
    try {
      const get = async (f) => { const r = await fetch(lr4v(PENDANT.dir + f)); if (!r.ok) throw new Error(f + ": " + r.status); return r; };
      const info = await (await get("pendant.json")).json(), geos = {};
      for (const [part] of PENDANT.parts) {           // binary STLs, already in the pendant frame (pendant_meshes.py)
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(LR4Files.readSTL(await (await get(part + ".stl")).arrayBuffer()), 3));
        g.computeVertexNormals();                    // a triangle soup: flat shading, as the printed parts
        geos[part] = g;
      }
      const c = info.screen.corners, sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(c.flat()), 3));
      sg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      sg.setIndex([0, 1, 2, 0, 2, 3]);
      sg.computeVertexNormals();
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = info.screen.px;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 4;
      pendant = { info, geos, screen: { geo: sg, canvas, tex, key: "" } };
      if (meta) rebuild();
    } catch (e) { console.warn("pendant not loaded:", e.message); }
  }
  function pendantMeshes() {                          // [geometry, material, userData] at this size's table
    const bb = tableBox(true);
    if (!pendant || !bb) return [];
    const P = pendant.info.parts, stand = P.stand.bbox;
    const ap = meshes.find((m) => m.userData.name === "TableApron");
    const bottom = ap ? new THREE.Box3().setFromObject(ap).min.z : bb.min.z;   // the apron's bottom (no apron: the top's)
    const caseLow = Math.min(P.case_top.bbox[2], P.case_bottom.bbox[2]);
    let base = { t: [bb.min.x + PENDANT.x, bb.min.y - PENDANT.spacer, bottom - caseLow], s: [1, 1, 1] }, mount = null;
    // torsion box: the dust shoe passes over the box's front face, so the pendant goes on the front end of the wider
    // (Max) rail strip, past the front belt holder (user 2026-10-23): a block under the strip's overhang makes the face
    const bx = (n) => { const m = meshes.find((q) => q.userData.name === n); return m && new THREE.Box3().setFromObject(m); };
    const st = bx("RailStrip_Max"), ed = bx("RailEdge_Max");
    if (U.base === "torsion" && st && ed) {
      // the stand's right edge flush with the table's side; a thicker spacer (2 x 5/8 ply) so the case's back clears
      // the strip's end (user 2026-10-23: "stick out a bit further")
      const sp = 2 * PENDANT.spacer, cx = Math.min((st.min.x + ed.max.x) / 2, ed.max.x - P.stand.bbox[3]);
      const front = st.min.y, low = ed.min.z;
      base = { t: [cx, front - sp, low - caseLow], s: [1, 1, 1] };
      mount = { front, sp, block: [st.min.x, front, low, st.max.x, front + 60, st.min.z] };
    }
    const ud = (name, label, extra) => Object.assign({ name, label, group: "Pendant", motion: "table", source: "pendant", base }, extra);
    const out = PENDANT.parts.map(([part, label, role]) => [pendant.geos[part], material(PRINT_ROLE[role], null),
      ud("Pendant_" + part, label, { role, color: PRINT_ROLE[role] })]);
    // the spacer: the stand's length, from the apron's bottom (or the stand's base) to the stand's top
    const sx = base.t[0], sz = base.t[2];
    if (mount) out.push([boxesGeo([mount.block]), material([0.86, 0.68, 0.44], null, false, "ply"), { name: "Pendant_mount",
      label: "Pendant mount block (5/8 in plywood, glued + screwed under the Max rail strip's front end)", group: "Pendant",
      motion: "table", source: "made", color: [0.86, 0.68, 0.44], ownGeo: true, grain: "ply" }]);
    const fy = mount ? mount.front : bb.min.y, sp = mount ? mount.sp : PENDANT.spacer, sBot = mount ? sz + stand[2] : Math.max(sz + stand[2], bottom);
    out.push([boxesGeo([[sx + stand[0], fy - sp, sBot, sx + stand[3], fy, sz + stand[5]]]),
      material([0.86, 0.68, 0.44], null, false, "ply"), { name: "Pendant_spacer", label: `Pendant spacer block (${mount ? "2 x " : ""}5/8 in plywood)`, group: "Pendant",
        motion: "table", source: "made", color: [0.84, 0.70, 0.50], ownGeo: true }]);
    pendantScreen(true);
    out.push([pendant.screen.geo, new THREE.MeshBasicMaterial({ map: pendant.screen.tex, toneMapped: false }),
      ud("Pendant_screen", "Pendant screen (FluidTouch, when the Run tab's controller is FluidNC)", { color: [0, 0, 0] })]);
    return out;
  }
  // the placeholder screen: what FluidTouch's status bar + DRO would show; redrawn when the text changes
  function pendantScreen(force) {
    if (!pendant) return;
    if (FT.ft && !FT.ft.stopped) {                   // FluidTouch's own screen, copied when it redraws
      const f = FT.ft.frame();
      if (!force && f === FT.frame) return;
      FT.frame = f; pendant.screen.key = "";
      FT.ft.draw(pendant.screen.canvas.getContext("2d"));
      pendant.screen.tex.needsUpdate = true;
      return;
    }
    const st = CTL.sim ? CTL.state || "…" : "Starting", m = CTL.mpos;
    const pos = m && m.every((v) => Number.isFinite(v)) ? m.map((v) => v.toFixed(2)) : ["–", "–", "–"];
    const key = [st, ...pos, CTL.homed].join("|");
    if (!force && key === pendant.screen.key) return;
    pendant.screen.key = key;
    const { canvas, tex } = pendant.screen, g = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    g.fillStyle = "#16181c"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#23262c"; g.fillRect(0, 0, W, 60);
    g.font = "600 28px system-ui, sans-serif"; g.textBaseline = "middle";
    g.fillStyle = "#e8e8e8"; g.fillText("FluidTouch", 20, 30);
    const col = /^Alarm/.test(st) ? "#ff5a4f" : /^(Run|Jog|Home)/.test(st) ? "#4fc3ff" : /^Hold/.test(st) ? "#ffb02e" : "#5ad16b";
    g.fillStyle = col; g.fillRect(W - 230, 12, 210, 36);
    g.fillStyle = "#101114"; g.textAlign = "center"; g.fillText(st.split(":")[0].toUpperCase(), W - 125, 31); g.textAlign = "left";
    g.font = "500 22px system-ui, sans-serif"; g.fillStyle = "#8b9099";
    g.fillText(CTL.homed ? "Machine position (MPos), mm" : "Machine position (MPos), mm - not homed", 40, 100);
    g.font = "600 64px ui-monospace, Consolas, monospace";
    ["X", "Y", "Z"].forEach((a, i) => {
      const y = 175 + i * 82;
      g.fillStyle = "#8b9099"; g.fillText(a, 50, y);
      g.fillStyle = !CTL.homed ? "#9aa0a8" : "#f2f2f2"; g.textAlign = "right"; g.fillText(pos[i], 520, y); g.textAlign = "left";
    });
    g.font = "400 18px system-ui, sans-serif"; g.fillStyle = "#6b7079";
    g.fillText(CTL.sim ? "Starting FluidTouch…" : "FluidTouch runs on this screen once FluidNC is running", 40, H - 24);
    tex.needsUpdate = true;
  }
  loadPendant();
  function rebuild() {
    clearMachine();
    updatePlatePolys();
    let tris = 0;
    const inst = LR4Model.instances(cfg, S);
    for (const o of inst) {
      if (o.name === "TableMDF") continue;           // Part 33: the table is drawn from table_model.js (tableMeshes)
      const g = recGeometry(o.rec);
      if (!g) continue;
      const { geo, fin, hasUV, tris: n } = g;
      const ud = Object.assign({}, o.rec.meta, { name: o.name, base: { t: o.t, s: o.s } });
      if (DUST_PARTS.test(o.name)) ud.group = "Shoe";   // own toggle, so the bit shows with the hose on (user 2026-10-20)
      if (o.rec.src) delete ud.variant;              // Peter Plates from files: the style picks the geometry
      if (o.name !== o.rec.meta.name) { ud.label = pretty(o.name); ud.ref = o.rec.meta.name; }
      const mat = material(ud.color, fin, hasUV);
      if (ud.clip) { ud.clip = Object.assign({}, ud.clip, { p: o.clipP }); mat.clippingPlanes = [new THREE.Plane()]; }
      addMesh(geo, mat, ud);
      tris += n;
    }
    for (const { rec, geo } of S.struts === "temp" ? [] : plateMeshes()) {   // temp struts: no MDF plates yet
      addMesh(geo, material(rec.meta.color, null), Object.assign({}, rec.meta, { name: rec.key, ownGeo: true }));
      tris += geo.attributes.position.count / 3;
    }
    for (const [geo, ud] of tableMeshes()) addMesh(geo, material(ud.color, null, false, ud.grain), ud);
    for (const [geo, ud] of legMeshes()) addMesh(geo, material(ud.color, null, false, ud.grain), ud);
    for (const [geo, mat, ud] of pendantMeshes()) addMesh(geo, mat, ud);
    meta = { cut_in: [S.cutX / IN, S.cutY / IN], travel: LR4Model.travel(cfg, S), tip_above_table: cfg.tip_above_table,
      hose: LR4Model.hose(cfg, S, inst), table_mm: [S.TW, S.TL], bom: cfg.bom_ref, peter_style: cfg.peter_style, parts: meshes,
      triangles: tris };
    if (meta.hose) makeHose();
    assignRoles();
    applyColours();
    applyVisibility();
    updateSliders();
    renderBom();
    updateShop();
  }

  // ---- workshop scenery (js/workshop.js) round the table, sized by the building size (blank = auto); the note
  // gives the gaps from the machine to each wall. Kept in this browser. ----
  let scenery = "shop", shop = null, shopVR = true, shopRoom = null;
  const ROOM = { w: 0, d: 0, h: 0 };                  // mm, 0 = auto
  const roomU = () => (U.unit === "in" ? 304.8 : 1000);   // ft or m
  const roomLen = (mm) => {
    if (U.unit !== "in") return (mm / 1000).toFixed(2) + " m";
    const i = Math.round(Math.abs(mm) / IN), sign = mm < 0 ? "\u2212" : "";
    return `${sign}${Math.floor(i / 12)}\u2032 ${i % 12}\u2033`;
  };
  function fillRoom() {
    for (const k of ["w", "d", "h"]) document.getElementById("room-" + k).value = ROOM[k] ? +(ROOM[k] / roomU()).toFixed(2) : "";
    document.querySelectorAll(".ru").forEach((u) => (u.textContent = U.unit === "in" ? "ft" : "m"));
  }
  function setupScenery() {
    try {
      scenery = localStorage.getItem("lr4-scenery") || "shop";
      Object.assign(ROOM, JSON.parse(localStorage.getItem("lr4-room") || "{}"));
    } catch (e) { /* defaults */ }
    const box = document.getElementById("scenery");
    const mark = () => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === scenery)));
      document.getElementById("room-box").hidden = scenery === "plain";
    };
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      scenery = b.dataset.v;
      try { localStorage.setItem("lr4-scenery", scenery); } catch (e) { /* not kept */ }
      mark(); updateShop();
    }));
    for (const k of ["w", "d", "h"]) document.getElementById("room-" + k).addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      ROOM[k] = isFinite(v) && v > 0 ? v * roomU() : 0;
      try { localStorage.setItem("lr4-room", JSON.stringify(ROOM)); } catch (err) { /* not kept */ }
      updateShop();
    });
    ["u-in", "u-mm"].forEach((id) => document.getElementById(id).addEventListener("click", () => { fillRoom(); fillTop(); updateShop(); }));
    const topEl = document.getElementById("table-top");
    const fillTop = () => (topEl.value = +(U.unit === "in" ? tableTop / IN : tableTop).toFixed(U.unit === "in" ? 2 : 0));
    topEl.addEventListener("change", () => {
      const v = parseFloat(topEl.value), mm = v * (U.unit === "in" ? IN : 1);
      if (!(mm >= 300 && mm <= 1500)) { fillTop(); return; }   // 12 - 59 in
      tableTop = mm;
      try { localStorage.setItem("lr4-table-top", String(mm)); } catch (e) { /* not kept */ }
      rebuild();                                      // new legs, workshop gaps; VR follows the new floor
    });
    mark(); fillRoom(); fillTop();
  }
  function updateShop() {
    if (shop) { scene.remove(shop); LR4Shop.dispose(shop); shop = null; }
    const note = document.getElementById("room-note"), warnEl = document.getElementById("room-warn");
    const legs = meshes.find((m) => m.userData.name === "TableLegs");
    if (!legs || scenery === "plain") { note.textContent = ""; warnEl.innerHTML = ""; shopRoom = null; return; }
    const tb = new THREE.Box3().setFromObject(legs), mb = new THREE.Box3();
    for (const m of meshes) if (m.userData.motion !== "hose") { m.updateMatrixWorld(); mb.expandByObject(m); }
    const floor = tb.min.z, table = { x0: tb.min.x, x1: tb.max.x, y0: tb.min.y, y1: tb.max.y };
    const machine = { x0: mb.min.x, x1: mb.max.x, y0: mb.min.y, y1: mb.max.y, z1: mb.max.z - floor };
    const R = LR4Shop.room(table, machine, ROOM), g = R.gaps, auto = !(ROOM.w && ROOM.d && ROOM.h);
    shopRoom = R;
    if (shopVR) {
      shop = LR4Shop.build(THREE, { room: R, table, machine, floor, empty: scenery === "empty" });   // Empty shop: no furniture
      shop.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; if (o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.3; } });
      scene.add(shop); shop.visible = !INSPECT;
    }
    const c = tb.getCenter(new THREE.Vector3()), r = Math.max(tb.getSize(new THREE.Vector3()).length(), mb.getSize(new THREE.Vector3()).length()) * 0.6;
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(SUN_DIR, 3 * r);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r, far: 5 * r });
    sun.shadow.camera.updateProjectionMatrix();
    note.textContent = `Room ${roomLen(R.x1 - R.x0)} \u00d7 ${roomLen(R.y1 - R.y0)}, ${roomLen(R.h)} walls${auto ? " (blank = a 16 × 20 ft shop, 8′ 4″ ceiling)" : ""}, ` +
      `machine centered. To the walls: X sides ${roomLen(g.left)} / ${roomLen(g.right)}, front ${roomLen(g.front)}, ` +
      `back ${roomLen(g.back)}; ${roomLen(g.top)} above it.`;
    const warn = [], side = { left: "on the \u2212X side", right: "on the +X side", front: "at the front", back: "at the back" };
    const need = U.unit === "in" ? "2 ft" : "600 mm";
    for (const [k, txt] of Object.entries(side))
      if (g[k] < 0) warn.push(`The machine doesn't fit: it's ${roomLen(-g[k])} past the wall ${txt}.`);
      else if (g[k] < LR4Shop.WALK) warn.push(`Only ${roomLen(g[k])} ${txt} - under ${need} to walk past.`);
    if (g.top < 0) warn.push(`The ceiling is ${roomLen(-g.top)} below the top of the machine.`);
    warnEl.innerHTML = warn.map((w) => `<p class="warn">${w}</p>`).join("");
  }

  function fitView(dir) {
    const box = new THREE.Box3();
    for (const m of meshes) if (m.visible && (INSPECT || m.userData.motion !== "hose")) { m.updateMatrixWorld(); box.expandByObject(m); }
    if (box.isEmpty()) return;
    box.getCenter(center);
    radius = box.getSize(new THREE.Vector3()).length() / 2;
    // inspect: the whole set in view (its bounding sphere in the narrower of the two angles), the machine's own framing otherwise
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    frame(dir, INSPECT ? (radius / Math.sin(half)) * 1.05 : undefined);
  }

  // every part's mesh made once (recGeometry caches it; the user's STLs parsed) with a count in the popup, so placing
  // the parts is quick (user 2026-10-24: "Placing the 368 parts" sat with no progress - this was most of it)
  async function warmGeometry(report) {
    const recs = cfg.parts.filter((r) => r.mesh || r.src);
    let t = performance.now();
    for (const [k, r] of recs.entries()) {
      recGeometry(r);
      if (performance.now() - t > 50) {
        report(k / recs.length, `Preparing the part meshes: ${k} of ${recs.length}`);
        await nextFrame();
        t = performance.now();
      }
    }
  }

  async function load() {
    progress("Loading model…", 0, "parts list");
    const r = await fetch(lr4v(DATA + "lr4_config.json"));   // lr4v: cache busting (index.html)
    if (!r.ok) throw new Error("lr4_config.json " + r.status);
    cfg = await r.json();
    const total = cfg.geometry_bytes || 0;             // gzip of the meshes (fit_config.py / share_data.py)
    let got = 0;
    const raw = await fetchBytes(lr4v(DATA + "lr4_config_geometry.bin.gz"), (n) => { got += n;
      progress("Downloading geometry…", total ? got / total : null, total ? `${MB(got)} of ${MB(total)}` : MB(got)); });
    progress("Unpacking…", 1, "gzip");
    await nextFrame();
    bin = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    if (cfg.files) await setupFiles();
    // the build in named stages, the popup saying which (user 2026-10-23: it sat on "Building the machine" for seconds)
    const stages = [
      ["Setting up the panels", () => { setupShow(); setupColours(); setupDetail(); }],
      ["Preparing the part meshes", warmGeometry],
      [`Placing the ${cfg.parts.length} parts`, setupSize],
      ["Bill of materials", () => { setupVariants(); setupBom(); setupAbout(); }],
      ["Workshop and lights", () => { setupScenery(); setupLighting(); updateShop(); fitView([1, -1.15, 0.85]); }],
      ["Compiling shaders (first frame)", () => { lighting(); renderer.compile(scene, camera); renderer.render(scene, camera); }]];
    for (const [i, [what, run]] of stages.entries()) {
      progress("Building the machine…", i / stages.length, what);
      await nextFrame();
      await run((f, detail) => progress("Building the machine…", (i + f) / stages.length, detail));
    }
    progress("Building the machine…", 1, "Done");
    building = false;
    await nextFrame();
    statusEl.hidden = true;
    const dev = cfg.files && new URLSearchParams(location.search).get("parts");   // testing: fetch the files from a folder URL
    if (dev) await addFiles([...needed.keys()].map((p) => ({ name: p,
      read: () => fetch(dev + p).then((q) => q.ok ? q.arrayBuffer() : Promise.reject(new Error(p + " " + q.status))) })));
    applyLink();
    ctlStartup();                                    // FluidNC boots on the built machine (controller.js)
  }

  // ---- Peter Plates: solid (stepper openings filled) or open honeycomb in a solid border - one shown at a time ----
  let peterStyle = "solid";
  // "none" hides both styles and the covers' M3s (peter_hw: the screws and their threads, shown with either style)
  const variantOK = (m) => m.userData.peter_hw ? peterStyle !== "none"
    : !m.userData.variant || m.userData.variant === peterStyle;
  function setupVariants() {
    const box = document.getElementById("peter-variant");
    if (cfg.files) return setupFileVariants(box);
    const have = new Set(meshes.map((m) => m.userData.variant).filter(Boolean));
    if (have.size < 2) return;
    have.add("none");
    let saved = null;
    try { saved = localStorage.getItem("peter-style"); } catch (e) { /* defaults */ }
    peterStyle = saved && have.has(saved) ? saved : (meta.peter_style || "solid");
    const mark = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === peterStyle)));
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      peterStyle = b.dataset.v;
      try { localStorage.setItem("peter-style", peterStyle); } catch (e) { /* not kept */ }
      mark();
      applyVisibility();
    }));
    box.hidden = false;
    mark();
    applyVisibility();
  }

  // from the user's files: Open (PeterPlates_w_locations, stepper locations open - what the build places), Closed
  // (PeterPlateT / B as downloaded), Honeycomb (made here from the Closed files - LR4Files.honeycomb) or None; the
  // style picks each plate's geometry, so a change rebuilds
  function setupFileVariants(box) {
    const STYLES = [["open", "Open"], ["closed", "Closed"], ["honeycomb", "Honeycomb"], ["none", "None"]];
    box.querySelectorAll("button").forEach((b) => b.remove());
    for (const [v, label] of STYLES) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.v = v; b.textContent = label;
      box.appendChild(b);
    }
    let saved = null;
    try { saved = localStorage.getItem("peter-style-files"); } catch (e) { /* defaults */ }
    peterStyle = STYLES.some(([v]) => v === saved) ? saved : "closed";
    const mark = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === peterStyle)));
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (peterStyle === b.dataset.v) return;
      peterStyle = b.dataset.v;
      try { localStorage.setItem("peter-style-files", peterStyle); } catch (e) { /* not kept */ }
      mark();
      rebuild();
    }));
    box.hidden = false;
    mark();
    rebuild();
  }

