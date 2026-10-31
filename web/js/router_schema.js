// lr4-sandbox: Build your router - every setting in one table (Part 48b, private/ROUTER_BUILDER_REVIEW.md "One table
// of settings"). The router editor's outline + inspector (js/page/router_inspect.js) read it; a test checks every
// setting routers.js clean() keeps has a row here. Paths are into a preset (routers.js clean()'s shape).
//   PARTS: the outline's items, nut up [{ id, label, spin: its spindle name | false (routers only) | undefined (both),
//     feature: FEATURES id (an item you add / remove), under: the item it's listed under }]
//   ROWS: [{ k, label, part, group, kind, unit, min, max, step, help, when(m, p), opts: [[value, label]], only: "r" | "s" }]
//     kind: len (mm) | ang (deg) | count | num | rpm | choice | bool | text | list | select | look | action |
//     has (an optional piece on / off: { of: its size's path, on: its size when turned on (or fn(m)) })
//   FEATURES: what "+ Add" puts on (48c) [{ id, label, part, has(m), add(p), remove(p) }]
//   rows(part, p): part's rows that apply to preset p, in group order; shown(p): p with the values as drawn filled in
(function (root) {
  "use strict";
  const BODY = root.LR4RouterBody || (typeof require === "function" ? require("./router_body.js") : null);
  const spinOf = (m) => m.kind === "spindle";

  const PARTS = [
    { id: "router", label: "Router" },
    { id: "mount", label: "Mount" },
    { id: "collet_nut", label: "Collet nut" },
    { id: "shaft", label: "Shaft" },
    { id: "flats", label: "Wrench flats", feature: "flats", under: "shaft" },
    { id: "bearing_cap", label: "Bearing cap", feature: "bearing_cap" },
    { id: "housing", label: "Motor housing", spin: "Can" },
    { id: "vent", label: "Open vent end", feature: "vent", under: "housing", spin: false },
    { id: "collar", label: "Collar", feature: "collar", spin: false },
    { id: "transition", label: "Transition", feature: "transition", spin: false },
    { id: "motor_cap", label: "Motor cap", spin: false },
    { id: "dial", label: "Speed dial", under: "motor_cap", spin: false },
    { id: "switch", label: "Switch", under: "motor_cap", spin: false },
    { id: "shaft_lock", label: "Shaft lock", feature: "shaft_lock", spin: false },
    { id: "brushes", label: "Brush caps", feature: "brushes", spin: false },
  ];
  const partLabel = (id, m) => { const P = PARTS.find((q) => q.id === id); return P ? (m && spinOf(m) && P.spin ? P.spin : P.label) : id; };

  // the rows; `when` sees the model m and the preset p
  const R = [];
  const row = (part, group, k, label, kind, o = {}) => R.push(Object.assign({ part, group, k, label, kind, unit: { len: "mm", ang: "°", rpm: "RPM" }[kind] || "" }, o));
  const man = (m, p) => p.source === "manual", gc = (m, p) => p.source === "gcode";
  // the router itself: what isn't a part's shape
  row("router", "Router", "name", "Name", "text", { help: "Shown in the router lists (Run, the job)." });
  row("router", "Router", "kind", "It's a", "choice", { opts: [["router", "Router"], ["spindle", "Spindle"]],
    help: "A spindle is a round can with a fan or water cooling on top; switching keeps the bit end and the colors." });
  row("router", "Speed", "source", "Speed comes from", "choice", { opts: [["manual", "Speed dial"], ["gcode", "G-code S"]],
    help: "Speed dial: you set the speed by hand (the G-code's S does nothing). G-code S: the controller sets it (a PWM router or a spindle)." });
  for (let i = 0; i < 6; i++) row("router", "Speed", `speeds.${i}`, `Dial ${i + 1}`, "rpm", { min: 1000, max: 60000, step: 500, when: man,
    help: "The RPM at this number on the dial (the manual's table)." });
  row("router", "Speed", "s.0", "Lowest accurate", "rpm", { min: 0, max: 60000, step: 500, when: gc, help: "The slowest speed it holds well." });
  row("router", "Speed", "s.1", "Top speed", "rpm", { min: 1000, max: 60000, step: 500, when: gc, help: "Its top speed (S at full)." });
  row("router", "Collets", "model.collet.sizes", "Collet sizes", "list", { unit: "mm",
    help: "Every shank its collets take, comma apart (1/8\" = 3.175, 1/4\" = 6.35). A bit change swaps the collet when the shank changes." });
  // the mount
  row("mount", "Mount", "mount", "Mount", "select", { opts: [["kobalt", "Kobalt"], ["makita", "Makita 701 / T1 (65 mm)"], ["dewalt", "DeWalt 611 (69 mm)"], ["none", "None"]],
    help: "Which V1E tool mount + dust shoe set it fits. None: no V1E dust shoe (no shoe or hose drawn)." });
  row("mount", "Mount", "model.clamp", "Nut below the clamp", "len", { min: 0, max: 150, step: 0.5, when: (m, p) => p.mount !== "none",
    help: "Where you clamp it: from the bottom of the collet nut up to the bottom of the lower clamp. More = the router and bit sit lower." });
  // the bit end
  row("collet_nut", "Size", "model.collet_nut.af", "Across flats", "len", { min: 5, max: 60, step: 0.5, help: "The wrench size across the nut's flats." });
  row("collet_nut", "Size", "model.collet_nut.h", "Height", "len", { min: 3, max: 40, step: 0.5 });
  row("collet_nut", "Size", "model.collet_nut.below", "Shaft end up inside", "len", { min: 0, max: 20, step: 0.5,
    help: "How far the shaft's end sits up inside the nut, from the nut's bottom face." });
  row("collet_nut", "Collet", "model.collet.l", "Collet length", "len", { min: 5, max: 60, step: 0.5, help: "The collet sits in the nut, its wide end down." });
  row("collet_nut", "Collet", "model.collet.d", "Collet Ø (nut end)", "len", { min: 4, max: 40, step: 0.5 });
  row("shaft", "Size", "model.shaft.d", "Ø", "len", { min: 4, max: 60, step: 0.5 });
  row("shaft", "Size", "model.shaft.exposed", "Showing", "len", { min: 0, max: 60, step: 0.5, help: "The shaft you can see between the nut's top and the bearing cap." });
  row("shaft", "Thread", "model.shaft.thread.d", "Thread Ø", "len", { min: 4, max: 60, step: 0.5, help: "What the nut spins onto: one turn per pitch." });
  row("shaft", "Thread", "model.shaft.thread.pitch", "Pitch", "len", { min: 0.25, max: 4, step: 0.05 });
  row("shaft", "Thread", "model.shaft.thread.length", "Thread length", "len", { min: 1, max: 40, step: 0.5 });
  row("flats", "Size", "model.shaft.flats.af", "Across", "len", { min: 2, max: 60, step: 0.1, help: "Two flats on the shaft for a second wrench to hold it while the first turns the nut." });
  row("flats", "Size", "model.shaft.flats.z", "Up from the nut's bottom", "len", { min: 0, max: 200, step: 0.5 });
  row("flats", "Size", "model.shaft.flats.l", "Length", "len", { min: 0.5, max: 40, step: 0.5 });
  // the turned part
  row("bearing_cap", "Size", "model.bearing_cap.l", "Length", "len", { min: 1, max: 200, step: 0.5, help: "The round cap round the bottom bearing, between the shaft and the motor housing." });
  row("bearing_cap", "Size", "model.bearing_cap.d", "Ø", "len", { min: 1, max: 200, step: 0.5 });
  row("housing", "Size", "model.housing.l", "Length", "len", { min: 0, max: 400, step: 0.5, help: "The round part the mount clamps." });
  row("housing", "Size", "model.housing.d", "Ø", "len", { min: 20, max: 200, step: 0.1, help: "The grip Ø: what the mount clamps (65 mm for the Makita / T1 mount, 69 for the DeWalt)." });
  row("housing", "Size", "model.housing.ch", "Bottom chamfer", "len", { min: 0, max: 20, step: 0.5, only: "r", help: "A 45° bevel round its bottom edge (the collet end), this big; 0 = square." });
  row("housing", "Cooling", "model.cooling", "Cooling", "choice", { only: "s", opts: [["air", "Air (fan)"], ["water", "Water"]], help: "Air: a fan on top. Water: two hose barbs." });
  row("vent", "Size", "model.housing.vent.depth", "Opening depth", "len", { min: 0.5, max: 60, step: 0.5,
    help: "Most routers are open at the collet end so the fan blows out: a thin wall down to the rim, spokes from the hub inside. How deep the openings between the spokes go." });
  row("vent", "Size", "model.housing.vent.wall", "Wall", "len", { min: 0.8, max: 10, step: 0.1 });
  row("vent", "Size", "model.housing.vent.spokes", "Spokes", "count", { min: 0, max: 24, step: 1 });
  row("vent", "Size", "model.housing.vent.w", "Spoke width", "len", { min: 1, max: 20, step: 0.5 });
  row("vent", "Size", "model.housing.vent.inset", "Spokes set in from the rim", "len", { min: 0, max: 50, step: 0.5 });
  row("collar", "Size", "model.collar.l", "Length", "len", { min: 1, max: 200, step: 0.5, help: "A ring on top of the motor housing." });
  row("collar", "Size", "model.collar.d", "Ø", "len", { min: 1, max: 200, step: 0.5 });
  row("transition", "Size", "model.transition.l", "Length", "len", { min: 1, max: 200, step: 0.5, help: "The part between the collar and the motor cap; the cap sits on it." });
  row("transition", "Shape", "model.transition.shape", "Shape", "choice", { opts: [["round", "Round"], ["cap", "To the cap's shape"]],
    help: "Round: a cone up to its top Ø. To the cap's shape: from round at the bottom to the cap's rounded box at the top." });
  row("transition", "Shape", "model.transition.d", "Top Ø", "len", { min: 1, max: 300, step: 0.5, when: (m) => !m.transition || m.transition.shape !== "cap" });
  row("transition", "Shape", "model.transition.edge", "Into the cap", "choice", { opts: [["none", "Plain"], ["fillet", "Fillet"], ["chamfer", "Chamfer"]],
    help: "Plain, or a fillet / chamfer blending it into the cap's underside." });
  row("transition", "Shape", "model.transition.e", (m) => (m.transition && m.transition.edge === "chamfer" ? "Chamfer size" : "Fillet size"), "len",
    { min: 0, max: 50, step: 0.5, when: (m) => !!m.transition && m.transition.edge !== "none" });
  // the motor cap
  row("motor_cap", "Size", "model.motor_cap.L", "Length", "len", { min: 20, max: 300, step: 0.5, help: "Along the switch end (left to right from the front)." });
  row("motor_cap", "Size", "model.motor_cap.W", "Width", "len", { min: 20, max: 300, step: 0.5, help: "Front to back." });
  row("motor_cap", "Size", "model.motor_cap.H", "Height", "len", { min: 10, max: 300, step: 0.5, help: "Up from the turned part it sits on." });
  row("motor_cap", "Size", "model.overall", "Overall height", "len", { min: 30, max: 500, step: 0.5,
    help: "The nut's bottom to the top of the cap. The cap always sits on the turned part, so this and the cap's height change together." });
  row("motor_cap", "Shape", "shape", "Shape", "action", { label2: "✎ Edit shape…",
    help: "Draw the cap from above, the front and the end instead of a box. Once drawn, Length / Width / Height stretch it and the corners don't apply." });
  const boxCap = (m) => !(m.motor_cap && m.motor_cap.shape);
  row("motor_cap", "Corners", "model.motor_cap.top_r", "Top edges", "len", { min: 0, max: 100, step: 0.5, when: boxCap, help: "The fillet round the top." });
  row("motor_cap", "Corners", "model.motor_cap.front_r", "Switch-end corners", "len", { min: 0, max: 150, step: 0.5, when: boxCap, help: "The upright corners at the switch end." });
  row("motor_cap", "Corners", "model.motor_cap.back_r", "Cord-end corners", "len", { min: 0, max: 150, step: 0.5, when: boxCap, help: "The upright corners at the cord end." });
  row("motor_cap", "Corners", "model.motor_cap.bot_r", "Under edges", "len", { min: 0, max: 100, step: 0.5, when: boxCap, help: "The fillet round its underside." });
  // the dial
  const place = (m) => m.dial && m.dial.place, sur = (m) => (m.dial && m.dial.surround) || { kind: "none" };
  row("dial", "Place", "model.dial.place", "Where", "choice", { opts: [["end", "On the end"], ["top", "On top"], ["window", "In a window"]],
    help: "On the end: lying flat inside the head, a slice of its rim through a slot in the switch end (Makita, DeWalt). On top: standing across the head, its rim up through a slot. In a window: lying flat, seen through a window in the top (Kobalt)." });
  row("dial", "Place", "model.dial.d", "Ø", "len", { min: 8, max: 80, step: 0.5 });
  row("dial", "Place", "model.dial.t", "Thickness", "len", { min: 2, max: 30, step: 0.5 });
  const win = (m) => place(m) === "window";
  row("dial", "Window", "model.dial.in", "Rim in from the end", "len", { min: -20, max: 60, step: 0.5, when: win, help: "Where the wheel sits: its rim this far in from the switch end." });
  row("dial", "Window", "model.dial.drop", "Below the top", "len", { min: 0, max: 60, step: 0.5, when: win });
  row("dial", "Window", "model.dial.win.l", "Window length", "len", { min: 2, max: 120, step: 0.5, when: win, help: "From the rim inward." });
  row("dial", "Window", "model.dial.win.w", "Window width", "len", { min: 2, max: 120, step: 0.5, when: win });
  row("dial", "Window", "model.dial.win.bevel", "Window bevel", "len", { min: 0, max: 10, step: 0.5, when: win, help: "The 45° edge from the top down into the window." });
  row("dial", "Window", "model.dial.win.open", "Open at the end (a notch)", "bool", { when: win });
  row("dial", "Numbers", "model.dial.style", "Numbers", "choice", { opts: [["rim", "On the rim"], ["dome", "On a domed top"]],
    help: "On the rim (between its ridges) or on a domed top (the wheel's upper half rounds up to a flat top). A domed dial shows best in a window." });
  row("dial", "Numbers", "model.dial.dome.top", "Flat top", "num", { unit: "x r", min: 0, max: 0.95, step: 0.05, when: (m) => m.dial && m.dial.style === "dome",
    help: "The flat top's share of the radius (0 = a full dome)." });
  const slot = (m) => place(m) !== "window";
  row("dial", "Slot", "model.dial.slot.w", "Slot width", "len", { min: 2, max: 120, step: 0.5, when: slot, csg: true, help: "The slot the rim shows through (blank = sized from the dial)." });
  row("dial", "Slot", "model.dial.slot.h", "Slot height", "len", { min: 1, max: 60, step: 0.5, when: slot, csg: true });
  row("dial", "Slot", "model.dial.slot.r", "Slot corner", "len", { min: 0, max: 60, step: 0.5, when: slot, csg: true, help: "Half the height = round ends." });
  row("dial", "Slot", "model.dial.set", "Rim behind the slot", "len", { min: -10, max: 10, step: 0.1, when: slot, csg: true });
  row("dial", "Slot", "model.dial.surround.kind", "Round the slot", "choice", { opts: [["none", "None"], ["sunk", "Sunk"], ["raised", "Raised"]], when: slot, csg: true,
    help: "Sunk: a recess round the slot (the Makita's). Raised: a pad standing out (the DeWalt's)." });
  const surOn = (m) => slot(m) && sur(m).kind !== "none";
  row("dial", "Slot", "model.dial.surround.depth", "Depth", "len", { min: 0.2, max: 30, step: 0.2, when: surOn, csg: true, help: "How far in (sunk) or out (raised)." });
  row("dial", "Slot", "model.dial.surround.margin", "Margin", "len", { min: 0, max: 40, step: 0.5, when: surOn, csg: true, help: "How much bigger than the slot." });
  row("dial", "Slot", "model.dial.surround.r", "Corner", "len", { min: 0, max: 60, step: 0.5, when: surOn, csg: true });
  row("dial", "Slot", "model.dial.surround.edge", "Edge", "choice", { opts: [["chamfer", "Chamfer"], ["fillet", "Fillet"]], when: surOn, csg: true });
  row("dial", "Slot", "model.dial.surround.e", "Edge size", "len", { min: 0, max: 10, step: 0.5, when: surOn, csg: true });
  row("dial", "Slot", "model.dial.surround.out", "Runs out through the top", "bool", { when: (m) => place(m) === "end" && sur(m).kind === "sunk", csg: true,
    help: "Opens the recess up through the top edge, a thumb scoop." });
  row("switch", "Place", "model.switch.down", "Below the top", "len", { min: 0, max: 300, step: 0.5,
    help: "How far the switch's center is under the top of the head (until you set one, it's placed by the dial)." });
  // the shaft lock + brush caps. A "has:" row turns an optional piece on (its `of` set to `on`) or off (0): no more
  // "0 = none" sizes (Part 48c)
  const pos = (k) => (m) => { const v = path({ model: m }, k); return v > 0; };
  const lk = (k) => `model.shaft_lock.${k}`;
  row("shaft_lock", "Button", lk("z"), "Height", "len", { min: 0, max: 300, step: 0.5, help: "Up from the nut's bottom." });
  row("shaft_lock", "Button", lk("a"), "Angle", "ang", { min: -180, max: 180, step: 1, help: "Round from the switch end, counter-clockwise from above (negative = clockwise)." });
  row("shaft_lock", "Button", lk("r"), "Reach", "len", { min: 5, max: 80, step: 0.5, help: "How far the lock reaches out from the router's center." });
  row("shaft_lock", "Button", lk("button"), "Button Ø", "len", { min: 2, max: 30, step: 0.5 });
  row("shaft_lock", "Button", lk("out"), "Button stands out", "len", { min: 0.5, max: 20, step: 0.5 });
  row("shaft_lock", "Button", lk("travel"), "Press depth", "len", { min: 0.5, max: 10, step: 0.5, help: "How far the button presses in." });
  row("shaft_lock", "Boss", "has:lock.d", "A boss round the button", "has", { of: lk("d"), on: 14,
    help: "A sleeve round the button. Without one the button comes straight out of the housing." });
  row("shaft_lock", "Boss", lk("d"), "Boss Ø", "len", { min: 4, max: 40, step: 0.5, when: pos(lk("d")) });
  row("shaft_lock", "Boss", lk("in"), "Boss starts", "len", { min: 0, max: 80, step: 0.5, when: pos(lk("d")), help: "Where the boss starts, out from the router's center." });
  row("shaft_lock", "Boss", "has:lock.arm", "An arm up to the housing", "has", { of: lk("arm"), on: 6,
    help: "An arm from the boss up to the housing: a lock held below the hub on a bracket (the Carbide's)." });
  row("shaft_lock", "Boss", lk("arm"), "Arm width", "len", { min: 0.5, max: 60, step: 0.5, when: pos(lk("arm")) });
  row("shaft_lock", "Boss", "has:lock.pin", "A pin into the shaft", "has", { of: lk("pin"), on: (m) => +Math.min(4, m.shaft_lock.button * 0.5).toFixed(1),
    help: "The button's pin goes through a hole in the shaft, square to the flats; a bit change turns the shaft until it lines up." });
  row("shaft_lock", "Boss", lk("pin"), "Pin Ø", "len", { min: 0.5, max: 12, step: 0.5, when: pos(lk("pin")) });
  const bc = (k) => `model.brushes.${k}`;
  row("brushes", "Size", bc("z"), "Height", "len", { min: 0, max: 400, step: 0.5, help: "Up from the nut's bottom." });
  row("brushes", "Size", bc("a"), "Angle", "ang", { min: -180, max: 180, step: 1, help: "The first one's angle round from the switch end; the rest evenly round." });
  row("brushes", "Size", bc("n"), "How many", "count", { min: 1, max: 4, step: 1 });
  row("brushes", "Size", bc("d"), "Ø", "len", { min: 3, max: 40, step: 0.5 });
  row("brushes", "Size", bc("r"), "Body surface out from the center", "len", { min: 5, max: 120, step: 0.5, help: "How far out from the router's center the body's surface is where they sit." });
  row("brushes", "Size", bc("out"), "Stands out", "len", { min: 0.5, max: 30, step: 0.5, help: "How far a cap stands out of the body (with no border)." });
  row("brushes", "Size", bc("slot"), "Slot angle", "ang", { min: -180, max: 180, step: 1, help: "Its screwdriver slot, from upright." });
  row("brushes", "Border", "has:brush.ring", "A border round each", "has", { of: bc("ring"), on: 2,
    help: "A border round each cap in the head's color, flush with the body (most sit where the head meets the transition)." });
  row("brushes", "Border", bc("ring"), "Border width", "len", { min: 0.5, max: 15, step: 0.5, when: pos(bc("ring")) });
  row("brushes", "Border", bc("inset"), "Cap set in", "len", { min: -10, max: 10, step: 0.5, when: pos(bc("ring")), help: "How far the cap sits in from the border." });
  // every part's color + finish (model.looks; the page: router.js rtMaterial)
  // [part, look key, label, only]; a spindle has no motor cap, so its trim, cord and strain relief are on its can
  const LOOKS = [["collet_nut", "collet_nut", "Collet nut"], ["collet_nut", "collet", "Collet"], ["shaft", "shaft", "Shaft"], ["bearing_cap", "bearing_cap", "Bearing cap"],
    ["housing", "housing", "Motor housing", "r"], ["housing", "housing", "Can", "s"], ["housing", "trim", "Trim (bezels, grille)", "s"],
    ["housing", "strain_relief", "Strain relief", "s"], ["housing", "cord", "Cord", "s"], ["collar", "collar", "Collar"], ["transition", "transition", "Transition"],
    ["motor_cap", "motor_cap", "Motor cap"], ["motor_cap", "trim", "Trim (bezels, grille)", "r"], ["motor_cap", "strain_relief", "Strain relief", "r"],
    ["motor_cap", "cord", "Cord", "r"], ["dial", "dial", "Dial"], ["switch", "switch", "Rocker"], ["shaft_lock", "shaft_lock", "Button"], ["shaft_lock", "lock_boss", "Boss"],
    ["brushes", "brush_cap", "Caps"], ["brushes", "brush_ring", "Border"]];
  for (const [part, k, l, only] of LOOKS) row(part, "Look", `looks.${k}`, l, "look", { only,
    help: k === "dial" ? "Its color sets the numbered ring too." : "Metal reflects the shop, plastic is satin, rubber is matte." });
  const ROWS = R;

  // the parts you add / take off (48c: "+ Add"; no more "0 = none"): has(m), add(p) with sizes that fit, remove(p)
  const nutTop = (m) => m.collet_nut.h + m.shaft.exposed + (m.bearing_cap ? m.bearing_cap.l : 0);
  const FEATURES = [
    { id: "flats", label: "Wrench flats", part: "flats", has: (m) => !!m.shaft.flats,
      add: (p) => { const S = p.model.shaft; S.flats = { af: +(S.d * 0.8).toFixed(1), z: +(p.model.collet_nut.h + 0.2).toFixed(1), l: Math.max(1, Math.min(3, S.exposed - 0.4)) }; },
      remove: (p) => { delete p.model.shaft.flats; } },
    { id: "vent", label: "Open vent end", part: "vent", only: "r", has: (m) => !!(m.housing && m.housing.vent),
      add: (p) => { p.model.housing.vent = { depth: 10, wall: 2.5, spokes: 12, w: 3, inset: 0.5 }; },
      remove: (p) => { delete p.model.housing.vent; } },
    { id: "collar", label: "Collar", part: "collar", only: "r", has: (m) => !!m.collar,
      add: (p) => { p.model.collar = { d: p.model.housing.d, l: 8 }; }, remove: (p) => { delete p.model.collar; } },
    { id: "bearing_cap", label: "Bearing cap", part: "bearing_cap", has: (m) => !!m.bearing_cap,
      add: (p) => { p.model.bearing_cap = { d: +(p.model.housing.d * 0.5).toFixed(1), l: 8 }; }, remove: (p) => { delete p.model.bearing_cap; } },
    { id: "transition", label: "Transition", part: "transition", only: "r", has: (m) => !!m.transition,
      add: (p) => { const m = p.model; m.transition = { l: 15, d: (m.collar || m.housing).d, shape: "round", edge: "none", e: 3 }; },
      remove: (p) => { delete p.model.transition; } },
    { id: "shaft_lock", label: "Shaft lock", part: "shaft_lock", only: "r", has: (m) => !!m.shaft_lock,
      add: (p) => { const m = p.model; m.shaft_lock = { z: +(nutTop(m) + 10).toFixed(1), a: -50, d: 14, r: +(m.housing.d / 2 + 3).toFixed(1), travel: 3, button: 10, out: 4 }; },
      remove: (p) => { delete p.model.shaft_lock; } },
    { id: "brushes", label: "Brush caps", part: "brushes", only: "r", has: (m) => !!m.brushes,   // two, either side, at the housing's top (where most sit)
      add: (p) => { const m = p.model, top = nutTop(m) + m.housing.l; m.brushes = { n: 2, z: +(top - 8).toFixed(1), a: 90, d: 12, r: +(m.housing.d / 2 - 1).toFixed(1), out: 5, ring: 2, inset: 1, slot: 15 }; },
      remove: (p) => { delete p.model.brushes; } },
  ];

  const kindOK = (r, m) => !r.only || (r.only === "s") === spinOf(m);
  function partShown(id, m) {                         // the item applies to this kind (and, a feature, is on)
    const P = PARTS.find((q) => q.id === id);
    if (!P || (P.spin === false && spinOf(m))) return false;
    const F = P.feature && FEATURES.find((f) => f.id === P.feature);
    return !F || F.has(m);
  }
  function rows(part, p, opt = {}) {
    const m = p.model;
    return ROWS.filter((r) => r.part === part && kindOK(r, m) && (!r.when || r.when(m, p)) && (!r.csg || opt.csg !== false));
  }
  const labelOf = (r, m) => (typeof r.label === "function" ? r.label(m) : r.label);
  const groups = (rs) => [...new Set(rs.map((r) => r.group))];

  // the values as drawn: the overall height, the switch's place and the dial's slot as used (until typed), 0 for a
  // missing section's sizes
  function shown(p, ctx = {}) {                       // ctx.clampDef: the build's nut below the clamp (a router with none set)
    const m = p.model, spin = spinOf(m), ex = spin || !BODY ? null : BODY.expand(m);
    const swDown = ex ? +(ex.cap.z[1] - ex.switch.at[2]).toFixed(1) : 0;
    const O = ex && ex.dial.open, dial = O ? Object.assign({}, m.dial, { slot: O.S, set: m.dial.set ?? 0.3, surround: O.R }) : m.dial;
    return Object.assign({}, p, { model: Object.assign({}, m, { dial, overall: BODY ? BODY.overall(m) : 0, switch: { down: swDown },
      housing: Object.assign({ ch: 0 }, m.housing), bearing_cap: m.bearing_cap || { d: 0, l: 0 }, collar: m.collar || { d: 0, l: 0 }, clamp: m.clamp ?? ctx.clampDef }) });
  }
  const path = (o, k) => k.split(".").reduce((a, q) => (a == null ? undefined : a[q]), o);
  function value(p, k, sh) {                          // a row's value in preset p (sh: shown(p), made if not given)
    const s = sh || shown(p);
    if (k.startsWith("speeds.")) return p.speeds ? p.speeds[+k.split(".")[1]][1] : "";
    if (k === "model.collet.sizes") return p.model.collet.sizes.join(", ");
    if (k === "kind") return spinOf(p.model) ? "spindle" : "router";
    if (k.startsWith("has:")) { const r = ROWS.find((q) => q.k === k); return !!r && path(s, r.of) > 0; }
    if (k === "model.dial.surround.kind") return (s.model.dial && s.model.dial.surround && s.model.dial.surround.kind) || "none";
    if (k === "model.dial.surround.edge") return (s.model.dial && s.model.dial.surround && s.model.dial.surround.edge) || "chamfer";
    if (k === "model.dial.surround.out") return !!(s.model.dial && s.model.dial.surround && s.model.dial.surround.out === "top");
    if (k === "model.transition.shape" || k === "model.transition.edge") return path(p, k) || (k.endsWith("shape") ? "round" : "none");
    if (k === "model.transition.l" && !p.model.transition) return 0;
    return path(s, k);
  }

  const api = { PARTS, ROWS, FEATURES, partLabel, partShown, rows, labelOf, groups, shown, value, path };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4RouterSchema = api;
})(typeof self !== "undefined" ? self : this);
