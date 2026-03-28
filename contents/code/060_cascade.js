/**
 * Begin cascading windows that share the same slot as the active window.
 */
function startCascade() {
    debug("startCascade shortcut triggered");
    const group = selectSameSlotWindows(); // now returns TileableWindow[]
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("startCascade: no active window");
        return;
    }

    debug("startCascade: enabling cascade state for group of", group.length);
    group.forEach((tw) => {
        if (!tw.window.interstitia_cascade_data) {
            tw.window.interstitia_cascade_data = {};
        }
        tw.window.interstitia_cascade_data.cascadeState = true;
        tw.window.interstitia_cascade_data.timestamp = Date.now();
    });

    const twActive = TileableWindow.get(activeWindow);
    twActive.applyCascadeGroup(
        group.filter((tw) => tw !== twActive).map((tw) => tw.window),
    );
}

/**
 * Stop cascading windows that share the same slot as the active window.
 */
function stopCascade() {
    debug("stopCascade shortcut triggered");
    const group = selectSameSlotWindows(); // now returns TileableWindow[]
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("stopCascade: no active window");
        return;
    }
    debug("stopCascade: disabling cascade state for group of", group.length);
    group.forEach((tw) => {
        if (!tw.window.interstitia_cascade_data) {
            tw.window.interstitia_cascade_data = {};
        }
        tw.window.interstitia_cascade_data.cascadeState = false;
        tw.window.interstitia_cascade_data.timestamp = Date.now();
    });

    const twActive = TileableWindow.get(activeWindow);
    twActive.applyCascadeGroup(
        group.filter((tw) => tw !== twActive).map((tw) => tw.window),
    );
}
