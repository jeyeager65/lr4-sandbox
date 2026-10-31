// Build your router (My LR4 > Router, 2026-10-29) in headless Chrome (serve.py's headers), on the tests' own box
// router (tests/fixtures: testbox):
//  - the step lists every router, picks the same one as Run; a typed size rebuilds the router in the view;
//  - edits are kept per machine (a reload keeps them), Reset puts a built-in back; New makes a custom router that Run
//    lists too, Delete removes it; the names (2026-10-29): motor cap, motor housing, collar, transition, shaft lock, looks.
//   node tests/test_page_router_build.js   (not in npm test: needs Chrome + Python; ~1 min)
"use strict";
const { CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");
const FIX = require("./fixtures/fixture.js");     // the tests' own box router (testbox): fixed sizes, whatever the presets become

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9290 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9900 + Math.floor(Math.random() * 100));
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FIX.pageScript });
  const load = async () => {
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4RouterBuild && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    return up;
  };
  try {
    await sleep(800);
    ok(await load(), "page loaded");
    await page.val(HELPERS);
    const a = await page.val(`(async () => {
      const out = {}, $$ = (id) => document.getElementById(id);
      const headX = () => { const m = meshes.find((q) => q.userData.name === "Router_MotorCap"); m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return +(b.max.x - b.min.x).toFixed(1); };
      localStorage.clear && 0;
      LR4Router.set({ router: "testbox" });
      await T.sleep(100);
      out.pick = $$("rb-pick").value; out.n = $$("rb-pick").options.length;
      out.L = $$("rb-h-L").value; out.x0 = headX();
      const el = $$("rb-h-L"); el.value = 120; el.dispatchEvent(new Event("input", { bubbles: true }));
      await T.sleep(400);
      out.x1 = headX(); out.kept = LR4RouterBuild.edits().testbox && LR4RouterBuild.edits().testbox.model.motor_cap.L;
      out.label = $$("rb-pick").selectedOptions[0].textContent; out.reset = !$$("rb-reset").disabled;
      $$("rb-new").click(); await T.sleep(100);
      out.newId = LR4Router.state().router; out.runList = [...$$("rt-router").options].map((o) => o.value);
      out.del = $$("rb-reset").textContent;
      return out;
    })()`);
    ok(a.pick === "testbox" && a.n >= 5, `the step picks Run's router (${a.pick}, ${a.n} listed)`);
    ok(a.L === "78" && Math.abs(a.x0 - 78) < 2, `test router head 78 long in the inputs and the view (${a.L}, ${a.x0})`);
    ok(Math.abs(a.x1 - 120) < 2 && a.kept === 120, `typed 120: the view follows (${a.x1}), kept (${a.kept})`);
    ok(/\(edited\)/.test(a.label) && a.reset, `listed as edited, Reset on (${a.label})`);
    ok(/^custom-my-test-box/.test(a.newId) && a.runList.includes(a.newId) && a.del === "Delete", `New: ${a.newId} in Run's list, Delete`);
    ok(await load(), "reloaded");
    await page.val(HELPERS);
    const b = await page.val(`(async () => {
      const out = {}, $$ = (id) => document.getElementById(id);
      out.router = LR4Router.state().router; out.L = LR4Routers.ROUTERS.testbox.model.motor_cap.L; out.custom = !!LR4Routers.ROUTERS[out.router];
      window.confirm = () => true;
      $$("rb-reset").click(); await T.sleep(100);
      out.after = LR4Router.state().router; out.gone = !LR4Routers.ROUTERS[out.router];
      LR4Router.set({ router: "testbox" }); await T.sleep(100);
      $$("rb-reset").click(); await T.sleep(100);
      out.L2 = LR4Routers.ROUTERS.testbox.model.motor_cap.L; out.edits = Object.keys(LR4RouterBuild.edits());
      LR4Router.set({ router: "kobalt" }); await T.sleep(100);
      out.head = LR4Routers.ROUTERS.kobalt.model.motor_cap; out.headShown = !$$("rb-head").hidden;
      const kb = LR4Routers.ROUTERS.kobalt.model;
      out.kLock = kb.shaft_lock; out.lockOn = $$("rb-lock-on").checked;
      // the Carbide's transition; shaped to the cap, a fillet; the housing chamfer; a part's look (its own material)
      LR4Router.set({ router: "carbide" }); await T.sleep(100);
      const put = async (id, v) => { const el = $$(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(400); };
      const cb = () => LR4Routers.ROUTERS.carbide.model;
      out.tr = { l: $$("rb-t-l").value, dShown: !$$("rb-t-d").closest(".field").hidden };
      document.querySelector('#rb-tshape [data-v="cap"]').click(); await T.sleep(150);
      document.querySelector('#rb-tedge [data-v="fillet"]').click(); await T.sleep(150);
      await put("rb-t-e", 5); await put("rb-st8", 2);
      out.tr.after = [cb().transition.shape, cb().transition.edge, cb().transition.e, cb().housing.ch, $$("rb-t-d").closest(".field").hidden, !$$("rb-trans-e").hidden];
      const sel = $$("rb-lf1"); sel.value = "rubber"; sel.dispatchEvent(new Event("change", { bubbles: true })); await T.sleep(300);
      await put("rb-lk3", "#1f5fbf");
      const mOf = (n) => meshes.find((m) => m.userData.name === n), hm = mOf("Router_Housing"), cm = mOf("Router_Collar");
      out.tr.look = [cb().looks.housing.f, +hm.material.roughness.toFixed(2), hm.material.metalness, cm.material.color.b > 0.3 && cm.material.color.r < 0.05];
      $$("rb-reset").click(); await T.sleep(100);
      LR4Router.set({ router: "kobalt" }); await T.sleep(100);
      $$("rb-reset").click(); await T.sleep(100);
      out.back = !LR4Routers.ROUTERS.kobalt.model.shaft_lock;
      // a spindle: no dial ring, its switch left on, the router <-> spindle switch
      const errs = [];
      window.addEventListener("error", (e) => errs.push(e.message));
      PWR.body = false;
      LR4Router.set({ router: "spindle65" }); await T.sleep(200);
      const dm = meshes.find((m) => m.userData.name === "Router_Dial"), bm = meshes.find((m) => m.userData.name === "Router_Housing");
      bm.geometry.computeBoundingBox();
      const bb = bm.geometry.boundingBox;
      out.spin = { ring: !!(dm && dm.userData.ring), dialTris: dm && dm.geometry.index ? dm.geometry.index.count : 0, body: PWR.body,
        d: +(bb.max.x - bb.min.x).toFixed(1), canShown: ![...document.querySelectorAll(".rb-spin [data-k='model.housing.d']")].some((e) => e.closest(".field").hidden), gripHidden: [...document.querySelectorAll(".rb-router [data-k='model.housing.d']")].every((e) => e.closest(".field").hidden) };
      LR4Router.set({ router: "testbox" }); await T.sleep(100);
      document.querySelector('#rb-kind button[data-v="spindle"]').click(); await T.sleep(100);
      out.toSpin = [LR4Routers.ROUTERS.testbox.model.kind, LR4Routers.ROUTERS.testbox.source];
      document.querySelector('#rb-kind button[data-v="router"]').click(); await T.sleep(100);
      out.toRouter = LR4Routers.ROUTERS.testbox.model.motor_cap && LR4Routers.ROUTERS.testbox.model.motor_cap.L;
      $$("rb-reset").click(); await T.sleep(100);
      // mount None: no dust shoe or hose (shown again with a mount)
      const vis = (re) => meshes.filter((m) => re.test(m.userData.name || "")).map((m) => m.visible);
      out.shoe0 = [vis(/^Dust_Shoe/), vis(/^Vacuum_Hose/)].map((v) => v.length > 0 && v.every(Boolean));
      const mt = $$("rb-mount"); mt.value = "none"; mt.dispatchEvent(new Event("change")); await T.sleep(200);
      out.shoe1 = [vis(/^Dust_Shoe/), vis(/^Vacuum_Hose/), vis(/^Tool_Mount_/)].map((v) => v.length > 0 && v.every(Boolean));
      out.optHose = $$("opt-hose").disabled;
      $$("rb-reset").click(); await T.sleep(200);
      out.shoe2 = vis(/^Dust_Shoe/).every(Boolean) && !$$("opt-hose").disabled;
      // height in the mount: the router and its bit move together; a clamp off the grip is noted
      LR4Router.set({ router: "testbox" }); await T.sleep(100);
      const zOf = (n) => { const m = meshes.find((q) => q.userData.name === n); m.updateMatrixWorld(); return new THREE.Box3().setFromObject(m).min.z; };
      const tip0 = bitTip(meshes.find((m) => m.userData.name === "Router_Bit")).z, nut0 = zOf("Router_ColletNut");
      out.clampDef = $$("rb-clamp").value;
      const cl = $$("rb-clamp"); cl.value = 25; cl.dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(400);
      out.dTip = +(bitTip(meshes.find((m) => m.userData.name === "Router_Bit")).z - tip0).toFixed(2);
      out.dNut = +(zOf("Router_ColletNut") - nut0).toFixed(2);
      out.note0 = $$("rb-clampnote").hidden;
      cl.value = 140; cl.dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(400);
      out.note1 = !$$("rb-clampnote").hidden && $$("rb-clampnote").textContent;
      $$("rb-reset").click(); await T.sleep(200);
      out.dBack = +(bitTip(meshes.find((m) => m.userData.name === "Router_Bit")).z - tip0).toFixed(2);
      // tabs: one section at a time; the ? follows the tab
      const onSecs = () => [...document.querySelectorAll("#rte .rb-sec")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.dataset.sec);
      document.querySelector('#rb-tabs [data-v="head"]').click();
      out.tabs = [onSecs().join(), $$("rb-tab-q").dataset.help];
      document.querySelector('#rb-tabs [data-v="colors"]').click();
      out.tabs.push(onSecs().join(), $$("rb-tab-q").hidden ? "" : $$("rb-tab-q").dataset.help);
      // Close-up: router + mount + shoe top, no skirt / bristles / core; the core on its checkbox; Back = all again
      const shown = (re) => { const v = meshes.filter((m) => re.test(m.userData.name || "")).map((m) => m.visible); return v.length ? (v.every(Boolean) ? 1 : v.some(Boolean) ? 0.5 : 0) : -1; };
      out.coreN = meshes.filter((m) => m.userData.group === "Core" && !/^(Router_|Tool_Mount_|Dust_)/.test(m.userData.name || "")).map((m) => m.userData.name).slice(0, 3);
      const coreRe = new RegExp("^(" + out.coreN.join("|") + ")$");
      $$("rb-view").click(); await T.sleep(200);
      out.cu = [shown(/^Router_ColletNut$/), shown(/^Tool_Mount_/), shown(/^Dust_Shoe/), shown(/^(Dust_Skirt|Bristles_TPU)/), shown(coreRe), $$("rb-view").getAttribute("aria-pressed"), $$("rb-core-box").hidden];
      $$("rb-core").checked = true; $$("rb-core").dispatchEvent(new Event("change", { bubbles: true })); await T.sleep(100);
      out.cu.push(shown(coreRe), shown(/^(Dust_Skirt|Bristles_TPU)/));
      for (const id of ["rb-shoe", "rb-mb"]) { $$(id).checked = false; $$(id).dispatchEvent(new Event("change", { bubbles: true })); }
      await T.sleep(100);
      out.offs = [shown(/^Dust_Shoe/), shown(/^Tool_Mount_B/), shown(/^Tool_Mount_T/), shown(/^Router_ColletNut$/)];
      for (const id of ["rb-shoe", "rb-mb"]) { $$(id).checked = true; $$(id).dispatchEvent(new Event("change", { bubbles: true })); }
      await T.sleep(100);
      out.offs.push(shown(/^Dust_Shoe/), shown(/^Tool_Mount_B/));
      // on the model (router_edit.js): the numbers drawn; one clicked + typed; a handle dragged; the views
      const nb = (id) => document.querySelector('.rbx-n[data-id="' + id + '"]');
      out.rx = { n: document.querySelectorAll(".rbx-n").length, L: nb("cap-L") && nb("cap-L").textContent, fov: camera.fov, rot: controls.enableRotate };
      nb("cap-L").click(); await T.sleep(50);
      const box = nb("cap-L").querySelector("input");
      out.rx.box = !!box;
      if (box) { box.value = 90; box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }
      await T.sleep(400);
      out.rx.L2 = [LR4Routers.ROUTERS.testbox.model.motor_cap.L, nb("cap-L").textContent];
      const hd = document.querySelector('.rbx-h[data-id="cap-H"]'), r0 = hd.getBoundingClientRect(), H0 = LR4Routers.ROUTERS.testbox.model.motor_cap.H;
      const ev = (t, dy) => hd.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1, clientX: r0.left + 6, clientY: r0.top + 6 + dy }));
      ev("pointerdown", 0); ev("pointermove", -20); ev("pointermove", -40); ev("pointerup", -40);
      await T.sleep(400);
      out.rx.H = [H0, LR4Routers.ROUTERS.testbox.model.motor_cap.H];
      document.querySelector('.rbx-views [data-v="3d"]').click(); await T.sleep(100);
      out.rx.v3d = [camera.fov, controls.enableRotate];
      document.querySelector('.rbx-views [data-v="top"]').click(); await T.sleep(100);
      await T.sleep(300); out.rx.top = [camera.fov, !!nb("cap-Lt"), !!nb("cap-W"), [...document.querySelectorAll(".rbx-n")].map((e) => e.dataset.id).join(" ")];
      document.querySelector('.rbx-views [data-v="front"]').click(); await T.sleep(100);
      // a part picked by a click on the model: the motor housing (lit, its own numbers, a card with sliders), the cap, off = none
      const clickAt = (P) => { const rc = canvas.getBoundingClientRect(), o = { clientX: rc.left + P[0], clientY: rc.top + P[1], bubbles: true, pointerId: 1 };
        canvas.dispatchEvent(new PointerEvent("pointerdown", o)); canvas.dispatchEvent(new PointerEvent("pointerup", o)); };
      clickAt(rxScreen([0, -30, 75])); await T.sleep(100);
      const cardRows = () => [...document.querySelectorAll("#rbx-card .rbx-row span")].map((e) => e.textContent).join(",");
      out.rx.pick = [RX.sel, !!RX.ghost, cardRows(), document.querySelectorAll(".rbx-n").length, $$("pick").hidden];
      const sl = document.querySelector('#rbx-card .rbx-row[data-k="model.housing.l"] input[type=range]');
      const g0 = LR4Routers.ROUTERS.testbox.model.housing.l;
      sl.value = g0 + 10; sl.dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(400);
      out.rx.slide = [g0, LR4Routers.ROUTERS.testbox.model.housing.l, document.querySelector('#rbx-card .rbx-row[data-k="model.housing.l"] input[type=number]').value];
      clickAt(rxScreen([0, -36, LR4RouterDims.regions(LR4Routers.ROUTERS.testbox).find((g) => g.id === "motor_cap").shape.box[4] + 40])); await T.sleep(100);
      out.rx.head = [RX.sel, cardRows()];
      clickAt([20, canvas.clientHeight - 20]); await T.sleep(100);
      out.rx.off = [RX.sel, $$("rbx-card").hidden, !!RX.ghost];
      $$("rb-reset").click(); await T.sleep(200);
      // the dial + the shaft lock: the Kobalt
      LR4Router.set({ router: "kobalt" }); await T.sleep(300);
      out.rx.lockSide = ["lock-z", "lock-d"].map((id) => !!nb(id));
      document.querySelector('.rbx-views [data-v="top"]').click(); await T.sleep(100);
      out.rx.lockTop = ["lock-r", "lock-a", "dial-d"].map((id) => nb(id) && nb(id).textContent);
      nb("dial-d").click(); await T.sleep(50);
      const db = nb("dial-d").querySelector("input");
      if (db) { db.value = 30; db.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }
      await T.sleep(300);
      out.rx.dial = LR4Routers.ROUTERS.kobalt.model.dial.d;
      const ld = rxFind("lock-a"), C = rxScreen(ld.c), P = rxScreen(ld.b), rc = canvas.getBoundingClientRect();
      const ah = document.querySelector('.rbx-h[data-id="lock-a"]'), a0 = LR4Routers.ROUTERS.kobalt.model.shaft_lock.a;
      const rot = (deg) => { const t = deg * Math.PI / 180, dx = P[0] - C[0], dy = P[1] - C[1];
        return { clientX: rc.left + C[0] + dx * Math.cos(t) - dy * Math.sin(t), clientY: rc.top + C[1] + dx * Math.sin(t) + dy * Math.cos(t) }; };
      const pe = (t, deg) => ah.dispatchEvent(new PointerEvent(t, Object.assign({ bubbles: true, pointerId: 1 }, rot(deg))));
      pe("pointerdown", 0); pe("pointermove", 15); pe("pointermove", 30); pe("pointerup", 30);
      await T.sleep(300);
      out.rx.ang = [a0, LR4Routers.ROUTERS.kobalt.model.shaft_lock.a];
      document.querySelector('.rbx-views [data-v="front"]').click(); await T.sleep(100);
      $$("rb-reset").click(); await T.sleep(200);
      LR4Router.set({ router: "testbox" }); await T.sleep(100);
      const disp = (id) => getComputedStyle($$(id)).display;
      $$("insp-min").click();
      out.min = [disp("insp-tools"), disp("insp-card"), disp("insp-back")];
      $$("insp-min").click();
      out.min.push(disp("insp-tools"));
      $$("rb-view").click(); await T.sleep(200);
      out.cu.push(shown(/^(Dust_Skirt|Bristles_TPU)/), $$("rb-view").getAttribute("aria-pressed"), $$("rb-core-box").hidden);
      out.rx.after = [$$("rbx").hidden, camera.fov, controls.enableRotate];
      $$("rb-reset").click(); await T.sleep(200);
      $$("rb-core").checked = false;
      // undo / redo: steps (quick changes = one), the keys, New + Delete undone
      LR4Router.set({ router: "testbox" }); await T.sleep(100);
      const hL = () => LR4Routers.ROUTERS.testbox.model.motor_cap.L, type = async (v, ms) => { const el = $$("rb-h-L"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); await T.sleep(ms); };
      await type(100, 50); await type(110, 50); await type(120, 900); await type(130, 300);
      const u = { L: [hL()] };
      $$("rb-undo").click(); await T.sleep(100); u.L.push(hL());
      $$("rb-undo").click(); await T.sleep(100); u.L.push(hL(), !$$("rb-redo").disabled);
      $$("rb-redo").click(); await T.sleep(100); u.L.push(hL());
      $$("st-rt").open = true;
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); await T.sleep(100); u.L.push(hL());
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", ctrlKey: true, shiftKey: true, bubbles: true })); await T.sleep(100); u.L.push(hL());
      $$("rb-new").click(); await T.sleep(200);
      const nid = RT.set.router;
      $$("rb-undo").click(); await T.sleep(200);
      u.newU = [nid, !!LR4Routers.ROUTERS[nid], RT.set.router];
      $$("rb-redo").click(); await T.sleep(200);
      const cf = window.confirm; window.confirm = () => true;
      $$("rb-reset").click(); await T.sleep(200);
      window.confirm = cf;
      u.del = [!!LR4Routers.ROUTERS[nid], RT.set.router];
      $$("rb-undo").click(); await T.sleep(200);
      u.del.push(!!LR4Routers.ROUTERS[nid], RT.set.router === nid);
      $$("rb-reset").click(); await T.sleep(100);
      LR4Router.set({ router: "testbox" }); $$("rb-reset").click(); await T.sleep(200);
      out.undo = u;
      // the bristles' length (Options): extra long = the 32 mm strip, its tips ~10 mm lower; the BOM prints that file
      const tipZ = () => { const m = meshes.find((q) => q.userData.name === "Bristles_TPU_1"); m.updateMatrixWorld(); return new THREE.Box3().setFromObject(m).min.z; };
      const z22 = tipZ(), bl = (v) => document.querySelector('#bristle-len [data-v="' + v + '"]');
      out.bl = { shown: !$$("bristle-len").hidden, files: [needed.size, optional.size, userFiles.has([...optional][0])] };
      bl("long").click(); await T.sleep(1500);
      out.bl.dz = +(z22 - tipZ()).toFixed(1);
      out.bl.bom = JSON.stringify(bomAtSize()).includes("TPU_Bristles_22mm") && [...document.querySelectorAll("#bom-body td")].some((t) => t.textContent === "TPU_Bristles_32mm_Extra_Long");
      out.bl.kept = MS.get("lr4-bristles");
      bl("std").click(); await T.sleep(1500);
      out.bl.back = +(z22 - tipZ()).toFixed(1);
      out.errs = errs;
      return out;
    })()`);
    ok(b.L === 120 && b.custom && /^custom-/.test(b.router), `a reload keeps the edit (${b.L}) and the custom router (${b.router})`);
    ok(b.after === "kobalt" && b.gone, "Delete: gone, back to the Kobalt");
    ok(b.L2 === 78 && b.edits.length === 0, `Reset: the test router back to 78 (${b.L2}), no edits left (${b.edits})`);
    ok(b.head && b.head.L === 105 && b.head.W === 80 && b.headShown && !b.back, `Kobalt: the motor cap ${b.head && b.head.L} x ${b.head && b.head.W} (its lock back after Reset)`);
    ok(b.kLock && b.kLock.r === 28 && b.kLock.z === 24 && b.kLock.travel === 1.5 && b.lockOn, `the Kobalt: its shaft lock ${JSON.stringify(b.kLock)}`);
    ok(b.tr.l === "38" && b.tr.dShown && b.tr.after.join() === "cap,fillet,5,2,true,true", `the Carbide's transition (38): shaped to the cap, a 5 fillet, housing chamfer 2 (${JSON.stringify(b.tr)})`);
    ok(b.tr.look[0] === "rubber" && b.tr.look[1] === 0.88 && b.tr.look[2] === 0 && b.tr.look[3], `a look per part: a rubber housing, a blue collar (${JSON.stringify(b.tr.look)})`);
    const s = b.spin;
    ok(!s.ring && s.dialTris === 0 && s.body && Math.abs(s.d - 65) < 16, `the 65 mm spindle: no dial ring, its switch on, can ${s.d} across (with the plug) ${JSON.stringify(s)}`);
    ok(s.canShown && s.gripHidden, "spindle inputs: the can shown, the motor housing hidden");
    ok(b.toSpin[0] === "spindle" && b.toSpin[1] === "gcode" && b.toRouter === 78, `Router -> Spindle (${b.toSpin}) -> Router (motor cap ${b.toRouter})`);
    ok(b.shoe0.every(Boolean) && !b.shoe1[0] && !b.shoe1[1] && b.shoe1[2] && b.optHose && b.shoe2,
      `mount None: shoe + hose hidden, the tool mount stays, the hose option off (${JSON.stringify([b.shoe0, b.shoe1, b.optHose, b.shoe2])})`);
    ok(b.clampDef === "36.5" && b.dTip === 11.5 && b.dNut === 11.5 && b.note0 && b.dBack === 0,
      `nut below the clamp 36.5 (the default: level with the core's bottom) -> 25: router + bit 11.5 higher, both clamps on the housing (${b.dNut}, ${b.dTip}), Reset back (${b.dBack})`);
    ok(/upper clamp is off the motor housing|clamps are off the motor housing/.test(b.note1 || ""), `clamp off the housing noted: ${b.note1}`);
    ok(b.tabs.join() === "head,help-rb-head,colors,help-rb-colors", `tabs: one section shown, the ? follows (${b.tabs})`);
    const c = b.cu;
    ok(c[0] === 1 && c[1] === 1 && c[2] === 1 && c[3] === 0 && c[4] === 0 && c[5] === "true" && c[6] === false,
      `close-up: router, mount, shoe top; no skirt / bristles / core (${b.coreN}) ${JSON.stringify(c)}`);
    ok(c[7] === 1 && c[8] === 0 && c[9] === 1 && c[10] === "false" && c[11] === true, `close-up: Show the core, then Back: everything again ${JSON.stringify(c)}`);
    ok(b.offs.join() === "0,0,1,1,1,1", `close-up: shoe top + lower mount off (bolts too), the upper mount + router stay, back on (${b.offs})`);
    const x = b.rx;
    ok(x.n >= 12 && x.L === "78" && x.fov === 8 && !x.rot, `on the model: ${x.n} numbers (motor cap length ${x.L}), the flat side view (fov ${x.fov}, no orbit)`);
    ok(x.box && x.L2[0] === 90 && x.L2[1] === "90", `click the cap length, type 90 + Enter: the router ${x.L2}`);
    ok(x.H[1] > x.H[0] + 5, `drag the cap height's handle up 40 px: ${x.H[0]} -> ${x.H[1]}`);
    ok(x.v3d[0] === 35 && x.v3d[1] && x.top[0] === 8 && x.top[1] && !x.top[2], `3D: the usual lens + orbit (${x.v3d}); Top: length + its own width line (${x.top})`);
    ok(x.lockSide.every(Boolean) && x.lockTop[0] === "28" && /°$/.test(x.lockTop[1] || "") && /^Ø/.test(x.lockTop[2] || ""), `the lock + dial on the model: side ${x.lockSide}, top ${x.lockTop}`);
    ok(x.dial === 30, `dial Ø typed on the model: ${x.dial}`);
    ok(Math.abs(Math.abs(x.ang[1] - x.ang[0]) - 30) <= 1, `the lock's tip turned 30° on screen: ${x.ang[0]} -> ${x.ang[1]}`);
    ok(x.pick[0] === "housing" && x.pick[1] && x.pick[2] === "Length,Ø,Chamfer" && x.pick[3] <= 4 && x.pick[4], `click the motor housing: picked + lit, its card (${x.pick})`);
    ok(x.slide[1] === x.slide[0] + 10 && +x.slide[2] === x.slide[1], `the housing's length slider: ${x.slide}`);
    ok(x.head[0] === "motor_cap" && /^Length,Width,Height,Top fillet/.test(x.head[1]), `click the motor cap: ${x.head}`);
    ok(x.off[0] === null && x.off[1] && !x.off[2], `a click off the router lets it go (${x.off})`);
    ok(x.after[0] && x.after[1] === 35 && x.after[2], `Back: the numbers gone, the lens + orbit back (${x.after})`);
    ok(b.min[0] === "none" && b.min[1] === "none" && b.min[2] !== "none" && b.min[3] !== "none", `Hide panels: tools + list folded, Back stays; Show again (${b.min})`);
    const u = b.undo;
    ok(u.L.join() === "130,120,78,true,120,78,120", `undo / redo: 100-110-120 one step, 130 another; the keys (${u.L})`);
    ok(/^custom-/.test(u.newU[0]) && !u.newU[1] && u.newU[2] === "testbox", `New undone: the copy gone, back on the test router (${u.newU})`);
    ok(!u.del[0] && u.del[2] && u.del[3], `Delete undone: the router back and picked (${u.del})`);
    ok(b.bl.shown && b.bl.dz > 8 && b.bl.dz < 11 && b.bl.bom && b.bl.kept === "long" && b.bl.back === 0 && b.bl.files[1] >= 1 && b.bl.files[2] && !b.bl.files[0] === false,
      `bristles: extra long = tips ${b.bl.dz} mm lower, the BOM's file, kept; standard back (${JSON.stringify(b.bl)})`);
    ok(b.errs.length === 0, `no page errors (${b.errs})`);
  } catch (e) { ok(false, "threw: " + e.message); }
  finally { await page.close(); srv.kill(); }
  console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
