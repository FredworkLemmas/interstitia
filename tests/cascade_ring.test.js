/**
 * Stable cascade groups: a ring of windows in a fixed order with a pointer to the active one,
 * which is always bottom-right and in front.
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const CTX = "act-A|desk-1";
const tw = (w) => TileableWindow.get(w);
const index = () => coordinator.cascades;
const stepGeo = (k, n) => ({ x: 32 + 32 * k, y: 32 + 32 * k, width: 912 - 32 * (n - 1), height: 1016 - 32 * (n - 1) });

/** Windows A..E in the left half, grouped in that order with the last one active. */
const ringOf = (ids) => {
    const ws = ids.map((id) => K.makeWindow(id, LEFT));
    ws.forEach((w) => tw(w));
    workspace.windowList.mockImplementation(() => ws);
    const g = index().create(CTX, "DP-1", "left", ids, ids[ids.length - 1]);
    return { ws, g, byId: (id) => ws.find((w) => w.internalId === id) };
};

/** The windows from top-left to bottom-right, read from their geometry. */
const onScreen = (ws) =>
    ws.slice().sort((p, q) => p.frameGeometry.x - q.frameGeometry.x).map((w) => w.internalId);

beforeEach(() => K.reset());

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    test("activating a window rotates the ring and keeps its order: A B C D E, B gives C D E A B, then D gives E A B C D", () => {
        const { ws, g } = ringOf(["A", "B", "C", "D", "E"]);
        expect(onScreen(ws)).toEqual(["A", "B", "C", "D", "E"]);

        g.activate("B");
        expect(g.members).toEqual(["C", "D", "E", "A", "B"]);
        expect(onScreen(ws)).toEqual(["C", "D", "E", "A", "B"]);

        g.activate("D");
        expect(g.members).toEqual(["E", "A", "B", "C", "D"]);
        expect(onScreen(ws)).toEqual(["E", "A", "B", "C", "D"]);
    });

    test("the active window is bottom-right, the size every member gets, and raised last", () => {
        const { byId, g } = ringOf(["A", "B", "C"]);
        const raised = [];
        let current = null;
        Object.defineProperty(workspace, "activeWindow", {
            configurable: true,
            get: () => current,
            set: (w) => {
                current = w;
                raised.push(w.internalId);
            },
        });
        try {
            g.activate("A");
            expect(K.round(byId("A").frameGeometry)).toEqual(stepGeo(2, 3));
            expect(K.round(byId("B").frameGeometry)).toEqual(stepGeo(0, 3));
            expect(raised).toEqual(["B", "C", "A"]);
        } finally {
            Object.defineProperty(workspace, "activeWindow", { configurable: true, writable: true, value: null });
        }
    });

    test("the ring order never changes, whatever is activated", () => {
        const { g } = ringOf(["A", "B", "C", "D"]);
        ["C", "A", "D", "B", "B"].forEach((id) => g.activate(id));
        expect(g.ring).toEqual(["A", "B", "C", "D"]);
        expect(g.activeId()).toBe("B");
    });

    test("CascadeGroup.STEP is the 32 px cascade offset", () => {
        expect(CascadeGroup.STEP).toBe(32);
    });

    describe("Ctrl+}", () => {
        const press = (w) => {
            workspace.activeWindow = w;
            ActiveWindow.getActive().startCascade();
        };

        test("on the active window it brings the top-left window to the front, the ring rotating by one", () => {
            const { ws, byId, g } = ringOf(["A", "B", "C", "D"]);
            press(byId("D"));
            expect(onScreen(ws)).toEqual(["B", "C", "D", "A"]);
            expect(g.activeId()).toBe("A");
        });

        test("pressed repeatedly on whatever is in front, it walks round the whole ring and back", () => {
            const { ws, byId, g } = ringOf(["A", "B", "C", "D"]);
            const fronts = [];
            for (let i = 0; i < 4; i++) {
                press(byId(g.activeId()));
                fronts.push(g.activeId());
            }
            expect(fronts).toEqual(["A", "B", "C", "D"]);
            expect(onScreen(ws)).toEqual(["A", "B", "C", "D"]);
        });

        test("starting a group takes the ring order from KWin's stacking order, bottom to top", () => {
            const ws = ["A", "B", "C"].map((id) => K.makeWindow(id, LEFT));
            workspace.windowList.mockImplementation(() => ws);
            workspace.stackingOrder = [ws[2], ws[0], ws[1]];
            try {
                press(ws[1]);
                expect(index().groupOf(tw(ws[1])).ring).toEqual(["C", "A", "B"]);
            } finally {
                delete workspace.stackingOrder;
            }
        });
    });

    describe("joining and leaving", () => {
        test("a window that joins goes just after the active one and becomes active; the others keep their places", () => {
            const { ws, g } = ringOf(["A", "B", "C", "D"]);
            g.activate("B");
            const x = K.makeWindow("X", LEFT);
            tw(x);

            index().add(g, tw(x));

            expect(g.ring).toEqual(["A", "B", "X", "C", "D"]);
            expect(g.activeId()).toBe("X");
            expect(onScreen(ws.concat([x]))).toEqual(["C", "D", "A", "B", "X"]);
        });

        test("when the active window leaves, the one just above-left of it becomes active", () => {
            const { ws, byId, g } = ringOf(["A", "B", "C", "D"]);
            g.activate("C");

            index().remove(g, tw(byId("C")));

            expect(g.ring).toEqual(["A", "B", "D"]);
            expect(g.activeId()).toBe("B");
            expect(onScreen(ws.filter((w) => w.internalId !== "C"))).toEqual(["D", "A", "B"]);
        });

        test("when the first window of the ring is active and leaves, the active one wraps round to the last", () => {
            const { byId, g } = ringOf(["A", "B", "C"]);
            g.activate("A");
            index().remove(g, tw(byId("A")));
            expect(g.activeId()).toBe("C");
        });

        test("when a background window leaves, the active window stays active and in front", () => {
            const { byId, g } = ringOf(["A", "B", "C", "D"]);
            g.activate("C");
            index().remove(g, tw(byId("A")));
            expect(g.activeId()).toBe("C");
            expect(g.members).toEqual(["D", "B", "C"]);
        });
    });
});
