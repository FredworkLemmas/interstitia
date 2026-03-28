/**
 * WindowCoordinator Class (Singleton)
 * Manages shared global state previously held in global variables.
 * It coordinates behavior across all TileableWindow instances, such as
 * blocking updates during manual operations or tracking mouse-driven resizing.
 */
class WindowCoordinator {
    /**
     * Initializes the singleton instance if it doesn't exist.
     * Sets default flags for update blocking and resize tracking.
     */
    constructor() {
        if (WindowCoordinator.instance) {
            return WindowCoordinator.instance;
        }
        /** @type {boolean} Prevents recursive or unwanted gap applications. */
        this.block = false;
        /** @type {boolean} Tracks if the user is currently dragging or resizing a window. */
        this.mouseDragOrResizeInProgress = false;
        /**
         * Central cascade registry.
         * Map<slotKey, { slotGeometry: TileableWindowGeometry, members: string[], output }>
         * slotKey is "x,y,w,h" of the gapped slot geometry.
         * members is an ordered array of window internalIds; last member is on top.
         */
        this.cascadeGroups = new Map();
        WindowCoordinator.instance = this;
    }

    /**
     * Returns the singleton instance of WindowCoordinator.
     * @returns {WindowCoordinator} The singleton instance.
     */
    static getInstance() {
        if (!WindowCoordinator.instance) {
            new WindowCoordinator();
        }
        return WindowCoordinator.instance;
    }
}

if (typeof global !== "undefined") {
    global.WindowCoordinator = WindowCoordinator;
}

const coordinator = WindowCoordinator.getInstance();

if (typeof global !== "undefined") {
    global.coordinator = coordinator;
}

/**
 * TileableWindow Class
 * Encapsulates all window-specific logic for tiling and gapping.
 * This class provides methods to calculate work areas, check for overlaps,
 * apply gap constraints, and handle window cascading.
 */
class TileableWindow {
    /**
     * Factory method to get or create a TileableWindow instance for a KWin window.
     * Ensures that only one TileableWindow wrapper exists for each unique KWin window.
     * @param {KWin.Window} window - The underlying KWin window object.
     * @returns {TileableWindow|null} The cached or new TileableWindow instance.
     */
    static get(window) {
        if (!window) return null;
        const id = window.internalId;
        if (!TileableWindow._instances.has(id)) {
            TileableWindow._instances.set(id, new TileableWindow(window));
        }
        return TileableWindow._instances.get(id);
    }

    /**
     * @param {KWin.Window} window - The underlying KWin window object.
     */
    constructor(window) {
        /** @type {KWin.Window} The wrapped KWin window object. */
        this.window = window;
    }

    /**
     * Determine if a coordinate is near an anchor position.
     * @param {number} actual
     * @param {number} expected_closed
     * @param {number} expected_gapped
     * @param {number} gapSize
     * @returns {boolean}
     */
    static nearArea(actual, expected_closed, expected_gapped, gapSize) {
        let tolerance = gapSize + 2;
        return Math.abs(actual - expected_closed) <= tolerance || Math.abs(actual - expected_gapped) <= tolerance;
    }

    /**
     * Determine if a gap between two coordinates is near the expected gap.
     * @param {number} v1
     * @param {number} v2
     * @param {number} gapSize
     * @returns {boolean}
     */
    static nearWindow(v1, v2, gapSize) {
        let tolerance = gapSize + 5;
        let actualGap = Math.abs(v1 - v2);
        return actualGap <= tolerance && Math.abs(actualGap - gapSize) > 1;
    }

    /**
     * Horizontal overlap check with tolerance.
     * @param {object} geo1
     * @param {object} geo2
     * @returns {boolean}
     */
    static overlapHor(geo1, geo2) {
        let tolerance = 2 * gap.mid;
        return (
            (geo1.left <= geo2.left + tolerance && geo1.right > geo2.left + tolerance) ||
            (geo2.left <= geo1.left + tolerance && geo2.right + tolerance > geo1.left)
        );
    }

    /**
     * Vertical overlap check with tolerance.
     * @param {object} geo1
     * @param {object} geo2
     * @returns {boolean}
     */
    static overlapVer(geo1, geo2) {
        let tolerance = 2 * gap.mid;
        return (
            (geo1.top <= geo2.top + tolerance && geo1.bottom > geo2.top + tolerance) ||
            (geo2.top <= geo1.top + tolerance && geo2.bottom + tolerance > geo1.top)
        );
    }

    /**
     * Apply gaps to all existing windows.
     */
    static applyGapsAll() {
        if (typeof console !== "undefined") {
            console.log("interstitia: applyGapsAll triggered");
        }
        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        allWindows.forEach((client) => TileableWindow.get(client).applyGaps());
    }

    // --- Cascade Registry Helpers ---

