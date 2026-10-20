// Workshop scenery round the machine: concrete floor, block walls with windows, a half-open roll-up door onto a driveway,
// sky, grass and trees outside, pegboard over a workbench (with a
// printer on it), a shelf of bins, a shop vac and ceiling strip lights. Drawn here only (no V1E or model data), all
// procedural - canvas textures, boxes and cylinders. mm, Z up, the floor at `floor`.
// Walls and ceiling are one-sided, facing in: from outside (the desktop orbit view) the near walls vanish, dollhouse
// style; standing inside (VR at 1:1) it's a room. Not in the configurator's parts: no picking, fit or touch.
// The room is the user's building size (centered on the machine) or, per blank size, the table plus a margin.
//   LR4Shop.room(table, machine, size) -> { x0, x1, y0, y1, h, gaps: { left, right, front, back, top } }
//   LR4Shop.build(THREE, { room, table, machine, floor }) -> THREE.Group; LR4Shop.dispose(group)
//   table / machine: { x0, x1, y0, y1 } (+ machine.z1 = its top above the floor); size: { w, d, h } mm, each optional
(function (root) {
  "use strict";
  const MARGIN = { x: 2600, front: 3200, back: 2400 }, HEIGHT = 3000;     // mm round the table, wall height

  const WALK = 600;                        // mm: a gap narrower than this is flagged (no room to walk past)
  const FURNITURE = { bench: 900, shelf: 700, vac: 700 };   // mm of free floor each needs between machine and its wall

  function room(table, machine, size) {
    const sz = size || {}, cx = (machine.x0 + machine.x1) / 2, cy = (machine.y0 + machine.y1) / 2;
    const [x0, x1] = sz.w > 0 ? [cx - sz.w / 2, cx + sz.w / 2] : [table.x0 - MARGIN.x, table.x1 + MARGIN.x];
    const [y0, y1] = sz.d > 0 ? [cy - sz.d / 2, cy + sz.d / 2] : [table.y0 - MARGIN.front, table.y1 + MARGIN.back];
    const h = sz.h > 0 ? sz.h : HEIGHT;
    return { x0, x1, y0, y1, h, gaps: { left: machine.x0 - x0, right: x1 - machine.x1, front: machine.y0 - y0,
      back: y1 - machine.y1, top: h - (machine.z1 || 0) } };
  }

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function canvasTex(THREE, w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (repeat) t.repeat.set(...repeat);
    return t;
  }

  // ---- textures (one tile each; repeats set per surface from its size in mm) ----
  const TILE = { concrete: 2000, block: 800, peg: 200, door: 610, wood: 1200 };
  function textures(THREE) {
    const r = rng(7);
    return {
      concrete: canvasTex(THREE, 512, 512, (g, w, h) => {
        g.fillStyle = "#8c8d8b"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {                // speckle
          const v = 110 + r() * 60;
          g.fillStyle = `rgba(${v},${v},${v - 4},${0.25 + r() * 0.3})`;
          g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
        }
        for (let i = 0; i < 7; i++) {                   // soft stains
          const x = r() * w, y = r() * h, rad = 30 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, "rgba(70,70,66,0.18)"); gr.addColorStop(1, "rgba(70,70,66,0)");
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        }
        g.strokeStyle = "rgba(60,60,58,0.55)"; g.lineWidth = 2;   // control joint at the tile edge
        g.strokeRect(1, 1, w - 2, h - 2);
      }),
      block: canvasTex(THREE, 512, 512, (g, w, h) => {  // painted CMU: 4 courses of 2 blocks, running bond
        g.fillStyle = "#d8d5ce"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(150,145,135,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
        g.strokeStyle = "#bdb9b0"; g.lineWidth = 5;
        for (let row = 0; row < 4; row++) {
          const y = row * h / 4;
          g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
          for (let k = 0; k < 3; k++) {
            const x = ((k + (row % 2) * 0.5) * w / 2) % w;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h / 4); g.stroke();
          }
        }
      }),
      peg: canvasTex(THREE, 256, 256, (g, w, h) => {   // 8 x 8 holes at 25 mm
        g.fillStyle = "#b08658"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#3b2c1d";
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          g.beginPath(); g.arc((i + 0.5) * w / 8, (j + 0.5) * h / 8, 3.2, 0, Math.PI * 2); g.fill();
        }
      }),
      door: canvasTex(THREE, 256, 256, (g, w, h) => {  // one roll-up door section
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, "#e9eaea"); gr.addColorStop(0.92, "#d9dadb"); gr.addColorStop(1, "#9fa2a5");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(150,153,156,0.6)"; g.lineWidth = 2;
        for (const y of [0.3, 0.62]) { g.beginPath(); g.moveTo(0, y * h); g.lineTo(w, y * h); g.stroke(); }
      }),
      sky: (() => {                                     // dome: v = 0 at the bottom pole, 0.5 at the horizon
        const t = canvasTex(THREE, 4, 256, (g, w, h) => {
          const gr = g.createLinearGradient(0, 0, 0, h);   // canvas top = v 1 = zenith
          gr.addColorStop(0, "#5f93cf"); gr.addColorStop(0.42, "#a9c8e8"); gr.addColorStop(0.5, "#e4edf3");
          gr.addColorStop(0.53, "#b9c2b0"); gr.addColorStop(1, "#7d8a6e");
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        });
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
      })(),
      grass: canvasTex(THREE, 256, 256, (g, w, h) => {
        g.fillStyle = "#5f7d43"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6000; i++) {
          g.fillStyle = `rgba(${60 + r() * 50},${95 + r() * 50},${40 + r() * 25},${0.35 + r() * 0.4})`;
          g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3);
        }
      }),
      wood: canvasTex(THREE, 512, 128, (g, w, h) => {  // bench top grain along u
        g.fillStyle = "#c79b66"; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 160; i++) {
          g.strokeStyle = `rgba(${120 + r() * 40},${80 + r() * 30},${40 + r() * 20},${0.15 + r() * 0.25})`;
          g.lineWidth = 0.6 + r() * 1.4;
          const y = r() * h;
          g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 8 - 4, w * 0.7, y + r() * 8 - 4, w, y); g.stroke();
        }
      }),
    };
  }

  function build(THREE, o) {
    const grp = new THREE.Group();
    grp.name = "workshop";
    const T = textures(THREE), r = rng(11);
    const R = o.room, X0 = R.x0, X1 = R.x1, Y0 = R.y0, Y1 = R.y1, Z0 = o.floor, HEIGHT = R.h, g = R.gaps;
    const W = X1 - X0, D = Y1 - Y0;
    const std = (p) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, p));
    const tex = (t, u, v) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(u, v); return c; };
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz, "ZYX");
      grp.add(m);
      return m;
    };
    // a box w (x) x d (y) x h (z), centered on x, y, standing on z
    const box = (w, d, h, x, y, z, mat, rz = 0) => add(new THREE.BoxGeometry(w, d, h), mat, x, y, z + h / 2, 0, rz);

    const steel = std({ color: 0x3d4247, roughness: 0.55, metalness: 0.6 });
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    grp.userData.walls = [];

    // back wall: workbench under a pegboard, a printer on the bench
    const benchW = Math.min(2400, W - 1600), benchX = X0 + 700 + benchW / 2, benchD = 700, benchY = Y1 - benchD / 2 - 20;
    const benchOn = g.back >= FURNITURE.bench && benchW > 800;
    if (benchOn) {
      box(benchW, benchD, 45, benchX, benchY, Z0 + 860, std({ map: tex(T.wood, benchW / TILE.wood, 1) }));
      for (const dx of [-1, 1]) for (const dy of [-1, 1])
        box(50, 50, 860, benchX + dx * (benchW / 2 - 60), benchY + dy * (benchD / 2 - 60), Z0, steel);
      box(benchW - 120, benchD - 120, 20, benchX, benchY, Z0 + 150, std({ color: 0x6b5a45 }));    // lower shelf
      add(new THREE.PlaneGeometry(benchW, 1200), std({ map: tex(T.peg, benchW / TILE.peg, 1200 / TILE.peg) }),
        benchX, Y1 - 12, Z0 + 1050 + 600, Math.PI / 2, 0);
      const toolMat = [std({ color: 0xc8241b, roughness: 0.5 }), std({ color: 0x2b2f33, roughness: 0.5 }),
        std({ color: 0xa9adb1, metalness: 0.8, roughness: 0.35 })];
      for (let i = 0; i < Math.floor(benchW / 260); i++) {   // hanging tools: handles + heads
        const x = benchX - benchW / 2 + 180 + i * 260, len = 220 + r() * 160;
        box(26, 24, len, x, Y1 - 30, Z0 + 1550 - len / 2 + r() * 200, toolMat[i % 3]);
        if (i % 2) box(110, 26, 40, x, Y1 - 30, Z0 + 1550 + r() * 200 + 60, toolMat[2]);
      }
      const px = benchX + benchW / 2 - 260;                  // a P1S-sized printer
      box(390, 410, 470, px, benchY, Z0 + 905, std({ color: 0x1d1f21, roughness: 0.4 }));
      box(330, 4, 380, px, benchY - 207, Z0 + 905 + 50, std({ color: 0x223040, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }));
      box(150, 120, 200, benchX - benchW / 2 + 200, benchY + 40, Z0 + 905, toolMat[0]);   // a toolbox
    }

    // left wall: a steel shelf of bins
    const shW = Math.min(1800, D - 2000), shX = X0 + 250, shY = Y1 - 900 - shW / 2;
    const shelfOn = g.left >= FURNITURE.shelf && shW > 600 && HEIGHT > 2100;
    if (shelfOn) {
      for (const dy of [-1, 1]) for (const dx of [-1, 1]) box(35, 35, 2000, shX + dx * 210, shY + dy * (shW / 2 - 20), Z0, steel);
      const binCols = [0x2f6db5, 0xd8a31a, 0x3e8e4f, 0xc8241b, 0x6b6f74];
      for (let s = 0; s < 4; s++) {
        const z = Z0 + 120 + s * 600;
        box(450, shW, 18, shX, shY, z, steel);
        for (let k = 0; k < Math.floor(shW / 330); k++)
          if (r() > 0.2) box(380, 280, 180 + r() * 120, shX, shY - shW / 2 + 180 + k * 330, z + 18,
            std({ color: binCols[Math.floor(r() * binCols.length)], roughness: 0.6 }));
      }
    }

    // right wall: a shop vac (low, so the windows above it stay)
    const vx = X1 - 450, vy = Math.max(Y0 + 400, Y1 - 1200);
    if (g.right >= FURNITURE.vac) {
      add(new THREE.CylinderGeometry(230, 210, 520, 32), std({ color: 0xc8241b, roughness: 0.45 }), vx, vy, Z0 + 60 + 260, Math.PI / 2);
      add(new THREE.CylinderGeometry(240, 240, 140, 32), std({ color: 0x2b2f33, roughness: 0.5 }), vx, vy, Z0 + 580 + 70, Math.PI / 2);
      for (const a of [0, 1, 2, 3]) add(new THREE.CylinderGeometry(30, 30, 50, 12), steel,
        vx + Math.cos(a * Math.PI / 2) * 180, vy + Math.sin(a * Math.PI / 2) * 180, Z0 + 25, Math.PI / 2);
    }

    // floor and ceiling (face in)
    add(new THREE.PlaneGeometry(W, D), std({ map: tex(T.concrete, W / TILE.concrete, D / TILE.concrete), roughness: 0.92 }), cx, cy, Z0);
    add(new THREE.PlaneGeometry(W, D), std({ color: 0xe9e9e6 }), cx, cy, Z0 + HEIGHT, Math.PI);

    // walls with openings: each is a shape in its own (u along the wall, v up) frame, turned into place. u runs
    // +X on the back wall, +Y on the left, -Y on the right, -X on the front (so every wall faces in)
    const WIN = { w: Math.min(1200, W / 4, D / 4), sill: 1000, top: Math.min(2200, HEIGHT - 350), every: 2400 };
    const doorW = Math.max(800, Math.min(2900, W - 1200)), doorH = Math.min(2400, HEIGHT - 300), doorOpen = 0.55;
    const walls = [   // [length, center x, y, rz, world-axis -> u, blocked [a0, a1] in world axis coordinates]
      { len: W, x: cx, y: Y1, rz: 0, u: (a) => a - cx, axis: "x", blocked: benchOn ? [[benchX - benchW / 2 - 200, benchX + benchW / 2 + 200]] : [] },
      { len: D, x: X0, y: cy, rz: Math.PI / 2, u: (a) => a - cy, axis: "y", blocked: shelfOn ? [[shY - shW / 2 - 200, shY + shW / 2 + 200]] : [] },
      { len: D, x: X1, y: cy, rz: -Math.PI / 2, u: (a) => cy - a, axis: "y", blocked: [] },
      { len: W, x: cx, y: Y0, rz: Math.PI, u: (a) => cx - a, axis: "x", blocked: [[cx - doorW / 2 - 300, cx + doorW / 2 + 300]], door: true },
    ];
    const frameMat = std({ color: 0xf2f2ee, roughness: 0.6 }), glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ef,
      roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    for (const wl of walls) {
      const a0 = (wl.axis === "x" ? X0 : Y0), a1 = (wl.axis === "x" ? X1 : Y1);
      const holes = [];                                   // [u0, v0, u1, v1] in the wall's frame
      if (WIN.top - WIN.sill > 500) {
        const n = Math.max(1, Math.floor((a1 - a0 - 1000) / WIN.every));
        for (let i = 0; i < n; i++) {
          const c = a0 + (a1 - a0) * (i + 0.5) / n;
          if (wl.blocked.some(([b0, b1]) => c + WIN.w / 2 > b0 && c - WIN.w / 2 < b1)) continue;
          const u = wl.u(c);
          holes.push([u - WIN.w / 2, WIN.sill, u + WIN.w / 2, WIN.top]);
        }
      }
      if (wl.door) holes.push([-doorW / 2, 0, doorW / 2, doorH]);
      const L = wl.len / 2, sh = new THREE.Shape([new THREE.Vector2(-L, 0), new THREE.Vector2(L, 0),
        new THREE.Vector2(L, HEIGHT), new THREE.Vector2(-L, HEIGHT)]);
      for (const [u0, v0, u1, v1] of holes) if (v0 > 0)   // the door reaches the floor: cut it as a notch instead
        sh.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, v0)]));
      let shape = sh;
      if (wl.door) shape = new THREE.Shape([new THREE.Vector2(-L, 0), new THREE.Vector2(-doorW / 2, 0), new THREE.Vector2(-doorW / 2, doorH),
        new THREE.Vector2(doorW / 2, doorH), new THREE.Vector2(doorW / 2, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, HEIGHT),
        new THREE.Vector2(-L, HEIGHT)]), shape.holes = sh.holes;
      const geo = new THREE.ShapeGeometry(shape);         // its uv = (u, v) in mm
      const wall = add(geo, std({ map: tex(T.block, 1 / TILE.block, 1 / TILE.block) }), wl.x, wl.y, Z0, Math.PI / 2, wl.rz);
      grp.userData.walls.push({ wall, x: wl.x, y: wl.y, n: [Math.sin(wl.rz), -Math.cos(wl.rz)] });   // n = into the room
      // frames and glass: children of the wall, in its (u, v, out-of-wall) frame; z > 0 is inside
      for (const [u0, v0, u1, v1] of holes) {
        if (v0 === 0) continue;
        const fb = (w, h, u, v) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 160), frameMat); m.position.set(u, v, 0); wall.add(m); };
        fb(u1 - u0 + 120, 60, (u0 + u1) / 2, v0 - 30); fb(u1 - u0 + 120, 60, (u0 + u1) / 2, v1 + 30);
        fb(60, v1 - v0, u0 - 30, (v0 + v1) / 2); fb(60, v1 - v0, u1 + 30, (v0 + v1) / 2);
        fb(40, v1 - v0, (u0 + u1) / 2, (v0 + v1) / 2); fb(u1 - u0, 40, (u0 + u1) / 2, (v0 + v1) / 2);   // mullions
        fb(u1 - u0 + 160, 30, (u0 + u1) / 2, v0 - 75);    // sill
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, v1 - v0), glass);
        gl.position.set((u0 + u1) / 2, (v0 + v1) / 2, 0);
        wall.add(gl);
      }
      if (wl.door) {                                       // the roll-up door, half open: the top part of the opening
        const dh = doorH * (1 - doorOpen), dm = new THREE.Mesh(new THREE.PlaneGeometry(doorW, dh),
          std({ map: tex(T.door, 1, dh / TILE.door), roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
        dm.position.set(0, doorH - dh / 2, 30);
        wall.add(dm);
        const fb = (w, h, u, v) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 160), frameMat); m.position.set(u, v, 0); wall.add(m); };
        fb(80, doorH, -doorW / 2 - 40, doorH / 2); fb(80, doorH, doorW / 2 + 40, doorH / 2); fb(doorW + 160, 80, 0, doorH + 40);
      }
    }

    // outside: sky dome, grass, a driveway from the door, a few trees - something to see through the windows
    const OUT = 15000;                                  // inside the desktop camera's far plane (20 m)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(OUT, 32, 16), new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide,
      toneMapped: false, depthWrite: false }));
    sky.rotation.x = Math.PI / 2;                       // the dome's pole up Z
    sky.position.set(cx, cy, Z0);
    grp.add(sky);
    add(new THREE.CircleGeometry(OUT, 64), std({ map: tex(T.grass, OUT / 1500, OUT / 1500), roughness: 1 }), cx, cy, Z0 - 8);
    const drive = Math.min(9000, OUT - (cy - Y0) - 2000);
    add(new THREE.PlaneGeometry(doorW + 1200, drive), std({ map: tex(T.concrete, (doorW + 1200) / TILE.concrete, drive / TILE.concrete), roughness: 0.95 }),
      cx, Y0 - drive / 2, Z0 - 3);
    const trunk = std({ color: 0x6b4a2f }), leaves = [std({ color: 0x3f6b3a }), std({ color: 0x4d7d3f }), std({ color: 0x365d33 })];
    for (let i = 0; i < 14; i++) {
      const ang = r() * Math.PI * 2, dist = Math.min(OUT - 1500, Math.max(W, D) / 2 + 3500 + r() * 7000);
      const tx = cx + Math.cos(ang) * dist, ty = cy + Math.sin(ang) * dist;
      if (ty < Y0 && Math.abs(tx - cx) < doorW + 2000) continue;   // keep the driveway clear
      const ht = 4000 + r() * 5000;
      add(new THREE.CylinderGeometry(120, 180, ht * 0.35, 8), trunk, tx, ty, Z0 + ht * 0.175, Math.PI / 2);
      add(new THREE.ConeGeometry(ht * 0.22, ht * 0.75, 10), leaves[i % 3], tx, ty, Z0 + ht * 0.6, Math.PI / 2);
    }

    // ceiling: strip lights over the table, about 1.2 m apart
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfdfcf7 }), lampHousing = std({ color: 0xd0d2d4, roughness: 0.4 });
    const t = o.table, nx = Math.max(2, Math.round((t.x1 - t.x0) / 1200) + 1), ny = Math.max(2, Math.round((t.y1 - t.y0) / 1200));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = Math.min(X1 - 100, Math.max(X0 + 100, t.x0 + (t.x1 - t.x0) * i / (nx - 1)));
      const y = Math.min(Y1 - 650, Math.max(Y0 + 650, t.y0 + (t.y1 - t.y0) * (j + 0.5) / ny));
      box(120, 1220, 60, x, y, Z0 + HEIGHT - 60, lampHousing);
      box(90, 1180, 4, x, y, Z0 + HEIGHT - 64, lightMat);
    }
    return grp;
  }

  // dollhouse cutaway: a wall the camera is outside of is hidden with its frames, glass and door (the wall itself is
  // one-sided anyway; this takes the solid bits that would block the view)
  function cutaway(grp, cam) {
    for (const w of grp.userData.walls || []) w.wall.visible = (cam.x - w.x) * w.n[0] + (cam.y - w.y) * w.n[1] > 0;
  }

  function dispose(grp) {
    grp.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry.dispose();
      if (m.material.map) m.material.map.dispose();
      m.material.dispose();
    });
  }

  const out = { build, dispose, room, cutaway, MARGIN, HEIGHT, WALK };
  if (typeof module !== "undefined" && module.exports) module.exports = out;
  else root.LR4Shop = out;
})(typeof self !== "undefined" ? self : this);
