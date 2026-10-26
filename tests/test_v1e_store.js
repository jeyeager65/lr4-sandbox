// web/js/v1e_store.js: the BOM's V1E store links - each row found by its section + item text, the hardware kit's rows
// marked, every link a v1e.com product page.
//   node tests/test_v1e_store.js   (in npm test)
"use strict";
const V = require("../web/js/v1e_store.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };

const sp = "Buy: specialty parts and electronics (V1E kit)";
const cases = [
  [sp, "Jackpot3 CNC controller (FluidNC)", "jackpot3-cnc-controller", "option"],
  [sp, "NEMA 17 stepper, 48 mm, 84 oz-in (StepperOnline 17HS19-2004S1 or similar), 20 mm+ shaft", "nema-17-76oz-in-steppers", true],
  [sp, "Omron SS-3GL13PT micro switch (simulated roller lever)", "limit-switch-endstop", true],
  [sp, "5 to 8 mm flexible (helical beam) coupler, D19 x 25", "5mm-to-8mm-flex-coupler", true],
  [sp, "5015 blower fan, 24 V (V1E shop: 5015 fan blower)", "5015-12v-fan-blower", false],
  ["Buy / cut: stock", "XZ plates (pair)", "lowrider-4-aluminium-xz-plates", true],
  ["Buy / cut: stock", "Belt along Y", "gt2-10mm-belt", true],
  ["Printed parts", "TPU_Bristles_22mm", "tpu-bristles-for-the-lr4-dust-shoes", false],
  ["Hardware: V1E kit vs this build", "M5 x 30 mm button head screw", "lowrider-v4-hardware-kit", true],
];
for (const [t, item, slug, kit] of cases) {
  const x = V.lookup(t, item);
  ok(x && x.url === "https://www.v1e.com/products/" + slug && x.kit === kit, `${item}: ${JSON.stringify(x)}`);
}
ok(!V.lookup("Hardware: V1E kit vs this build", '#8 x 3/4" (M4 x 20) pan head wood screw'), "the wood screws aren't in the kit");
ok(!V.lookup("Hardware: V1E kit vs this build", "M3 x 20 mm button head screw"), "nor the lid fan's M3 x 20");
ok(!V.lookup("V1E calculator", "Belt along X"), "only in its own section");
ok(!V.lookup(sp, "Threadlocker (blue)") && !V.lookup(sp, "Kobalt 1.25 HP trim router"), "rows V1E doesn't sell: no link");
ok(V.section("Printed parts").url === V.PRINTED.url && V.section("Hardware: V1E kit vs this build").url === V.KIT.url && !V.section("Model notes"), "section links");
ok(V.lookup(sp, "Jackpot3 CNC controller (FluidNC)").alt[0].url === "https://www.elecrow.com/jackpot3-cnc-controller.html", "Jackpot3: Elecrow too");
ok(V.lookup("Buy / cut: stock", "XZ plates (pair)").alt[0].url === "https://hawiwe.de/produkt/aluminium-xz-platten/", "XZ plates: hawiwe.de too");
ok(V.lookup("Hardware: V1E kit vs this build", "M8 nylock nut").alt[0].url.includes("schraubenset-lowrider-4") && !V.lookup(sp, "Wire sleeve").alt.length, "kit fasteners: the EU screw set");
ok(V.section("Printed parts").alt[0].url.includes("lowrider-4-druckteile") && V.section("Hardware: V1E kit").alt[0].url.includes("lowrider-4-hardware-kit"), "EU kit + printed parts");
ok(V.section("Printed parts").alt.some((a) => a.url.includes("northwoodscustomcreations.com/products/lr4-pet-cf-printed-parts")) &&
  /^https:\/\/northwoodscustomcreations\.com\/products\//.test(V.NORTHWOODS.full), "Northwoods: built LR4s + PET-CF parts");
ok(V.ROWS.every((r) => !r[2] || /^[a-z0-9-]+$/.test(r[2])) && /^https:\/\/www\.v1e\.com\/products\//.test(V.TAPE.url), "product slugs");
console.log(fails ? `v1e store: ${fails} of ${checks} failed` : `v1e store: all ${checks} passed`);
process.exit(fails ? 1 : 0);