    /**
     * Produce a stable slot key string from a geometry object.
     * @param {object} geo
     * @returns {string}
     */
    static slotKey(geo) {
        return `${Math.round(geo.x)},${Math.round(geo.y)},${Math.round(geo.width)},${Math.round(geo.height)}`;
    }

    /**
     * Find a TileableWindow by internalId by scanning the window list.
     * @param {string} internalId
     * @returns {TileableWindow|null}
     */
    static getById(internalId) {
        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        for (const w of allWindows) {
            if (w.internalId === internalId) return TileableWindow.get(w);
        }
        return null;
    }

    /**
     * Remove a window from its cascade group. Auto-dissolves the group if only one member remains.
     * @param {TileableWindow} tw
     * @param {string} key
     */
    static removeFromCascadeGroup(tw, key) {
        const group = coordinator.cascadeGroups.get(key);
        if (!group) return;
        const id = tw.window.internalId;
        group.members = group.members.filter((mid) => mid !== id);
        delete tw.window.interstitia_cascadeSlotKey;
        debug("removeFromCascadeGroup: removed", tw.getCaption(), "from group", key, "remaining:", group.members.length);
        if (group.members.length <= 1) {
            TileableWindow.dissolveCascadeGroup(key);
        } else {
            TileableWindow.reapplyCascade(key, null);
        }
    }

    /**
     * Add a window to an existing cascade group, placing it on top, and re-cascade.
     * @param {TileableWindow} tw
     * @param {string} key
     */
    static addToCascadeGroup(tw, key) {
        const group = coordinator.cascadeGroups.get(key);
        if (!group) return;
        const id = tw.window.internalId;
        if (!group.members.includes(id)) {
            group.members.push(id);
        }
        tw.window.interstitia_cascadeSlotKey = key;
        debug("addToCascadeGroup: added", tw.getCaption(), "to group", key);
        TileableWindow.reapplyCascade(key, id);
    }

    /**
     * Dissolve a cascade group: restore all members to the slot geometry and delete the group.
     * @param {string} key
     */
    static dissolveCascadeGroup(key) {
        const group = coordinator.cascadeGroups.get(key);
        if (!group) return;
        const slotGeo = group.slotGeometry;
        debug("dissolveCascadeGroup: dissolving group", key, "restoring", group.members.length, "windows");
        coordinator.block = true;
        try {
            group.members.forEach((id) => {
                const tw = TileableWindow.getById(id);
                if (tw) {
                    delete tw.window.interstitia_cascadeSlotKey;
                    tw.window.frameGeometry = {
                        x: slotGeo.x,
                        y: slotGeo.y,
                        width: slotGeo.width,
                        height: slotGeo.height,
                    };
                }
            });
        } finally {
            coordinator.block = false;
        }
        coordinator.cascadeGroups.delete(key);
    }

    /**
     * Apply the cascade offset layout to all members of a group.
     * Members are laid out bottom-to-top in array order; activeId goes last (on top).
     * @param {string} key
     * @param {string|null} activeId - internalId of the window to place on top, or null to keep current order.
     */
    static reapplyCascade(key, activeId) {
        const group = coordinator.cascadeGroups.get(key);
        if (!group) return;
        const slotGeo = group.slotGeometry;
        const members = group.members;
        const numWindows = members.length;
        if (numWindows === 0) return;
        const offset = 32;
        const newWidth = slotGeo.width - offset * (numWindows - 1);
        const newHeight = slotGeo.height - offset * (numWindows - 1);

        // Active window goes last (on top, furthest right/down)
        const ordered = activeId
            ? members.filter((id) => id !== activeId).concat([activeId])
            : members.slice();

        debug("reapplyCascade: laying out", numWindows, "windows for group", key);

        coordinator.block = true;
        try {
            ordered.forEach((id, index) => {
                const tw = TileableWindow.getById(id);
                if (!tw) return;
                const newGeo = {
                    x: slotGeo.x + index * offset,
                    y: slotGeo.y + index * offset,
                    width: newWidth,
                    height: newHeight,
                };
                debug("reapplyCascade: positioning", tw.getCaption(), "at index", index, newGeo.x, newGeo.y);
                tw.window.frameGeometry = newGeo;
                if (id !== activeId) {
                    workspace.activeWindow = tw.window;
                }
            });
        } finally {
            coordinator.block = false;
        }

        if (activeId) {
            const activeTw = TileableWindow.getById(activeId);
            if (activeTw) workspace.activeWindow = activeTw.window;
        }
    }

    // --- Utilities (from 04_windowing.js) ---

    /**
     * Detects the output (screen) the window is currently on.
     * Supports both Plasma 5 (screen) and Plasma 6 (output) properties.
     * @returns {object|number|null} The output identifier.
     */
    getOutput() {
        if (this.window.output !== undefined) return this.window.output;
        if (this.window.screen !== undefined) return this.window.screen;
        return null;
    }

