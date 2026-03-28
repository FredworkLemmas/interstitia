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

/**
 * Select all windows that occupy the same slot as the active window.
 * @returns {TileableWindow[]} The windows in the same slot.
 */
function selectSameSlotWindows() {
    debug("selectSameSlotWindows called");
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("no active window");
        return [];
    }

    const twActive = TileableWindow.get(activeWindow);
    const fg = activeWindow.frameGeometry;
    debug("Active window:", twActive.getCaption(), "Geometry:", JSON.stringify(fg));
    debug("selectSameSlotWindows: searching for windows in the same slot as", twActive.getCaption());

    const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
    const sameSlotWindows = [];
    allWindows.forEach((window) => {
        const tw = TileableWindow.get(window);
        const windowGeometry = window.frameGeometry;
        if (twActive.isOnSameDesktop(tw) && twActive.isOnSameActivity(tw) && new TileableWindowGeometry(fg).nearlyEquals(windowGeometry)) {
            console.log(
                "interstitia: Same slot window found:",
                tw.getCaption(),
                "Geometry:",
                JSON.stringify(windowGeometry),
            );
            sameSlotWindows.push(tw);
        }
    });
    return sameSlotWindows;
}

/**
 * Determine if a coordinate is near an anchor position.
 * @param {number} actual
 * @param {number} expected_closed
 * @param {number} expected_gapped
 * @param {number} gapSize
 * @returns {boolean}
 */
function nearArea(actual, expected_closed, expected_gapped, gapSize) {
    let tolerance = gapSize + 2;
    return Math.abs(actual - expected_closed) <= tolerance || Math.abs(actual - expected_gapped) <= tolerance;
}

/**
 * Determine if a gap between two coordinates is near the expected gap.
 * @param {number} win1
 * @param {number} win2
 * @param {number} gapSize
 * @returns {boolean}
 */
function nearWindow(win1, win2, gapSize) {
    let tolerance = gapSize + 5;
    let actualGap = Math.abs(win1 - win2);
    return actualGap <= tolerance && Math.abs(actualGap - gapSize) > 1;
}

/**
 * Horizontal overlap check with tolerance.
 * @param {object} win1
 * @param {object} win2
 * @returns {boolean}
 */
function overlapHor(win1, win2) {
    let tolerance = 2 * gap.mid;
    return (
        (win1.left <= win2.left + tolerance && win1.right > win2.left + tolerance) ||
        (win2.left <= win1.left + tolerance && win2.right + tolerance > win1.left)
    );
}

/**
 * Vertical overlap check with tolerance.
 * @param {object} win1
 * @param {object} win2
 * @returns {boolean}
 */
function overlapVer(win1, win2) {
    let tolerance = 2 * gap.mid;
    return (
        (win1.top <= win2.top + tolerance && win1.bottom > win2.top + tolerance) ||
        (win2.top <= win1.top + tolerance && win2.bottom + tolerance > win1.top)
    );
}

