// StockSimulator from cnc-gcode-tools (github.com/jeyeager65/cnc-gcode-tools, src/js/stock-sim.js @ 0870dce, MIT):
// the heightmap stock carving only (its WebGL renderer and probe left out; the page draws the heights with three.js).
// Copied as is - fix it there and copy it again.
/**
 * Stock Simulation
 * Carves a heightmap of the stock with each move's tool shape, so the 3D view can show
 * what the machined part looks like. A 3-axis machine with a vertical tool can't cut
 * undercuts, so the top surface describes the part fully; accuracy is set by the grid.
 */

const STOCK_TOOL_SHAPES = ['flat', 'ball', 'bullnose', 'vbit', 'chamfer', 'taperball'];

/**
 * Tool geometry -> { radius, profile(d), flutes }, where profile is how far above the tool
 * tip the cutting edge is at distance d from the tool axis. Returns null if it can't cut.
 * @param {Object} def - { shape, diameter, angle, tip, cornerRadius, flutes }
 */
function compileStockTool(def) {
    const tool = compileStockToolProfile(def);
    if (tool) {
        // Only for drawing the tool: flute count (0 = unknown), straight for V and chamfer bits
        tool.flutes = def.flutes > 0 ? Math.min(Math.round(def.flutes), 12) : 0;
        tool.straightFlutes = def.shape === 'vbit' || def.shape === 'chamfer';
        tool.fluteLength = def.fluteLength > 0 ? def.fluteLength : null;
        tool.overallLength = def.overallLength > 0 ? def.overallLength : null;
    }
    return tool;
}

function compileStockToolProfile(def) {
    if (!def || !(def.diameter > 0)) return null;
    const r = def.diameter / 2;
    switch (def.shape) {
        case 'ball':
            return { radius: r, flat: false, profile: (d) => r - Math.sqrt(Math.max(0, r * r - d * d)) };
        case 'bullnose': {
            const cr = Math.min(Math.max(def.cornerRadius || 0, 0), r);
            const f = r - cr;
            return {
                radius: r, flat: cr === 0,
                profile: (d) => d <= f ? 0 : cr - Math.sqrt(Math.max(0, cr * cr - (d - f) * (d - f)))
            };
        }
        case 'taperball': {
            // Ball tip of diameter TIP blending into a cone of included ANGLE, up to diameter D
            const angle = typeof def.angle === 'number' && def.angle >= 0 && def.angle < 180 ? def.angle : 90;
            const ballR = (def.tip || 0) / 2;
            if (def.diameter <= (def.tip || 0) || angle === 0) {
                // No taper left: a ball nose of the smaller size
                const br = angle === 0 ? Math.min(ballR, r) : r;
                if (!(br > 0)) return null;
                return { radius: br, flat: false, profile: (d) => br - Math.sqrt(Math.max(0, br * br - d * d)) };
            }
            const a = angle / 2 * Math.PI / 180;
            const zt = ballR * (1 - Math.sin(a)); // height where the ball meets the cone
            const rt = ballR * Math.cos(a);       // radius there
            const slope = 1 / Math.tan(a);
            return {
                radius: r, flat: false,
                profile: (d) => d <= rt
                    ? ballR - Math.sqrt(Math.max(0, ballR * ballR - d * d))
                    : zt + (d - rt) * slope
            };
        }
        case 'vbit':
        case 'chamfer': {
            const angle = def.angle > 0 && def.angle < 180 ? def.angle : 90;
            const slope = 1 / Math.tan(angle / 2 * Math.PI / 180);
            const t = Math.min(Math.max((def.tip || 0) / 2, 0), r);
            return { radius: r, flat: false, profile: (d) => d <= t ? 0 : (d - t) * slope };
        }
        default: // flat end mill
            return { radius: r, flat: true, profile: () => 0 };
    }
}

