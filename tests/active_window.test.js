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
    "contents/code/036_cascade_index.js",
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
});
