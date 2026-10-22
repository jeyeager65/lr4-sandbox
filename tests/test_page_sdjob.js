// Part 17 in headless Chrome (serve.py's headers): the SD card and a job run on FluidNC.
//  - the strut plate G-code lands on the card (IndexedDB) as /LR4_strut_plates.gcode; a file added through the page
//    (no Stock / ToolDef) gets its stock and bit from the form, kept per file;
//  - FluidNC boots with the card ($SD/List shows both); $SD/Delete in the console takes a file off the card in the
//    store too; a file added while it runs appears on its card at once;
//  - after $H: the small file runs at 1x, and after $H again the strut job at 10x ($SD/Run, both M0 holds resumed from the popup, the
//    touch plate put on for the probe and taken off), each to Done, carving the same stock as Playback (cells off
//    by more than 0.05 mm: < 0.1%; none by more than one cell's slope).
//  - the Flash: FluidNC boots sim_config.yaml (Config/Filename), config.yaml there is the real file; changing it on
//    the Flash makes it the config in use (FluidNC restarts with it), and it's still "yours" after a reload.
//   node tests/test_page_sdjob.js      (not in npm test: needs Chrome + Python; ~5 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

// a small job with no (Stock:) / ToolDef: two pockets 2 mm deep, an arc, in mm from the work zero
const SMALL = ["G21 G90 G54", "T1", "G0 Z5", "G0 X20 Y20", "G1 Z-2 F300", "G1 X60 F1200", "G2 X60 Y40 I0 J10", "G1 X20",
  "G3 X20 Y20 I0 J-10", "G0 Z5", "G0 X10 Y10", "M30", ""].join("\n");