class StockSimulator {
    /**
     * @param {Object} stock - { xmin, xmax, ymin, ymax, zmin, zmax } in the file's coordinates
     * @param {Map<number, Object>} tools - T number -> tool definition (see compileStockTool)
     * @param {Object} [options] - { maxCells: grid size limit, snapshots: false to keep
     *   none (for carving forward only) }
     */
    constructor(stock, tools, options = {}) {
        this.stock = stock;
        this.useSnapshots = options.snapshots !== false;
        const width = stock.xmax - stock.xmin;
        const length = stock.ymax - stock.ymin;
        const maxCells = options.maxCells || 1e6;
        const cell = Math.sqrt(width * length / maxCells);
        this.nx = Math.max(1, Math.floor(width / cell));
        this.ny = Math.max(1, Math.floor(length / cell));
        this.dx = width / this.nx;
        this.dy = length / this.ny;
        this.vx = this.nx + 1; // vertices per row
        this.vy = this.ny + 1;
        this.heights = new Float32Array(this.vx * this.vy);
        // Heights are float32, so compare against the float32 bottom
        this.bottom = Math.fround(stock.zmin);

        this.tools = StockSimulator.compileTools(tools);
        // Moves with a T number that has no definition (e.g. rapids before the first
        // tool change) use the first tool
        this.defaultTool = this.tools.values().next().value || null;

        this.base = null; // heights after earlier jobs, the starting point for this one
        this.hiddenTools = new Set(); // segment.tool values (the tool panel's) not carved
        this.segments = [];
        this.snapshots = new Map(); // segment index -> heights after carving [0, index)
        this.gouges = new Set(); // indices of rapid moves that cut into the stock
        this.reset();
    }

    static compileTools(defs) {
        const tools = new Map();
        for (const [num, def] of defs) {
            const tool = compileStockTool(def);
            if (tool) tools.set(num, tool);
        }
        return tools;
    }

    /**
     * Carve jobs that run before this one (oldest first) into the starting stock, e.g.
     * one file per bit. Each has its own tools; moves by tools it doesn't define are skipped.
     * @param {Array<{segments: Array, tools: Map}>} jobs
     */
    setPriorJobs(jobs) {
        this.base = null;
        this.heights.fill(this.stock.zmax);
        for (const job of jobs) {
            const tools = StockSimulator.compileTools(job.tools);
            for (let i = 0; i < job.segments.length; i++) {
                this.carveMove(job.segments, i, tools, null);
            }
        }
        if (jobs.length > 0) this.base = this.heights.slice();
        this.snapshots.clear();
        this.gouges.clear();
        this.reset();
    }

    /**
     * Leave out the moves of these tools (keyed like the tool panel: segment.tool),
     * re-carving from the start if that changes anything
     */
    setHiddenTools(hidden) {
        const next = new Set(hidden);
        if (next.size === this.hiddenTools.size && [...next].every(t => this.hiddenTools.has(t))) return;
        this.hiddenTools = next;
        this.snapshots.clear();
        this.gouges.clear();
        this.reset();
    }

    setSegments(segments) {
        this.segments = segments;
        // Snapshots, so stepping the animation backward doesn't re-carve everything.
        // Up to 8 of them, within about 160 MB, however fine the grid
        const count = Math.max(1, Math.min(8, Math.floor(160e6 / this.heights.byteLength)));
        this.snapshotInterval = this.useSnapshots ? Math.max(256, Math.ceil(segments.length / count)) : Infinity;
        this.snapshots.clear();
        this.gouges.clear();
        this.reset();
    }

    reset() {
        this.partial = null;
        if (this.base) this.heights.set(this.base);
        else this.heights.fill(this.stock.zmax);
        this.carvedIndex = 0;
        this.markAllDirty();
    }

    // Changed area since the renderer last looked: vertex rows dirtyMin..dirtyMax and
    // columns dirtyMinI..dirtyMaxI
    markAllDirty() {
        this.dirtyMin = 0;
        this.dirtyMax = this.vy - 1;
        this.dirtyMinI = 0;
        this.dirtyMaxI = this.vx - 1;
    }

    clearDirty() {
        this.dirtyMin = Infinity;
        this.dirtyMax = -Infinity;
        this.dirtyMinI = Infinity;
        this.dirtyMaxI = -Infinity;
    }

