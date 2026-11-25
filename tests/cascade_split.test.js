/**
 * Cascade groups on a KWin tile split away from the 25/50/75 % anchors (KWin keeps a split
 * where the user last dragged it). KWin 6.8 only: the split is known from window.tile.
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
const tw = (w) => TileableWindow.get(w);
const index = () => coordinator.cascades;

// The left/right split at x = 1100, 140 px off the half anchor.
const LEFT_TILE = { x: 0, y: 0, width: 1100, height: 1080 };
const RIGHT_TILE = { x: 1100, y: 0, width: 820, height: 1080 };
// Gapped: outer edges from the anchors, the split edge at round(1100 - 16).
const LEFT_SLOT = { x: 32, y: 32, width: 1052, height: 1016 };
// After the split is dragged to x = 1000 (56 px off the half anchor's 944).
const LEFT_TILE_2 = { x: 0, y: 0, width: 1000, height: 1080 };
const RIGHT_TILE_2 = { x: 1000, y: 0, width: 920, height: 1080 };
const LEFT_SLOT_2 = { x: 32, y: 32, width: 952, height: 1016 };

/** Put windows into a KWin tile. */
const setTile = (ws, r, padding = 0) => ws.forEach((w) => (w.tile = { absoluteGeometry: K.rect(r), padding }));

/** Three windows in the off-centre left tile and one in the right, grouped with Ctrl+}. */
const cascadeLeft = () => {
    const ws = ["a", "b", "c"].map((id) => K.makeWindow(id, LEFT_TILE));
    const r = K.makeWindow("r", RIGHT_TILE);
    setTile(ws, LEFT_TILE);
    setTile([r], RIGHT_TILE);
    workspace.windowList.mockImplementation(() => [...ws, r]);
    [...ws, r].forEach((w) => tw(w).initialize());
    workspace.activeWindow = ws[2];
    ActiveWindow.getActive().startCascade();
    return { ws, r, group: index().groupOf(tw(ws[0])) };
};

/** KWin moves the left/right split: every window goes flush to its new tile. */
const moveSplit = (ws, r) => {
    setTile(ws, LEFT_TILE_2);
    setTile([r], RIGHT_TILE_2);
    ws.forEach((w) => (w.frameGeometry = LEFT_TILE_2));
    r.frameGeometry = RIGHT_TILE_2;
    [...ws, r].forEach((w) => w.frameGeometryChanged.emit());
};

beforeAll(() => K.useApi(K.APIS[0]));
beforeEach(() => K.reset());

test("a window in the off-centre left tile has the left spot", () => {
    const w = K.makeWindow("w", LEFT_TILE);
    setTile([w], LEFT_TILE);
    expect(tw(w).refreshSpot()).toEqual({ output: "DP-1", position: "left" });
});

test("Ctrl+} cascades the windows inside the off-centre tile, not the standard half", () => {
    const { ws, group } = cascadeLeft();
    expect(group).not.toBeNull();
    expect(K.round(group.slotGeometry())).toEqual(LEFT_SLOT);
    group.ordered().forEach((m, k) => expect(K.round(m.window.frameGeometry)).toEqual(stepGeo(LEFT_SLOT, k, 3)));
    expect(ws.every((w) => index().groupOf(tw(w)) === group)).toBe(true);
});

test("a member keeps its spot from the group's slot when KWin no longer reports its tile", () => {
    const { ws, group } = cascadeLeft();
    ws.forEach((w) => (w.tile = null));
    ws.forEach((w) => expect(tw(w).refreshSpot()).toEqual({ output: "DP-1", position: "left" }));
    expect(K.round(group.slotGeometry())).toEqual(LEFT_SLOT);
});

test("when KWin moves the split, the group lays itself out in the new slot", () => {
    const { ws, r, group } = cascadeLeft();
    moveSplit(ws, r);
    K.flushTimers();
    group.ordered().forEach((m, k) => expect(K.round(m.window.frameGeometry)).toEqual(stepGeo(LEFT_SLOT_2, k, 3)));
});

test("a split moved by dragging the neighbour lays the group out when the drag ends", () => {
    const { ws, r, group } = cascadeLeft();
    r.resize = true;
    r.interactiveMoveResizeStarted.emit();
    moveSplit(ws, r);
    // Still flush during the drag.
    ws.forEach((w) => expect(K.round(w.frameGeometry)).toEqual(LEFT_TILE_2));
    r.resize = false;
    r.interactiveMoveResizeFinished.emit();
    K.flushTimers();
    group.ordered().forEach((m, k) => expect(K.round(m.window.frameGeometry)).toEqual(stepGeo(LEFT_SLOT_2, k, 3)));
    expect(index().groupOf(tw(ws[0]))).toBe(group);
});

test("a member that will not take its place makes the group lay out once, not over and over", () => {
    const { ws, group } = cascadeLeft();
    const layout = jest.spyOn(group, "layout");
    const stubborn = () => {
        ws[0].frameGeometry = { x: 200, y: 200, width: 600, height: 600 };
        ws[0].frameGeometryChanged.emit();
    };
    for (let i = 0; i < 3; i++) {
        stubborn();
        K.flushTimers();
    }
    expect(layout).toHaveBeenCalledTimes(1);
});

test("windows in a 25 % custom column and in the left quick tile never share a group", () => {
    const COLUMN = { x: 0, y: 0, width: 480, height: 1080 };
    const HALF = { x: 0, y: 0, width: 960, height: 1080 };
    const c1 = K.makeWindow("c1", COLUMN), c2 = K.makeWindow("c2", COLUMN), h = K.makeWindow("h", HALF);
    setTile([c1, c2], COLUMN, 4);
    setTile([h], HALF);
    workspace.windowList.mockImplementation(() => [c1, c2, h]);
    [c1, c2, h].forEach((w) => tw(w).initialize());

    workspace.activeWindow = c2;
    ActiveWindow.getActive().startCascade();
    const group = index().groupOf(tw(c1));
    expect(group).not.toBeNull();
    expect(group.ring.slice().sort()).toEqual(["c1", "c2"]);

    // The half window pressing Ctrl+} does not join the column's group.
    workspace.activeWindow = h;
    ActiveWindow.getActive().startCascade();
    expect(index().groupOf(tw(h))).toBeNull();
});

test("resizing a cascaded window keeps it in its group, and the group fills the resized tile", () => {
    const { ws, r, group } = cascadeLeft();
    const front = group.ordered()[2].window;
    front.resize = true;
    front.interactiveMoveResizeStarted.emit();
    expect(index().groupOf(tw(front))).toBe(group);
    moveSplit(ws, r);
    front.resize = false;
    front.interactiveMoveResizeFinished.emit();
    K.flushTimers();

    expect(ws.every((w) => index().groupOf(tw(w)) === group)).toBe(true);
    group.ordered().forEach((m, k) => expect(K.round(m.window.frameGeometry)).toEqual(stepGeo(LEFT_SLOT_2, k, 3)));
    // The window on the other side of the split is gapped from the same split.
    expect(K.round(r.frameGeometry)).toEqual({ x: 1016, y: 32, width: 872, height: 1016 });
});

test("moving a cascaded window still takes it out of its group", () => {
    const { group } = cascadeLeft();
    const front = group.ordered()[2].window;
    front.move = true;
    front.interactiveMoveResizeStarted.emit();
    expect(index().groupOf(tw(front))).toBeNull();
});
