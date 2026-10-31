// The tests' own router (user 2026-10-30: the real presets get remodeled, so the tests use "a generic router"):
// box_router.json - a plain box motor cap with fixed sizes - added as the built-in "testbox".
//   node:  require("./fixtures/fixture.js").addToData()   before requiring web/js/routers.js
//   page:  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: require("./fixtures/fixture.js").pageScript })
//          before the first navigate: web/data/routers.js's DATA gets it as the page loads (no page code changes)
"use strict";
const ID = "testbox";
const ROUTER = require("./box_router.json").router;
function addToData() {
  const RD = require("../../web/data/routers.js");
  RD.routers[ID] = JSON.parse(JSON.stringify(ROUTER));
  return RD;
}
const pageScript = `(() => {
  let data;
  Object.defineProperty(window, "LR4RouterData", { configurable: true,
    get() { return data; },
    set(v) { if (v && v.routers) v.routers[${JSON.stringify(ID)}] = ${JSON.stringify(ROUTER)}; data = v; } });
})();`;
module.exports = { ID, ROUTER, addToData, pageScript };
