/*
KWin Script Interstitia
(C) 2021-2023 Natalie Clarius <natalie_clarius@yahoo.de>
(C) 2026 Fred McDavid <fred@frameworklabs.us>
GNU General Public License v3.0
*/


///////////////////////
// compatibility
///////////////////////

const isPlasma6 = (typeof workspace.windowList === 'function');
console.log("interstitia: main.js execution started, isPlasma6:", isPlasma6);

function getWindowOutput(window) {
    if (window.output !== undefined) return window.output;
    if (window.screen !== undefined) return window.screen;
    return null;
}

function getActiveOutput() {
    if (workspace.activeOutput !== undefined) return workspace.activeOutput;
    if (workspace.activeScreen !== undefined) return workspace.activeScreen;
    return null;
}

function getWindowDesktops(window) {
    if (window.desktops !== undefined) return window.desktops;
    if (window.desktop !== undefined) return [window.desktop];
    return [];
}

function getCurrentDesktop() {
    if (workspace.currentDesktop !== undefined) return workspace.currentDesktop;
    return null;
}

function onSameOutput(window1, window2) {
    return getWindowOutput(window1) == getWindowOutput(window2);
}

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

function copyGeometry(geometry) {
    return {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        left: geometry.x,
        top: geometry.y,
        right: geometry.x + geometry.width,
        bottom: geometry.y + geometry.height
    };
}

function geometriesEqual(g1, g2) {
    return g1.x == g2.x && g1.y == g2.y && g1.width == g2.width && g1.height == g2.height;
}

///////////////////////
// configuration
///////////////////////

// initial debug flags - must be before any debug() calls
var debugMode = true;
var fullDebugMode = false;

function debug(...args) {
    if (debugMode) console.log("interstitia:", ...args);
}

function fulldebug(...args) {
    if (fullDebugMode) {
        console.debug("interstitia:", ...args);
    }
}

console.log("interstitia: main.js execution started at " + new Date().toISOString());

function readConfigValue(key, defaultValue) {
    var val = defaultValue;
    var source = "default";
    
    try {
        if (typeof readConfig === 'function') {
            // Standard KWin Scripting API
            // Try Script-interstitia specifically (this matches our main.xml group)
            var gVal = readConfig(key, "MISSING", "Script-interstitia");
            if (gVal !== "MISSING" && gVal !== undefined) {
                val = gVal;
                source = "readConfig(Script-interstitia)";
            } else {
                // Try no group (base section)
                gVal = readConfig(key, "MISSING");
                if (gVal !== "MISSING" && gVal !== undefined) {
                    val = gVal;
                    source = "readConfig(no-group)";
                } else {
                    // Try with General prefix (old Plasma 6 style or from main.xml group)
                    gVal = readConfig("General/" + key, "MISSING");
                    if (gVal !== "MISSING" && gVal !== undefined) {
                        val = gVal;
                        source = "readConfig(General/key)";
                    } else {
                        // Try [General] group
                        gVal = readConfig(key, "MISSING", "General");
                        if (gVal !== "MISSING" && gVal !== undefined) {
                            val = gVal;
                            source = "readConfig(General)";
                        } else {
                            // Try [Script-interstitia][General]
                            gVal = readConfig(key, "MISSING", "Script-interstitia", "General");
                            if (gVal !== "MISSING" && gVal !== undefined) {
                                val = gVal;
                                source = "readConfig(General in Script-interstitia)";
                            }
                        }
                    }
                }
            }
        } else if (typeof KWin !== 'undefined' && typeof KWin.readConfig === 'function') {
            // KWin.readConfig API
            // Try Script-interstitia
            var gVal = KWin.readConfig(key, "MISSING", "Script-interstitia");
            if (gVal !== "MISSING" && gVal !== undefined) {
                val = gVal;
                source = "KWin.readConfig(Script-interstitia)";
            } else {
                // Try no group first
                gVal = KWin.readConfig(key, "MISSING");
                if (gVal !== "MISSING" && gVal !== undefined) {
                    val = gVal;
                    source = "KWin.readConfig(no-group)";
                } else {
                    // Try with prefix
                    gVal = KWin.readConfig("General/" + key, "MISSING");
                    if (gVal !== "MISSING" && gVal !== undefined) {
                        val = gVal;
                        source = "KWin.readConfig(General/key)";
                    } else {
                        gVal = KWin.readConfig(key, "MISSING", "General");
                        if (gVal !== "MISSING" && gVal !== undefined) {
                            val = gVal;
                            source = "KWin.readConfig(General)";
                        } else {
                            gVal = KWin.readConfig(key, "MISSING", "Script-interstitia", "General");
                            if (gVal !== "MISSING" && gVal !== undefined) {
                                val = gVal;
                                source = "KWin.readConfig(General in Script-interstitia)";
                            }
                        }
                    }
                }
            }
        } else if (typeof options !== 'undefined' && options[key] !== undefined) {
            val = options[key];
            source = "options";
        }
    } catch (e) {
        console.log("interstitia: error reading config key " + key + ": " + e);
    }
    
    // Check if debugMode is defined before using it (it's loaded first)
    if (typeof debugMode !== 'undefined' && debugMode) {
        console.log("interstitia: CONFIG_CHECK [" + key + "] = " + val + " (" + source + ")");
    }
    return val;
}

const gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };
const panel = { left: false, right: false, top: false, bottom: false };
const config = { includeMaximized: false, excludeMode: true, includeMode: false, applications: [] };

function loadConfig() {
    console.log("interstitia: loadConfig() CALLED");
    
    debugMode = Boolean(readConfigValue("debugMode", true));
    fullDebugMode = Boolean(readConfigValue("fullDebugMode", false));

    gap.left = parseInt(readConfigValue("gapLeft", 8));
    gap.right = parseInt(readConfigValue("gapRight", 8));
    gap.top = parseInt(readConfigValue("gapTop", 8));
    gap.bottom = parseInt(readConfigValue("gapBottom", 8));
    gap.mid = parseInt(readConfigValue("gapMid", 8));

    panel.left = Boolean(readConfigValue("panelLeft", false));
    panel.right = Boolean(readConfigValue("panelRight", false));
    panel.top = Boolean(readConfigValue("panelTop", false));
    panel.bottom = Boolean(readConfigValue("panelBottom", false));

    config.includeMaximized = Boolean(readConfigValue("includeMaximized", false));
    config.excludeMode = Boolean(readConfigValue("excludeMode", true));
    config.includeMode = Boolean(readConfigValue("includeMode", false));
    config.applications = String(readConfigValue("applications", "")).toLowerCase().split("\n");

    console.log("interstitia: loaded sizes (l/r/t/b/m):",
        gap.left, gap.right, gap.top, gap.bottom, gap.mid);
}

loadConfig();

// In Plasma 6, we can listen to workspace.configChanged if available
if (workspace.configChanged !== undefined) {
    workspace.configChanged.connect(() => {
        console.log("interstitia: config changed signal received");
        loadConfig();
        applyGapsAll();
    });
}

///////////////////////
// initialization
///////////////////////

debug("intializing");
debug("");

if (typeof registerShortcut === 'undefined') {
    console.log("interstitia: main.js execution started");
}

///////////////////////
// set up triggers
///////////////////////

// block reapplying until current iteration is finished
var block = false;

// track mouse drag state to prevent gap updates during mouse drags
var mouseDragOrResizeInProgress = false;
var mouseDragOrResizeStartingGeometry = null;
var mouseDragOrResizeStartTime = null;
var mouseDragOrResizeNumUpdates = null;

// trigger debug output when client is activated
workspace.windowActivated.connect(client => {
    if (!client) return;
    // debug(caption(client), geometry(client));
});

// trigger applying tile gaps when client is initially present or added
workspace.windowList().forEach(client => onAdded(client));
workspace.windowAdded.connect(onAdded);

function onAdded(client) {
    debug("added", caption(client));
    applyGaps(client);

    onRegeometrized(client);
    setupMouseDragTracking(client);
}

