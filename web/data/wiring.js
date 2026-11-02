// lr4-sandbox: the wiring list (Part 51a, user 2026-11-01): what the LowRider 4 on a Jackpot 3 connects, each run from
// end to end as a chain of segments (the motor's own lead, V1E's extender, a lead to the board...). Sources + what's a
// GUESS: docs/WIRING.md. The page (js/page/wiring.js) draws them; tests/test_wiring.js checks the list.
//   JP3 - the Jackpot 3 board's connector spots (private/jp3_spots.py: the user's board model, the V1E pinout), each
//     { at: mm from the Jackpot3_Box's bounding-box min corner (the board doesn't move in the box), out: the way a
//     wire leaves (unit), label, pins }; pcb: the stand-in board's frame (origin + x / y / n axes, size), same frame.
//   RUNS - { id, name, group (motor / switch / probe / power), from, to, segs }; an end is { part: a mesh name, at:
//     "centre" } (it rides the part) or { board: a JP3 spot } or { probe: true } (the touch plate's wires' hole in the
//     core: rope.js); segs [{ kind: "lead" (round, the part's own) / "ribbon" (V1E's 6-wire extender) / "pair" (2
//     wires) / "cord" (mains), len: mm (null: as needed), colours, note }]; via: route hints ("sleeve": through the cable
//     sleeve with the hose). shares: one extender carries a motor + its endstop (the same segment).
(function (root) {
  "use strict";
  const JP3 = {"pcb": {"origin": [10.15, 40.5, 23.37], "x": [1, 0, 0], "y": [0, 0.9848, -0.1736], "n": [0, 0.1736, 0.9848], "size": [99.69, 79.7, 2.54]}, "spots": {"jp3.motor.X": {"at": [22.26, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor X (X)", "pins": 4}, "jp3.motor.Y": {"at": [37.36, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor Y (Y0)", "pins": 4}, "jp3.motor.Z": {"at": [52.46, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor Z (Z0)", "pins": 4}, "jp3.motor.A": {"at": [67.66, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor A (Y1)", "pins": 4}, "jp3.motor.B": {"at": [82.76, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor B (Z1)", "pins": 4}, "jp3.motor.C": {"at": [97.86, 44.58, 33.86], "out": [0, -0.985, 0.174], "label": "Motor C (spare)", "pins": 4}, "jp3.in.36": {"at": [34.05, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 36 (probe)", "pins": 2}, "jp3.in.39": {"at": [31.51, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 39 (spare)", "pins": 2}, "jp3.in.34": {"at": [28.97, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 34 (Z1)", "pins": 2}, "jp3.in.35": {"at": [26.43, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 35 (Y1)", "pins": 2}, "jp3.in.32": {"at": [23.89, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 32 (Z0)", "pins": 2}, "jp3.in.33": {"at": [21.35, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 33 (Y0)", "pins": 2}, "jp3.in.25": {"at": [18.81, 116.92, 21.1], "out": [0, 0.985, -0.174], "label": "Input 25 (X)", "pins": 2}, "jp3.power": {"at": [105.95, 92.77, 22.11], "out": [1, 0.0, 0.0], "label": "Power in (9-29 V)", "pins": 2}, "jp3.out.2.24v": {"at": [21.05, 82.09, 24.0], "out": [-1, 0.0, 0.0], "label": "Output 2 (24 V)", "pins": 2}, "jp3.out.2.5v": {"at": [14.35, 82.09, 24.0], "out": [-1, 0.0, 0.0], "label": "Output 2 (5 V)", "pins": 2}, "jp3.out.0.24v": {"at": [21.05, 90.66, 22.49], "out": [-1, 0.0, 0.0], "label": "Output 0 (24 V)", "pins": 2}, "jp3.out.0.5v": {"at": [14.35, 90.66, 22.49], "out": [-1, 0.0, 0.0], "label": "Output 0 (5 V)", "pins": 2}, "jp3.out.27.24v": {"at": [21.05, 99.22, 20.97], "out": [-1, 0.0, 0.0], "label": "Output 27 (24 V)", "pins": 2}, "jp3.out.27.5v": {"at": [14.35, 99.22, 20.97], "out": [-1, 0.0, 0.0], "label": "Output 27 (5 V)", "pins": 2}, "jp3.out.26.24v": {"at": [21.05, 107.79, 19.46], "out": [-1, 0.0, 0.0], "label": "Output 26 (24 V)", "pins": 2}, "jp3.out.26.5v": {"at": [14.35, 107.79, 19.46], "out": [-1, 0.0, 0.0], "label": "Output 26 (5 V)", "pins": 2}}};
  const LEAD = { kind: "lead", len: 760, colours: ["black", "green", "red", "blue"], note: "the stepper's own lead (~30\", V1E shop)" };
  const EXT = (shares) => ({ kind: "ribbon", len: 1500, wires: 6, note: "V1E stepper extender (1.5 m, 26 AWG, 6 wires: the motor's 4 + the endstop's 2)", shares });
  const PAIR = (note) => ({ kind: "pair", len: null, colours: ["red", "black"], note });
  // motor0 = the Min end (X = 0 side): GUESS (the docs don't say; FluidNC's config picks)
  const RUNS = [
    { id: "x-motor", name: "X motor", group: "motor", from: { part: "X_Stepper_Plug" }, to: { board: "jp3.motor.X" }, via: ["sleeve"], segs: [LEAD, EXT("x-stop")] },
    { id: "y0-motor", name: "Y0 motor", group: "motor", from: { part: "Y_Stepper_Min_Plug" }, to: { board: "jp3.motor.Y" }, segs: [LEAD] },
    { id: "z0-motor", name: "Z0 motor", group: "motor", from: { part: "Z_Stepper_Min_Plug" }, to: { board: "jp3.motor.Z" }, segs: [LEAD] },
    { id: "y1-motor", name: "Y1 motor", group: "motor", from: { part: "Y_Stepper_Max_Plug" }, to: { board: "jp3.motor.A" }, segs: [LEAD, EXT("y1-stop")] },
    { id: "z1-motor", name: "Z1 motor", group: "motor", from: { part: "Z_Stepper_Max_Plug" }, to: { board: "jp3.motor.B" }, segs: [LEAD, EXT("z1-stop")] },
    { id: "x-stop", name: "X endstop", group: "switch", from: { part: "Endstop_X" }, to: { board: "jp3.in.25" }, via: ["sleeve"], segs: [EXT("x-motor")] },
    { id: "y0-stop", name: "Y0 endstop", group: "switch", from: { part: "Endstop_Y_Min" }, to: { board: "jp3.in.33" }, segs: [PAIR("a 2-wire lead, spades on the switch (GUESS: the builder's own)")] },
    { id: "z0-stop", name: "Z0 endstop", group: "switch", from: { part: "Endstop_Z_Min" }, to: { board: "jp3.in.32" }, segs: [PAIR("a 2-wire lead, spades on the switch (GUESS: the builder's own)")] },
    { id: "y1-stop", name: "Y1 endstop", group: "switch", from: { part: "Endstop_Y_Max" }, to: { board: "jp3.in.35" }, segs: [EXT("y1-motor")] },
    { id: "z1-stop", name: "Z1 endstop", group: "switch", from: { part: "Endstop_Z_Max" }, to: { board: "jp3.in.34" }, segs: [EXT("z1-motor")] },
    { id: "probe", name: "Touch plate", group: "probe", from: { probe: true }, to: { board: "jp3.in.36" }, via: ["sleeve"],
      segs: [PAIR("the plate (red) to S, the clip (black) to G (V1E docs; GUESS: one 2-wire lead)")] },
    { id: "mains", name: "Mains to the switch panel", group: "power", from: { part: "SwitchPanel_Box" }, to: null, segs: [{ kind: "cord", len: null, note: "the wall: a 3-wire mains cord (GUESS)" }] },
    { id: "psu-ac", name: "Switch panel to the 24 V supply", group: "power", from: { part: "SwitchPanel_Box" }, to: { part: "PSU_24V" }, segs: [{ kind: "cord", len: null, note: "mains, cut by the e-stop (power.js; GUESS)" }] },
    { id: "psu-dc", name: "24 V to the board", group: "power", from: { part: "PSU_24V" }, to: { board: "jp3.power" }, segs: [PAIR("24 V 2.5 A supply, its barrel plug cut off (V1E shop)")] },
    { id: "fan", name: "Lid fan", group: "power", from: { part: "Jackpot3_Fan" }, to: { board: "jp3.power" }, segs: [{ kind: "pair", len: null, colours: ["red", "black"], note: "the fan's own leads, wired to the power input: always on (V1E docs)" }] },
  ];
  const GROUPS = { motor: { name: "Motors", colour: "#3d8bfd" }, switch: { name: "Endstops", colour: "#2fb67c" }, probe: { name: "Touch plate", colour: "#e5484d" },
    power: { name: "Power", colour: "#f5a524" } };
  const api = { JP3, RUNS, GROUPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Wiring = api;
})(typeof self !== "undefined" ? self : this);
