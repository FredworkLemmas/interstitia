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
    "contents/code/034_geometry.js",
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
            isInteractiveResize: false,
            isInteractiveMove: true,
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
     * This test demonstrates the applyGapsAll() static method:
     * - It should iterate through all windows and call applyGaps on their TileableWindow wrapper.
     */
    test("applyGapsAll iterates and applies gaps to all windows", () => {
        const mockWindow2 = { ...mockWindow, internalId: "win-456" };
        workspace.windowList.mockReturnValue([mockWindow, mockWindow2]);

        const tw1 = TileableWindow.get(mockWindow);
        const tw2 = TileableWindow.get(mockWindow2);
        
        // Spy on applyGaps
        tw1.applyGaps = jest.fn();
        tw2.applyGaps = jest.fn();

        TileableWindow.applyGapsAll();

        expect(tw1.applyGaps).toHaveBeenCalled();
        expect(tw2.applyGaps).toHaveBeenCalled();
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
        const geoms = { [mockWindow.internalId]: new TileableWindowGeometry(mockWindow.frameGeometry) };
        
        tw.applyGapsArea(geoms);
        
        const result = geoms[mockWindow.internalId];
        expect(result.x).toBe(gap.left);
        expect(result.y).toBe(gap.top);
    });

    /**
     * This test demonstrates the initialize() method and trigger connection:
     * - It verifies that initialize connects all signals from getTriggers().
     */
    test("initialize connects all geometry triggers", () => {
        const tw = TileableWindow.get(mockWindow);
        const triggers = tw.getTriggers();
        
        tw.initialize();
        
        triggers.forEach(([signal]) => {
            if (signal) {
                expect(signal.connect).toHaveBeenCalled();
            }
        });
    });

    /**
     * This test verifies that triggers call the expected actions.
     */
    test("triggers invoke expected actions", () => {
        const tw = TileableWindow.get(mockWindow);
        const triggers = tw.getTriggers();
        tw.applyGaps = jest.fn();

        tw.setupGeometrySignals();

        // Test a standard trigger
        const moveResizedTrigger = triggers.find(t => t[1] === "move resized changed");
        const moveResizedConn = moveResizedTrigger[0].connect.mock.calls[0][0];
        moveResizedConn();
        expect(global.debug).toHaveBeenCalledWith("move resized changed", tw.getCaption());
        expect(tw.applyGaps).toHaveBeenCalled();
        
        // Test a custom action trigger (e.g., quickTileModeChanged)
        const tileModeTrigger = triggers.find(t => t[1] === "tile mode changed");
        const tileModeConn = tileModeTrigger[0].connect.mock.calls[0][0];
        tileModeConn();
        expect(global.debug).toHaveBeenCalledWith("tile mode changed", tw.getCaption());
        expect(global.debug).toHaveBeenCalledWith("triggering cascade check for", tw.getCaption(), "due to tile change");
        expect(tw.applyGaps).toHaveBeenCalledWith(true);
    });

    /**
     * Test TileableWindow.nearArea
     */
    test("nearArea correctly identifies nearby coordinates", () => {
        const gapSize = 10;
        // Exact closed
        expect(TileableWindow.nearArea(100, 100, 110, gapSize)).toBe(true);
        // Within tolerance of closed
        expect(TileableWindow.nearArea(105, 100, 110, gapSize)).toBe(true);
        // Exact gapped
        expect(TileableWindow.nearArea(110, 100, 110, gapSize)).toBe(true);
        // Within tolerance of gapped
        expect(TileableWindow.nearArea(120, 100, 110, gapSize)).toBe(true);
        // Outside tolerance
        expect(TileableWindow.nearArea(150, 100, 110, gapSize)).toBe(false);
    });

    /**
     * Test TileableWindow.nearWindow
     */
    test("nearWindow correctly identifies nearby windows", () => {
        const gapSize = 10;
        // actualGap is 10, which is == gapSize. But the formula is Math.abs(actualGap - gapSize) > 1
        // Wait, the original nearWindow:
        // actualGap <= tolerance && Math.abs(actualGap - gapSize) > 1
        // If actualGap is 10 and gapSize is 10, Math.abs(10-10) = 0. 0 > 1 is false.
        // So it returns false for EXACT gap? That seems intended to avoid "snapping" what is already snapped?
        
        // actualGap = 5, gapSize = 10. Math.abs(5 - 10) = 5. 5 > 1 is true. 5 <= 15 is true.
        expect(TileableWindow.nearWindow(100, 105, gapSize)).toBe(true);
        
        // actualGap = 10, gapSize = 10. Math.abs(0) > 1 is false.
        expect(TileableWindow.nearWindow(100, 110, gapSize)).toBe(false);

        // actualGap = 15, gapSize = 10. Math.abs(5) > 1 is true. 15 <= 15 is true.
        expect(TileableWindow.nearWindow(100, 115, gapSize)).toBe(true);

        // actualGap = 20, gapSize = 10. 20 > 15 is false.
        expect(TileableWindow.nearWindow(100, 120, gapSize)).toBe(false);
    });

    /**
     * Test TileableWindow.overlapHor and overlapVer
     */
    test("overlapHor and overlapVer correctly detect overlaps", () => {
        global.gap = { mid: 8 };
        const win1 = { left: 0, right: 100, top: 0, bottom: 100 };
        const win2 = { left: 50, right: 150, top: 50, bottom: 150 };
        const win3 = { left: 200, right: 300, top: 200, bottom: 300 };

        expect(TileableWindow.overlapHor(win1, win2)).toBe(true);
        expect(TileableWindow.overlapVer(win1, win2)).toBe(true);

        expect(TileableWindow.overlapHor(win1, win3)).toBe(false);
        expect(TileableWindow.overlapVer(win1, win3)).toBe(false);
    });

    describe("resize vs. move drag detection", () => {
        let tw;
        let startHandler;
        let finishHandler;

        beforeEach(() => {
            coordinator.mouseDragOrResizeInProgress = false;
            coordinator.resizingWindowId = null;
            TileableWindow._instances.clear();
            tw = TileableWindow.get(mockWindow);
            tw.setupMouseDragTracking();
            startHandler = mockWindow.interactiveMoveResizeStarted.connect.mock.calls[0][0];
            finishHandler = mockWindow.interactiveMoveResizeFinished.connect.mock.calls[0][0];
        });

        test("resize drag sets resizingWindowId, not mouseDragOrResizeInProgress", () => {
            mockWindow.isInteractiveResize = true;
            mockWindow.isInteractiveMove = false;
            startHandler();
            expect(coordinator.resizingWindowId).toBe(mockWindow.internalId);
            expect(coordinator.mouseDragOrResizeInProgress).toBe(false);
        });

        test("move drag sets mouseDragOrResizeInProgress, not resizingWindowId", () => {
            mockWindow.isInteractiveResize = false;
            mockWindow.isInteractiveMove = true;
            startHandler();
            expect(coordinator.mouseDragOrResizeInProgress).toBe(true);
            expect(coordinator.resizingWindowId).toBeNull();
        });

        test("finish clears resizingWindowId", () => {
            mockWindow.isInteractiveResize = true;
            mockWindow.isInteractiveMove = false;
            mockWindow.quickTileMode = 0;
            startHandler();
            finishHandler();
            expect(coordinator.resizingWindowId).toBeNull();
        });

        test("finish clears mouseDragOrResizeInProgress", () => {
            mockWindow.isInteractiveResize = false;
            mockWindow.isInteractiveMove = true;
            mockWindow.quickTileMode = 0;
            startHandler();
            finishHandler();
            expect(coordinator.mouseDragOrResizeInProgress).toBe(false);
        });
    });

    describe("applyGaps suppression during resize", () => {
        let tw;

        beforeEach(() => {
            coordinator.mouseDragOrResizeInProgress = false;
            coordinator.resizingWindowId = null;
            coordinator.block = false;
            TileableWindow._instances.clear();
            mockWindow.quickTileMode = 0;
            mockWindow.frameGeometry = { x: 8, y: 8, width: 942, height: 1064 };
            workspace.windowList.mockReturnValue([mockWindow]);
            workspace.clientArea.mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080, left: 0, top: 0, right: 1920, bottom: 1080 });
            global.gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };
        });

        test("applyGaps returns early when this window is being resized", () => {
            coordinator.resizingWindowId = mockWindow.internalId;
            tw = TileableWindow.get(mockWindow);
            jest.spyOn(tw, 'applyGapsArea');
            tw.applyGaps();
            expect(tw.applyGapsArea).not.toHaveBeenCalled();
        });

        test("applyGaps does NOT return early for a different window during a resize", () => {
            const otherWindow = {
                internalId: "other-win",
                caption: "Other",
                output: 0,
                desktops: [1],
                activities: ["act-1"],
                frameGeometry: { x: 958, y: 8, width: 954, height: 1064 },
                normalWindow: true,
                resizeable: true,
                fullScreen: false,
                minimized: false,
                onAllDesktops: false,
                quickTileMode: 0,
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
            // mockWindow is being resized; otherWindow is the neighbor
            coordinator.resizingWindowId = mockWindow.internalId;
            workspace.windowList.mockReturnValue([mockWindow, otherWindow]);

            const twOther = TileableWindow.get(otherWindow);
            jest.spyOn(twOther, 'applyGapsArea');
            twOther.applyGaps();
            expect(twOther.applyGapsArea).toHaveBeenCalled();
        });

        test("geometry write loop does not write to the resized window", () => {
            const otherWindow = {
                internalId: "other-win",
                caption: "Other",
                output: 0,
                desktops: [1],
                activities: ["act-1"],
                // otherWindow's left edge touches mockWindow's right (no gap)
                frameGeometry: { x: 950, y: 8, width: 962, height: 1064 },
                normalWindow: true,
                resizeable: true,
                fullScreen: false,
                minimized: false,
                onAllDesktops: false,
                quickTileMode: 0,
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
            mockWindow.frameGeometry = { x: 8, y: 8, width: 942, height: 1064 };
            coordinator.resizingWindowId = mockWindow.internalId;
            workspace.windowList.mockReturnValue([mockWindow, otherWindow]);

            const originalMockGeo = { ...mockWindow.frameGeometry };
            const twOther = TileableWindow.get(otherWindow);
            twOther.applyGaps();

            // The resized window must NOT have had its frameGeometry written
            expect(mockWindow.frameGeometry).toEqual(originalMockGeo);
            // The neighbor's left edge should have moved right (gap inserted between them)
            expect(otherWindow.frameGeometry.x).toBeGreaterThan(950);
        });
    });
});