// Setup mouse drag tracking for a client
function setupMouseDragTracking(client) {
    // Track when interactive move/resize starts (mouse drag begins)
    client.interactiveMoveResizeStarted.connect(() => {
        debug("interactive move/resize started (mouse drag detected)", caption(client));
        mouseDragOrResizeInProgress = true;
    });

    // Track when interactive move/resize finishes (mouse drag ends)
    client.interactiveMoveResizeFinished.connect(() => {
        debug("interactive move/resize finished (mouse drag ended)", caption(client));
        mouseDragOrResizeInProgress = false;
    });
}

// trigger applying tile gaps when client is moved or resized
function onRegeometrized(client) {

    client.moveResizedChanged.connect(() => {
        debug("move resized changed", caption(client));
        applyGaps(client);
    });
    client.frameGeometryChanged.connect(() => {
        debug("frame geometry changed", caption(client));
        applyGaps(client);
    });
    // When interactive move/resize finishes, wait briefly then apply gaps
    // This ensures the drag flag is cleared before we apply gaps
    client.interactiveMoveResizeFinished.connect(() => {
        debug("finish user moved resized", caption(client));
        // Small delay to ensure mouseDragInProgress is set to false first
        workspace.slotWindowClose.connect(() => {});  // Dummy to ensure event loop processes
        applyGaps(client);
    });
    client.fullScreenChanged.connect(() => {
        debug("fullscreen changed", caption(client));
        applyGaps(client);
    });
    client.maximizedChanged.connect(() => {
        debug("maximized changed", caption(client));
        applyGaps(client);
    });
    client.minimizedChanged.connect(() => {
        debug("unminimized", caption(client));
        applyGaps(client);
    });
    client.quickTileModeChanged.connect(() => {
        debug("tile mode changed", caption(client));
        applyGaps(client);
    });
    client.tileChanged.connect(() => {
        debug("tile changed", caption(client));
        applyGaps(client);
    });
    client.desktopsChanged.connect(() => {
        debug("desktops changed", caption(client));
        applyGaps(client);
    });
    client.activitiesChanged.connect(() => {
        debug("activities changed", caption(client));
        applyGaps(client);
    });
}

// trigger reapplying tile gaps for all windows when screen geometry changes
function applyGapsAll() {
    workspace.windowList().forEach(client => applyGaps(client));
}

onRelayouted();

function onRelayouted() {
    workspace.currentDesktopChanged.connect(() => {
        debug("current desktop changed");
        applyGapsAll();
    });
    workspace.desktopLayoutChanged.connect(() => {
        debug("desktop layout changed");
        applyGapsAll();
    });
    workspace.desktopsChanged.connect(() => {
        debug("desktops changed");
        applyGapsAll();
    });
    workspace.screensChanged.connect(() => {
        debug("screens changed");
        applyGapsAll();
    });
    workspace.currentActivityChanged.connect(() => {
        debug("current activity changed");
        applyGapsAll();
    });
    workspace.activitiesChanged.connect(() => {
        debug("activities changed");
        applyGapsAll();
    });
    workspace.virtualScreenSizeChanged.connect(() => {
        debug("virtual screen size changed");
        applyGapsAll();
    });
    workspace.virtualScreenGeometryChanged.connect(() => {
        debug("virtual screen geometry changed");
        applyGapsAll();
    });
    workspace.windowAdded.connect((client) => {
        if (client.dock) {
            debug("dock added");
            applyGapsAll();
        }
    });
    if (workspace.outputOrderChanged !== undefined) {
        workspace.outputOrderChanged.connect(() => {
            debug("output order changed");
            applyGapsAll();
        });
    }
}


///////////////////////
// apply gaps
///////////////////////

