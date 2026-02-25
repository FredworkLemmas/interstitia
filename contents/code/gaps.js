/**
 * Apply gaps to all existing windows.
 */
function applyGapsAll() {
    console.log("interstitia: applyGapsAll triggered");
    const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
    allWindows.forEach(client => applyGaps(client));
}

/**
 * Apply gaps to a specific client and optionally update cascade.
 * @param {KWin.Window} client
 * @param {boolean} [updateCascade=false] - Whether to update cascade layout for the client's slot.
 */
function applyGaps(client, updateCascade = false) {

    // abort if there is a current iteration of gapping still running,
    // or if the client is null or irrelevant
    if (block || !client || ignoreClient(client)) return;

    // Skip if window is part of an active cascade and we are not explicitly updating cascade
    if (client.interstitia_cascade_data && client.interstitia_cascade_data.cascadeState && !updateCascade) {
        debug("applyGaps: skipping because window is in cascade state:", getWindowCaption(client));
        return;
    }

    // handle mouse drag or resize
    if (mouseDragOrResizeInProgress) {
        debug(
        "screen:", getWindowOutput(client), "x:",
            client.x, "y:", client.y,
            "width:", client.width,
            "height:", client.height);
        if (!mouseDragOrResizeStartingGeometry) {
            mouseDragOrResizeStartTime = Date.now();
            mouseDragOrResizeNumUpdates = 1;
            mouseDragOrResizeStartingGeometry = {
                'x': client.x,
                'y': client.y,
                'w': client.width,
                'h': client.height,
            };
        }

        debug(
            "apply gaps", getWindowCaption(client),
            config.includeMaximized, isMaximized(client), block,
            "mouseDrag:", mouseDragOrResizeInProgress);

        // return silently if it's only been less than 750ms since
        // we started dragging
        if (Date.now() - mouseDragOrResizeStartTime < 750) return;

        // return silently if the width and height are unchanged since
        // we started dragging (meaning the user is dragging and not
        // resizing the window)
        if (client.width == mouseDragOrResizeStartingGeometry.w &&
            client.height == mouseDragOrResizeStartingGeometry.h) return;

    }
    else if (mouseDragOrResizeStartingGeometry) {
        mouseDragOrResizeStartingGeometry = null;
    }
    // block applying other gaps as long as current iteration is running
    block = true;
    debug("----------------")
    debug("gaps for", getWindowCaption(client));
    debug("old geo", getWindowGeometry(client));

    const clientGeometries = workspace.windowList().reduce((acc, c) => {
        if (!ignoreClient(c)) {
            acc[c.internalId] = copyGeometry(c.frameGeometry);
        }
        return acc;
    }, {});

    applyGapsArea(client, clientGeometries);
    applyGapsWindows(client, clientGeometries);

    for (const c of workspace.windowList()) {
        if (c.internalId in clientGeometries && !geometriesEqual(c.frameGeometry, clientGeometries[c.internalId])) {
            debug("set geometry", getWindowCaption(c), getWindowGeometry(clientGeometries[c.internalId]));
            c.frameGeometry = clientGeometries[c.internalId];
        }
    }

    block = false;

    if (updateCascade) {
        debug("applyGaps: updateCascade is true for", getWindowCaption(client));
        applyCascade(client, clientGeometries[client.internalId]);
    }

    debug("");
}

/**
 * Compute and apply gaps based on the screen area and anchors.
 * @param {KWin.Window} client
 * @param {Object.<string, object>} clientGeometries - Map of windowId to geometry objects.
 */
