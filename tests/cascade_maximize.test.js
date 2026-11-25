/**
 * Cascade groups of maximized windows (the maximize spot), under both API shapes.
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

const STEP = 32;
const stepGeo = (slot, k, n) => ({
    x: slot.x + k * STEP,
    y: slot.y + k * STEP,
    width: slot.width - (n - 1) * STEP,
    height: slot.height - (n - 1) * STEP,
});
// The gapped work area: where KWin plus the gaps put a maximized window.
const MAX = { x: 32, y: 32, width: 1856, height: 1016 };
const tw = (w) => TileableWindow.get(w);
const index = () => coordinator.cascades;

/** Maximized windows, initialized and listed. */
const maximized = (ids) => {
    const ws = ids.map((id) => K.makeWindow(id, MAX, { maximizeMode: 3 }));
    workspace.windowList.mockImplementation(() => ws);
    ws.forEach((w) => tw(w).initialize());
    return ws;
};

/** Ctrl+} with `w` active. */
const press = (w) => {
    workspace.activeWindow = w;
    ActiveWindow.getActive().startCascade();
};

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));
    beforeEach(() => {
        K.reset();
        config.includeMaximized = true;
    });

    test("Ctrl+} on a maximized window cascades the maximized windows across the work area", () => {
        const ws = maximized(["a", "b", "c"]);
        press(ws[2]);
        const group = index().groupOf(tw(ws[0]));
        expect(group).not.toBeNull();
        expect(group.position).toBe("maximize");
        expect(group.ring.length).toBe(3);
        group.ordered().forEach((m, k) => expect(K.round(m.window.frameGeometry)).toEqual(stepGeo(MAX, k, 3)));
    });

    test("members stay in the group when KWin reports their new geometry, still maximized", () => {
        const ws = maximized(["a", "b", "c"]);
        press(ws[2]);
        const group = index().groupOf(tw(ws[0]));
        // The geometry change arrives after the layout, with maximizeMode still 3.
        ws.forEach((w) => w.frameGeometryChanged.emit());
        ws.forEach((w) => w.maximizedChanged.emit());
        K.flushTimers();
        expect(ws.every((w) => index().groupOf(tw(w)) === group)).toBe(true);
        expect(group.ring.length).toBe(3);
    });

    test("maximized windows cascade with includeMaximized off too", () => {
        // With includeMaximized off a maximized window gets no gaps: it stays flush.
        config.includeMaximized = false;
        const ws = ["a", "b"].map((id) => K.makeWindow(id, K.AREA, { maximizeMode: 3 }));
        workspace.windowList.mockImplementation(() => ws);
        ws.forEach((w) => tw(w).initialize());
        press(ws[1]);
        expect(index().groupOf(tw(ws[0]))).not.toBeNull();
    });

    test("maximizing another window joins the group, in front", () => {
        const ws = maximized(["a", "b"]);
        press(ws[1]);
        const group = index().groupOf(tw(ws[0]));
        const c = K.makeWindow("c", { x: 300, y: 200, width: 600, height: 400 });
        workspace.windowList.mockImplementation(() => [...ws, c]);
        tw(c).initialize();

        c.maximizeMode = 3;
        c.frameGeometry = MAX;
        c.maximizedChanged.emit();
        K.flushTimers();

        expect(index().groupOf(tw(c))).toBe(group);
        expect(group.activeId()).toBe("c");
    });

    test("a member restored from maximized leaves the group", () => {
        const ws = maximized(["a", "b", "c"]);
        press(ws[2]);
        const group = index().groupOf(tw(ws[0]));

        ws[0].maximizeMode = 0;
        ws[0].frameGeometry = { x: 300, y: 200, width: 600, height: 400 };
        ws[0].maximizedChanged.emit();
        K.flushTimers();

        expect(index().groupOf(tw(ws[0]))).toBeNull();
        expect(group.ring.length).toBe(2);
    });
});
