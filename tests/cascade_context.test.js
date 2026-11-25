/**
 * Cascade groups are kept apart per activity and virtual desktop.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js", "contents/code/070_reaction.js"]);
// Wire the workspace switch signals once, as the main loop does.
onRelayouted();

const LEFT = { x: 32, y: 32, width: 912, height: 1016 };

/** How many cascade groups exist, in every context. */
const groupCount = () => Array.from(coordinator.cascades.contexts.values()).reduce((n, spots) => n + spots.size, 0);

/** Record every window the script makes active. */
const trackActivations = () => {
    const seen = [];
    let current = workspace.activeWindow;
    Object.defineProperty(workspace, "activeWindow", {
        configurable: true,
        get: () => current,
        set: (w) => {
            current = w;
            seen.push(w && w.internalId);
        },
    });
    return seen;
};

/** Make `windows` the window list, and start a cascade from `active` with Ctrl+}. */
const cascade = (active, windows) => {
    workspace.windowList.mockImplementation(() => windows);
    workspace.activeWindow = active;
    ActiveWindow.getActive().startCascade();
};

/** Replay a mouse move of `w` to `to`, as KWin signals it. */
const drag = (w, to) => {
    TileableWindow.get(w).initialize();
    w.move = true;
    w.interactiveMoveResizeStarted.emit();
    w.frameGeometry = to;
    w.frameGeometryChanged.emit();
    w.move = false;
    w.interactiveMoveResizeFinished.emit();
    K.flushTimers();
};

