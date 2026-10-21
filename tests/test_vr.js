// web/js/vr.js: the pure parts - the menu layout and its hit test, size snapping / limits, the tabletop scale.
//   node tests/test_vr.js
"use strict";
const V = require("../web/js/vr.js"), Shop = require("../web/js/workshop.js");
const IN = 25.4;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL " + msg); } };

const state = (o) => Object.assign({ unit: "in", cutX: 48 * IN, cutY: 96 * IN, mode: "one",
  braces: { label: "Auto (5)", down: false, up: true },
  peter: [{ v: "solid", label: "Solid", on: true }, { v: "honeycomb", label: "Honeycomb" }, { v: "none", label: "None" }],
  groups: ["Table", "YZ_Min", "YZ_Max", "Beam", "Core", "Hose", "Belts", "Electronics", "Hardware", "jp3lid"]
    .map((id, i) => ({ id: "g-" + id, label: id, on: i !== 8 })) }, o);

for (const s of [state(), state({ unit: "mm", mode: "table", peter: [] }), state({ groups: [] })]) {
  const { buttons, texts } = V.layout(s);
  // inside the canvas (512 x 704) and no two buttons overlap
  for (const b of buttons) ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 512 && b.y + b.h <= 704, `button ${b.label} off the menu`);
  for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
    const a = buttons[i], b = buttons[j];
    ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.label} overlaps ${b.label}`);
  }
  // every button is found by its own center
  for (const b of buttons) ok(V.hit(buttons, b.x + b.w / 2, b.y + b.h / 2) === b, `hit ${b.label}`);
  ok(new Set(buttons.map((b) => b.id)).size === buttons.length, "button ids unique");
  ok(V.hit(buttons, 5, 5) === null, "title area is not a button");
  ok(texts[0].text === (s.unit === "in" ? "LR4  48 × 96 in" : "LR4  1219 × 2438 mm"), "title " + texts[0].text);
  ok(buttons.filter((b) => b.act.a === "group").length === Math.min(10, s.groups.length), "group buttons");
  ok(buttons.filter((b) => b.act.a === "peter").length === s.peter.length, "peter buttons");
  ok(buttons.filter((b) => b.act.a === "unit" && b.on).map((b) => b.act.u).join() === s.unit, "unit marked");
  ok(buttons.filter((b) => b.act.a === "home").length === 1, "Home button");
}
{
  const { buttons } = V.layout(state());
  ok(buttons.find((b) => b.label === "48×96").on, "preset 48x96 marked");
  ok(!buttons.find((b) => b.label === "24×48").on, "preset 24x48 not marked");
  ok(buttons.find((b) => b.act.a === "group" && b.act.id === "g-Hardware").on === false, "group off");
  const steps = buttons.filter((b) => b.act.a === "cut" && b.act.axis === "x").map((b) => b.act.d);
  ok(JSON.stringify(steps) === "[-6,-1,1,6]", "inch steps " + steps);
  const mm = V.layout(state({ unit: "mm" })).buttons.filter((b) => b.act.a === "cut" && b.act.axis === "y");
  ok(mm.map((b) => b.label).join(" ") === "−150 −25 +25 +150", "mm step labels " + mm.map((b) => b.label));
  ok(Math.abs(mm[3].act.d * IN - 150) < 1e-9, "mm step size");
}
{
  const c = V.cardLayout({ title: "Core", sub: "Printed part · Core + router", group: "Core" });
  ok(c.buttons.map((b) => b.act.a).join() === "hide,hidegroup,close", "card buttons");
  for (const b of c.buttons) ok(b.x >= 0 && b.x + b.w <= 512 && b.y + b.h <= 224 && V.hit(c.buttons, b.x + 2, b.y + 2) === b, "card " + b.label);
  ok(V.cardLayout({ title: "x" }).buttons[1].dim, "no group: Hide group dimmed");
  ok(V.layout(state({ hidden: 0 })).buttons.find((b) => b.act.a === "unhide").dim, "Unhide 0 dimmed");
  ok(V.layout(state({ hidden: 3 })).buttons.find((b) => b.act.a === "unhide").label === "Unhide 3", "Unhide 3");
}
{ // two-hand grab: the solved rig maps both hands' points onto their anchors (yaw about Z, scale, move)
  const map = (r, p) => { const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return [r.t[0] + r.s * (c * p[0] - s * p[1]), r.t[1] + r.s * (s * p[0] + c * p[1]), r.t[2] + r.s * p[2]]; };
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6;
  const a = [0.1, 0.4, 1.2], b = [0.5, 0.3, 1.1], A = [500, 900, 1300], B = [600, 1700, 1250];   // B - A has no z change x scale
  const r = V.twoHand(a, b, A, B);
  ok(Math.abs(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) - r.s) < 1e-9, "scale");
  const ma = map(r, a), mb = map(r, b), mid = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2, (ma[2] + mb[2]) / 2];
  ok(near(mid, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]), "midpoint held");
  ok(Math.abs(Math.atan2(mb[1] - ma[1], mb[0] - ma[0]) - Math.atan2(B[1] - A[1], B[0] - A[0])) < 1e-9, "heading held");
  const same = V.twoHand(a, b, map({ s: 2000, yaw: 0.7, t: [10, 20, 30] }, a), map({ s: 2000, yaw: 0.7, t: [10, 20, 30] }, b));
  ok(Math.abs(same.s - 2000) < 1e-6 && Math.abs(same.yaw - 0.7) < 1e-9 && near(same.t, [10, 20, 30]), "no hand motion = no change");
  ok(V.twoHand([0, 0, 0], [1, 0, 0], [0, 0, 0], [1e9, 0, 0]).s === 40000, "scale clamped");
}
ok(V.fmtScale(1000) === "1:1" && V.fmtScale(3000) === "1:3.0" && V.fmtScale(500) === "2.0:1", "scale label");
{ // the workshop room: auto margins round the table, or the building size centered on the machine; gaps to the walls
  const table = { x0: 0, x1: 1500, y0: 0, y1: 2800 }, machine = { x0: -100, x1: 1650, y0: -20, y1: 2800, z1: 1100 };
  const a = Shop.room(table, machine, null);
  ok(a.x0 === -Shop.MARGIN.x && a.y1 === 2800 + Shop.MARGIN.back && a.h === Shop.HEIGHT, "auto room");
  const r = Shop.room(table, machine, { w: 3048, d: 4267.2, h: 2743.2 });
  ok(Math.abs(r.x1 - r.x0 - 3048) < 1e-9 && Math.abs(r.gaps.left - r.gaps.right) < 1e-9, "building centered in X");
  ok(Math.abs(r.gaps.front - r.gaps.back) < 1e-9 && Math.abs(r.gaps.top - (2743.2 - 1100)) < 1e-9, "centered in Y, headroom");
  ok(Math.abs(r.gaps.left - (3048 - 1750) / 2) < 1e-9, "X gap");
  ok(Shop.room(table, machine, { w: 1500 }).gaps.left < 0, "too narrow: negative gap");
  const mixed = Shop.room(table, machine, { d: 5000 });
  ok(mixed.x0 === -Shop.MARGIN.x && Math.abs(mixed.y1 - mixed.y0 - 5000) < 1e-9, "blank X stays auto");
}
ok(V.snap(1231.3, IN / 2) === 1231.9 || Math.abs(V.snap(1231.3, IN / 2) - 97 * IN / 2) < 1e-9, "snap to 1/2 in");
ok(V.clampCut(50) === 200 && V.clampCut(5000) === 4000 && V.clampCut(1000) === 1000, "cut limits");
ok(V.tabletopScale(500) === 1000, "never smaller than 1:1");
ok(Math.abs(V.tabletopScale(2700) - 3000) < 1e-9, "2.7 m machine -> 0.9 m on the stand");
ok(V.fmtLen(48.5 * IN, "in") === "48.5" && V.fmtLen(1219.2, "mm") === "1219", "length format");

console.log(fails ? `${fails} failed` : "vr: all passed");
process.exit(fails ? 1 : 0);
