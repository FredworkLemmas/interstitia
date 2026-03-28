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
        /** @type {object|null} Stores the geometry at the start of a drag/resize operation. */
        this.mouseDragOrResizeStartingGeometry = null;
        /** @type {number|null} Timestamp when the drag/resize operation started. */
        this.mouseDragOrResizeStartTime = null;
        /** @type {number|null} Number of updates received during the current drag/resize. */
        this.mouseDragOrResizeNumUpdates = null;
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

    // --- Gap Logic (from 05_gaps.js) ---

    /**
     * Main entry point for applying gaps to the window.
     * Orchestrates the calculation and application of gaps against both screen edges and other windows.
     * Includes logic to debounce updates during active mouse resizing.
     * @param {boolean} [updateCascade=false] - Whether to trigger a cascade update after applying gaps.
     */
    applyGaps(updateCascade = false) {
        if (coordinator.block || !this.window || this.shouldIgnore()) return;

        if (this.window.interstitia_cascade_data && this.window.interstitia_cascade_data.cascadeState && !updateCascade) {
            debug("applyGaps: skipping because window is in cascade state:", this.getCaption());
            return;
        }

        if (coordinator.mouseDragOrResizeInProgress) {
            debug(
                "screen:",
                this.getOutput(),
                "x:",
                this.window.x,
                "y:",
                this.window.y,
                "width:",
                this.window.width,
                "height:",
                this.window.height,
            );
            if (!coordinator.mouseDragOrResizeStartingGeometry) {
                coordinator.mouseDragOrResizeStartTime = Date.now();
                coordinator.mouseDragOrResizeNumUpdates = 1;
                coordinator.mouseDragOrResizeStartingGeometry = {
                    x: this.window.x,
                    y: this.window.y,
                    w: this.window.width,
                    h: this.window.height,
                };
            }

            debug(
                "apply gaps",
                this.getCaption(),
                config.includeMaximized,
                this.isMaximized(),
                coordinator.block,
                "mouseDrag:",
                coordinator.mouseDragOrResizeInProgress,
            );

            if (Date.now() - coordinator.mouseDragOrResizeStartTime < 750) return;

            if (
                this.window.width == coordinator.mouseDragOrResizeStartingGeometry.w &&
                this.window.height == coordinator.mouseDragOrResizeStartingGeometry.h
            )
                return;
        } else if (coordinator.mouseDragOrResizeStartingGeometry) {
            coordinator.mouseDragOrResizeStartingGeometry = null;
        }

        coordinator.block = true;
        debug("----------------");
        debug("gaps for", this.getCaption());
        debug("old geo", new TileableWindowGeometry(this.window.frameGeometry).toString());

        const clientGeometries = workspace.windowList().reduce((acc, c) => {
            const tw = TileableWindow.get(c);
            if (!tw.shouldIgnore()) {
                acc[c.internalId] = new TileableWindowGeometry(c.frameGeometry);
            }
            return acc;
        }, {});

        this.applyGapsArea(clientGeometries);
        this.applyGapsWindows(clientGeometries);

        for (const c of workspace.windowList()) {
            if (c.internalId in clientGeometries && !new TileableWindowGeometry(c.frameGeometry).equals(clientGeometries[c.internalId])) {
                debug("set geometry", TileableWindow.get(c).getCaption(), new TileableWindowGeometry(clientGeometries[c.internalId]).toString());
                c.frameGeometry = clientGeometries[c.internalId];
            }
        }

        coordinator.block = false;

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

    // --- Cascade Logic (from 06_cascade.js) ---

    /**
     * Initiates a cascade for this window and any windows occupying the same slot.
     * Captures current state (desktops, output, geometry) before starting.
     * @param {object} applyGapsGeometry - The target geometry for the cascade group base.
     */
    applyCascade(applyGapsGeometry) {
        if (!this.window.interstitia_cascade_data) {
            this.window.interstitia_cascade_data = {};
        }

        this.window.interstitia_cascade_data.activities = this.window.activities;
        this.window.interstitia_cascade_data.desktops = this.window.desktops;
        this.window.interstitia_cascade_data.screen = this.getOutput();
        this.window.interstitia_cascade_data.applyGapsGeometry = new TileableWindowGeometry(applyGapsGeometry);
        if (this.window.interstitia_cascade_data.cascadeState === undefined) {
            this.window.interstitia_cascade_data.cascadeState = false;
        }
        this.window.interstitia_cascade_data.timestamp = Date.now();

        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        const otherClients = [];

        allWindows.forEach((other) => {
            if (other === this.window) return;
            const twOther = TileableWindow.get(other);
            if (twOther.shouldIgnore()) return;

            const otherGeometry = other.frameGeometry;
            if (
                this.isOnSameDesktop(twOther) &&
                this.isOnSameActivity(twOther) &&
                this.getOutput() === twOther.getOutput() &&
                new TileableWindowGeometry(applyGapsGeometry).nearlyEquals(otherGeometry)
            ) {
                otherClients.push(other);
            }
        });

        debug("applyCascade: found group of", otherClients.length + 1, "windows for slot");
        this.applyCascadeGroup(otherClients);
    }

    /**
     * Cleans up cascade-related metadata if it's no longer needed.
     * Uses a short delay to ensure that rapid state changes don't prematurely
     * clear the data while it might still be used by concurrent logic.
     */
    removeCascadeIfNotApplying() {
        if (!this.window || !this.window.interstitia_cascade_data) return;

        if (this.window.interstitia_cascade_data.cascadeState) {
            return;
        }

        const timeout = 500;
        const timer = new QTimer();
        timer.interval = timeout;
        timer.singleShot = true;
        timer.timeout.connect(() => {
            if (this.window.interstitia_cascade_data && Date.now() - this.window.interstitia_cascade_data.timestamp >= timeout) {
                debug("removeCascadeIfNotApplying: clearing cascade data for", this.getCaption());
                delete this.window.interstitia_cascade_data;
            }
        });
        timer.start();
    }

    /**
     * Applies the actual cascade layout to a group of windows.
     * Calculated an offset-based layout where each window is shifted slightly
     * from the previous one, and the current window is placed on top.
     * @param {KWin.Window[]} otherClients - The other windows in the cascade group.
     */
    applyCascadeGroup(otherClients) {
        const group = [this.window].concat(otherClients);
        const hasCascade = group.some((c) => c.interstitia_cascade_data && c.interstitia_cascade_data.cascadeState);

        let applyGapsGeometry = this.window.interstitia_cascade_data ? this.window.interstitia_cascade_data.applyGapsGeometry : null;

        if (!applyGapsGeometry) {
            applyGapsGeometry = new TileableWindowGeometry(this.window.frameGeometry);
        }

        if (!hasCascade) {
            debug("applyCascadeGroup: cascade is disabled, resetting geometries for slot");
            group.forEach((c) => {
                c.frameGeometry = new TileableWindowGeometry(applyGapsGeometry);
            });
            return;
        }

        const offset = 32;
        const numWindows = group.length;
        const newWidth = applyGapsGeometry.width - offset * (numWindows - 1);
        const newHeight = applyGapsGeometry.height - offset * (numWindows - 1);

        debug("applyCascadeGroup: cascading", numWindows, "windows with offset", offset);

        const others = group.filter((c) => c !== this.window);

        const clientGeo = {
            x: applyGapsGeometry.x + others.length * offset,
            y: applyGapsGeometry.y + others.length * offset,
            width: newWidth,
            height: newHeight,
        };
        debug("positioning primary cascaded window:", this.getCaption(), "on top at", clientGeo.x, clientGeo.y);

        coordinator.block = true;
        try {
            others.forEach((c, index) => {
                const newGeo = {
                    x: applyGapsGeometry.x + index * offset,
                    y: applyGapsGeometry.y + index * offset,
                    width: newWidth,
                    height: newHeight,
                };
                debug("positioning cascaded window:", TileableWindow.get(c).getCaption(), "at", newGeo.x, newGeo.y);
                c.frameGeometry = newGeo;
                workspace.activeWindow = c;
            });
            this.window.frameGeometry = clientGeo;
        } finally {
            coordinator.block = false;
        }

        workspace.activeWindow = this.window;
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
        });

        this.window.interactiveMoveResizeFinished.connect(() => {
            debug("interactive move/resize finished (mouse drag ended)", this.getCaption());
            coordinator.mouseDragOrResizeInProgress = false;
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
                    this.removeCascadeIfNotApplying();
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
            [
                this.window.interactiveMoveResizeFinished,
                "finish user moved resized",
                () => {
                    workspace.slotWindowClose.connect(() => {});
                    this.removeCascadeIfNotApplying();
                    this.applyGaps();
                },
            ],
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
     * Select all windows that occupy the same slot as this window.
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
                console.log(
                    "interstitia: Same slot window found:",
                    tw.getCaption(),
                    "Geometry:",
                    JSON.stringify(window.frameGeometry),
                );
                sameSlotWindows.push(tw);
            }
        });
        return sameSlotWindows;
    }

    /**
     * Begin cascading windows that share the same slot as this window.
     */
    startCascade() {
        debug("startCascade method triggered for", this.getCaption());
        const group = this.selectSameSlotWindows();
        debug("startCascade: enabling cascade state for group of", group.length);
        group.forEach((tw) => {
            if (!tw.window.interstitia_cascade_data) {
                tw.window.interstitia_cascade_data = {};
            }
            tw.window.interstitia_cascade_data.cascadeState = true;
            tw.window.interstitia_cascade_data.timestamp = Date.now();
        });

        this.applyCascadeGroup(
            group.filter((tw) => tw.window.internalId !== this.window.internalId).map((tw) => tw.window),
        );
    }

    /**
     * Stop cascading windows that share the same slot as this window.
     */
    stopCascade() {
        debug("stopCascade method triggered for", this.getCaption());
        const group = this.selectSameSlotWindows();
        debug("stopCascade: disabling cascade state for group of", group.length);
        group.forEach((tw) => {
            if (!tw.window.interstitia_cascade_data) {
                tw.window.interstitia_cascade_data = {};
            }
            tw.window.interstitia_cascade_data.cascadeState = false;
            tw.window.interstitia_cascade_data.timestamp = Date.now();
        });

        this.applyCascadeGroup(
            group.filter((tw) => tw.window.internalId !== this.window.internalId).map((tw) => tw.window),
        );
    }
}

if (typeof global !== "undefined") {
    global.ActiveWindow = ActiveWindow;
}
