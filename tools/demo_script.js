// Video scripts in G-code comments, for tools/record_demo.js (user 2026-10-22: "make these recordings use gcode files,
// special comments to set settings, display text, etc."; the syntax follows cnc-gcode-tools' CNCSIM / Stock / ToolDef
// comments). FluidNC and the page ignore them: one file is the job and the video.
//   (Video: KEY=VALUE ...)           settings, any line before the first move; the command line's flags win:
//       SIZE=2560x1440 FPS=30 VOLUME=0.6 SOUND=on VOICE=machine|robot (robot = the joke voice) DETAIL=full SCENERY=shop|empty|plain MACHINE=26x50 (cut area, in)
//       PAUSE=2 (s each M0 popup shows, then it resumes)  MESSAGES=on MESSAGETIME=4 (MSG / PRINT lines shown on top, s;
//       not MSGTIME: FluidNC - and the page - show any comment with "MSG" in it as a message; still read, with a warning)
//       PARK=on (drive the gantry back at the end)  HOLD=3 (s on the result)
//       PENDANT=on (the FluidTouch pendant on the table, its live screen in a corner of the video; off by default)
//       MODE=basic|fluidnc (fluidnc: the job runs on the page's FluidNC - its own $H, jogs, $SD/Run, M0 holds)
//     the machine (Part 29; the page's My machine, set before anything is filmed):
//       TABLE=34in (top of the MDF; mm, in or ft)  ROOM=16x20x9ft (the shop: X x Y x ceiling; a unit at the end covers
//       the bare numbers, ft if none)  BRACES=auto|6  STRUTS=mdf|temp  BASE=sheet|torsion  PETER=solid|honeycomb|none (the choices the page
//       shows: with your own files open|closed|honeycomb|none)  ROUTER=off  SKIRT=off  HOSE=off  FAN=off (on by
//       default)  MAIN=#292a2e ACCENT=#cc1f1a (print colours)
//   (Video Show: PRESET=frame HIDE=core.hardware,Y_Clip_* SHOW=XZ_Plate_Min)   what's drawn, by the Show tree's ids
//       (assembly: table yz-min yz-max beam core router hose electronics pendant; "asm.kind" with printed / cut /
//       hardware / electronics; a part = its name, * matches); PRESET (all, no-hardware, printed, frame) first, then
//       HIDE, then SHOW (a part shown turns its assembly + kind on). Intro or mid-job; the view only, never the BOM.
//   (Video Inspect: ID=core TIME=1.5 ORBIT=8 DIST=mm EXPLODE=0.6 SECTION=x@0.5 FLIP=on VIEW=lines)   the inspect view: ID =
//       a Show tree id (the camera blends to its framing over TIME, DIST overrides the distance; ID=off back to the
//       machine and the camera from before); EXPLODE (0-1) and SECTION (x|y|z@0-1 across the set, or off; FLIP keeps
//       the other side) animate over TIME; VIEW=solid|xray|lines (xray: printed + cut parts see-through; lines: edges
//       only; XRAY=on|off still works); ORBIT turns once round it. Each line runs its own TIME + ORBIT with the job
//       held; lines in a row run one after the other. Only the set is drawn until ID=off (a Shot moves the camera).
//   (Video Shot: VIEW=name TIME=s ORBIT=s DIST=mm)   the camera: blends there over TIME (1.5), then turns once round
//       it over ORBIT; DIST = how far from what it looks at. VIEW: workshop, machine, stock, tool (close on the bit,
//       follows it), core (close on the router / core), iso, front, top, side, back, page (mid-job only: the page's own
//       camera again, with its probe close-ups), pendant (straight at the pendant's screen; PENDANT=on)
//   (Video Home: OFFSET=30 DIST=700)  $H in real time, the machine starting OFFSET mm off its switches; the camera
//       close on the core (DIST mm) and still. Before the first move only.
//   (Video Zero: X=100 Y=150)         work zero this far from the cutting area's front-left corner (the X / Y home
//       spot; mm, or 4in): after homing the machine jogs there and the job starts from it. The (Stock:) bounds are
//       relative to work zero, so this also places the stock on the spoilboard. Before the first move only.
//   (Video Title: TIME=3 TEXT=First line|Second line)   a full-screen card; | = a new line; TEXT last (the rest of
//       the line, as ToolDef's NAME)
//   (Video Text: TIME=4 TEXT=...)     a caption at the bottom, over what comes next
//   (Video Wait: TIME=s)              hold (mid-job: the job holds too)
//   (Video Pendant: SHOW=on CORNER=br SIZE=26)   the pendant's screen in a corner (br, bl, tr, tl; SIZE = % of the
//       video's width) or SHOW=off; needs PENDANT=on (which shows it at br from the start)
//   (Video Speed: X=62 | FIT=75 | FOR=8 REAL=5 BADGE=on)   the job's pace: X times, or fit its moves into FIT s of
//       video; FOR = only for that many s of video, then back; REAL = s at 1x at each section's first cut (after a
//       message or an M0), then easing up (0 = off); BADGE = the speed badge
// Lines before the first move are the intro, run in order; later ones run when playback reaches their line (Shot,
// Text, Title, Wait, Speed). A file whose intro has no Shot / Home / Title / Text / Wait gets the default intro
// (workshop orbit, home, machine orbit, stock).
"use strict";

