# cnc-gcode-tools (vendored)

Unmodified copies of `src/js/parser.js`, `gcode-expander.js`, `animator.js` and `stock-sim.js` from
[cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) 0.6.2 (commit f78b9fe), MIT (see LICENSE). The configurator
uses them to play G-code: parse (with #<vars> expansion, messages, M0 pauses, G38.2 probing against the stock), time
(acceleration-aware) and carve the stock. Fix bugs there, then copy the files here again.
