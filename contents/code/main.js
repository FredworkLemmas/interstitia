/*
 Entry point for Interstitia after modularization
*/

// compatibility and startup
const isPlasma6 = (typeof workspace.windowList === 'function');
console.log("interstitia: main.js execution started, isPlasma6:", isPlasma6);
console.log("interstitia: main.js execution started at " + new Date().toISOString());

// debug flags must be defined before logging/config modules
var debugMode = true;
var fullDebugMode = false;

// global control flags/state
var block = false;
var mouseDragOrResizeInProgress = false;
var mouseDragOrResizeStartingGeometry = null;
var mouseDragOrResizeStartTime = null;
var mouseDragOrResizeNumUpdates = null;

// include modules (relative to this file)
include("logging.js");
include("config.js");
include("windowing.js");
include("gaps.js");
include("cascade.js");
include("reaction.js");

// load configuration and connect to changes in Plasma 6
loadConfig();
if (workspace.configChanged !== undefined) {
    workspace.configChanged.connect(() => {
        console.log("interstitia: config changed signal received");
        loadConfig();
        applyGapsAll();
    });
}

// initialization
debug("initializing");

debug("");

if (typeof registerShortcut === 'undefined') {
    console.log("interstitia: registerShortcut is UNDEFINED");
} else {
    console.log("interstitia: registering shortcuts");
    try {
        registerShortcut("interstitia_start_cascade", "Interstitia: Start Cascade", "Ctrl+}", startCascade);
        registerShortcut("interstitia_stop_cascade", "Interstitia: Stop Cascade", "Ctrl+{", stopCascade);
        console.log("interstitia: shortcuts registered successfully (Ctrl+}, Ctrl+{)");
    } catch (e) {
        console.log("interstitia: error registering shortcuts:", e);
    }
}

// event wiring
workspace.windowActivated.connect(client => {
    if (!client) return;
    // debug(getWindowCaption(client), getWindowGeometry(client));
});

const initialWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
initialWindows.forEach(client => onAdded(client));
workspace.windowAdded.connect(onAdded);

onRelayouted();
