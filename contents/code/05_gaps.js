/**
 * Apply gaps to all existing windows.
 */
function applyGapsAll() {
    console.log("interstitia: applyGapsAll triggered");
    const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
    allWindows.forEach((client) => TileableWindow.get(client).applyGaps());
}
