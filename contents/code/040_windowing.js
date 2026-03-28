/**
 * Deep-copy a geometry-like object and add convenience edges.
 * @param {{x:number,y:number,width:number,height:number}} geometry
 * @returns {{x:number,y:number,width:number,height:number,left:number,top:number,right:number,bottom:number}}
 */
function copyGeometry(geometry) {
    return {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        left: geometry.x,
        top: geometry.y,
        right: geometry.x + geometry.width,
        bottom: geometry.y + geometry.height,
    };
}

/**
 * Strict geometry equality check.
 * @param {object} g1
 * @param {object} g2
 * @returns {boolean}
 */
function geometriesEqual(g1, g2) {
    return g1.x === g2.x && g1.y === g2.y && g1.width === g2.width && g1.height === g2.height;
}

/**
 * Approximate geometry equality with a small threshold.
 * @param {object} g1
 * @param {object} g2
 * @returns {boolean}
 */
function geometriesNearlyEqual(g1, g2) {
    var threshold = 10;
    return (
        Math.abs(g1.x - g2.x) <= threshold &&
        Math.abs(g1.y - g2.y) <= threshold &&
        Math.abs(g1.width - g2.width) <= threshold &&
        Math.abs(g1.height - g2.height) <= threshold
    );
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
        if (twActive.isOnSameDesktop(tw) && twActive.isOnSameActivity(tw) && geometriesNearlyEqual(fg, windowGeometry)) {
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

/**
 * Get a concise geometry string; renamed from geometry().
 * @param {{x:number,y:number,width:number,height:number}} g
 * @returns {string}
 */
function getWindowGeometry(g) {
    return ["x", g.x, g.width, g.x + g.width, "y", g.y, g.height, g.y + g.height].join(" ");
}
