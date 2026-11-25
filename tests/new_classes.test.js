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
    "contents/code/036_cascade_index.js",
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
