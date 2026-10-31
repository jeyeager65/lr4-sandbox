// The motor cap's shape editor (Part 46b) in headless Chrome (serve.py's headers): Shape… opens it over the model;
// each view draws its outline + points (the mirrored half too); dragging a point / typing in the table / a span's kind /
// a starting shape change the router's cap (kept as its edit, the model rebuilt, undo); Length stretches a drawn cap;
// a photo goes under a view and Set scale sizes it; Plain box drops the shape; no page errors.
//   node tests/test_page_cap_edit.js   (not in npm test: needs Chrome + Python; ~1 min)
"use strict";
const fs = require("fs");
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");
const FIX = require("./fixtures/fixture.js");     // the tests' own box router (testbox)

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const SHOT = process.env.CE_SHOT;                    // a folder: screenshots of each view

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9390 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FIX.pageScript });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("!!window.LR4RouterBuild && !!window.capEditOpen && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    const shot = async (n) => {
      if (!SHOT) return;
      await sleep(400);
      const s = await page.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`${SHOT}/ce_${n}.png`, Buffer.from(s.data, "base64"));
    };
    const a = await page.val(`(async () => {
      const out = {}, $$ = (id) => document.getElementById(id), errs = [];
      addEventListener("error", (e) => errs.push(String(e.message)));
      const cap = () => { const m = meshes.find((q) => q.userData.name === "Router_MotorCap"); m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(1)); };
      const edit = () => (LR4RouterBuild.edits().testbox || {}).model;
      LR4Router.set({ router: "testbox" }); await T.sleep(300);
      out.box0 = cap();
      $$("rb-view").click(); await T.sleep(300);
      out.rte = { on: document.documentElement.classList.contains("rte-on") && !$$("rte").hidden, ce: !$$("ce").hidden, panel: getComputedStyle(document.querySelector(".panel")).display,
        insp: getComputedStyle($$("insp")).display, rti: !$$("rti").hidden, builder: $$("rte-body").contains($$("rto")), off: camera.view && camera.view.enabled ? camera.view.offsetX : 0 };
      rxPick("motor_cap"); await T.sleep(100);
      document.querySelector('#rti [data-act="shape"]').click(); await T.sleep(300);
      out.open = !$$("ce").hidden && $$("rti").hidden;
      // over the model (Part 48e): the drawing on the stage, the camera snapped to Top with the Flat lens, the cap framed;
      // its points sit on the model's; a drag moves one; orbit away = it waits; Back to the view; In a panel = docked
      if ($$("ce-overb").getAttribute("aria-pressed") !== "true") $$("ce-overb").click();
      await T.sleep(1100);
      const ov = { place: [$$("ce-draw").parentNode.id, RX.view, RX.flat, $$("ce").classList.contains("ce-over")] };
      const m0 = LR4RouterBuild.preset().model, z0 = LR4RouterBody.stackTop(m0), sv = $$("ce-svg"), cr = canvas.getBoundingClientRect();
      const rowv = (k, i) => +$$("ce-rows").querySelectorAll("input[data-k=" + k + "]")[i].value;
      const ctr = (e) => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
      const S2 = rxScreen([rowv("x", 1), rowv("y", 1), z0 + m0.motor_cap.H]), c2 = ctr(sv.querySelectorAll(".ce-pt")[1]);
      ov.align = +Math.hypot(c2[0] - cr.left - S2[0], c2[1] - cr.top - S2[1]).toFixed(1);
      ov.zoom = capEditView().k;
      const fireO = (t, x, y, tgt) => tgt.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }));
      const c3o = sv.querySelectorAll(".ce-pt")[2], q3 = ctr(c3o), yb = rowv("y", 2);
      fireO("pointerdown", q3[0], q3[1], c3o); fireO("pointermove", q3[0], q3[1] - 10 * ov.zoom, sv); fireO("pointerup", q3[0], q3[1] - 10 * ov.zoom, sv);
      await T.sleep(400);
      ov.drag = +(rowv("y", 2) - yb).toFixed(1);
      const tg = controls.target.clone();
      camera.position.copy(tg).add(new THREE.Vector3(200, -200, 150)); controls.update(); controls.dispatchEvent({ type: "end" }); await T.sleep(100);
      ov.wait = [!$$("ce-wait").hidden, sv.querySelectorAll(".ce-pt").length];
      $$("ce-wait-go").click(); await T.sleep(1100);
      ov.back = [$$("ce-wait").hidden, sv.querySelectorAll(".ce-pt").length, RX.view];
      $$("ce-overb").click(); await T.sleep(300);
      ov.panel = [$$("ce-draw").parentNode.id !== "rbx", RX.flat, !$$("ce").classList.contains("ce-over")];
      $$("rb-undo").click(); await T.sleep(300);   // the drag undone: the box again
      ov.undone = !(edit() && edit().motor_cap.shape);
      out.over = ov;
      const svg = $$("ce-svg");
      out.top = { pts: svg.querySelectorAll(".ce-pt").length, line: !!svg.querySelector(".ce-line"), mirror: !!svg.querySelector(".ce-mirror"), rows: $$("ce-rows").children.length };
      // drag point 3 (the front corner) out 10 mm: the width grows by 20
      const c3 = svg.querySelectorAll(".ce-pt")[2], r = c3.getBoundingClientRect(), k = (window.__ceK = 0);
      const p0 = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const ptsBefore = JSON.parse(JSON.stringify(edit() ? edit().motor_cap.shape : null));
      const fire = (t, x, y, tgt) => tgt.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }));
      const y0 = +$$("ce-rows").querySelectorAll("input[data-k=y]")[2].value;
      const pxmm = capEditView().k;
      fire("pointerdown", p0.x, p0.y, c3); fire("pointermove", p0.x, p0.y - 10 * pxmm, svg); fire("pointerup", p0.x, p0.y - 10 * pxmm, svg);
      await T.sleep(400);
      out.drag = { y0, y1: +$$("ce-rows").querySelectorAll("input[data-k=y]")[2].value, shaped: !!(edit() && edit().motor_cap.shape), W: edit() && edit().motor_cap.W, box: cap(), was: ptsBefore };
      // type a number: point 2's x
      const inp = $$("ce-rows").querySelectorAll("input[data-k=x]")[1];
      inp.value = +inp.value + 5; inp.dispatchEvent(new Event("change", { bubbles: true })); await T.sleep(300);
      out.typed = edit().motor_cap.shape.top[1].x;
      // the picked corner's rounding, typed beside it on the drawing
      $$("ce-rows").children[1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); await T.sleep(200);
      out.pop = { shown: !$$("ce-pop").hidden, label: $$("ce-pop-l").textContent };
      $$("ce-pop-v").value = 8; $$("ce-pop-v").dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(300);
      out.pop.r = edit().motor_cap.shape.top[1].r; out.pop.row = $$("ce-rows").querySelectorAll("input[data-k=cr]")[0] && $$("ce-rows").querySelectorAll("input[data-k=cr]")[0].value;
      // span -> curve: a handle shows for it once picked
      const sel = $$("ce-rows").querySelectorAll("select[data-k=s]")[1];
      sel.value = "curve"; sel.dispatchEvent(new Event("change", { bubbles: true })); await T.sleep(300);
      $$("ce-rows").children[1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); await T.sleep(200);
      out.curve = { s: edit().motor_cap.shape.top[1].s, handles: svg.querySelectorAll(".ce-h").length };
      // click the outline: a point added
      const n0 = edit().motor_cap.shape.top.length, hit = svg.querySelector(".ce-hit"), L = hit.getTotalLength(), q = hit.getPointAtLength(L * 0.5), sr = svg.getBoundingClientRect();
      fire("pointerdown", sr.left + q.x, sr.top + q.y, hit); fire("pointerup", sr.left + q.x, sr.top + q.y, svg); await T.sleep(300);
      out.added = edit().motor_cap.shape.top.length - n0;
      // Delete removes the picked one
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); await T.sleep(300);
      out.deleted = n0 + out.added - edit().motor_cap.shape.top.length;
      // the side + end views
      $$("ce-views").querySelector("[data-v=front]").click(); await T.sleep(200);
      out.side = { pts: svg.querySelectorAll(".ce-pt").length, mirror: !!svg.querySelector(".ce-mirror"), hy: $$("ce-hy").textContent };
      $$("ce-views").querySelector("[data-v=section]").click(); await T.sleep(200);
      out.end = { pts: svg.querySelectorAll(".ce-pt").length, mirror: !!svg.querySelector(".ce-mirror"), secs: !$$("ce-secs").hidden };
      $$("ce-sec-add").click(); await T.sleep(300);
      out.sections = Array.isArray(edit().motor_cap.shape.section[0].pts) ? edit().motor_cap.shape.section.length : 1;
      // the cutaway (Part 48f): the router cut at the picked section's X (past it, above the cap's bottom), the cut filled;
      // the other section dashed with its X; Front: no cut, the cap's material as it was
      const cutOf = () => {
        const c = capEditCut(), m1 = LR4RouterBuild.preset().model, z1 = LR4RouterBody.stackTop(m1), at = edit().motor_cap.shape.section[CE_SEC()].at;
        const gone = (x, z) => c && c.planes.every((q) => q.distanceToPoint(rxWorld([x, 0, z])) < 0);
        return c && { fills: c.fills, past: gone(at + 5, z1 + 10), before: !gone(at - 5, z1 + 10), below: !gone(at + 5, z1 - 10) };
      };
      const CE_SEC = () => +$$("ce-sec").value;
      const capMat = () => meshes.find((q) => q.userData.name === "Router_MotorCap").material;
      out.cut = { on: cutOf(), others: svg.querySelectorAll(".ce-other path").length, label: (svg.querySelector(".ce-other text") || {}).textContent, clip: !!capMat().clippingPlanes };
      $$("ce-views").querySelector("[data-v=front]").click(); await T.sleep(200);
      out.cut.front = [capEditCut(), capMat().clippingPlanes, svg.querySelectorAll(".ce-guide line.sec").length, svg.querySelectorAll(".ce-guide line.sec.on").length];
      $$("ce-views").querySelector("[data-v=section]").click(); await T.sleep(200);
      // start from a pear: the shape replaced, the model too; Length stretches it
      const st = $$("ce-start"); st.value = "pear"; st.dispatchEvent(new Event("change", { bubbles: true })); await T.sleep(400);
      out.pear = { n: edit().motor_cap.shape.top.length, box: cap() };
      LR4RouterBuild.set("model.motor_cap.L", 130); await T.sleep(500);
      out.stretch = { L: edit().motor_cap.L, box: cap(), filletsHidden: !LR4RouterSchema.rows("motor_cap", LR4RouterBuild.preset()).some((r) => r.k === "model.motor_cap.top_r"), note: LR4RouterBuild.notes("motor_cap").length > 0 };
      // undo goes back to before the stretch
      $$("rb-undo").click(); await T.sleep(400);
      out.undo = edit().motor_cap.L;
      // a photo (a made-up 200 x 100 image) under the side view, then Set scale: 2 clicks, 50 mm
      $$("ce-views").querySelector("[data-v=front]").click(); await T.sleep(200);
      const cv = document.createElement("canvas"); cv.width = 200; cv.height = 100; cv.getContext("2d").fillRect(20, 20, 160, 60);
      const blob = await new Promise((res) => cv.toBlob(res)), dt = new DataTransfer();
      dt.items.add(new File([blob], "side.png", { type: "image/png" }));
      const fi = $$("ce-pfile"); fi.files = dt.files; fi.dispatchEvent(new Event("change", { bubbles: true }));
      for (let i = 0; i < 40 && !svg.querySelector("image"); i++) await T.sleep(50);
      out.photo = { shown: !!svg.querySelector("image"), scaleOn: $$("ce-scale").getAttribute("aria-pressed") === "true" };
      const sb = svg.getBoundingClientRect();
      fire("pointerdown", sb.left + 100, sb.top + 150, svg); fire("pointerdown", sb.left + 200, sb.top + 150, svg); await T.sleep(100);
      const before = JSON.parse(localStorage.getItem("lr4-cap-photos")).testbox.front.mmpp;
      $$("ce-dist").value = 50; $$("ce-scale-ok").click(); await T.sleep(200);
      const ph = JSON.parse(localStorage.getItem("lr4-cap-photos")).testbox.front;
      out.scaled = { before, after: ph.mmpp, pxmm: 100 / 50 };
      $$("ce-pdel").click(); await T.sleep(100);
      out.photoGone = !svg.querySelector("image");
      // Plain box drops the shape
      $$("ce-plain").click(); await T.sleep(400);
      out.plain = { shaped: !!(edit() && edit().motor_cap.shape), fillets: LR4RouterSchema.rows("motor_cap", LR4RouterBuild.preset()).some((r) => r.k === "model.motor_cap.top_r") };
      $$("ce-close").click(); await T.sleep(100);
      out.closed = $$("ce").hidden && !$$("rti").hidden;   // the inspector back in its place
      rxPick(null); rxPick("motor_cap"); await T.sleep(100);
      out.staysShut = $$("ce").hidden;
      document.querySelector('#rti [data-act="shape"]').click(); await T.sleep(100);
      out.reopen = !$$("ce").hidden;
      $$("rte-back").click(); await T.sleep(300);
      out.left = { off: !document.documentElement.classList.contains("rte-on") && $$("rte").hidden && $$("ce").hidden, panel: getComputedStyle(document.querySelector(".panel")).display, view: !!(camera.view && camera.view.enabled) };
      $$("rb-reset").click(); await T.sleep(300);
      out.errs = errs;
      return out;
    })()`);
    ok(a.rte.on && !a.rte.ce && a.rte.panel === "none" && a.rte.insp === "none" && a.rte.rti && a.rte.builder && a.rte.off > 0,
      `Edit router: the router editor - the builder in the side panel's place, Inspect's panel away, the view centered between it and the inspector (${JSON.stringify(a.rte)})`);
    ok(a.open, "the motor cap's Edit shape docks the shape editor on the right, in the inspector's place");
    const o = a.over;
    ok(o.place.join() === "rbx,top,true,true", `over the model: the drawing on the stage, the camera snapped to Top, the Flat lens (${o.place})`);
    ok(o.align < 3 && o.zoom > 1.5, `its points sit on the model's corners (${o.align} px off), the cap framed (${o.zoom.toFixed(2)} px a mm)`);
    ok(Math.abs(o.drag - 10) <= 0.5, `a point dragged 10 mm over the model (${o.drag})`);
    ok(o.wait[0] && o.wait[1] === 0 && o.back.join() === "true,4,top", `orbited away: it waits (${o.wait}); Back to the view (${o.back})`);
    ok(o.panel.join() === "true,false,true" && o.undone, `In a panel: docked again, the lens back (${o.panel}); the drag undone`);
    ok(a.top.pts === 4 && a.top.line && a.top.mirror && a.top.rows === 4, `top view: the box's 4 points, its outline + the mirrored half, 4 table rows (${JSON.stringify(a.top)})`);
    ok(a.drag.shaped && Math.abs(a.drag.y1 - a.drag.y0 - 10) < 1 && a.drag.box[1] - a.box0[1] > 15 && a.drag.box[1] - a.box0[1] <= 20.1,
      `dragging point 3 out 10 mm: the cap is drawn now, ~20 mm wider (the corner's fillet trims it) (${a.drag.y0} -> ${a.drag.y1}; ${a.box0} -> ${a.drag.box})`);
    ok(Number.isFinite(a.typed), `a typed number goes in (${a.typed})`);
    ok(a.pop.shown && a.pop.label === "Round" && a.pop.r === 8 && a.pop.row === "8", `a picked corner: Round beside it on the drawing; 8 typed rounds it (the table too) (${JSON.stringify(a.pop)})`);
    ok(a.curve.s === "curve" && a.curve.handles === 2, `a span made a curve; its point picked shows its 2 handles (${JSON.stringify(a.curve)})`);
    ok(a.added === 1 && a.deleted === 1, `clicking the outline adds a point, Delete removes the picked one (${a.added}, ${a.deleted})`);
    ok(a.side.pts === 4 && !a.side.mirror && a.side.hy === "Up", `Front view: all round, not mirrored (${JSON.stringify(a.side)})`);
    ok(a.end.pts === 4 && a.end.mirror && a.end.secs && a.sections === 2, `Cross-section: one half, mirrored; + Section makes 2 (${JSON.stringify(a.end)}, ${a.sections})`);
    const cu = a.cut;
    ok(cu.on && cu.on.fills > 0 && cu.on.past && cu.on.before && cu.on.below && cu.clip,
      `Cross-section: the router cut away past the picked section's X (above the cap's bottom only), the cut filled (${JSON.stringify(cu.on)})`);
    ok(cu.others === 2 && /^X -?\d/.test(cu.label || ""), `the other section dashed (both halves) with its X (${cu.others}, ${cu.label})`);
    ok(cu.front[0] === null && !cu.front[1] && cu.front[2] === 2 && cu.front[3] === 1,
      `Front: no cut, the cap's material as it was; the sections' places marked, the picked one solid (${JSON.stringify(cu.front.slice(2))})`);
    ok(a.pear.n === 5, `Start from Pear: its 5 top points (${JSON.stringify(a.pear)})`);
    ok(Math.abs(a.stretch.L - 130) < 0.1 && Math.abs(a.stretch.box[0] - 130) < 1 && a.stretch.filletsHidden && a.stretch.note,
      `Length 130 stretches the drawn cap; the fillets hidden, "drawn" noted (${JSON.stringify(a.stretch)})`);
    ok(a.undo !== undefined && Math.abs(a.undo - 130) > 1, `Undo: back before the stretch (${a.undo})`);
    ok(a.photo.shown && a.photo.scaleOn && a.photoGone,
      `a photo under the Front view, Set scale on; Remove takes it away (${JSON.stringify(a.photo)})`);
    ok(a.scaled.after !== a.scaled.before, `Set scale: 2 clicks + 50 mm resize the photo (mm a pixel ${a.scaled.before.toFixed(3)} -> ${a.scaled.after.toFixed(3)})`);
    ok(!a.plain.shaped && a.plain.fillets && a.closed && a.staysShut && a.reopen, `Plain box drops the shape, the fillets back; ✕ shuts it (stays shut on the tab), Shape… brings it back (${JSON.stringify(a.plain)})`);
    ok(a.left.off && a.left.panel !== "none" && !a.left.view, `Back to the machine: the editor gone, the side panel back, the view unshifted (${JSON.stringify(a.left)})`);
    ok(a.errs.length === 0, `no page errors (${a.errs.join("; ")})`);
    if (SHOT) {
      for (const v of ["top", "front", "section"]) {
        await page.val(`(async () => { LR4Router.set({ router: "carbide" }); await T.sleep(200); if (!document.documentElement.classList.contains("rte-on")) document.getElementById("rb-view").click(); rxPick("motor_cap"); await T.sleep(300); if (document.getElementById("ce").hidden) capEditOpen(true);
          const st = document.getElementById("ce-start"); st.value = "pear"; st.dispatchEvent(new Event("change", { bubbles: true }));
          document.getElementById("ce-views").querySelector("[data-v=${v}]").click(); await T.sleep(300); return 1; })()`);
        await shot(v);
      }
      await page.val(`(async () => { document.getElementById("rb-reset").click(); await T.sleep(200); return 1; })()`);
    }
  } catch (e) { ok(false, "threw: " + (e && e.stack || e)); }
  finally { await page.close(); srv.kill(); }
  console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
