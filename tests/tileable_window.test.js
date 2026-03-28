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
global.QTimer = jest.fn().mockImplementation(() => ({
    interval: 0,
    singleShot: false,
    timeout: {
        connect: jest.fn(),
    },
    start: jest.fn(),
}));
global.debug = jest.fn();
global.fulldebug = jest.fn();
global.gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };
global.panel = { left: false, right: false, top: false, bottom: false };
global.config = { includeMaximized: false, excludeMode: true, includeMode: false, applications: [] };

// Load and evaluate the files in order (similar to bundle task)
const filesToLoad = [
    "contents/code/040_windowing.js",
    "contents/code/035_tileable_window.js",
];

filesToLoad.forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    eval.call(global, code);
});

describe("TileableWindow Class", () => {
    let mockWindow;

    beforeEach(() => {
        jest.clearAllMocks();
        TileableWindow._instances.clear();
        mockWindow = {
            internalId: "win-123",
            caption: "Test Window",
            output: 0,
            desktops: [1],
            activities: ["act-1"],
            frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
            normalWindow: true,
            resizeable: true,
            fullScreen: false,
            minimized: false,
            onAllDesktops: false,
            interactiveMoveResizeStarted: { connect: jest.fn() },
            interactiveMoveResizeFinished: { connect: jest.fn() },
            moveResizedChanged: { connect: jest.fn() },
            frameGeometryChanged: { connect: jest.fn() },
            fullScreenChanged: { connect: jest.fn() },
            maximizedChanged: { connect: jest.fn() },
            minimizedChanged: { connect: jest.fn() },
            quickTileModeChanged: { connect: jest.fn() },
            tileChanged: { connect: jest.fn() },
            desktopsChanged: { connect: jest.fn() },
            activitiesChanged: { connect: jest.fn() },
        };
        workspace.windowList.mockReturnValue([mockWindow]);
        workspace.clientArea.mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080, left: 0, top: 0, right: 1920, bottom: 1080 });
    });

    /**
     * This test demonstrates the Factory Pattern:
     * - Calling TileableWindow.get() twice with the same KWin window object
     *   should return the exact same TileableWindow instance.
     */
    test("factory pattern returns existing instance", () => {
        const tw1 = TileableWindow.get(mockWindow);
        const tw2 = TileableWindow.get(mockWindow);
        expect(tw1).toBe(tw2);
        expect(TileableWindow._instances.size).toBe(1);
    });

    /**
     * This test demonstrates WindowCoordinator Singleton:
     * - The coordinator is shared across all instances.
     * - Changing a state in the coordinator affects all instances.
     */
    test("WindowCoordinator is a singleton shared across instances", () => {
        const tw1 = TileableWindow.get(mockWindow);
        const c1 = WindowCoordinator.getInstance();
        c1.block = true;
        
        const otherMock = { ...mockWindow, internalId: "win-456" };
        const tw2 = TileableWindow.get(otherMock);
        
        // We can't access coordinator directly in the class from here, but we verify it's the same instance
        const c2 = WindowCoordinator.getInstance();
        expect(c1).toBe(c2);
        expect(c2.block).toBe(true);
    });

    /**
     * This test demonstrates the getOutput() method:
     * - It should correctly prioritize 'output' then 'screen' properties.
     */
    test("getOutput returns output correctly", () => {
        const tw = TileableWindow.get(mockWindow);
        expect(tw.getOutput()).toBe(0);
        
        delete mockWindow.output;
        mockWindow.screen = 1;
        expect(tw.getOutput()).toBe(1);
    });

    /**
     * This test demonstrates shouldIgnore() logic:
     * - It checks various window states (normal, resizeable, fullscreen, etc.)
     * - It also verifies application exclusion/inclusion based on config.
     */
    test("shouldIgnore correctly identifies windows to skip", () => {
        const tw = TileableWindow.get(mockWindow);
        expect(tw.shouldIgnore()).toBe(false);

        mockWindow.fullScreen = true;
        expect(tw.shouldIgnore()).toBe(true);
        mockWindow.fullScreen = false;

        mockWindow.normalWindow = false;
        expect(tw.shouldIgnore()).toBe(true);
        mockWindow.normalWindow = true;

        config.excludeMode = true;
        config.applications = ["excluded-app"];
        mockWindow.resourceClass = "excluded-app";
        expect(tw.shouldIgnore()).toBe(true);
    });

    /**
     * This test demonstrates the applyGapsArea() method:
     * - It verifies that the window's geometry is adjusted to include gaps
     *   when it is near a screen edge.
     */
    test("applyGapsArea applies gaps for screen edges", () => {
        const tw = TileableWindow.get(mockWindow);
        // Position window near top-left corner
        mockWindow.frameGeometry = { x: 5, y: 5, width: 400, height: 300 };
        const geoms = { [mockWindow.internalId]: copyGeometry(mockWindow.frameGeometry) };
        
        tw.applyGapsArea(geoms);
        
        const result = geoms[mockWindow.internalId];
        expect(result.x).toBe(gap.left);
        expect(result.y).toBe(gap.top);
    });

    /**
     * This test demonstrates the initialize() method:
     * - It verifies that initialize connects all necessary signals for a window.
     */
    test("initialize connects window signals", () => {
        const tw = TileableWindow.get(mockWindow);
        tw.initialize();
        
        expect(mockWindow.moveResizedChanged.connect).toHaveBeenCalled();
        expect(mockWindow.frameGeometryChanged.connect).toHaveBeenCalled();
        expect(mockWindow.maximizedChanged.connect).toHaveBeenCalled();
        expect(mockWindow.interactiveMoveResizeStarted.connect).toHaveBeenCalled();
    });
});
