/**
 * Connect workspace-wide relayout triggers to re-apply gaps.
 */
function onRelayouted() {
    /**
     * Helper to connect a signal to a debug message and applyGapsAll.
     */
    const trigger = (signal, message, condition = () => true) => {
        if (signal === undefined) return;
        signal.connect((...args) => {
            if (condition(...args)) {
                debug(message);
                // Lay out the cascade groups of whatever now shows, then gap the rest.
                if (coordinator.cascades) coordinator.cascades.layoutContext();
                coordinator.applyGapsAll();
            }
        });
    };

    onRelayouted.getTriggers().forEach(([signal, message, condition]) => trigger(signal, message, condition));
}

/**
 * Expose triggers for testing or external inspection.
 */
onRelayouted.getTriggers = () => [
    [workspace.currentDesktopChanged, "current desktop changed"],
    [workspace.desktopLayoutChanged, "desktop layout changed"],
    [workspace.desktopsChanged, "desktops changed"],
    [workspace.screensChanged, "screens changed"],
    [workspace.currentActivityChanged, "current activity changed"],
    [workspace.activitiesChanged, "activities changed"],
    [workspace.virtualScreenSizeChanged, "virtual screen size changed"],
    [workspace.virtualScreenGeometryChanged, "virtual screen geometry changed"],
    [workspace.outputOrderChanged, "output order changed"],
    [workspace.windowAdded, "dock added", (client) => client.dock],
];
