// Learn clips as files (Part 47b): the (Video Learn: ...) header parser (demo_script.js learnOf) and the
// BitChange / TouchPlate commands - one key per line, header only, DESC lines adding up, the last NAME / GROUP / KIND
// winning, defaults (file name, My clips, demo), what a mine clip may hold, BIT= shanks, a long line an error.
//   node tests/test_learn_files.js   (in npm test)
"use strict";
const DS = require("../web/js/demo_script.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };
const L = (text, file = "my_clip.gcode") => DS.learnOf(DS.parse(text), file);

// a full header
let c = L(["(Video Learn: NAME=First try)", "(Video Learn: NAME=Squaring the gantry)", "(Video Learn: GROUP=Setting up)",
  "(Video Learn: KIND=demo)", "(Video Learn: DESC=Two switches,)", "(Video Learn: DESC= one each side.)", "(Video: MACHINE=26x50)",
  "(Video Home:)", "G0 X10"].join("\n"));
ok(c.title === "Squaring the gantry" && c.group === "Setting up" && c.type === "demo", `the last NAME wins, GROUP, KIND: ${JSON.stringify(c)}`);
ok(c.blurb === "Two switches, one each side.", `DESC lines joined by a space: "${c.blurb}"`);
ok(!c.errors.length && c.mine === null, `clean: ${c.errors.join("; ")}`);
// defaults
c = L("G0 X1\n", "sub/dir/Tool change tips.nc");
ok(c.title === "Tool change tips" && c.group === "My clips" && c.type === "demo" && c.blurb === "", `no header: the file's name, My clips, demo: ${JSON.stringify(c)}`);
// errors
const errs = (text) => L(text).errors.join(" | ");
ok(/one key per/.test(errs("(Video Learn: NAME=A GROUP=B)\nG0 X1")), "two keys on a line: an error");
ok(/before the first move/.test(errs("G0 X1\n(Video Learn: NAME=Late)")), "a header line after the first move: an error");
ok(/doesn't know TITLE/.test(errs("(Video Learn: TITLE=x)\nG0 X1")), "an unknown key: an error");
ok(/KIND= demo or mine/.test(errs("(Video Learn: KIND=movie)\nG0 X1")), "KIND= not demo / mine: an error");
ok(/KEY=value/.test(errs("(Video Learn: just words)\nG0 X1")), "no KEY=: an error");
ok(/127/.test(errs("(Video Learn: DESC=" + "x".repeat(120) + ")\nG0 X1")), "a line over 127 bytes: an error (FluidNC would stop on it)");
ok(/unknown \(Video bogus:\)/.test(errs("(Video Bogus: X=1)\nG0 X1")), "a parser warning counts as an error for a clip");
// mine clips
c = L("(Video Learn: KIND=mine)\n(Video BitChange: BIT=1/8 HOLD=wrenches NUTS=one)\n");
ok(c.type === "mine" && c.mine && c.mine.kind === "bitchange" && c.mine.kv.bit === "1/8" && !c.errors.length, `a mine bit change: ${JSON.stringify(c.mine)} ${c.errors}`);
c = L("(Video Learn: KIND=mine)\n(Video TouchPlate: HOLD=2)\n");
ok(c.mine && c.mine.kind === "touchplate" && !c.errors.length, "a mine touch plate");
ok(/wants one/.test(errs("(Video Learn: KIND=mine)\n")), "mine with nothing to play: an error");
ok(/wants one/.test(errs("(Video Learn: KIND=mine)\n(Video BitChange:)\n(Video TouchPlate:)\n")), "mine with two: an error");
ok(/no moves/.test(errs("(Video Learn: KIND=mine)\n(Video BitChange:)\nG0 X1\n")), "mine with a move: an error");
ok(/no moves/.test(errs("(Video Learn: KIND=mine)\n(Video BitChange:)\n(Video Title: TEXT=Hi)\n")), "mine with another (Video ...) line: an error");
ok(!errs("(Video BitChange: BIT=other)\n(Video Home:)\nG0 X1\n"), "a demo may hold a bit change in its intro");
ok(/goes before the first move/.test(errs("G0 X1\n(Video BitChange:)\n")), "BitChange mid-job: an error (intro only)");
// BitChange / TouchPlate arguments
ok(/BIT= a shank/.test(errs("(Video BitChange: BIT=7/8)\nG0 X1")), "BIT=7/8: an error");
ok(/HOLD= lock or wrenches/.test(errs("(Video BitChange: HOLD=tape)\nG0 X1")), "HOLD=tape: an error");
ok(/NUTS= each or one/.test(errs("(Video BitChange: NUTS=two)\nG0 X1")), "NUTS=two: an error");
ok(/doesn't know SPEED/.test(errs("(Video BitChange: SPEED=2)\nG0 X1")), "an unknown BitChange key: an error");
ok(/0 to 30/.test(errs("(Video TouchPlate: HOLD=99)\nG0 X1")), "TouchPlate HOLD=99: an error");
const sh = (v) => JSON.stringify(DS.shankOf(v));
ok(sh("1/8") === '{"d":3.175}' && sh('1/4"') === '{"d":6.35}' && sh("6mm") === '{"d":6}' && sh("6.35") === '{"d":6.35}'
  && sh("other") === '{"other":true}' && DS.shankOf() === null && DS.shankOf("big") === undefined, "shankOf: fractions, mm, other, none, bad");
// length from the script
ok(DS.playSecs(DS.parse("(Video BitChange:)\n")) === 22 && DS.playSecs(DS.parse("(Video Title: TIME=4 TEXT=a)\n(Video Wait: TIME=2)\nG0 X1\n")) === 6,
  "playSecs: a bit change ~22 s, TIME= adds up");
// Learn lines aren't settings or commands to the rest of the parser
const p = DS.parse("(Video Learn: NAME=x)\n(Video Learn: KIND=mine)\n(Video TouchPlate:)\n");
ok(!p.warnings.length && p.intro.length === 1 && !("name" in p.settings), "the header is kept apart (no warnings, not a setting)");
console.log(fails ? `learn files: ${fails} of ${checks} failed` : `learn files: all ${checks} passed`);
process.exit(fails ? 1 : 0);
