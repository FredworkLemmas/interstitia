/**
 * Handle a newly added window: apply gaps and set up signals.
 * @param {KWin.Window} client
 */
function onAdded(client) {
    debug("added", getWindowCaption(client));
    applyGaps(client);

    onRegeometrized(client);
    setupMouseDragTracking(client);
}

/**
 * Track user interactive move/resize to avoid over-applying gaps during drags.
 * @param {KWin.Window} client
 */
function setupMouseDragTracking(client) {
    // Track when interactive move/resize starts (mouse drag begins)
    client.interactiveMoveResizeStarted.connect(() => {
        debug("interactive move/resize started (mouse drag detected)", getWindowCaption(client));
        mouseDragOrResizeInProgress = true;
    });

    // Track when interactive move/resize finishes (mouse drag ends)
    client.interactiveMoveResizeFinished.connect(() => {
        debug("interactive move/resize finished (mouse drag ended)", getWindowCaption(client));
        mouseDragOrResizeInProgress = false;
    });
}

/**
 * Wire signals related to geometry changes to keep gaps and cascade in sync.
 * @param {KWin.Window} client
 */
function onRegeometrized(client) {

    client.moveResizedChanged.connect(() => {
        debug("move resized changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.frameGeometryChanged.connect(() => {
        debug("frame geometry changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    // When interactive move/resize finishes, wait briefly then apply gaps
    // This ensures the drag flag is cleared before we apply gaps
    client.interactiveMoveResizeFinished.connect(() => {
        debug("finish user moved resized", getWindowCaption(client));
        // Small delay to ensure mouseDragInProgress is set to false first
        workspace.slotWindowClose.connect(() => {});  // Dummy to ensure event loop processes
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.fullScreenChanged.connect(() => {
        debug("fullscreen changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.maximizedChanged.connect(() => {
        debug("maximized changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.minimizedChanged.connect(() => {
        debug("unminimized", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.quickTileModeChanged.connect(() => {
        debug("tile mode changed", getWindowCaption(client));
        debug("triggering cascade check for", getWindowCaption(client), "due to tile change");
        applyGaps(client, true);
    });
    client.tileChanged.connect(() => {
        debug("tile changed", getWindowCaption(client));
        debug("triggering cascade check for", getWindowCaption(client), "due to tile change");
        applyGaps(client, true);
    });
    client.desktopsChanged.connect(() => {
        debug("desktops changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
    client.activitiesChanged.connect(() => {
        debug("activities changed", getWindowCaption(client));
        removeCascadeIfNotApplying(client);
        applyGaps(client);
    });
}

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
