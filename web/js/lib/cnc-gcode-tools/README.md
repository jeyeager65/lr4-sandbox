# cnc-gcode-tools (vendored)

Unmodified copies of `src/js/parser.js`, `gcode-expander.js`, `animator.js` and `stock-sim.js` from
[cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools), MIT (see LICENSE). `SOURCE.json` pins the version,
the commit they were copied from and each file's SHA-256. The configurator uses them to play G-code: parse (with
#<vars> expansion, messages, M0 pauses, G38.2 probing against the stock), time (acceleration-aware) and carve the
stock.

Don't edit them here. Fix bugs there and commit, then `python tools/sync_gcode_tools.py` copies that commit's files
and rewrites `SOURCE.json`. CI runs `python tools/sync_gcode_tools.py --check`.
