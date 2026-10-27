// lr4-sandbox page: the switch panel's power (Part 44f, user 2026-10-27) - the e-stop, the power lamp, the router + vac
// rockers (scene.js switchPanelMeshes) and the router's own switch. The page's scripts share one global scope.
  // ---- the e-stop cuts the mains: FluidNC goes down (a job stops where it is, the motors go limp: not homed after),
  // the pendant goes dark, the router + vac spin down, the bit cools; heat / smoke / fire carry on by themselves
  // (heat_fx.js heatCoast). Released (a quarter twist): the power is back, FluidNC boots and wants $H. The rockers
  // switch the router / vac (lit = on with power); the router's own switch (Router_Switch, on by default) is in series
  // with its rocker. The router still turns only when the job turns it on (M3 / the file's dial pause), the vac with
  // it. Click them in the view (as the pendant's screen), or Run's E-STOP / Router / Vac buttons. PWR: machine.js. ----
  function estopPress() {
    if (PWR.estop) return false;
    PWR.estop = true;
    if (SND.s) SND.s.event("switch");
    if (FJ.job) fjDone("E-STOP: power off - the job stopped where it was.");
    CTL.booting = null;                              // a boot under way drops its FluidNC
    ctlStop();
    ftStop();
    ctlAdd("E-STOP pressed: power off. FluidNC is down (the motors limp, not homed), the router and vac spin down. " +
      "Twist the e-stop to release it.", "err");
    ctlMsg("E-STOP pressed - power off. Twist the e-stop to release it: FluidNC restarts, then home it.");
    powerLook();
    return true;
  }
  function estopRelease() {
    if (!PWR.estop) return false;
    PWR.estop = false;
    if (SND.s) SND.s.event("switch");
    ctlAdd("E-stop released: power on. FluidNC restarts - home it before a job.", "dim");
    powerLook();
    if (window.crossOriginIsolated) {                // as Power cycle (As built: the gantry comes up racked)
      if (AB.set.on) abPowerCycle(); else { if (JOB.preview) previewEnd(); ctlBoot(); }
    }
    return true;
  }
  function powerSet(k, on) {                         // k: "router", "vac" (the rockers) or "body" (the router's own switch)
    on = on === undefined ? !PWR[k] : !!on;
    if (PWR[k] === on) return on;
    PWR[k] = on;
    if (SND.s) SND.s.event("switch");
    const what = { router: "Router rocker", vac: "Vac rocker", body: "The router's own switch" }[k];
    ctlAdd(`${what} ${on ? "on" : "off"}${PWR.estop && on ? " (no power: the e-stop is pressed)" : ""}.`, "dim");
    powerLook();
    return on;
  }
  function powerClick(k) { if (k === "estop") { if (PWR.estop) estopRelease(); else estopPress(); } else powerSet(k); }
  function powerWhy() {                              // why the router can't run now ("" = it can)
    return PWR.estop ? "E-STOP pressed: no power" : !PWR.router ? "The router's rocker is off" :
      !PWR.body ? "The router's own switch is off (click it on the router)" : "";
  }
  // the panel and the router's switch as PWR says: the e-stop head in / out, the lamp and rockers lit or dark, the
  // rockers rocked; Run's buttons. Parts move by their base (move() places every part from it); after each rebuild too.
  function powerLook() {
    const lit = (m, on) => {
      const ud = m.userData, c = on ? ud.lens : ud.color;
      m.material.color.setRGB(...c).convertSRGBToLinear();
      m.material.emissive.setRGB(...(on ? ud.lens : [0, 0, 0])).convertSRGBToLinear();
      m.material.emissiveIntensity = on ? 0.9 : 1;
    };
    const at = (ud, dy, dz) => { ud.base = { t: [ud.t0[0], ud.t0[1] + dy, ud.t0[2] + dz], s: ud.base.s }; };   // a new base: never one it shares
    for (const m of meshes) {
      const ud = m.userData, n = ud.name;
      if (!/^SwitchPanel_|^Router_Switch$/.test(n) || !ud.base) continue;
      if (!ud.t0) ud.t0 = ud.base.t.slice();
      if (n === "SwitchPanel_EStop") at(ud, PWR.estop ? SWP.travel : 0, 0);
      else if (n === "SwitchPanel_Lamp") lit(m, !PWR.estop);
      else if (n === "SwitchPanel_Router" || n === "SwitchPanel_Vac") { m.rotation.x = PWR[ud.click] ? -0.17 : 0.17; lit(m, PWR[ud.click] && !PWR.estop); }
      else if (n === "Router_Switch") at(ud, 0, PWR.body ? 0 : -3);   // off: slid down (GUESS: the Kobalt's slide)
    }
    if (meta && HOME.pose) move([HOME.pose.x, HOME.pose.y, HOME.pose.z]);
    const b = $("pwr-estop");
    b.textContent = PWR.estop ? "↻ Release" : "E-STOP";
    b.title = PWR.estop ? "Twist the e-stop to release it: the power comes back, FluidNC restarts (home it after)" :
      "Emergency stop: cuts the power - FluidNC, the router and the vac stop";
    b.setAttribute("aria-pressed", String(PWR.estop));
    for (const q of document.querySelectorAll("[data-pwr=estop]")) { q.setAttribute("aria-pressed", String(PWR.estop)); q.title = b.title; }
    for (const k of ["router", "vac"]) {
      const e = $("pwr-" + k);
      e.setAttribute("aria-pressed", String(PWR[k]));
      e.classList.toggle("lit", PWR[k] && !PWR.estop);
    }
    const why = powerWhy(), note = $("pwr-note");
    note.textContent = why && why !== "E-STOP pressed: no power" ? why + ": the router won't start." : PWR.estop ? "No power: the lamp and rockers are dark." : "";
    note.hidden = !note.textContent;
    runState();
  }
  {                                                  // clicks on the panel / the router's switch in the view
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), stage = canvas.parentElement;
    const kindOf = (m) => m.userData.click || (m.userData.name === "Router_Switch" ? "body" : null);
    const hitAt = (e, all) => {                      // all: blocked by parts in front (a press); else the switches only (hover)
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const list = meshes.filter((q) => q.visible && !q.userData.shadowOnly && (all || kindOf(q)));
      const h = ray.intersectObjects(list, false)[0];
      return h ? kindOf(h.object) : null;
    };
    let hover = false;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target !== canvas || e.button !== 0 || canvas.classList.contains("measuring")) return;
      const k = hitAt(e, true);
      if (!k) return;
      e.stopPropagation(); e.preventDefault();       // OrbitControls and the picker never see it
      powerClick(k);
    }, true);
    stage.addEventListener("pointermove", (e) => {
      if (e.target !== canvas || e.buttons) return;
      if (hitAt(e, false)) { canvas.style.cursor = "pointer"; hover = true; }
      else if (hover) { canvas.style.cursor = ""; hover = false; }
    }, true);
    $("pwr-estop").addEventListener("click", () => powerClick("estop"));
    for (const q of document.querySelectorAll("[data-pwr=estop]")) q.addEventListener("click", () => powerClick("estop"));
    for (const k of ["router", "vac"]) $("pwr-" + k).addEventListener("click", () => powerSet(k));
  }
  powerLook();                                       // a model built before this file loaded (rebuild calls it after)
  // tests / videos: press / release, a switch, the state, where a part is on screen (client px) to click it there
  window.LR4Power = { press: estopPress, release: estopRelease, set: powerSet, why: powerWhy, state: () => Object.assign({}, PWR),
    look: () => meshes.filter((m) => /^SwitchPanel_(EStop|Lamp|Router|Vac)$/.test(m.userData.name)).map((m) => [m.userData.name,
      +m.position.y.toFixed(2), +m.rotation.x.toFixed(2), +m.material.emissive.g.toFixed(2)]),
    screen(name) {
      const m = meshes.find((q) => q.userData.name === name);
      if (!m) return null;
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).project(camera), r = canvas.getBoundingClientRect();
      return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height];
    } };