beforeEach(() => K.reset());

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    describe("the mock", () => {
        test("windows default to the first activity and desktop, and count geometry writes", () => {
            const w = K.makeWindow("w", { x: 0, y: 0, width: 100, height: 100 });
            expect(w.activities).toEqual(["act-A"]);
            expect(w.desktops).toEqual([K.DESKTOPS[0]]);
            w.frameGeometry = { x: 1, y: 2, width: 3, height: 4 };
            expect(K.round(w.frameGeometry)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
            expect(w.geometryWrites).toBe(1);
        });

        test("switching activity changes the current activity and emits the signal", () => {
            const seen = [];
            workspace.currentActivityChanged.connect((id) => seen.push(id));
            K.switchActivity("act-B");
            expect(workspace.currentActivity).toBe("act-B");
            expect(seen).toEqual(["act-B"]);
        });
    });

    describe("dropping a window joins only a group on its own activity and desktop", () => {
        test("a window dropped on activity B into the spot of a group on activity A does not join it", () => {
            const a1 = K.makeWindow("a1", LEFT);
            const a2 = K.makeWindow("a2", LEFT);
            const b1 = K.makeWindow("b1", { x: 500, y: 500, width: 400, height: 300 }, { activities: ["act-B"] });
            cascade(a1, [a1, a2, b1]);
            const groupA = TileableWindow.get(a1).getCascadeGroup();
            expect(groupA.members).toEqual(["a2", "a1"]);
            const writesA = [a1.geometryWrites, a2.geometryWrites];

            K.switchActivity("act-B");
            const activated = trackActivations();
            drag(b1, { x: 300, y: 300, width: 400, height: 300 });

            expect(TileableWindow.get(b1).isInCascade()).toBe(false);
            expect(groupA.members).toEqual(["a2", "a1"]);
            expect([a1.geometryWrites, a2.geometryWrites]).toEqual(writesA);
            expect(activated).not.toContain("a1");
            expect(activated).not.toContain("a2");
        });

        test("a window dropped on desktop 2 into the spot of a group on desktop 1 does not join it", () => {
            const a1 = K.makeWindow("a1", LEFT);
            const a2 = K.makeWindow("a2", LEFT);
            const b1 = K.makeWindow("b1", { x: 500, y: 500, width: 400, height: 300 }, { desktops: [K.DESKTOPS[1]] });
            cascade(a1, [a1, a2, b1]);
            const groupA = TileableWindow.get(a1).getCascadeGroup();

            K.switchDesktop(K.DESKTOPS[1]);
            drag(b1, { x: 300, y: 300, width: 400, height: 300 });

            expect(TileableWindow.get(b1).isInCascade()).toBe(false);
            expect(groupA.members).toEqual(["a2", "a1"]);
        });

        test("a window dropped into the spot of a group on its own activity still joins it", () => {
            const a1 = K.makeWindow("a1", LEFT);
            const a2 = K.makeWindow("a2", LEFT);
            const a3 = K.makeWindow("a3", { x: 500, y: 500, width: 400, height: 300 });
            cascade(a1, [a1, a2, a3]);

            drag(a3, { x: 300, y: 300, width: 400, height: 300 });

            expect(TileableWindow.get(a3).getCascadeGroup()).toBe(TileableWindow.get(a1).getCascadeGroup());
        });
    });

    describe("groups in the same spot on different activities or desktops are separate", () => {
        test("starting a group on activity B leaves the group in the same spot on activity A intact", () => {
            const a1 = K.makeWindow("a1", LEFT);
            const a2 = K.makeWindow("a2", LEFT);
            const b1 = K.makeWindow("b1", LEFT, { activities: ["act-B"] });
            const b2 = K.makeWindow("b2", LEFT, { activities: ["act-B"] });
            const all = [a1, a2, b1, b2];
            cascade(a1, all);
            const groupA = TileableWindow.get(a1).getCascadeGroup();

            K.switchActivity("act-B");
            cascade(b1, all);
            const groupB = TileableWindow.get(b1).getCascadeGroup();

            expect(groupB).not.toBe(groupA);
            expect(groupCount()).toBe(2);
            expect(coordinator.cascades.groupOf(TileableWindow.get(a1), groupA.ctx)).toBe(groupA);
            expect(groupA.members).toEqual(["a2", "a1"]);
            expect(groupB.members).toEqual(["b2", "b1"]);
        });

        test("starting a group on desktop 2 leaves the group in the same spot on desktop 1 intact", () => {
            const a1 = K.makeWindow("a1", LEFT);
            const a2 = K.makeWindow("a2", LEFT);
            const b1 = K.makeWindow("b1", LEFT, { desktops: [K.DESKTOPS[1]] });
            const b2 = K.makeWindow("b2", LEFT, { desktops: [K.DESKTOPS[1]] });
            const all = [a1, a2, b1, b2];
            cascade(a1, all);
            const groupA = TileableWindow.get(a1).getCascadeGroup();

            K.switchDesktop(K.DESKTOPS[1]);
            cascade(b1, all);

            expect(groupCount()).toBe(2);
            expect(coordinator.cascades.groupOf(TileableWindow.get(a1), groupA.ctx)).toBe(groupA);
            expect(groupA.members).toEqual(["a2", "a1"]);
        });
    });

    describe("starting a group takes only windows on the current activity and desktop", () => {
        const ids = (tws) => tws.map((tw) => tw.window.internalId).sort();
        const sameSlot = () => {
            const active = ActiveWindow.getActive();
            return active.selectSameSlotWindows(active.refreshSpot());
        };

        test("a window on activities A and B does not pick up a window only on A while B is current", () => {
            const x = K.makeWindow("x", LEFT, { activities: ["act-A", "act-B"] });
            const y = K.makeWindow("y", LEFT, { activities: ["act-A"] });
            const z = K.makeWindow("z", LEFT, { activities: ["act-B"] });
            workspace.windowList.mockImplementation(() => [x, y, z]);
            K.switchActivity("act-B");
            workspace.activeWindow = x;

            expect(ids(sameSlot())).toEqual(["x", "z"]);
        });

        test("a window on all desktops does not pick up a window on another desktop", () => {
            const x = K.makeWindow("x", LEFT, { desktops: [], onAllDesktops: true });
            const y = K.makeWindow("y", LEFT, { desktops: [K.DESKTOPS[1]] });
            const z = K.makeWindow("z", LEFT);
            workspace.windowList.mockImplementation(() => [x, y, z]);
            workspace.activeWindow = x;

            expect(ids(sameSlot())).toEqual(["x", "z"]);
        });

        test("a window on all activities in the same spot is picked up", () => {
            const x = K.makeWindow("x", LEFT);
            const y = K.makeWindow("y", LEFT, { activities: [] });
            workspace.windowList.mockImplementation(() => [x, y]);
            workspace.activeWindow = x;

            expect(ids(sameSlot())).toEqual(["x", "y"]);
        });
    });

    describe("switching activity or desktop lays out that context's groups", () => {
        const RIGHT = { x: 976, y: 32, width: 912, height: 1016 };
        const step = (k, n, slot = LEFT) => ({ x: slot.x + 32 * k, y: slot.y + 32 * k, width: slot.width - 32 * (n - 1), height: slot.height - 32 * (n - 1) });

        test("a window in a group on A and alone on B is full-slot on B and cascaded again back on A", () => {
            const shared = K.makeWindow("shared", LEFT, { activities: ["act-A", "act-B"] });
            const a1 = K.makeWindow("a1", LEFT);
            cascade(shared, [shared, a1]);
            expect(K.round(shared.frameGeometry)).toEqual(step(1, 2));

            K.switchActivity("act-B");
            expect(K.round(shared.frameGeometry)).toEqual(LEFT);

            K.switchActivity("act-A");
            expect(K.round(shared.frameGeometry)).toEqual(step(1, 2));
            expect(K.round(a1.frameGeometry)).toEqual(step(0, 2));
        });

        test("a window in a different group on each activity takes each group's layout in turn", () => {
            const shared = K.makeWindow("shared", LEFT, { activities: ["act-A", "act-B"] });
            const a1 = K.makeWindow("a1", LEFT);
            const b1 = K.makeWindow("b1", LEFT, { activities: ["act-B"] });
            const b2 = K.makeWindow("b2", LEFT, { activities: ["act-B"] });
            const all = [shared, a1, b1, b2];
            cascade(a1, all);
            K.switchActivity("act-B");
            cascade(b1, all);
            const gB = coordinator.cascades.groupOf(TileableWindow.get(shared));
            expect(gB.ring.length).toBe(3);

            K.switchActivity("act-A");
            expect(K.round(shared.frameGeometry)).toEqual(step(0, 2));
            K.switchActivity("act-B");
            expect(gB.members.indexOf("shared")).toBeGreaterThanOrEqual(0);
            expect(K.round(shared.frameGeometry)).toEqual(step(gB.members.indexOf("shared"), 3));
        });

        test("the same holds across virtual desktops", () => {
            const shared = K.makeWindow("shared", LEFT, { desktops: [], onAllDesktops: true });
            const a1 = K.makeWindow("a1", LEFT);
            cascade(shared, [shared, a1]);

            K.switchDesktop(K.DESKTOPS[1]);
            expect(K.round(shared.frameGeometry)).toEqual(LEFT);
            K.switchDesktop(K.DESKTOPS[0]);
            expect(K.round(shared.frameGeometry)).toEqual(step(1, 2));
        });

        test("a switch writes only windows on the new activity", () => {
            const flush = { x: 0, y: 0, width: 960, height: 1080 };
            // Flush quick tiles on A and C would get gaps from a pass over every window.
            const onA = [0, 1, 2].map((i) => K.makeWindow(`a${i}`, flush, K.tiled(flush)));
            const onC = [0, 1, 2, 3].map((i) => K.makeWindow(`c${i}`, flush, { activities: ["act-C"], ...K.tiled(flush) }));
            const onB = [0, 1, 2].map((i) => K.makeWindow(`b${i}`, LEFT, { activities: ["act-B"] }));
            const all = onA.concat(onC, onB);
            K.switchActivity("act-B");
            cascade(onB[0], all);
            all.forEach((w) => (w.geometryWrites = 0));
            onB.forEach((w) => (w.frameGeometry = LEFT));
            onB.forEach((w) => (w.geometryWrites = 0));

            K.switchActivity("act-B");

            expect(all.filter((w) => w.geometryWrites > 0).map((w) => w.internalId).sort()).toEqual(["b0", "b1", "b2"]);
        });

        test("the gap pass on a switch leaves flush tiles on other activities alone", () => {
            const flush = { x: 0, y: 0, width: 960, height: 1080 };
            const other = K.makeWindow("other", flush, { activities: ["act-B"], ...K.tiled(flush) });
            const here = K.makeWindow("here", flush, K.tiled(flush));
            workspace.windowList.mockImplementation(() => [other, here]);

            K.switchActivity("act-A");

            expect(K.round(here.frameGeometry)).toEqual(LEFT);
            expect(other.geometryWrites).toBe(0);
        });
    });
});
