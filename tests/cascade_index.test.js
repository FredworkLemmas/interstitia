/**
 * CascadeIndex and CascadeGroup: lookups, membership, layout and Ctrl+} / Ctrl+{.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

// The gapped left and right halves of the 1920x1080 work area with gaps of 32.
const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const RIGHT = { x: 976, y: 32, width: 912, height: 1016 };
const STEP = 32;

/** Where layout step k of n puts a window in `slot`. */
const stepGeo = (slot, k, n) => ({
    x: slot.x + k * STEP,
    y: slot.y + k * STEP,
    width: slot.width - (n - 1) * STEP,
    height: slot.height - (n - 1) * STEP,
});

const index = () => coordinator.cascades;
const tw = (w) => TileableWindow.get(w);
const ctxA = "act-A|desk-1";
const ctxB = "act-B|desk-1";

/** Record every window the script makes active, in order. */
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

/** Press Ctrl+} (or Ctrl+{) with `w` active. */
const press = (w, stop = false) => {
    workspace.activeWindow = w;
    const active = ActiveWindow.getActive();
    if (stop) active.stopCascade();
    else active.startCascade();
};

/** Windows a, b, c ... all on LEFT, registered and listed. */
const windowsIn = (ids, geo = LEFT, extra = {}) => {
    const ws = ids.map((id) => K.makeWindow(id, geo, extra));
    ws.forEach((w) => tw(w));
    return ws;
};

