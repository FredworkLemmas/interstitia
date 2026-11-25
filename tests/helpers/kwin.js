/**
 * A KWin scripting mock with activities and virtual desktops, for the cascade tests.
 *
 * Every scenario runs against two API shapes (see plasma68.test.js):
 * - "6.8": rects carry only x, y, width and height; window.quickTileMode is gone.
 * - "6.5-6.7": rects also carry left/right/top/bottom, and window.quickTileMode exists.
 *
 * Activities are id strings; a window on all activities has `activities: []`.
 * Desktops are VirtualDesktop-like objects `{ id, name }`; a window on all desktops has
 * `desktops: []` and `onAllDesktops: true`, as in KWin 6.
 *
 * Usage: call `installKWin()` at the top of a test file, then `load([...files])`.
 */
const fs = require("fs");
const path = require("path");

const APIS = [
    { name: "6.8", old: false },
    { name: "6.5-6.7", old: true },
];

const DESKTOPS = [
    { id: "desk-1", name: "Desktop 1" },
    { id: "desk-2", name: "Desktop 2" },
];
const ACTIVITIES = ["act-A", "act-B"];

/** A 1920x1080 work area. */
const AREA = { x: 0, y: 0, width: 1920, height: 1080 };

const state = { api: APIS[0], timers: [] };

/** A signal stub that remembers its handlers and can be emitted. */
const signal = () => {
    const handlers = [];
    return {
        connect: (fn) => handlers.push(fn),
        disconnect: (fn) => {
            const i = handlers.indexOf(fn);
            if (i >= 0) handlers.splice(i, 1);
        },
        emit: (...a) => handlers.forEach((fn) => fn(...a)),
        handlers,
    };
};

/** A rect as the current API shape hands it to scripts. */
const rect = (r) =>
    state.api.old
        ? { x: r.x, y: r.y, width: r.width, height: r.height, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
        : { x: r.x, y: r.y, width: r.width, height: r.height };

const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

/** Window properties for a window KWin has quick-tiled into `r`. */
const tiled = (r) => (state.api.old ? { quickTileMode: 1, tile: null } : { tile: { absoluteGeometry: rect(r) } });

/** Install the KWin globals. Call once per test file, before load(). */
function installKWin({ gaps = 32 } = {}) {
    global.QTimer = jest.fn().mockImplementation(() => {
        const t = {
            interval: 0,
            singleShot: false,
            callbacks: [],
            timeout: { connect: (fn) => t.callbacks.push(fn) },
            start: jest.fn(() => state.timers.push(t)),
            stop: jest.fn(() => {
                const i = state.timers.indexOf(t);
                if (i >= 0) state.timers.splice(i, 1);
            }),
        };
        return t;
    });
    global.workspace = {
        windowList: jest.fn(() => []),
        clientArea: jest.fn(() => rect(AREA)),
        activeWindow: null,
        currentActivity: ACTIVITIES[0],
        activities: ACTIVITIES.slice(),
        currentDesktop: DESKTOPS[0],
        desktops: DESKTOPS.slice(),
        windowActivated: signal(),
        currentActivityChanged: signal(),
        currentDesktopChanged: signal(),
        slotWindowQuickTileLeft: jest.fn(),
        slotWindowQuickTileRight: jest.fn(),
        slotWindowQuickTileTopLeft: jest.fn(),
        slotWindowQuickTileTopRight: jest.fn(),
        slotWindowQuickTileBottomLeft: jest.fn(),
        slotWindowQuickTileBottomRight: jest.fn(),
        slotWindowMaximize: jest.fn(),
    };
    global.KWin = { MaximizeArea: 1 };
    global.debug = jest.fn();
    global.fulldebug = jest.fn();
    global.gap = { left: gaps, right: gaps, top: gaps, bottom: gaps, mid: gaps };
    global.panel = { left: false, right: false, top: false, bottom: false };
    global.config = { includeMaximized: true, excludeMode: true, includeMode: false, applications: [] };
}

/** Evaluate source files into the global scope, as the bundle does. */
function load(files) {
    files.forEach((file) => {
        eval.call(global, fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8"));
    });
}

/** Run every started QTimer, oldest first, including ones started while firing. */
function flushTimers() {
    while (state.timers.length) state.timers.shift().callbacks.forEach((fn) => fn());
}

/** Reset the workspace and the script's state between tests. */
function reset() {
    jest.clearAllMocks();
    state.timers.length = 0;
    workspace.activeWindow = null;
    workspace.currentActivity = ACTIVITIES[0];
    workspace.currentDesktop = DESKTOPS[0];
    workspace.windowList.mockImplementation(() => []);
    workspace.clientArea.mockImplementation(() => rect(AREA));
    if (global.TileableWindow) TileableWindow._instances.clear();
    if (global.coordinator) {
        coordinator.block = false;
        coordinator.mouseDragOrResizeInProgress = false;
        if (coordinator.cascadeGroups) coordinator.cascadeGroups.clear();
        if (coordinator.cascades && coordinator.cascades.clear) coordinator.cascades.clear();
    }
}

/**
 * A window shaped like the current API.
 * @param {string} id
 * @param {object} geo - x, y, width, height
 * @param {object} [extra] - property overrides, e.g. `{ activities: ["act-B"] }`
 */
const makeWindow = (id, geo, extra = {}) => {
    const w = {
        internalId: id,
        caption: id,
        resourceClass: "app-" + id,
        output: { name: "DP-1" },
        desktops: [DESKTOPS[0]],
        activities: [ACTIVITIES[0]],
        onAllDesktops: false,
        normalWindow: true,
        resizeable: true,
        fullScreen: false,
        minimized: false,
        tile: null,
        ...(state.api.old ? { quickTileMode: 0 } : {}),
        maximizeMode: 0,
        move: false,
        resize: false,
        interactiveMoveResizeStarted: signal(),
        interactiveMoveResizeFinished: signal(),
        moveResizedChanged: signal(),
        frameGeometryChanged: signal(),
        fullScreenChanged: signal(),
        maximizedChanged: signal(),
        minimizedChanged: signal(),
        quickTileModeChanged: signal(),
        tileChanged: signal(),
        desktopsChanged: signal(),
        activitiesChanged: signal(),
        outputChanged: signal(),
        ...extra,
    };
    // Count frameGeometry writes, for the performance tests.
    let geometry = rect(geo);
    w.geometryWrites = 0;
    Object.defineProperty(w, "frameGeometry", {
        get: () => geometry,
        set: (g) => {
            w.geometryWrites++;
            geometry = rect(g);
        },
        enumerable: true,
    });
    return w;
};

/** Switch the current activity the way KWin does: the property changes, then the signal fires. */
const switchActivity = (id) => {
    workspace.currentActivity = id;
    workspace.currentActivityChanged.emit(id);
};

/** Switch the current virtual desktop the way KWin does. */
const switchDesktop = (desktop) => {
    const previous = workspace.currentDesktop;
    workspace.currentDesktop = desktop;
    workspace.currentDesktopChanged.emit(previous);
};

/** Set which API shape the current describe.each block runs against. */
const useApi = (a) => {
    state.api = a;
};

module.exports = {
    APIS,
    ACTIVITIES,
    DESKTOPS,
    AREA,
    signal,
    rect,
    round,
    tiled,
    installKWin,
    load,
    flushTimers,
    reset,
    makeWindow,
    switchActivity,
    switchDesktop,
    useApi,
};
