// The V1 Engineering store for the BOM (user 2026-10-26): which BOM rows V1E sells, and which come in its LowRider v4
// Hardware kit - the kit bundles most of the hardware, so a row it covers says so instead of sending you to buy it
// again. From www.v1e.com/collections/lowrider-parts + the kit's and the printed parts set's pages, 2026-10-26: when V1E
// changes a product, change it here (tests/test_v1e_store.js checks the rows still match the page's BOM).
// Outside the US (user 2026-10-26): hawiwe.de sells the LowRider 4 kit, printed parts, XZ plates and screw set in the EU;
// Elecrow sells the Jackpot3 worldwide - as second links (alt) beside V1E's. Northwoods Custom Creations builds LR4s
// (partly or fully) and prints the main parts in PET-CF.
// lookup(section title, row's item text) -> { url, name, kit, alt: [{ label, url, name }] } | null;
// section(title) -> { url, name, text, alt } | null.
(function (root) {
  "use strict";
  const P = "https://www.v1e.com/products/";
  const KIT = { url: P + "lowrider-v4-hardware-kit", name: "LowRider v4 Hardware kit" };
  const PRINTED = { url: P + "lowrider-v4-printed-parts-with-aluminum-xz-plates", name: "LowRider v4 Printed Parts Set" };
  // [section title start, the item text's pattern, store page, product name, in the hardware kit (true / "option" = an add-on)]
  const ROWS = [
    ["Buy: specialty", /^Jackpot3 CNC controller/i, "jackpot3-cnc-controller", "Jackpot3 CNC Controller", "option"],   // can be added to the kit (user)
    ["Buy: specialty", /^NEMA 17 stepper/i, "nema-17-76oz-in-steppers", "Nema 17 84oz/in Steppers", true],
    ["Buy: specialty", /^Stepper wire extension/i, "wiring-kit-1", "Stepper extender wires", true],
    ["Buy: specialty", /Tiny Touch Plate/i, "tiny-touch-plate", "Tiny Touch Plate", false],
    ["Buy: specialty", /^GT2 16T pulley/i, "pulley-16-tooth-gt2-10mm", "Pulley 16 Tooth GT2 10mm", true],
    ["Buy: specialty", /^GT2 20T smooth idler/i, "20t-idler-gt2-10mm", "20T Idler GT2 10mm", true],
    ["Buy: specialty", /micro switch/i, "limit-switch-endstop", "Limit Switch, Endstop", true],
    ["Buy: specialty", /^608-2RS bearing/i, "bearings-608-2rs", "Bearings 608-2RS", true],
    ["Buy: specialty", /^T8 leadscrew/i, "lowrider-v4-cnc-t8-leadscrews", "LowRider v4 CNC T8 Leadscrews", true],
    ["Buy: specialty", /flexible .*coupler/i, "5mm-to-8mm-flex-coupler", "5mm to 8mm Flex Coupler", true],
    ["Buy: specialty", /^MGN12H 150 mm/i, "150mm-mgn12h-linear-guides", "150mm MGN12H Linear Guides", true],
    ["Buy: specialty", /^24 V power supply/i, "24v-power-supply", "24V Power Supply", true],
    ["Buy: specialty", /^5015 blower fan/i, "5015-12v-fan-blower", "5015 24V Fan Blower", false],
    ["Buy: specialty", /^PTFE grease/i, "super-lube-silicone-lubricating-grease-with-syncolon-ptfe", "Super Lube PTFE grease", true],
    ["Buy: specialty", /^Wire sleeve/i, "wire-sleeve", "Wire Sleeve", false],
    ["Buy / cut: stock", /^XZ plates/i, "lowrider-4-aluminium-xz-plates", "LowRider 4 Aluminum XZ Plates", true],
    ["Buy / cut: stock", /^Belt along [XY]$/i, "gt2-10mm-belt", "GT2 10mm Belt", true],
    ["Printed parts", /^TPU_Bristles/i, "tpu-bristles-for-the-lr4-dust-shoes", "TPU Bristles for the LR4 dust shoes", false],
    // the kit's fasteners (M8x40 14, M8 locknut 14, M5x30 60, M5 locknut 60, M3x10 83, M2.5x12 10) - not the wood screws
    ["Hardware: V1E kit", /^(M8 x 40 mm hex head bolt|M8 nylock nut|M5 x 30 mm button head screw|M5 nylock nut|M3 x 10 mm button head screw|M2\.5 x 12 mm button head screw)$/, "", "", true],
  ];
  const SECTIONS = [
    ["Hardware: V1E kit", KIT, "The bolts and nuts marked come in V1E's hardware kit; the wood screws and the lid fan's M3 x 20 don't."],
    ["Printed parts", PRINTED, "V1E sells every printed part as a set (PLA, a PETG tool mount, TPU bristles; accent color your pick) - check its tool mount fits your router; the XZ plates come with the hardware kit."],
  ];
  // what the hardware kit leaves for you to get (the BOM's note; what it has is tagged on its rows)
  const KIT_NOTE = { not: "printed parts, EMT (local), table, router, cable ties, strut plate material, " +
    "bit or touch plate (optional)" };
  const TAPE = { url: P + "3m-metal-measuring-tape-for-calibration", name: "3M Metal Measuring Tape for Calibration" };
  const H = "https://hawiwe.de/produkt/", EU = (slug, name) => ({ label: "EU", url: H + slug + "/", name: name + " (hawiwe.de, EU)" });
  const ELSEWHERE = {                                 // by V1E slug ("kit" = the hardware kit's fastener rows)
    "jackpot3-cnc-controller": [{ label: "Elecrow", url: "https://www.elecrow.com/jackpot3-cnc-controller.html", name: "Jackpot3 CNC controller (Elecrow, outside the US)" }],
    "lowrider-4-aluminium-xz-plates": [EU("aluminium-xz-platten", "Aluminium XZ Platten")],
    kit: [EU("schraubenset-lowrider-4", "Schraubenset LowRider 4")],
  };
  const KIT_EU = EU("lowrider-4-hardware-kit", "LowRider 4 Hardware Kit"), PRINTED_EU = EU("lowrider-4-druckteile", "LowRider 4 Druckteile");
  const JP3_ELECROW = ELSEWHERE["jackpot3-cnc-controller"][0];
  // built for you, or just the PET-CF parts (user 2026-10-26): Northwoods Custom Creations (US; royalty to V1E)
  const N = "https://northwoodscustomcreations.com/products/";
  const NORTHWOODS = { partial: N + "partially-assembled-lr4", full: N + "v1-engineering-lr4-fully-built-cnc",
    petcf: { label: "PET-CF", url: N + "lr4-pet-cf-printed-parts", name: "LR4 PET-CF Printed Part Set: Core, YZ plates, outer braces, tool mounts (Northwoods Custom Creations)" } };

  function lookup(title, item) {
    const r = ROWS.find(([sec, re]) => String(title).startsWith(sec) && re.test(String(item || "").trim()));
    if (!r) return null;
    return r[2] ? { url: P + r[2], name: r[3], kit: r[4], alt: ELSEWHERE[r[2]] || [] } : { url: KIT.url, name: KIT.name, kit: r[4], alt: ELSEWHERE.kit };
  }
  function section(title) {
    const s = SECTIONS.find(([t]) => String(title).startsWith(t));
    return s ? Object.assign({ text: s[2], alt: s[1] === KIT ? [KIT_EU] : [PRINTED_EU, NORTHWOODS.petcf] }, s[1]) : null;
  }
  const ITEM_COLS = ["Item", "Part", "File"];         // the column a section names its rows by
  const CHECKED = "2026-10-26";                      // when these pages were read
  const api = { CHECKED, ROWS, KIT, PRINTED, KIT_NOTE, TAPE, KIT_EU, PRINTED_EU, JP3_ELECROW, NORTHWOODS, ITEM_COLS, lookup, section };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.V1EStore = api;
})(typeof self !== "undefined" ? self : this);
