const fs = require("fs");
const path = require("path");

// Mock global console
global.console = {
    log: jest.fn(),
    debug: jest.fn()
};

// Read and evaluate the 02_logging.js file in the global context
const loggingCode = fs.readFileSync(path.join(__dirname, "../contents/code/02_logging.js"), "utf8");
eval(loggingCode);

describe("02_logging.js", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("debug logs when debugMode is true", () => {
        global.debugMode = true;
        debug("test message");
        expect(console.log).toHaveBeenCalledWith("interstitia:", "test message");
    });

    test("debug does not log when debugMode is false", () => {
        global.debugMode = false;
        debug("test message");
        expect(console.log).not.toHaveBeenCalled();
    });

    test("fulldebug logs to console.debug when fullDebugMode is true", () => {
        global.fullDebugMode = true;
        fulldebug("test full debug");
        expect(console.debug).toHaveBeenCalledWith("interstitia:", "test full debug");
    });

    test("fulldebug does not log when fullDebugMode is false", () => {
        global.fullDebugMode = false;
        fulldebug("test full debug");
        expect(console.debug).not.toHaveBeenCalled();
    });
});
