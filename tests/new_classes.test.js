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
global.gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };
global.panel = { left: false, right: false, top: false, bottom: false };
global.config = { includeMaximized: false, excludeMode: true, includeMode: false, applications: [] };

// Load and evaluate the files in order
const filesToLoad = [
    "contents/code/034_geometry.js",
    "contents/code/035_tileable_window.js",
];

filesToLoad.forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    eval.call(global, code);
});

describe("BaseWindow Class", () => {
    let mockWindow;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWindow = {
            internalId: "win-123",
            caption: "Test Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            resourceClass: "test-app",
            normalWindow: true,
            resizeable: true,
            fullScreen: false,
            minimized: false,
        };
        workspace.clientArea.mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080, left: 0, top: 0, right: 1920, bottom: 1080 });
    });

    test("constructor instantiates WindowGeometry", () => {
        const bw = new BaseWindow(mockWindow);
        expect(bw.geometry).toBeInstanceOf(WindowGeometry);
        expect(bw.geometry.x).toBe(100);
    });

    test("isMaximized follows the window's current geometry, not the geometry at construction", () => {
        const bw = new BaseWindow(mockWindow);
        expect(bw.isMaximized()).toBe(false);
        mockWindow.frameGeometry = { x: 0, y: 0, width: 1920, height: 1080 };
        expect(bw.isMaximized()).toBe(true);
        expect(bw.geometry.width).toBe(1920);
    });

    test("getInfo returns correct metadata", () => {
        const bw = new BaseWindow(mockWindow);
        const info = bw.getInfo();
        expect(info).toEqual({
            activity: ["act-1"],
            screen: 0,
            applicationName: "test-app",
            title: "Test Window",
        });
    });

    test("isTileable returns true for normal windows", () => {
        const bw = new BaseWindow(mockWindow);
        expect(bw.isTileable()).toBe(true);
    });

    test("isTileable returns false for ignored windows", () => {
        mockWindow.normalWindow = false;
        const bw = new BaseWindow(mockWindow);
        expect(bw.isTileable()).toBe(false);
    });

    test("asTileableWindow returns a TileableWindow instance", () => {
        const bw = new BaseWindow(mockWindow);
        const tw = bw.asTileableWindow();
        expect(tw).toBeInstanceOf(TileableWindow);
        expect(tw.window).toBe(mockWindow);
    });
});

describe("CascadeGroup Class", () => {
    let mockWindow1, mockWindow2;
    let slotGeo;

    beforeEach(() => {
        jest.clearAllMocks();
        TileableWindow._instances.clear();
        coordinator.cascadeGroups.clear();

        mockWindow1 = {
            internalId: "win-1",
            caption: "Window 1",
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
        };
        mockWindow2 = {
            internalId: "win-2",
            caption: "Window 2",
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
        };
        workspace.windowList.mockReturnValue([mockWindow1, mockWindow2]);
        slotGeo = new WindowGeometry({ x: 100, y: 100, width: 800, height: 600 });
    });

    test("addWindow adds member and reapplies layout", () => {
        const group = new CascadeGroup("key", slotGeo, [], 0);
        const tw1 = TileableWindow.get(mockWindow1);
        
        group.addWindow(tw1);
        
        expect(group.members).toContain("win-1");
        expect(mockWindow1.interstitia_cascadeSlotKey).toBe("key");
        expect(mockWindow1.frameGeometry.width).toBe(800);
    });

    test("removeWindow removes member and dissolves if last one", () => {
        const group = new CascadeGroup("key", slotGeo, ["win-1", "win-2"], 0);
        coordinator.cascadeGroups.set("key", group);
        const tw1 = TileableWindow.get(mockWindow1);
        const tw2 = TileableWindow.get(mockWindow2);

        group.removeWindow(tw1);
        
        expect(group.members).not.toContain("win-1");
        expect(mockWindow1.interstitia_cascadeSlotKey).toBeUndefined();
        // Since only win-2 left, it should have dissolved
        expect(coordinator.cascadeGroups.has("key")).toBe(false);
        expect(mockWindow2.interstitia_cascadeSlotKey).toBeUndefined();
    });

    test("reapply raises members in stacking order, front window last", () => {
        const group = new CascadeGroup("key", slotGeo, ["win-1", "win-2"], 0);
        TileableWindow.get(mockWindow1);
        TileableWindow.get(mockWindow2);
        const raised = [];
        let active = null;
        Object.defineProperty(workspace, "activeWindow", {
            configurable: true,
            get: () => active,
            set: (w) => { active = w; raised.push(w.internalId); },
        });
        try {
            group.reapply(null);
            expect(raised).toEqual(["win-1", "win-2"]);
            raised.length = 0;
            group.reapply("win-1");
            expect(raised).toEqual(["win-2", "win-1"]);
        } finally {
            Object.defineProperty(workspace, "activeWindow", { configurable: true, writable: true, value: null });
        }
    });

    test("cycle rotates members", () => {
        const group = new CascadeGroup("key", slotGeo, ["win-1", "win-2"], 0);
        const tw1 = TileableWindow.get(mockWindow1);
        const tw2 = TileableWindow.get(mockWindow2);

        group.cycle();
        
        expect(group.members).toEqual(["win-2", "win-1"]);
        // win-1 should now be at second offset position
        expect(mockWindow1.frameGeometry.x).toBe(132);
    });
});
