/**
 * Get the output/screen index for a window across Plasma versions.
 * @param {KWin.Window} window - The window to inspect.
 * @returns {number|null} The output/screen id or null if unknown.
 */
function getWindowOutput(window) {
    if (window.output !== undefined) return window.output;
    if (window.screen !== undefined) return window.screen;
    return null;
}

/**
 * Get the desktops a window belongs to across Plasma versions.
 * @param {KWin.Window} window - The window to inspect.
 * @returns {number[]} Array of desktop ids.
 */
function getWindowDesktops(window) {
    if (window.desktops !== undefined) return window.desktops;
    if (window.desktop !== undefined) return [window.desktop];
    return [];
}

/**
 * Check if two windows are on the same output.
 * @param {KWin.Window} window1
 * @param {KWin.Window} window2
 * @returns {boolean}
 */
function onSameOutput(window1, window2) {
    return getWindowOutput(window1) == getWindowOutput(window2);
}

/**
 * Check if two windows share at least one desktop, honoring onAllDesktops.
 * @param {KWin.Window} window1
 * @param {KWin.Window} window2
 * @returns {boolean}
 */
function onSameDesktop(window1, window2) {
    if (window1.onAllDesktops || window2.onAllDesktops) return true;
    const desktops1 = getWindowDesktops(window1);
    const desktops2 = getWindowDesktops(window2);
    for (let d1 of desktops1) {
        for (let d2 of desktops2) {
            if (d1 == d2) return true;
        }
    }
    return false;
}

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
 * Determine if two windows are on the same activity.
 * @param {KWin.Window} window1
 * @param {KWin.Window} window2
 * @returns {boolean}
 */
function isOnSameActivity(window1, window2) {
    const activities1 = window1.activities;
    const activities2 = window2.activities;
    if (!activities1 || !activities2) return true;
    for (let a1 of activities1) {
        for (let a2 of activities2) {
            if (a1 == a2) return true;
        }
    }
    return false;
}

/**
 * Select all windows that occupy the same slot as the active window.
 * @returns {KWin.Window[]} The windows in the same slot.
 */
function selectSameSlotWindows() {
    debug("selectSameSlotWindows called");
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("no active window");
        return [];
    }

    const fg = isPlasma6 ? activeWindow.frameGeometry : activeWindow.geometry;
    debug("Active window:", getWindowCaption(activeWindow), "Geometry:", JSON.stringify(fg));
    debug("selectSameSlotWindows: searching for windows in the same slot as", getWindowCaption(activeWindow));

    const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
    const sameSlotWindows = [];
    allWindows.forEach((window) => {
        const windowGeometry = isPlasma6 ? window.frameGeometry : window.geometry;
        if (
            onSameDesktop(activeWindow, window) &&
            isOnSameActivity(activeWindow, window) &&
            geometriesNearlyEqual(fg, windowGeometry)
        ) {
            console.log(
                "interstitia: Same slot window found:",
                getWindowCaption(window),
                "Geometry:",
                JSON.stringify(windowGeometry),
            );
            sameSlotWindows.push(window);
        }
    });
    return sameSlotWindows;
}

/**
 * Get the available screen area for a client.
 * @param {KWin.Window} client
 * @returns {object} Area geometry with left/top/right/bottom.
 */
function getArea(client) {
    return workspace.clientArea(KWin.MaximizeArea, client);
}

/**
 * Build the grid anchors for a client with and without gaps.
 * @param {KWin.Window} client
 * @returns {object} Grid of edge anchors.
 */
