/**
 * Cascade groups are kept apart per activity and virtual desktop.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js"]);

const LEFT = { x: 32, y: 32, width: 912, height: 1016 };

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
            expect(coordinator.cascadeGroups.size).toBe(2);
            expect(TileableWindow.get(a1).getCascadeGroup()).toBe(groupA);
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

            expect(coordinator.cascadeGroups.size).toBe(2);
            expect(TileableWindow.get(a1).getCascadeGroup()).toBe(groupA);
            expect(groupA.members).toEqual(["a2", "a1"]);
        });
    });
});