const SETTINGS = { size: "wxh", machine: "wxh", fps: "num", volume: "num", pause: "num", messagetime: "num", msgtime: "num", hold: "num",
  sound: "bool", park: "bool", messages: "bool", detail: "word", scenery: "word", voice: "word", pendant: "bool", mode: "word",
  table: "len", room: "room", braces: "word", struts: "word", base: "word", peter: "word", router: "bool", skirt: "bool", hose: "bool",
  fan: "bool", main: "colour", accent: "colour" };
const MACHINE_KEYS = ["table", "room", "braces", "struts", "base", "peter", "router", "skirt", "hose", "fan", "main", "accent"];
const PRESETS = ["all", "no-hardware", "printed", "frame"];   // web/js/show_tree.js PRESETS
const KINDS = ["shot", "home", "zero", "title", "text", "wait", "speed", "pendant", "show", "inspect"];
const INTRO_ONLY = new Set(["home", "zero"]);
const SHOTS = new Set(["workshop", "machine", "stock", "tool", "core", "iso", "front", "top", "side", "back", "page", "pendant"]);
const MOTION = /(^|[^A-Z])G0*(0|1|2|3|38\.\d)(?![\d.])/;
const IN = 25.4;

// "KEY=VALUE KEY=VALUE TEXT=the rest" -> { key: value } (keys lower case; TEXT / NAME take the rest of the line)
function keyvals(s) {
  const out = {}, ms = [...s.matchAll(/([A-Za-z_]+)\s*=\s*/g)];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i], k = m[1].toLowerCase(), from = m.index + m[0].length;
    out[k] = (["text", "name"].includes(k) ? s.slice(from) : s.slice(from, i + 1 < ms.length ? ms[i + 1].index : undefined)).trim();
    if (["text", "name"].includes(k)) break;
  }
  return out;
}

// a line's (Video ...) comment -> { kind ("" = settings), kv } or null
function videoOf(line) {
  const m = /\(\s*Video(?:\s+([A-Za-z]+))?\s*:([^)]*)\)/i.exec(line);
  return m ? { kind: (m[1] || "").toLowerCase(), kv: keyvals(m[2]) } : null;
}

const num = (x) => x !== undefined && x !== "" && Number.isFinite(Number(x));
const UNIT = { mm: 1, in: IN, ft: 12 * IN, m: 1000 };
const mm = (x, def = "mm") => { const m = /^(-?[\d.]+)\s*(in|mm|ft|m)?$/i.exec(String(x || "").trim()); return m ? Number(m[1]) * UNIT[(m[2] || def).toLowerCase()] : NaN; };
// "16x20x9ft" / "16ftx20ftx100in" / "5000x6000x2700mm" -> [x, y, ceiling] mm (a unit at the end covers the bare numbers; ft if none)
function roomOf(v) {
  const ps = String(v).split(/x/i), tail = (/(in|mm|ft|m)$/i.exec(ps[ps.length - 1] || "") || [])[1] || "ft";
  const r = ps.map((p) => mm(p, tail));
  return r.length === 3 && r.every((q) => q > 0) ? r : null;
}

