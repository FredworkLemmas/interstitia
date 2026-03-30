const fs = require("fs");
const path = require("path");

// Mock global environment for KWin scripting
global.workspace = {
    windowList: jest.fn(),
    clientArea: jest.fn(),
    activeWindow: null,
};
global.KWin = {
    MaximizeArea: 1,
};
global.debug = jest.fn();
global.fulldebug = jest.fn();
global.gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };
global.panel = { left: false, right: false, top: false, bottom: false };
global.config = { includeMaximized: false, excludeMode: true, includeMode: false, applications: [] };

// Load and evaluate the files in order (similar to bundle task)
const filesToLoad = [
    "contents/code/034_geometry.js",
    "contents/code/035_tileable_window.js",
];

filesToLoad.forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    eval.call(global, code);
});

describe("ActiveWindow Class", () => {
    let mockWindow;

    beforeEach(() => {
        jest.clearAllMocks();
        TileableWindow._instances.clear();
        mockWindow = {
            internalId: "win-active",
            caption: "Active Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            normalWindow: true,
            onAllDesktops: false,
            interstitia_cascade_data: {},
        };
        workspace.activeWindow = mockWindow;
        workspace.windowList.mockReturnValue([mockWindow]);
    });

    test("getActive() returns an ActiveWindow instance", () => {
        const active = ActiveWindow.getActive();
        expect(active).toBeInstanceOf(ActiveWindow);
        expect(active).toBeInstanceOf(TileableWindow);
        expect(active.window.internalId).toBe("win-active");
    });

    test("getActive() returns null when no window is active", () => {
        workspace.activeWindow = null;
        workspace.activeClient = null;
        expect(ActiveWindow.getActive()).toBeNull();
    });

    test("selectSameSlotWindows finds windows in the same slot", () => {
        const otherWindow = {
            internalId: "win-other",
            caption: "Other Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 101, y: 101, width: 800, height: 600 }, // nearly equal
            normalWindow: true,
        };
        workspace.windowList.mockReturnValue([mockWindow, otherWindow]);
        
        const active = ActiveWindow.getActive();
        const sameSlot = active.selectSameSlotWindows();
        
        expect(sameSlot.length).toBe(2);
        expect(sameSlot[0].window.internalId).toBe("win-active");
        expect(sameSlot[1].window.internalId).toBe("win-other");
    });

    test("startCascade creates a cascade group and assigns keys to all members", () => {
        const otherWindow = {
            internalId: "win-other",
            caption: "Other Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            normalWindow: true,
        };
        workspace.windowList.mockReturnValue([mockWindow, otherWindow]);

        const active = ActiveWindow.getActive();
        active.startCascade();

        expect(mockWindow.interstitia_cascadeSlotKey).toBeDefined();
        expect(otherWindow.interstitia_cascadeSlotKey).toBeDefined();
        expect(mockWindow.interstitia_cascadeSlotKey).toBe(otherWindow.interstitia_cascadeSlotKey);
    });

    test("stopCascade dissolves cascade group and removes keys from all members", () => {
        const otherWindow = {
            internalId: "win-other",
            caption: "Other Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            normalWindow: true,
        };
        workspace.windowList.mockReturnValue([mockWindow, otherWindow]);

        // First create the cascade group
        const active = ActiveWindow.getActive();
        active.startCascade();
        expect(mockWindow.interstitia_cascadeSlotKey).toBeDefined();

        // Now stop it
        active.stopCascade();

        expect(mockWindow.interstitia_cascadeSlotKey).toBeUndefined();
        expect(otherWindow.interstitia_cascadeSlotKey).toBeUndefined();
    });
});

