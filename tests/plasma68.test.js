/**
 * Behaviour under KWin 6.8 (Plasma 6.8.2), replayed from the Phase 0 probe log.
 *
 * KWin 6.8 differs from what the older tests mock:
 * - rectangles from workspace.clientArea() and window.frameGeometry carry only
 *   x, y, width and height (no left/right/top/bottom), often fractional on scaled outputs;
 * - window.quickTileMode is gone (undefined); window.tile and window.maximizeMode remain.
 */
const fs = require("fs");
const path = require("path");

const timers = [];
global.QTimer = jest.fn().mockImplementation(() => {
    const t = {
        interval: 0,
        singleShot: false,
        callbacks: [],
        timeout: { connect: (fn) => t.callbacks.push(fn) },
        start: jest.fn(() => timers.push(t)),
    };
    return t;
});
/** Fire every started QTimer, oldest first, including ones started while firing. */
global.flushTimers = () => {
    while (timers.length) timers.shift().callbacks.forEach((fn) => fn());
};

global.workspace = {
    windowList: jest.fn(),
    clientArea: jest.fn(),
    activeWindow: null,
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
global.gap = { left: 32, right: 32, top: 32, bottom: 32, mid: 32 };
global.panel = { left: false, right: false, top: false, bottom: false };
global.config = { includeMaximized: true, excludeMode: true, includeMode: false, applications: [] };

["contents/code/034_geometry.js", "contents/code/035_tileable_window.js"].forEach((file) => {
    eval.call(global, fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
});

/** A signal stub that remembers its handlers and can be emitted. */
const signal = () => {
    const handlers = [];
    return { connect: (fn) => handlers.push(fn), emit: (...a) => handlers.forEach((fn) => fn(...a)) };
};

/** A KWin 6.8-shaped window: plain {x, y, width, height} rects, no quickTileMode. */
const makeWindow = (id, geo, extra = {}) => ({
    internalId: id,
    caption: id,
    resourceClass: "app-" + id,
    output: 0,
    desktops: [1],
    activities: ["act"],
    frameGeometry: { ...geo },
    normalWindow: true,
    resizeable: true,
    fullScreen: false,
    minimized: false,
    onAllDesktops: false,
    tile: null,
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
    ...extra,
});

// A 1920x1080 work area, as KWin 6.8 hands it to scripts.
const AREA = { x: 0, y: 0, width: 1920, height: 1080 };
// Gapped quick-tile positions for gaps of 32 (the half anchor sits at (1920 + 32) / 2 = 976).
const GAPPED = {
    left: { x: 32, y: 32, width: 912, height: 1016 },
    right: { x: 976, y: 32, width: 912, height: 1016 },
    maximize: { x: 32, y: 32, width: 1856, height: 1016 },
};

const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

beforeEach(() => {
    jest.clearAllMocks();
    timers.length = 0;
    TileableWindow._instances.clear();
    coordinator.cascadeGroups.clear();
    coordinator.block = false;
    coordinator.mouseDragOrResizeInProgress = false;
    workspace.activeWindow = null;
    workspace.clientArea.mockReturnValue({ ...AREA });
});

describe("H8: KWin 6.8 rects without left/right/top/bottom", () => {
    test("a quick-tiled left half gets its edge and middle gaps", () => {
        const w = makeWindow("kate", { x: 0, y: 0, width: 960, height: 1080 }, { tile: { absoluteGeometry: { x: 0, y: 0, width: 960, height: 1080 } } });
        workspace.windowList.mockReturnValue([w]);

        TileableWindow.get(w).applyGaps();

        expect(round(w.frameGeometry)).toEqual(GAPPED.left);
    });
});