// text -> { settings, intro: [cmd], at: [cmd], firstMove (line), warnings }; cmd = { kind, kv, line (1-based) }
function parse(text) {
  const lines = String(text || "").split(/\r?\n/), out = { settings: {}, intro: [], at: [], firstMove: 0, warnings: [] };
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n], code = l.replace(/\([^)]*\)/g, " ").split(";")[0].toUpperCase();
    if (!out.firstMove && MOTION.test(code)) out.firstMove = n + 1;
    const v = videoOf(l);
    if (!v) continue;
    const line = n + 1, before = !out.firstMove, warn = (t) => out.warnings.push(`line ${line}: ${t}`);
    if (!v.kind) {
      if (!before) { warn("(Video: ...) settings go before the first move"); continue; }
      if (/MSG/.test(l)) warn(`this line has "MSG" in it, so FluidNC (and the page) show it as a message${"msgtime" in v.kv ? ": use MESSAGETIME= for MSGTIME=" : ""}`);
      for (const [k0, val] of Object.entries(v.kv)) {
        const k = k0 === "msgtime" ? "messagetime" : k0, t = SETTINGS[k];
        if (!t) { warn(`unknown setting ${k.toUpperCase()}`); continue; }
        if (t === "wxh") { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(val); if (m) out.settings[k] = [Number(m[1]), Number(m[2])]; else warn(`${k.toUpperCase()} wants WxH`); }
        else if (t === "num") { if (num(val)) out.settings[k] = Number(val); else warn(`${k.toUpperCase()} wants a number`); }
        else if (t === "bool") out.settings[k] = !/^(off|no|false|0)$/i.test(val);
        else if (t === "len") { const q = mm(val); if (q > 0) out.settings[k] = q; else warn(`${k.toUpperCase()} wants a length (34in, 860mm)`); }
        else if (t === "room") { const q = roomOf(val); if (q) out.settings[k] = q; else warn(`${k.toUpperCase()} wants XxYxCEILING (16x20x9ft)`); }
        else if (t === "colour") { if (/^#[0-9a-f]{6}$/i.test(val)) out.settings[k] = val.toLowerCase(); else warn(`${k.toUpperCase()} wants #rrggbb`); }
        else out.settings[k] = val.toLowerCase();
      }
      continue;
    }
    if (!KINDS.includes(v.kind)) { warn(`unknown (Video ${v.kind}:)`); continue; }
    const cmd = { kind: v.kind, kv: v.kv, line };
    const bad = check(cmd, before);
    if (bad) { warn(bad); continue; }
    (before ? out.intro : out.at).push(cmd);
  }
  return out;
}

function check(c, intro) {
  const kv = c.kv, k = c.kind;
  if (INTRO_ONLY.has(k) && !intro) return `(Video ${k}:) goes before the first move`;
  for (const key of ["time", "orbit", "dist", "offset", "fit", "for", "real"]) if (kv[key] !== undefined && !num(kv[key])) return `${key.toUpperCase()} wants a number`;
  switch (k) {
    case "shot": {
      const v = (kv.view || "").toLowerCase();
      if (!SHOTS.has(v)) return `Shot VIEW= one of ${[...SHOTS].join(", ")}`;
      return v === "page" && intro ? "Shot VIEW=page: mid-job only" : null;
    }
    case "zero": return Number.isFinite(mm(kv.x)) && Number.isFinite(mm(kv.y)) ? null : "Zero wants X= and Y= (mm, or 4in)";
    case "title": case "text": return kv.text ? null : `${k[0].toUpperCase() + k.slice(1)} wants TEXT=`;
    case "wait": return num(kv.time) ? null : "Wait wants TIME=";
    case "inspect":
      if (kv.id === undefined && kv.explode === undefined && kv.section === undefined && kv.xray === undefined && kv.view === undefined)
        return "Inspect wants ID=, EXPLODE=, SECTION= or VIEW=";
      if (kv.view !== undefined && !/^(solid|xray|lines)$/i.test(kv.view)) return "Inspect VIEW= wants solid, xray or lines";
      if (kv.explode !== undefined && !(num(kv.explode) && +kv.explode >= 0 && +kv.explode <= 1)) return "Inspect EXPLODE= wants 0 - 1";
      if (kv.section !== undefined && !/^(off|[xyz]@(0|1|0?\.\d+|1\.0+))$/i.test(kv.section)) return "Inspect SECTION= wants x@0.5 (x, y or z @ 0 - 1) or off";
      return null;
    case "show":
      if (kv.preset === undefined && kv.hide === undefined && kv.show === undefined) return "Show wants PRESET=, HIDE= or SHOW=";
      return kv.preset === undefined || PRESETS.includes(kv.preset.toLowerCase()) ? null : `Show PRESET= one of ${PRESETS.join(", ")}`;
    case "speed":
      if (kv.x !== undefined && (!num(kv.x) || Number(kv.x) <= 0)) return "Speed X= wants a number > 0";
      if (kv.x === undefined && kv.fit === undefined && kv.real === undefined && kv.badge === undefined) return "Speed wants X=, FIT=, REAL= or BADGE=";
      if (kv.for !== undefined && kv.x === undefined && kv.fit === undefined) return "Speed FOR= goes with X= or FIT=";
      return null;
  }
  return null;
}

