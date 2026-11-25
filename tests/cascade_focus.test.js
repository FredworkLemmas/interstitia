/**
 * Focusing a background window of a group rotates the group, after CASCADE_FOCUS_SETTLE_MS,
 * unless a move started meanwhile (Phase 0, F4: a press activates a window up to ~315 ms before
 * the drag is reported, and a click cannot be told from Alt+Tab).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const CTX = "act-A|desk-1";
const tw = (w) => TileableWindow.get(w);

const ringOf = (ids) => {
    const ws = ids.map((id) => K.makeWindow(id, LEFT));
    ws.forEach((w) => tw(w).initialize());
    workspace.windowList.mockImplementation(() => ws);
    const g = coordinator.cascades.create(CTX, "DP-1", "left", ids, ids[ids.length - 1]);
    return { ws, g, byId: (id) => ws.find((w) => w.internalId === id) };
};

/** KWin activating a window: the property changes, then windowActivated fires. */
const activate = (w) => {
    workspace.activeWindow = w;
    coordinator.cascades.onWindowActivated(w);
};

beforeEach(() => K.reset());

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    test("the settle is 400 ms", () => {
        expect(CascadeIndex.FOCUS_SETTLE_MS).toBe(400);
    });

    test("focusing a background window rotates the group once the settle has passed", () => {
        const { byId, g } = ringOf(["A", "B", "C", "D", "E"]);

        activate(byId("B"));
        expect(g.activeId()).toBe("E");

        K.flushTimers();
        expect(g.members).toEqual(["C", "D", "E", "A", "B"]);
    });

    test("a press that turns into a drag never rotates: the window leaves the group without moving first", () => {
        const { byId, g } = ringOf(["A", "B", "C"]);
        const b = byId("B");
        const before = K.round(b.frameGeometry);
        const writes = b.geometryWrites;

        activate(b);
        b.move = true;
        b.interactiveMoveResizeStarted.emit();

        expect(b.geometryWrites).toBe(writes);
        expect(K.round(b.frameGeometry)).toEqual(before);
        K.flushTimers();
        expect(coordinator.cascades.groupOf(tw(b))).toBeNull();
        expect(g.ring).toEqual(["A", "C"]);
    });

    test("a window still being moved when the settle ends is not rotated", () => {
        const { byId, g } = ringOf(["A", "B", "C"]);
        activate(byId("A"));
        byId("A").move = true;
        K.flushTimers();
        expect(g.activeId()).toBe("C");
    });

    test("Alt+Tab past several windows rotates only for the one left focused", () => {
        const { byId, g } = ringOf(["A", "B", "C", "D"]);
        activate(byId("A"));
        activate(byId("B"));
        K.flushTimers();
        expect(g.activeId()).toBe("B");
        expect(g.members).toEqual(["C", "D", "A", "B"]);
    });

    test("focusing a window outside every group, after one inside, cancels the rotation", () => {
        const { byId, g } = ringOf(["A", "B", "C"]);
        const other = K.makeWindow("other", { x: 976, y: 32, width: 912, height: 1016 });
        tw(other);
        activate(byId("A"));
        activate(other);
        K.flushTimers();
        expect(g.activeId()).toBe("C");
    });

    test("focusing the active window does nothing", () => {
        const { byId, ws } = ringOf(["A", "B", "C"]);
        const writes = ws.map((w) => w.geometryWrites);
        activate(byId("C"));
        K.flushTimers();
        expect(ws.map((w) => w.geometryWrites)).toEqual(writes);
    });

    test("the group's own activations while it lays out never start a rotation", () => {
        const { byId, g } = ringOf(["A", "B", "C"]);
        coordinator.cascadeLayout = true;
        activate(byId("A"));
        coordinator.cascadeLayout = false;
        K.flushTimers();
        expect(g.activeId()).toBe("C");
    });

    test("a rotation touches only the group's windows", () => {
        const { byId } = ringOf(["A", "B", "C"]);
        const bystander = K.makeWindow("x", { x: 976, y: 32, width: 912, height: 1016 });
        tw(bystander);
        activate(byId("A"));
        K.flushTimers();
        expect(bystander.geometryWrites).toBe(0);
    });
});
