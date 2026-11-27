/**
 * A window maximized out of a half or quarter cascade group: raised in front of the group,
 * and back in the group, in front, when it is restored.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

// The gapped left and right halves of the 1920x1080 work area with gaps of 32.
const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const RIGHT = { x: 976, y: 32, width: 912, height: 1016 };
// Where KWin puts a restored window that was floating before it was tiled.
const FLOAT = { x: 300, y: 200, width: 600, height: 400 };

const index = () => coordinator.cascades;
const tw = (w) => TileableWindow.get(w);
const raisedIds = () => workspace.raiseWindow.mock.calls.map((c) => c[0].internalId);
const lastRaised = () => raisedIds()[raisedIds().length - 1];

/** A group of `ids` on LEFT, the last one in front. */
const groupOf = (ids) => {
    const ws = ids.map((id) => K.makeWindow(id, LEFT));
    workspace.windowList.mockImplementation(() => ws);
    ws.forEach((w) => tw(w).initialize());
    workspace.activeWindow = ws[ws.length - 1];
    ActiveWindow.getActive().startCascade();
    return ws;
};

/**
 * Maximize `w` the way KWin 6.8 does for a Wayland client (seen in the logs): the window is
 * active, its maximized geometry arrives first, then maximizeMode 3 and the tile change.
 */
const maximize = (w, { modeFirst = false } = {}) => {
    workspace.activeWindow = w;
    const mode = () => {
        w.maximizeMode = 3;
        w.maximizedChanged.emit();
    };
    if (modeFirst) mode();
    w.frameGeometry = K.AREA;
    w.frameGeometryChanged.emit();
    if (!modeFirst) mode();
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

    describe("maximizing a member", () => {
        test.each([
            ["the rear member, geometry first", 0, false, true],
            ["the front member, geometry first", 2, false, true],
            ["the rear member, maximizeMode first", 0, true, true],
            ["the rear member, no gaps on maximized windows", 0, false, false],
        ])("%s: it leaves the group, raised in front and active", (_, k, modeFirst, includeMaximized) => {
            config.includeMaximized = includeMaximized;
            const ws = groupOf(["A", "B", "C"]);
            const w = ws[k];

            maximize(w, { modeFirst });

            expect(index().groupOf(tw(w))).toBeNull();
            expect(index().groupOf(tw(ws[(k + 1) % 3])).ring.length).toBe(2);
            expect(lastRaised()).toBe(w.internalId);
            expect(workspace.activeWindow).toBe(w);
        });

        test("in a group of two, the group dissolves and the maximized window is in front", () => {
            const ws = groupOf(["A", "B"]);

            maximize(ws[0]);

            expect(index().groupOf(tw(ws[1]))).toBeNull();
            expect(lastRaised()).toBe("A");
            expect(workspace.activeWindow).toBe(ws[0]);
        });
    });

    describe("restoring it", () => {
        test.each([
            ["the rear member", 0],
            ["the front member", 2],
        ])("%s rejoins the group in front", (_, k) => {
            const ws = groupOf(["A", "B", "C"]);
            const w = ws[k];
            maximize(w);

            restore(w);

            const group = index().groupOf(tw(w));
            expect(group).not.toBeNull();
            expect(group.ring.length).toBe(3);
            expect(group.activeId()).toBe(w.internalId);
            expect(K.round(w.frameGeometry)).toEqual({
                x: LEFT.x + 64,
                y: LEFT.y + 64,
                width: LEFT.width - 64,
                height: LEFT.height - 64,
            });
            expect(lastRaised()).toBe(w.internalId);
            expect(workspace.activeWindow).toBe(w);
        });

        test("a group that dissolved when it left is formed again, it in front", () => {
            const ws = groupOf(["A", "B"]);
            maximize(ws[0]);

            restore(ws[0]);

            const group = index().groupOf(tw(ws[0]));
            expect(group).not.toBeNull();
            expect(index().groupOf(tw(ws[1]))).toBe(group);
            expect(group.activeId()).toBe("A");
            expect(workspace.activeWindow).toBe(ws[0]);
        });

        test("restored into another spot, it stays there", () => {
            const ws = groupOf(["A", "B", "C"]);
            maximize(ws[0]);

            // Meta+Right on the maximized window: KWin restores it into the right half.
            Object.assign(
                ws[0],
                a.old
                    ? { quickTileMode: 2 }
                    : { tile: { absoluteGeometry: K.rect({ x: 960, y: 0, width: 960, height: 1080 }), padding: 0 } },
            );
            ws[0].tileChanged.emit();
            restore(ws[0], RIGHT);

            expect(index().groupOf(tw(ws[0]))).toBeNull();
            expect(index().groupOf(tw(ws[1])).ring.length).toBe(2);
            expect(tw(ws[0]).cascade.restoreTo).toBeNull();
        });

        test("restored on another activity, it does not rejoin", () => {
            const ws = groupOf(["A", "B", "C"]);
            maximize(ws[0]);

            workspace.currentActivity = K.ACTIVITIES[1];
            ws[0].activities = [];
            restore(ws[0]);

            expect(tw(ws[0]).cascade.groups.size).toBe(0);
        });

        test("dragged after the maximize, it lands where it is dropped", () => {
            const ws = groupOf(["A", "B", "C"]);
            maximize(ws[0]);

            ws[0].move = true;
            ws[0].interactiveMoveResizeStarted.emit();

            expect(tw(ws[0]).cascade.restoreTo).toBeNull();
        });

        test("a restored window that never was in a group is left alone", () => {
            const w = K.makeWindow("solo", FLOAT);
            workspace.windowList.mockImplementation(() => [w]);
            tw(w).initialize();
            maximize(w);

            restore(w);

            expect(tw(w).cascade.groups.size).toBe(0);
            expect(K.round(w.frameGeometry)).toEqual(FLOAT);
        });
    });
});
