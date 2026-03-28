const fs = require("fs");
const path = require("path");

// Mock global environment for KWin scripting
global.workspace = {
    currentDesktopChanged: { connect: jest.fn() },
    desktopLayoutChanged: { connect: jest.fn() },
    desktopsChanged: { connect: jest.fn() },
    screensChanged: { connect: jest.fn() },
    currentActivityChanged: { connect: jest.fn() },
    activitiesChanged: { connect: jest.fn() },
    virtualScreenSizeChanged: { connect: jest.fn() },
    virtualScreenGeometryChanged: { connect: jest.fn() },
    outputOrderChanged: { connect: jest.fn() },
    windowAdded: { connect: jest.fn() },
};
global.debug = jest.fn();
global.applyGapsAll = jest.fn();

// Load the file
const code = fs.readFileSync(path.join(__dirname, "..", "contents/code/070_reaction.js"), "utf8");
eval.call(global, code);

describe("onRelayouted", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("connects all signals returned by getTriggers", () => {
        onRelayouted();

        const triggers = onRelayouted.getTriggers();
        triggers.forEach(([signal]) => {
            if (signal) {
                expect(signal.connect).toHaveBeenCalled();
            }
        });
    });

    test("triggering a signal calls applyGapsAll", () => {
        onRelayouted();

        // Get the callback passed to connect for one of the signals
        const callback = workspace.currentDesktopChanged.connect.mock.calls[0][0];
        
        callback();

        expect(debug).toHaveBeenCalledWith("current desktop changed");
        expect(applyGapsAll).toHaveBeenCalled();
    });

    test("handles undefined outputOrderChanged gracefully", () => {
        const originalOutputOrderChanged = workspace.outputOrderChanged;
        workspace.outputOrderChanged = undefined;
        
        // Should not throw
        expect(() => onRelayouted()).not.toThrow();
        
        workspace.outputOrderChanged = originalOutputOrderChanged;
    });

    test("windowAdded only triggers for dock windows", () => {
        onRelayouted();

        const callback = workspace.windowAdded.connect.mock.calls[0][0];
        
        // Mock a normal window
        const normalWindow = { dock: false };
        callback(normalWindow);
        expect(applyGapsAll).not.toHaveBeenCalled();

        // Mock a dock window
        const dockWindow = { dock: true };
        callback(dockWindow);
        expect(debug).toHaveBeenCalledWith("dock added");
        expect(applyGapsAll).toHaveBeenCalled();
    });
});