function getGrid(client) {
    let area = getArea(client);
    let unmaximized = !isMaximized(client);
    return {
        left: {
            fullLeft: {
                closed: Math.round(area.left),
                gapped: Math.round(area.left + gap.left - (panel.left && unmaximized ? gap.left : 0)),
            },
            quarterLeft: {
                closed: Math.round(area.left + 1 * (area.width / 4)),
                gapped: Math.round(area.left + (1 * (area.width + gap.left - gap.right + gap.mid)) / 4),
            },
            halfHorizontal: {
                closed: Math.round(area.left + area.width / 2),
                gapped: Math.round(area.left + (area.width + gap.left - gap.right + gap.mid) / 2),
            },
            quarterRight: {
                closed: Math.round(area.left + 3 * (area.width / 4)),
                gapped: Math.round(area.left + (3 * (area.width + gap.left - gap.right + gap.mid)) / 4),
            },
        },
        right: {
            quarterLeft: {
                closed: Math.round(area.right - 3 * (area.width / 4)),
                gapped: Math.round(area.right - (3 * (area.width + gap.left - gap.right + gap.mid)) / 4),
            },
            halfHorizontal: {
                closed: Math.round(area.right - area.width / 2),
                gapped: Math.round(area.right - (area.width + gap.left - gap.right + gap.mid) / 2),
            },
            quarterRight: {
                closed: Math.round(area.right - 1 * (area.width / 4)),
                gapped: Math.round(area.right - (1 * (area.width + gap.left - gap.right + gap.mid)) / 4),
            },
            fullRight: {
                closed: Math.round(area.right),
                gapped: Math.round(area.right - gap.right + (panel.right && unmaximized ? gap.right : 0)),
            },
        },
        top: {
            fullTop: {
                closed: Math.round(area.top),
                gapped: Math.round(area.top + gap.top - (panel.top && unmaximized ? gap.top : 0)),
            },
            quarterTop: {
                closed: Math.round(area.top + 1 * (area.height / 4)),
                gapped: Math.round(area.top + (1 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
            },
            halfVertical: {
                closed: Math.round(area.top + area.height / 2),
                gapped: Math.round(area.top + (area.height + gap.top - gap.bottom + gap.mid) / 2),
            },
            quarterBottom: {
                closed: Math.round(area.top + 3 * (area.height / 4)),
                gapped: Math.round(area.top + (3 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
            },
        },
        bottom: {
            quarterTop: {
                closed: Math.round(area.bottom - 3 * (area.height / 4)),
                gapped: Math.round(area.bottom - (3 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
            },
            halfVertical: {
                closed: Math.round(area.bottom - area.height / 2),
                gapped: Math.round(area.bottom - (area.height + gap.top - gap.bottom + gap.mid) / 2),
            },
            quarterBottom: {
                closed: Math.round(area.bottom - 1 * (area.height / 4)),
                gapped: Math.round(area.bottom - (1 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
            },
            fullBottom: {
                closed: Math.round(area.bottom),
                gapped: Math.round(area.bottom - gap.bottom + (panel.bottom && unmaximized ? gap.bottom : 0)),
            },
        },
    };
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
 * True if a client should be ignored for gap/cascade logic.
 * @param {KWin.Window} client
 * @returns {boolean}
 */
function ignoreClient(client) {
    return (
        !client || // null
        !client.normalWindow || // not normal
        !client.resizeable || // not resizeable
        client.fullScreen || // fullscreen
        (!config.includeMaximized && isMaximized(client)) || // maximized
        (config.excludeMode && // excluded application
            config.applications.includes(String(client.resourceClass))) ||
        (config.includeMode && // non-included application
            !config.applications.includes(String(client.resourceClass)))
    );
}

/**
 * True if a second client should be ignored when comparing to the first.
 * @param {KWin.Window} client1
 * @param {KWin.Window} client2
 * @returns {boolean}
 */
function ignoreOther(client1, client2) {
    return (
        ignoreClient(client2) ||
        client2 == client1 ||
        !onSameDesktop(client1, client2) ||
        !onSameOutput(client1, client2) ||
        client2.minimized
    );
}

/**
 * Get a string caption of a client; renamed from caption().
 * @param {KWin.Window|null} client
 * @returns {string|null}
 */
function getWindowCaption(client) {
    return client ? client.caption : client;
}

/**
 * Get a concise geometry string; renamed from geometry().
 * @param {{x:number,y:number,width:number,height:number}} g
 * @returns {string}
 */
function getWindowGeometry(g) {
    return ["x", g.x, g.width, g.x + g.width, "y", g.y, g.height, g.y + g.height].join(" ");
}

/**
 * A client is maximized iff its geometry equals the maximize area; renamed from maximized().
 * @param {KWin.Window} client
 * @returns {boolean}
 */
function isMaximized(client) {
    return geometriesEqual(client.frameGeometry, workspace.clientArea(KWin.MaximizeArea, client));
}
