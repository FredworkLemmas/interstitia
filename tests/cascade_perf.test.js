/**
 * Cascade operations touch only the windows of the groups they look up.
 * 40 windows over 3 activities and 2 screens; frameGeometry writes are counted on every window.
 */
const K = require("./helpers/kwin");

K.installKWin();
K.load(["contents/code/034_geometry.js", "contents/code/035_tileable_window.js", "contents/code/036_cascade_index.js"]);

const LEFT = { x: 32, y: 32, width: 912, height: 1016 };
const RIGHT = { x: 976, y: 32, width: 912, height: 1016 };
const ACTS = ["act-A", "act-B", "act-C"];

/** 40 windows: activities round-robin, screens alternating, half left and half right. */
const crowd = () => {
    const ws = [];
    for (let i = 0; i < 40; i++) {
        ws.push(K.makeWindow(`w${i}`, i % 4 < 2 ? LEFT : RIGHT, { activities: [ACTS[i % 3]], output: K.OUTPUTS[i % 2] }));
    }
    return ws;
};

const writes = (ws) => ws.filter((w) => w.geometryWrites > 0).map((w) => w.internalId);
const resetWrites = (ws) => ws.forEach((w) => (w.geometryWrites = 0));

beforeEach(() => K.reset());

describe.each(K.APIS)("KWin $name API", (a) => {
    beforeAll(() => K.useApi(a));

    test("bringing a member of a 3-window group to the front writes only those 3 windows", () => {
        const ws = crowd();
        ws.forEach((w) => TileableWindow.get(w));
        workspace.windowList.mockImplementation(() => ws);
        const members = ["m1", "m2", "m3"].map((id) => K.makeWindow(id, LEFT, { activities: ["act-A"], output: K.OUTPUTS[0] }));
        // Group the three on act-A's left half of DP-1, away from the crowd's own spots.
        members.forEach((w) => TileableWindow.get(w));
        coordinator.cascades.create("act-A|desk-1", "DP-1", "left", ["m1", "m2", "m3"], "m3");
        const all = ws.concat(members);
        resetWrites(all);

        workspace.activeWindow = members[0];
        ActiveWindow.getActive().startCascade();

        expect(writes(all).sort()).toEqual(["m1", "m2", "m3"]);
    });

    test("Ctrl+} never calls windowList for a window already in a group", () => {
        const members = ["m1", "m2", "m3"].map((id) => K.makeWindow(id, LEFT));
        members.forEach((w) => TileableWindow.get(w));
        coordinator.cascades.create("act-A|desk-1", "DP-1", "left", ["m1", "m2", "m3"], "m3");
        workspace.windowList.mockClear();

        workspace.activeWindow = members[2];
        ActiveWindow.getActive().startCascade();

        expect(workspace.windowList).not.toHaveBeenCalled();
    });
});