function applyGapsArea(client, clientGeometries) {
    const clientGeometry = clientGeometries[client.internalId];
    let area = getArea(client);
    debug("area", getWindowGeometry(area));
    let grid = getGrid(client);
    let anchored = {"left": false, "right": false, "top": false, "bottom": false};
    let gridded = copyGeometry(clientGeometry);
    let edged = copyGeometry(clientGeometry);

    // Ensure we're working with calculated right/bottom values
    gridded.left = gridded.x;
    gridded.top = gridded.y;
    gridded.right = gridded.x + gridded.width;
    gridded.bottom = gridded.y + gridded.height;
    edged.left = edged.x;
    edged.top = edged.y;
    edged.right = edged.x + edged.width;
    edged.bottom = edged.y + edged.height;

    // unmaximize if maximized window gap
    if (config.includeMaximized && isMaximized(client)) {
        debug("unmaximize");
        client.setMaximize(false, false);
    }

    // for each window edge, if the edge is near some grid anchor of that edge,
    // set it to the gapped coordinate
    for (let i = 0; i < Object.keys(grid).length; i++) {
        let edge = Object.keys(grid)[i];
        for (let j = 0; j < Object.keys(grid[edge]).length; j++) {
            let pos = Object.keys(grid[edge])[j];
            let coords = grid[edge][pos];
            coords["win"] = clientGeometry[edge];
            if (nearArea(coords.win, coords.closed, coords.gapped, gap[edge])) {
                debug("gap to edge", edge, pos, coords.gapped);
                anchored[edge] = true;
                let diff = coords.gapped - coords.win;
                switch (edge) {

                    case "left":
                        gridded.x = Math.round(gridded.x + diff);
                        gridded.width = Math.round(gridded.width - diff);
                        gridded.right = gridded.x + gridded.width;
                        if (pos.startsWith("full")) {
                            edged.x = Math.round(edged.x + diff);
                            edged.width = Math.round(edged.width - diff);
                            edged.right = edged.x + edged.width;
                        }
                        break;

                    case "right":
                        gridded.width = Math.round(gridded.width + diff);
                        gridded.right = gridded.x + gridded.width;
                        if (pos.startsWith("full")) {
                            edged.width = Math.round(edged.width + diff);
                            edged.right = edged.x + edged.width;
                        }
                        break;

                    case "top":
                        gridded.y = Math.round(gridded.y + diff);
                        gridded.height = Math.round(gridded.height - diff);
                        gridded.bottom = gridded.y + gridded.height;
                        if (pos.startsWith("full")) {
                            edged.y = Math.round(edged.y + diff);
                            edged.height = Math.round(edged.height - diff);
                            edged.bottom = edged.y + edged.height;
                        }
                        break;

                    case "bottom":
                        gridded.height = Math.round(gridded.height + diff);
                        gridded.bottom = gridded.y + gridded.height;
                        if (pos.startsWith("full")) {
                            edged.height = Math.round(edged.height + diff);
                            edged.bottom = edged.y + edged.height;
                        }
                        break;

                    default:
                        break;
                }
                break;
            }
        }
    }
    // apply geo gapped on inner anchors if client is anchored on every side,
    // otherwise geo gapped on outer edges
    if (Object.keys(grid).every((edge) => anchored[edge]) && !geometriesEqual(clientGeometry, gridded)) {
        debug("set grid geometry", getWindowGeometry(gridded));
        clientGeometries[client.internalId] = gridded;
    } else if (!geometriesEqual(clientGeometry, edged)) {
        debug("set edge geometry", getWindowGeometry(edged));
        clientGeometries[client.internalId] = edged;
    }
}

/**
 * Adjust gaps between neighboring windows based on proximity and overlap.
 * @param {KWin.Window} client1 - The primary client being processed.
 * @param {Object.<string, object>} clientGeometries - Map of windowId to geometry objects.
 */