    get isDirty() {
        return this.dirtyMin <= this.dirtyMax;
    }

    /**
     * Carve segments until segments [0, target) are cut, or the time budget runs out.
     * Going backward restores the nearest snapshot and carves forward from it.
     * @returns {boolean} true when the stock is up to date
     */
    advanceTo(target, budgetMs = Infinity, progress = 0) {
        target = Math.max(0, Math.min(target, this.segments.length));
        // A move carved part way (see carvePartial) that the position is now before
        const p = this.partial;
        if (p && (target < p.index || (target === p.index && progress < p.progress))) {
            this.partial = null;
            this.rewind(target);
        } else if (target < this.carvedIndex) {
            this.rewind(target);
        }

        const deadline = performance.now() + budgetMs;
        while (this.carvedIndex < target) {
            // Snapshots hold whole moves only, never one carved part way
            if (this.carvedIndex > 0 && this.carvedIndex % this.snapshotInterval === 0 &&
                !this.snapshots.has(this.carvedIndex) && !(this.partial && this.partial.index === this.carvedIndex)) {
                this.snapshots.set(this.carvedIndex, this.heights.slice());
            }
            this.carveSegment(this.carvedIndex);
            if (this.partial && this.partial.index === this.carvedIndex) this.partial = null;
            this.carvedIndex++;
            if ((this.carvedIndex & 63) === 0 && performance.now() > deadline) break;
        }
        const done = this.carvedIndex >= target;
        if (done && progress > 0 && progress < 1 && target < this.segments.length) this.carvePartial(target, progress);
        return done;
    }

    /**
     * Carve move `index` from its start to `progress` (0-1) of the way, so the stock keeps
     * up with the tool during long moves. Each call only carves on from where the last one
     * got to, as the tool's swept area along a line is the union of its pieces.
     */
    carvePartial(index, progress) {
        const seg = this.segments[index];
        if (seg.type === 'probe') return;
        if (this.hiddenTools.size > 0 && this.hiddenTools.has(seg.tool || 0)) return;
        const p = this.partial && this.partial.index === index ? this.partial : null;
        if (p && progress <= p.progress) return;
        const at = (t) => ({
            x: seg.start.x + (seg.end.x - seg.start.x) * t,
            y: seg.start.y + (seg.end.y - seg.start.y) * t,
            z: seg.start.z + (seg.end.z - seg.start.z) * t
        });
        const piece = { ...seg, start: p ? at(p.progress) : seg.start, end: at(progress) };
        // Only the first piece follows a probe (see carveMove)
        const prev = p ? piece : this.segments[index - 1];
        this.carveOne(piece, prev, this.tools, this.defaultTool);
        this.partial = { index, progress };
    }

    rewind(target) {
        let best = 0;
        for (const index of this.snapshots.keys()) {
            if (index <= target && index > best) best = index;
        }
        if (best > 0) {
            this.heights.set(this.snapshots.get(best));
            this.carvedIndex = best;
            this.markAllDirty();
        } else {
            this.reset();
        }
    }

    carveSegment(index) {
        // Same tool key as the 3D view uses for hidden toolpaths
        if (this.hiddenTools.size > 0 && this.hiddenTools.has(this.segments[index].tool || 0)) return;
        if (this.carveMove(this.segments, index, this.tools, this.defaultTool) &&
            this.segments[index].type === 'rapid') {
            this.gouges.add(index);
        }
    }

    /**
     * Carve move `index` of `segments` with its tool
     * @returns {boolean} true if any material was removed
     */
    carveMove(segments, index, tools, fallbackTool) {
        return this.carveOne(segments[index], segments[index - 1], tools, fallbackTool);
    }

