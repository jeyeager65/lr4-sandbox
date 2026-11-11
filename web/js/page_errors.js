// A script error must not fail silently: the page's scripts share one scope and load in order, so one that throws
// can leave half the page dead with nothing to see. Loaded first (index.html's head). An uncaught error, a rejected
// promise nobody handled or a script / stylesheet that didn't load shows a bar at the bottom: what went wrong, Reload,
// Report (a GitHub issue with the message and stack filled in) and Dismiss.
//   window.LR4Errors.list   every one caught: { kind: "error" | "promise" | "load", msg, at, stack, t }
// The page tests read it (tests/test_page_smoke.js: none after a plain load).
(function () {
  "use strict";
  var list = [], bar = null, shut = false;
  // not the page's faults: the browser's own layout note, sound / video the browser wouldn't start, a cancelled load
  var QUIET = /ResizeObserver loop/;
  var QUIET_REASON = /^(AbortError|NotAllowedError)$/;

  function show() {
    if (shut || !document.body) return;
    var e = list[0];
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "errbar"; bar.className = "errbar"; bar.setAttribute("role", "alert");
      var txt = document.createElement("span"); txt.className = "errbar-msg";
      var re = document.createElement("button"); re.type = "button"; re.textContent = "Reload";
      re.addEventListener("click", function () { location.reload(); });
      var rep = document.createElement("a"); rep.textContent = "Report"; rep.target = "_blank"; rep.rel = "noopener";
      rep.href = "https://github.com/jeyeager65/lr4-sandbox/issues/new";
      rep.addEventListener("click", function () { rep.href = issue(); });
      var x = document.createElement("button"); x.type = "button"; x.textContent = "Dismiss";
      x.addEventListener("click", function () { shut = true; bar.remove(); bar = null; });
      bar.append(txt, re, rep, x);
      document.body.appendChild(bar);
    }
    bar.firstChild.textContent = "Something went wrong on this page, and parts of it may not work until you reload: " +
      e.msg.slice(0, 200) + (list.length > 1 ? " (and " + (list.length - 1) + " more)" : "");
  }
  function issue() {
    var ver = document.getElementById("version"), lines = ["**What you were doing:**\n\n", "---",
      "- Page: " + (ver && ver.textContent || "?") + (window.LR4_BUILD ? " (" + window.LR4_BUILD + ")" : ""),
      "- URL: " + location.pathname + location.hash, "- Browser: " + navigator.userAgent, ""];
    list.slice(0, 5).forEach(function (e) {
      lines.push("**" + e.kind + ":** " + e.msg + (e.at ? " (" + e.at + ")" : ""), "```", (e.stack || "no stack").slice(0, 600), "```");
    });
    return "https://github.com/jeyeager65/lr4-sandbox/issues/new?" + new URLSearchParams({ template: "problem.md",
      title: "[error] " + list[0].msg.slice(0, 80), body: lines.join("\n").slice(0, 4500) });   // GitHub drops URLs over ~8 KB
  }
  function add(kind, msg, at, stack) {
    msg = String(msg || "unknown error");
    if (QUIET.test(msg)) return;
    list.push({ kind: kind, msg: msg, at: at || "", stack: stack ? String(stack) : "", t: Date.now() });
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show, { once: true });
  }

  window.addEventListener("error", function (ev) {
    var t = ev.target;
    if (t && t !== window && t.tagName) {            // a file that didn't load (these don't bubble: caught capturing)
      if (t.tagName === "SCRIPT" || (t.tagName === "LINK" && t.rel === "stylesheet")) add("load", "could not load " + (t.src || t.href), "", "");
      return;                                        // (a missing image or sound is not worth the bar)
    }
    add("error", ev.message, ev.filename ? ev.filename.split("/").pop() + ":" + ev.lineno : "", ev.error && ev.error.stack);
  }, true);
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    if (r && QUIET_REASON.test(r.name || "")) return;
    add("promise", r && r.message || r, "", r && r.stack);
  });
  window.LR4Errors = { list: list };
})();
