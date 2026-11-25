/**
 * Each window's tile spot (TileableWindow.cascade.spot), under both API shapes.
 * 6.8: a quick tile shows as window.tile (no quickTileMode); 6.5-6.7: as window.quickTileMode.
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js"]);

beforeEach(() => K.reset());

// KWin's flush quick-tile rectangles on the 1920x1080 work area, with their 6.5-6.7 flags.
const SPOTS = {
    left: { rect: { x: 0, y: 0, width: 960, height: 1080 }, flags: 1 },
    right: { rect: { x: 960, y: 0, width: 960, height: 1080 }, flags: 2 },
    top: { rect: { x: 0, y: 0, width: 1920, height: 540 }, flags: 4 },
    bottom: { rect: { x: 0, y: 540, width: 1920, height: 540 }, flags: 8 },
    topLeft: { rect: { x: 0, y: 0, width: 960, height: 540 }, flags: 5 },
    topRight: { rect: { x: 960, y: 0, width: 960, height: 540 }, flags: 6 },
    bottomLeft: { rect: { x: 0, y: 540, width: 960, height: 540 }, flags: 9 },
    bottomRight: { rect: { x: 960, y: 540, width: 960, height: 540 }, flags: 10 },
};

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    /** A window KWin has quick-tiled into `name`, reported the way this API shape does. */
    const quickTiled = (name) => {
        const s = SPOTS[name];
        const props = a.old ? { quickTileMode: s.flags, tile: null } : { tile: { absoluteGeometry: K.rect(s.rect), padding: 0 } };
        return K.makeWindow("w", s.rect, props);
    };

    test.each(Object.keys(SPOTS))("a window quick-tiled %s has that spot", (name) => {
        const w = quickTiled(name);
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-1", position: name });
        expect(TileableWindow.get(w).cascade.spot).toEqual({ output: "DP-1", position: name });
    });

    test("a maximized window has the maximize spot", () => {
        const w = K.makeWindow("w", { x: 32, y: 32, width: 1856, height: 1016 }, { maximizeMode: 3 });
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-1", position: "maximize" });
    });

    test("a cascade member's offset geometry still finds its spot, even with no tile reported", () => {
        // The second of three windows cascaded in the gapped left half (32 px step).
        const w = K.makeWindow("w", { x: 64, y: 64, width: 848, height: 952 });
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-1", position: "left" });
    });

    test("a window exactly on the gapped right half, with no tile reported, has the right spot", () => {
        const w = K.makeWindow("w", { x: 976, y: 32, width: 912, height: 1016 });
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-1", position: "right" });
    });

    test("a floating window has no spot", () => {
        const w = K.makeWindow("w", { x: 300, y: 200, width: 600, height: 400 });
        expect(TileableWindow.get(w).refreshSpot()).toBeNull();
    });

    test("a floating window inside the left half, but not on the cascade grid, has no spot", () => {
        const w = K.makeWindow("w", { x: 50, y: 70, width: 800, height: 900 });
        expect(TileableWindow.get(w).refreshSpot()).toBeNull();
    });

    test("the output is named by the output's name", () => {
        const w = quickTiled("left");
        w.output = K.OUTPUTS[1];
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-2", position: "left" });
    });

    test("the spot is not recomputed while the script is moving windows", () => {
        const w = quickTiled("left");
        const tw = TileableWindow.get(w);
        tw.refreshSpot();
        w.tile = null;
        if (a.old) w.quickTileMode = 0;
        w.frameGeometry = { x: 300, y: 200, width: 600, height: 400 };
        coordinator.block = true;
        expect(tw.refreshSpot()).toEqual({ output: "DP-1", position: "left" });
        coordinator.block = false;
        expect(tw.refreshSpot()).toBeNull();
    });

    test("a tile change refreshes the spot once KWin has settled", () => {
        const w = K.makeWindow("w", { x: 300, y: 200, width: 600, height: 400 });
        const tw = TileableWindow.get(w);
        tw.initialize();
        expect(tw.cascade.spot).toBeNull();
        Object.assign(w, a.old ? { quickTileMode: 2 } : { tile: { absoluteGeometry: K.rect(SPOTS.right.rect), padding: 0 } });
        w.frameGeometry = SPOTS.right.rect;
        w.tileChanged.emit();
        w.quickTileModeChanged.emit();
        K.flushTimers();
        expect(tw.cascade.spot).toEqual({ output: "DP-1", position: "right" });
    });
});

describe("KWin 6.8 custom tiles", () => {
    beforeAll(() => K.useApi(K.APIS[0]));

    test("a 25 % custom-layout column is not mistaken for a half", () => {
        const r = { x: 0, y: 0, width: 480, height: 1080 };
        const w = K.makeWindow("w", r, { tile: { absoluteGeometry: K.rect(r), padding: 4 } });
        expect(TileableWindow.get(w).refreshSpot()).toBeNull();
    });

    test("a quick tile with KWin's tile padding is still matched", () => {
        const r = { x: 4, y: 4, width: 952, height: 1072 };
        const w = K.makeWindow("w", r, { tile: { absoluteGeometry: K.rect({ x: 0, y: 0, width: 960, height: 1080 }), padding: 4 } });
        expect(TileableWindow.get(w).refreshSpot()).toEqual({ output: "DP-1", position: "left" });
    });
});
