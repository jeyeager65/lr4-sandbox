// LR4 size calculator: stock lengths and table footprint from the usable cutting area - the twin of
// freecad/calculator.py. Our own code; the results match V1E's LowRider 4 calculator (docs.v1e.com/lowrider/calculator),
// checked by tests/test_calculator.js. mm in, mm out; inches() gives the inch display (rounded UP to 1/8").
(function (root) {
  "use strict";
  const IN = 25.4;
  const OFFSETS = {
    xrail_core: 169,           // strut = cut X + this (rounded up to a whole mm)
    yrail_minus_work: 255,     // Y rail = cut Y + this
    ytable_minus_work: 313,    // table footprint Y = cut Y + this
    xbelt_extra: 180,          // X belt = strut + this
    ybelt_extra: 200,          // each Y belt = Y rail + this
    xtable_extra: 110,         // table footprint X = strut + both XZ plates + this
    xrail_cushion: 3,          // X rails = strut - this (so the plates can't kick out)
  };

  // Cut area (mm) + XZ plate thickness (mm) -> stock lengths and the minimum table footprint (mm).
  function calc(xWork, yWork, xzPlate = 6.5) {
    const o = OFFSETS;
    const strut = Math.ceil(xWork + o.xrail_core), yrail = yWork + o.yrail_minus_work;
    const c = { strut, xrails: strut - o.xrail_cushion, yrail, xbelt: strut + o.xbelt_extra, ybelt: yrail + o.ybelt_extra,
      xtable: strut + 2 * xzPlate + o.xtable_extra, ytable: yWork + o.ytable_minus_work };
    c.belt_total = c.xbelt + 2 * c.ybelt;
    return c;
  }

  const up8 = (v) => Math.ceil(v * 8) / 8;     // round up to the next 1/8 (inches)

  // A calc() result in inches, each rounded UP to 1/8"; X rails = the rounded strut minus the rounded cushion.
  function inches(c) {
    const out = {};
    for (const [k, v] of Object.entries(c)) out[k] = up8(v / IN);
    out.xrails = out.strut - up8(OFFSETS.xrail_cushion / IN);
    return out;
  }

  const api = { OFFSETS, calc, inches, up8, IN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Calc = api;
})(typeof self !== "undefined" ? self : this);
