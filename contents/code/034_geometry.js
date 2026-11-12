/**
 * WindowGeometry Class
 * Represents and compares window dimensions and positions.
 */
class WindowGeometry {
    /**
     * @param {object} geometry - Object with x, y, width, height properties.
     */
    constructor(geometry) {
        if (geometry instanceof WindowGeometry) {
            this.x = geometry.x;
            this.y = geometry.y;
            this.width = geometry.width;
            this.height = geometry.height;
        } else {
            this.x = geometry.x;
            this.y = geometry.y;
            this.width = geometry.width;
            this.height = geometry.height;
        }
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
     * Determine if a gap between two coordinates is near the expected gap.
     * @param {number} v1
     * @param {number} v2
     * @param {number} gapSize
     * @returns {boolean}
     */
    static nearWindow(v1, v2, gapSize) {
        let tolerance = gapSize + 5;
        let actualGap = Math.abs(v1 - v2);
        return actualGap <= tolerance && Math.abs(actualGap - gapSize) > 1;
    }

    /**
     * Horizontal overlap check with tolerance.
     * @param {object} geo1
     * @param {object} geo2
     * @returns {boolean}
     */
    static overlapHor(geo1, geo2) {
        let tolerance = 2 * gap.mid;
        return (
            (geo1.left <= geo2.left + tolerance && geo1.right > geo2.left + tolerance) ||
            (geo2.left <= geo1.left + tolerance && geo2.right + tolerance > geo1.left)
        );
    }

    /**
     * Vertical overlap check with tolerance.
     * @param {object} geo1
     * @param {object} geo2
     * @returns {boolean}
     */
    static overlapVer(geo1, geo2) {
        let tolerance = 2 * gap.mid;
        return (
            (geo1.top <= geo2.top + tolerance && geo1.bottom > geo2.top + tolerance) ||
            (geo2.top <= geo1.top + tolerance && geo2.bottom + tolerance > geo1.top)
        );
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
