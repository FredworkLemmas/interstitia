/**
 * A window maximized out of a tile spot (not a cascade group): restored, it goes back into that
 * spot, raised in front of the windows it overlaps. KWin itself restores it to its old floating
 * geometry, with no tile.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

// The KWin tiles and the gapped halves of the 1920x1080 work area with gaps of 32.
const LEFT_TILE = { x: 0, y: 0, width: 960, height: 1080 };
const RIGHT_TILE = { x: 960, y: 0, width: 960, height: 1080 };
const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const RIGHT = { x: 976, y: 32, width: 912, height: 1016 };
// Where KWin puts a restored window that was floating before it was tiled.
const FLOAT = { x: 300, y: 200, width: 600, height: 400 };

const index = () => coordinator.cascades;
const tw = (w) => TileableWindow.get(w);
const raisedIds = () => workspace.raiseWindow.mock.calls.map((c) => c[0].internalId);
const lastRaised = () => raisedIds()[raisedIds().length - 1];

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));
    beforeEach(() => {
        K.reset();
        config.includeMaximized = true;
        workspace.raiseWindow = jest.fn();
    });
    afterEach(() => {
        delete workspace.raiseWindow;
    });

    /** KWin's tile properties for a window in the left or right half. */
    const tileProps = (side) => {
        if (a.old) return { quickTileMode: side === "left" ? 1 : 2, tile: null };
        return { tile: { absoluteGeometry: K.rect(side === "left" ? LEFT_TILE : RIGHT_TILE), padding: 0 } };
    };

    /** A window KWin has tiled into the left half, gapped, plus any `others` on the list. */
    const tiledLeft = (id = "A", others = []) => {
        const w = K.makeWindow(id, LEFT, tileProps("left"));
        workspace.windowList.mockImplementation(() => [w, ...others]);
        tw(w).initialize();
        return w;
    };

    /** Maximize `w` as KWin 6.8 does: geometry first, then maximizeMode 3; its tile is cleared. */
    const maximize = (w) => {
        workspace.activeWindow = w;
        w.frameGeometry = K.AREA;
        w.frameGeometryChanged.emit();
        w.maximizeMode = 3;
        if (a.old) w.quickTileMode = 0;
        else w.tile = null;
        w.maximizedChanged.emit();
        w.tileChanged.emit();
        K.flushTimers();
    };

    /** Restore `w`: KWin gives it its old floating geometry, no tile, then maximizeMode 0. */
    const restore = (w, geo = FLOAT) => {
        w.frameGeometry = geo;
        w.frameGeometryChanged.emit();
        w.maximizeMode = 0;
        w.maximizedChanged.emit();
        K.flushTimers();
    };

    test("restored, it goes back into its KWin tile, gapped, raised and active", () => {
        const w = tiledLeft();
        const tile = w.tile;
        maximize(w);
        const other = K.makeWindow("other", { x: 100, y: 100, width: 800, height: 600 });
        workspace.activeWindow = other;

        restore(w);

        if (a.old) {
            expect(w.quickTileMode).toBe(1);
        } else {
            expect(w.tile).toBe(tile);
            expect(K.round(w.frameGeometry)).toEqual(LEFT);
        }
        expect(lastRaised()).toBe("A");
        expect(workspace.activeWindow).toBe(w);
        expect(tw(w).cascade.retileTo).toBeNull();
    });

    test("when KWin refuses the tile, it is put on the spot's gapped rectangle", () => {
        const w = tiledLeft();
        maximize(w);
        // A KWin that ignores scripts writing the tile (or quick tile mode).
        const key = a.old ? "quickTileMode" : "tile";
        Object.defineProperty(w, key, { get: () => (a.old ? 0 : null), set: () => {}, configurable: true });

        restore(w);

        expect(K.round(w.frameGeometry)).toEqual(LEFT);
        expect(lastRaised()).toBe("A");
        expect(workspace.activeWindow).toBe(w);
    });

    test("a tile that no longer exists: put on the spot's gapped rectangle", () => {
        const w = tiledLeft();
        const tile = w.tile;
        maximize(w);
        if (tile) tile.absoluteGeometry = undefined;
        if (a.old) Object.defineProperty(w, "quickTileMode", { get: () => 0, set: () => {}, configurable: true });

        restore(w);

        expect(K.round(w.frameGeometry)).toEqual(LEFT);
    });

    test("restored into another spot (Meta+Right while maximized), it stays there", () => {
        const w = tiledLeft();
        maximize(w);

        Object.assign(w, tileProps("right"));
        w.tileChanged.emit();
        restore(w, RIGHT);

        expect(K.round(w.frameGeometry)).toEqual(RIGHT);
        if (!a.old) expect(w.tile.absoluteGeometry).toEqual(K.rect(RIGHT_TILE));
        else expect(w.quickTileMode).toBe(2);
        expect(tw(w).cascade.retileTo).toBeNull();
    });

    test("dragged after the maximize, it lands where it is dropped", () => {
        const w = tiledLeft();
        maximize(w);

        w.move = true;
        w.interactiveMoveResizeStarted.emit();

        expect(tw(w).cascade.retileTo).toBeNull();
    });

    test("restored on another activity, it is not retiled", () => {
        const w = tiledLeft();
        maximize(w);

        workspace.currentActivity = K.ACTIVITIES[1];
        w.activities = [];
        restore(w);

        expect(K.round(w.frameGeometry)).toEqual(FLOAT);
    });

    test("a window maximized from floating is restored to its floating place", () => {
        const w = K.makeWindow("solo", FLOAT);
        workspace.windowList.mockImplementation(() => [w]);
        tw(w).initialize();
        maximize(w);

        restore(w);

        expect(K.round(w.frameGeometry)).toEqual(FLOAT);
        expect(tw(w).cascade.retileTo).toBeNull();
    });

    test("maximized and restored twice, it is retiled both times", () => {
        const w = tiledLeft();
        maximize(w);
        restore(w);
        maximize(w);
        workspace.raiseWindow.mockClear();

        restore(w);

        if (a.old) expect(w.quickTileMode).toBe(1);
        else expect(K.round(w.frameGeometry)).toEqual(LEFT);
        expect(lastRaised()).toBe("A");
    });

    test("a cascade group formed in its spot meanwhile takes it in, in front", () => {
        const w = tiledLeft("A");
        maximize(w);
        const b = K.makeWindow("B", LEFT);
        const c = K.makeWindow("C", LEFT);
        workspace.windowList.mockImplementation(() => [w, b, c]);
        [b, c].forEach((x) => tw(x).initialize());
        workspace.activeWindow = c;
        ActiveWindow.getActive().startCascade();
        expect(index().groupOf(tw(b)).ring.length).toBe(2);

        // Older Plasma: a script can't write quickTileMode; geometry places it.
        if (a.old) Object.defineProperty(w, "quickTileMode", { get: () => 0, set: () => {}, configurable: true });
        restore(w);

        const group = index().groupOf(tw(w));
        expect(group).not.toBeNull();
        expect(group.ring.length).toBe(3);
        expect(group.activeId()).toBe("A");
    });

    test("a cascade member whose group is gone and whose peers closed is retiled alone", () => {
        const ws = ["A", "B"].map((id) => K.makeWindow(id, LEFT));
        workspace.windowList.mockImplementation(() => ws);
        ws.forEach((x) => tw(x).initialize());
        workspace.activeWindow = ws[1];
        ActiveWindow.getActive().startCascade();
        maximize(ws[0]);
        // B closes.
        index().removeWindow(tw(ws[1]));
        TileableWindow._instances.delete("B");
        workspace.windowList.mockImplementation(() => [ws[0]]);

        restore(ws[0]);

        expect(index().groupOf(tw(ws[0]))).toBeNull();
        expect(K.round(ws[0].frameGeometry)).toEqual(LEFT);
        expect(lastRaised()).toBe("A");
        expect(workspace.activeWindow).toBe(ws[0]);
    });
});
