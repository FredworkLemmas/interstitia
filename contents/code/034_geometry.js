/**
 * TileableWindowGeometry Class
 * Represents and compares window dimensions and positions.
 */
class TileableWindowGeometry {
    /**
     * @param {object} geometry - Object with x, y, width, height properties.
     */
    constructor(geometry) {
        this.x = geometry.x;
        this.y = geometry.y;
        this.width = geometry.width;
        this.height = geometry.height;
        this.left = geometry.x;
        this.top = geometry.y;
        this.right = geometry.x + geometry.width;
        this.bottom = geometry.y + geometry.height;
    }

    /**
     * Create a deep copy of this geometry.
     * @returns {TileableWindowGeometry} A new instance with the same values.
     */
    copy() {
        return new TileableWindowGeometry(this);
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
    global.TileableWindowGeometry = TileableWindowGeometry;
}