// make gaps for given client
function applyGaps(client) {

    // abort if there is a current iteration of gapping still running,
    // or if the client is null or irrelevant
    if (block || !client || ignoreClient(client)) return;

    // handle mouse drag or resize
    if (mouseDragOrResizeInProgress) {
        debug(
        "screen:", getWindowOutput(client), "x:",
            client.x, "y:", client.y,
            "width:", client.width,
            "height:", client.height);
        if (!mouseDragOrResizeStartingGeometry) {
            mouseDragOrResizeStartTime = Date.now();
            mouseDragOrResizeNumUpdates = 1;
            mouseDragOrResizeStartingGeometry = {
                'x': client.x,
                'y': client.y,
                'w': client.width,
                'h': client.height,
            };
        }

        debug(
            "apply gaps", caption(client),
            config.includeMaximized, maximized(client), block,
            "mouseDrag:", mouseDragOrResizeInProgress);

        // return silently if it's only been less than 750ms since
        // we started dragging
        if (Date.now() - mouseDragOrResizeStartTime < 750) return;

        // return silently if the width and height are unchanged since
        // we started dragging (meaning the user is dragging and not
        // resizing the window)
        if (client.width == mouseDragOrResizeStartingGeometry.w &&
            client.height == mouseDragOrResizeStartingGeometry.h) return;

    }
    else if (mouseDragOrResizeStartingGeometry) {
        mouseDragOrResizeStartingGeometry = null;
    }
    // block applying other gaps as long as current iteration is running
    block = true;
    debug("----------------")
    debug("gaps for", caption(client));
    debug("old geo", geometry(client));

    const clientGeometries = workspace.windowList().reduce((acc, c) => {
        if (!ignoreClient(c)) {
            acc[c.internalId] = copyGeometry(c.frameGeometry);
        }
        return acc;
    }, {});

    applyGapsArea(client, clientGeometries);
    applyGapsWindows(client, clientGeometries);

    for (const c of workspace.windowList()) {
        if (c.internalId in clientGeometries && !geometriesEqual(c.frameGeometry, clientGeometries[c.internalId])) {
            debug("set geometry", caption(c), geometry(clientGeometries[c.internalId]));
            c.frameGeometry = clientGeometries[c.internalId];
        }
    }

    block = false;

    debug("");
}

function applyGapsArea(client, clientGeometries) {
    const clientGeometry = clientGeometries[client.internalId];
    let area = getArea(client);
    debug("area", geometry(area));
    let grid = getGrid(client);
    let anchored = {"left": false, "right": false, "top": false, "bottom": false};
    let gridded = copyGeometry(clientGeometry);
    let edged = copyGeometry(clientGeometry);

    // Ensure we're working with calculated right/bottom values
    gridded.left = gridded.x;
    gridded.top = gridded.y;
    gridded.right = gridded.x + gridded.width;
    gridded.bottom = gridded.y + gridded.height;
    edged.left = edged.x;
    edged.top = edged.y;
    edged.right = edged.x + edged.width;
    edged.bottom = edged.y + edged.height;

    // unmaximize if maximized window gap
    if (config.includeMaximized && maximized(client)) {
        debug("unmaximize");
        client.setMaximize(false, false);
    }

    // for each window edge, if the edge is near some grid anchor of that edge,
    // set it to the gapped coordinate
    for (let i = 0; i < Object.keys(grid).length; i++) {
        let edge = Object.keys(grid)[i];
        for (let j = 0; j < Object.keys(grid[edge]).length; j++) {
            let pos = Object.keys(grid[edge])[j];
            let coords = grid[edge][pos];
            coords["win"] = clientGeometry[edge];
            if (nearArea(coords.win, coords.closed, coords.gapped, gap[edge])) {
                debug("gap to edge", edge, pos, coords.gapped);
                anchored[edge] = true;
                let diff = coords.gapped - coords.win;
                switch (edge) {

                    case "left":
                        gridded.x = Math.round(gridded.x + diff);
                        gridded.width = Math.round(gridded.width - diff);
                        gridded.right = gridded.x + gridded.width;
                        if (pos.startsWith("full")) {
                            edged.x = Math.round(edged.x + diff);
                            edged.width = Math.round(edged.width - diff);
                            edged.right = edged.x + edged.width;
                        }
                        break;

                    case "right":
                        gridded.width = Math.round(gridded.width + diff);
                        gridded.right = gridded.x + gridded.width;
                        if (pos.startsWith("full")) {
                            edged.width = Math.round(edged.width + diff);
                            edged.right = edged.x + edged.width;
                        }
                        break;

                    case "top":
                        gridded.y = Math.round(gridded.y + diff);
                        gridded.height = Math.round(gridded.height - diff);
                        gridded.bottom = gridded.y + gridded.height;
                        if (pos.startsWith("full")) {
                            edged.y = Math.round(edged.y + diff);
                            edged.height = Math.round(edged.height - diff);
                            edged.bottom = edged.y + edged.height;
                        }
                        break;

                    case "bottom":
                        gridded.height = Math.round(gridded.height + diff);
                        gridded.bottom = gridded.y + gridded.height;
                        if (pos.startsWith("full")) {
                            edged.height = Math.round(edged.height + diff);
                            edged.bottom = edged.y + edged.height;
                        }
                        break;

                    default:
                        break;
                }
                break;
            }
        }
    }
    // apply geo gapped on inner anchors if client is anchored on every side,
    // otherwise geo gapped on outer edges
    if (Object.keys(grid).every((edge) => anchored[edge]) && !geometriesEqual(clientGeometry, gridded)) {
        debug("set grid geometry", geometry(gridded));
        clientGeometries[client.internalId] = gridded;
    } else if (!geometriesEqual(clientGeometry, edged)) {
        debug("set edge geometry", geometry(edged));
        clientGeometries[client.internalId] = edged;
    }
}

