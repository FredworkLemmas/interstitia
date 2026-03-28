/**
 * Connect workspace-wide relayout triggers to re-apply gaps.
 */
function onRelayouted() {
    workspace.currentDesktopChanged.connect(() => {
        debug("current desktop changed");
        applyGapsAll();
    });
    workspace.desktopLayoutChanged.connect(() => {
        debug("desktop layout changed");
        applyGapsAll();
    });
    workspace.desktopsChanged.connect(() => {
        debug("desktops changed");
        applyGapsAll();
    });
    workspace.screensChanged.connect(() => {
        debug("screens changed");
        applyGapsAll();
    });
    workspace.currentActivityChanged.connect(() => {
        debug("current activity changed");
        applyGapsAll();
    });
    workspace.activitiesChanged.connect(() => {
        debug("activities changed");
        applyGapsAll();
    });
    workspace.virtualScreenSizeChanged.connect(() => {
        debug("virtual screen size changed");
        applyGapsAll();
    });
    workspace.virtualScreenGeometryChanged.connect(() => {
        debug("virtual screen geometry changed");
        applyGapsAll();
    });
    workspace.windowAdded.connect((client) => {
        if (client.dock) {
            debug("dock added");
            applyGapsAll();
        }
    });
    if (workspace.outputOrderChanged !== undefined) {
        workspace.outputOrderChanged.connect(() => {
            debug("output order changed");
            applyGapsAll();
        });
    }
}
