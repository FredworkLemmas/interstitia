/*
 Entry point for Interstitia after modularization
*/

// compatibility and startup
const isPlasma6 = typeof workspace.windowList === "function";
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
