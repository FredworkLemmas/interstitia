// load configuration and connect to changes in Plasma 6
loadConfig();
if (workspace.configChanged !== undefined) {
    workspace.configChanged.connect(() => {
        console.log("interstitia: config changed signal received");
        loadConfig();
        TileableWindow.applyGapsAll();
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

// event wiring ???
workspace.windowActivated.connect((client) => {
    if (!client) return;
});

// init interstitia environment
debug("initializing interstitia");
const initialWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
initialWindows.forEach((client) => TileableWindow.get(client).initialize());
workspace.windowAdded.connect((client) => TileableWindow.get(client).initialize());

// Remove closed windows from any cascade group they belonged to.
workspace.windowRemoved.connect((client) => {
    const key = client.interstitia_cascadeSlotKey;
    if (key) {
        const tw = TileableWindow.get(client);
        if (tw) {
            debug("windowRemoved: removing closed window from cascade group", key, tw.getCaption());
            TileableWindow.removeFromCascadeGroup(tw, key);
        }
    }
});

// refresh tiling state
onRelayouted();