    /**
     * Carve one move, given the move before it
     * @returns {boolean} true if any material was removed
     */
    carveOne(seg, prev, tools, fallbackTool) {
        // Probe moves stop on contact, so they never cut
        if (seg.type === 'probe') return false;
        const tool = tools.get(seg.toolNumber) || fallbackTool;
        if (!tool) return false;

        let s = seg.start;
        const e = seg.end;
        // A probe stops on contact somewhere along its move, but is drawn to its programmed
        // end, so the move after it (usually a retract) doesn't really start there
        if (prev && prev.type === 'probe' && s.z < e.z) s = { x: s.x, y: s.y, z: e.z };
        if (Math.min(s.z, e.z) >= this.stock.zmax) return false; // entirely above the stock

        return this.sweep(s.x, s.y, s.z, e.x, e.y, e.z, tool);
    }

    /**
     * Lower the heightmap to the tool's swept volume along a straight move.
     * Level moves are exact. Moves that change Z are cut in pieces no longer than a
     * cell, each at its own height, so the error is at most one cell's worth of slope.
     * @returns {boolean} true if any material was removed
     */
    sweep(x0, y0, z0, x1, y1, z1, tool) {
        const lx = x1 - x0, ly = y1 - y0, lz = z1 - z0;
        const lengthXY = Math.hypot(lx, ly);
        const step = Math.min(this.dx, this.dy);
        const pieces = Math.abs(lz) > 1e-9 && lengthXY > step
            ? Math.min(Math.ceil(lengthXY / step), 100000)
            : 1;

        let cut = false;
        for (let p = 0; p < pieces; p++) {
            const t0 = p / pieces, t1 = (p + 1) / pieces;
            if (this.sweepPiece(x0 + lx * t0, y0 + ly * t0, z0 + lz * t0,
                                x0 + lx * t1, y0 + ly * t1, z0 + lz * t1, tool)) {
                cut = true;
            }
        }
        return cut;
    }

    sweepPiece(ax, ay, az, bx, by, bz, tool) {
        const S = this.stock, h = this.heights;
        const r = tool.radius, r2 = r * r;
        const dx = this.dx, dy = this.dy, vx = this.vx;

        const i0 = Math.max(0, Math.ceil((Math.min(ax, bx) - r - S.xmin) / dx));
        const i1 = Math.min(this.nx, Math.floor((Math.max(ax, bx) + r - S.xmin) / dx));
        const j0 = Math.max(0, Math.ceil((Math.min(ay, by) - r - S.ymin) / dy));
        const j1 = Math.min(this.ny, Math.floor((Math.max(ay, by) + r - S.ymin) / dy));
        if (i0 > i1 || j0 > j1) return false;

        const ux = bx - ax, uy = by - ay;
        const len2 = ux * ux + uy * uy;
        const hasLength = len2 > 1e-18;
        const zLow = Math.min(az, bz); // a plunge cuts at its lowest point
        const bottom = this.bottom;
        const flat = tool.flat, profile = tool.profile;

        let cut = false;
        for (let j = j0; j <= j1; j++) {
            const py = S.ymin + j * dy - ay;
            const row = j * vx;
            for (let i = i0; i <= i1; i++) {
                const px = S.xmin + i * dx - ax;
                let t = hasLength ? (px * ux + py * uy) / len2 : 0;
                if (t < 0) t = 0; else if (t > 1) t = 1;
                const qx = px - t * ux, qy = py - t * uy;
                const d2 = qx * qx + qy * qy;
                if (d2 > r2) continue;

                let z = hasLength ? az + (bz - az) * t : zLow;
                if (!flat) z += profile(Math.sqrt(d2));
                if (z < bottom) z = bottom;
                const k = row + i;
                if (z < h[k] - 1e-6) {
                    h[k] = z;
                    cut = true;
                }
            }
        }
        if (cut) {
            if (j0 < this.dirtyMin) this.dirtyMin = j0;
            if (j1 > this.dirtyMax) this.dirtyMax = j1;
            if (i0 < this.dirtyMinI) this.dirtyMinI = i0;
            if (i1 > this.dirtyMaxI) this.dirtyMaxI = i1;
        }
        return cut;
    }
}

// Node (tests) and browser
if (typeof module !== 'undefined' && module.exports) module.exports = { StockSimulator, compileStockTool, STOCK_TOOL_SHAPES };
else self.StockSimulator = StockSimulator;
