// Workshop scenery round the machine, laid out like the user's own shop (2026-10-21): a 16 x 20 ft building, an 8' 4"
// ceiling, a 6/12 gable roof; the machine centered with its long (Y) side down the 20 ft length, its home (front, -Y)
// toward the bench end. Bench end (-Y): one small window in the middle, set high, a 6 ft workbench in each corner under
// pegboard: the tools on the one nearest the entry door, a computer (two monitors, a mini PC, a drafting chair) on
// the other. Garage end (+Y): an 8 x 7 ft sectional door, open on its ceiling tracks, onto a driveway. Front long wall
// (+X): window, entry door, window (tops at the door's), a fire extinguisher by the door. Back long wall (-X): no
// windows, a 4 ft steel shelf (5 shelves of bins) a few feet from the benches. A shop vac by the garage door, four 4 ft
// strip lights on the ceiling (one along each bench, two along the shop over the machine). Inside: OSB walls (user:
// bare studs now, OSB going on), concrete floor. Outside: lap siding in grey-green "Scottish Thistle", white trim and
// corner boards, architectural shingles; sky and grass. Drawn here only (no V1E or model data), all
// procedural - canvas textures, boxes, planes. mm, Z up, the floor at `floor`.
// Inside walls and the ceiling are one-sided, facing in; each wall has an outside skin WALL_T further out, facing out.
// cutaway(): the sky and grass round the camera, inside its far plane; from close by (the desktop orbit view) the walls the camera is outside of vanish with the roof, dollhouse
// style; from far away (past CLOSE_AT x the building's diagonal) it's the closed building; standing inside (VR at 1:1)
// it's a room. Not in the page's parts: no picking, fit or touch.
// The room is the user's building size (centered on the machine), blank = DEFAULT.
//   LR4Shop.room(table, machine, size) -> { x0, x1, y0, y1, h, gaps: { left, right, front, back, top } }
//   LR4Shop.build(THREE, { room, table, machine, floor, empty }) -> THREE.Group (empty: no benches, pegboard, computer,
//   shelf or shop vac - the building, doors, windows, lights and fire extinguisher only); LR4Shop.dispose(group); LR4Shop.cutaway(group, cam, far)
//   table / machine: { x0, x1, y0, y1 } (+ machine.z1 = its top above the floor); size: { w, d, h } mm, each optional
(function (root) {
  "use strict";
  const FT = 304.8;
  const DEFAULT = { w: 16 * FT, d: 20 * FT, h: 100 * 25.4 };   // the user's shop: X across, Y along, ceiling 8' 4"
  const HEIGHT = DEFAULT.h;
  const WALK = 600;                        // mm: a gap narrower than this is flagged (no room to walk past)
  const FURNITURE = { bench: 900, shelf: 700, vac: 700 };   // mm of free floor each needs between machine and its wall
  const WALL_T = 150, PITCH = 6 / 12, EAVE = 300, RAKE = 250;   // wall thickness, roof slope, overhangs
  const CLOSE_AT = 1.15;                   // camera this many building diagonals from its center: the closed building

  function room(table, machine, size) {
    const sz = size || {}, cx = (machine.x0 + machine.x1) / 2, cy = (machine.y0 + machine.y1) / 2;
    const w = sz.w > 0 ? sz.w : DEFAULT.w, d = sz.d > 0 ? sz.d : DEFAULT.d, h = sz.h > 0 ? sz.h : DEFAULT.h;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
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

  // texture tile sizes (mm); siding: 4 courses of 4" (the canvas' v = up); shingles: 4 courses of 5 5/8" exposure (u, up
  // the slope) x 1144 mm along the ridge (v); OSB: one 4 x 8 ft sheet
  const TILE = { concrete: 2000, osb: [4 * FT, 8 * FT], peg: 200, wood: 1200, siding: 4 * 101.6, shingle: [4 * 142.9, 1144] };
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
      osb: canvasTex(THREE, 512, 1024, (g, w, h) => {  // one 4 x 8 ft OSB sheet (2.4 mm / px): long wood strands, most
        g.fillStyle = "#c39a63"; g.fillRect(0, 0, w, h); // along the sheet's 8 ft (canvas y), in layers; a seam round it
        const tones = [[222, 186, 128], [204, 164, 104], [188, 146, 88], [230, 200, 146], [172, 128, 74], [214, 176, 118]];
        for (let i = 0; i < 8000; i++) {
          const t = tones[Math.floor(r() * tones.length)], k = 0.9 + r() * 0.2;
          const len = 15 + r() * 21, wid = 3.5 + r() * 4.5;        // 35-85 x 8-19 mm
          const ang = (r() < 0.8 ? (r() - 0.5) * 0.9 : r() * Math.PI) + Math.PI / 2;   // mostly along y
          const x = r() * w, y = r() * h, ca = Math.cos(ang), sa = Math.sin(ang);
          const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
          const e0 = (r() - 0.5) * wid, e1 = (r() - 0.5) * wid;     // ragged, slanted ends
          const pts = [P(-len / 2 + e0, -wid / 2), P(len / 2 + e1, -wid / 2 * (0.7 + r() * 0.3)),
            P(len / 2 - e1, wid / 2), P(-len / 2 - e0, wid / 2 * (0.7 + r() * 0.3))];
          g.beginPath(); g.moveTo(...pts[0]); for (const q of pts.slice(1)) g.lineTo(...q); g.closePath();
          g.fillStyle = `rgba(${Math.round(t[0] * k)},${Math.round(t[1] * k)},${Math.round(t[2] * k)},${0.8 + r() * 0.2})`;
          g.fill();
          g.strokeStyle = `rgba(110,74,36,${0.25 + r() * 0.25})`; g.lineWidth = 0.8; g.stroke();   // its edge shadow
          if (r() < 0.25) {                              // grain streaks along the strand
            g.strokeStyle = `rgba(150,105,55,${0.2 + r() * 0.2})`; g.lineWidth = 0.6;
            g.beginPath(); g.moveTo(...P(-len / 2.5, (r() - 0.5) * wid * 0.6)); g.lineTo(...P(len / 2.5, (r() - 0.5) * wid * 0.6)); g.stroke();
          }
        }
        for (let i = 0; i < 260; i++) {                  // resin / bark flecks
          g.fillStyle = `rgba(${70 + r() * 40},${45 + r() * 25},${20 + r() * 15},${0.35 + r() * 0.35})`;
          g.fillRect(r() * w, r() * h, 1 + r() * 3, 2 + r() * 6);
        }
        g.strokeStyle = "rgba(70,48,22,0.85)"; g.lineWidth = 2;       // the 1/8" gap to the next sheet
        g.strokeRect(1, 1, w - 2, h - 2);
      }),
      peg: canvasTex(THREE, 256, 256, (g, w, h) => {   // 8 x 8 holes at 25 mm
        g.fillStyle = "#b08658"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#3b2c1d";
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          g.beginPath(); g.arc((i + 0.5) * w / 8, (j + 0.5) * h / 8, 3.2, 0, Math.PI * 2); g.fill();
        }
      }),
      siding: canvasTex(THREE, 256, 256, (g, w, h) => {   // vinyl lap siding, "Scottish Thistle" (the user's: a light
        // grey-green, from a photo of it): a shadow line under each course
        for (let k = 0; k < 4; k++) {
          const y0 = k * h / 4, gr = g.createLinearGradient(0, y0, 0, y0 + h / 4);   // canvas y down = wall v down
          gr.addColorStop(0, "#a7aca9"); gr.addColorStop(0.1, "#b8bdb9"); gr.addColorStop(1, "#b1b6b2");
          g.fillStyle = gr; g.fillRect(0, y0, w, h / 4);
          g.fillStyle = "rgba(68,74,70,0.55)"; g.fillRect(0, y0 + h / 4 - 3, w, 3);
        }
        for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(119,125,121,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 6, 1); }
      }),
      shingle: canvasTex(THREE, 512, 1024, (g, w, h) => {   // architectural (laminated) shingles, 4 courses up the slope
        // (canvas x; the course's bottom edge at its low x) by 1144 mm along the ridge (canvas y): random-width tabs in
        // blended greys over a darker bottom layer that shows between them and below their ragged ends, the next
        // course's shadow along each course's top, granules
        const cw = w / 4, greys = [[78, 82, 88], [92, 96, 101], [66, 70, 75], [104, 106, 108], [84, 82, 80], [72, 76, 84]];
        g.fillStyle = "#2c2f33"; g.fillRect(0, 0, w, h);
        const rect = (x, y, rw, rh) => { g.fillRect(x, y, rw, rh); if (y + rh > h) g.fillRect(x, y - h, rw, rh); };
        for (let k = 0; k < 4; k++) {
          const x0 = k * cw;
          let y = r() * 40;
          while (y < h) {
            const tw = 60 + r() * 130, drop = r() < 0.55 ? 6 + r() * 22 : 0;   // tab width; a short tab shows the layer below
            const c = greys[Math.floor(r() * greys.length)], f = 0.9 + r() * 0.2;
            g.fillStyle = `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;
            rect(x0 + drop, y, cw - drop, tw - 3);
            for (let i = 0; i < tw * 5; i++) {           // granules
              const v = r() < 0.5 ? 40 + r() * 30 : 120 + r() * 50;
              g.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.25 + r() * 0.35})`;
              rect(x0 + drop + r() * (cw - drop), y + r() * (tw - 3), 1 + r() * 1.5, 1 + r() * 1.5);
            }
            y += tw;
            if (y >= h) break;
          }
          const x1 = x0 + cw, gr = g.createLinearGradient(x1, 0, x1 - 10, 0);   // the next course's butt edge shadows
          gr.addColorStop(0, "rgba(10,11,13,0.75)"); gr.addColorStop(1, "rgba(10,11,13,0)");   // the top of this one
          g.fillStyle = gr; g.fillRect(x1 - 10, 0, 10, h);
        }
      }),
      sky: (() => {                                     // dome: v = 0 at the bottom pole, 0.5 at the horizon
        const t = canvasTex(THREE, 4, 256, (g, w, h) => {
          const gr = g.createLinearGradient(0, 0, 0, h);   // canvas top = v 1 = zenith
          gr.addColorStop(0, "#5f93cf"); gr.addColorStop(0.42, "#a9c8e8"); gr.addColorStop(0.5, "#e4edf3");
          gr.addColorStop(0.508, "#698748"); gr.addColorStop(1, "#678547");   // below: the grass, to the horizon
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
  // whole-door textures (one per door, canvas = the door's face, top up)
  function garageTex(THREE) {                         // white sectional door: 4 sections of 4 raised panels
    return canvasTex(THREE, 512, 448, (g, w, h) => {
      g.fillStyle = "#f3f3f1"; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) {
        const y = row * h / 4;
        g.fillStyle = "rgba(150,152,150,0.8)"; g.fillRect(0, y, w, 3);       // section joint
        const m = w * 0.03, gap = w * 0.02, pw = (w - 2 * m - 3 * gap) / 4;   // equal margins both ends (it's seen mirrored too)
        for (let c = 0; c < 4; c++) {
          const x = m + c * (pw + gap), y0 = y + h / 4 * 0.14, ph = h / 4 * 0.72;
          g.strokeStyle = "rgba(170,172,170,0.9)"; g.lineWidth = 3; g.strokeRect(x, y0, pw, ph);
          g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 2; g.strokeRect(x + 4, y0 + 4, pw - 8, ph - 8);
        }
      }
    });
  }
  function entryTex(THREE) {                          // the user's entry door (photo): white Craftsman - 6 lites (3 x 2)
    return canvasTex(THREE, 256, 576, (g, w, h) => {  // up top, two tall recessed panels below, keypad deadbolt + knob
      g.fillStyle = "#f4f4f2"; g.fillRect(0, 0, w, h);
      const gx = w * 0.17, gy = h * 0.07, gw = w * 0.66, gh = h * 0.2, m = 7;   // the lites + muntins
      g.fillStyle = "#2c3540"; g.fillRect(gx, gy, gw, gh);
      g.fillStyle = "#f4f4f2";
      for (const k of [1, 2]) g.fillRect(gx + gw * k / 3 - m / 2, gy, m, gh);
      g.fillRect(gx, gy + gh / 2 - m / 2, gw, m);
      g.strokeStyle = "rgba(160,160,158,0.9)"; g.lineWidth = 2; g.strokeRect(gx - 3, gy - 3, gw + 6, gh + 6);
      for (const [x0, x1] of [[0.15, 0.45], [0.55, 0.85]]) {   // the two panels: recessed (shadow top-left, light bottom-right)
        const x = w * x0, y = h * 0.35, pw = w * (x1 - x0), ph = h * 0.54;
        g.fillStyle = "#eeeeec"; g.fillRect(x, y, pw, ph);
        g.strokeStyle = "rgba(150,150,148,0.9)"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y + ph); g.lineTo(x, y); g.lineTo(x + pw, y); g.stroke();
        g.strokeStyle = "rgba(255,255,255,1)";
        g.beginPath(); g.moveTo(x + pw, y); g.lineTo(x + pw, y + ph); g.lineTo(x, y + ph); g.stroke();
      }
      // hardware on canvas right = the bench end's side (hinges on the garage side, as the photo; seen mirrored outside)
      g.fillStyle = "#3a3d40"; g.fillRect(w * 0.885, h * 0.455, w * 0.07, h * 0.06);   // keypad deadbolt
      g.strokeStyle = "#a9adb1"; g.lineWidth = 2; g.strokeRect(w * 0.885, h * 0.455, w * 0.07, h * 0.06);
      g.fillStyle = "#c7cacc"; g.fillRect(w * 0.9, h * 0.47, w * 0.04, h * 0.012);
      g.beginPath(); g.arc(w * 0.92, h * 0.575, 11, 0, Math.PI * 2); g.fill();         // round knob, a highlight on it
      g.fillStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.arc(w * 0.912, h * 0.569, 4, 0, Math.PI * 2); g.fill();
    });
  }

  function screenTex(THREE) {                         // a monitor's desktop: wallpaper, a taskbar, two windows
    return canvasTex(THREE, 512, 288, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "#1b3a63"); gr.addColorStop(1, "#3a6ea5");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#15181c"; g.fillRect(0, h - 18, w, 18);                    // taskbar
      for (let i = 0; i < 6; i++) { g.fillStyle = ["#e9eef3", "#4fa3e0", "#e0b84f", "#7fd17a", "#d86a5a", "#9aa3ab"][i]; g.fillRect(8 + i * 22, h - 14, 12, 10); }
      g.fillStyle = "#f2f4f6"; g.fillRect(30, 26, 260, 180);                       // a light window: a drawing
      g.fillStyle = "#d8dde2"; g.fillRect(30, 26, 260, 14);
      g.strokeStyle = "#c8241b"; g.lineWidth = 3; g.strokeRect(70, 70, 150, 90);
      g.strokeStyle = "#5a6672"; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(70, 60 + i * 22); g.lineTo(250, 60 + i * 22); g.stroke(); }
      g.fillStyle = "#1e2227"; g.fillRect(250, 110, 230, 150);                     // a dark window: text
      g.fillStyle = "#2c3138"; g.fillRect(250, 110, 230, 14);
      for (let i = 0; i < 10; i++) { g.fillStyle = ["#7fd17a", "#e0b84f", "#9fc4e8"][i % 3]; g.fillRect(262, 132 + i * 12, 40 + ((i * 53) % 150), 5); }
    });
  }

  function build(THREE, o) {
    const grp = new THREE.Group();
    grp.name = "workshop";
    const T = textures(THREE), r = rng(11);
    const R = o.room, X0 = R.x0, X1 = R.x1, Y0 = R.y0, Y1 = R.y1, Z0 = o.floor, HEIGHT = R.h, g = R.gaps;
    const W = X1 - X0, D = Y1 - Y0;
    const std = (p) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, p));
    const tex = (t, u, v) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(u, v); return c; };
    const add = (geo, mat, x, y, z, rx = 0, rz = 0, parent = grp) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz, "ZYX");
      parent.add(m);
      return m;
    };
    // a box w (x) x d (y) x h (z), centered on x, y, standing on z
    const box = (w, d, h, x, y, z, mat, rz = 0, parent) => add(new THREE.BoxGeometry(w, d, h), mat, x, y, z + h / 2, 0, rz, parent);

    const steel = std({ color: 0x3d4247, roughness: 0.55, metalness: 0.6 });
    const white = std({ color: 0xf2f2ee, roughness: 0.6 });
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const roof = [];                                   // shown only closed (from far away)
    grp.userData.walls = [];
    grp.userData.roof = roof;
    grp.userData.center = [cx, cy, Z0 + HEIGHT / 2];
    grp.userData.closeAt = CLOSE_AT * Math.hypot(W, D);

    // the tools, all on the pegboard of the bench nearest the entry door (board centered on bx, its bottom at z0, bw wide,
    // bh tall, on the bench wall at Y0): simple shapes on peg hooks, just off the board (y = Y0 + 34)
    function pegTools(bx, z0, bw, bh) {
      const yb = Y0 + 12, y = yb + 22;
      const wood = std({ color: 0xb07a45, roughness: 0.7 }), dark = std({ color: 0x3b3f44, roughness: 0.45, metalness: 0.6 });
      const chrome = std({ color: 0xc9cdd1, roughness: 0.35, metalness: 0.35 });   // (high metalness reads black here)
      const red = std({ color: 0xc8241b, roughness: 0.5 }), yellow = std({ color: 0xe3b21c, roughness: 0.5 });
      const orange = std({ color: 0xe0661a, roughness: 0.5 }), blue = std({ color: 0x2f6db5, roughness: 0.5 });
      const cyl = (r0, r1, len, mat, x, z) => add(new THREE.CylinderGeometry(r0, r1, len, 12), mat, x, y, z, Math.PI / 2);  // vertical
      const hook = (x, z) => add(new THREE.CylinderGeometry(3, 3, 45, 6), chrome, x, yb + 22, z, 0, 0);   // out of the board
      const L = (f) => bx - bw / 2 + f * bw, Z = (f) => z0 + f * bh;
      // a 2 ft level hung vertically by the hole in its top end
      hook(L(0.06), Z(0.92));
      box(50, 28, 610, L(0.06), y, Z(0.92) - 640, yellow);
      for (const zz of [Z(0.92) - 640, Z(0.92) - 60]) box(54, 32, 30, L(0.06), y, zz, dark);     // end caps
      box(22, 32, 34, L(0.06), y, Z(0.92) - 352, std({ color: 0x7bd46a, roughness: 0.2, transparent: true, opacity: 0.85 }));
      // a hammer: handle down, head across the top on two hooks
      hook(L(0.15) - 40, Z(0.86)); hook(L(0.15) + 40, Z(0.86));
      box(120, 30, 32, L(0.15), y, Z(0.86) - 36, dark);
      cyl(13, 15, 300, wood, L(0.15), Z(0.86) - 36 - 150);
      // screwdrivers on a rack, tips down
      box(260, 40, 14, L(0.3), y + 8, Z(0.82), dark);
      [red, yellow, blue, red, yellow].forEach((m, i) => {
        const x = L(0.3) - 100 + i * 50;
        cyl(14, 11, 100, m, x, Z(0.82) + 57);
        cyl(3.5, 3.5, 90 + i * 15, chrome, x, Z(0.82) - 50 - i * 7);
      });
      // combination wrenches, small to large, ring end up on a hook each
      for (let i = 0; i < 6; i++) {
        const x = L(0.43) + i * 48, len = 140 + i * 25, wd = 12 + i * 2.5, ztop = Z(0.9);
        hook(x, ztop);
        box(wd, 6, len, x, y, ztop - len, chrome);
        add(new THREE.CylinderGeometry(wd * 0.9, wd * 0.9, 7, 16), chrome, x, y, ztop - 4, 0, 0);    // ring end
        box(wd * 1.8, 7, wd * 1.1, x, y, ztop - len - wd * 0.9, chrome);                             // open end
      }
      // a tape measure on a hook
      hook(L(0.66), Z(0.86));
      box(75, 45, 75, L(0.66), y + 4, Z(0.86) - 85, yellow);
      box(20, 47, 20, L(0.66) + 30, y + 4, Z(0.86) - 85, dark);
      // pliers, jaws up: a tapered steel nose meeting at the pivot, steel shanks, red grips splaying out below; the hook
      // sits in the crotch under the pivot
      for (const f of [0.76, 0.84]) {
        const x = L(f), zp = Z(0.8);
        hook(x, zp - 22);
        add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-11, 0), new THREE.Vector2(11, 0),
          new THREE.Vector2(4, 62), new THREE.Vector2(-4, 62)]), { depth: 10, bevelEnabled: false }), chrome, x, y + 5, zp, Math.PI / 2, 0);
        add(new THREE.CylinderGeometry(9, 9, 14, 16), dark, x, y, zp + 4, 0, 0);                  // pivot
        for (const s of [-1, 1]) {
          const half = new THREE.Group();
          half.position.set(x, y, zp);
          half.rotation.set(0, s * 0.13, 0);             // splay about the pivot
          grp.add(half);
          add(new THREE.BoxGeometry(10, 9, 52), chrome, s * 6, 0, -26, 0, 0, half);             // shank
          add(new THREE.CylinderGeometry(8, 7, 120, 10), red, s * 6, 0, -52 - 60, Math.PI / 2, 0, half);   // grip
        }
      }
      // a 7" speed square: the triangle with its middle cut out, a lip along one leg, inch ticks, degree ticks, a pivot hole
      {
        const S7 = 178, k = 26, alu = std({ color: 0xb9bec3, roughness: 0.4, metalness: 0.3 });
        const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(S7, 0), new THREE.Vector2(0, S7)]);
        tri.holes.push(new THREE.Path([new THREE.Vector2(k, k), new THREE.Vector2(k, S7 - 2.4 * k), new THREE.Vector2(S7 - 2.4 * k, k)]));
        const piv = new THREE.Path(); piv.absarc(10, 10, 4, 0, Math.PI * 2, true); tri.holes.push(piv);
        const ox = L(0.9) - S7 / 2, oz = Z(0.42);
        hook(ox + 40, oz + 40);
        add(new THREE.ExtrudeGeometry(tri, { depth: 5, bevelEnabled: false }), alu, ox, y + 3, oz, Math.PI / 2, 0);
        box(S7, 14, 10, ox + S7 / 2, y + 2, oz - 10, alu);                                          // the lip (fence)
        const ink = std({ color: 0x1b1c1e, roughness: 0.6 });
        for (let i = 1; i < 14; i++) box(1.6, 2, i % 2 ? 6 : 11, ox + 3 + (i % 2 ? 3 : 5.5), y + 3.5, oz + i * 12.7 - 1, ink);   // along the leg
        for (let i = 2; i < 13; i++) {                   // degree ticks along the hypotenuse
          const t = i / 14, m = add(new THREE.BoxGeometry(1.6, 2, 8), ink, ox + S7 * t - 4, y + 3.5, oz + S7 * (1 - t) - 4, 0, 0);
          m.rotation.set(0, -Math.PI / 4, 0);
        }
      }
      // two bar clamps: a bar, a fixed jaw on top, a sliding jaw lower down with its screw, orange
      for (const f of [0.3, 0.42]) {
        const x = L(f), zh = Z(0.55);
        hook(x, zh);
        box(12, 25, 420, x, y, zh - 440, chrome);
        box(70, 40, 45, x + 25, y, zh - 60, orange);
        box(70, 40, 45, x + 25, y, zh - 300, orange);
        cyl(10, 10, 60, dark, x + 60, zh - 330);
      }
    }
    // a computer on a bench (centered on bx, its top at zt, against the bench wall at Y0): two 24" monitors on stands at
    // the bench's left end for someone standing at it (facing the wall, -Y: their left is +X), the outer edges angled
    // in toward them; a mini PC on the bench between the stands, under the screens; a keyboard and mouse in front
    function computer(bx, zt, bw) {
      const black = std({ color: 0x1c1d1f, roughness: 0.5 }), grey = std({ color: 0x4a4d52, roughness: 0.45, metalness: 0.4 });
      const screen = new THREE.MeshBasicMaterial({ map: screenTex(THREE), toneMapped: false });
      const mx = bx + bw / 2 - 600, yy = Y0 + 230;
      for (const s of [-1, 1]) {
        const x = mx + s * 285, rz = Math.PI + s * 0.22;   // the outer edge comes forward
        box(230, 180, 12, x, yy, zt, grey);                                                     // base
        box(40, 30, 150, x, yy - 20, zt + 12, grey);                                            // neck
        const body = box(545, 24, 330, x, yy + 5, zt + 140, black, rz);                         // the monitor
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(520, 295), screen);
        sc.position.set(0, -13, 2);                    // on the body's front (its -y before the turn = +y after)
        sc.rotation.set(Math.PI / 2, 0, 0);
        body.add(sc);
      }
      box(125, 125, 50, mx, yy + 20, zt, std({ color: 0x2a2c30, roughness: 0.35, metalness: 0.5 }));   // the mini PC
      box(4, 3, 4, mx + 40, yy + 20 + 63, zt + 38, new THREE.MeshBasicMaterial({ color: 0x4fd1ff }));    // its power light
      box(440, 140, 22, mx, Y0 + 470, zt, black);                                               // keyboard
      box(410, 110, 4, mx, Y0 + 470, zt + 22, std({ color: 0x2d2f33, roughness: 0.6 }));        // its keys
      // the mouse on their right (-X)
      const mouse = add(new THREE.SphereGeometry(30, 16, 10), black, mx - 300, Y0 + 470, zt + 12, 0, 0);
      mouse.scale.set(1, 1.8, 0.6);
      // a drafting chair in front of the monitors, facing the bench: 5-star base on casters, gas column, foot ring,
      // seat at counter height, a small backrest
      const chx = mx, chy = Y0 + 610 + 380, fabric = std({ color: 0x24272b, roughness: 0.8 });
      const steelC = std({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.4 });
      for (let k = 0; k < 5; k++) {
        const a = k * 2 * Math.PI / 5 + Math.PI / 2, ex = chx + Math.cos(a) * 300, ey = chy + Math.sin(a) * 300;
        box(320, 38, 28, chx + Math.cos(a) * 150, chy + Math.sin(a) * 150, Z0 + 45, grey, a);
        add(new THREE.CylinderGeometry(24, 24, 22, 12), black, ex, ey, Z0 + 24, 0, a);            // caster
      }
      add(new THREE.CylinderGeometry(24, 24, 620, 12), black, chx, chy, Z0 + 70 + 310, Math.PI / 2);   // gas column
      add(new THREE.TorusGeometry(230, 9, 8, 32), steelC, chx, chy, Z0 + 430);                     // foot ring
      for (let k = 0; k < 3; k++) {                    // its spokes
        const a = k * 2 * Math.PI / 3;
        box(220, 14, 14, chx + Math.cos(a) * 115, chy + Math.sin(a) * 115, Z0 + 423, steelC, a);
      }
      add(new THREE.CylinderGeometry(230, 225, 75, 32), fabric, chx, chy, Z0 + 690 + 37, Math.PI / 2);   // seat
      box(40, 30, 280, chx, chy + 210, Z0 + 700, grey);                                          // back stem
      box(400, 55, 260, chx, chy + 225, Z0 + 900, fabric);                                       // backrest
    }

    // bench end (-Y, the machine's home side): a 6 ft workbench in each corner under pegboard, a window between
    const IN = 25.4, doorTop = Math.min(80 * IN, HEIGHT - 200);   // every window's top lines up with the door's
    const benchD = 610, benchH = 914, benchWin = { w: Math.min(762, W / 5), sill: Math.min(1100, doorTop - 500), top: doorTop };
    const benchW = Math.max(0, Math.min(6 * FT, (W - benchWin.w - 300) / 2)), benchY = Y0 + benchD / 2 + 20;
    const benchOn = !o.empty && g.front >= FURNITURE.bench && benchW > 800;
    const toolMat = [std({ color: 0xc8241b, roughness: 0.5 }), std({ color: 0x2b2f33, roughness: 0.5 }),
      std({ color: 0xa9adb1, metalness: 0.8, roughness: 0.35 })];
    if (benchOn) for (const side of [-1, 1]) {
      const bx = side < 0 ? X0 + benchW / 2 + 20 : X1 - benchW / 2 - 20;
      box(benchW, benchD, 45, bx, benchY, Z0 + benchH - 45, std({ map: tex(T.wood, benchW / TILE.wood, 1) }));
      for (const dx of [-1, 1]) for (const dy of [-1, 1])
        box(50, 50, benchH - 45, bx + dx * (benchW / 2 - 60), benchY + dy * (benchD / 2 - 60), Z0, steel);
      box(benchW - 120, benchD - 120, 20, bx, benchY, Z0 + 150, std({ color: 0x6b5a45 }));    // lower shelf
      const pegH = Math.min(1200, HEIGHT - benchH - 250);
      add(new THREE.PlaneGeometry(benchW, pegH), std({ map: tex(T.peg, benchW / TILE.peg, pegH / TILE.peg) }),
        bx, Y0 + 12, Z0 + benchH + 140 + pegH / 2, Math.PI / 2, Math.PI);
      if (side > 0) pegTools(bx, Z0 + benchH + 140, benchW, pegH);   // the bench nearest the entry door: the tools
      else computer(bx, Z0 + benchH, benchW);         // the other: a computer
      if (side > 0) box(150, 120, 200, bx + benchW / 2 - 200, benchY - 40, Z0 + benchH, toolMat[0]);   // a toolbox
    }

    // back long wall (-X): a steel shelf of bins, a few feet past the bench
    const shW = Math.min(4 * FT, D - benchD - 2 * 900), shX = X0 + 250, shY = Y0 + benchD + 900 + shW / 2;   // 4 ft wide
    const shelfOn = !o.empty && g.left >= FURNITURE.shelf && shW > 600 && HEIGHT > 2100;
    if (shelfOn) {
      const shH = Math.min(2000, HEIGHT - 200);
      for (const dy of [-1, 1]) for (const dx of [-1, 1]) box(35, 35, shH, shX + dx * 210, shY + dy * (shW / 2 - 20), Z0, steel);
      const binCols = [0x2f6db5, 0xd8a31a, 0x3e8e4f, 0xc8241b, 0x6b6f74];
      const N = 5;                                     // 5 shelves (the user's)
      for (let s = 0; s < N; s++) {
        const z = Z0 + 120 + s * (shH - 200) / (N - 1);
        box(450, shW, 18, shX, shY, z, steel);
        if (s === N - 1) continue;
        for (let k = 0; k < Math.floor(shW / 330); k++)
          if (r() > 0.2) box(380, 280, 160 + r() * 110, shX, shY - shW / 2 + 180 + k * 330, z + 18,
            std({ color: binCols[Math.floor(r() * binCols.length)], roughness: 0.6 }));
      }
    }

    // front long wall (+X) by the garage end: a shop vac (low, under the window)
    const vx = X1 - 450, vy = Y1 - 650;
    if (!o.empty && g.right >= FURNITURE.vac) {
      add(new THREE.CylinderGeometry(230, 210, 520, 32), std({ color: 0xc8241b, roughness: 0.45 }), vx, vy, Z0 + 60 + 260, Math.PI / 2);
      add(new THREE.CylinderGeometry(240, 240, 140, 32), std({ color: 0x2b2f33, roughness: 0.5 }), vx, vy, Z0 + 580 + 70, Math.PI / 2);
      for (const a of [0, 1, 2, 3]) add(new THREE.CylinderGeometry(30, 30, 50, 12), steel,
        vx + Math.cos(a * Math.PI / 2) * 180, vy + Math.sin(a * Math.PI / 2) * 180, Z0 + 25, Math.PI / 2);
    }

    // a fire extinguisher on the front wall by the entry door (its bench-end side, the knob side), the handle at ~1.1 m
    const fy = Y0 + 0.46 * D - 1.5 * FT - 90 - 300, fxw = X1 - 75;
    if (fy - 100 > Y0 + 0.18 * D + 14 * 25.4 + 90) {     // clear of the first window's trim
      // Part 44b (user 2026-10-26: improve it if needed): a 5 lb ABC extinguisher as its own group, so it can lift off
      // its bracket and fly to a fire (js/page/heat_fx.js). Origin = the body's middle; the hose + horn on the room
      // side (-X), the levers toward the wall. userData.extinguisher = { obj, home (its pose), hose(u, E, d) (the hose
      // from stowed (u 0: down the body, clipped) to held out (u 1: its end at E, the horn pointing d; local mm) ->
      // the horn's tip, local), aim (local up: it leans from there) }
      const red = std({ color: 0xc81e14, roughness: 0.32, metalness: 0.1 }), black = std({ color: 0x1b1c1e, roughness: 0.5 });
      const chrome = std({ color: 0xc9ccd0, roughness: 0.25, metalness: 0.9 });
      const ext = new THREE.Group();
      ext.name = "extinguisher";
      ext.position.set(fxw, fy, Z0 + 840);
      grp.add(ext);
      const R = 62, H = 380;
      add(new THREE.CylinderGeometry(R, R, H, 32), red, 0, 0, 0, Math.PI / 2, 0, ext);                          // body
      add(new THREE.CylinderGeometry(R + 1.5, R + 1.5, 14, 32), black, 0, 0, -H / 2 + 7, Math.PI / 2, 0, ext);   // foot ring
      add(new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0, H / 2, Math.PI / 2, 0, ext);   // shoulder
      add(new THREE.CylinderGeometry(20, 22, 26, 20), chrome, 0, 0, H / 2 + R + 6, Math.PI / 2, 0, ext);       // neck
      box(44, 38, 34, 0, 0, H / 2 + R + 18, chrome, 0, ext);                                                   // valve body
      box(140, 24, 9, 40, 0, H / 2 + R + 30, black, 0, ext);                                                   // carry handle
      const lever = box(130, 22, 8, 36, 0, H / 2 + R + 46, black, 0, ext);                                     // squeeze lever,
      lever.rotation.set(0, 0.16, 0);                                                                           // open a little
      add(new THREE.CylinderGeometry(3, 3, 50, 8), chrome, 18, 0, H / 2 + R + 40, 0, 0, ext);                  // pull pin
      add(new THREE.TorusGeometry(13, 2.5, 8, 20), std({ color: 0xf2c200, roughness: 0.4 }), 18, 34, H / 2 + R + 40, Math.PI / 2, 0, ext);   // its ring
      add(new THREE.CylinderGeometry(15, 15, 10, 20), chrome, -26, 0, H / 2 + R + 12, 0, Math.PI / 2, ext);    // gauge
      add(new THREE.CylinderGeometry(12, 12, 1, 20), std({ color: 0xffffff, emissive: 0x222222 }), -31.6, 0, H / 2 + R + 12, 0, Math.PI / 2, ext);
      add(new THREE.CylinderGeometry(1.2, 1.2, 10, 6), red, -32.4, 0, H / 2 + R + 14, 0.7, Math.PI / 2, ext);   // needle (in the green)
      // the hose: stowed down the body into its clip; in use it swings out from the body, the horn held toward the fire
      const V = (x, y, z) => new THREE.Vector3(x, y, z), S = V(-18, 0, H / 2 + R + 14);
      const STOW = [S, V(-60, -6, H / 2 + R - 10), V(-R - 14, -10, H / 2 - 40), V(-R - 12, -8, 40), V(-R - 8, -4, -H / 2 + 120)];
      const hoseMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(STOW), 40, 8, 10), black);   // hose
      ext.add(hoseMesh);
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(8, 15, 46, 16, 1, true), black);                   // horn (narrow
      ext.add(horn);                                                                                           // end on the hose)
      box(10, 30, 16, -R + 2, -4, -H / 2 + 150, black, 0, ext);                                                // hose clip
      const down = V(0, 0, -1), hornAxis = V(0, -1, 0);
      const hoseTo = (u, E, d) => {
        const dd = down.clone().lerp(d || down, u).normalize(), end = STOW[4].clone().lerp(E || STOW[4], u);
        // held: near straight from the valve out to the end (user 2026-10-26: "it can point straighter"), a slight sag,
        // lined up with the horn for its last 70 mm
        const held = [S, S.clone().lerp(end, 0.3).add(V(0, 0, -12)), S.clone().lerp(end, 0.6).add(V(0, 0, -15)), end.clone().addScaledVector(dd, -70), end];
        const pts = STOW.map((p, i) => p.clone().lerp(held[i], u));
        hoseMesh.geometry.dispose();
        hoseMesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 8, 10);
        horn.quaternion.setFromUnitVectors(hornAxis, dd);
        horn.position.copy(end).addScaledVector(dd, 23);
        return end.clone().addScaledVector(dd, 46);
      };
      hoseTo(0);
      box(20, 80, 120, X1 - 10, fy, Z0 + 790, steel);                                                          // wall bracket
      box(30, 70, 12, X1 - 30, fy, Z0 + 638, steel);                                                           // its foot
      grp.userData.extinguisher = { obj: ext, home: { p: ext.position.clone(), q: ext.quaternion.clone() }, hose: hoseTo,
        nozzle: hoseTo(0), R, aim: V(0, 0, 1) };
    }

    // floor and ceiling (face in)
    // the slab runs out under the walls to their outside faces: concrete under the door openings, not grass
    const SW = W + 2 * WALL_T, SD = D + 2 * WALL_T;
    add(new THREE.PlaneGeometry(SW, SD), std({ map: tex(T.concrete, SW / TILE.concrete, SD / TILE.concrete), roughness: 0.92 }), cx, cy, Z0);
    add(new THREE.PlaneGeometry(W, D), std({ color: 0xe9e9e6 }), cx, cy, Z0 + HEIGHT, Math.PI);

    // walls: each a shape in its own (u along the wall, v up) frame, turned into place. u runs +X on the garage wall,
    // +Y on the back (-X) wall, -Y on the front (+X) wall, -X on the bench wall (so every inside face faces in).
    // Openings: { at (world x or y along the wall), w, v0 (0 = a door to the floor), v1, kind }; positions on the
    // front wall from the photo (window 28", entry door, window 32", from the bench end; ~4 ft of glass, tops at the
    // door's; the bench-end window has the same top, its sill higher to clear the benches)
    const garageW = Math.min(8 * FT, W - 1200), garageH = Math.min(7 * FT, HEIGHT - 300), winSill = Math.min(32 * IN, doorTop - 600);
    const walls = [
      { len: W, x: cx, y: Y0, rz: Math.PI, u: (a) => cx - a, gable: true,
        open: [{ at: cx, w: benchWin.w, v0: benchWin.sill, v1: benchWin.top, kind: "win" }] },
      { len: W, x: cx, y: Y1, rz: 0, u: (a) => a - cx, gable: true,
        open: [{ at: cx, w: garageW, v0: 0, v1: garageH, kind: "garage" }] },
      { len: D, x: X0, y: cy, rz: Math.PI / 2, u: (a) => a - cy, open: [] },
      { len: D, x: X1, y: cy, rz: -Math.PI / 2, u: (a) => cy - a, open: [
        { at: Y0 + 0.18 * D, w: 28 * IN, v0: winSill, v1: doorTop, kind: "win" },
        { at: Y0 + 0.46 * D, w: 3 * FT, v0: 0, v1: doorTop, kind: "entry" },
        { at: Y0 + 0.77 * D, w: 32 * IN, v0: winSill, v1: doorTop, kind: "win" }] },
    ];
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ef, roughness: 0.05, metalness: 0, transparent: true,
      opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    const rise = (W / 2 + WALL_T) * PITCH;            // ridge above the wall top (outside face)
    // the wall's outline with its doors notched out of the bottom and its windows as holes; flip = mirrored in u (the
    // outside skin faces the other way); ext = the outside skin's ends (corners) and gable peak
    function outline(L, hs, flip, ext) {
      const f = flip ? -1 : 1, P = (u, v) => new THREE.Vector2(f * u, v);
      const doors = hs.filter((h) => h[1] === 0).sort((a, b) => a[0] - b[0]);
      const pts = [P(-L, 0)];
      for (const [u0, , u1, v1] of doors) pts.push(P(u0, 0), P(u0, v1), P(u1, v1), P(u1, 0));
      pts.push(P(L, 0), P(L, HEIGHT));
      if (ext && ext.gable) pts.push(P(0, HEIGHT + ext.gable));
      pts.push(P(-L, HEIGHT));
      if (flip) pts.reverse();
      const sh = new THREE.Shape(pts);
      for (const [u0, v0, u1, v1] of hs) if (v0 > 0) {
        const q = [P(u0, v0), P(u0, v1), P(u1, v1), P(u1, v0)];
        sh.holes.push(new THREE.Path(flip ? q : q.reverse()));
      }
      return sh;
    }
    const doorTex = { garage: garageTex(THREE), entry: entryTex(THREE) };
    for (const wl of walls) {
      const hs = wl.open.map((h) => { const u = wl.u(h.at); return [u - h.w / 2, h.v0, u + h.w / 2, h.v1, h.kind]; });
      const n = [Math.sin(wl.rz), -Math.cos(wl.rz)];   // into the room
      const wall = add(new THREE.ShapeGeometry(outline(wl.len / 2, hs, false)),   // its uv = (u, v) in mm; OSB inside
        std({ map: tex(T.osb, 1 / TILE.osb[0], 1 / TILE.osb[1]) }), wl.x, wl.y, Z0, Math.PI / 2, wl.rz);
      // the outside skin, WALL_T out: long walls run past the corners to meet the gable walls' skins
      const extL = wl.len / 2 + WALL_T;
      const ext = add(new THREE.ShapeGeometry(outline(extL, hs, true, { gable: wl.gable ? rise : 0 })),
        std({ map: tex(T.siding, 1 / 1000, 1 / TILE.siding) }), wl.x - n[0] * WALL_T, wl.y - n[1] * WALL_T, Z0, Math.PI / 2, wl.rz + Math.PI);
      ext.material.map.repeat.set(1 / 1000, 1 / TILE.siding);
      grp.userData.walls.push({ wall, ext, x: wl.x, y: wl.y, n });
      // trim, glass and doors: children of the inside wall, in its (u, v, out-of-wall) frame, z > 0 inside; they
      // span the wall's thickness (centered at z = -WALL_T / 2) so they show from both sides
      const zc = -WALL_T / 2, deep = WALL_T + 60;
      const fb = (w, h, u, v, mat = white, d = deep) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(u, v, zc); wall.add(m); return m; };
      for (const [u0, v0, u1, v1, kind] of hs) {
        const tw = 90;                                 // white trim round the opening
        if (v0 > 0) { fb(u1 - u0 + 2 * tw, tw, (u0 + u1) / 2, v0 - tw / 2); fb(u1 - u0 + 2 * tw + 60, 30, (u0 + u1) / 2, v0 - tw - 15); }
        fb(u1 - u0 + 2 * tw, tw, (u0 + u1) / 2, v1 + tw / 2);
        fb(tw, v1 - v0, u0 - tw / 2, (v0 + v1) / 2); fb(tw, v1 - v0, u1 + tw / 2, (v0 + v1) / 2);
        if (kind === "win") {
          fb(u1 - u0, 45, (u0 + u1) / 2, (v0 + v1) / 2, white, 60);    // double-hung: the meeting rail
          const gl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, v1 - v0), glass);
          gl.position.set((u0 + u1) / 2, (v0 + v1) / 2, zc);
          wall.add(gl);
        } else if (kind !== "garage") {                // a closed door, both faces (the garage door: open, below)
          const dm = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, v1 - v0),
            std({ map: doorTex[kind], roughness: 0.5, side: THREE.DoubleSide }));
          dm.position.set((u0 + u1) / 2, (v0 + v1) / 2, zc);
          wall.add(dm);
        }
      }
    }
    // the garage door, open: 4 hinged 2" thick sections riding a track each side - up beside the opening, round a 15" radius,
    // then level under the ceiling back into the shop. Each section is a flat panel between two points on the track
    // path s (s = 0 at the floor): the top three lie on the level run, the bottom one hangs in the curve, angled
    // down to the opening. GARAGE_OPEN = 0 would be the door shut (all on the vertical run). Torsion spring bar over
    // the opening, rear hangers from the ceiling.
    {
      const GARAGE_OPEN = 1, hs = garageH / 4, Rr = 380, yt = Y1 - 60, zLevel = Z0 + garageH + 120;
      const Lv = zLevel - Rr - Z0, A = Rr * Math.PI / 2, Lh = garageH + 200;
      const P = (s) => {                               // the track path -> [y, z]
        if (s <= Lv) return [yt, Z0 + s];
        if (s <= Lv + A) { const th = (s - Lv) / Rr; return [yt - Rr + Rr * Math.cos(th), zLevel - Rr + Rr * Math.sin(th)]; }
        return [yt - Rr - (s - Lv - A), zLevel];
      };
      const sb = GARAGE_OPEN * (Lv + 0.35 * A);        // the bottom edge, open: a third of the way round the curve
      const door = grp.userData.door = { parts: [], y: Y1, z: zLevel };   // cutaway() hides these from above / outside
      for (let i = 0; i < 4; i++) {
        const [ya, za] = P(sb + i * hs), [yb, zb] = P(sb + (i + 1) * hs);
        const map = doorTex.garage.clone();             // this section's quarter of the door's face
        map.needsUpdate = true; map.repeat.set(1, 0.25); map.offset.set(0, i / 4);
        const face = std({ map, roughness: 0.5 });       // a 2" thick section: the panels on both faces, white edges
        const m = new THREE.Mesh(new THREE.BoxGeometry(garageW, Math.hypot(yb - ya, zb - za), 2 * 25.4),
          [white, white, white, white, face, face]);
        m.position.set(cx, (ya + yb) / 2, (za + zb) / 2);
        m.rotation.set(Math.PI / 2 + Math.atan2(-(yb - ya), zb - za), 0, 0);
        grp.add(m); door.parts.push(m);
      }
      const track = std({ color: 0xb9bcbf, roughness: 0.45, metalness: 0.7 });
      for (const sx of [-1, 1]) {
        const x = cx + sx * (garageW / 2 + 45);
        box(40, 60, Lv, x, yt, Z0, track);                                         // vertical run
        for (let k = 0; k < 8; k++) {                                              // the curve, in 8 pieces
          const [y0, z0] = P(Lv + A * k / 8), [y1, z1] = P(Lv + A * (k + 1) / 8);
          const b = new THREE.Mesh(new THREE.BoxGeometry(40, Math.hypot(y1 - y0, z1 - z0) + 8, 60), track);
          b.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
          b.rotation.set(Math.atan2(z1 - z0, y1 - y0), 0, 0);
          grp.add(b);
        }
        const yEnd = yt - Rr - Lh;
        box(40, Lh, 60, x, yt - Rr - Lh / 2, zLevel - 30, track);                  // level run
        box(30, 30, Z0 + HEIGHT - zLevel - 30, x, yEnd + 40, zLevel + 30, steel);  // rear hanger to the ceiling
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, garageW + 200, 12), steel);   // torsion bar
      bar.rotation.set(0, 0, Math.PI / 2);
      bar.position.set(cx, Y1 - 90, zLevel + 60);
      grp.add(bar); door.parts.push(bar);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 700, 16), std({ color: 0x2b2f33, roughness: 0.4, metalness: 0.5 }));
      spring.rotation.set(0, 0, Math.PI / 2);
      spring.position.set(cx - 250, Y1 - 90, zLevel + 60);
      grp.add(spring); door.parts.push(spring);
    }

    // outside corners: white corner boards
    for (const x of [X0 - WALL_T, X1 + WALL_T]) for (const y of [Y0 - WALL_T, Y1 + WALL_T]) {
      const m = box(110, 110, HEIGHT, x + (x < cx ? 40 : -40), y + (y < cy ? 40 : -40), Z0, white);
      roof.push(m);
    }

    // roof: two 6/12 planes from the eaves (EAVE past the walls) to the ridge along Y, RAKE past the gables; fascia
    const shingles = std({ map: tex(T.shingle, 1, 1), roughness: 0.95 });
    const xo = W / 2 + WALL_T + EAVE, len = D + 2 * WALL_T + 2 * RAKE, zTop = Z0 + HEIGHT + rise, zEave = Z0 + HEIGHT - EAVE * PITCH;
    const run = xo, slope = Math.hypot(run, run * PITCH), ang = Math.atan(PITCH);
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(slope, len, 50), top = shingles.clone();
      // u runs up the slope on the -X side and down it on the +X side: mirrored there, so each course's shadow is below it
      top.map = tex(T.shingle, -side * slope / TILE.shingle[0], len / TILE.shingle[1]);
      const m = new THREE.Mesh(geo, [white, white, white, white, top, white]);   // shingles on top; soffit + edges white
      m.position.set(cx + side * run / 2, cy, (zTop + zEave) / 2 + 25);
      m.rotation.set(0, side * ang, 0);
      grp.add(m); roof.push(m);
      const fa = new THREE.Mesh(new THREE.BoxGeometry(40, len - 80, 180), white);   // fascia board along the eave, its
      fa.position.set(cx + side * (xo + 20), cy, zEave - 40);                       // ends inside the rake boards
      grp.add(fa); roof.push(fa);
    }
    // rake boards: one trim piece up each gable along the roof's edge, 180 deep, a plumb cut at each eave that caps the
    // fascia's end (its outer face flush with the fascia's)
    const xr = xo + 40, zt = (dx) => zEave + (xo - dx) * PITCH + 63;   // the rake's top edge, a little proud of the shingles
    const rake = new THREE.Shape([new THREE.Vector2(cx - xr, zt(xr) - 180), new THREE.Vector2(cx - xr, zt(xr)),
      new THREE.Vector2(cx, zt(0)), new THREE.Vector2(cx + xr, zt(xr)), new THREE.Vector2(cx + xr, zt(xr) - 180),
      new THREE.Vector2(cx, zt(0) - 180)]);
    for (const [y, rz] of [[Y1 + WALL_T + RAKE, 0], [Y0 - WALL_T - RAKE + 40, 0]]) {
      const rb = new THREE.Mesh(new THREE.ExtrudeGeometry(rake, { depth: 40, bevelEnabled: false }), white);
      rb.rotation.set(Math.PI / 2, 0, rz);             // shape (x, z) in the gable's plane, 40 thick toward -y
      rb.position.set(0, y, 0);
      grp.add(rb); roof.push(rb);
    }

    // outside: sky dome, grass, a driveway from the garage door - something to see through the windows (no trees: user 2026-10-24)
    const OUT = 15000;                                  // inside the desktop camera's far plane (20 m)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(OUT, 32, 16), new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide,
      toneMapped: false, depthWrite: false }));
    sky.rotation.x = Math.PI / 2;                       // the dome's pole up Z
    sky.position.set(cx, cy, Z0);
    grp.add(sky);
    grp.userData.sky = sky;                             // cutaway() keeps it round the camera, scaled to its far plane
    const grass = add(new THREE.CircleGeometry(OUT, 64), std({ map: tex(T.grass, OUT / 1500, OUT / 1500), roughness: 1 }), cx, cy, Z0 - 8);
    grp.userData.grass = { mesh: grass, x: cx, y: cy, tile: 3000, rep: OUT / 1500 };   // cutaway() keeps it under the camera (texture tile 3 m)
    const drive = Math.min(9000, OUT - (Y1 - cy) - 2000), dw = garageW + 1200;
    add(new THREE.PlaneGeometry(dw, drive), std({ map: tex(T.concrete, dw / TILE.concrete, drive / TILE.concrete), roughness: 0.95 }),
      cx, Y1 + WALL_T + drive / 2, Z0 - 3);

    // ceiling: four 4 ft strip lights (the user's) - one along each workbench (across the shop), over its front edge,
    // and two running the other way (along the shop), in line with the bench lights' inner ends (nearest the middle),
    // side by side over the middle of the shop - the machine (user 2026-10-22)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfdfcf7 }), lampHousing = std({ color: 0xd0d2d4, roughness: 0.4 });
    const LL = 4 * FT, benchX = (side) => (side < 0 ? X0 + benchW / 2 + 20 : X1 - benchW / 2 - 20), lampY = Y0 + benchD - 100;
    const inner = (side) => benchX(side) - side * (LL / 2 - 60);   // under the bench light's inner end
    const lamps = [[benchX(-1), lampY, 0], [benchX(1), lampY, 0],
      [inner(-1), cy, Math.PI / 2], [inner(1), cy, Math.PI / 2]];
    for (const [x, y, rz] of lamps) {
      box(LL, 120, 60, x, y, Z0 + HEIGHT - 60, lampHousing, rz);
      box(LL - 40, 90, 4, x, y, Z0 + HEIGHT - 64, lightMat, rz);
    }
    // for the page's lighting: each strip's lens (machine: the two over the machine), the open garage door's side
    grp.userData.lamps = lamps.map(([x, y, rz], i) => ({ x, y, z: Z0 + HEIGHT - 67, rz, len: LL - 40, w: 90, machine: i >= 2 }));
    grp.userData.garage = { y: Y1, z: Z0 };
    return grp;
  }

  // close by: a wall the camera is outside of is hidden with its skin, trim, glass and doors, and the roof is off
  // (dollhouse); far away (closeAt from the center): the closed building. The sky dome follows the camera.
  function cutaway(grp, cam, far = 20000) {
    const ud = grp.userData, c = ud.center || [0, 0, 0];
    const closed = ud.closeAt > 0 && Math.hypot(cam.x - c[0], cam.y - c[1], cam.z - c[2]) > ud.closeAt;
    for (const w of ud.walls || []) {
      const show = closed || (cam.x - w.x) * w.n[0] + (cam.y - w.y) * w.n[1] > 0;
      w.wall.visible = show;
      if (w.ext) w.ext.visible = show;
    }
    for (const m of ud.roof || []) m.visible = closed;
    // the open garage door's sections (+ torsion bar) lie under the ceiling, over the table: like the roof they go when
    // the camera is above them or outside the garage wall (the tracks stay, to show where it is) (user 2026-10-24)
    if (ud.door) {
      const show = closed || (cam.z < ud.door.z && cam.y < ud.door.y);
      for (const m of ud.door.parts) m.visible = show;
    }
    // the dome and the grass round the camera, scaled to stay inside the far plane (built for 20 m): zoomed far out,
    // the ground still reaches the horizon (the dome's lower half is grass coloured). The grass texture's repeat and
    // offset follow so it stays put on the ground, 3 m tiles.
    const k = far / 20000;
    if (ud.sky) { ud.sky.position.set(cam.x, cam.y, cam.z); ud.sky.scale.setScalar(k); }   // centered at the eye: its horizon is the real one
    const g = ud.grass;
    if (g) {
      g.mesh.position.x = cam.x; g.mesh.position.y = cam.y;
      g.mesh.scale.set(k, k, 1);
      const map = g.mesh.material.map, rep = g.rep * k;
      map.repeat.set(rep, rep);
      map.offset.set((cam.x - g.x) / g.tile - rep / 2, (cam.y - g.y) / g.tile - rep / 2);
    }
  }

  function dispose(grp) {
    grp.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mt.map) mt.map.dispose();
        mt.dispose();
      }
    });
  }

  const out = { build, dispose, room, cutaway, DEFAULT, HEIGHT, WALK };
  if (typeof module !== "undefined" && module.exports) module.exports = out;
  else root.LR4Shop = out;
})(typeof self !== "undefined" ? self : this);