    /**
     * Gets the list of desktops the window is currently assigned to.
     * @returns {number[]} Array of desktop identifiers.
     */
    getDesktops() {
        if (this.window.desktops !== undefined) return this.window.desktops;
        if (this.window.desktop !== undefined) return [this.window.desktop];
        return [];
    }

    /**
     * Checks if this window is on the same output as another.
     * @param {TileableWindow|KWin.Window} other - The other window to compare.
     * @returns {boolean} True if they share the same output.
     */
    isOnSameOutput(other) {
        const otherWin = other instanceof TileableWindow ? other : TileableWindow.get(other);
        return this.getOutput() == otherWin.getOutput();
    }

    /**
     * Checks if this window is on the same desktop as another.
     * Accounts for windows that are present on all desktops.
     * @param {TileableWindow|KWin.Window} other - The other window to compare.
     * @returns {boolean} True if they share at least one desktop or either is on all desktops.
     */
    isOnSameDesktop(other) {
        const otherWin = other instanceof TileableWindow ? other : TileableWindow.get(other);
        if (this.window.onAllDesktops || otherWin.window.onAllDesktops) return true;
        const desktops1 = this.getDesktops();
        const desktops2 = otherWin.getDesktops();
        for (let d1 of desktops1) {
            for (let d2 of desktops2) {
                if (d1 == d2) return true;
            }
        }
        return false;
    }

    /**
     * Checks if this window is on the same activity as another.
     * @param {TileableWindow|KWin.Window} other - The other window to compare.
     * @returns {boolean} True if they share at least one activity.
     */
    isOnSameActivity(other) {
        const otherWin = other instanceof TileableWindow ? other : TileableWindow.get(other);
        const activities1 = this.window.activities;
        const activities2 = otherWin.window.activities;
        if (!activities1 || !activities2) return true;
        for (let a1 of activities1) {
            for (let a2 of activities2) {
                if (a1 == a2) return true;
            }
        }
        return false;
    }

    /**
     * Returns the work area (excluding panels) available for this window's output.
     * @returns {QRect} The available maximize area.
     */
    getWorkArea() {
        return workspace.clientArea(KWin.MaximizeArea, this.window);
    }

