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

describe("only tiled and maximized windows get gaps; neighbours are never resized (H4, H9)", () => {
    const tileOf = (r) => ({ absoluteGeometry: { ...r } });

    test("two quick-tiled halves get the middle gap from the half anchors alone", () => {
        const l = makeWindow("kate", { x: 0, y: 0, width: 960, height: 1080 }, { tile: tileOf({ x: 0, y: 0, width: 960, height: 1080 }) });
        const r = makeWindow("dolphin", { x: 960, y: 0, width: 960, height: 1080 }, { tile: tileOf({ x: 960, y: 0, width: 960, height: 1080 }) });
        workspace.windowList.mockReturnValue([l, r]);

        TileableWindow.get(l).applyGaps();
        TileableWindow.get(r).applyGaps();

        expect(round(l.frameGeometry)).toEqual(GAPPED.left);
        expect(round(r.frameGeometry)).toEqual(GAPPED.right);
    });

    test("a maximized window gets its edge gaps", () => {
        const w = makeWindow("kate", { ...AREA }, { maximizeMode: 3 });
        workspace.windowList.mockReturnValue([w]);

        TileableWindow.get(w).applyGaps();

        expect(round(w.frameGeometry)).toEqual(GAPPED.maximize);
    });

    test("a floating window dropped 10 px from another changes neither window", () => {
        const a = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        const b = makeWindow("dolphin", { x: 910, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([a, b]);

        TileableWindow.get(a).applyGaps();
        TileableWindow.get(b).applyGaps();

        expect(a.frameGeometry).toEqual({ x: 300, y: 300, width: 600, height: 400 });
        expect(b.frameGeometry).toEqual({ x: 910, y: 300, width: 600, height: 400 });
    });

    test("a floating window whose edge sits near a quarter anchor is left alone", () => {
        // Phase 0, scenario D with the H8 build: a floating Kate's bottom was pulled onto a quarter anchor.
        const w = makeWindow("kate", { x: 1000, y: 32, width: 586, height: 790 });
        workspace.windowList.mockReturnValue([w]);

        TileableWindow.get(w).applyGaps();

        expect(w.frameGeometry).toEqual({ x: 1000, y: 32, width: 586, height: 790 });
    });

    test("a tiled window next to a floating one never resizes the floating one", () => {
        const t = makeWindow("kate", { x: 0, y: 0, width: 960, height: 1080 }, { tile: tileOf({ x: 0, y: 0, width: 960, height: 1080 }) });
        const f = makeWindow("dolphin", { x: 970, y: 200, width: 500, height: 400 });
        workspace.windowList.mockReturnValue([t, f]);

        TileableWindow.get(t).applyGaps();

        expect(round(t.frameGeometry)).toEqual(GAPPED.left);
        expect(f.frameGeometry).toEqual({ x: 970, y: 200, width: 500, height: 400 });
    });
});

describe("drop behaviour: snap into a nearby quick-tile spot, otherwise change nothing (H3, H7)", () => {
    const tileOf = (r) => ({ absoluteGeometry: { ...r } });

    /** Replays a mouse drag as Phase 0 logged it: Started (move or resize), geometry changes, Finished. */
    const drag = (w, { to, move = true, tileAtEnd = null }) => {
        TileableWindow.get(w).initialize();
        w.move = move;
        w.resize = !move;
        w.interactiveMoveResizeStarted.emit();
        // KWin untiles a dragged tile at once and restores its float size (Phase 0, C and D).
        if (w.tile) { w.tile = null; w.tileChanged.emit(); }
        w.frameGeometry = { ...to };
        w.frameGeometryChanged.emit();
        w.move = false;
        w.resize = false;
        w.interactiveMoveResizeFinished.emit();
        // KWin's own drag-to-edge tile can land after Finished; the script must wait for it.
        if (tileAtEnd) { w.tile = tileOf(tileAtEnd); w.frameGeometry = { ...tileAtEnd }; }
        flushTimers();
    };
    const slotCalls = () =>
        Object.keys(workspace).filter((k) => k.startsWith("slotWindow") && workspace[k].mock.calls.length > 0);

    test("a tiled window dragged out and dropped near another window is not resized (no tiled-size restore)", () => {
        const kate = makeWindow("kate", { ...GAPPED.left }, { tile: tileOf({ x: 0, y: 0, width: 960, height: 1080 }) });
        const dolphin = makeWindow("dolphin", { ...GAPPED.right }, { tile: tileOf({ x: 960, y: 0, width: 960, height: 1080 }) });
        workspace.windowList.mockReturnValue([kate, dolphin]);

        drag(kate, { to: { x: 380, y: 300, width: 586, height: 600 } });

        expect(kate.frameGeometry).toEqual({ x: 380, y: 300, width: 586, height: 600 });
        expect(round(dolphin.frameGeometry)).toEqual(GAPPED.right);
        expect(slotCalls()).toEqual([]);
    });

    test("a window dropped a few px off the gapped right half becomes a right quick tile", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 990, y: 40, width: 890, height: 1000 } });

        expect(workspace.activeWindow).toBe(w);
        expect(slotCalls()).toEqual(["slotWindowQuickTileRight"]);
    });

    test("a window dropped a few px off the ungapped bottom-left quarter becomes that quarter", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 10, y: 550, width: 940, height: 520 } });

        expect(slotCalls()).toEqual(["slotWindowQuickTileBottomLeft"]);
    });

    test("a window dropped 30 px off every edge of a tile spot is too far to line up and touches no screen edge", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 1006, y: 62, width: 852, height: 956 } });

        expect(slotCalls()).toEqual([]);
        expect(w.frameGeometry).toEqual({ x: 1006, y: 62, width: 852, height: 956 });
    });

    test("a window dropped against the left screen edge fills the left tile spot it overlaps most", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 0, y: 300, width: 600, height: 400 } });

        expect(slotCalls()).toEqual(["slotWindowQuickTileLeft"]);
    });

    test("a window dropped partly past the left edge in the top-left corner fills the top-left quarter", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: -40, y: 5, width: 500, height: 400 } });

        expect(slotCalls()).toEqual(["slotWindowQuickTileTopLeft"]);
    });

    test("a window dropped across the whole width at the top edge maximizes", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 0, y: 0, width: 1920, height: 700 } });

        expect(slotCalls()).toEqual(["slotWindowMaximize"]);
    });

    test("a floating window dropped in the middle of the screen is left exactly where it was dropped", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: 700, y: 400, width: 600, height: 400 } });

        expect(slotCalls()).toEqual([]);
        expect(w.frameGeometry).toEqual({ x: 700, y: 400, width: 600, height: 400 });
    });

    test("resizing a floating window against the screen edge never snaps it", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { move: false, to: { x: 0, y: 300, width: 900, height: 400 } });

        expect(slotCalls()).toEqual([]);
        expect(w.frameGeometry).toEqual({ x: 0, y: 300, width: 900, height: 400 });
    });

    test("when KWin's own drag-to-edge tiling lands after Finished, the script gaps that tile instead of snapping", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        workspace.windowList.mockReturnValue([w]);

        drag(w, { to: { x: -200, y: 300, width: 600, height: 400 }, tileAtEnd: { x: 0, y: 0, width: 960, height: 1080 } });

        expect(slotCalls()).toEqual([]);
        expect(round(w.frameGeometry)).toEqual(GAPPED.left);
    });

    test("drag tracking never reads window.quickTileMode, which KWin 6.8 removed", () => {
        const w = makeWindow("kate", { x: 300, y: 300, width: 600, height: 400 });
        Object.defineProperty(w, "quickTileMode", { get: () => { throw new Error("quickTileMode read"); } });
        workspace.windowList.mockReturnValue([w]);

        expect(() => drag(w, { to: { x: 700, y: 400, width: 600, height: 400 } })).not.toThrow();
    });
});

describe("restoring from maximized (Phase 3, scenario M)", () => {
    test("the restored floating geometry is left alone while maximizeMode is still 3", () => {
        // KWin 6.8 emits frameGeometryChanged with the restore geometry before maximizeMode drops to 0.
        const w = makeWindow("kate", { ...GAPPED.maximize }, { maximizeMode: 3 });
        workspace.windowList.mockReturnValue([w]);
        TileableWindow.get(w).initialize();

        w.frameGeometry = { x: 0, y: 159, width: 586, height: 914 };
        w.frameGeometryChanged.emit();
        w.maximizeMode = 0;
        w.maximizedChanged.emit();

        expect(w.frameGeometry).toEqual({ x: 0, y: 159, width: 586, height: 914 });
    });

    test("a window KWin has just maximized (flush) still gets its gaps", () => {
        const w = makeWindow("kate", { x: 0, y: 159, width: 586, height: 914 });
        workspace.windowList.mockReturnValue([w]);
        TileableWindow.get(w).initialize();

        w.maximizeMode = 3;
        w.frameGeometry = { ...AREA };
        w.frameGeometryChanged.emit();
        w.maximizedChanged.emit();

        expect(round(w.frameGeometry)).toEqual(GAPPED.maximize);
    });
});
