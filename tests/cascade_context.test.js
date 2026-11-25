/**
 * Cascade groups are kept apart per activity and virtual desktop.
 * Runs under both the 6.8 and the 6.5-6.7 API shape (see tests/helpers/kwin.js).
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js"]);

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
});
