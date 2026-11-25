// load configuration and connect to changes in Plasma 6
loadConfig();
if (workspace.configChanged !== undefined) {
    workspace.configChanged.connect(() => {
        console.log("interstitia: config changed signal received");
        loadConfig();
        coordinator.applyGapsAll();
    });
}

// attempt to register shortcut
if (typeof registerShortcut === "undefined") {
    console.log("interstitia: registerShortcut is UNDEFINED");
} else {
    console.log("interstitia: registering shortcuts");
    try {
        registerShortcut("interstitia_start_cascade", "Interstitia: Start Cascade", "Ctrl+}", () => {
            const active = ActiveWindow.getActive();
            if (active) active.startCascade();
        });
        registerShortcut("interstitia_stop_cascade", "Interstitia: Stop Cascade", "Ctrl+{", () => {
            const active = ActiveWindow.getActive();
            if (active) active.stopCascade();
        });
        console.log("interstitia: shortcuts registered successfully (Ctrl+}, Ctrl+{)");
    } catch (e) {
        console.log("interstitia: error registering shortcuts:", e);
    }
}

// Focusing a background window of a cascade group rotates the group to it.
workspace.windowActivated.connect((client) => coordinator.cascades.onWindowActivated(client));

// init interstitia environment
debug("initializing interstitia");
const initialWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
initialWindows.forEach((client) => TileableWindow.get(client).initialize());
workspace.windowAdded.connect((client) => TileableWindow.get(client).initialize());

// Take closed windows out of every cascade group they were in, and forget them.
workspace.windowRemoved.connect((client) => {
    const tw = TileableWindow._instances.get(client.internalId);
    if (!tw) return;
    debug("windowRemoved:", tw.getCaption());
    coordinator.cascades.removeWindow(tw);
    TileableWindow._instances.delete(client.internalId);
});

// refresh tiling state
onRelayouted();