function applyGapsWindows(client1, clientGeometries) {
    let grid = getGrid(client1);
    let win1 = clientGeometries[client1.internalId];

    // Ensure calculated right/bottom values
    win1.left = win1.x;
    win1.top = win1.y;
    win1.right = win1.x + win1.width;
    win1.bottom = win1.y + win1.height;

    // for each other window, if they share an edge,
    // clip or extend both evenly to make the distance the size of the gap
    for (const client2 of workspace.windowList()) {
        if (!client2) continue;
        if (ignoreOther(client1, client2)) continue;

        debug("checking", client2.caption);
        debug(getWindowGeometry(client1), getWindowGeometry(client2));

        let win2 = clientGeometries[client2.internalId];
        // Ensure calculated right/bottom values
        win2.left = win2.x;
        win2.top = win2.y;
        win2.right = win2.x + win2.width;
        win2.bottom = win2.y + win2.height;
        for (let i = 0; i < Object.keys(grid).length; i++) {
            let edge = Object.keys(grid)[i];
            switch (edge) {

                case "left":
                    if (nearWindow(win1.x, win2.right, gap.mid) &&
                        overlapVer(win1, win2)) {
                        debug("gap to window", edge, getWindowCaption(client2), getWindowGeometry(client2));
                        let diff = win1.x - win2.right;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust right window left edge
                        win1.x = Math.round(win1.x - Math.floor(diff / 2) + halfGap);
                        win1.width = Math.round(win1.width + Math.floor(diff / 2) - halfGap);
                        win1.left = win1.x;
                        win1.right = win1.x + win1.width;
                        // Adjust left window right edge
                        win2.width = Math.round(win2.width + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win2.right = win2.x + win2.width;
                        debug("changed geo win1", getWindowGeometry(win1));
                        debug("changed geo win2", getWindowGeometry(win2));
                    }
                    break;

                case "right":
                    if (nearWindow(win2.x, win1.right, gap.mid) &&
                        overlapVer(win1, win2)) {
                        debug("gap to window", edge, getWindowCaption(client2), getWindowGeometry(client2));
                        let diff = win2.x - win1.right;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust left window right edge
                        win1.width = Math.round(win1.width + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win1.right = win1.x + win1.width;
                        // Adjust right window left edge
                        win2.x = Math.round(win2.x - Math.floor(diff / 2) + halfGap);
                        win2.width = Math.round(win2.width + Math.floor(diff / 2) - halfGap);
                        win2.left = win2.x;
                        win2.right = win2.x + win2.width;
                        debug("changed geo win1", getWindowGeometry(win1));
                        debug("changed geo win2", getWindowGeometry(win2));
                    }
                    break;

                case "top":
                    if (nearWindow(win1.y, win2.bottom, gap.mid) &&
                        overlapHor(win1, win2)) {
                        debug("gap to window", edge, getWindowCaption(client2), getWindowGeometry(client2));
                        let diff = win1.y - win2.bottom;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust bottom window top edge
                        win1.y = Math.round(win1.y - Math.floor(diff / 2) + halfGap);
                        win1.height = Math.round(win1.height + Math.floor(diff / 2) - halfGap);
                        win1.top = win1.y;
                        win1.bottom = win1.y + win1.height;
                        // Adjust top window bottom edge
                        win2.height = Math.round(win2.height + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win2.bottom = win2.y + win2.height;
                        debug("changed geo win1", getWindowGeometry(win1));
                        debug("changed geo win2", getWindowGeometry(win2));
                    }
                    break;

                case "bottom":
                    if (nearWindow(win2.y, win1.bottom, gap.mid) &&
                        overlapHor(win1, win2)) {
                        debug("gap to window", edge, getWindowCaption(client2), getWindowGeometry(client2));
                        let diff = win2.y - win1.bottom;
                        let halfGap = Math.floor(gap.mid / 2);
                        // Adjust top window bottom edge
                        win1.height = Math.round(win1.height + Math.ceil(diff / 2) - (gap.mid - halfGap));
                        win1.bottom = win1.y + win1.height;
                        // Adjust bottom window top edge
                        win2.y = Math.round(win2.y - Math.floor(diff / 2) + halfGap);
                        win2.height = Math.round(win2.height + Math.floor(diff / 2) - halfGap);
                        win2.top = win2.y;
                        win2.bottom = win2.y + win2.height;
                        debug("changed geo win1", getWindowGeometry(win1));
                        debug("changed geo win2", getWindowGeometry(win2));
                    }
                    break;
            }
        }

        clientGeometries[client1.internalId] = win1;
        clientGeometries[client2.internalId] = win2;
    }
}
