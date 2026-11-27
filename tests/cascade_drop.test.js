/**
 * Dropping a dragged window on a cascade group: the point the pointer is let go at decides,
 * not the window's centre, which for a window dragged by its title bar is far below it.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

// The gapped left half of the 1920x1080 work area with gaps of 32. Its middle half is
// x 260-716, y 286-794.
const LEFT = { x: 32, y: 32, width: 912, height: 1016 };

const tw = (w) => TileableWindow.get(w);

/** A group of a1, a2 on LEFT and a floating window `b`, all initialized. */
const setup = (bGeo = { x: 1200, y: 100, width: 600, height: 400 }) => {
    const a1 = K.makeWindow("a1", LEFT);
    const a2 = K.makeWindow("a2", LEFT);
    const b = K.makeWindow("b", bGeo);
    const ws = [a1, a2, b];
    workspace.windowList.mockImplementation(() => ws);
    ws.forEach((w) => tw(w).initialize());
    workspace.activeWindow = a2;
    ActiveWindow.getActive().startCascade();
    return { a1, a2, b, group: tw(a1).getCascadeGroup() };
};

/** Drag `w` to `to`, letting go of the pointer at `pointer` (none: KWin reports no position). */
const drag = (w, to, pointer) => {
    if (pointer) workspace.cursorPos = K.rect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
    else delete workspace.cursorPos;
    w.move = true;
    w.interactiveMoveResizeStarted.emit();
    w.frameGeometry = to;
    w.frameGeometryChanged.emit();
    w.move = false;
    w.interactiveMoveResizeFinished.emit();
    K.flushTimers();
};

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));
    beforeEach(() => K.reset());
    afterEach(() => {
        delete workspace.cursorPos;
    });

    test("a tall window let go with the pointer over the group joins it, though its centre is below", () => {
        const { b, group } = setup();
        // Held by the title bar at (550, 515); the window's centre (550, 850) is below the middle half.
        drag(b, { x: 200, y: 500, width: 700, height: 700 }, { x: 550, y: 515 });

        expect(tw(b).getCascadeGroup()).toBe(group);
        expect(group.activeId()).toBe("b");
    });

    test("let go with the pointer away from the group, it does not join, wherever its centre is", () => {
        const { b, group } = setup();
        // An odd grab far off the window: its centre (450, 450) is on the group, the pointer is not.
        drag(b, { x: 100, y: 100, width: 700, height: 700 }, { x: 1500, y: 600 });

        expect(tw(b).getCascadeGroup()).toBeNull();
        expect(group.ring.length).toBe(2);
    });

    test("let go near the group's edge (outside its middle half), it does not join", () => {
        const { b } = setup();
        drag(b, { x: 40, y: 40, width: 600, height: 400 }, { x: 100, y: 55 });

        expect(tw(b).getCascadeGroup()).toBeNull();
    });

    test("with no pointer position from KWin, the window's centre decides, as before", () => {
        const { b, group } = setup();
        drag(b, { x: 200, y: 300, width: 600, height: 400 }, null);

        expect(tw(b).getCascadeGroup()).toBe(group);
    });
});