function applyGapsWindows(client1, clientGeometries) {
    let area = getArea(client1);
    let grid = getGrid(client1);
    let win1 = clientGeometries[client1.internalId];

    // Ensure calculated right/bottom values
    win1.left = win1.x;
    win1.top = win1.y;
    win1.right = win1.x + win1.width;
    win1.bottom = win1.y + win1.height;

    // for each other window, if they share an edge,
    // clip or extend both evenly to make the distance the size of the gap
    for (const client2 of workspace.windowList()) {
        if (!client2) continue;
        if (ignoreOther(client1, client2)) continue;

        debug("checking", client2.caption);
        debug(geometry(client1), geometry(client2));

        let win2 = clientGeometries[client2.internalId];
        // Ensure calculated right/bottom values
        win2.left = win2.x;
        win2.top = win2.y;
        win2.right = win2.x + win2.width;
        win2.bottom = win2.y + win2.height;
        for (let i = 0; i < Object.keys(grid).length; i++) {
            let edge = Object.keys(grid)[i];
            switch (edge) {

                case "left":
                    if (nearWindow(win1.x, win2.right, gap.mid) &&
                        overlapVer(win1, win2)) {
                        debug("gap to window", edge, caption(client2), geometry(client2));
                        let diff = win1.x - win2.right;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust right window left edge
                        win1.x = Math.round(win1.x - Math.floor(diff / 2) + halfGap);
                        win1.width = Math.round(win1.width + Math.floor(diff / 2) - halfGap);
                        win1.left = win1.x;
                        win1.right = win1.x + win1.width;
                        // Adjust left window right edge
                        win2.width = Math.round(win2.width + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win2.right = win2.x + win2.width;
                        debug("changed geo win1", geometry(win1));
                        debug("changed geo win2", geometry(win2));
                    }
                    break;

                case "right":
                    if (nearWindow(win2.x, win1.right, gap.mid) &&
                        overlapVer(win1, win2)) {
                        debug("gap to window", edge, caption(client2), geometry(client2));
                        let diff = win2.x - win1.right;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust left window right edge
                        win1.width = Math.round(win1.width + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win1.right = win1.x + win1.width;
                        // Adjust right window left edge
                        win2.x = Math.round(win2.x - Math.floor(diff / 2) + halfGap);
                        win2.width = Math.round(win2.width + Math.floor(diff / 2) - halfGap);
                        win2.left = win2.x;
                        win2.right = win2.x + win2.width;
                        debug("changed geo win1", geometry(win1));
                        debug("changed geo win2", geometry(win2));
                    }
                    break;

                case "top":
                    if (nearWindow(win1.y, win2.bottom, gap.mid) &&
                        overlapHor(win1, win2)) {
                        debug("gap to window", edge, caption(client2), geometry(client2));
                        let diff = win1.y - win2.bottom;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust bottom window top edge
                        win1.y = Math.round(win1.y - Math.floor(diff / 2) + halfGap);
                        win1.height = Math.round(win1.height + Math.floor(diff / 2) - halfGap);
                        win1.top = win1.y;
                        win1.bottom = win1.y + win1.height;
                        // Adjust top window bottom edge
                        win2.height = Math.round(win2.height + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win2.bottom = win2.y + win2.height;
                        debug("changed geo win1", geometry(win1));
                        debug("changed geo win2", geometry(win2));
                    }
                    break;

                case "bottom":
                    if (nearWindow(win2.y, win1.bottom, gap.mid) &&
                        overlapHor(win1, win2)) {
                        debug("gap to window", edge, caption(client2), geometry(client2));
                        let diff = win2.y - win1.bottom;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust top window bottom edge
                        win1.height = Math.round(win1.height + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win1.bottom = win1.y + win1.height;
                        // Adjust bottom window top edge
                        win2.y = Math.round(win2.y - Math.floor(diff / 2) + halfGap);
                        win2.height = Math.round(win2.height + Math.floor(diff / 2) - halfGap);
                        win2.top = win2.y;
                        win2.bottom = win2.y + win2.height;
                        debug("changed geo win1", geometry(win1));
                        debug("changed geo win2", geometry(win2));
                    }
                    break;
            }
        }

        clientGeometries[client1.internalId] = win1;
        clientGeometries[client2.internalId] = win2;
    }
}


///////////////////////
// get geometry
///////////////////////

// available screen area
function getArea(client) {
    return workspace.clientArea(KWin.MaximizeArea, client);
}

// anchor coordinates without and with gaps
function getGrid(client) {
    let area = getArea(client);
    let unmaximized = !maximized(client);
    return {
        left: {
            fullLeft: {
                closed: Math.round(area.left),
                gapped: Math.round(area.left + gap.left - (panel.left && unmaximized ? gap.left : 0))
            },
            quarterLeft: {
                closed: Math.round(area.left + 1 * (area.width / 4)),
                gapped: Math.round(area.left + 1 * (area.width + gap.left - gap.right + gap.mid) / 4)
            },
            halfHorizontal: {
                closed: Math.round(area.left + area.width / 2),
                gapped: Math.round(area.left + (area.width + gap.left - gap.right + gap.mid) / 2)
            },
            quarterRight: {
                closed: Math.round(area.left + 3 * (area.width / 4)),
                gapped: Math.round(area.left + 3 * (area.width + gap.left - gap.right + gap.mid) / 4)
            }
        },
        right: {
            quarterLeft: {
                closed: Math.round(area.right - 3 * (area.width / 4)),
                gapped: Math.round(area.right - 3 * (area.width + gap.left - gap.right + gap.mid) / 4)
            },
            halfHorizontal: {
                closed: Math.round(area.right - area.width / 2),
                gapped: Math.round(area.right - (area.width + gap.left - gap.right + gap.mid) / 2)
            },
            quarterRight: {
                closed: Math.round(area.right - 1 * (area.width / 4)),
                gapped: Math.round(area.right - 1 * (area.width + gap.left - gap.right + gap.mid) / 4)
            },
            fullRight: {
                closed: Math.round(area.right),
                gapped: Math.round(area.right - gap.right + (panel.right && unmaximized ? gap.right : 0))
            }
        },
        top: {
            fullTop: {
                closed: Math.round(area.top),
                gapped: Math.round(area.top + gap.top - (panel.top && unmaximized ? gap.top : 0))
            },
            quarterTop: {
                closed: Math.round(area.top + 1 * (area.height / 4)),
                gapped: Math.round(area.top + 1 * (area.height + gap.top - gap.bottom + gap.mid) / 4)
            },
            halfVertical: {
                closed: Math.round(area.top + area.height / 2),
                gapped: Math.round(area.top + (area.height + gap.top - gap.bottom + gap.mid) / 2)
            },
            quarterBottom: {
                closed: Math.round(area.top + 3 * (area.height / 4)),
                gapped: Math.round(area.top + 3 * (area.height + gap.top - gap.bottom + gap.mid) / 4)
            }
        },
        bottom: {
            quarterTop: {
                closed: Math.round(area.bottom - 3 * (area.height / 4)),
                gapped: Math.round(area.bottom - 3 * (area.height + gap.top - gap.bottom + gap.mid) / 4)
            },
            halfVertical: {
                closed: Math.round(area.bottom - area.height / 2),
                gapped: Math.round(area.bottom - (area.height + gap.top - gap.bottom + gap.mid) / 2)
            },
            quarterBottom: {
                closed: Math.round(area.bottom - 1 * (area.height / 4)),
                gapped: Math.round(area.bottom - 1 * (area.height + gap.top - gap.bottom + gap.mid) / 4)
            },
            fullBottom: {
                closed: Math.round(area.bottom),
                gapped: Math.round(area.bottom - gap.bottom + (panel.bottom && unmaximized ? gap.bottom : 0))
            }
        }
    };
}

///////////////////////
// geometry computation
///////////////////////

// a client is maximized iff its geometry is equal to the maximize area
function maximized(client) {
    return geometriesEqual(client.frameGeometry, workspace.clientArea(KWin.MaximizeArea, client));
}

// a coordinate is close to another iff
// the difference is within the tolerance margin but non-zero

function nearArea(actual, expected_closed, expected_gapped, gap) {
    let tolerance = gap + 2;
    return (Math.abs(actual - expected_closed) <= tolerance
        || Math.abs(actual - expected_gapped) <= tolerance);
}

function nearWindow(win1, win2, gap) {
    // Increase tolerance slightly to account for application-specific quirks
    let tolerance = gap + 5;
    let actualGap = Math.abs(win1 - win2);
    return actualGap <= tolerance
        && Math.abs(actualGap - gap) > 1;
}

// horizontal/vertical overlap

function overlapHor(win1, win2) {
    let tolerance = 2 * gap.mid;
    return (win1.left <= win2.left + tolerance
            && win1.right > win2.left + tolerance)
        || (win2.left <= win1.left + tolerance
            && win2.right + tolerance > win1.left);
}

function overlapVer(win1, win2) {
    let tolerance = 2 * gap.mid;
    return (win1.top <= win2.top + tolerance
            && win1.bottom > win2.top + tolerance)
        || (win2.top <= win1.top + tolerance
            && win2.bottom + tolerance > win1.top);
}

// floored/ceiled half difference between edges

function halfDiffL(diff) {
    return Math.floor(diff / 2);
}

function halfDiffU(diff) {
    return Math.ceil(diff / 2);
}

// floored/ceiled half gap mid size

function halfGapL() {
    return Math.floor(gap.mid / 2);
}

function halfGapU() {
    return Math.ceil(gap.mid / 2);
}


///////////////////////
// ignored clients
///////////////////////

// filter out irrelevant clients
function ignoreClient(client) {
    return !client // null
        || !client.normalWindow // not normal
        || !client.resizeable // not resizeable
        || client.fullScreen // fullscreen
        || (!config.includeMaximized && maximized(client)) // maximized
        || (config.excludeMode // excluded application
            && config.applications.includes(String(client.resourceClass)))
        || (config.includeMode // non-included application
            && !(config.applications.includes(String(client.resourceClass))));
}

function ignoreOther(client1, client2) {
    return ignoreClient(client2) // excluded
        || client2 == client1 // identicalb
        || !onSameDesktop(client1, client2) // different desktop
        || !onSameOutput(client1, client2) // different screen
        || client2.minimized; // minimized
}


///////////////////////
// helpers
///////////////////////

// stringify client object
function properties(client) {
    return JSON.stringify(client, undefined, 2);
}

// stringify client caption
function caption(client) {
    return client ? client.caption : client;
}

// stringify client geometry
function geometry(client) {
    return ["x", client.x, client.width, client.x + client.width,
        "y", client.y, client.height, client.y + client.height
    ].join(" ");
}
