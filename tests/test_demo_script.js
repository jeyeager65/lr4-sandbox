// tools/demo_script.js: (Video ...) comments in a G-code file -> the video's settings, intro and later commands.
//   node tests/test_demo_script.js   (in npm test)
"use strict";
const DS = require("../tools/demo_script.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };

const G = [
  "(CNCSIM 1 UNITS=mm)",
  "(Video: SIZE=1920x1080 FPS=25 VOLUME=0.4 MACHINE=26x50 MESSAGES=off PAUSE=3)",
  "(Video Title: TIME=4 TEXT=LowRider 4 Sandbox | cuts its own strut plates)",
  "(Video Shot: VIEW=workshop TIME=1 ORBIT=8)",
  "(Video Home: OFFSET=25 DIST=600)",
  "(Video Zero: X=4in Y=60)",
  "(Video Shot: VIEW=stock)",
  "(Video Speed: FIT=60 REAL=4)",
  "(Video Bogus: X=1)",
  "(Video: COLOR=red)",
  "G21 G90",
  "G0 X10 Y10",                                          // the first move: line 12
  "(MSG, 1/4 Front holes)",
  "(Video Text: TIME=5 TEXT=Front holes: 1/8 in bit, dial 3)",
  "(Video Speed: X=1 FOR=8)",
  "(Video Shot: VIEW=tool TIME=2 DIST=250)",
  "(Video: VOLUME=1)",                                   // a setting after the first move: warned, ignored
  "(Video Home:)",                                       // home after the first move: warned
  "G1 X20 F1000",
  "(Video Shot: VIEW=page)",
  "(Video Wait: TIME=2)",
  "M30",
].join("\n");
const s = DS.parse(G);
ok(s.firstMove === 12, "first move at line 12: " + s.firstMove);
ok(JSON.stringify(s.settings) === JSON.stringify({ size: [1920, 1080], fps: 25, volume: 0.4, machine: [26, 50], messages: false, pause: 3 }),
  "settings: " + JSON.stringify(s.settings));
ok(s.intro.map((c) => c.kind).join(",") === "title,shot,home,zero,shot,speed", "intro in order: " + s.intro.map((c) => c.kind));
ok(DS.titleText(s.intro[0]) === "LowRider 4 Sandbox\ncuts its own strut plates" && DS.secsOf(s.intro[0], 3) === 4, "title: TEXT last, | = new line");
ok(s.at.map((c) => `${c.kind}@${c.line}`).join(",") === "text@14,speed@15,shot@16,shot@20,wait@21", "later lines: " + s.at.map((c) => `${c.kind}@${c.line}`));
ok(DS.titleText(s.at[0]) === "Front holes: 1/8 in bit, dial 3", "TEXT keeps its commas and colons");
ok(s.warnings.length === 4 && /unknown \(Video bogus/.test(s.warnings[0]) && /COLOR/.test(s.warnings[1]) && /settings go before/.test(s.warnings[2]) && /home:\) goes before/.test(s.warnings[3]),
  "warnings: " + JSON.stringify(s.warnings));
const sh = DS.shotOf(s.intro[1]), st = DS.shotOf(s.intro[4]), tl = DS.shotOf(s.at[2]);
ok(sh.name === "workshop" && sh.secs === 1 && sh.orbit === 8 && st.name === "stock" && st.secs === 1.5 && st.orbit === 0 && tl.dist === 250,
  "shots: " + JSON.stringify([sh, st, tl]));
ok(JSON.stringify(DS.zeroOf(s.intro[3])) === JSON.stringify([101.6, 60]), "Zero X=4in Y=60 -> mm: " + DS.zeroOf(s.intro[3]));
ok(s.intro[2].kv.offset === "25" && s.intro[2].kv.dist === "600", "Home OFFSET / DIST");
ok(DS.hasOwnIntro(s) && !DS.hasOwnIntro(DS.parse("(Video Speed: X=10)\nG0 X1")), "an intro of only Speed lines gets the default intro");
const d = DS.defaultIntro({ orbit: 10, home: true });
ok(d.map((c) => c.kind + (c.kv.view ? " " + c.kv.view : "")).join(",") === "shot workshop,home,shot machine,shot stock,wait", "default intro");
ok(DS.parse("G38.2 Z-10 F100\n(Video Text: TEXT=x)").firstMove === 1, "a probe is a move");
ok(DS.parse(["(Video Shot: VIEW=nowhere)", "(Video Speed: X=0)", "(Video Speed: FOR=5)", "(Video Zero: X=10)", "(Video Wait:)", "G0 X1"].join("\n")).warnings.length === 5, "bad lines rejected");
ok(DS.parse("(Video Shot: VIEW=page)").warnings.length === 1, "Shot VIEW=page: mid-job only");
ok(DS.parse("( video  shot : view=CORE time=2 )\nG0 X1").intro[0].kv.view === "CORE", "any case and spacing");

// "MSG" anywhere in a comment is a FluidNC message: MSGTIME is read as MESSAGETIME, with a warning
{
  const w = DS.parse("(Video: MSGTIME=3)\n(Video: MESSAGETIME=2)\nG0 X1");
  ok(w.settings.messagetime === 2 && w.warnings.length === 1 && /line 1: .*MESSAGETIME/.test(w.warnings[0]), "MSGTIME warned, MESSAGETIME used: " + JSON.stringify(w));
}
// (Video Inspect:): ID / EXPLODE / SECTION, checked; inspectOf
{
  const q = DS.parse(["(Video Inspect: ID=core TIME=1 ORBIT=4 DIST=600)", "(Video Inspect: EXPLODE=0.6 TIME=2)",
    "(Video Inspect: SECTION=x@0.5 FLIP=on)", "(Video Inspect: SECTION=w@2)", "(Video Inspect: EXPLODE=3)", "(Video Inspect: TIME=2)",
    "(Video Inspect: ID=off)", "G0 X1", "(Video Inspect: SECTION=off)"].join("\n"));
  ok(q.intro.length === 4 && q.at.length === 1, `4 intro + 1 later: ${q.intro.length} / ${q.at.length}`);
  ok(q.warnings.length === 3 && /SECTION=/.test(q.warnings[0]) && /EXPLODE=/.test(q.warnings[1]) && /Inspect wants/.test(q.warnings[2]),
    "bad SECTION / EXPLODE / nothing warned: " + q.warnings);
  const [a, b, c, d] = q.intro.map((x) => DS.inspectOf(x));
  ok(a.id === "core" && a.secs === 1 && a.orbit === 4 && a.dist === 600 && a.explode === undefined, "open: " + JSON.stringify(a));
  ok(b.explode === 0.6 && b.secs === 2 && !b.id, "explode: " + JSON.stringify(b));
  ok(c.section.axis === "x" && c.section.at === 0.5 && c.flip === true, "section: " + JSON.stringify(c));
  ok(d.id === "off" && DS.inspectOf(q.at[0]).section === "off", "off / section off");
}
// Part 29: the machine settings and (Video Show:)
{
  const m = DS.parse(["(Video: TABLE=34in ROOM=16x20x9ft BRACES=6 STRUTS=temp PETER=none ROUTER=off HOSE=no MAIN=#112233)",
    "(Video: TABLE=tall ROOM=16x20 MAIN=red)",
    "(Video Show: PRESET=frame HIDE=core.hardware, Y_Clip_* SHOW=XZ_Plate_Min)",
    "(Video Show: PRESET=nothing)", "(Video Show:)",
    "G0 X1", "(Video Show: PRESET=All)"].join("\n"));
  ok(Math.abs(m.settings.table - 863.6) < 1e-9 && m.settings.room.map((v) => +v.toFixed(1)).join() === "4876.8,6096,2743.2",
    "TABLE 34in, ROOM 16x20x9ft in mm: " + JSON.stringify([m.settings.table, m.settings.room]));
  ok(JSON.stringify(DS.machineOf(m.settings)) === JSON.stringify({ table: m.settings.table, room: m.settings.room, braces: "6", struts: "temp",
    peter: "none", router: false, hose: false, main: "#112233" }), "machineOf: " + JSON.stringify(DS.machineOf(m.settings)));
  ok(m.warnings.filter((w) => /line 2: (TABLE|ROOM|MAIN)/.test(w)).length === 3, "bad TABLE / ROOM / MAIN warned: " + m.warnings);
  ok(m.warnings.some((w) => /line 4: Show PRESET=/.test(w)) && m.warnings.some((w) => /line 5: Show wants/.test(w)), "bad Show warned");
  ok(JSON.stringify(DS.showOf(m.intro[0])) === JSON.stringify({ preset: "frame", hide: ["core.hardware", "Y_Clip_*"], show: ["XZ_Plate_Min"] }),
    "showOf: " + JSON.stringify(DS.showOf(m.intro[0])));
  ok(m.at.length === 1 && DS.showOf(m.at[0]).preset === "all", "Show mid-job, preset any case");
  ok(DS.roomOf("5000x6000x2700mm").join() === "5000,6000,2700" && DS.roomOf("16ftx20ftx100in")[2] === 2540, "room units");
}
console.log(fails ? `demo_script: ${fails} of ${checks} failed` : `demo_script: all ${checks} passed`);
process.exit(fails ? 1 : 0);