describe("cascade cycling", () => {
    // Helpers to build minimal mock windows sharing the same slot geometry.
    function makeWindow(id) {
        return {
            internalId: id,
            caption: id,
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            normalWindow: true,
            onAllDesktops: false,
        };
    }

    function createGroupWithMembers(windows) {
        // Register instances so getById works.
        windows.forEach((w) => TileableWindow.get(w));

        const slotGeo = { x: 100, y: 100, width: 800, height: 600 };
        const key = TileableWindow.slotKey(slotGeo);
        const memberIds = windows.map((w) => w.internalId);

        coordinator.cascadeGroups.set(key, {
            slotGeometry: slotGeo,
            members: memberIds,
            output: 0,
        });
        windows.forEach((w) => {
            w.interstitia_cascadeSlotKey = key;
        });

        return key;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        TileableWindow._instances.clear();
        coordinator.cascadeGroups.clear();
        coordinator.block = false;
        workspace.activeWindow = null;
        workspace.windowList.mockReturnValue([]);
    });

    test("reapplyCascade keeps group.members in sync with visual order", () => {
        const [wA, wB, wC] = ["A", "B", "C"].map(makeWindow);
        const key = createGroupWithMembers([wA, wB, wC]);

        // Members start as [A, B, C]. Promote B (not last) to front.
        TileableWindow.reapplyCascade(key, "B");

        const group = coordinator.cascadeGroups.get(key);
        expect(group.members[group.members.length - 1]).toBe("B");
        expect(group.members).toEqual(["A", "C", "B"]);
    });

    test("cycleCascade moves the front window to the back", () => {
        const [wA, wB, wC] = ["A", "B", "C"].map(makeWindow);
        const key = createGroupWithMembers([wA, wB, wC]);
        // members = [A, B, C] → C is front

        TileableWindow.cycleCascade(key);

        const group = coordinator.cascadeGroups.get(key);
        // C moved to index 0; B is new front
        expect(group.members[0]).toBe("C");
        expect(group.members[group.members.length - 1]).toBe("B");
    });

    test("cycleCascade with 2 windows swaps them", () => {
        const [wA, wB] = ["A", "B"].map(makeWindow);
        const key = createGroupWithMembers([wA, wB]);
        // members = [A, B] → B is front

        TileableWindow.cycleCascade(key);
        let group = coordinator.cascadeGroups.get(key);
        expect(group.members).toEqual(["B", "A"]);

        TileableWindow.cycleCascade(key);
        group = coordinator.cascadeGroups.get(key);
        expect(group.members).toEqual(["A", "B"]);
    });

    test("repeated cycling restores original order after N rotations", () => {
        const ids = ["A", "B", "C", "D"];
        const windows = ids.map(makeWindow);
        const key = createGroupWithMembers(windows);
        // members = [A, B, C, D]

        for (let i = 0; i < ids.length; i++) {
            TileableWindow.cycleCascade(key);
        }

        const group = coordinator.cascadeGroups.get(key);
        expect(group.members).toEqual(ids);
    });

    test("cycleCascade is a no-op on a single-member group", () => {
        const [wA] = ["A"].map(makeWindow);
        const key = createGroupWithMembers([wA]);

        expect(() => TileableWindow.cycleCascade(key)).not.toThrow();
        const group = coordinator.cascadeGroups.get(key);
        expect(group.members).toEqual(["A"]);
    });

    test("startCascade promotes a background member to front", () => {
        const [wA, wB, wC] = ["A", "B", "C"].map(makeWindow);
        workspace.windowList.mockReturnValue([wA, wB, wC]);
        const key = createGroupWithMembers([wA, wB, wC]);
        // members = [A, B, C] → C is front

        // Make B the active (background) window and press the shortcut.
        workspace.activeWindow = wB;
        wB.interstitia_cascadeSlotKey = key;
        const active = ActiveWindow.getActive();
        active.startCascade();

        const group = coordinator.cascadeGroups.get(key);
        expect(group.members[group.members.length - 1]).toBe("B");
    });

    test("startCascade cycles when the active window is already the front", () => {
        const [wA, wB, wC] = ["A", "B", "C"].map(makeWindow);
        workspace.windowList.mockReturnValue([wA, wB, wC]);
        const key = createGroupWithMembers([wA, wB, wC]);
        // members = [A, B, C] → C is front

        // Make C (the current front) active and press the shortcut.
        workspace.activeWindow = wC;
        wC.interstitia_cascadeSlotKey = key;
        const active = ActiveWindow.getActive();
        active.startCascade();

        const group = coordinator.cascadeGroups.get(key);
        // C should have rotated to the back; B is new front.
        expect(group.members[0]).toBe("C");
        expect(group.members[group.members.length - 1]).toBe("B");
    });

    test("promoting then cycling completes a full round-trip", () => {
        const [wA, wB, wC] = ["A", "B", "C"].map(makeWindow);
        workspace.windowList.mockReturnValue([wA, wB, wC]);
        const key = createGroupWithMembers([wA, wB, wC]);
        // Start: [A, B, C] — C is front.

        // Promote B (background) to front → [A, C, B]
        workspace.activeWindow = wB;
        wB.interstitia_cascadeSlotKey = key;
        ActiveWindow.getActive().startCascade();
        expect(coordinator.cascadeGroups.get(key).members).toEqual(["A", "C", "B"]);

        // B is now front; press again → cycle B to back → [B, A, C]
        workspace.activeWindow = wB;
        ActiveWindow.getActive().startCascade();
        expect(coordinator.cascadeGroups.get(key).members).toEqual(["B", "A", "C"]);
    });
});
