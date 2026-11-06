// lr4-sandbox page, part 1 of 14: the 3D scene: renderer, metals, the machine at the chosen size, Lite mode, your own files, legs, the table, the FluidTouch pendant model, the workshop, Peter Plates.
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
  const AB = { set: null, E: { y: 0, z: 0 }, geo: null, piv: null, posed: false, home: null, probeDz: 0, magnified: false };
  try { AB.set = Imperfect.settings(JSON.parse(MS.get("lr4-asbuilt") || "null")); } catch (e) { AB.set = Imperfect.settings(); }
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

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, stencil: true });   // stencil: Inspect's section caps (off by default since r163)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic: highlights roll off instead of clipping
  renderer.toneMappingExposure = 0.7;
  renderer.shadowMap.enabled = true;                  // the sun's soft shadows (off in Lite: setupDetail)
  renderer.shadowMap.type = THREE.PCFShadowMap;   // soft since r181 (PCFSoftShadowMap: removed)
  // no shader log read after each compile (~150 ms of a load; three's advice for production): ?shaders=check for a shader error
  renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has("shaders");
  renderer.localClippingEnabled = true;             // straight belt runs are cut at the moving gantry / core
  const scene = new THREE.Scene();

  // ---- metals: they only look like metal when they have something to reflect, so the metal parts get a soft
  // studio environment (RoomEnvironment) as their envMap; the XZ plates also get a fine brushed grain ----
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
  // the EMT (galvanized): a soft studio instead - a smooth bright-top / dark-floor gradient + one broad glow, Z up.
  // RoomEnvironment is a box room (Y up): a cylinder mirrors its walls as flat bands with hard steps, so the tubes read
  // as rounded squares (user 2026-10-25)
  const softEnv = (() => {
    const s = new THREE.Scene(), m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vD; void main() { vec3 c = mix(vec3(0.32, 0.31, 0.30), vec3(0.95, 0.97, 1.0), smoothstep(-0.5, 0.9, vD.z));"
        + " c += vec3(1.2) * pow(max(dot(vD, normalize(vec3(-0.4, -0.6, 0.7))), 0.0), 10.0); gl_FragColor = vec4(c, 1.0); }" });
    s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), m));
    return new THREE.PMREMGenerator(renderer).fromScene(s, 0.02).texture;
  })();
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
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const FINISH = {                                    // colour (sRGB), roughness; fully metallic unless m
    aluminium: { c: [0.86, 0.87, 0.89], r: 0.36 },
    aluminium_plate: { c: [0.80, 0.81, 0.83], r: 0.40, brushed: true },
    steel: { c: [0.72, 0.73, 0.75], r: 0.28 },
    galvanized: { c: [0.79, 0.81, 0.83], r: 0.52, m: 0.85, spangle: true },   // softer (user 2026-10-25: was r 0.46, fully metal; 0.75 / 0.55 too dull)
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
    // the corners at one spot as a group (gid), found with a flat hash table, then listed per group in corner order
    // (CSR: at[from[g] .. from[g + 1]]) - typed arrays, not a Map of arrays (that was ~1.1 s of a warm reload)
    const nv = nt * 3, gid = new Int32Array(nv);
    let ng = 0;
    if (num) {
      const size = 2 ** Math.ceil(Math.log2(nv * 2 + 2)), mask = size - 1;
      const slot = new Int32Array(size).fill(-1), gkey = new Float64Array(nv);
      for (let v = 0; v < nv; v++) {
        const i = v * 3, x = Math.round((P[i] - b0.x) * 200), y = Math.round((P[i + 1] - b0.y) * 200), z = Math.round((P[i + 2] - b0.z) * 200);
        const key = x + K * (y + K * z);
        let h = Math.imul(key >>> 0, 0x9e3779b1) ^ Math.imul(Math.floor(key / 4294967296), 0x85ebca6b);
        h = (h ^ (h >>> 15)) & mask;
        while (slot[h] >= 0 && gkey[slot[h]] !== key) h = (h + 1) & mask;
        if (slot[h] < 0) { slot[h] = ng; gkey[ng++] = key; }
        gid[v] = slot[h];
      }
    } else {                                          // too big a grid for one number: strings
      const seen = new Map();
      for (let v = 0; v < nv; v++) {
        const i = v * 3, k = `${Math.round((P[i] - b0.x) * 200)},${Math.round((P[i + 1] - b0.y) * 200)},${Math.round((P[i + 2] - b0.z) * 200)}`;
        let g = seen.get(k);
        if (g === undefined) seen.set(k, g = ng++);
        gid[v] = g;
      }
    }
    const from = new Int32Array(ng + 1), at = new Int32Array(nv);
    for (let v = 0; v < nv; v++) from[gid[v] + 1]++;
    for (let g = 0; g < ng; g++) from[g + 1] += from[g];
    const fill = from.slice(0, ng);
    for (let v = 0; v < nv; v++) at[fill[gid[v]]++] = (v / 3) | 0;   // the triangle of each corner
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
      const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;   // (not Math.hypot: slow in V8)
      fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
    }
    const cos = Math.cos(deg * Math.PI / 180), N = new Float32Array(P.length);
    for (let v = 0; v < nv; v++) {
      const t3 = ((v / 3) | 0) * 3, tx = fn[t3], ty = fn[t3 + 1], tz = fn[t3 + 2], g = gid[v];
      let sx = 0, sy = 0, sz = 0;
      for (let j = from[g]; j < from[g + 1]; j++) {
        const f3 = at[j] * 3, fx = fn[f3], fy = fn[f3 + 1], fz = fn[f3 + 2];
        if (fx * tx + fy * ty + fz * tz < cos) continue;
        sx += fx; sy += fy; sz += fz;
      }
      const l = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1, o = v * 3;
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
    t.colorSpace = THREE.SRGBColorSpace;
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
    t.colorSpace = THREE.SRGBColorSpace;
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
    // the far plane follows it out (zoomed far out, the whole building and the ground to the horizon; the workshop's
    // sky and grass scale with it), and the near plane with the far one: the same depth precision as 5 mm / 20 m
    const d = camera.position.distanceTo(controls.target), far = Math.max(20000, Math.round(d * 2 + 12000));
    const near = tball.enabled ? Math.min(5, Math.max(0.1, d / 100)) : 5 * far / 20000;
    if (camera.near !== near || camera.far !== far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
  }
  // light: the studio environment lights every surface (soft, directional ambient), a weak sky / ground fill, and a
  // sun that casts soft shadows (fitted to the table in updateShop). Intensities in three's physical units since r155:
  // LIGHT_PI x the r147 (legacy) numbers below keeps the look (the RectAreaLights were never scaled)
  const LIGHT_PI = Math.PI;
  scene.environment = envMap;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6157, 0.3 * LIGHT_PI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.1 * LIGHT_PI);
  sun.position.set(-900, -1400, 1500);
  sun.castShadow = true;
  Object.assign(sun.shadow, { bias: -0.0002, normalBias: 1.2 });   // mm: no acne on the double-sided parts
  sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-900, -1400, 1500).normalize();   // lower than straight overhead: shadows you can see
  const fill = new THREE.DirectionalLight(0xffffff, 0.25 * LIGHT_PI);
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
  // the studio environment at 0.3 (the plain parts, the shop): since r163 envMapIntensity only scales a material's own
  // envMap, so these carry scene.environment as theirs (userData.envLow), and lighting() keeps it in step (off in Simple)
  function envLow(mat) { Object.assign(mat, { envMap: scene.environment, envMapIntensity: 0.3 }); mat.userData.envLow = true; return mat; }
  function lighting() {
    const real = lightQ() === "real", inShop = real && !!(shop && shop.visible && shop.userData.lamps);
    const mode = real ? (inShop ? "shop" : "studio") : "simple";
    if (mode === LIGHT.mode && (!inShop || LIGHT.shop === shop) && LIGHT.lite === lite) return;
    Object.assign(LIGHT, { mode, shop: inShop ? shop : null, lite });
    for (const l of [...LIGHT.rig.children]) { LIGHT.rig.remove(l); if (l.dispose) l.dispose(); }
    scene.environment = real ? envMap : null;
    scene.traverse((o) => { const m = o.material; if (m && m.userData && m.userData.envLow && m.envMap !== scene.environment) { m.envMap = scene.environment; m.needsUpdate = true; } });
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = real ? 0.7 : 1.0;
    sun.visible = fill.visible = !inShop;
    sun.intensity = (real ? 1.1 : 0.75) * LIGHT_PI;
    sun.castShadow = real && !inShop && !lite;
    hemi.intensity = (!real ? 0.85 : inShop ? 0.18 : 0.3) * LIGHT_PI;
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
    const spot = new THREE.SpotLight(LED, 0.55 * LIGHT_PI, 0, Math.PI / 2.4, 0.95, 0);   // the shadows: from between the machine's strips
    spot.position.set(x, y, z);
    spot.target.position.set(x, y, ud.garage.z);
    spot.castShadow = !lite;
    Object.assign(spot.shadow, { bias: -0.0003, normalBias: 1.2 });
    spot.shadow.mapSize.set(4096, 4096);
    Object.assign(spot.shadow.camera, { near: 150, far: z - ud.garage.z + 200 });
    LIGHT.rig.add(spot, spot.target);
    const day = new THREE.DirectionalLight(0xdfe9ff, 0.35 * LIGHT_PI);   // daylight through the open garage door
    day.position.set(x, ud.garage.y + 6000, ud.garage.z + 1800);
    day.target.position.set(x, y, ud.garage.z);
    LIGHT.rig.add(day, day.target);
  }

  function setupLighting() {                          // once: the Lighting buttons
    try { LIGHT.saved = MS.get("lr4-lighting"); } catch (e) { /* auto */ }
    const box = document.getElementById("lighting");
    const mark = () => {
      const q = lightQ();
      box.querySelectorAll("button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === q)));
      document.getElementById("lighting-note").innerHTML =   // both options (user: not just the one picked)
        "<p><b>Realistic:</b> the workshop's own lights, soft shadows (Full detail), filmic color. Needs a decent GPU.</p>"
        + "<p><b>Simple:</b> even light, no shadows. Lightest on the GPU.</p>"
        + (LIGHT.saved ? "" : `<p>${q === "real" ? "Realistic" : "Simple"} was picked for this device.</p>`);
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");   // not the "?"
      if (!b) return;
      LIGHT.saved = b.dataset.v;
      try { MS.set("lr4-lighting", LIGHT.saved); } catch (e2) { /* not kept */ }
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
    tex.colorSpace = THREE.SRGBColorSpace;
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
    try { saved = MS.get("detail"); } catch (e) { /* auto */ }
    const auto = autoLite();
    lite = saved ? saved === "lite" : auto;
    const mark = () => {
      box.querySelectorAll("button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "lite") === lite)));
      document.getElementById("detail-note").innerHTML =
        "<p><b>Full:</b> every triangle of every file, at your screen's sharpness.</p>"
        + "<p><b>Lite:</b> simplified meshes (about a fifth of the triangles), for phones and weaker GPUs; the printed look is off by default.</p>"
        + (saved ? "" : `<p>${lite ? "Lite" : "Full"} was picked for this device.</p>`);
      renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      if (LIGHT.mark) LIGHT.mark();                  // Lighting's default follows Lite
      resize();
    };
    let busy = false;
    // switching remakes every mesh: the loading popup with the same count as at load (user 2026-10-24: it sat for
    // seconds with no sign of life)
    box.querySelectorAll("button[data-v]").forEach((b) => b.addEventListener("click", async () => {
      if (busy || (b.dataset.v === "lite") === lite) return;
      busy = true;
      lite = b.dataset.v === "lite";
      saved = b.dataset.v;
      try { MS.set("detail", saved); } catch (e) { /* not kept */ }
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
    const tm = touchMove(rec) || shoeScrewMove(rec), key = tm ? rec.key + "|" + tm.mount : rec.key;
    let e = geoCache.get(key);
    if (e) return e;
    const p = rec.mesh, fin = FINISH[rec.meta.finish];
    let pos = new Float32Array(bin, p.pos[0], p.pos[1] * 3);
    if (tm) pos = tm.move(pos);                       // a moved copy (pos is a view of the shared data)
    const idx = p.idx[2] === 32 ? new Uint32Array(bin, p.idx[0], p.idx[1]) : new Uint16Array(bin, p.idx[0], p.idx[1]);
    if (lite) {                                       // clustered: the shipped UVs no longer fit, dress() makes its own
      e = entry(dress(liteGeo(pos, idx), fin, false), fin, false);
      geoCache.set(key, e);
      return e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    if (p.uv !== undefined) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(bin, p.uv, p.pos[1] * 2), 2));
    e = entry(dress(geo, fin, p.uv !== undefined), fin, p.uv !== undefined);
    geoCache.set(key, e);
    return e;
  }
  // Part 50: the touch plate + magnet + clip as stored on the Makita / DeWalt mounts' cage (freecad/touch_alt.py ->
  // data/touch_alt.json: per mount and group, the move from the Kobalt pose in the mount files' frame, D): drawn there
  // while that mount's files are (mountAlt), as A . D . A^-1 (A: the top mount's file -> machine); else the Kobalt's
  let touchAlt = null;
  const touchMoves = {};
  // the plate + clip stored in a cage (Makita / DeWalt, as drawn): { n } = out through the cage's front, level (world,
  // the mount files' (1, 1, 0) / r2); job.js lifts them out of it before anything else (nothing passes its walls)
  function touchCage() {
    const top = cfg && touchAlt && touchAlt.mounts[mountNow()] && cfg.parts.find((r) => r.key === "Tool_Mount_T_Kobalt");
    if (!top || !mountAlt(top.src)) return null;
    const A = top.src.A, n = [0, 1, 2].map((i) => (A[i][0] + A[i][1]) / Math.SQRT2);
    return { n: new THREE.Vector3(...n).normalize() };
  }
  function touchMove(rec) {
    const mount = mountNow(), d = touchAlt && touchAlt.mounts[mount], name = rec.meta.name;
    const group = d && ["plate", "magnet", "clip"].find((g) => touchAlt[g].includes(name));
    const top = group && cfg.parts.find((r) => r.key === "Tool_Mount_T_Kobalt");
    if (!top || !mountAlt(top.src)) return null;
    const k = mount + "|" + group;
    if (!touchMoves[k]) {
      const A = new THREE.Matrix4().set(...top.src.A.flat(), 0, 0, 0, 1);
      const M = A.clone().multiply(new THREE.Matrix4().set(...d[group].flat())).multiply(A.clone().invert());
      touchMoves[k] = { mount, M, move: (pos) => { const out = new Float32Array(pos), v = new THREE.Vector3();
        for (let i = 0; i < out.length; i += 3) { v.fromArray(out, i).applyMatrix4(M); v.toArray(out, i); }
        return out; } };
    }
    return touchMoves[k];
  }
  // the dust shoe's screw (lr4.SHOE_SCREW_HOLE: an M5 at 35 deg in plan through the shoe's slot into the bottom mount)
  // on the Makita / DeWalt files: their mount's hole is elsewhere than the Kobalt's the build put it in (user 2026-11-01,
  // "an alignment problem"; private/hole_loops.py, fclib holes_near: each shoe's slot lines up with its own mount's
  // hole) - moved by the hole's shift in the mount files' frame (mm), A . T . A^-1 as touchMove
  // (+ out along the screw, (0.816, 0.578, 0), so the head seats as on the Kobalt: their shoe's face is 0.36 / 0.17 mm
  // further out there - private/page_tools/screw_seat.js)
  const SHOE_SCREW_ALT = { makita: [-0.75, 0.27, 0], dewalt: [2.41, -0.97, 0] };
  const shoeScrewMoves = {};
  function shoeScrewMove(rec) {
    const mount = mountNow(), d = SHOE_SCREW_ALT[mount];
    if (!d || !/^Dust_Shoe_Kobalt__M5_to_Tool_Mount_B_Kobalt/.test(rec.meta.name)) return null;
    const bot = cfg.parts.find((r) => r.key === "Tool_Mount_B_Kobalt");
    if (!bot || !mountAlt(bot.src)) return null;
    if (!shoeScrewMoves[mount]) {
      const A = new THREE.Matrix4().set(...bot.src.A.flat(), 0, 0, 0, 1);
      const M = A.clone().multiply(new THREE.Matrix4().makeTranslation(...d)).multiply(A.clone().invert());
      shoeScrewMoves[mount] = { mount, M, move: (pos) => { const out = new Float32Array(pos), v = new THREE.Vector3();
        for (let i = 0; i < out.length; i += 3) { v.fromArray(out, i).applyMatrix4(M); v.toArray(out, i); }
        return out; } };
    }
    return shoeScrewMoves[mount];
  }
  function touchMatrix(name) {                       // a touch part's move into the cage (null: drawn as on the Kobalt)
    const rec = cfg && cfg.parts.find((r) => r.meta && r.meta.name === name), t = rec && touchMove(rec);
    return t ? t.M : null;
  }

  // ---- bring your own files (share data: cfg.files + a `src` per V1E part instead of its mesh - pipeline/share_data.py).
  // The user's files are matched by SHA-256 (js/parts_files.js), kept in IndexedDB, and placed by each part's A. ----
  const DATA = "data/";                                // pipeline/share_data.py (no V1E geometry); the same file published
  const userFiles = new Map();                        // manifest path -> {name, sha256, ok, buf}
  const srcCache = new Map(), soupCache = new Map();
  let needed = null;                                  // manifest path -> the part names placed from it
  const optional = new Set();                         // files used only when picked (the extra-long bristles): not counted
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
  // the bristles' strip: Standard (22 mm, what the build bends) or Extra long (32 mm: src.long, its own file) - the
  // Options step's Bristles; the long one only once its file is loaded (else the standard)
  const bristleSrc = (s) => (s.kind === "bent" && s.long && bristleLen === "long" && userFiles.has(s.long.file) ? Object.assign({}, s, s.long) : s);
  // the other V1E mounts (Part 45c, 2026-10-30): a Kobalt mount part (tool mounts, shoe, skirt) drawn from the router's
  // mount's file (src.alt: the Makita 701 / T1 or DeWalt 611 set, in the Kobalt files' frame: the same A) once that
  // file is loaded, else the Kobalt's. MOUNT_NAME: the label's "Kobalt" for that set
  const MOUNT_NAME = { makita: "Makita 701", dewalt: "DeWalt 611" };
  // the router's mount set's files that aren't loaded (user 2026-11-01: their parts are drawn as the Kobalt's then - say
  // so, and the clash check leaves the shoe out): [file], [] = all in (or the Kobalt's / no mount)
  function mountMissing() {
    const m = mountNow(), out = [];
    if (!cfg || !MOUNT_NAME[m]) return out;
    for (const r of cfg.parts) {
      const a = r.src && r.src.alt && r.src.alt[m];
      if (a && !userFiles.has(a.file) && !out.includes(a.file)) out.push(a.file);
    }
    return out;
  }
  const mountNow = () => { const r = typeof LR4Routers !== "undefined" && typeof RT !== "undefined" && LR4Routers.ROUTERS[RT.set.router]; return r ? r.mount : "kobalt"; };
  const mountAlt = (s) => { const a = s && s.alt && s.alt[mountNow()]; return a && userFiles.has(a.file) ? a : null; };
  function srcGeometry(rec) {
    const s0 = bristleSrc(rec.src), alt = mountAlt(s0), s = alt ? Object.assign({}, s0, alt) : s0;
    const ck = rec.key + (s.kind === "peter" ? "|" + peterStyle : "") + (s0 !== rec.src ? "|long" : "") + (alt ? "|" + alt.file : "");
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
  // Part 38: a part whose file isn't loaded: a plain box over its bounding box at the reference size (lo_ref / hi_ref:
  // no V1E geometry), placed like the part (base t / s); null where nothing would be drawn anyway (Peter Plates "none")
  function standInGeo(rec) {
    if (!rec.src || !rec.lo_ref || !rec.hi_ref || (rec.src.kind === "peter" && peterStyle === "none")) return null;
    const [a, b] = [rec.lo_ref, rec.hi_ref], g = new THREE.BoxGeometry(...[0, 1, 2].map((i) => Math.max(b[i] - a[i], 0.5)));
    return g.translate(...[0, 1, 2].map((i) => (a[i] + b[i]) / 2));
  }
  function dropSrcGeometry() {                        // the user's files changed: rebuild their parts' geometry
    for (const e of srcCache.values()) if (e) e.geo.dispose();
    srcCache.clear();
    soupCache.clear();
  }
  function material(color, fin, hasUV, grain) {         // grain: "pine" / "ply" (woodTex; boxesGeo's UVs)
    if (fin) {                                        // metal: reflects the environment
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(...fin.c).convertSRGBToLinear(), metalness: fin.m ?? 1.0, roughness: fin.r,
        envMap: fin.spangle ? softEnv : envMap, envMapIntensity: 1.0, side: THREE.DoubleSide});
      if (fin.brushed) Object.assign(mat, { roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.04 });
      if (fin.spangle) Object.assign(mat, { map: spangle, roughnessMap: spangle });
      if (fin.thread && hasUV) Object.assign(mat, { map: threadV, bumpMap: threadV, bumpScale: 0.9 });
      else if (fin.thread) Object.assign(mat, { map: thread, bumpMap: thread, bumpScale: 1.2 });
      return mat;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(...color).convertSRGBToLinear(),
      roughness: 0.6, metalness: 0.0, envMap: scene.environment, envMapIntensity: 0.3, side: THREE.DoubleSide});
    mat.userData.envLow = true;                     // (lighting(): its envMap follows scene.environment)
    if (grain) Object.assign(mat, { map: woodTex(grain), bumpMap: woodTex(grain), bumpScale: 0.25, roughness: 0.75 });
    return mat;
  }
  // ---- Part 40: printed parts look printed - layer lines along each part's print Z (a normal tilt across each bead,
  // fading out once a layer is under ~3 px, so no shimmer far out), the bed face (textured PEI sparkle / smooth gloss),
  // fiber specks (CF dark, GF light) and PETG's thin-edge glow. No geometry: one shader on the printed materials.
  // Per mesh: uPrintDir / uPrintOff (file z = dot(dir, p) + off, p in the mesh's own coordinates = the ref build's
  // frame) and the material's uFiber / uRim; shared: PRINT.layer / bed / lines (panel.js sets them). ----
  const PRINT = { layer: { value: 0.2 }, bed: { value: 1 }, lines: { value: 1 } };
  const PRINT_AXIS = { "peter/PeterPlates_w_locations.stl": 1 };   // a layout file: both plates on edge, thickness on file Y
  function printFrame(src) {                          // a part's print Z from its file's placement A, or null
    if (!src || src.kind === "bent" || src.kind === "dxf") return null;   // the bent TPU strip: no straight layers
    const r = src.kind === "peter" ? (peterStyle === "honeycomb" || !src[peterStyle] ? src.closed : src[peterStyle]) : src;
    if (!r || !r.A) return null;
    const A = r.A, ax = PRINT_AXIS[r.file] ?? 2, d = [A[0][ax], A[1][ax], A[2][ax]];
    return { dir: d, off: -(d[0] * A[0][3] + d[1] * A[1][3] + d[2] * A[2][3]) };
  }
  // Peter Plates (any style): printed outside face down - the print Z points inward (the bed face's normal outward:
  // -X on the Min side, +X on Max) and starts at the plate's outermost face (the open layout file's own origin isn't the bed)
  function bedOutside(mat, geo, name) {
    const u = mat.userData.print, d = u.uPrintDir.value, out = /_Min$/.test(name) ? -1 : 1;
    if (d.x * out > 0) d.negate();
    const p = geo.attributes.position.array;
    let lo = Infinity;
    for (let i = 0; i < p.length; i += 3) lo = Math.min(lo, d.x * p[i] + d.y * p[i + 1] + d.z * p[i + 2]);
    u.uPrintOff.value = -lo;
  }
  const PRINT_VS = `
uniform vec3 uPrintDir; uniform float uPrintOff;
varying float vPrintZ; varying vec3 vObjPos; varying vec3 vPrintDirV;`;
  const PRINT_FS = `
uniform vec3 uPrintDir; uniform float uLayer, uBed, uLines, uFiber, uRim;
varying float vPrintZ; varying vec3 vObjPos; varying vec3 vPrintDirV;
float lr4h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 lr4h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float lr4F(float x) { float f = fract(x); return f * f - f; }                       // integral of the bead s = 2 fract - 1
float lr4G(float x) { float s = 2.0 * fract(x) - 1.0; return floor(x) / 3.0 + (s * s * s + 1.0) / 6.0; }   // ... of s^2`;
  const PRINT_FRAG = `
{
  float lines = uLines * step(0.5, dot(uPrintDir, uPrintDir));
  vec3 pd = normalize(vPrintDirV);
  float nd = dot(normal, pd);
  vec3 dp = pd - normal * nd;                         // the print Z along the surface (0 on tops and bottoms)
  // s = -1 bottom of a bead .. 1 its top, box-filtered over the pixel (w layers wide): no moire, so the lines can
  // show down to about a pixel a layer
  float w = max(fwidth(vPrintZ) / uLayer, 1e-4), x = vPrintZ / uLayer;
  float fade = lines * (1.0 - smoothstep(0.6, 1.2, w));
  if (fade > 0.0) {
    float s = (lr4F(x + 0.5 * w) - lr4F(x - 0.5 * w)) / w, s2 = (lr4G(x + 0.5 * w) - lr4G(x - 0.5 * w)) / w;
    normal = normalize(normal + dp * s * 0.75 * fade);
    diffuseColor.rgb *= 1.0 - 0.12 * fade * length(dp) * s2;
  }
  float near = 1.0 - smoothstep(0.35, 0.9, length(fwidth(vObjPos)) * 5.0);
  if (lines > 0.0 && nd < -0.9 && abs(vPrintZ) < 0.6 * uLayer) {   // the face that sat on the bed
    if (uBed > 0.5) {                                 // textured PEI: matte and a little lighter from afar, grain up close
      float g = 1.0 - smoothstep(0.35, 0.9, length(fwidth(vObjPos)) * 2.5);
      normal = normalize(normal + (lr4h33(floor(vObjPos * 2.5)) - 0.5) * 0.6 * g);
      roughnessFactor = max(roughnessFactor, 0.85);
      diffuseColor.rgb = diffuseColor.rgb * 1.18 + 0.025;
    }
    else roughnessFactor *= 0.35;
  }
  if (uFiber > 0.5) {
    float spk = step(0.9, lr4h13(floor(vObjPos * 6.0))) * near;
    diffuseColor.rgb = mix(diffuseColor.rgb, uFiber > 1.5 ? diffuseColor.rgb * 1.5 + 0.10 : diffuseColor.rgb * 0.5 + 0.02, spk);
    roughnessFactor = mix(roughnessFactor, 0.4, spk);
  }
}`;
  function printedMaterial(color, frame) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(...color).convertSRGBToLinear(),
      roughness: 0.42, metalness: 0.0, envMap, envMapIntensity: 0.3, side: THREE.DoubleSide });
    const u = { uPrintDir: { value: new THREE.Vector3(...(frame ? frame.dir : [0, 0, 0])) }, uPrintOff: { value: frame ? frame.off : 0 },
      uFiber: { value: 0 }, uRim: { value: 0 }, uLayer: PRINT.layer, uBed: PRINT.bed, uLines: PRINT.lines };
    mat.userData.print = u;
    mat.extensions = { derivatives: true };           // fwidth on WebGL 1
    mat.customProgramCacheKey = () => "lr4-print";
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>" + PRINT_VS).replace("#include <begin_vertex>",
        "#include <begin_vertex>\n vPrintZ = dot(uPrintDir, position) + uPrintOff; vObjPos = position;"
        + " vPrintDirV = (modelViewMatrix * vec4(uPrintDir, 0.0)).xyz + vec3(1e-6);");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + PRINT_FS)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>" + PRINT_FRAG)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n if (uRim > 0.0) { float fr = 1.0 - abs(dot(normal, normalize(vViewPosition)));"
          + " totalEmissiveRadiance += diffuseColor.rgb * uRim * fr * fr * fr; }");
    };
    return mat;
  }
  const pretty = (n) => n.replace(/_/g, " ").replace("29p5", "29.5").replace(" V1", "").replace("Kobalt", "(Kobalt)").trim();
  let platePolys = null;
  function updatePlatePolys() {                     // every size, Temporary struts too (the drawing + downloads use it)
    platePolys = StrutPlate.plates(polygonClipping, S.strut, { nbraces: S.n === S.auto ? 0 : S.n, wing: WING, dogbones: DOGBONE, layout: false });
  }
  const plateShapes = (mp) => mp.map((poly) => {
    const sh = new THREE.Shape(poly[0].slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    sh.holes = poly.slice(1).map((r) => new THREE.Path(r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))));
    return sh;
  });
  function plateGeo(key, mp) {                       // generator 2D, extruded STRUT_T, uv in mm / grain, in the machine
    const geo = key === "StrutPlate_Front" && DESIGN.ok && Math.abs(DESIGN.len - S.strut) <= 0.05 ? designPlateGeo(mp)
      : new THREE.ExtrudeGeometry(plateShapes(mp), { depth: STRUT_T, bevelEnabled: false, curveSegments: 1 });
    const uv = geo.attributes.uv.array;               // mm -> the wood textures' scale (plywood plates, Part 40)
    for (let i = 0; i < uv.length; i += 2) { uv[i] /= GRAIN_MM[0]; uv[i + 1] /= GRAIN_MM[1]; }
    if (!geo.userData.paint) {                       // a plain plate: paint on the front and the edges (not the back)
      const nz = geo.attributes.normal.array, paint = new Uint8Array(nz.length / 3);
      for (let i = 0; i < paint.length; i++) paint[i] = nz[3 * i + 2] > -0.5 ? 1 : 0;
      geo.userData.paint = paint;
    }
    geo.applyMatrix4(new THREE.Matrix4().set(...LR4Model.plateFrame(cfg, key, S), 0, 0, 0, 1));
    return geo;
  }
  function plateMeshes() {
    return [["StrutPlate_Front", platePolys.front], ["StrutPlate_Bottom", platePolys.bottom]]
      .map(([key, mp]) => ({ rec: cfg.parts.find((q) => q.key === key), geo: plateGeo(key, mp) }));
  }
  // ---- the front plate design (Part 41: plate_design.js; its row, upload and checks in job.js). DESIGN.ok -> its
  // toolpaths (plate frame) carved into the front plate: outside the design's box the plain extrusion; inside it the
  // outline's walls and back (cut-throughs left open, no front face) and a height field from the stock simulator for
  // the face. Always simulated from the design (user 2026-10-25), cached by design + size + detail. ----
  const DESIGN = { rec: null, D: null, tp: null, opts: null, problems: [], ok: false, key: "", len: null, cache: null };
  function designPlateGeo(mp) {
    const ck = `${DESIGN.key}|${S.strut}|${lite}`;
    if (!DESIGN.cache || DESIGN.cache.key !== ck) DESIGN.cache = { key: ck, arrays: designPlateArrays(mp) };
    const geo = new THREE.BufferGeometry(), a = DESIGN.cache.arrays;
    geo.setAttribute("position", new THREE.Float32BufferAttribute(a.pos.slice(), 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(a.nor.slice(), 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv.slice(), 2));
    geo.userData.paint = a.paint;
    return geo;
  }
  function designPlateArrays(mp) {
    const tp = DESIGN.tp, ops = [...(tp.engrave ? [[tp.engrave, "v"]] : []), ...(tp.t3 || []).map((op) => [op, "d"]), ...tp.t1.map((op) => [op, "f"])];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [op] of ops) for (const m of op.moves) if (m.g && m.x !== undefined) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); }
    const pad = Math.max(DESIGN.opts.vbitD, StrutCam.DEFAULTS.bit) / 2 + 1;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const T = STRUT_T, R = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
    const through = DESIGN.D.through.flatMap((s) => s.rings.filter((q) => s.rings.filter((o) => o !== q && PlateDesign.inRings(q[0], [o])).length % 2 === 0))
      .map((q) => [[...q, q[0]]]);
    const outside = polygonClipping.difference(mp, R), inside = polygonClipping.difference(polygonClipping.intersection(mp, R), ...through);
    // both pieces lose their walls along the box's edges (inside the solid, but their top edges showed through the
    // face as a thin line round the design); the inside piece its front too (the height field is that)
    const onBox = (p, t) => [[0, x0], [0, x1], [1, y0], [1, y1]].some(([a, v]) => [0, 1, 2].every((q) => Math.abs(p[9 * t + 3 * q + a] - v) < 1e-4));
    const isFront = (p, t) => [0, 1, 2].every((q) => Math.abs(p[9 * t + 3 * q + 2] - T) < 1e-4);
    // paintable (painted plates): the front and the plate's own walls (outline, notches, bolt holes); not the back, not
    // the design's cut-through walls
    const tSegs = through.flatMap((poly) => poly[0].slice(0, -1).map((q, i) => [q, poly[0][i + 1]]));
    const nearThrough = (x, y) => tSegs.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
      return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) < 0.01; });
    const trimmed = (mp, front) => {
      const g = new THREE.ExtrudeGeometry(plateShapes(mp), { depth: T, bevelEnabled: false, curveSegments: 1 }), p = g.attributes.position.array, keep = [];   // non-indexed already
      for (let t = 0; t < p.length / 9; t++) if (!onBox(p, t) && !(front && isFront(p, t))) keep.push(t);
      const out = pickTris(g, keep), q = out.attributes.position.array, nz = out.attributes.normal.array, paint = new Uint8Array(q.length / 3);
      for (let t = 0; t < q.length / 9; t++) {
        const n = nz[9 * t + 2], cx = (q[9 * t] + q[9 * t + 3] + q[9 * t + 6]) / 3, cy = (q[9 * t + 1] + q[9 * t + 4] + q[9 * t + 7]) / 3;
        const v = n > 0.5 ? 1 : n < -0.5 ? 0 : nearThrough(cx, cy) ? 0 : 1;
        paint[3 * t] = paint[3 * t + 1] = paint[3 * t + 2] = v;
      }
      out.userData.paint = paint;
      return out;
    };
    const parts = [];
    if (outside.length) parts.push(trimmed(outside, false));
    if (inside.length) parts.push(trimmed(inside, true));
    // the face: carved by the design's moves, z 0 = the face (T in the extrusion)
    const sim = new StockSimulator({ xmin: x0, xmax: x1, ymin: y0, ymax: y1, zmin: -T - 1, zmax: 0 }, new Map(), { maxCells: lite ? 1.5e5 : 6e5, snapshots: false });
    const tools = { v: compileStockTool({ shape: "vbit", diameter: DESIGN.opts.vbitD, angle: DESIGN.opts.angle }), f: compileStockTool({ shape: "flat", diameter: StrutCam.DEFAULTS.bit }),
      d: compileStockTool({ shape: "flat", diameter: tp.detail ? tp.detail.d : StrutCam.DEFAULTS.bit }) };
    for (const [op, k] of ops) for (const q of PlateDesign.pieces(op.moves)) sim.sweep(...q, tools[k]);
    const { nx, ny, vx, dx, dy, heights } = sim, pos = new Float32Array(vx * (ny + 1) * 3), uvs = new Float32Array(vx * (ny + 1) * 2), idx = [];
    for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
      pos[3 * k] = x0 + i * dx; pos[3 * k + 1] = y0 + j * dy; pos[3 * k + 2] = Math.max(-T, Math.min(0, heights[k])) + T;
      uvs[2 * k] = pos[3 * k]; uvs[2 * k + 1] = pos[3 * k + 1];
    }
    const segs = inside.flatMap((poly) => poly.flatMap((r) => r.slice(0, -1).map((p, i) => [p, r[i + 1]])));
    for (let j = 0; j < ny; j++) {                    // the cells whose middle is on the plate (not cut through): per row
      const y = y0 + (j + 0.5) * dy, xs = [];
      for (const [a, b] of segs) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      xs.sort((a, b) => a - b);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n] - x0) / dx - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[n + 1] - x0) / dx - 0.5));
        for (let i = i0; i <= i1; i++) { const a = j * vx + i; idx.push(a, a + 1, a + vx + 1, a, a + vx + 1, a + vx); }
      }
    }
    const face = new THREE.BufferGeometry();
    face.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    face.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    face.setIndex(idx);
    face.computeVertexNormals();
    const fni = face.toNonIndexed(), fz = fni.attributes.position.array, fpaint = new Uint8Array(fz.length / 3);
    for (let i = 0; i < fpaint.length; i++) fpaint[i] = fz[3 * i + 2] > T - 0.02 ? 1 : 0;   // the uncut face
    fni.userData.paint = fpaint;
    parts.push(fni);
    const cat = (name, n) => { const out = new Float32Array(parts.reduce((s, g) => s + g.attributes[name].array.length, 0)); let o = 0;
      for (const g of parts) { out.set(g.attributes[name].array, o); o += g.attributes[name].array.length; } return out; };
    const paint = new Uint8Array(parts.reduce((s, g) => s + g.userData.paint.length, 0));
    let po = 0;
    for (const g of parts) { paint.set(g.userData.paint, po); po += g.userData.paint.length; }
    const arrays = { pos: cat("position"), nor: cat("normal"), uv: cat("uv"), paint };
    for (const g of parts) g.dispose();
    face.dispose();
    return arrays;
  }
  function pickTris(g, keep) {                       // a non-indexed geometry's triangles `keep`
    const out = new THREE.BufferGeometry();
    for (const [name, n] of [["position", 3], ["normal", 3], ["uv", 2]]) {
      const src = g.attributes[name].array, dst = new Float32Array(keep.length * 3 * n);
      keep.forEach((t, i) => dst.set(src.subarray(t * 3 * n, (t + 1) * 3 * n), i * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    g.dispose();
    return out;
  }
  // the X belt's band across the front plate in the plate's frame ([y0, y1], the runs in front of it), or null
  function beltBand() {
    const inv = new THREE.Matrix4().set(...LR4Model.plateFrame(cfg, "StrutPlate_Front", S), 0, 0, 0, 1).invert(), v = new THREE.Vector3();
    let y0 = Infinity, y1 = -Infinity;
    for (const m of meshes) if (/^Belt_X_(Min|Max)$/.test(m.userData.name)) {
      m.updateMatrixWorld();
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        if (v.x > 0 && v.x < S.strut && v.z > STRUT_T - 1 && v.z < STRUT_T + 40) { y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      }
    }
    return y1 > y0 ? [+y0.toFixed(2), +y1.toFixed(2)] : null;
  }
  function refreshFrontPlate() {                     // the design changed: the front plate's geometry again, nothing else
    const m = meshes.find((q) => q.userData.name === "StrutPlate_Front");
    if (!m || !platePolys) return;
    m.geometry.dispose();
    m.geometry = plateGeo("StrutPlate_Front", platePolys.front);
    if (typeof applyColours === "function") applyColours(true);   // its vertex colors (paint) again
  }
  // ---- basic table legs - drawn here only (not in the FreeCAD model, cut list or BOM): doubled-2x4 legs inside a 2x4
  // apron round the MDF's edge, at most LEG_GAP apart; the MDF's top tableTop above the floor (View > Table height,
  // kept in this browser; default 34 in) ----
  const LEG = 3.5 * IN, APRON_T = 1.5 * IN, APRON_H = 3.5 * IN, LEG_GAP = 1800, TOP_DEFAULT = 34 * IN;
  let tableTop = TOP_DEFAULT;
  try { tableTop = +MS.get("lr4-table-top") || TOP_DEFAULT; } catch (e) { /* default */ }
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
    // whole periods: tiles in u; each wave's term per column (x only), added in the same order as per pixel
    const wcol = waves.map(([f, ph, a]) => Float64Array.from({ length: W }, (_, x) => a * Math.sin(x / W * Math.PI * 2 * f + ph)));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = y;
      for (const w of wcol) v += w[x];
      for (const [kx, ky, r] of knots) { const dx = (x - kx) / 2.5, dy = y - ky, q = Math.hypot(dx, dy); v += r * 2.2 * Math.exp(-(q * q) / (r * r * 2)); }
      const ring = 0.5 + 0.5 * Math.sin(v * rings * Math.PI * 2 / (H * rings / Math.round(H * rings)) );
      const fine = (rnd() - 0.5) * 0.05;
      const k = Math.min(1, 1.06 - depth * Math.pow(ring, 3) + fine), i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return (woodTexs[kind] = tex);
  }
  // ---- the table (Part 33, table_model.js): spoilboard + rail strips (z 0..T, the work surface) on the base (U.base:
  // the MDF sheet, or the torsion box's ribs drawn as one mesh, slots left out) ----
  const TABLE_PART = /^(TableBase|TableRibs|TableSkin_(Top|Bottom)|Spoilboard|RailStrip_(Min|Max)|RailEdge_(Min|Max))$/;
  function tableMeshes() {
    const list = LR4Table.parts(U.base, S.TW, S.TL, S.xtable, S.ytable, S.cutX, S.cutY), ribs = list.filter((p) => p.role === "rib");
    const ud = (name, label, color) => ({ name, label, group: "Table", motion: "table", source: "made", color, ownGeo: true });
    const LABEL = { Spoilboard: "Spoilboard (3/4 in MDF, the bit's full travel + 1/4 in a side)", RailStrip_Min: "Rail strip, Min (3/4 in MDF)",
      RailStrip_Max: "Rail strip, Max (3/4 in MDF)", TableBase: "Table sheet (3/4 in MDF)",
      RailEdge_Min: "Rail side board, Min (5/8 in plywood: the box's outer rib, full length under the strip)",
      RailEdge_Max: "Rail side board, Max (5/8 in plywood: the box's outer rib, full length under the strip)",
      TableSkin_Top: "Torsion box skin, top (1/4 in plywood or hardboard, GUESS; between the rail side boards)",
      TableSkin_Bottom: "Torsion box skin, bottom (1/4 in plywood or hardboard, GUESS; between the rail side boards)" };
    const out = list.filter((p) => p.role !== "rib").map((p) => [boxesGeo([p.box]),
      Object.assign(ud(p.name, LABEL[p.name], p.role === "spoil" ? [0.72, 0.60, 0.45] : p.role === "edge" ? [0.86, 0.68, 0.44] : [0.78, 0.66, 0.50]),
        p.role === "edge" ? { grain: "ply" } : {})]);
    if (ribs.length) out.push([boxesGeo(ribs.map((p) => p.box)), Object.assign(ud("TableRibs",
      `Torsion box ribs (${ribs.length}, 5/8 in plywood, half-lapped egg-crate)`, [0.86, 0.68, 0.44]), { grain: "ply" })]);
    return out;
  }
  function tableBox(base) {                           // the whole table (base: the sheet / box only), world mm; null before drawn
    const ts = meshes.filter((m) => (base ? /^(TableBase|TableRibs|TableSkin_(Top|Bottom))$/ : TABLE_PART).test(m.userData.name));
    if (!ts.length) return null;
    const bb = new THREE.Box3();
    for (const m of ts) bb.union(new THREE.Box3().setFromObject(m));
    return bb;
  }
  // under the base (the torsion box is shorter than the strips). The torsion box is its own apron: the legs go right
  // under it, flush with its sides, no 2x4 apron (user 2026-10-23: "a table on a table" otherwise)
  let LEG_BOXES = [], APRON_BOXES = [];               // legMeshes' legs / aprons [x0, y0, z0, x1, y1, z1] (the hub dodges them; the hose rope)
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
    LEG_BOXES = legs;
    const aprons = APRON_BOXES = [[lo[0], lo[1], under - APRON_H, hi[0], lo[1] + APRON_T, under],
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
    hoseMesh = cordMesh = sleeveMesh = hoseWire = tieMesh = reliefMesh = wireMesh = null;
    if (typeof PWR_MESH !== "undefined") PWR_MESH = null;
  }
  // a label "Short name::a longer note" (user 2026-11-05: "why are there long descriptions like this?"): the short name
  // in the lists, the hover and the BOM's views; the note on the selection card (hose_bom.js select)
  function labelNote(ud) { const i = String(ud.label || "").indexOf("::"); if (i >= 0) { ud.note = ud.label.slice(i + 2); ud.label = ud.label.slice(0, i); } return ud; }
  function addMesh(geo, mat, ud) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    m.userData = labelNote(ud);
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
      tex.colorSpace = THREE.SRGBColorSpace;
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
    const out = PENDANT.parts.map(([part, label, role]) => [pendant.geos[part], printedMaterial(PRINT_ROLE[role], null),   // print Z unknown: no lines
      ud("Pendant_" + part, label, { role, color: PRINT_ROLE[role] })]);
    // the spacer: the stand's length, from the apron's bottom (or the stand's base) to the stand's top
    const sx = base.t[0], sz = base.t[2];
    if (mount) out.push([boxesGeo([mount.block]), material([0.86, 0.68, 0.44], null, false, "ply"), { name: "Pendant_mount",
      label: "Pendant mount block::5/8 in plywood, glued + screwed under the Max rail strip's front end", group: "Pendant",
      motion: "table", source: "made", color: [0.86, 0.68, 0.44], ownGeo: true, grain: "ply" }]);
    const fy = mount ? mount.front : bb.min.y, sp = mount ? mount.sp : PENDANT.spacer, sBot = mount ? sz + stand[2] : Math.max(sz + stand[2], bottom);
    out.push([boxesGeo([[sx + stand[0], fy - sp, sBot, sx + stand[3], fy, sz + stand[5]]]),
      material([0.86, 0.68, 0.44], null, false, "ply"), { name: "Pendant_spacer", label: `Pendant spacer block (${mount ? "2 x " : ""}5/8 in plywood)`, group: "Pendant",
        motion: "table", source: "made", color: [0.84, 0.70, 0.50], ownGeo: true }]);
    pendantScreen(true);
    out.push([pendant.screen.geo, new THREE.MeshBasicMaterial({ map: pendant.screen.tex, toneMapped: false }),
      ud("Pendant_screen", "Pendant screen (FluidTouch)", { color: [0, 0, 0] })]);
    return out;
  }
  // the pendant's screen: FluidTouch's own frames once it runs; dark until then, as the real panel is before it boots
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
    if (!force && pendant.screen.key === "off") return;
    pendant.screen.key = "off";
    const { canvas, tex } = pendant.screen, g = canvas.getContext("2d");
    g.fillStyle = "#050607"; g.fillRect(0, 0, canvas.width, canvas.height);
    tex.needsUpdate = true;
  }
  // ---- the switch panel (Part 44f): one box on the table's front face, at the other end from the pendant - the
  // e-stop (V1E store's "Emergency Stop Button": a red mushroom on an XB2-style 22 mm bezel, twist to release; it
  // cuts the mains), a green power lamp, a 20 A lighted toggle for the router and one for the vac (both dead with the
  // e-stop; user 2026-11-02: Leviton 1221-PLR = red handle lit while ON - the 1221-LHR is lit while OFF) under a 2-gang
  // toggle plate. Sizes are GUESSes (no measured button): head 40 mm, bezel 30 mm, travel 6 mm; box 250 x 124 so the
  // plate fits. Its face is a canvas (the yellow EMERGENCY STOP disc, labels). power.js presses / lights it; parts at
  // their base.t, the panel facing -Y.
  const SWP = { w: 250, h: 124, d: 60, estop: -85, lamp: -22, router: 37, vac: 83, plate: [60, 116, 114], travel: 6, inset: 60 };
  // with the table hub (user 2026-11-03: "the estop [paddle switch] goes in an outlet box ... put the estop and switches
  // below the table and have a panel kind of like the side panel"): a 5/8" plywood panel hanging under the front apron
  // near the hub's end, its face 15 mm in from the table's front; behind it a 1-gang box (the paddle switch covers it)
  // and a 3-gang box under a combination plate (a blank drilled 22 mm for the lamp, then the ROUTER and VAC toggles).
  // x: off SWP.cxL; panel = its extent; H / T / encl: its height, thickness, the boxes' depth. GUESS sizes.
  const SWP_E = { estop: -85, lamp: -22, router: 37, vac: 83, plate: [60, 116, 114], panel: null };
  const SWP_H = { estop: -110, lamp: -16, router: 30, vac: 76, plate: [30, 145, 114], panel: [-175, 130], H: 190, T: 16, encl: 76, set: 15 };   // H: the hub panel's (a flush corner)
  function swpHubFrame(bb) {                           // the hub panel's frame (world): y0 = its face, bk = its back, cz = its middle
    bb = bb || tableBox(true);
    if (!bb || SWP.cxL === undefined) return null;
    const uz = bb.min.z - (U.base === "torsion" ? 0 : APRON_H), y0 = bb.min.y + SWP_H.set;
    return { cx: SWP.cxL, y0, bk: y0 + SWP_H.T, uz, cz: uz - SWP_H.H / 2 };
  }
  function switchPanelMeshes() {                      // [geometry, material, userData]: local geometry, world base.t
    const bb = tableBox(true);
    if (!bb) return [];
    const hubOn = typeof optsOn === "function" && optsOn().hub;
    Object.assign(SWP, hubOn ? SWP_H : SWP_E);
    let cx = bb.max.x - SWP.inset - SWP.w / 2, fy = bb.min.y, top = bb.min.z - 5, mount = null;
    const bx = (n) => { const m = meshes.find((q) => q.userData.name === n); return m && new THREE.Box3().setFromObject(m); };
    const st = bx("RailStrip_Min"), ed = bx("RailEdge_Min");
    if (U.base === "torsion" && st && ed) {           // the pendant's way, mirrored: under the Min rail strip's front end
      fy = st.min.y; top = st.min.z - 5; cx = st.min.x + SWP.w / 2;
      mount = [st.min.x, fy, ed.min.z, st.max.x, fy + 60, st.min.z];
    }
    // Part 52: with the table hub on, the sheet table's panel moves to the left end too (by the pendant's spot), near the
    // hub's outlets - a short panel <-> hub cable (user 2026-11-02). The torsion table's is there already.
    // the hub's under-table panel (SWP_H): lined up against the front-left leg's right side (user 2026-11-03), 3 mm off
    const fl = LEG_BOXES.filter((l) => l[1] < bb.min.y + 150).sort((p, q) => p[0] - q[0])[0];
    SWP.cxR = cx; SWP.cxL = (fl ? fl[3] + 3 : bb.min.x + 65) - SWP_H.panel[0];
    const HF = swpHubFrame(bb);
    if (hubOn) mount = null;                          // (under the table instead)
    cx = SWP.cx = hubOn ? SWP.cxL : SWP.cxR;
    const cz = hubOn ? HF.cz : top - SWP.h / 2, y0 = hubOn ? HF.y0 : fy - SWP.d, at = (dx, dy = 0) => ({ t: [cx + dx, y0 + dy, cz], s: [1, 1, 1] });
    const ud = (name, label, base, extra) => Object.assign({ name, label, group: "Electronics", motion: "table", source: "hardware",
      ownGeo: true, base }, extra);
    const flat = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color().setRGB(...c).convertSRGBToLinear(),
      roughness: 0.55, metalness: 0, side: THREE.DoubleSide }, extra));
    // turned shapes about Y, [r, h] points: h out of the face (-Y) from it
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 32).scale(1, -1, 1);
    const cyl = (r, d, y) => new THREE.CylinderGeometry(r, r, d, 32).translate(0, -y - d / 2, 0);
    const ring = (r0, r1, d) => lathe([[r0, 0], [r1, 0], [r1, d - 1], [r1 - 1, d], [r0, d], [r0, 0]]);
    const out = [];
    if (hubOn) {                                       // the plywood panel + the two boxes behind it
      const [p0, p1] = SWP.panel, H = SWP.H, T = SWP.T, D = SWP.encl, nw = [0.13, 0.32, 0.72];
      out.push([new THREE.BoxGeometry(p1 - p0, T, H).translate((p0 + p1) / 2, T / 2, 0), material([0.86, 0.68, 0.44], null, false, "ply"),
        ud("SwitchPanel_Box", `Switch panel (5/8 in plywood, ${p1 - p0} x ${H} mm, under the front apron by the hub's end: the paddle switch, power lamp, router + vac toggles; GUESS)`,
          at(0), { color: [0.86, 0.68, 0.44], grain: "ply", source: "made", group: "Table" })]);
      out.push([boxesGeo([[SWP.estop - 30, T, -49, SWP.estop + 30, T + D, 49], [SWP.plate[0] - 75, T, -49, SWP.plate[0] + 75, T + D, 49]]), flat(nw, { roughness: 0.45 }),
        ud("SwitchPanel_Boxes", "Switch boxes behind the panel (blue PVC new-work: a 1-gang for the paddle switch, a 3-gang for the lamp + toggles; GUESS)", at(0), { color: nw })]);
    } else {
      out.push([new THREE.BoxGeometry(SWP.w, SWP.d, SWP.h).translate(0, SWP.d / 2, 0), flat([0.13, 0.13, 0.14]),
        ud("SwitchPanel_Box", "Switch panel box (e-stop, power lamp, router + vac toggles; GUESS: 250 x 124 x 60 mm)", at(0), { color: [0.13, 0.13, 0.14] })]);
      out.push([new THREE.PlaneGeometry(SWP.w, SWP.h).rotateX(Math.PI / 2).translate(0, -0.3, 0), flat([1, 1, 1], { map: switchFace(), roughness: 0.7 }),
        ud("SwitchPanel_Face", "Switch panel face (EMERGENCY STOP disc, labels)", at(0), { color: [0.13, 0.13, 0.14] })]);
    }
    // the e-stop: bezel, the stem (shows between the bezel and the head while it's out), the red mushroom head
    out.push([ring(11, 15, 10), flat([0.05, 0.05, 0.05], { roughness: 0.4 }),
      ud("SwitchPanel_EStopBezel", "E-stop bezel (22 mm XB2-style, knurled)", at(SWP.estop), { color: [0.05, 0.05, 0.05] })]);
    out.push([cyl(9, 18, 0), flat([0.55, 0.55, 0.57], { metalness: 0.4, roughness: 0.4 }),
      ud("SwitchPanel_EStopStem", "E-stop plunger", at(SWP.estop), { color: [0.55, 0.55, 0.57] })]);
    out.push([lathe([[0, 0], [9, 0], [19, 1], [20, 3], [20, 8], [18, 11], [13, 13.5], [6, 14.6], [0, 14.9]]).translate(0, -10 - SWP.travel, 0),
      flat([0.78, 0.05, 0.04], { roughness: 0.35 }),
      ud("SwitchPanel_EStop", "Emergency stop (click: press = mains off; click again: twist to release)", at(SWP.estop), { color: [0.78, 0.05, 0.04], click: "estop" })]);
    // with the table hub on (Part 52, user 2026-11-02): a magnetic paddle switch in its place (a POWERTEC 71007-style
    // START / STOP: slap the red paddle = all power off, and it stays off - after a stop or a power cut - until START is
    // pressed). Must be rated for the circuit (20 A at 120 V; check its label). panel.js shows it / hides the e-stop.
    // How it works: two momentary buttons on its body - START (green, up top, seen through the paddle's window) and
    // STOP (red, low, behind the paddle). The paddle hangs from a hinge at the top and springs back; a push anywhere on
    // it presses STOP. START energizes a coil that holds the contacts closed; STOP (or a power cut) drops it.
    // power.js nudges them on a click (paddleNudge). The paddle's parts sit at the hinge (base), the rest at the face.
    // sizes from POWERTEC's 71007 drawing (user 2026-11-03): the paddle 81.7 wide x 121.05 tall, narrowing to the hinge
    // at its top; its front 35.9 proud of the mounting face; a base flange on 2 x 4.5 mm holes 83.2 apart (here ~50 x 92);
    // the body behind 41 x 74 (the panel's cut-out), 44.6 deep (80.5 overall) into the 1-gang box; START (37 x 22) in
    // a window near the top, STOP lower down. Local: y = 0 the panel's face (-y out), z = 0 the panel's middle.
    const red = [0.78, 0.06, 0.05], pud = (n, label, color, extra, base) => ud(n, label, base || at(SWP.estop), Object.assign({ color }, extra));
    const PD = { w: 81.7, top: 50, bot: -71.05, waist: 22, tw: 62, front: -35.9, t: 4, skirt: 14, win: [-25, 25, -11, 22], hz: 37 };
    const hinge = () => { const b = at(SWP.estop, PD.front + 3); b.t[2] += PD.hz; return b; };   // the hinge: its screw's line
    const toH = (g) => g.translate(0, -(PD.front + 3), -PD.hz);   // panel-local -> the hinge's frame
    const outline = () => {                            // the paddle's outline (x, z)
      const s = new THREE.Shape(), h = PD.w / 2;
      s.moveTo(-h, PD.bot + 6); s.quadraticCurveTo(-h, PD.bot, -h + 6, PD.bot); s.lineTo(h - 6, PD.bot); s.quadraticCurveTo(h, PD.bot, h, PD.bot + 6);
      s.lineTo(h, PD.waist); s.lineTo(PD.tw / 2, PD.top - 4); s.quadraticCurveTo(PD.tw / 2, PD.top, PD.tw / 2 - 4, PD.top);
      s.lineTo(-PD.tw / 2 + 4, PD.top); s.quadraticCurveTo(-PD.tw / 2, PD.top, -PD.tw / 2, PD.top - 4); s.lineTo(-h, PD.waist);
      return s;
    };
    const rect = (x0, x1, z0, z1) => { const p = new THREE.Path(); p.moveTo(x0, z0); p.lineTo(x0, z1); p.lineTo(x1, z1); p.lineTo(x1, z0); return p; };
    const ext = (shape, d, y) => new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2).translate(0, y, 0);   // shape (x, z), depth out to -y from y
    // the housing: flange + the raised body under the paddle + the body behind the panel (in its box)
    out.push([boxesGeo([[-25, -9, -46, 25, 0, 46], [-23, -24, -40, 23, -9, 40], [-20.5, 0, -37, 20.5, 44.6, 37]]), flat([0.07, 0.07, 0.08], { roughness: 0.5 }),
      pud("SwitchPanel_PaddleBox", "Paddle switch (POWERTEC 71007-style magnetic START / STOP, no restart after a power cut; 81.7 x 121 paddle, 41 x 74 x 44.6 body behind on a 1-gang box - check its 120 V rating >= 20 A)", [0.07, 0.07, 0.08])]);
    out.push([boxesGeo([[-24, -26, -12, 24, -24, 23]]), flat([0.03, 0.03, 0.035], { roughness: 0.45 }),
      pud("SwitchPanel_PaddleFrame", "Button frame (behind the paddle's window)", [0.03, 0.03, 0.035])]);
    out.push([new THREE.CylinderGeometry(2.8, 2.8, 2, 12).translate(0, PD.front - 1, PD.hz), flat([0.7, 0.7, 0.72], { metalness: 0.7, roughness: 0.3 }),
      pud("SwitchPanel_PaddleScrew", "Paddle hinge screw", [0.7, 0.7, 0.72])]);
    out.push([new THREE.BoxGeometry(37, 6, 22).translate(0, -29, 6), flat([0.1, 0.62, 0.22], { roughness: 0.35 }),
      pud("SwitchPanel_PaddleStart", "START button (green, momentary: click = power on, held on by the switch's coil)", [0.1, 0.62, 0.22], { click: "start" })]);
    out.push([new THREE.PlaneGeometry(37, 22).rotateX(Math.PI / 2).translate(0, -32.1, 6), flat([1, 1, 1], { map: buttonFace("START", "#17a03a", 37, 22), roughness: 0.35 }),
      pud("SwitchPanel_PaddleStartFace", "START button", [0.1, 0.62, 0.22], { click: "start" })]);
    out.push([new THREE.BoxGeometry(36, 6, 20).translate(0, -27, -30), flat(red, { roughness: 0.35 }),
      pud("SwitchPanel_PaddleStopBtn", "STOP button (behind the paddle, under START: the paddle presses it)", red)]);
    // the paddle: a shell - its front with START's window, a skirt round its edge back toward the housing
    const front = outline(); front.holes.push(rect(...PD.win));
    const skirt = outline(); { const h = PD.w / 2 - 2.2; skirt.holes.push(Object.assign(new THREE.Path(), {}));
      const p = skirt.holes[0]; p.moveTo(-h, PD.bot + 2.2); p.lineTo(h, PD.bot + 2.2); p.lineTo(h, PD.waist); p.lineTo(PD.tw / 2 - 2.2, PD.top - 2.2);
      p.lineTo(-PD.tw / 2 + 2.2, PD.top - 2.2); p.lineTo(-h, PD.waist); }
    const mergeNI = (gs) => {                         // non-indexed geometries (extrusions) -> one
      const pos = [], nor = [];
      for (const g of gs) { pos.push(...g.getAttribute("position").array); nor.push(...g.getAttribute("normal").array); g.dispose(); }
      const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      return m;
    };
    out.push([toH(mergeNI([ext(front, PD.t, PD.front + PD.t), ext(skirt, PD.skirt, PD.front + PD.t + PD.skirt)])),
      flat(red, { roughness: 0.35 }), pud("SwitchPanel_Paddle", "STOP paddle (hinged at the top, springs back: a push presses the STOP button behind it - all power off)", red, { click: "stop" }, hinge())]);
    out.push([toH(new THREE.PlaneGeometry(74, 54).rotateX(Math.PI / 2).translate(0, PD.front - 0.15, (PD.bot + PD.win[2]) / 2)), flat([1, 1, 1], { map: stopFace(), roughness: 0.35 }),
      pud("SwitchPanel_PaddleFace", "STOP paddle", red, { click: "stop" }, hinge())]);
    // the power lamp: a 22 mm pilot light, lit while the mains are on
    const lz = hubOn ? -2 : 0;                        // (with the hub: on the plate's blank gang)
    out.push([ring(9, 14, 6), flat([0.05, 0.05, 0.05], { roughness: 0.4 }),
      ud("SwitchPanel_LampBezel", "Power lamp bezel", at(SWP.lamp, lz), { color: [0.05, 0.05, 0.05] })]);
    out.push([lathe([[0, 0], [9, 0], [9, 5], [7, 7.5], [4, 8.6], [0, 9]]), flat([0.1, 0.25, 0.12], { roughness: 0.25, emissive: 0x000000 }),
      ud("SwitchPanel_Lamp", "Power lamp (22 mm 120 V LED pilot light, green: lit = power on)", at(SWP.lamp, lz), { color: [0.1, 0.25, 0.12], lens: [0.35, 1, 0.45] })]);
    // the toggles: a 2-gang toggle plate (stainless, labelled) and a red lighted handle each on its pivot (up = on)
    const [pc, pw, ph] = SWP.plate;
    out.push([new THREE.BoxGeometry(pw, 2, ph).translate(0, -1, 0), flat([0.72, 0.74, 0.76], { metalness: 0.6, roughness: 0.35 }),
      ud("SwitchPanel_Plate", hubOn ? "Combination plate (3-gang stainless: a blank drilled 22 mm for the lamp, 2 toggles)" : "Toggle plate (2-gang, stainless)", at(pc), { color: [0.72, 0.74, 0.76] })]);
    out.push([new THREE.PlaneGeometry(pw, ph).rotateX(Math.PI / 2).translate(0, -2.1, 0),
      new THREE.MeshStandardMaterial({ map: togglePlateFace(), metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide }),
      ud("SwitchPanel_PlateFace", "Toggle plate face (ROUTER / VAC, ON / OFF)", at(pc), { color: [0.72, 0.74, 0.76] })]);
    for (const [k, label] of [["router", "Router"], ["vac", "Vac"]]) {
      const K = k[0].toUpperCase() + k.slice(1);
      out.push([new THREE.BoxGeometry(11, 3, 25).translate(0, -3.5, 0), flat([0.05, 0.05, 0.05], { roughness: 0.4 }),
        ud(`SwitchPanel_${K}Bezel`, `${label} toggle body (the switch's face behind the plate)`, at(SWP[k]), { color: [0.05, 0.05, 0.05] })]);
      out.push([toggleLever(), flat([0.3, 0.04, 0.03], { roughness: 0.3, emissive: 0x000000 }),
        ud(`SwitchPanel_${K}`, `${label} switch (20 A toggle, red handle lit while on - e.g. Leviton 1221-PLR; click: on / off)`, at(SWP[k], -2), { color: [0.3, 0.04, 0.03],
          lens: [1, 0.2, 0.12], click: k })]);
    }
    if (mount) out.push([boxesGeo([mount]), material([0.86, 0.68, 0.44], null, false, "ply"), { name: "SwitchPanel_Mount",
      label: "Switch panel mount block::5/8 in plywood, under the Min rail strip's front end", group: "Electronics", motion: "table",
      source: "made", color: [0.86, 0.68, 0.44], ownGeo: true, grain: "ply" }]);
    return out;
  }
  // the hub's mains cables (user 2026-11-03: "12-2 or 12-3 as appropriate ... run cleanly with staples"): NM-B 12 AWG
  // (yellow sheath), flat against the wood, stapled (NEC 334.30: within 12 in of a box, then every 4-1/2 ft - here every
  // 300 mm); into each box through a cable clamp / knockout. Circuit (power.js): the inlet's line goes to the paddle
  // switch and comes back switched; the toggles feed the router / vac halves of the duplex (tab broken).
  //   inlet box -> the paddle switch's box, 12-3: black = line to the paddle, red = switched line back, white = neutral, bare = ground
  //   the toggles' box -> outlet box, 12-3: black = router toggle's leg, red = vac toggle's leg, white = neutral, bare = ground
  //   inlet box -> accessory box, 12-2: black = switched line, white = neutral, bare = ground
  //   the paddle's box -> the toggles' box (side by side under the front), 12-2: switched line, neutral, ground
  // Route (user 2026-11-03: "now that these panels are connected, the wires ... can stay on the panel"): up out of the
  // hub box's top into the band above the boxes, flat against the side panel's back, along it to the corner, round onto
  // the front panel's back, along it, then back over the switch box and down into its top. The paddle's cable lower, the
  // toggles' above it (no crossing). The hub jumper: out of the boxes' bottoms, along the side panel's back. GUESS route.
  function hubCables(tb, fx, T, zm, ys, flat) {
    HUB.cables = null;
    const HF = swpHubFrame(tb);
    if (!HF) return [];
    HUB.cables = { len: {}, pts: {}, staples: 0, hf: HF };   // (the BOM's rows, the Wiring layer's hub -> panel line)
    const b = 3.2, w = 6.5;                            // NM 12-3 ~ 13 x 6.4 mm (12-2 ~ 11 x 5.8)
    const bx = fx + T + HUB.encl / 2, top = zm + 49, bot = zm - 49;
    const cx = HF.cx, sTop = HF.cz + 49;               // the switch boxes' tops
    const xP = fx + T + b, yP = HF.bk + b, zTop = HF.uz;   // on the side panel's back, on the front panel's back; the panels' top
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // the wood's face under the cable (its normal, into the room): the side panel's back, the front panel's back
    const nAt = (p) => (p.z > zTop ? null : p.x < xP + 1 ? V(1, 0, 0) : p.y < yP + 1 && p.x < cx + SWP_H.panel[1] ? V(0, 1, 0) : null);
    const runs = [
      { n: "Paddle", w, u0: new THREE.Vector3(0, 1, 0), x: bx - 14, y: ys.I, tx: cx + SWP_H.estop + 8, zr: top + 12,
        note: "inlet box -> the paddle switch's box: 12-3 NM-B - black = line to the paddle, red = switched line back, white = neutral, bare = ground" },
      { n: "Toggles", w, u0: new THREE.Vector3(0, 1, 0), x: bx + 14, y: ys.O, tx: cx + SWP_H.plate[0] + 30, zr: top + 28,
        note: "the toggles' box -> outlet box: 12-3 NM-B - black = router leg, red = vac leg, white = neutral, bare = ground" }];
    const yE = HF.bk + 50;                             // into the switch box's top behind its devices
    const paths = runs.map((r) => Object.assign(r, { pts: [V(r.x, r.y, top - 12), V(r.x, r.y, r.zr), V(xP, r.y, r.zr), V(xP, yP, r.zr),
      V(r.tx, yP, r.zr), V(r.tx, yE, r.zr), V(r.tx, yE, sTop - 12)] }));
    // the switch boxes' jumper, side to side through their knockouts
    const xJ0 = cx + SWP_H.estop + 30, xJ1 = cx + SWP_H.plate[0] - 75, yJ = HF.bk + 48, zJ = HF.cz - 22;
    paths.push({ n: "Jumper", w: 5.6, u0: new THREE.Vector3(0, 0, 1), note: "the paddle's box -> the toggles' box: 12-2 NM-B - black = switched line, white = neutral, bare = ground",
      pts: [V(xJ0 - 12, yJ, zJ), V(xJ1 + 12, yJ, zJ)] });
    HUB.cables.jumper = { x0: xJ0 - 12, x1: xJ1 + 12, y: yJ, z: zJ };
    const xb = fx + T + b;                             // the jumper on the panel's back, under the boxes
    paths.push({ n: "Accessory", w: 5.6, u0: new THREE.Vector3(0, 1, 0), note: "inlet box -> accessory box: 12-2 NM-B - black = switched line, white = neutral, bare = ground",
      pts: [V(bx, ys.I, bot + 12), V(bx, ys.I, bot - 26), V(xb, ys.I, bot - 26), V(xb, ys.A, bot - 26), V(bx, ys.A, bot - 26), V(bx, ys.A, bot + 12)] });
    const out = [], yel = [0.93, 0.78, 0.12], steel = [0.75, 0.76, 0.78], staples = [], T0 = { t: [0, 0, 0], s: [1, 1, 1] };
    for (const r of paths) {
      // the corners rounded (r 25, less on a short leg), the straights sampled every <= 25 mm (no bulging between)
      const P = r.pts, cs = P.map((p, i) => {
        if (i === 0 || i === P.length - 1) return { s: p, e: p, c: p };
        const ra = Math.min(25, p.distanceTo(P[i - 1]) / 2, p.distanceTo(P[i + 1]) / 2);
        return { s: p.clone().lerp(P[i - 1], ra / p.distanceTo(P[i - 1])), e: p.clone().lerp(P[i + 1], ra / p.distanceTo(P[i + 1])), c: p };
      });
      const dense = [P[0]];
      for (let i = 1; i < P.length; i++) {
        const a = cs[i - 1].e, z = cs[i].s, m = Math.max(1, Math.ceil(a.distanceTo(z) / 25));
        for (let k = 1; k <= m; k++) dense.push(a.clone().lerp(z, k / m));
        if (i < P.length - 1) {
          const q = new THREE.QuadraticBezierCurve3(cs[i].s, cs[i].c, cs[i].e);
          for (let k = 1; k <= 6; k++) dense.push(q.getPoint(k / 6));
        }
      }
      const c = new THREE.CatmullRomCurve3(dense, false, "centripetal"), L = c.getLength(), N = Math.max(8, Math.ceil(L / 4));
      HUB.cables.len[r.n] = L + 300; HUB.cables.pts[r.n] = dense;   // + 150 mm in each box
      const pos = [], nor = [], idx = [], S = 12, h = r.w === w ? b : 2.9;
      // a flat oval section, its wide side (u) carried along (no twist in the air: it bends flat-wise), easing onto
      // each face it's stapled to (flat on the wood)
      const u = r.u0.clone();
      for (let i = 0; i <= N; i++) {
        const p = c.getPointAt(i / N), t = c.getTangentAt(i / N), nw = nAt(p);
        u.addScaledVector(t, -u.dot(t)).normalize();
        if (nw) {
          const k = new THREE.Vector3().crossVectors(t, nw).normalize();
          if (k.dot(u) < 0) k.negate();
          u.lerp(k, 0.25).addScaledVector(t, -u.dot(t)).normalize();
        }
        const n = new THREE.Vector3().crossVectors(u, t).normalize();
        for (let j = 0; j < S; j++) {
          const a = j / S * Math.PI * 2, cu = Math.cos(a), sn = Math.sin(a);
          pos.push(...p.clone().addScaledVector(u, cu * r.w).addScaledVector(n, sn * h).toArray());
          nor.push(...u.clone().multiplyScalar(cu * h).addScaledVector(n, sn * r.w).normalize().toArray());
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
        const a = i * S + j, q = i * S + (j + 1) % S;
        idx.push(a, q, a + S, q, q + S, a + S);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
      out.push([g, flat(yel, { roughness: 0.6 }), { name: `TableHub_Cable${r.n}`, label: `NM-B cable (${r.n === "Paddle" ? "paddle switch" : r.n === "Toggles" ? "toggles" : r.n.toLowerCase()})::${r.note} (~${(L / 1000 + 0.3).toFixed(1)} m with the ends in the boxes; stapled)`,
        group: "Electronics", motion: "table", source: "hardware", ownGeo: true, base: T0, color: yel }]);
      // staples where it lies straight on one face: the first >= 120 mm from an end, then every <= 300 mm
      const on = [];
      for (let s = 0; s <= L; s += 5) { const p = c.getPointAt(s / L), n = nAt(p); on.push({ s, p, n, t: c.getTangentAt(s / L) }); }
      let last = -1e9;
      for (let i = 4; i < on.length - 4; i++) {
        const q = on[i];
        if (!q.n || q.s < 120 || q.s > L - 120 || q.s - last < 300) continue;
        if (!on[i - 4].n || !on[i + 4].n || !on[i - 4].n.equals(q.n) || !on[i + 4].n.equals(q.n) || on[i - 4].t.dot(on[i + 4].t) < 0.995) continue;
        last = q.s; staples.push({ p: q.p, n: q.n, t: q.t, w: r.w, h });
      }
    }
    const pos = [], nor = [];
    for (const q of staples) {                         // an insulated cable staple: a crown over the cable, two legs into the wood
      const u = new THREE.Vector3().crossVectors(q.t, q.n).normalize(), M = new THREE.Matrix4().makeBasis(u, q.t, q.n);
      const base = q.p.clone().addScaledVector(q.n, -q.h);   // the wood's face
      for (const [x, z, sx, sz] of [[0, 2 * q.h + 0.7, 2 * q.w + 4, 1.4], [-(q.w + 1.3), q.h + 0.35, 1.4, 2 * q.h + 0.7], [q.w + 1.3, q.h + 0.35, 1.4, 2 * q.h + 0.7]]) {
        const g = new THREE.BoxGeometry(sx, 4, sz).translate(x, 0, z).applyMatrix4(M).translate(base.x, base.y, base.z).toNonIndexed();
        pos.push(...g.getAttribute("position").array); nor.push(...g.getAttribute("normal").array); g.dispose();
      }
    }
    HUB.cables.staples = staples.length;
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      out.push([g, flat(steel, { metalness: 0.7, roughness: 0.35 }), { name: "TableHub_CableStaples",
        label: `Cable staples::${staples.length}, for 12 AWG NM: within 12 in of each box, then <= 300 mm apart`,
        group: "Electronics", motion: "table", source: "hardware", ownGeo: true, base: T0, color: steel }]);
    }
    return out;
  }
  // the switch panel's wiring with the hub (user 2026-11-03: "see the wiring into the switches ... and the LED"): the
  // devices' backs in the boxes behind the under-table panel (SWP_H; hide SwitchPanel_Boxes with H to see in).
  //   paddle box (1-gang): 12-3 #1 in its top (from the inlet box), the 12-2 jumper out its side to the toggles' box
  //     paddle switch (magnetic: its coil needs N): L in <- #1 black; L out -> nut {#1 red (switched, back to the hub),
  //     the jumper's black}; nut {#1 white, the jumper's white, the coil's N}; nut {#1 bare, the jumper's bare, its G}
  //   toggles' box (3-gang): the jumper in its side, 12-3 #2 in its top (to the outlet box)
  //     nut {the jumper's black, the lamp, both toggles' line}; nut {the jumper's white, #2 white, the lamp's N, both
  //     toggles' N (pilot lights)}; nut {the jumper's bare, #2 bare, both toggles' green}; ROUTER load -> #2 black,
  //     VAC load -> #2 red
  //   power lamp (22 mm 120 V LED pilot light: its resistor inside; 2 terminals): switched line + neutral - lit = power on
  // GUESS layout / terminals.
  function hubPanelWiring(flat) {
    const HF = HUB.cables && HUB.cables.hf, J = HUB.cables && HUB.cables.jumper;
    if (!HF || !J) return [];
    const out = [], V = (x, y, z) => new THREE.Vector3(x, y, z), cx = HF.cx, cz = HF.cz, y0 = HF.y0, bk = HF.bk;
    const T0 = { t: [0, 0, 0], s: [1, 1, 1] }, ud = (name, label, color) => ({ name, label, group: "Electronics", motion: "table", source: "hardware", ownGeo: true, base: T0, color });
    const metal = (c) => flat(c, { metalness: 0.8, roughness: 0.3 });
    const bodies = [], brass = [], silver = [], green = [], nuts = [];
    const screw = (list, p, axis) => list.push(new THREE.CylinderGeometry(3.4, 3.4, 2.2, 14).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis))).translate(p.x, p.y, p.z));
    const back = V(0, 1, 0);
    const x1 = cx + SWP_H.estop, xL = cx + SWP_H.lamp, xR = cx + SWP_H.router, xV = cx + SWP_H.vac;
    // the devices' backs through the panel into their boxes
    bodies.push(new THREE.CylinderGeometry(10, 10, bk + 22 - y0, 20).translate(xL, (y0 + bk + 22) / 2, cz));
    for (const x of [xR, xV]) bodies.push(new THREE.BoxGeometry(20, bk + 26 - y0, 56).translate(x, (y0 + bk + 26) / 2, cz));
    const yP = y0 + 45.7;                              // on the back of the paddle switch's body (SwitchPanel_PaddleBox: 44.6 deep)
    const P = { lin: V(x1 - 10, yP, cz + 12), lout: V(x1 + 10, yP, cz + 12), n: V(x1 - 10, yP, cz - 12), g: V(x1 + 10, yP, cz - 12) };
    const Lm = { l: V(xL - 5, bk + 23, cz), n: V(xL + 5, bk + 23, cz) };
    const Tg = (x) => ({ line: V(x - 11, bk + 14, cz + 14), load: V(x - 11, bk + 14, cz - 14), n: V(x + 11, bk + 14, cz + 14), g: V(x + 11, bk + 14, cz - 14) });
    const TR = Tg(xR), TV = Tg(xV);
    screw(brass, P.lin, back); screw(brass, P.lout, back); screw(silver, P.n, back); screw(green, P.g, back);
    screw(brass, Lm.l, back); screw(silver, Lm.n, back);
    for (const t of [TR, TV]) { screw(brass, t.line, V(-1, 0, 0)); screw(brass, t.load, V(-1, 0, 0)); screw(silver, t.n, V(1, 0, 0)); screw(green, t.g, V(1, 0, 0)); }
    out.push([hrMerge(bodies), flat([0.12, 0.12, 0.13], { roughness: 0.5 }), ud("TableHub_PanelDevices", "Switch panel devices' backs (paddle switch terminals, power lamp, router + vac toggles)", [0.12, 0.12, 0.13])]);
    out.push([hrMerge(brass), metal([0.8, 0.62, 0.25]), ud("TableHub_PanelTermBrass", "Switch panel brass terminals (line in / switched / loads)", [0.8, 0.62, 0.25])]);
    out.push([hrMerge(silver), metal([0.8, 0.8, 0.82]), ud("TableHub_PanelTermSilver", "Switch panel silver terminals (neutral: the paddle's coil, the lamp, the pilot toggles)", [0.8, 0.8, 0.82])]);
    out.push([hrMerge(green), metal([0.15, 0.5, 0.2]), ud("TableHub_PanelTermGround", "Switch panel green ground terminals", [0.15, 0.5, 0.2])]);
    // the nuts low at the boxes' backs, open end up
    const nut = (x) => V(x, bk + 62, cz - 32);
    const nS1 = nut(x1 - 18), nN1 = nut(x1), nG1 = nut(x1 + 18), nS3 = nut(cx - 25), nN3 = nut(cx + 20), nG3 = nut(cx + 92);
    for (const n of [nS1, nN1, nG1, nS3, nN3, nG3]) nuts.push(new THREE.CylinderGeometry(6.5, 4, 20, 16).rotateX(Math.PI / 2).translate(n.x, n.y, n.z - 6));
    const W = { black: [], red: [], white: [], bare: [] }, R = { black: 1.5, red: 1.5, white: 1.5, bare: 1.05 };
    const wire = (col, pts) => W[col].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 40, R[col], 8, false));
    const yD = HUB.cables.pts.Paddle[HUB.cables.pts.Paddle.length - 1].y, sTop = cz + 49;
    const fromTop = (x, o) => [V(x + o, yD, sTop - 8), V(x + o, yD, sTop - 20)];   // out of a 12-3's sheath (it ends 12 mm in)
    const fromJ = (left, o) => left ? [V(J.x0 + 4, J.y, J.z + o), V(J.x0 - 8, J.y, J.z + o)] : [V(J.x1 - 4, J.y, J.z + o), V(J.x1 + 8, J.y, J.z + o)];
    const toBack = (t) => [V(t.x, t.y + 9, t.z), t];
    const toSide = (t, s) => [V(t.x + s * 9, t.y + 4, t.z), t];
    const into = (n) => [V(n.x, n.y, n.z + 16), V(n.x, n.y, n.z + 4)];
    const mid = (a, b) => V((a.x + b.x) / 2, Math.max(a.y, b.y) + 6, (a.z + b.z) / 2);
    const run = (col, s, end) => wire(col, [...s, mid(s[s.length - 1], end[0]), ...end]);
    const c1 = HUB.cables.pts.Paddle[HUB.cables.pts.Paddle.length - 1].x, c2 = HUB.cables.pts.Toggles[HUB.cables.pts.Toggles.length - 1].x;
    // the paddle's box
    run("black", fromTop(c1, -4.5), toBack(P.lin));
    run("red", fromTop(c1, 4.5), into(nS1));
    run("white", fromTop(c1, 1.5), into(nN1));
    run("bare", fromTop(c1, -1.5), into(nG1));
    run("black", fromJ(true, 3), into(nS1)); run("white", fromJ(true, -3), into(nN1)); run("bare", fromJ(true, 0), into(nG1));
    const pig = (col, t, n, side) => wire(col, [...(side ? toSide(t, side) : toBack(t)).reverse(), mid(t, n), ...into(n)]);
    pig("black", P.lout, nS1); pig("white", P.n, nN1); pig("bare", P.g, nG1);
    // the toggles' box
    run("black", fromTop(c2, -4.5), toSide(TR.load, -1));
    run("red", fromTop(c2, 4.5), toSide(TV.load, -1));
    run("white", fromTop(c2, 1.5), into(nN3));
    run("bare", fromTop(c2, -1.5), into(nG3));
    run("black", fromJ(false, 3), into(nS3)); run("white", fromJ(false, -3), into(nN3)); run("bare", fromJ(false, 0), into(nG3));
    pig("black", Lm.l, nS3); pig("white", Lm.n, nN3);
    pig("black", TR.line, nS3, -1); pig("black", TV.line, nS3, -1);
    pig("white", TR.n, nN3, 1); pig("white", TV.n, nN3, 1);
    pig("bare", TR.g, nG3, 1); pig("bare", TV.g, nG3, 1);
    const cols = { black: [0.05, 0.05, 0.06], red: [0.75, 0.08, 0.06], white: [0.92, 0.92, 0.9], bare: [0.78, 0.48, 0.25] };
    for (const k of Object.keys(W)) out.push([hrMerge(W[k]), k === "bare" ? metal(cols[k]) : flat(cols[k], { roughness: 0.5 }),
      ud(`TableHub_PanelWires${k[0].toUpperCase() + k.slice(1)}`, `Conductors in the switch boxes: ${{ black: "black (line / switched / loads)", red: "red (switched back to the hub; VAC)", white: "white (neutral)", bare: "bare copper (ground)" }[k]}`, cols[k])]);
    out.push([hrMerge(nuts), flat([0.85, 0.15, 0.1], { roughness: 0.45 }), ud("TableHub_PanelWireNuts", "Wire nuts in the switch boxes: paddle box - switched (2), neutral (3), ground (3); toggles' box - switched (4), neutral (5: a big one), ground (4)", [0.85, 0.15, 0.1])]);
    return out;
  }
  // the hub's devices behind the panel + their wiring (user 2026-11-03: "model a real outlet, and connect the right
  // wires"; hide the blue boxes with H to see in). Each device's body goes through its cut-out in the panel into its
  // box; terminals on the duplexes' sides (brass = line, -Y side; silver = neutral, +Y; green ground screw low on the
  // back), on the inlet's back (L brass, N silver, G green). The cables' sheaths stop ~12 mm into the box (clamped).
  //   inlet box: inlet L <- 12-3 black (line to the paddle); 12-3 red (switched, back) + 12-2 black -> a wire nut;
  //     whites + a pigtail to N -> a nut; bares + a pigtail to G + the hose's ground lead -> a nut
  //   outlet box (tab broken on the brass side): 12-3 black -> top brass (ROUTER), red -> bottom brass (VAC), white -> silver, bare -> green
  //   accessory box: 12-2 black -> brass, white -> silver, bare -> green
  // GUESS sizes (a 20 A duplex body ~33 x 66 x 31 mm deep behind its strap).
  function hubDevices(fx, T, zm, ys, flat, ivory) {
    const out = [], V = (x, y, z) => new THREE.Vector3(x, y, z), bx = fx + T + HUB.encl / 2, top = zm + 49, bot = zm - 49;
    const T0 = { t: [0, 0, 0], s: [1, 1, 1] }, ud = (name, label, color) => ({ name, label, group: "Electronics", motion: "table", source: "hardware", ownGeo: true, base: T0, color });
    const xB = fx + 28, xS = fx + T + 8;              // a duplex body's back, its side screws' x
    const bodies = [], brass = [], silver = [], green = [];
    const screw = (list, p, axis) => list.push(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 14).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis))).translate(p.x, p.y, p.z));
    for (const y of [ys.O, ys.A]) {                    // the duplexes: body + side screws (the outlet's brass pair split: tab broken)
      bodies.push(new THREE.BoxGeometry(xB - fx + 3, 33, 66).translate((fx - 3 + xB) / 2, y, zm));
      for (const dz of [19, -19]) { screw(brass, V(xS, y - 17.7, zm + dz), V(0, -1, 0)); screw(silver, V(xS, y + 17.7, zm + dz), V(0, 1, 0)); }
      screw(green, V(xB + 1.2, y, zm - 26), V(1, 0, 0));
      // the tabs joining each side's two screws (user 2026-11-03: "draw the tabs"): the outlet's brass tab broken off
      // (two stubs, a gap: ROUTER top / VAC bottom fed apart), its silver tab whole (a shared neutral); the accessory's both whole
      const tab = (list, s, z0, z1) => list.push(new THREE.BoxGeometry(6, 0.9, z1 - z0).translate(xS, y + s * 16.95, zm + (z0 + z1) / 2));
      if (y === ys.O) { tab(brass, -1, 12, 19); tab(brass, -1, -19, -12); } else tab(brass, -1, -19, 19);
      tab(silver, 1, -19, 19);
    }
    const iB = fx + T + 24;                            // the inlet's body (round, behind its flange) + its back terminals
    bodies.push(new THREE.CylinderGeometry(19, 19, iB - fx, 28).rotateZ(Math.PI / 2).translate((fx + iB) / 2, ys.I, zm));
    const tL = V(iB + 1.2, ys.I + 8, zm + 8), tN = V(iB + 1.2, ys.I - 8, zm + 8), tG = V(iB + 1.2, ys.I, zm - 9);
    screw(brass, tL, V(1, 0, 0)); screw(silver, tN, V(1, 0, 0)); screw(green, tG, V(1, 0, 0));
    out.push([hrMerge(bodies), flat([0.86, 0.84, 0.78], { roughness: 0.5 }), ud("TableHub_DeviceBodies", "Device bodies behind the panel (the inlet; the router / vac and accessory duplexes - 20 A, side-wired)", [0.86, 0.84, 0.78])]);
    const metal = (c) => flat(c, { metalness: 0.8, roughness: 0.3 });
    out.push([hrMerge(brass), metal([0.8, 0.62, 0.25]), ud("TableHub_TermBrass", "Brass terminal screws (line / hot: black, red)", [0.8, 0.62, 0.25])]);
    out.push([hrMerge(silver), metal([0.8, 0.8, 0.82]), ud("TableHub_TermSilver", "Silver terminal screws (neutral: white)", [0.8, 0.8, 0.82])]);
    out.push([hrMerge(green), metal([0.15, 0.5, 0.2]), ud("TableHub_TermGround", "Green ground screws (bare / ground)", [0.15, 0.5, 0.2])]);
    // the conductors: from the sheath's end (spread across the flat cable) to their terminal / nut, a small hook round each screw
    const W = { black: [], red: [], white: [], bare: [] }, R = { black: 1.5, red: 1.5, white: 1.5, bare: 1.05 };
    const wire = (col, pts) => W[col].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 40, R[col], 8, false));
    const fromTop = (x, y, o) => [V(x + o, y, top + 4), V(x + o, y, top - 12)];   // the sheath's end in the box, its conductors' first bit
    const fromBot = (x, y, o) => [V(x, y + o, bot - 4), V(x, y + o, bot + 12)];
    const toSide = (s, side) => [V(xS + 10, s.y + side * 9, s.z), V(xS + 2, s.y + side * 5, s.z), s];   // round to a side screw
    const toBack = (s) => [V(s.x + 10, s.y, s.z + 4), V(s.x + 3, s.y, s.z)];
    // the outlet box (12-3 down from its top, at bx + 14)
    { const y = ys.O, c = bx + 14, sb = (dz) => V(xS, y - 17.7, zm + dz), ss = (dz) => V(xS, y + 17.7, zm + dz);
      wire("black", [...fromTop(c, y, -4.5), V(c - 12, y - 14, zm + 26), ...toSide(sb(19), -1)]);
      wire("red", [...fromTop(c, y, 4.5), V(c - 6, y - 20, zm - 6), ...toSide(sb(-19), -1)]);
      wire("white", [...fromTop(c, y, 1.5), V(c - 12, y + 14, zm + 26), ...toSide(ss(19), 1)]);
      wire("bare", [...fromTop(c, y, -1.5), V(c, y + 6, zm - 10), ...toBack(V(xB + 1.2, y, zm - 26))]); }
    // the accessory box (12-2 up from its bottom, at bx)
    { const y = ys.A;
      wire("black", [...fromBot(bx, y, -3), V(bx - 8, y - 14, zm + 2), ...toSide(V(xS, y - 17.7, zm - 19), -1)]);
      wire("white", [...fromBot(bx, y, 3), V(bx - 8, y + 14, zm + 2), ...toSide(V(xS, y + 17.7, zm - 19), 1)]);
      wire("bare", [...fromBot(bx, y, 0), V(bx + 6, y, zm - 34), ...toBack(V(xB + 1.2, y, zm - 26))]); }
    // the inlet box: 12-3 down from its top (at bx - 14), 12-2 up from its bottom (at bx); three nuts at the back
    const nuts = [], y = ys.I, nS = V(bx + 12, y - 16, zm + 22), nN = V(bx + 12, y + 2, zm + 30), nG = V(bx + 12, y + 16, zm - 22)   // (inside: they poked out of its back at bx + 24);
    const into = (n) => [V(n.x - 14, n.y, n.z), V(n.x - 6, n.y, n.z)];   // up into a nut's open end (it points to the back)
    { const c = bx - 14;
      wire("black", [...fromTop(c, y, -4.5), V(c - 4, y + 10, zm + 18), ...toBack(tL)]);
      wire("red", [...fromTop(c, y, 4.5), V(c + 6, y - 14, zm + 26), ...into(nS)]);
      wire("white", [...fromTop(c, y, 1.5), V(c + 8, y + 2, zm + 32), ...into(nN)]);
      wire("bare", [...fromTop(c, y, -1.5), V(c + 6, y + 14, zm + 6), V(nG.x - 22, nG.y, nG.z + 4), ...into(nG)]);
      wire("black", [...fromBot(bx, y, -3), V(bx + 2, y - 18, zm - 10), V(nS.x - 22, nS.y, nS.z - 6), ...into(nS)]);
      wire("white", [...fromBot(bx, y, 3), V(bx - 6, y + 4, zm + 2), V(nN.x - 22, nN.y, nN.z - 4), ...into(nN)]);
      wire("bare", [...fromBot(bx, y, 0), V(bx + 6, y + 10, zm - 34), ...into(nG)]);
      wire("white", [...toBack(tN).reverse(), V(tN.x + 12, tN.y + 4, tN.z + 14), ...into(nN)]);   // the pigtails
      wire("bare", [...toBack(tG).reverse(), V(tG.x + 12, tG.y + 8, tG.z - 8), ...into(nG)]); }
    for (const n of [nS, nN, nG]) nuts.push(new THREE.CylinderGeometry(4, 6.5, 20, 16).rotateZ(-Math.PI / 2).translate(n.x + 4, n.y, n.z));
    HUB.groundNut = nG;                                // (the hose's ground lead ends in it)
    const cols = { black: [0.05, 0.05, 0.06], red: [0.75, 0.08, 0.06], white: [0.92, 0.92, 0.9], bare: [0.78, 0.48, 0.25] };
    const names = { black: "black (line / hot)", red: "red (the 12-3's second hot: switched back / VAC)", white: "white (neutral)", bare: "bare copper (ground)" };
    for (const k of Object.keys(W)) out.push([hrMerge(W[k]), k === "bare" ? metal(cols[k]) : flat(cols[k], { roughness: 0.5 }),
      ud(`TableHub_Wires${k[0].toUpperCase() + k.slice(1)}`, `Conductors in the hub's boxes: ${names[k]}`, cols[k])]);
    out.push([hrMerge(nuts), flat([0.85, 0.15, 0.1], { roughness: 0.45 }), ud("TableHub_WireNuts", "Wire nuts (red, for 2-4 x 12 AWG): switched line, neutrals, grounds (inlet box)", [0.85, 0.15, 0.1])]);
    return out;
  }
  // ---- the table's hub (Part 52, an OPTION - off by default, My LR4 > Options): a panel set into the table's left
  // (Min X) end (user 2026-11-02: "a panel on the side that this and the outlets are set into"; layout "port left,
  // power right" looking at the end: the port toward the table's back, the power toward its front / the switch
  // panel). It hangs under the apron / torsion box, its face flush with the end. Set into it: a 2-1/2" dust port
  // (a bulkhead through the panel: the LR4's hose plugs in level from outside, the vac's hose fits its inside stub),
  // a flanged power inlet (the extension cord plugs in), the router / vac outlet (a duplex, tab broken: top = router,
  // bottom = vac, each on its switch panel toggle) and an always-on accessory outlet (live while powered, cut by the
  // e-stop). A single-gang new-work box behind each (a relay later = its own box). Clear of the legs (a long table's
  // middle leg). Both tables. Drawn generic, sizes GUESS.
  // "Shop vac" (needs the hub): a drum vac + a cyclone separator on a bucket under the table, joined by two hoses.
  // HUB.port = the port's outside mouth (world mm) while the hub is drawn: hoseRoute brings the hose in along +X.
  // set: the panel's face this far in from the end (user 2026-11-02: plugs + cords out of reach of legs and the swinging
  // hose); the port's outside stub reaches back out to the end face, where the machine hose plugs in
  const HUB = { port: null, T: 16, w: 450, h: 190, encl: 76, tube: 30, stub: 40, set: 100 };   // h, stub: 220, 100 until the user's 2026-11-03 trims
  function hubMeshes() {
    HUB.port = null;
    const tb = tableBox(true), lg = meshes.find((m) => m.userData.name === "TableLegs");
    if (!tb) return [];
    const flat = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color().setRGB(...c).convertSRGBToLinear(),
      roughness: 0.55, metalness: 0, side: THREE.DoubleSide }, extra));
    const T0 = { t: [0, 0, 0], s: [1, 1, 1] };
    const ud = (name, label, color, group, extra) => Object.assign({ name, label, group, motion: "table", source: "hardware",
      ownGeo: true, base: T0, color }, extra);
    const box = (b) => boxesGeo([b]);
    const cylZ = (r, z0, z1, x, y, n = 32) => new THREE.CylinderGeometry(r, r, z1 - z0, n).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
    const cylX = (r, x0, x1, y, z, n = 24) => new THREE.CylinderGeometry(r, r, x1 - x0, n).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
    const cylY = (r, y0, y1, x, z, n = 24) => new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), n).translate(x, (y0 + y1) / 2, z);
    const lathZ = (pts, x, y, n = 40) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), n).rotateX(Math.PI / 2).translate(x, y, 0);
    const lathX = (pts, x, y, z, n = 40) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), n).rotateZ(-Math.PI / 2).translate(x, y, z);   // axis +X
    // fx: the panel's face - in line with the front switch panel's left edge, just inboard of the front-left leg (user
    // 2026-11-03: "slide the side panel up behind the front post so it meets the front panel at 90 degrees")
    const HF0 = swpHubFrame(tb);
    const out = [], T = HUB.T, ex = tb.min.x, fx = HF0 ? HF0.cx + SWP_H.panel[0] : ex + HUB.set, r = HUB.tube, W = HUB.w, H = HUB.h;   // ex: the end face
    const ap = meshes.find((m) => m.userData.name === "TableApron");   // the sheet table's apron hangs below its sheet
    const uz = ap ? Math.min(tb.min.z, new THREE.Box3().setFromObject(ap).min.z) : tb.min.z;
    // the port at the hose's drop (the table's mid-depth, S.TL / 2: the shortest hose; user 2026-11-02), the power toward the front;
    // else the nearest spot whose panel (yc +- W/2) misses the legs at this end
    const clear = (y) => y - W / 2 > tb.min.y + 40 && y + W / 2 < tb.max.y - 40 &&
      !LEG_BOXES.some((l) => l[0] < fx + T + HUB.encl + 20 && l[4] > y - W / 2 - 20 && l[1] < y + W / 2 + 20);
    const ym = S.TL / 2 - (W / 2 - 105);              // yc with the port (y0 + W - 105) at S.TL / 2
    let yc = ym;
    for (let d = 0; d < 2000 && !clear(yc); d += 25) yc = clear(ym - d) ? ym - d : ym + d;
    // with the front switch panel (user 2026-11-03: "slide everything on the side panel forward and make the panel
    // shorter ... more room for storage under the table, which may become a cart"): the devices start just behind the
    // front-left leg (the accessory plate 40 mm clear of it); a longer hose / cord to the port, the rest of the end left open
    const fl = HF0 && LEG_BOXES.filter((l) => l[1] < tb.min.y + 150).sort((p, q) => p[0] - q[0])[0];
    const ycVac = yc;                                 // (the vac + separator stay at mid-depth: their hoses reach the port)
    if (fl) yc = fl[4] + 40 + 36 - 55 + W / 2;        // y0 + 55 (the accessory) - 36 (half its plate) = the leg's back + 40 (user: a little margin)
    const y0 = yc - W / 2, z0 = uz - H, zm = uz - H / 2;   // y0 = the panel's front end
    const pf = HF0 ? Math.min(HF0.bk, y0) : y0;      // its front end: butted to the front panel's back (a square corner)
    out.push([box([fx, pf, z0, fx + T, y0 + W, uz]), material([0.86, 0.68, 0.44], null, false, "ply"), { name: "TableHub_Panel",
      label: `Hub panel::5/8 in plywood, ${Math.round(y0 + W - pf)} x ${H} mm, ${Math.round(fx - ex)} mm in from the table's left end, inboard of the front leg, ` +
        `meeting the switch panel at the front in a square corner; under the ${ap ? "apron" : "torsion box"}; GUESS`,
      group: "Table", motion: "table", source: "made", color: [0.86, 0.68, 0.44], ownGeo: true, grain: "ply" }]);
    const grey = [0.55, 0.57, 0.58], ivory = [0.9, 0.88, 0.82], dark = [0.06, 0.06, 0.07];
    // the devices, each in a single-gang plate on the face (looking at the end: inlet, router / vac, accessory)
    const plate = (y) => [fx - 3, y - 36, zm - 58, fx, y + 36, zm + 58], yI = y0 + 225, yO = y0 + 140, yA = y0 + 55;
    out.push([boxesGeo([yI, yO, yA].map(plate)), flat(ivory), ud("TableHub_Plates", "Cover plates (3 single-gang)", ivory, "Electronics")]);
    // labels printed on the plates' margins (user 2026-11-02), facing out (-X): [plate y, top, bottom]
    const face = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
    for (const [y, top, bot, n] of [[yI, "POWER IN", "20 A", "Inlet"], [yO, "ROUTER", "VAC", "Outlet"], [yA, "CONTROLLER", "ACCESSORY", "Accessory"]])
      out.push([new THREE.PlaneGeometry(72, 116).applyMatrix4(face).translate(fx - 3.15, y, zm),
        new THREE.MeshStandardMaterial({ map: plateLabels(top, bot), transparent: true, roughness: 0.5, side: THREE.DoubleSide }),
        ud(`TableHub_${n}Label`, `Label: ${top} / ${bot}`, ivory, "Electronics")]);
    // behind each: a single-gang new-work box (blue PVC, ~60 x 98 x 76 mm deep; GUESS), its nailing flange screwed to
    // the panel's back (user 2026-11-02: boxes, not one big enclosure); NM jumpers between them. A relay later = its own box.
    const nw = [0.13, 0.32, 0.72], D = HUB.encl;
    out.push([boxesGeo([yI, yO, yA].flatMap((y) => [[fx + T, y - 30, zm - 49, fx + T + D, y + 30, zm + 49],
      [fx + T, y + 30, zm - 40, fx + T + 3, y + 44, zm + 40]])), flat(nw, { roughness: 0.45 }),
      ud("TableHub_Boxes", "Outlet boxes (3 single-gang new-work boxes, blue PVC, one behind each device; GUESS 60 x 98 x 76 mm)", nw, "Electronics")]);
    out.push([lathX([[0, 0], [21, 0], [21, -12], [18, -12], [18, -3], [0, -3]], fx - 3, yI, zm),   // sticks out (-X)
      flat(dark, { roughness: 0.4 }), ud("TableHub_Inlet", "Power inlet (flanged plug inlet, 20 A - or 15 A to suit your circuit): the extension cord plugs in here", dark, "Electronics")]);
    // NEMA 5-20 (user 2026-11-03: "one of the prongs sideways"): the neutral blade turned 90 deg (a 15 A cord's
    // plug won't fit; a 20 A cord's 5-20R end goes on)
    const blades = [[6.5, 0, 1.6, 6.5], [-6.5, 0, 6.4, 1.6], [0, -9, 4.8, 4.8]];   // hot, neutral (sideways), ground (y, z, w, h): a plug's face, the outlet's mirrored
    out.push([boxesGeo(blades.map(([y, z, w, h]) => [fx - 21, yI + y - w / 2, zm + 4 + z - h / 2, fx - 6, yI + y + w / 2, zm + 4 + z + h / 2])),
      flat([0.75, 0.7, 0.5], { metalness: 0.7, roughness: 0.35 }), ud("TableHub_InletPins", "Power inlet pins (NEMA 5-20P: the neutral blade sideways)", [0.75, 0.7, 0.5], "Electronics")]);
    const duplex = (y, name, label) => {               // a duplex receptacle's two faces + their slots
      const faces = [], slots = [];
      for (const dz of [19, -19]) {
        faces.push([fx - 7, y - 17, zm + dz - 15, fx - 3, y + 17, zm + dz + 15]);
        // NEMA 5-20R: hot, the neutral's T (its upright + a sideways branch out from its middle: takes 15 A or 20 A plugs), ground
        for (const [sy, sz, w, h] of [[-6, 3, 2.2, 7], [6, 3, 2.2, 8.5], [8.6, 3, 5.2, 2.2], [0, -7, 4.5, 4.5]]) slots.push([fx - 7.6, y + sy - w / 2, zm + dz + sz - h / 2, fx - 6.9, y + sy + w / 2, zm + dz + sz + h / 2]);
      }
      out.push([boxesGeo(faces), flat(ivory, { roughness: 0.4 }), ud(name, label, ivory, "Electronics")]);
      out.push([boxesGeo(slots), flat(dark), ud(name + "Slots", label.replace(/ \(.*$/, "") + " slots", dark, "Electronics")]);
    };
    duplex(yO, "TableHub_Outlet", "Router / vac outlet (duplex, tab broken: top = router, bottom = vac - each on its switch panel toggle, both dead with the e-stop)");
    HUB.outlet = { router: [fx - 7, yO, zm + 19], vac: [fx - 7, yO, zm - 19] };   // the sockets' faces (Part 52c: the plugs)
    const plugGeo = (q) => boxesGeo([[q[0] - 31, q[1] - 15, q[2] - 13, q[0], q[1] + 15, q[2] + 13]]);
    out.push([plugGeo(HUB.outlet.router), flat([0.07, 0.07, 0.08], { roughness: 0.6 }),
      ud("TableHub_RouterPlug", "The router cord's plug (in the ROUTER socket - left plugged in)", [0.07, 0.07, 0.08], "Hose")]);
    duplex(yA, "TableHub_Accessory", "Accessory outlet (duplex, on while the paddle switch is - its top socket CONTROLLER feeds the 24 V supply (the Jackpot), the bottom one ACCESSORY: lights / a laptop / chargers)");
    // the 24 V supply's plug in its top socket, CONTROLLER (user 2026-11-03): its cord goes up to the gantry (wiring.js psu-ac)
    HUB.outlet.psu = [fx - 7, yA, zm + 19];
    out.push([plugGeo(HUB.outlet.psu), flat([0.07, 0.07, 0.08], { roughness: 0.6 }),
      ud("TableHub_PsuPlug", "The 24 V supply's mains plug (in the CONTROLLER socket, the top of the accessory duplex; its cord runs up to the gantry and along the beam to the supply)", [0.07, 0.07, 0.08], "Electronics")]);
    // the dust port: a bulkhead through the panel - a flange outside, a lock nut inside, stubs both ways
    // the port midway between the POWER IN plate's edge and the panel's end (user 2026-11-03)
    const yP = (yI + 36 + y0 + W) / 2, sx = fx - 40, ix = fx + T + HUB.stub, L = fx - sx;   // the mouth 40 mm out from the (set back) panel
    out.push([lathX([[r - 2.5, 0], [r + 4, 0], [r + 4, 40], [r, 40], [r, L + T + HUB.stub], [r - 2.5, L + T + HUB.stub]], sx, yP, zm), flat(dark, { roughness: 0.45 }),
      ud("TableHub_Port", "Dust port (2-1/2 in bulkhead through the panel: the LR4's hose plugs in outside, level; the vac's hose fits the stub inside; GUESS)", dark, "Electronics")]);
    out.push([lathX([[r, 0], [r + 14, 0], [r + 14, 4], [r, 4]], fx - 4, yP, zm), flat(dark), ud("TableHub_PortFlange", "Dust port flange", dark, "Electronics")]);
    out.push([cylX(r + 12, fx + T, fx + T + 10, yP, zm, 6), flat(dark), ud("TableHub_PortNut", "Dust port lock nut (inside)", dark, "Electronics")]);
    HUB.port = [sx, yP, zm];                           // the hose comes in along +X
    // the hose's ground (user 2026-11-03; V1E docs: "Vac Hoses need to be grounded at one end ... the ground port from your
    // power source"; static can damage the board) - no outlet used: its steel wire bared at the end it plugs in with, a
    // hose clamp over it + a ring terminal, a short green lead to a green binding post in the panel below the port (user's
    // pick: NOYITO M5, 40 A, 4 mm banana; sizes GUESS from its photo; unplugs without tools); behind the panel, a green 14 AWG lead from the post into the inlet box's side (a knockout)
    // to its ground nut (the cables' bares + the inlet's ground pigtail: hubDevices; PVC boxes have no ground screw). GUESS sizes / route.
    const cx = sx + 20, hr = 34 + 1.5;                  // the hose (68 mm OD) is on the stub to ~sx + 35
    out.push([new THREE.CylinderGeometry(hr, hr, 12, 40, 1, true).rotateZ(Math.PI / 2).translate(cx, yP, zm),
      flat(grey, { metalness: 0.8, roughness: 0.3 }), ud("TableHub_HoseClamp", "Hose clamp (2-1/2 in) on the hose's bared steel wire + the ground lead's ring terminal", grey, "Electronics")]);
    const gGreen = [0.1, 0.5, 0.18], yb = yP - 60, zb = zm - 54;   // the post: below the port, toward the front
    const pGreen = [0.35, 0.85, 0.4];                  // its light green plastic: a ribbed knob, insulating washers each side of the panel
    out.push([hrMerge([cylX(7, fx - 6, fx, yb, zb, 32), cylX(6, fx - 28, fx - 10, yb, zb, 28), cylX(7, fx + T, fx + T + 5, yb, zb, 32)]), flat(pGreen, { roughness: 0.45 }),
      ud("TableHub_GroundPost", "Ground binding post (NOYITO M5, green, 4 mm banana; the hose's lead under its knob, the box's lead on its back stud; counterbore the 5/8 in panel from behind if its thread is short)", pGreen, "Electronics")]);
    out.push([hrMerge([cylX(4.5, fx - 10, fx - 6, yb, zb, 20), cylX(2.5, fx + T, fx + T + 18, yb, zb, 12), cylX(4.6, fx + T + 5, fx + T + 9, yb, zb, 6),
      cylX(4.6, fx + T + 9.5, fx + T + 13.5, yb, zb, 6), new THREE.TorusGeometry(3.6, 0.8, 6, 16).rotateY(Math.PI / 2).translate(fx - 8, yb, zb)]),
      flat([0.78, 0.78, 0.76], { metalness: 0.85, roughness: 0.3 }),
      ud("TableHub_GroundStud", "Ground post's nickel-plated collar, M5 stud + nuts, and the hose lead's ring terminal", [0.78, 0.78, 0.76], "Electronics")]);
    const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, "centripetal"), 48, r, 8, false);
    out.push([hrMerge([
      tube([[cx, yP - hr * 0.7, zm - hr * 0.7], [cx + 2, yb + 10, zb + 26], [fx - 8, yb, zb + 12], [fx - 8, yb, zb + 4.4]], 1.3),   // the hose's lead (~0.1 m)
      tube([[fx + T + 16, yb, zb + 2.6], [fx + T + 22, yb - 6, zb + 4], [fx + T + 32, yI + 62, zm - 36],   // the box's (clear of its nailing flange)
        [fx + T + 46, yI + 50, zm - 30], [fx + T + 46, yI + 30, zm - 30], [fx + T + 50, yI + 20, zm - 22], [fx + T + HUB.encl / 2 + 6, yI + 16, zm - 22]], 1.3)]), flat(gGreen),
      ud("TableHub_HoseGround", "Hose ground leads (14 AWG green): the hose clamp to the ground post (~0.1 m), the post to the inlet box's ground nut (~0.3 m) - grounds the hose's steel wire without an outlet", gGreen, "Electronics")]);
    out.push(...hubCables(tb, fx, T, zm, { I: yI, O: yO, A: yA }, flat));
    out.push(...hubDevices(fx, T, zm, { I: yI, O: yO, A: yA }, flat));
    out.push(...hubPanelWiring(flat));
    const ppx = ix, pb = zm;                           // the vac hose leaves the inside stub (along +X)
    // the shop vac + separator (an option on the hub): on the floor under the table (user 2026-11-02), between the legs
    const fz = lg ? new THREE.Box3().setFromObject(lg).min.z : tb.max.z - 34 * IN;
    const xm = (tb.min.x + tb.max.x) / 2, sep = [xm, ycVac - 200], vac = [xm, ycVac + 330];
    const black = [0.08, 0.08, 0.09], drum = [0.32, 0.34, 0.37], pail = [0.86, 0.86, 0.83], hoseC = [0.18, 0.19, 0.2];
    const vud = (name, label, color) => ud(name, label, color, "Hose", { floor: true });
    const casters = (x, y, R) => boxesGeo([0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + k * Math.PI / 2, cx = x + R * Math.cos(a), cy = y + R * Math.sin(a);
      return [cx - 14, cy - 14, fz, cx + 14, cy + 14, fz + 45]; }));
    out.push([casters(...sep, 120), flat(black), vud("ShopVac_SepCasters", "Bucket dolly casters", black)]);
    out.push([lathZ([[0, fz + 45], [165, fz + 45], [165, fz + 60], [0, fz + 60]], ...sep), flat(black), vud("ShopVac_SepDolly", "Bucket dolly", black)]);
    const b0 = fz + 60, b1 = b0 + 370;
    out.push([lathZ([[0, b0], [135, b0], [150, b1 - 20], [156, b1 - 15], [156, b1], [0, b1]], ...sep), flat(pail, { roughness: 0.6 }),
      vud("ShopVac_Bucket", "5 gal bucket (the separator's: chips + dust land here)", pail)]);
    out.push([lathZ([[0, b1], [160, b1], [160, b1 + 15], [118, b1 + 15], [112, b1 + 70], [35, b1 + 78], [0, b1 + 78]], ...sep), flat(black),
      vud("ShopVac_Separator", "Cyclone separator lid on the bucket (low-profile kind; GUESS sizes)", black)]);
    const inZ = b1 + 45, sepIn = [sep[0] - 72, sep[1] + 150, inZ], sepOut = [sep[0], sep[1], b1 + 125];   // the inlet faces the socket (+Y), tangential
    out.push([new THREE.CylinderGeometry(r + 3, r + 3, sepIn[1] - sep[1], 24, 1, true).translate(sepIn[0], (sep[1] + sepIn[1]) / 2, inZ), flat(black), vud("ShopVac_SepInlet", "Separator inlet (from the table's dust port)", black)]);
    out.push([cylZ(r + 3, b1 + 75, sepOut[2], ...sep), flat(black), vud("ShopVac_SepOutlet", "Separator outlet (to the vac)", black)]);
    out.push([casters(...vac, 150), flat(black), vud("ShopVac_Casters", "Shop vac casters", black)]);
    const v0 = fz + 45, v1 = v0 + 420;
    out.push([lathZ([[0, v0], [180, v0], [200, v0 + 30], [205, v1], [0, v1]], ...vac), flat(drum, { roughness: 0.5 }),
      vud("ShopVac_Drum", "Shop vac (drum, ~12 gal; GUESS 410 x 550 mm)", drum)]);
    out.push([lathZ([[0, v1], [210, v1], [205, v1 + 60], [150, v1 + 120], [0, v1 + 130]], ...vac), flat(black, { roughness: 0.45 }),
      vud("ShopVac_Head", "Shop vac motor head", black)]);
    const vacIn = [vac[0], vac[1] - 245, v1 - 70];   // faces the separator (-Y)
    out.push([cylY(r + 4, vacIn[1], vac[1] - 190, vacIn[0], vacIn[2]), flat(black), vud("ShopVac_Inlet", "Shop vac inlet", black)]);
    // the two hoses: port -> separator inlet (the vac's long hose), separator -> vac (the separator's short hose)
    // Part 53b: each a rope (js/cable_sim.js), settled once (nothing here moves): laid along pts a little longer, both
    // ends pinned with their directions (the first / last two points), the rest hangs onto the floor, round the bucket,
    // the drum, the legs, under the table and the hub panel (the bucket only to below its lid: the inlet hose comes in there)
    const hcols = [{ floor: fz }, { cyl: [sep[0], sep[1], 156, fz, b1 - 20] }, { cyl: [vac[0], vac[1], 210, fz, v1 + 130] },
      { box: [tb.min.x, tb.min.y, tb.min.z, tb.max.x, tb.max.y, tb.max.z] }, { box: [fx, y0, z0, fx + T, y0 + W, uz] }].concat(LEG_BOXES.map((b) => ({ box: b })));
    const hose = (name, label, pts, slack = 1.08) => {
      let c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
      if (typeof LR4Cable !== "undefined") {
        const L = c.getLength() * slack, n = Math.max(10, Math.round(L / 45) + 1), V = (q) => new THREE.Vector3(...q);
        const rp = LR4Cable.make(c.getPoints(80).map((q) => [q.x, q.y, q.z]), { n, len: L, r: 36, stiff: 0.25, damp: 0.08, iters: 12 }), s = rp.seg;
        const end = (a, b) => V(a).add(V(b).sub(V(a)).setLength(s)).toArray();   // a segment from a toward b
        rp.pin(0, pts[0]); rp.pin(1, end(pts[0], pts[1]));
        rp.pin(-1, pts[pts.length - 1]); rp.pin(-2, end(pts[pts.length - 1], pts[pts.length - 2]));
        rp.settle(400, hcols);
        c = new THREE.CatmullRomCurve3(rp.points().map(V), false, "centripetal");
      }
      out.push([new THREE.TubeGeometry(c, Math.ceil(c.getLength() / 10), 36, 16, false), flat(hoseC, { roughness: 0.7 }),
        vud(name, `${label}, ~${(c.getLength() / 1000).toFixed(1)} m as it lies`, hoseC)]);
    };
    // the vac's cord: off its head, along the floor, up under the panel and round to the VAC socket (Part 52c)
    // a limp rope (js/cable_sim.js, Part 53a; user: it went through the floor as a drawn curve): out of the drum's side
    // toward the panel, settled on the floor, round the drum / bucket / legs and under the panel to its plug in VAC
    const vq = HUB.outlet.vac, vB = [vq[0] - 31, vq[1], vq[2]];
    const ux = fx - vac[0], uy = vq[1] - vac[1], ul = Math.hypot(ux, uy) || 1, vA = [vac[0] + 212 * ux / ul, vac[1] + 212 * uy / ul, v1 - 40];
    // (user 2026-11-02: "fix this mess") laid like a real cord from a duplex: straight out of the plug's back, a smooth
    // droop straight down beside the router cord (+Y of it: they never cross), along the floor, up the vac's side
    const vy = vB[1] + 16, oX = ux / ul, oY = uy / ul;
    const lay = [vB, [vB[0] - 18, vB[1], vB[2]], [vB[0] - 32, vy, vB[2] - 30], [vB[0] - 34, vy, z0 - 60], [vB[0] - 34, vy, fz + 60],
      [vB[0] - 70, vy, fz + 6], [vA[0] + 160 * oX, vA[1] + 160 * oY, fz + 6], [vA[0] + 70 * oX, vA[1] + 70 * oY, fz + 40], [vA[0] + 25 * oX, vA[1] + 25 * oY, vA[2] - 60], vA];
    // resampled and lifted to rest ON the floor (the curve dipped through it between its points)
    const vc = new THREE.CatmullRomCurve3(new THREE.CatmullRomCurve3(lay.map((q) => new THREE.Vector3(...q)), false, "centripetal")
      .getSpacedPoints(160).map((q) => { q.z = Math.max(q.z, fz + 4.6); return q; }), false, "centripetal");
    out.push([new THREE.TubeGeometry(vc, 120, 4.5, 8, false), flat([0.07, 0.07, 0.08], { roughness: 0.6 }), vud("ShopVac_Cord", `Shop vac cord to the VAC socket (~${(vc.getLength() / 1000).toFixed(1)} m drawn)`, [0.07, 0.07, 0.08])]);
    out.push([plugGeo(vq), flat([0.07, 0.07, 0.08], { roughness: 0.6 }), vud("ShopVac_Plug", "Shop vac plug (in the VAC socket)", [0.07, 0.07, 0.08])]);
    hose("ShopVac_Hose", "Vac hose: the dust port's inside stub to the separator inlet (2-1/2 in; the rest of a long hose coiled)", [[ppx - 30, yP, pb], [ppx + 40, yP, pb],
      [ppx + 120, yP - 30, pb - 60], [sepIn[0], sepIn[1] + 130, inZ + 10], [sepIn[0], sepIn[1] + 60, inZ], [sepIn[0], sepIn[1] + 10, inZ], [sepIn[0], sepIn[1] - 40, inZ]]);   // the cuff over the stub
    hose("ShopVac_Hose2", "Separator hose: the separator outlet to the vac (2-1/2 in)", [[sepOut[0], sepOut[1], sepOut[2] - 30], [sepOut[0], sepOut[1], sepOut[2] + 40],
      [sep[0], sep[1] + 120, sepOut[2] + 50], [vacIn[0], vacIn[1] - 90, vacIn[2] + 20], [vacIn[0], vacIn[1] - 30, vacIn[2]], [vacIn[0], vacIn[1] + 10, vacIn[2]]]);
    return out;
  }
  function buttonFace(text, bg, w, h) {               // a button's front: white text on its color
    const k = 8, c = document.createElement("canvas");
    c.width = w * k; c.height = h * k;
    const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f4f4f4"; g.font = `${Math.min(h * 0.5, w / (text.length * 0.72)) * k}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, c.width / 2, c.height * 0.54);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function plateLabels(top, bot) {                    // a 72 x 116 mm cover plate's printed labels, clear elsewhere
    const k = 6, c = document.createElement("canvas");
    c.width = 72 * k; c.height = 116 * k;
    const g = c.getContext("2d");
    g.fillStyle = "#1b1c1f"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, z] of [[top, 12], [bot, 104]]) {
      g.font = `bold ${Math.min(7, 62 / (t.length * 0.68)) * k}px sans-serif`;
      g.fillText(t, c.width / 2, z * k);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function stopFace() {                               // the paddle's front: white STOP on red
    const k = 6, c = document.createElement("canvas");
    c.width = 74 * k; c.height = 58 * k;
    const g = c.getContext("2d");
    g.fillStyle = "#c70f0c"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f4f4f4"; g.font = `bold ${21 * k}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("STOP", c.width / 2, c.height * 0.58);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function toggleLever() {                           // a toggle's handle: a flat lever, 9 wide, tapering 7 -> 4.5 thick to a
    const sh = new THREE.Shape();                     // rounded tip 17 out; side profile (out, z) extruded across X, base at 0
    sh.moveTo(0, -3.5); sh.lineTo(14.75, -2.25); sh.absarc(14.75, 0, 2.25, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(0, 3.5); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 7.6, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.6, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -3.8);
    return g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));   // out -> -Y, z -> Z, width -> X
  }
  function togglePlateFace() {                       // the toggle plate's front: brushed steel, the two slots, labels
    const k = 4, [pc, pw, ph] = SWP.plate, c = document.createElement("canvas");
    c.width = pw * k; c.height = ph * k;
    const g = c.getContext("2d"), X = (x) => (x - pc + pw / 2) * k, Z = (z) => (ph / 2 - z) * k;
    g.fillStyle = "#b9bcc0"; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
    for (let y = 0; y < c.height; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    g.fillStyle = "#16171a"; g.textAlign = "center"; g.textBaseline = "middle";
    if (SWP.panel) { g.font = `bold ${5 * k}px sans-serif`; g.fillText("POWER", X(SWP.lamp), Z(38)); }   // (the hub's 3-gang: the lamp's gang)
    for (const [x, t] of [[SWP.router, "ROUTER"], [SWP.vac, "VAC"]]) {
      g.fillRect(X(x) - 5 * k, Z(12.5), 10 * k, 25 * k);   // the slot
      g.font = `bold ${5 * k}px sans-serif`; g.fillText(t, X(x), Z(38));
      g.font = `${3.6 * k}px sans-serif`; g.fillText("ON", X(x), Z(19)); g.fillText("OFF", X(x), Z(-19));
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function switchPanelPlace() {                       // the hub option changed: the panel rebuilt (on the table's front / under it)
    if (SWP.cx === undefined) return;
    if (selected && /^SwitchPanel_/.test(selected.userData.name || "")) select(null);
    meshes = meshes.filter((m) => {
      if (!/^SwitchPanel_/.test(m.userData.name || "")) return true;
      scene.remove(m); m.geometry.dispose(); m.material.dispose();
      return false;
    });
    for (const [geo, mat, ud] of switchPanelMeshes()) addMesh(geo, mat, ud);
    if (typeof applyVisibility === "function") applyVisibility();
  }
  function switchFace() {                             // the panel's face: 4 px a mm, centre = the panel's centre
    const k = 4, c = document.createElement("canvas");
    c.width = SWP.w * k; c.height = SWP.h * k;
    const g = c.getContext("2d"), X = (x) => (x + SWP.w / 2) * k, Z = (z) => (SWP.h / 2 - z) * k;
    g.fillStyle = "#232325"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f5c400"; g.beginPath(); g.arc(X(SWP.estop), Z(0), 32 * k, 0, 2 * Math.PI); g.fill();   // the yellow disc
    g.fillStyle = "#111"; g.font = `bold ${5 * k}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const arc = (text, r, a0, dir) => {               // text round the disc (dir 1: over the top, -1: under)
      const step = 0.205 * dir, n = text.length;
      [...text].forEach((ch, i) => {
        const a = a0 + (i - (n - 1) / 2) * step;
        g.save(); g.translate(X(SWP.estop) + dir * r * k * Math.sin(a), Z(0) - dir * r * k * Math.cos(a)); g.rotate(a);   // left to right either way
        g.fillText(ch, 0, 0); g.restore();
      });
    };
    arc("EMERGENCY", 26.5, 0, 1);
    arc("STOP", 26.5, 0, -1);
    g.fillStyle = "#e8e8e8"; g.font = `bold ${4.2 * k}px sans-serif`;
    g.fillText("POWER", X(SWP.lamp), Z(-27));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  loadPendant();
  function rebuild() {
    clearMachine();
    updatePlatePolys();
    let tris = 0;
    const inst = LR4Model.instances(cfg, S);
    const missing = new Set();                       // the parts drawn as stand-ins (their names and ref names)
    for (const o of inst) {
      // Part 33: the table is drawn from table_model.js (tableMeshes); the size builds' own table parts are left out
      // (TableMDF before the 2026-10-26 refresh, TableBase / Spoilboard / RailStrip_* after)
      if (o.name === "TableMDF" || TABLE_PART.test(o.name)) continue;
      if (/^Router_/.test(o.name)) continue;          // the router + its bit: the page's own (router.js rtMeshes, Part 45b)
      const g = recGeometry(o.rec);
      if (!g) {
        const sg = standInGeo(o.rec);
        if (sg) {
          const ud = Object.assign({}, o.rec.meta, { name: o.name, base: { t: o.t, s: o.s }, standin: true, ownGeo: true,
            label: `${o.name !== o.rec.meta.name ? pretty(o.name) : o.rec.meta.label} (file missing)` });
          delete ud.variant; delete ud.finish;
          addMesh(sg, material([0.62, 0.64, 0.66], null), ud);
          missing.add(o.name).add(o.rec.meta.name);
        }
        continue;
      }
      const { geo, fin, hasUV, tris: n } = g;
      const ud = Object.assign({}, o.rec.meta, { name: o.name, base: { t: o.t, s: o.s } }, g.ud);
      if (mountAlt(o.rec.src)) ud.label = ud.label.replace("Kobalt", MOUNT_NAME[mountNow()]);   // the router's mount set (Part 45c)
      if (DUST_PARTS.test(o.name)) ud.group = "Shoe";   // own toggle, so the bit shows with the hose on (user 2026-10-20)
      if (o.rec.src) delete ud.variant;              // Peter Plates from files: the style picks the geometry
      if (o.name !== o.rec.meta.name) { ud.label = pretty(o.name); ud.ref = o.rec.meta.name; }
      const mat = ud.source === "printed" && !fin ? printedMaterial(ud.color, printFrame(o.rec.src)) : material(ud.color, fin, hasUV);
      if (o.rec.src && o.rec.src.kind === "peter" && mat.userData.print) bedOutside(mat, geo, o.name);
      if (ud.clip) { ud.clip = Object.assign({}, ud.clip, { p: o.clipP }); mat.clippingPlanes = [new THREE.Plane()]; }
      addMesh(geo, mat, ud);
      tris += n;
    }
    if (missing.size) {                              // the hardware joined to a missing part hides with it (its threads too)
      const off = new Set();
      for (const m of meshes) if (m.userData.joins && m.userData.joins.some((n) => missing.has(n))) { m.userData.missingHw = true; off.add(m.userData.name); }
      for (const m of meshes) if (m.userData.of && off.has(m.userData.of)) m.userData.missingHw = true;
    }
    for (const { rec, geo } of S.struts === "temp" ? [] : plateMeshes()) {   // temp struts: no MDF plates yet
      addMesh(geo, material(rec.meta.color, null), Object.assign({}, rec.meta, { name: rec.key, ownGeo: true }));
      tris += geo.attributes.position.count / 3;
    }
    for (const [geo, ud] of tableMeshes()) addMesh(geo, material(ud.color, null, false, ud.grain), ud);
    for (const [geo, ud] of legMeshes()) addMesh(geo, material(ud.color, null, false, ud.grain), ud);
    for (const [geo, mat, ud] of pendantMeshes()) addMesh(geo, mat, ud);
    for (const [geo, mat, ud] of switchPanelMeshes()) addMesh(geo, mat, ud);
    for (const [geo, mat, ud] of hubMeshes()) addMesh(geo, mat, ud);
    if (typeof rtMeshes === "function") for (const [geo, mat, ud] of rtMeshes(inst)) addMesh(geo, mat, ud);
    meta = { cut_in: [S.cutX / IN, S.cutY / IN], travel: LR4Model.travel(cfg, S), tip_above_table: cfg.tip_above_table,
      hose: LR4Model.hose(cfg, S, inst), table_mm: [S.TW, S.TL], bom: cfg.bom_ref, peter_style: cfg.peter_style, parts: meshes,
      triangles: tris };
    if (meta.hose && typeof rtHose === "function") rtHose(meta.hose);   // the cord leaves where this router's does
    if (meta.hose) makeHose();
    assignRoles();
    applyColours();
    applyVisibility();
    updateSliders();
    renderBom();
    updateShop();
    if (typeof powerLook === "function") powerLook();   // the switch panel as the power is (power.js, Part 44f)
    if (typeof rtLook === "function") rtLook();       // the router's speed dial, numbered and turned (router.js, Part 45a)
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
      scenery = MS.get("lr4-scenery") || "shop";
      Object.assign(ROOM, JSON.parse(MS.get("lr4-room") || "{}"));
    } catch (e) { /* defaults */ }
    const box = document.getElementById("scenery");
    const mark = () => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === scenery)));
      document.getElementById("room-box").hidden = scenery === "plain";
    };
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      scenery = b.dataset.v;
      try { MS.set("lr4-scenery", scenery); } catch (e) { /* not kept */ }
      mark(); updateShop();
    }));
    for (const k of ["w", "d", "h"]) document.getElementById("room-" + k).addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      ROOM[k] = isFinite(v) && v > 0 ? v * roomU() : 0;
      try { MS.set("lr4-room", JSON.stringify(ROOM)); } catch (err) { /* not kept */ }
      updateShop();
    });
    ["u-in", "u-mm"].forEach((id) => document.getElementById(id).addEventListener("click", () => { fillRoom(); fillTop(); updateShop(); }));
    const topEl = document.getElementById("table-top");
    const fillTop = () => (topEl.value = +(U.unit === "in" ? tableTop / IN : tableTop).toFixed(U.unit === "in" ? 2 : 0));
    topEl.addEventListener("change", () => {
      const v = parseFloat(topEl.value), mm = v * (U.unit === "in" ? IN : 1);
      if (!(mm >= 300 && mm <= 1500)) { fillTop(); return; }   // 12 - 59 in
      tableTop = mm;
      try { MS.set("lr4-table-top", String(mm)); } catch (e) { /* not kept */ }
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
      shop.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; if (o.material.isMeshStandardMaterial) envLow(o.material); } });
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
    touchAlt = await fetch(lr4v(DATA + "touch_alt.json")).then((q) => (q.ok ? q.json() : null)).catch(() => null);   // Part 50
    const total = cfg.geometry_bytes || 0;             // gzip of the meshes (fit_config.py / share_data.py)
    let got = 0;
    const raw = await fetchBytes(lr4v(DATA + "lr4_config_geometry.bin.gz"), (n) => { got += n;
      progress("Downloading geometry…", total ? got / total : null, total ? `${MB(got)} of ${MB(total)}` : MB(got)); });
    progress("Unpacking…", 1, "gzip");
    await nextFrame();
    bin = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const dev = cfg.files && new URLSearchParams(location.search).get("parts");   // testing: fetch the files from a folder URL
    if (cfg.files) await setupFiles();
    if (dev) await devFiles(dev);
    // the build in named stages, the popup saying which (user 2026-10-23: it sat on "Building the machine" for seconds)
    const stages = [
      ["Setting up the panels", () => { setupShow(); setupColours(); setupDetail(); }],
      ["Preparing the part meshes", warmGeometry],
      [`Placing the ${cfg.parts.length} parts`, setupSize],
      ["Bill of materials", () => { setupVariants(); setupBristles(); setupBom(); setupAbout(); }],
      ["Workshop and lights", () => { setupScenery(); setupLighting(); updateShop(); fitView([1, -1.15, 0.85]); }],
      ["Compiling shaders (first frame)", async () => { lighting(); await renderer.compileAsync(scene, camera);
        if (typeof shaderKeepers === "function") await renderer.compileAsync(shaderKeepers(), camera, scene);   // job.js: the job's bit / stock + heat FX, kept
        renderer.render(scene, camera); }]];   // compileAsync: the programs in parallel (KHR_parallel_shader_compile), the page not frozen meanwhile
    const times = window.LR4LoadTimes = [["Download + unpack", performance.now()]];   // ms per stage (tools/three_shots.js)
    for (const [i, [what, run]] of stages.entries()) {
      progress("Building the machine…", i / stages.length, what);
      await nextFrame();
      const t = performance.now();
      await run((f, detail) => progress("Building the machine…", (i + f) / stages.length, detail));
      times.push([what, performance.now() - t]);
    }
    progress("Building the machine…", 1, "Done");
    building = false;
    await nextFrame();
    statusEl.hidden = true;
    applyLink();
    ctlStartup();                                    // FluidNC boots on the built machine (controller.js)
  }

  // ---- Peter Plates: solid (stepper openings filled) or open honeycomb in a solid border - one shown at a time ----
  let peterStyle = "solid", bristleLen = "std";
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
    try { saved = MS.get("peter-style"); } catch (e) { /* defaults */ }
    peterStyle = saved && have.has(saved) ? saved : (meta.peter_style || "solid");
    const mark = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === peterStyle)));
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      peterStyle = b.dataset.v;
      try { MS.set("peter-style", peterStyle); } catch (e) { /* not kept */ }
      mark();
      applyVisibility();
    }));
    box.hidden = false;
    mark();
    applyVisibility();
  }

  // the bristles' length (user 2026-10-29: standard or extra long): kept; a change rebuilds the two strips
  function setupBristles() {
    const box = document.getElementById("bristle-len");
    if (!cfg.files || !cfg.parts.some((p) => p.src && p.src.long)) return;
    try { bristleLen = MS.get("lr4-bristles") === "long" ? "long" : "std"; } catch (e) { /* default */ }
    const longFile = cfg.parts.find((p) => p.src && p.src.long).src.long.file;
    const mark = () => {
      const have = userFiles.has(longFile);
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === bristleLen)));
      const lb = box.querySelector('[data-v="long"]');
      lb.title = have ? "TPU_Bristles_32mm_Extra_Long: 10 mm longer, for an uneven or deep spoilboard"
        : `Needs ${longFile.split("/").pop()} (tpu-bristles-32mm-extra-long.stl in the Kobalt tool mount files): add it under Parts`;
      document.getElementById("bristle-note").hidden = !(bristleLen === "long" && !have);
    };
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (bristleLen === b.dataset.v) return;
      bristleLen = b.dataset.v;
      try { MS.set("lr4-bristles", bristleLen); } catch (e) { /* not kept */ }
      mark();
      rebuild();
      if (typeof renderBom === "function") renderBom();
    }));
    box.hidden = false;
    mark();
    setupBristles.mark = mark;
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
    try { saved = MS.get("peter-style-files"); } catch (e) { /* defaults */ }
    peterStyle = STYLES.some(([v]) => v === saved) ? saved : "closed";
    const mark = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === peterStyle)));
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (peterStyle === b.dataset.v) return;
      peterStyle = b.dataset.v;
      try { MS.set("peter-style-files", peterStyle); } catch (e) { /* not kept */ }
      mark();
      rebuild();
    }));
    box.hidden = false;
    mark();
    rebuild();
  }

