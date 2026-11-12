/**
 * WindowGeometry Class
 * Represents and compares window dimensions and positions.
 */
class WindowGeometry {
    /**
     * @param {object} geometry - Object with x, y, width, height properties.
     */
    constructor(geometry) {
        this.x = geometry.x;
        this.y = geometry.y;
        this.width = geometry.width;
        this.height = geometry.height;
        this.left = this.x;
        this.top = this.y;
        this.right = this.x + this.width;
        this.bottom = this.y + this.height;
    }

    /**
     * Determine if a coordinate is near an anchor position.
     * @param {number} actual
     * @param {number} expected_closed
     * @param {number} expected_gapped
     * @param {number} gapSize
     * @returns {boolean}
     */
    static nearArea(actual, expected_closed, expected_gapped, gapSize) {
        let tolerance = gapSize + 2;
        return Math.abs(actual - expected_closed) <= tolerance || Math.abs(actual - expected_gapped) <= tolerance;
    }

    /**
     * Choose the quick-tile spot a dropped floating window should go into, or null to leave it alone.
     *
     * 1. Lines up: every edge is within `threshold` of a candidate's edges, in either its gapped
     *    or its closed (ungapped, as KWin places tiles) form. The closest such candidate wins.
     * 2. Against a screen edge: otherwise, if any edge is within `threshold` of the work area's
     *    edge (or past it), take the candidates touching every such edge and pick the one whose
     *    gapped rect overlaps the window most (intersection over union).
     *
     * @param {object} frame - The window's frame, with left/right/top/bottom.
     * @param {object} area - The work area, with left/right/top/bottom.
     * @param {Array<{name: string, sides: string[], closed: object, gapped: object}>} candidates -
     *     Tile spots; `sides` lists the screen edges each one touches, `closed`/`gapped` give edges.
     * @param {number} threshold - Distance in px that still counts as close.
     * @returns {string|null} The chosen candidate's name.
     */
    static pickSnapTarget(frame, area, candidates, threshold) {
        const EDGES = ["left", "right", "top", "bottom"];
        const deviation = (form) => Math.max(...EDGES.map((e) => Math.abs(frame[e] - form[e])));

        let best = null;
        let bestDeviation = Infinity;
        for (const c of candidates) {
            const d = Math.min(deviation(c.gapped), deviation(c.closed));
            if (d <= threshold && d < bestDeviation) {
                best = c.name;
                bestDeviation = d;
            }
        }
        if (best) return best;

        const touched = [];
        if (frame.left <= area.left + threshold) touched.push("left");
        if (frame.right >= area.right - threshold) touched.push("right");
        if (frame.top <= area.top + threshold) touched.push("top");
        if (frame.bottom >= area.bottom - threshold) touched.push("bottom");
        if (touched.length === 0) return null;

        const iou = (r) => {
            const w = Math.max(0, Math.min(frame.right, r.right) - Math.max(frame.left, r.left));
            const h = Math.max(0, Math.min(frame.bottom, r.bottom) - Math.max(frame.top, r.top));
            const inter = w * h;
            const union = (frame.right - frame.left) * (frame.bottom - frame.top) + (r.right - r.left) * (r.bottom - r.top) - inter;
            return union > 0 ? inter / union : 0;
        };
        let bestOverlap = -1;
        for (const c of candidates) {
            if (!touched.every((side) => c.sides.includes(side))) continue;
            const o = iou(c.gapped);
            if (o > bestOverlap) {
                best = c.name;
                bestOverlap = o;
            }
        }
        return best;
    }

    /**
     * Produce a stable slot key string from a geometry object.
     * @param {object} geo
     * @returns {string}
     */
    static slotKey(geo) {
        return `${Math.round(geo.x)},${Math.round(geo.y)},${Math.round(geo.width)},${Math.round(geo.height)}`;
    }

    /**
     * Create a deep copy of this geometry.
     * @returns {WindowGeometry} A new instance with the same values.
     */
    copy() {
        return new WindowGeometry(this);
    }

    /**
     * Strict equality check against another geometry.
     * @param {object} other - The geometry to compare with.
     * @returns {boolean}
     */
    equals(other) {
        return (
            this.x === other.x &&
            this.y === other.y &&
            this.width === other.width &&
            this.height === other.height
        );
    }

    /**
     * Approximate equality check with a small threshold.
     * @param {object} other - The geometry to compare with.
     * @param {number} [threshold=10] - The maximum difference allowed for each property.
     * @returns {boolean}
     */
    nearlyEquals(other, threshold = 10) {
        return (
            Math.abs(this.x - other.x) <= threshold &&
            Math.abs(this.y - other.y) <= threshold &&
            Math.abs(this.width - other.width) <= threshold &&
            Math.abs(this.height - other.height) <= threshold
        );
    }

    /**
     * Returns a concise geometry string.
     * @returns {string}
     */
    toString() {
        return ["x", this.x, this.width, this.right, "y", this.y, this.height, this.bottom].join(" ");
    }
}

if (typeof global !== "undefined") {
    global.WindowGeometry = WindowGeometry;
}
