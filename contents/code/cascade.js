/**
 * Begin cascading windows that share the same slot as the active window.
 */
function startCascade() {
    debug("startCascade shortcut triggered");
    const group = selectSameSlotWindows();
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("startCascade: no active window");
        return;
    }

    debug("startCascade: enabling cascade state for group of", group.length);
    group.forEach(window => {
        if (!window.interstitia_cascade_data) {
            window.interstitia_cascade_data = {};
        }
        window.interstitia_cascade_data.cascadeState = true;
        window.interstitia_cascade_data.timestamp = Date.now();
    });

    applyCascadeGroup(activeWindow, group.filter(w => w !== activeWindow));
}

/**
 * Stop cascading windows that share the same slot as the active window.
 */
function stopCascade() {
    debug("stopCascade shortcut triggered");
    const group = selectSameSlotWindows();
    const activeWindow = workspace.activeWindow || workspace.activeClient;
    if (!activeWindow) {
        debug("stopCascade: no active window");
        return;
    }
    debug("stopCascade: disabling cascade state for group of", group.length);
    group.forEach(window => {
        if (!window.interstitia_cascade_data) {
            window.interstitia_cascade_data = {};
        }
        window.interstitia_cascade_data.cascadeState = false;
        window.interstitia_cascade_data.timestamp = Date.now();
    });

    applyCascadeGroup(activeWindow, group.filter(w => w !== activeWindow));
}

/**
 * Update cascade metadata for a client and apply cascade to its slot group.
 * @param {KWin.Window} client
 * @param {{x:number,y:number,width:number,height:number}} applyGapsGeometry
 */
function applyCascade(client, applyGapsGeometry) {
    if (!client) return;

    if (!client.interstitia_cascade_data) {
        client.interstitia_cascade_data = {};
    }

    client.interstitia_cascade_data.activities = client.activities;
    client.interstitia_cascade_data.desktops = client.desktops;
    client.interstitia_cascade_data.screen = getWindowOutput(client);
    client.interstitia_cascade_data.applyGapsGeometry = copyGeometry(applyGapsGeometry);
    if (client.interstitia_cascade_data.cascadeState === undefined) {
        client.interstitia_cascade_data.cascadeState = false;
    }
    client.interstitia_cascade_data.timestamp = Date.now();

    const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
    const otherClients = [];

    allWindows.forEach(other => {
        if (other === client) return;
        if (ignoreClient(other)) return;

        const otherGeometry = isPlasma6 ? other.frameGeometry : other.geometry;
        if (onSameDesktop(client, other) &&
            isOnSameActivity(client, other) &&
            getWindowOutput(client) === getWindowOutput(other) &&
            geometriesNearlyEqual(applyGapsGeometry, otherGeometry)) {
            otherClients.push(other);
        }
    });

    debug("applyCascade: found group of", otherClients.length + 1, "windows for slot");
    applyCascadeGroup(client, otherClients);
}

/**
 * Remove cascade metadata if cascade is no longer being applied.
 * @param {KWin.Window} client
 */
function removeCascadeIfNotApplying(client) {
    if (!client || !client.interstitia_cascade_data) return;

    // If cascadeState is true, we keep it until explicitly stopped or window moved out of slot
    if (client.interstitia_cascade_data.cascadeState) {
        return;
    }

    const timeout = 500;

    const timer = new QTimer();
    timer.interval = timeout;
    timer.singleShot = true;
    timer.timeout.connect(() => {
        if (client.interstitia_cascade_data && (Date.now() - client.interstitia_cascade_data.timestamp >= timeout)) {
            debug("removeCascadeIfNotApplying: clearing cascade data for", getWindowCaption(client));
            delete client.interstitia_cascade_data;
        }
    });
    timer.start();
}

/**
 * Apply the cascaded geometries to a group of windows sharing a slot.
 * @param {KWin.Window} client - The primary client (will be on top).
 * @param {KWin.Window[]} otherClients - The other clients in the group.
 */
function applyCascadeGroup(client, otherClients) {
    const group = [client].concat(otherClients);
    const hasCascade = group.some(c => c.interstitia_cascade_data && c.interstitia_cascade_data.cascadeState);

    // We need the applyGapsGeometry. If we are called from start/stopCascade, we might need to find it.
    let applyGapsGeometry = client.interstitia_cascade_data ? client.interstitia_cascade_data.applyGapsGeometry : null;

    if (!applyGapsGeometry) {
        // Fallback to current frameGeometry if not set
        applyGapsGeometry = copyGeometry(isPlasma6 ? client.frameGeometry : client.geometry);
    }

    if (!hasCascade) {
        debug("applyCascadeGroup: cascade is disabled, resetting geometries for slot");
        group.forEach(c => {
            c.frameGeometry = copyGeometry(applyGapsGeometry);
        });
        return;
    }

    const offset = 32;
    const numWindows = group.length;
    const newWidth = applyGapsGeometry.width - (offset * (numWindows - 1));
    const newHeight = applyGapsGeometry.height - (offset * (numWindows - 1));

    debug("applyCascadeGroup: cascading", numWindows, "windows with offset", offset);

    // Filter out the primary client for initial positioning
    const others = group.filter(c => c !== client);

    // Position the primary client last (on top)
    const clientGeo = {
        x: applyGapsGeometry.x + (others.length * offset),
        y: applyGapsGeometry.y + (others.length * offset),
        width: newWidth,
        height: newHeight
    };
    debug("positioning primary cascaded window:", getWindowCaption(client), "on top at", clientGeo.x, clientGeo.y);
    
    // Set block to true to prevent frameGeometryChanged from triggering applyGaps recursively
    block = true;
    try {
        // Re-applying to all in group
        others.forEach((c, index) => {
             const newGeo = {
                x: applyGapsGeometry.x + (index * offset),
                y: applyGapsGeometry.y + (index * offset),
                width: newWidth,
                height: newHeight
            };
            debug("positioning cascaded window:", getWindowCaption(c), "at", newGeo.x, newGeo.y);
            c.frameGeometry = newGeo;
            workspace.activeWindow = c;
        });
        client.frameGeometry = clientGeo;
    } finally {
        block = false;
    }

    // Raise the primary client
    workspace.activeWindow = client;
}