    /**
     * Calculates the "anchors" or grid positions for the window edges based on
     * configuration (gaps) and workspace geometry. These anchors define where
     * window edges should snap to (e.g., full left, half screen, etc.).
     * @returns {object} Nested object with left, right, top, and bottom anchor definitions.
     */
    getGridAnchors() {
        let area = this.getWorkArea();
        let unmaximized = !this.isMaximized();
        return {
            left: {
                fullLeft: {
                    closed: Math.round(area.left),
                    gapped: Math.round(area.left + gap.left - (panel.left && unmaximized ? gap.left : 0)),
                },
                quarterLeft: {
                    closed: Math.round(area.left + 1 * (area.width / 4)),
                    gapped: Math.round(area.left + (1 * (area.width + gap.left - gap.right + gap.mid)) / 4),
                },
                halfHorizontal: {
                    closed: Math.round(area.left + area.width / 2),
                    gapped: Math.round(area.left + (area.width + gap.left - gap.right + gap.mid) / 2),
                },
                quarterRight: {
                    closed: Math.round(area.left + 3 * (area.width / 4)),
                    gapped: Math.round(area.left + (3 * (area.width + gap.left - gap.right + gap.mid)) / 4),
                },
            },
            right: {
                quarterLeft: {
                    closed: Math.round(area.right - 3 * (area.width / 4)),
                    gapped: Math.round(area.right - (3 * (area.width + gap.left - gap.right + gap.mid)) / 4),
                },
                halfHorizontal: {
                    closed: Math.round(area.right - area.width / 2),
                    gapped: Math.round(area.right - (area.width + gap.left - gap.right + gap.mid) / 2),
                },
                quarterRight: {
                    closed: Math.round(area.right - 1 * (area.width / 4)),
                    gapped: Math.round(area.right - (1 * (area.width + gap.left - gap.right + gap.mid)) / 4),
                },
                fullRight: {
                    closed: Math.round(area.right),
                    gapped: Math.round(area.right - gap.right + (panel.right && unmaximized ? gap.right : 0)),
                },
            },
            top: {
                fullTop: {
                    closed: Math.round(area.top),
                    gapped: Math.round(area.top + gap.top - (panel.top && unmaximized ? gap.top : 0)),
                },
                quarterTop: {
                    closed: Math.round(area.top + 1 * (area.height / 4)),
                    gapped: Math.round(area.top + (1 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
                },
                halfVertical: {
                    closed: Math.round(area.top + area.height / 2),
                    gapped: Math.round(area.top + (area.height + gap.top - gap.bottom + gap.mid) / 2),
                },
                quarterBottom: {
                    closed: Math.round(area.top + 3 * (area.height / 4)),
                    gapped: Math.round(area.top + (3 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
                },
            },
            bottom: {
                quarterTop: {
                    closed: Math.round(area.bottom - 3 * (area.height / 4)),
                    gapped: Math.round(area.bottom - (3 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
                },
                halfVertical: {
                    closed: Math.round(area.bottom - area.height / 2),
                    gapped: Math.round(area.bottom - (area.height + gap.top - gap.bottom + gap.mid) / 2),
                },
                quarterBottom: {
                    closed: Math.round(area.bottom - 1 * (area.height / 4)),
                    gapped: Math.round(area.bottom - (1 * (area.height + gap.top - gap.bottom + gap.mid)) / 4),
                },
                fullBottom: {
                    closed: Math.round(area.bottom),
                    gapped: Math.round(area.bottom - gap.bottom + (panel.bottom && unmaximized ? gap.bottom : 0)),
                },
            },
        };
    }

    /**
     * Determines if the window should be ignored by the tiling logic.
     * Reasons for ignoring include: being a special window (dock, splash), being
     * fullscreen, being maximized (depending on config), or matching the exclude/include list.
     * @returns {boolean} True if the window should be ignored.
     */
    shouldIgnore() {
        return (
            !this.window ||
            !this.window.normalWindow ||
            !this.window.resizeable ||
            this.window.fullScreen ||
            (!config.includeMaximized && this.isMaximized()) ||
            (config.excludeMode && config.applications.includes(String(this.window.resourceClass))) ||
            (config.includeMode && !config.applications.includes(String(this.window.resourceClass)))
        );
    }

    /**
     * Determines if another window should be ignored when calculating gaps relative to this one.
     * @param {TileableWindow|KWin.Window} other - The other window to check.
     * @returns {boolean} True if the other window should be ignored.
     */
    shouldIgnoreOther(other) {
        const otherWin = other instanceof TileableWindow ? other : TileableWindow.get(other);
        return (
            otherWin.shouldIgnore() ||
            otherWin === this ||
            !this.isOnSameDesktop(otherWin) ||
            !this.isOnSameOutput(otherWin) ||
            otherWin.window.minimized
        );
    }

    /**
     * Gets the window's caption (title).
     * @returns {string|null} The caption or null if window is invalid.
     */
    getCaption() {
        return this.window ? this.window.caption : null;
    }

    /**
     * Checks if the window is currently maximized by comparing its geometry to the work area.
     * @returns {boolean} True if the window is maximized.
     */
    isMaximized() {
        return new TileableWindowGeometry(this.window.frameGeometry).equals(workspace.clientArea(KWin.MaximizeArea, this.window));
    }

    // --- Cascade State ---

    /**
     * Returns the cascade group this window belongs to, or null if not in a cascade.
     * @returns {{slotGeometry, members: string[], output}|null}
     */
    getCascadeGroup() {
        const key = this.window.interstitia_cascadeSlotKey;
        if (!key) return null;
        return coordinator.cascadeGroups.get(key) || null;
    }

    /**
     * Returns true if this window is currently a member of a cascade group.
     * @returns {boolean}
     */
    isInCascade() {
        return this.getCascadeGroup() !== null;
    }

    // --- Gap Logic (from 05_gaps.js) ---

    /**
     * Main entry point for applying gaps to the window.
     * Orchestrates the calculation and application of gaps against both screen edges and other windows.
     * @param {boolean} [updateCascade=false] - Whether to trigger a cascade update after applying gaps.
     */
    applyGaps(updateCascade = false) {
        if (coordinator.block || !this.window || this.shouldIgnore()) return;

        if (this.isInCascade() && !updateCascade) {
            debug("applyGaps: skipping because window is in cascade state:", this.getCaption());
            return;
        }

        // Both quickTileModeChanged and tileChanged fire applyGaps(true) for the same tile op.
        // After the first call runs reapplyCascade, the window is at its cascade-offset position.
        // The second call would then read that offset position and compute wrong gaps.
        // Use a 0ms QTimer to debounce: only the first call processes, the second is skipped.
        if (this.isInCascade() && updateCascade) {
            if (this._cascadeUpdateDebouncing) {
                debug("applyGaps: cascade update debounced (duplicate signal), skipping for", this.getCaption());
                return;
            }
            this._cascadeUpdateDebouncing = true;
            const timer = new QTimer();
            timer.interval = 0;
            timer.singleShot = true;
            timer.timeout.connect(() => { this._cascadeUpdateDebouncing = false; });
            timer.start();
        }

        if (coordinator.mouseDragOrResizeInProgress) {
            debug("applyGaps: skipping, drag/resize in progress", this.getCaption());
            return;
        }

        coordinator.block = true;
        debug("----------------");
        debug("gaps for", this.getCaption());
        debug("old geo", new TileableWindowGeometry(this.window.frameGeometry).toString());

        // Exclude other members of this window's cascade group from the layout scan —
        // they're stacked here and would interfere with inter-window gap insertion.
        const myKey = this.window.interstitia_cascadeSlotKey;
        let clientGeometries = {};
        try {
            clientGeometries = workspace.windowList().reduce((acc, c) => {
                const tw = TileableWindow.get(c);
                if (tw && !tw.shouldIgnore() && c.frameGeometry) {
                    if (myKey && c.interstitia_cascadeSlotKey === myKey && c.internalId !== this.window.internalId) {
                        return acc;
                    }
                    acc[c.internalId] = new TileableWindowGeometry(c.frameGeometry);
                }
                return acc;
            }, {});

            this.applyGapsArea(clientGeometries);
            this.applyGapsWindows(clientGeometries);

            for (const c of workspace.windowList()) {
                if (c.internalId in clientGeometries && c.frameGeometry &&
                    !new TileableWindowGeometry(c.frameGeometry).equals(clientGeometries[c.internalId])) {
                    debug("set geometry", TileableWindow.get(c).getCaption(), new TileableWindowGeometry(clientGeometries[c.internalId]).toString());
                    c.frameGeometry = clientGeometries[c.internalId];
                }
            }
        } catch (e) {
            debug("applyGaps: exception during gap calculation:", e);
        } finally {
            coordinator.block = false;
        }

        if (updateCascade) {
            debug("applyGaps: updateCascade is true for", this.getCaption());
            this.applyCascade(clientGeometries[this.window.internalId]);
        }

        debug("");
    }

    /**
     * Applies gaps relative to the workspace boundaries (screen edges and panels).
     * Adjusts the geometry in the provided clientGeometries map.
     * @param {Object.<string, object>} clientGeometries - Map of window IDs to their draft geometries.
     */
    applyGapsArea(clientGeometries) {
        let grid = this.getGridAnchors();
        let geo = clientGeometries[this.window.internalId];
        if (!grid || !geo) return;

        // Snapping logic for each edge (left, right, top, bottom)
        // Checks if the window edge is "near" a standard anchor point (like screen edge or half-point)
        // and snaps it to the gapped version of that anchor.

        if (TileableWindow.nearArea(geo.left, grid.left.fullLeft.closed, grid.left.fullLeft.gapped, gap.left))
            geo.left = grid.left.fullLeft.gapped;
        if (TileableWindow.nearArea(geo.left, grid.left.quarterLeft.closed, grid.left.quarterLeft.gapped, gap.mid))
            geo.left = grid.left.quarterLeft.gapped;
        if (TileableWindow.nearArea(geo.left, grid.left.halfHorizontal.closed, grid.left.halfHorizontal.gapped, gap.mid))
            geo.left = grid.left.halfHorizontal.gapped;
        if (TileableWindow.nearArea(geo.left, grid.left.quarterRight.closed, grid.left.quarterRight.gapped, gap.mid))
            geo.left = grid.left.quarterRight.gapped;

        if (TileableWindow.nearArea(geo.right, grid.right.fullRight.closed, grid.right.fullRight.gapped, gap.right))
            geo.right = grid.right.fullRight.gapped;
        if (TileableWindow.nearArea(geo.right, grid.right.quarterRight.closed, grid.right.quarterRight.gapped, gap.mid))
            geo.right = grid.right.quarterRight.gapped;
        if (TileableWindow.nearArea(geo.right, grid.right.halfHorizontal.closed, grid.right.halfHorizontal.gapped, gap.mid))
            geo.right = grid.right.halfHorizontal.gapped;
        if (TileableWindow.nearArea(geo.right, grid.right.quarterLeft.closed, grid.right.quarterLeft.gapped, gap.mid))
            geo.right = grid.right.quarterLeft.gapped;

        if (TileableWindow.nearArea(geo.top, grid.top.fullTop.closed, grid.top.fullTop.gapped, gap.top))
            geo.top = grid.top.fullTop.gapped;
        if (TileableWindow.nearArea(geo.top, grid.top.quarterTop.closed, grid.top.quarterTop.gapped, gap.mid))
            geo.top = grid.top.quarterTop.gapped;
        if (TileableWindow.nearArea(geo.top, grid.top.halfVertical.closed, grid.top.halfVertical.gapped, gap.mid))
            geo.top = grid.top.halfVertical.gapped;
        if (TileableWindow.nearArea(geo.top, grid.top.quarterBottom.closed, grid.top.quarterBottom.gapped, gap.mid))
            geo.top = grid.top.quarterBottom.gapped;

        if (TileableWindow.nearArea(geo.bottom, grid.bottom.fullBottom.closed, grid.bottom.fullBottom.gapped, gap.bottom))
            geo.bottom = grid.bottom.fullBottom.gapped;
        if (TileableWindow.nearArea(geo.bottom, grid.bottom.quarterBottom.closed, grid.bottom.quarterBottom.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterBottom.gapped;
        if (TileableWindow.nearArea(geo.bottom, grid.bottom.halfVertical.closed, grid.bottom.halfVertical.gapped, gap.mid))
            geo.bottom = grid.bottom.halfVertical.gapped;
        if (TileableWindow.nearArea(geo.bottom, grid.bottom.quarterTop.closed, grid.bottom.quarterTop.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterTop.gapped;

        // Reconstruct basic geometry from edges
        geo.x = geo.left;
        geo.y = geo.top;
        geo.width = geo.right - geo.left;
        geo.height = geo.bottom - geo.top;
    }

    /**
     * Applies gaps between this window and other windows on the same output/desktop.
     * Iterates through all visible windows to find adjacent ones and adjust boundaries.
     * @param {Object.<string, object>} clientGeometries - Map of window IDs to their draft geometries.
     */
    applyGapsWindows(clientGeometries) {
        let geo1 = clientGeometries[this.window.internalId];

        for (const c2 of workspace.windowList()) {
            const tw2 = TileableWindow.get(c2);
            if (this.shouldIgnoreOther(tw2)) continue;

            let geo2 = clientGeometries[c2.internalId];
            if (!geo2) continue;

            // Horizontal gap check (side-by-side windows)
            if (TileableWindow.overlapVer(geo1, geo2)) {
                if (TileableWindow.nearWindow(geo1.left, geo2.right, gap.mid)) {
                    let diff = gap.mid - (geo1.left - geo2.right);
                    geo1.left += diff / 2;
                    geo1.width -= diff / 2;
                    geo2.right -= diff / 2;
                    geo2.width -= diff / 2;
                }
                if (TileableWindow.nearWindow(geo1.right, geo2.left, gap.mid)) {
                    let diff = gap.mid - (geo2.left - geo1.right);
                    geo1.right -= diff / 2;
                    geo1.width -= diff / 2;
                    geo2.left += diff / 2;
                    geo2.width -= diff / 2;
                }
            }
            // Vertical gap check (stacked windows)
            if (TileableWindow.overlapHor(geo1, geo2)) {
                if (TileableWindow.nearWindow(geo1.top, geo2.bottom, gap.mid)) {
                    let diff = gap.mid - (geo1.top - geo2.bottom);
                    geo1.top += diff / 2;
                    geo1.height -= diff / 2;
                    geo2.bottom -= diff / 2;
                    geo2.height -= diff / 2;
                }
                if (TileableWindow.nearWindow(geo1.bottom, geo2.top, gap.mid)) {
                    let diff = gap.mid - (geo2.top - geo1.bottom);
                    geo1.bottom -= diff / 2;
                    geo1.height -= diff / 2;
                    geo2.top += diff / 2;
                    geo2.height -= diff / 2;
                }
            }
        }
        // Sync coordinates
        geo1.x = geo1.left;
        geo1.y = geo1.top;
    }

    // --- Cascade Logic ---

    /**
     * Called after applyGaps when a tile/quick-tile change occurs (updateCascade=true).
     * Stores the gapped geometry and, if this window is in a cascade group,
     * updates the group's slot geometry and re-lays out the cascade.
     * @param {object} applyGapsGeometry - The freshly-computed gapped geometry for this window.
     */
    applyCascade(applyGapsGeometry) {
        if (!applyGapsGeometry) return;
        const geo = new TileableWindowGeometry(applyGapsGeometry);
        // Store latest gapped geometry so startCascade can use it as the slot origin.
        this.window.interstitia_applyGapsGeometry = geo;

        const key = this.window.interstitia_cascadeSlotKey;
        if (!key) return;
        const group = coordinator.cascadeGroups.get(key);
        if (!group) return;

        // If the window has moved to a genuinely different tile slot, it should leave the
        // cascade group rather than dragging all other members to the new position.
        // Use the max cascade offset as tolerance: positions within that range are just
        // cascade layout, not a real slot change.
        const slot = group.slotGeometry;
        const maxCascadeOffset = (group.members.length - 1) * 32;
        if (slot && (Math.abs(geo.x - slot.x) > maxCascadeOffset + 50 || Math.abs(geo.y - slot.y) > maxCascadeOffset + 50)) {
            debug("applyCascade: window moved to different slot, removing from cascade group", key);
            TileableWindow.removeFromCascadeGroup(this, key);
            return;
        }

        debug("applyCascade: updating slotGeometry for cascade group", key);
        group.slotGeometry = geo;
        TileableWindow.reapplyCascade(key, this.window.internalId);
    }

    /**
     * Look for a cascade group whose slot detection zone contains this window's center.
     * The detection zone is the center half of the slot (25%–75% on each axis).
     * Only considers groups on the same output and desktop.
     * @returns {string|null} The matching slot key, or null.
     */
    _findCascadeDropTarget() {
        const fg = this.window.frameGeometry;
        const centerX = fg.x + fg.width / 2;
        const centerY = fg.y + fg.height / 2;

        for (const [key, group] of coordinator.cascadeGroups) {
            const slot = group.slotGeometry;
            const zoneX = slot.x + slot.width / 4;
            const zoneY = slot.y + slot.height / 4;
            const zoneW = slot.width / 2;
            const zoneH = slot.height / 2;

            if (centerX >= zoneX && centerX <= zoneX + zoneW && centerY >= zoneY && centerY <= zoneY + zoneH) {
                if (group.members.length > 0) {
                    const memberTw = TileableWindow.getById(group.members[0]);
                    if (memberTw && this.isOnSameDesktop(memberTw) && this.isOnSameOutput(memberTw)) {
                        return key;
                    }
                }
            }
        }
        return null;
    }

    // --- Reaction/Events (from 07_reaction.js) ---

    /**
     * Initializes the window wrapper: applies initial gaps and sets up all event listeners.
     */
    initialize() {
        debug("added", this.getCaption());
        this.applyGaps();
        this.setupGeometrySignals();
        this.setupMouseDragTracking();
    }

    /**
     * Connects signals related to user-interactive moving and resizing.
     * Helps the WindowCoordinator track when to temporarily disable tiling adjustments.
     */
    setupMouseDragTracking() {
        this.window.interactiveMoveResizeStarted.connect(() => {
            debug("interactive move/resize started (mouse drag detected)", this.getCaption());
            coordinator.mouseDragOrResizeInProgress = true;
            // Record geometry and tile state before Plasma restores the floating size.
            this._dragStartGeometry = new TileableWindowGeometry(this.window.frameGeometry);
            this._dragStartWasTiled = this.window.quickTileMode !== 0;
            // Leave cascade group on drag start.
            this._dragStartCascadeKey = this.window.interstitia_cascadeSlotKey || null;
            if (this._dragStartCascadeKey) {
                debug("drag start: leaving cascade group", this._dragStartCascadeKey);
                TileableWindow.removeFromCascadeGroup(this, this._dragStartCascadeKey);
            }
            debug("drag start: wasTiled", this._dragStartWasTiled, "geo", this._dragStartGeometry.toString());
        });

        this.window.interactiveMoveResizeFinished.connect(() => {
            debug("interactive move/resize finished (mouse drag ended)", this.getCaption());
            coordinator.mouseDragOrResizeInProgress = false;
            // If the window was tiled before the drag, restore its tiled dimensions
            // at the drop position before applying gaps.
            if (this._dragStartWasTiled && this._dragStartGeometry) {
                const dropGeo = this.window.frameGeometry;
                debug("drag end: restoring tiled dimensions", this._dragStartGeometry.width, "x", this._dragStartGeometry.height, "at", dropGeo.x, dropGeo.y);
                this.window.frameGeometry = {
                    x: dropGeo.x,
                    y: dropGeo.y,
                    width: this._dragStartGeometry.width,
                    height: this._dragStartGeometry.height,
                };
            }
            this._dragStartGeometry = null;
            this._dragStartWasTiled = false;

            // Check if dropped onto a cascade group; if so, join it.
            const dropTarget = this._findCascadeDropTarget();
            if (dropTarget) {
                debug("drag end: joining cascade group", dropTarget);
                TileableWindow.addToCascadeGroup(this, dropTarget);
            } else {
                this.applyGaps();
            }
            this._dragStartCascadeKey = null;
        });
    }

    /**
     * Connects all geometry-related signals to trigger gap reapplications.
     * Handles moves, resizes, fullscreen toggles, maximize/minimize, etc.
     */
    setupGeometrySignals() {
        /**
         * Helper to connect a window signal to a debug message and applyGaps.
         */
        const trigger = (signal, message, customAction = null) => {
            if (signal === undefined) return;
            signal.connect(() => {
                debug(message, this.getCaption());
                if (customAction) {
                    customAction();
                } else {
                    this.applyGaps();
                }
            });
        };

        this.getTriggers().forEach(([signal, message, customAction]) => trigger(signal, message, customAction));
    }

    /**
     * Expose triggers for testing or external inspection.
     */
    getTriggers() {
        return [
            [this.window.moveResizedChanged, "move resized changed"],
            [this.window.frameGeometryChanged, "frame geometry changed"],
            [this.window.fullScreenChanged, "fullscreen changed"],
            [this.window.maximizedChanged, "maximized changed"],
            [this.window.minimizedChanged, "unminimized"],
            [
                this.window.quickTileModeChanged,
                "tile mode changed",
                () => {
                    debug("triggering cascade check for", this.getCaption(), "due to tile change");
                    this.applyGaps(true);
                },
            ],
            [
                this.window.tileChanged,
                "tile changed",
                () => {
                    debug("triggering cascade check for", this.getCaption(), "due to tile change");
                    this.applyGaps(true);
                },
            ],
            [this.window.desktopsChanged, "desktops changed"],
            [this.window.activitiesChanged, "activities changed"],
        ];
    }
}

/** @type {Map<string, TileableWindow>} Cache of instances indexed by window internalId. */
TileableWindow._instances = new Map();

if (typeof global !== "undefined") {
    global.TileableWindow = TileableWindow;
}

/**
 * ActiveWindow Class (Singleton)
 * Represents the currently active window in the workspace.
 * Extends TileableWindow to provide specific actions like cascading.
 */
class ActiveWindow extends TileableWindow {
    /**
     * Factory method to get the ActiveWindow instance for the current active window.
     * @returns {ActiveWindow|null}
     */
    static getActive() {
        const active = workspace.activeWindow || workspace.activeClient;
        if (!active) return null;

        return new ActiveWindow(active);
    }

    /**
     * @param {KWin.Window} window
     */
    constructor(window) {
        super(window);
    }

    /**
     * Select all windows that occupy the same slot as this window via geometry scan.
     * Used only when creating a new cascade group (before the registry exists for this slot).
     * @returns {TileableWindow[]} The windows in the same slot.
     */
    selectSameSlotWindows() {
        debug("selectSameSlotWindows called for", this.getCaption());
        const fg = this.window.frameGeometry;
        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        const sameSlotWindows = [];
        allWindows.forEach((window) => {
            const tw = TileableWindow.get(window);
            if (this.isOnSameDesktop(tw) && this.isOnSameActivity(tw) && new TileableWindowGeometry(fg).nearlyEquals(window.frameGeometry)) {
                debug("selectSameSlotWindows: found", tw.getCaption(), JSON.stringify(window.frameGeometry));
                sameSlotWindows.push(tw);
            }
        });
        return sameSlotWindows;
    }

    /**
     * Begin cascading windows that share the same slot as this window.
     * If a cascade group already exists for this slot, re-cascade with the active window on top.
     * If pressing again on an already-cascaded group, cycle active to top (furthest right/down).
     */
    startCascade() {
        debug("startCascade method triggered for", this.getCaption());

        const myKey = this.window.interstitia_cascadeSlotKey;
        if (myKey && coordinator.cascadeGroups.has(myKey)) {
            // Group already exists — re-cascade placing this window on top.
            debug("startCascade: group already exists for", myKey, "— re-cascading with active on top");
            TileableWindow.reapplyCascade(myKey, this.window.internalId);
            return;
        }

        // Find all windows in the same slot via geometry scan.
        const sameSlotWindows = this.selectSameSlotWindows();
        if (sameSlotWindows.length <= 1) {
            debug("startCascade: only one window in slot, nothing to cascade");
            return;
        }

        // Use this window's stored gapped geometry as the slot origin.
        const slotGeo = this.window.interstitia_applyGapsGeometry || new TileableWindowGeometry(this.window.frameGeometry);
        const key = TileableWindow.slotKey(slotGeo);

        debug("startCascade: creating cascade group", key, "with", sameSlotWindows.length, "windows");

        const memberIds = sameSlotWindows.map((tw) => tw.window.internalId);
        coordinator.cascadeGroups.set(key, {
            slotGeometry: slotGeo,
            members: memberIds,
            output: this.getOutput(),
        });

        sameSlotWindows.forEach((tw) => {
            tw.window.interstitia_cascadeSlotKey = key;
        });

        TileableWindow.reapplyCascade(key, this.window.internalId);
    }

    /**
     * Stop cascading: dissolve the group and restore all windows to the slot geometry.
     * The currently active window ends up on top.
     */
    stopCascade() {
        debug("stopCascade method triggered for", this.getCaption());

        const key = this.window.interstitia_cascadeSlotKey;
        if (!key || !coordinator.cascadeGroups.has(key)) {
            debug("stopCascade: window not in a cascade group");
            return;
        }

        TileableWindow.dissolveCascadeGroup(key);
        workspace.activeWindow = this.window;
    }
}

if (typeof global !== "undefined") {
    global.ActiveWindow = ActiveWindow;
}