// in the page: run the selected job to its end at speed k, resuming each hold from the popup; then compare its carve
const RUN = (k) => `(async () => {
  const out = { holds: [], plates: [] }, sp = document.getElementById("ctl-speed");
  sp.value = "${k}"; sp.dispatchEvent(new Event("change"));
  const t0 = performance.now();
  document.getElementById("job-play").click();
  await T.until(() => LR4Job.running(), 10000);
  out.started = LR4Job.running();
  while (LR4Job.running()) {
    await T.sleep(100);
    if (LR4Job.held() && !document.getElementById("job-pop").hidden) {
      out.holds.push(document.getElementById("job-pop-msg").textContent);
      out.plates.push(document.getElementById("ctl-plate").checked);
      await T.sleep(300);
      document.getElementById("job-resume").click();
      await T.until(() => !LR4Job.held(), 10000);
    }
    if (performance.now() - t0 > 900000) break;
  }
  out.secs = (performance.now() - t0) / 1000;
  out.status = document.getElementById("job-status").textContent;
  out.plateAfter = document.getElementById("ctl-plate").checked;
  out.log = [...document.querySelectorAll("#ctl-log > div")].slice(-25).map((d) => d.textContent);
  const a = LR4Job.sim(), b = LR4Job.playbackHeights();
  let n = 0, big = 0, cut = 0, cutRef = 0;
  for (let i = 0; i < a.heights.length; i++) {
    const d = Math.abs(a.heights[i] - b.heights[i]);
    if (d > 0.05) n++;
    if (d > a.dx + 0.01) big++;
    if (a.heights[i] < a.stock.zmax - 1e-3) cut++;
    if (b.heights[i] < b.stock.zmax - 1e-3) cutRef++;
  }
  Object.assign(out, { cells: a.heights.length, off: n / a.heights.length, big, cut, cutRef });
  return out;
})()`;

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, "web", "fluidnc", "program.wasm"))) { console.log("web/fluidnc/program.wasm missing"); process.exit(1); }
  const port = 8890 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Job && !!LR4Ctl.travel() && document.getElementById('status').hidden"); } catch (e) { /* loading */ }
    }
    ok(up, "page loaded, cross-origin isolated");
    if (!up) return;
    await page.val(HELPERS);

    // the card: the strut job on it, a file added with its stock + bit from the form
    const c = await page.val(`(async () => {
      document.getElementById("t-run").click();
      document.getElementById("job-temp").click();
      await T.until(() => LR4Job.files().includes(LR4Job.PAGE_SD), 10000);
      const out = { files0: LR4Job.files() };
      await LR4Job.add([new File([${JSON.stringify(SMALL)}], "small job.nc")]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/small_job.nc" && LR4Job.tl(), 10000);
      out.files1 = LR4Job.files();
      out.form = !document.getElementById("job-def").hidden && document.getElementById("job-def").open;
      out.guess = ["def-x0", "def-x1", "def-y0", "def-y1", "def-t"].map((id) => +document.getElementById(id).value);
      out.toolRows = document.querySelectorAll("#job-def-tools [data-tool]").length;
      out.stock0 = !!LR4Job.tl().stock;
      const set = (id, v) => { document.getElementById(id).value = v; };
      set("def-x0", -10); set("def-x1", 80); set("def-y0", 0); set("def-y1", 60); set("def-t", 12);
      document.querySelector('#job-def-tools [data-k="d"]').value = 3.175;
      document.getElementById("job-def-use").click();
      await T.until(() => LR4Job.tl() && LR4Job.tl().stock, 10000);
      out.stock1 = LR4Job.tl().stock; out.tool = LR4Job.tl().tools.get(1);
      out.note = document.getElementById("job-def-note").hidden;
      return out;
    })()`);
    ok(c.files0.includes("/LR4_strut_plates.gcode"), `strut G-code on the card: ${c.files0}`);
    ok(c.files1.includes("/small_job.nc"), `added file cleaned to /small_job.nc: ${c.files1}`);
    ok(c.form && !c.stock0 && c.toolRows === 1 && c.guess.join() === "0,60,0,40,3", `no stock / bit: form open, guess ${c.guess}`);
    ok(c.stock1 && c.stock1.xmin === -10 && c.stock1.zmin === -12 && c.tool && Math.abs(c.tool.diameter - 3.175) < 1e-9 && c.note,
      `form -> stock ${JSON.stringify(c.stock1)}, T1 ${c.tool && c.tool.diameter}`);

    // FluidNC boots with the card; $SD/List; a live add; $SD/Delete syncs back
    const f = await page.val(`(async () => {
      document.querySelector('#ctl-mode [data-v="fluidnc"]').click();
      const sim = await T.booted(null), out = {};
      if (!sim) return { boot: false };
      await T.idle();
      const list = async () => (await sim.command("$SD/List")).lines.map((e) => e.line).join(" ");
      out.list = await list();
      await LR4Job.add([new File(["G0 X1\\n"], "extra.nc")]);
      out.list2 = await list();
      const sel = LR4Job.src().name;
      document.getElementById("ctl-in").value = "$SD/Delete=/extra.nc";
      document.getElementById("ctl-form").requestSubmit();
      await T.until(() => !LR4Job.files().includes("/extra.nc"), 10000);
      out.files = LR4Job.files();
      out.list3 = await list();
      LR4Job.select("/small_job.nc");
      await T.sleep(300);
      // home at 10x
      const sp = document.getElementById("ctl-speed"); sp.value = "10"; sp.dispatchEvent(new Event("change"));
      document.getElementById("home").click();
      await T.until(() => /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 120000);
      out.home = document.getElementById("home-status").textContent;
      await T.idle();
      await T.until(() => LR4Job.tl() && LR4Job.src().name === "/small_job.nc", 10000);
      return out;
    })()`);
    ok(/LR4_strut_plates\.gcode/.test(f.list) && /small_job\.nc/.test(f.list), `$SD/List: ${f.list}`);
    ok(/extra\.nc/.test(f.list2), "a file added while FluidNC runs is on its card");
    ok(!f.files.includes("/extra.nc") && !/extra\.nc/.test(f.list3), `$SD/Delete took it off the store too: ${f.files}`);
    ok(/^Homed by FluidNC/.test(f.home), f.home);

    // the Flash: FluidNC booted the translated copy; config.yaml is the real one. A config.yaml changed on its Flash
    // becomes the one in use (FluidNC restarts with it) and comes back after a reload.
    const fl = await page.val(`(async () => {
      const sim = window.LR4FluidNC, out = {};
      out.list = (await sim.command("$LocalFS/List")).lines.map((e) => e.line).join(" ");
      out.file = (await sim.command("$Config/Filename")).lines.map((e) => e.line).join(" ");
      const real = new TextDecoder().decode(sim.FS.readFile("/native_localfs/config.yaml"));
      out.real = /i2so|spi|tmc|uart/i.test(real);
      sim.writeFile("/native_localfs/config.yaml", real.replace(/max_rate_mm_per_min:\\s*\\S+/, "max_rate_mm_per_min: 8000"));
      document.getElementById("ctl-in").value = "$LocalFS/List";
      document.getElementById("ctl-form").requestSubmit();
      const sim2 = await T.booted(sim);
      out.note = LR4Job.yamlNote();
      out.log = [...document.querySelectorAll("#ctl-log > div")].slice(-12).map((d) => d.textContent);
      out.store = (await SdCard.flash.store.all()).map((r) => [r.path, r.bytes.length, r.origin]);
      out.rate = sim2 ? await T.setting(sim2, "/axes/x/max_rate_mm_per_min") : null;
      await T.sleep(1500);                              // the Flash write is debounced
      return out;
    })()`);
    ok(/config\.yaml/.test(fl.list) && /sim_config\.yaml/.test(fl.list) && /sim_config\.yaml/.test(fl.file), `Flash: ${fl.list}; ${fl.file}`);
    ok(fl.real, "config.yaml on the Flash is the real file (its i2so / spi / uart blocks)");
    if (!/changed on FluidNC's Flash/.test(fl.note)) console.log("  flash: " + JSON.stringify({ store: fl.store, log: fl.log }));
    ok(/changed on FluidNC's Flash/.test(fl.note) && fl.rate === 8000, `config.yaml changed on the Flash: in use (${fl.note}), X rate ${fl.rate}`);
    const rh = await page.val(`(async () => {             // the restart lost the homing: home again
      await T.idle();
      document.getElementById("home").click();
      await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 120000);
      await T.idle();
      LR4Job.select("/small_job.nc");
      await T.until(() => LR4Job.tl() && LR4Job.src() && LR4Job.src().name === "/small_job.nc", 10000);
      return document.getElementById("home-status").textContent;
    })()`);
    ok(/^Homed by FluidNC/.test(rh), "homed again after the restart");

    if (!process.env.SKIP_JOBS) {                       // SKIP_JOBS=1: card + Flash only (quick)
    const s1 = await page.val(RUN(1));
    console.log(`  small job 1x: ${s1.secs.toFixed(1)} s, ${s1.holds.length} holds, cut ${s1.cut} / ${s1.cutRef} cells`);
    ok(s1.started && s1.status === "Done." && s1.holds.length === 0, `small job at 1x: ${s1.status}`);
    ok(s1.cutRef > 50 && s1.off < 1e-3 && s1.big === 0, `small job carves as Playback: ${(s1.off * 100).toFixed(3)}% cells differ, ${s1.big} by > a cell's slope`);

    const s2 = await page.val(`(async () => {
      document.getElementById("home").click();          // home again: the strut job zeroes where it starts (G10 L20)
      await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 120000);
      await T.idle();
      LR4Job.select(LR4Job.PAGE_SD); await T.sleep(500); await T.until(() => LR4Job.tl() && LR4Job.src().kind === "page", 10000); return LR4Job.src().name; })()`);
    ok(/strut/i.test(s2), `strut job picked: ${s2}`);
    const s3 = await page.val(RUN(10));
    console.log(`  strut job 10x: ${s3.secs.toFixed(0)} s, holds ${JSON.stringify(s3.holds)}, plate ${s3.plates}, cut ${s3.cut} / ${s3.cutRef} cells`);
    if (s3.status !== "Done.") console.log("  console: " + s3.log.join("\n  console: "));
    ok(s3.started && s3.status === "Done.", `strut job at 10x: ${s3.status}`);
    ok(s3.holds.length === 2 && /Attach Probe/.test(s3.holds[0]) && /Remove Probe/.test(s3.holds[1]), `M0 holds: ${s3.holds}`);
    ok(s3.plates[0] === true && s3.plates[1] === false && !s3.plateAfter, `touch plate on for the probe, off after: ${s3.plates}`);
    ok(s3.cutRef > 1000 && s3.off < 1e-3 && s3.big === 0, `strut job carves as Playback: ${(s3.off * 100).toFixed(3)}% cells differ, ${s3.big} by > a cell's slope`);

    }
    await page.send("Page.reload");
    let back = null;
    for (let i = 0; i < 120 && !back; i++) {
      await sleep(500);
      try { back = await page.val("window.LR4Job && LR4Ctl.travel() && document.getElementById('status').hidden ? [LR4Job.yamlNote(), LR4Job.flashList()] : null"); } catch (e) { /* loading */ }
    }
    ok(back && /^From your config\.yaml \(kept on the Flash\)/.test(back[0]) && /\(yours\)/.test(back[1]), `after a reload: ${back && back.join(" | ")}`);
  } finally {
    await page.close();
    srv.kill();
  }
  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
