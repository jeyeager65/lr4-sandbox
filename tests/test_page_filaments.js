// Part 40 in headless Chrome: the printed look + filaments. Checks every printed part has the print shader and a print
// Z, the presets (classic: mounts on PETG; fiber: Core / YZ plates / outer braces / mounts on the fiber spool), a
// per-part override from the selection chip's "Printed in", the share link round trip and the strut plate material.
// Screenshots: build/filaments_far.png, build/filaments_close.png (the Core's layer lines up close).
//   node tests/test_page_filaments.js   (not in npm test: needs Chrome + Python; ~1 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const shot = async (page, name) => {
  const png = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ROOT, "build", name), Buffer.from(png.data, "base64"));
};

const STATE = `(() => {
  const pr = meshes.filter((m) => m.material.userData && m.material.userData.print && !m.userData.standin);
  const by = (n) => meshes.find((m) => m.userData.name === n);
  const sp = (n) => FIL.map.get(n);
  const braces = pr.filter((m) => /^Brace_/.test(m.userData.name)).map((m) => [m.userData.name, sp(m.userData.name)]);
  return { n: pr.length, noDir: pr.filter((m) => m.material.userData.print.uPrintDir.value.length() < 0.5).map((m) => m.userData.name),
    core: sp("Core"), mount: sp("Tool_Mount_T_Kobalt"), stub: sp("Z_Stub_Min"), yz: sp("YZ_Plate_Min"), bristle: sp("Bristles_TPU_1"),
    braces, coreRough: by("Core").material.roughness, spools: FIL.s.spools.map((s) => s.mat), preset: FIL.s.preset,
    lines: PRINT.lines.value, plate: (by("StrutPlate_Front") || { material: {} }).material.transparent };
})()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("document.getElementById('status').hidden && !!window.LR4Job && !!LR4Job.spoil()"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded");
    await page.val(HELPERS);
    await page.val(`MS.remove("lr4-filaments"); FIL.s = LR4Filaments.defaults(); LR4Machine.apply({ struts: "mdf" }); true`);
    await sleep(2000);
    await page.val(`FIL.s = Object.assign(LR4Filaments.defaults(), { look: "on" }); applyColours(); true`);
    let a = await page.val(STATE);
    ok(a.n > 40, `${a.n} printed meshes with the print shader`);
    ok(a.noDir.every((n) => /^(Bristles_TPU|Pendant_)/.test(n)), `a print Z on all but the bristles / pendant: ${a.noDir.join(", ") || "-"}`);
    ok(a.core === 0 && a.stub === 1 && a.mount === 2 && a.bristle === -1 && a.spools[2] === "PETG", `classic: ${JSON.stringify([a.core, a.stub, a.mount, a.bristle, a.spools])}`);
    ok(a.lines === 1, "layer lines on (headless Chrome is Lite: auto would be off)");
    await shot(page, "filaments_far.png");

    await page.val(`document.querySelector('#fil-preset button[data-v="fiber"]').click(); true`);
    await sleep(300);
    a = await page.val(STATE);
    const outer = [a.braces[0], a.braces[a.braces.length - 1]];
    ok(a.preset === "fiber" && a.core === 2 && a.yz === 2 && a.mount === 2 && Math.abs(a.coreRough - 0.9) < 1e-6, `fiber: Core / YZ / mount on PET-CF (${a.coreRough})`);
    ok(a.braces.filter(([, v]) => v === 2).length === 2, `fiber: 2 of ${a.braces.length} braces: ${a.braces.filter(([, v]) => v === 2).map(([n]) => n)}`);

    // Printed in, from the chip
    await page.val(`select(meshes.find((m) => m.userData.name === "Z_Stub_Min")); true`);
    const chip = await page.val(`(() => { const b = document.getElementById("pick-fil"); b.querySelector(".fil-dd-btn").click();
      const o = [...b.querySelectorAll(".fil-dd-menu button")]; return { hidden: b.hidden, open: !b.querySelector(".fil-dd-menu").hidden,
      opts: o.length, sw: o.filter((x) => x.querySelector(".fil-sw")).length, text: o.map((x) => x.textContent) }; })()`);
    ok(!chip.hidden && chip.open && chip.opts === 4 && chip.sw === 4 && chip.text.every((t) => !/#[0-9a-f]{6}/i.test(t)),
      `chip: Printed in menu with swatches + names: ${chip.text.join(" | ")}`);
    await shot(page, "filaments_chip.png");
    await page.val(`document.querySelector('#pick-fil .fil-dd-menu button[data-v="0"]').click(); true`);
    a = await page.val(STATE);
    ok(a.stub === 0, `override: Z_Stub_Min on spool 1 (${a.stub})`);
    const link = await page.val(`shareLink()`);
    ok(/preset=fiber/.test(link) && /parts=Z_Stub_Min\.1/.test(link), `link: ${link}`);
    const back = await page.val(`JSON.stringify(LR4Filaments.fromLink(Object.fromEntries(new URLSearchParams(shareLink().split("&").slice(1).join("&"))))) === JSON.stringify(FIL.s)`);
    ok(back, "link round trip");
    const ed = await page.val(`(() => { const e = document.getElementById("fil-edited"); return { shown: !e.hidden, from: document.getElementById("fil-from").textContent,
      pressed: document.querySelectorAll('#fil-preset button[aria-pressed="true"]').length }; })()`);
    ok(ed.shown && ed.from === "Fiber upgrade" && ed.pressed === 0, `edited from "${ed.from}", no preset pressed`);
    // save it as my own preset, then it's the pressed one under Mine
    await page.val(`(async () => { MS.remove("lr4-fil-presets"); FIL.saved = []; document.getElementById("fil-save").click();
      document.getElementById("fil-save-name").value = "My fiber"; document.getElementById("fil-save-form").requestSubmit(); return true; })()`);
    const mine = await page.val(`(() => ({ mine: [...document.querySelectorAll('#fil-mine button')].map((b) => b.textContent + ":" + b.getAttribute("aria-pressed")),
      edited: !document.getElementById("fil-edited").hidden, stored: JSON.parse(MS.get("lr4-fil-presets") || "[]").length,
      names: [...document.querySelectorAll("#fil-spools .fil-n")].map((e) => e.textContent) }))()`);
    ok(mine.mine.join() === "My fiber:true" && !mine.edited && mine.stored === 1, `saved preset: ${mine.mine.join()} (stored ${mine.stored})`);
    ok(mine.names.join() === "Black PLA,Red PLA,Black PET-CF", `filament names: ${mine.names.join(", ")}`);
    // change it: "Unsaved changes to My fiber" + Save "My fiber"; saving says so and clears the line
    const upd = await page.val(`(async () => { FIL.s.spools[1].color = "#1f5fbf"; filSave(); applyColours();
      const w = { what: document.getElementById("fil-ed-what").textContent, btn: document.getElementById("fil-update").textContent,
        shown: !document.getElementById("fil-update").hidden };
      document.getElementById("fil-update").click();
      return Object.assign(w, { ok: document.getElementById("fil-ok").textContent, edited: !document.getElementById("fil-edited").hidden,
        stored: JSON.parse(MS.get("lr4-fil-presets"))[0].spools[1].color }); })()`);
    ok(upd.what === "Unsaved changes to" && upd.shown && upd.btn === 'Save "My fiber"', `edited own preset: "${upd.what}" + ${upd.btn}`);
    ok(/Saved to "My fiber"/.test(upd.ok) && !upd.edited && upd.stored === "#1f5fbf", `saved: "${upd.ok}", stored ${upd.stored}`);
    const rn = await page.val(`(() => { document.getElementById("fil-rename").click(); document.getElementById("fil-save-name").value = "Fiber v2";
      document.getElementById("fil-save-form").requestSubmit();
      return { mine: [...document.querySelectorAll('#fil-mine button')].map((b) => b.textContent).join(), saved: FIL.s.saved,
        ok: document.getElementById("fil-ok").textContent, stored: JSON.parse(MS.get("lr4-fil-presets")).map((p) => p.name).join() }; })()`);
    ok(rn.mine === "Fiber v2" && rn.saved === "Fiber v2" && rn.stored === "Fiber v2" && /Renamed/.test(rn.ok), `rename: ${JSON.stringify(rn)}`);
    await page.val(`document.querySelector('#fil-preset button[data-v="classic"]').click(); true`);
    await page.val(`document.querySelector('#fil-mine button').click(); true`);
    a = await page.val(STATE);
    ok(a.stub === 0 && a.preset === "fiber", "the saved preset comes back with its override");
    await page.val(`(() => { FIL.s.parts = {}; FIL.saved = []; MS.remove("lr4-fil-presets"); FIL.s.saved = null; applyColours(); select(null); return true; })()`);
    a = await page.val(STATE);
    ok(a.stub === 1, "override cleared");

    // the strut plates: acrylic is see-through
    await page.val(`(() => { const s = document.querySelector('#fil-plates select'); s.value = "acrylic"; s.dispatchEvent(new Event("change")); return true; })()`);
    a = await page.val(STATE);
    ok(a.plate === true, "front plate acrylic: transparent");

    // Peter Plates: the bed (print z 0) is the outermost face, every style
    const PETER = `(() => meshes.filter((m) => /^PeterPlate_/.test(m.userData.name) && m.material.userData.print).map((m) => {
      const u = m.material.userData.print, d = u.uPrintDir.value, p = m.geometry.attributes.position.array, out = /_Min$/.test(m.userData.name) ? -1 : 1;
      let xo = -Infinity, z = 0;
      for (let i = 0; i < p.length; i += 3) if (p[i] * out > xo) { xo = p[i] * out; z = d.x * p[i] + d.y * p[i + 1] + d.z * p[i + 2] + u.uPrintOff.value; }
      return [m.userData.name, +z.toFixed(3), d.x * out < 0];
    }))()`;
    for (const st of ["open", "closed", "honeycomb"]) {
      await page.val(`LR4Machine.apply({ peter: "${st}" }); true`);
      await sleep(1500);
      const pp = await page.val(PETER);
      ok(pp.length === 4 && pp.every(([, z, inward]) => Math.abs(z) < 0.05 && inward), `peter ${st}: outer face on the bed ${JSON.stringify(pp)}`);
    }
    await page.val(`LR4Machine.apply({ peter: "open" }); (() => { const c = meshes.find((m) => m.userData.name === "PeterPlate_B_Max");
      c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld), m = b.getCenter(new THREE.Vector3());
      controls.target.copy(m); camera.position.set(m.x + 120, m.y - 60, m.z + 30); controls.update(); return true; })()`);
    await sleep(1000);
    await shot(page, "filaments_peter.png");

    // up close: the Core's layer lines
    await page.val(`document.querySelector('#fil-preset button[data-v="classic"]').click(); LR4Inspect.open("Core"); true`);
    await sleep(1500);
    await page.val(`(() => { const c = meshes.find((m) => m.userData.name === "Core"); c.geometry.computeBoundingBox();
      const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld), m = b.getCenter(new THREE.Vector3());
      controls.target.copy(m); camera.position.set(m.x + 90, m.y - 150, m.z + 70); controls.update(); return true; })()`);
    await sleep(800);
    await shot(page, "filaments_close.png");
    await page.val(`LR4Inspect.close(); document.querySelector('#fil-preset button[data-v="classic"]').click(); MS.remove("lr4-filaments"); true`);
    // a link opened in a fresh page: its filaments win over this browser's saved ones
    await page.val(`MS.set("lr4-filaments", JSON.stringify(LR4Filaments.defaults())); true`);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/&fresh=1#26x50&preset=single&spools=PETG_1f5fbf~PLA_cc1f1a&parts=Core.2~Brace_1.2&layer=0.28&plates=acrylic_e8eef0~plywood_dbad70&ab=1&abx=m0_max~wx_-0.3` });
    let up2 = false;
    for (let i = 0; i < 120 && !up2; i++) { await sleep(500); try { up2 = await page.val("location.hash.includes('preset=single') && !!window.LR4Job && document.getElementById('status').hidden && !!LR4Job.spoil()"); } catch (e) { /* loading */ } }
    await sleep(1500);
    const lk = await page.val(`JSON.stringify({ preset: FIL.s.preset, sp: FIL.s.spools.length, parts: FIL.s.parts, layer: FIL.s.layer, front: FIL.s.plates.front.mat,
      core: FIL.map.get("Core"), brace: FIL.map.get("Brace_1"), y: FIL.map.get("Y_Clip_1"),
      coreCol: "#" + meshes.find((m) => m.userData.name === "Core").material.color.clone().convertLinearToSRGB().getHexString() })`);
    ok(lk === JSON.stringify({ preset: "single", sp: 2, parts: { Core: 1, Brace_1: 1 }, layer: 0.28, front: "acrylic", core: 1, brace: 1, y: 0, coreCol: "#cc1f1a" }),
      `fresh page from a link (per-part filaments too): ${lk}`);
    const abl = await page.val(`(() => { const a = LR4AsBuilt.get(); const l = shareLink(); LR4AsBuilt.set({ on: false, motor0: "min", warp: { x: 0.3 } });
      return { on: a.on, m0: a.motor0, wx: a.warp.x, link: /ab=1/.test(l) && /abx=m0_max~wx_-0.3/.test(l) }; })()`);
    ok(abl.on && abl.m0 === "max" && abl.wx === -0.3 && abl.link, `As built from the link and back into it: ${JSON.stringify(abl)}`);
    await page.val(`MS.remove("lr4-filaments"); true`);
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    await page.close();
    srv.kill();
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