beforeEach(() => {
    K.reset();
    Object.defineProperty(workspace, "activeWindow", { configurable: true, writable: true, value: null });
});

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    describe("the index", () => {
        test("create registers the group by context and spot, and each member points back at it", () => {
            const [w1, w2] = windowsIn(["w1", "w2"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2"], "w2");

            expect(index().groupAt(ctxA, "DP-1", "left")).toBe(g);
            expect(index().groupsIn(ctxA)).toEqual([g]);
            expect(index().groupOf(tw(w1))).toBe(g);
            expect(index().groupOf(tw(w2))).toBe(g);
            expect(index().groupAt(ctxB, "DP-1", "left")).toBeNull();
            expect(index().groupAt(ctxA, "DP-1", "right")).toBeNull();
            expect(index().groupAt(ctxA, "DP-2", "left")).toBeNull();
        });

        test("a window on two activities can be in a different group on each", () => {
            const [shared] = windowsIn(["shared"], LEFT, { activities: ["act-A", "act-B"] });
            windowsIn(["a"], LEFT);
            windowsIn(["b"], RIGHT, { activities: ["act-B"] });
            const gA = index().create(ctxA, "DP-1", "left", ["shared", "a"], "a");
            K.switchActivity("act-B");
            const gB = index().create(ctxB, "DP-1", "right", ["shared", "b"], "b");

            expect(index().groupOf(tw(shared), ctxA)).toBe(gA);
            expect(index().groupOf(tw(shared), ctxB)).toBe(gB);
            expect(index().groupOf(tw(shared))).toBe(gB);
            expect(gA.members).toEqual(["shared", "a"]);
        });

        test("a window on all activities is in the current activity's context", () => {
            const [all, other] = windowsIn(["all", "other"], LEFT, { activities: [] });
            workspace.windowList.mockImplementation(() => [all, other]);
            K.switchActivity("act-B");
            press(all);

            const g = index().groupOf(tw(all));
            expect(g.ctx).toBe(ctxB);
            expect(index().groupOf(tw(all), ctxA)).toBeNull();
        });

        test("removing a window from a group of three keeps the group and lays the rest out", () => {
            const ws = windowsIn(["w1", "w2", "w3"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2", "w3"], "w3");

            index().remove(g, tw(ws[1]));

            expect(g.members).toEqual(["w1", "w3"]);
            expect(index().groupOf(tw(ws[1]))).toBeNull();
            expect(K.round(ws[0].frameGeometry)).toEqual(stepGeo(LEFT, 0, 2));
            expect(K.round(ws[2].frameGeometry)).toEqual(stepGeo(LEFT, 1, 2));
        });

        test("a group left with one window dissolves, and the window goes back to the full slot", () => {
            const [w1, w2] = windowsIn(["w1", "w2"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2"], "w2");

            index().remove(g, tw(w1));

            expect(index().groupAt(ctxA, "DP-1", "left")).toBeNull();
            expect(index().contexts.size).toBe(0);
            expect(index().groupOf(tw(w2))).toBeNull();
            expect(K.round(w2.frameGeometry)).toEqual(LEFT);
        });

        test("dissolve puts every member back on the full slot and unlinks both sides", () => {
            const ws = windowsIn(["w1", "w2", "w3"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2", "w3"], "w3");

            index().dissolve(g);

            ws.forEach((w) => {
                expect(K.round(w.frameGeometry)).toEqual(LEFT);
                expect(tw(w).cascade.groups.size).toBe(0);
            });
            expect(index().groupsIn(ctxA)).toEqual([]);
        });

        test("a closed window leaves every group it was in", () => {
            const [shared] = windowsIn(["shared"], LEFT, { activities: ["act-A", "act-B"] });
            windowsIn(["a1", "a2"], LEFT);
            windowsIn(["b1", "b2"], LEFT, { activities: ["act-B"] });
            const gA = index().create(ctxA, "DP-1", "left", ["shared", "a1", "a2"], "a2");
            const gB = index().create(ctxB, "DP-1", "left", ["shared", "b1", "b2"], "b2");

            index().removeWindow(tw(shared));

            expect(gA.members).toEqual(["a1", "a2"]);
            expect(gB.members).toEqual(["b1", "b2"]);
            expect(tw(shared).cascade.groups.size).toBe(0);
        });

        test("adding a window already in another group of the same context moves it", () => {
            windowsIn(["l1", "l2", "l3"]);
            const [r1, r2] = windowsIn(["r1", "r2"], RIGHT);
            const gl = index().create(ctxA, "DP-1", "left", ["l1", "l2", "l3"], "l3");
            const gr = index().create(ctxA, "DP-1", "right", ["r1", "r2"], "r2");

            index().add(gl, tw(r1));

            expect(gl.members).toEqual(["l1", "l2", "l3", "r1"]);
            expect(index().groupAt(ctxA, "DP-1", "right")).toBeNull();
            expect(gr.members).toEqual([]);
            expect(index().groupOf(tw(r2))).toBeNull();
        });

        test("the index and the windows' back-references always agree", () => {
            const all = windowsIn(["w1", "w2", "w3", "w4"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2", "w3"], "w3");
            index().add(g, tw(all[3]));
            index().remove(g, tw(all[0]));
            index().removeWindow(tw(all[2]));

            const linked = all.filter((w) => index().groupOf(tw(w)) === g).map((w) => w.internalId).sort();
            expect(linked).toEqual(g.members.slice().sort());
        });

        test("a group on another activity is not laid out until that activity shows", () => {
            const ws = windowsIn(["w1", "w2"], LEFT, { activities: ["act-B"] });
            index().create(ctxB, "DP-1", "left", ["w1", "w2"], "w2");

            expect(ws.map((w) => w.geometryWrites)).toEqual([0, 0]);
        });
    });

    describe("layout and stacking", () => {
        test("members are laid out top-left to bottom-right, front last, and raised in that order", () => {
            const ws = windowsIn(["w1", "w2", "w3"]);
            const raised = trackActivations();

            index().create(ctxA, "DP-1", "left", ["w1", "w2", "w3"], "w2");

            // The ring is w1 w2 w3 with w2 active: w3 and w1 follow it round, top-left first.
            const g = index().groupAt(ctxA, "DP-1", "left");
            expect(g.members).toEqual(["w3", "w1", "w2"]);
            expect(K.round(ws[2].frameGeometry)).toEqual(stepGeo(LEFT, 0, 3));
            expect(K.round(ws[0].frameGeometry)).toEqual(stepGeo(LEFT, 1, 3));
            expect(K.round(ws[1].frameGeometry)).toEqual(stepGeo(LEFT, 2, 3));
            expect(raised).toEqual(["w3", "w1", "w2"]);
        });

        test("workspace.raiseWindow is used for the stacking when KWin has it", () => {
            windowsIn(["w1", "w2"]);
            workspace.raiseWindow = jest.fn();
            const raised = trackActivations();
            try {
                index().create(ctxA, "DP-1", "left", ["w1", "w2"], "w2");
                expect(workspace.raiseWindow.mock.calls.map((c) => c[0].internalId)).toEqual(["w1", "w2"]);
                expect(raised).toEqual(["w2"]);
            } finally {
                delete workspace.raiseWindow;
            }
        });

        test("laying out again writes no geometry that is already right", () => {
            const ws = windowsIn(["w1", "w2"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2"], "w2");
            const writes = ws.map((w) => w.geometryWrites);

            g.layout();

            expect(ws.map((w) => w.geometryWrites)).toEqual(writes);
        });

        test("the slot follows the work area when it changes", () => {
            const ws = windowsIn(["w1", "w2"]);
            const g = index().create(ctxA, "DP-1", "left", ["w1", "w2"], "w2");
            workspace.clientArea.mockImplementation(() => K.rect({ x: 0, y: 0, width: 1920, height: 1034 }));

            g.layout();

            expect(K.round(ws[0].frameGeometry)).toEqual(stepGeo({ x: 32, y: 32, width: 912, height: 970 }, 0, 2));
        });
    });

    describe("Ctrl+} and Ctrl+{", () => {
        test("Ctrl+} on a window in a shared spot starts a group of every window there, the pressed one in front", () => {
            const [w1, w2, w3] = windowsIn(["w1", "w2", "w3"]);
            const other = K.makeWindow("other", RIGHT);
            workspace.windowList.mockImplementation(() => [w1, w2, w3, other]);

            press(w2);

            const g = index().groupOf(tw(w2));
            expect(g.position).toBe("left");
            expect(g.ring).toEqual(["w1", "w2", "w3"]);
            expect(g.members).toEqual(["w3", "w1", "w2"]);
            expect(index().groupOf(tw(other))).toBeNull();
        });

        test("Ctrl+} on a lone window does nothing", () => {
            const [w1] = windowsIn(["w1"]);
            workspace.windowList.mockImplementation(() => [w1]);

            press(w1);

            expect(index().contexts.size).toBe(0);
        });

        test("Ctrl+} on a floating window does nothing", () => {
            const ws = windowsIn(["w1", "w2"], { x: 300, y: 300, width: 600, height: 400 });
            workspace.windowList.mockImplementation(() => ws);

            press(ws[0]);

            expect(index().contexts.size).toBe(0);
        });

        test("Ctrl+} on the front window brings the top-left one to the front", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[2]);
            const g = index().groupOf(tw(ws[2]));
            expect(g.members).toEqual(["A", "B", "C"]);

            press(ws[2]);
            expect(g.members).toEqual(["B", "C", "A"]);
            expect(K.round(ws[0].frameGeometry)).toEqual(stepGeo(LEFT, 2, 3));
        });

        test("repeated Ctrl+} on the front window goes round the whole group and back", () => {
            const ws = windowsIn(["A", "B", "C", "D"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[3]);
            const g = index().groupOf(tw(ws[3]));

            for (let i = 0; i < 4; i++) press(ws.find((w) => w.internalId === g.members[g.members.length - 1]));

            expect(g.members).toEqual(["A", "B", "C", "D"]);
        });

        test("Ctrl+} on a background member makes it active, rotating the ring", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[2]);

            press(ws[1]);

            expect(index().groupOf(tw(ws[1])).members).toEqual(["C", "A", "B"]);
        });

        test("Ctrl+} on a window that is in a group's spot but not in the group adds it", () => {
            const ws = windowsIn(["A", "B"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[1]);
            const [c] = windowsIn(["C"]);

            press(c);

            expect(index().groupOf(tw(c)).members).toEqual(["A", "B", "C"]);
        });

        test("Ctrl+{ dissolves the group and leaves the pressed window on top", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[2]);

            press(ws[0], true);

            expect(index().contexts.size).toBe(0);
            ws.forEach((w) => expect(K.round(w.frameGeometry)).toEqual(LEFT));
            expect(workspace.activeWindow).toBe(ws[0]);
        });
    });

    describe("leaving a group", () => {
        test("starting to drag a member takes it out", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            ws.forEach((w) => tw(w).initialize());
            press(ws[2]);

            ws[1].move = true;
            ws[1].interactiveMoveResizeStarted.emit();

            expect(index().groupOf(tw(ws[1]))).toBeNull();
            expect(index().groupOf(tw(ws[0])).members).toEqual(["A", "C"]);
        });

        test.each([
            ["the group goes on", ["A", "B", "C"]],
            ["the group dissolves", ["A", "B"]],
        ])("a dragged member stays in front and active (%s)", (_, ids) => {
            const ws = windowsIn(ids);
            workspace.windowList.mockImplementation(() => ws);
            ws.forEach((w) => tw(w).initialize());
            press(ws[ws.length - 1]);
            workspace.raiseWindow = jest.fn();
            try {
                workspace.activeWindow = ws[0];
                ws[0].move = true;
                ws[0].interactiveMoveResizeStarted.emit();

                const raised = workspace.raiseWindow.mock.calls.map((c) => c[0].internalId);
                expect(raised[raised.length - 1]).toBe("A");
                expect(workspace.activeWindow).toBe(ws[0]);
            } finally {
                delete workspace.raiseWindow;
            }
        });

        test("a member that is maximized leaves the group", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            press(ws[2]);

            ws[1].maximizeMode = 3;
            ws[1].frameGeometry = K.AREA;
            tw(ws[1]).applyGaps();

            expect(index().groupOf(tw(ws[1]))).toBeNull();
            expect(index().groupOf(tw(ws[0])).members).toEqual(["A", "C"]);
        });

        test("a member moved to another spot (Meta+arrows) leaves the group once the tile settles", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            ws.forEach((w) => tw(w).initialize());
            press(ws[2]);

            const flush = { x: 960, y: 0, width: 960, height: 1080 };
            Object.assign(ws[1], a.old ? { quickTileMode: 2 } : { tile: { absoluteGeometry: K.rect(flush), padding: 0 } });
            ws[1].frameGeometry = flush;
            ws[1].tileChanged.emit();
            K.flushTimers();

            expect(index().groupOf(tw(ws[1]))).toBeNull();
            expect(tw(ws[1]).cascade.spot.position).toBe("right");
            expect(index().groupOf(tw(ws[0])).members).toEqual(["A", "C"]);
        });

        test("the active member moved to another spot (Meta+arrows) ends up in front of the group", () => {
            const ws = windowsIn(["A", "B", "C"]);
            workspace.windowList.mockImplementation(() => ws);
            ws.forEach((w) => tw(w).initialize());
            press(ws[2]);
            workspace.raiseWindow = jest.fn();
            try {
                const flush = { x: 960, y: 0, width: 960, height: 1080 };
                Object.assign(ws[2], a.old ? { quickTileMode: 2 } : { tile: { absoluteGeometry: K.rect(flush), padding: 0 } });
                ws[2].frameGeometry = flush;
                ws[2].tileChanged.emit();
                K.flushTimers();

                expect(index().groupOf(tw(ws[2]))).toBeNull();
                const raised = workspace.raiseWindow.mock.calls.map((c) => c[0].internalId);
                expect(raised[raised.length - 1]).toBe("C");
                expect(workspace.activeWindow).toBe(ws[2]);
            } finally {
                delete workspace.raiseWindow;
            }
        });

        test("a member re-tiled into the same spot stays in the group", () => {
            const ws = windowsIn(["A", "B"]);
            workspace.windowList.mockImplementation(() => ws);
            ws.forEach((w) => tw(w).initialize());
            press(ws[1]);

            const flush = { x: 0, y: 0, width: 960, height: 1080 };
            Object.assign(ws[0], a.old ? { quickTileMode: 1 } : { tile: { absoluteGeometry: K.rect(flush), padding: 0 } });
            ws[0].tileChanged.emit();
            K.flushTimers();

            expect(index().groupOf(tw(ws[0])).members).toEqual(["A", "B"]);
        });
    });
});