// a Shot cmd -> { name, secs (blend), orbit (s, 0 = none), dist (mm or null) }
function shotOf(c, blend = 1.5) {
  const kv = c.kv;
  return { name: (kv.view || "core").toLowerCase(), secs: num(kv.time) ? Number(kv.time) : blend,
    orbit: num(kv.orbit) ? Number(kv.orbit) : 0, dist: num(kv.dist) ? Number(kv.dist) : null };
}
const titleText = (c) => c.kv.text.split("|").map((s) => s.trim()).join("\n");
const secsOf = (c, d) => (num(c.kv.time) ? Number(c.kv.time) : d);
const zeroOf = (c) => [mm(c.kv.x), mm(c.kv.y)];
const ids = (v) => String(v || "").split(/[,\s]+/).filter(Boolean);
// a Show cmd -> { preset, hide: [ids], show: [ids] } (LR4Show.apply's argument)
const showOf = (c) => ({ preset: c.kv.preset ? c.kv.preset.toLowerCase() : undefined, hide: ids(c.kv.hide), show: ids(c.kv.show) });
// an Inspect cmd -> { id ("off" closes), secs, orbit, dist, explode, section: { axis, at } | "off", flip }
function inspectOf(c, blend = 1.5) {
  const kv = c.kv, sec = kv.section && kv.section.toLowerCase();
  return { id: kv.id, secs: num(kv.time) ? Number(kv.time) : blend, orbit: num(kv.orbit) ? Number(kv.orbit) : 0,
    dist: num(kv.dist) ? Number(kv.dist) : null, explode: kv.explode !== undefined ? Number(kv.explode) : undefined,
    section: !sec ? undefined : sec === "off" ? "off" : { axis: sec[0], at: Number(sec.slice(2)) },
    flip: kv.flip !== undefined && !/^(off|no|0)$/i.test(kv.flip),
    view: kv.view ? kv.view.toLowerCase() : kv.xray === undefined ? undefined : /^(off|no|0)$/i.test(kv.xray) ? "solid" : "xray" };
}
// the settings -> LR4Machine.apply's argument (only what the file set)
const machineOf = (settings) => Object.fromEntries(MACHINE_KEYS.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]]));

// the intro when a file has none of its own (record_demo's flags: orbit, home)
function defaultIntro(o) {
  const c = (kind, kv) => ({ kind, kv, line: 0 });
  return [c("shot", { view: "workshop", time: "1", orbit: String(o.orbit) }), ...(o.home ? [c("home", { offset: "30" })] : []),
    c("shot", { view: "machine", time: "2", orbit: String(o.orbit) }), c("shot", { view: "stock", time: "2.5" }), c("wait", { time: "0.5" })];
}
const hasOwnIntro = (s) => s.intro.some((c) => ["shot", "home", "title", "text", "wait"].includes(c.kind));

module.exports = { parse, keyvals, videoOf, shotOf, titleText, secsOf, zeroOf, showOf, inspectOf, machineOf, roomOf, defaultIntro, hasOwnIntro, mm,
  SHOTS, MACHINE_KEYS };
