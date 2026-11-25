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
        /** @type {CascadeIndex} Every cascade group, by context and spot (set by 036_cascade_index.js). */
        this.cascades = null;
        /** @type {boolean} True while a cascade group lays out and raises its own windows. */
        this.cascadeLayout = false;
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

    /**
     * Apply gaps to every window on the current activity and desktop.
     */
    applyGapsAll() {
        if (typeof console !== "undefined") {
            console.log("interstitia: applyGapsAll triggered");
        }
        // Only windows showing now: the others get theirs when their activity or desktop shows.
        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        allWindows.forEach((client) => {
            const tw = TileableWindow.get(client);
            if (tw && tw.isOnCurrentContext()) tw.applyGaps();
        });
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
 * BaseWindow Class
 * Low-level wrapper for KWin windows providing basic metadata and state.
 */
class BaseWindow {
    /**
     * @param {KWin.Window} window - The underlying KWin window object.
     */
    constructor(window) {
        /** @type {KWin.Window} The wrapped KWin window object. */
        this.window = window;
    }

    /**
     * The window's current geometry, read from KWin on every access.
     * Instances are cached for the window's lifetime, so this must never be stored.
     * @returns {WindowGeometry}
     */
    get geometry() {
        return new WindowGeometry(this.window.frameGeometry);
    }

    /**
     * Returns an object containing activity, screen/output, application name, and title.
     * @returns {object}
     */
    getInfo() {
        return {
            activity: this.window.activities,
            screen: this.getOutput(),
            applicationName: String(this.window.resourceClass),
            title: this.window.caption,
        };
    }

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
     * Determines if the window should be considered for tiling.
     * @returns {boolean}
     */
    isTileable() {
        return !this.shouldIgnore();
    }

    /**
     * Determines if the window should be ignored by the script.
     * @returns {boolean}
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
     * Checks if the window is currently maximized by comparing its geometry to the work area.
     * @returns {boolean} True if the window is maximized.
     */
    isMaximized() {
        return this.geometry.nearlyEquals(workspace.clientArea(KWin.MaximizeArea, this.window), 5);
    }

    /**
     * True when KWin has the window in a tile (quick tile or custom layout) or fully maximized.
     * Only these windows get gaps; floating windows keep whatever borders the user gave them.
     * @returns {boolean}
     */
    isTiledOrMaximized() {
        if (!this.window) return false;
        if (this.window.tile) return true;
        // Before Plasma 6.8 a quick tile may show only in quickTileMode (gone in 6.8, so undefined there).
        if (this.window.quickTileMode) return true;
        // KWin restores a maximized window's geometry before it clears maximizeMode, so a
        // maximized window only counts while its frame still covers the work area.
        if (this.window.maximizeMode !== undefined) return this.window.maximizeMode === 3 && this.coversWorkArea();
        return this.isMaximized();
    }

    /**
     * True when every edge of the frame is at the work area's edge, flush or gapped.
     * @returns {boolean}
     */
    coversWorkArea() {
        const f = this.geometry;
        const a = new WindowGeometry(workspace.clientArea(KWin.MaximizeArea, this.window));
        const slack = 5;
        return (
            Math.abs(f.left - a.left) <= gap.left + slack &&
            Math.abs(a.right - f.right) <= gap.right + slack &&
            Math.abs(f.top - a.top) <= gap.top + slack &&
            Math.abs(a.bottom - f.bottom) <= gap.bottom + slack
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
     * Factory method/type-cast to return a TileableWindow instance.
     * @returns {TileableWindow}
     */
    asTileableWindow() {
        return TileableWindow.get(this.window);
    }
}

if (typeof global !== "undefined") {
    global.BaseWindow = BaseWindow;
}

/**
 * TileableWindow Class
 * Encapsulates all window-specific logic for tiling and gapping.
 * This class provides methods to calculate work areas, check for overlaps,
 * apply gap constraints, and handle window cascading.
 */
class TileableWindow extends BaseWindow {
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
        super(window);
        /**
         * Interstitia's own cascade data for this window.
         * spot: the tile spot from the last refresh, `{ output, position }`, or null when floating.
         * groups: the cascade group the window is in for each context (activity and desktop).
         * @type {{spot: ({output: string, position: string}|null), groups: Map<string, CascadeGroup>}}
         */
        this.cascade = { spot: null, groups: new Map() };
    }

    // --- Activity and desktop context ---

    /**
     * A virtual desktop's id: KWin 6 hands VirtualDesktop objects, Plasma 5 numbers.
     * @param {object|number} desktop
     * @returns {string|number}
     */
    static desktopId(desktop) {
        return desktop && typeof desktop === "object" && desktop.id !== undefined ? desktop.id : desktop;
    }

    /**
     * The key of the current context: the current activity and virtual desktop.
     * Cascade groups belong to one context and never reach into another.
     * @returns {string}
     */
    static currentContextKey() {
        return `${workspace.currentActivity || ""}|${TileableWindow.desktopId(workspace.currentDesktop)}`;
    }

    /**
     * True when the window is on the current activity (or on all of them).
     * @returns {boolean}
     */
    isOnCurrentActivity() {
        const activities = this.window.activities;
        const current = workspace.currentActivity;
        if (!activities || activities.length === 0 || !current) return true;
        return Array.from(activities).some((a) => a == current);
    }

    /**
     * True when the window is on the current virtual desktop (or on all of them).
     * @returns {boolean}
     */
    isOnCurrentDesktop() {
        if (this.window.onAllDesktops) return true;
        const desktops = this.getDesktops();
        const current = workspace.currentDesktop;
        if (!desktops || desktops.length === 0 || current === undefined || current === null) return true;
        const id = TileableWindow.desktopId(current);
        return Array.from(desktops).some((d) => TileableWindow.desktopId(d) == id);
    }

    /**
     * True when the window is on the current activity and the current virtual desktop.
     * @returns {boolean}
     */
    isOnCurrentContext() {
        return this.isOnCurrentActivity() && this.isOnCurrentDesktop();
    }

    // --- Utilities (from 04_windowing.js) ---

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
        // KWin 6.8 hands scripts rects with only x/y/width/height; WindowGeometry adds the edges.
        let area = new WindowGeometry(this.getWorkArea());
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

    // --- Cascade State ---

    /**
     * The cascade group this window is in for the current activity and desktop, or null.
     * @returns {CascadeGroup|null}
     */
    getCascadeGroup() {
        return coordinator.cascades ? coordinator.cascades.groupOf(this) : null;
    }

    /**
     * True when the window is in a cascade group for the current activity and desktop.
     * @returns {boolean}
     */
    isInCascade() {
        return this.getCascadeGroup() !== null;
    }

    // --- Gap Logic (from 05_gaps.js) ---

    /**
     * Main entry point for applying gaps to the window.
     * A member of a cascade group in the current context is laid out by its group instead,
     * unless it has been maximized, which takes it out of the group.
     */
    applyGaps() {
        if (coordinator.block || !this.window) return;

        // Cascade cleanup must run before shouldIgnore(): a maximized window with
        // includeMaximized=false would return early and stay in its cascade group.
        const group = this.getCascadeGroup();
        let leftByMaximize = false;
        if (group) {
            if (this.window.maximizeMode === 3 || this.isMaximized()) {
                debug("applyGaps: cascade member maximized, leaving", group.key);
                coordinator.cascades.remove(group, this);
                leftByMaximize = true;
            } else {
                fulldebug("applyGaps: skipping cascade member", this.getCaption());
                return;
            }
        }

        if (this.shouldIgnore()) {
            // Raise the maximized window above the members its group just laid out.
            if (leftByMaximize) workspace.activeWindow = this.window;
            return;
        }

        if (coordinator.mouseDragOrResizeInProgress) {
            debug("applyGaps: skipping, drag/resize in progress", this.getCaption());
            return;
        }

        // Floating windows keep their borders; they only ever get placed by snapToTile() on drop.
        if (!this.isTiledOrMaximized()) {
            fulldebug("applyGaps: floating, leaving borders alone", this.getCaption());
            return;
        }

        coordinator.block = true;
        debug("----------------");
        debug("gaps for", this.getCaption());
        const old = new WindowGeometry(this.window.frameGeometry);
        debug("old geo", old.toString());
        try {
            // Neighbouring windows are never resized, so only this window's geometry matters.
            const clientGeometries = { [this.window.internalId]: old.copy() };
            this.applyGapsArea(clientGeometries);
            const geo = clientGeometries[this.window.internalId];
            if (!old.nearlyEquals(geo, 1)) {
                debug("set geometry", this.getCaption(), new WindowGeometry(geo).toString());
                this.window.frameGeometry = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
            }
        } catch (e) {
            debug("applyGaps: exception during gap calculation:", e);
        } finally {
            coordinator.block = false;
        }

        if (leftByMaximize) workspace.activeWindow = this.window;
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

        if (WindowGeometry.nearArea(geo.left, grid.left.fullLeft.closed, grid.left.fullLeft.gapped, gap.left))
            geo.left = grid.left.fullLeft.gapped;
        if (WindowGeometry.nearArea(geo.left, grid.left.quarterLeft.closed, grid.left.quarterLeft.gapped, gap.mid))
            geo.left = grid.left.quarterLeft.gapped;
        if (WindowGeometry.nearArea(geo.left, grid.left.halfHorizontal.closed, grid.left.halfHorizontal.gapped, gap.mid))
            geo.left = grid.left.halfHorizontal.gapped;
        if (WindowGeometry.nearArea(geo.left, grid.left.quarterRight.closed, grid.left.quarterRight.gapped, gap.mid))
            geo.left = grid.left.quarterRight.gapped;

        if (WindowGeometry.nearArea(geo.right, grid.right.fullRight.closed, grid.right.fullRight.gapped, gap.right))
            geo.right = grid.right.fullRight.gapped;
        if (WindowGeometry.nearArea(geo.right, grid.right.quarterRight.closed, grid.right.quarterRight.gapped, gap.mid))
            geo.right = grid.right.quarterRight.gapped;
        if (WindowGeometry.nearArea(geo.right, grid.right.halfHorizontal.closed, grid.right.halfHorizontal.gapped, gap.mid))
            geo.right = grid.right.halfHorizontal.gapped;
        if (WindowGeometry.nearArea(geo.right, grid.right.quarterLeft.closed, grid.right.quarterLeft.gapped, gap.mid))
            geo.right = grid.right.quarterLeft.gapped;

        if (WindowGeometry.nearArea(geo.top, grid.top.fullTop.closed, grid.top.fullTop.gapped, gap.top))
            geo.top = grid.top.fullTop.gapped;
        if (WindowGeometry.nearArea(geo.top, grid.top.quarterTop.closed, grid.top.quarterTop.gapped, gap.mid))
            geo.top = grid.top.quarterTop.gapped;
        if (WindowGeometry.nearArea(geo.top, grid.top.halfVertical.closed, grid.top.halfVertical.gapped, gap.mid))
            geo.top = grid.top.halfVertical.gapped;
        if (WindowGeometry.nearArea(geo.top, grid.top.quarterBottom.closed, grid.top.quarterBottom.gapped, gap.mid))
            geo.top = grid.top.quarterBottom.gapped;

        if (WindowGeometry.nearArea(geo.bottom, grid.bottom.fullBottom.closed, grid.bottom.fullBottom.gapped, gap.bottom))
            geo.bottom = grid.bottom.fullBottom.gapped;
        if (WindowGeometry.nearArea(geo.bottom, grid.bottom.quarterBottom.closed, grid.bottom.quarterBottom.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterBottom.gapped;
        if (WindowGeometry.nearArea(geo.bottom, grid.bottom.halfVertical.closed, grid.bottom.halfVertical.gapped, gap.mid))
            geo.bottom = grid.bottom.halfVertical.gapped;
        if (WindowGeometry.nearArea(geo.bottom, grid.bottom.quarterTop.closed, grid.bottom.quarterTop.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterTop.gapped;

        // Reconstruct basic geometry from edges
        geo.x = geo.left;
        geo.y = geo.top;
        geo.width = geo.right - geo.left;
        geo.height = geo.bottom - geo.top;
    }

    // --- Reaction/Events (from 07_reaction.js) ---

    /**
     * Initializes the window wrapper: applies initial gaps and sets up all event listeners.
     */
    initialize() {
        debug("added", this.getCaption());
        this.applyGaps();
        this.refreshSpot();
        this.setupGeometrySignals();
        this.setupSpotSignals();
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
            // Only a move can snap into a tile on drop; a resize never does.
            this._dragIsMove = Boolean(this.window.move);
            // Dragging a window takes it out of its cascade group.
            const group = this.getCascadeGroup();
            if (group) {
                debug("drag start: leaving cascade group", group.key);
                coordinator.cascades.remove(group, this);
            }
            debug("drag start: move", this._dragIsMove);
        });

        this.window.interactiveMoveResizeFinished.connect(() => {
            debug("interactive move/resize finished (mouse drag ended)", this.getCaption());
            coordinator.mouseDragOrResizeInProgress = false;
            const wasMove = this._dragIsMove;
            this._dragIsMove = false;

            // KWin 6.8 can update a window's tile just after Finished (drag-to-edge tiling),
            // so decide what to do once it has settled.
            const timer = new QTimer();
            timer.interval = TileableWindow.DROP_SETTLE_MS;
            timer.singleShot = true;
            timer.timeout.connect(() => this.afterDrop(wasMove));
            timer.start();
        });
    }

    /**
     * Runs shortly after a drag or resize ends. Tiled or maximized windows get their gaps.
     * A floating window that was moved snaps into a nearby quick-tile spot if there is one;
     * otherwise nothing changes.
     * @param {boolean} wasMove - Whether the interaction was a move rather than a resize.
     */
    afterDrop(wasMove) {
        if (!this.window || this.shouldIgnore()) return;
        if (wasMove && this.joinGroupAfterDrop()) return;
        if (this.isTiledOrMaximized()) {
            this.applyGaps();
            return;
        }
        if (wasMove) this.snapToTile();
    }

    /**
     * After a move, join the cascade group the window was dropped on, if any: the group in the
     * window's spot, or else a group on the same output whose slot's middle half holds the
     * window's centre. Only groups of the current activity and desktop are looked at.
     * @returns {boolean} True if the window joined a group.
     */
    joinGroupAfterDrop() {
        const index = coordinator.cascades;
        const ctx = index.contextOf(this);
        const spot = this.refreshSpot();
        let group = spot ? index.groupAt(ctx, spot.output, spot.position) : null;
        if (!group) {
            const g = this.geometry;
            const cx = g.x + g.width / 2, cy = g.y + g.height / 2;
            const output = this.getOutputName();
            group = index.groupsIn(ctx).find((candidate) => {
                if (candidate.output !== output) return false;
                const slot = candidate.slotGeometry();
                return slot && cx >= slot.x + slot.width / 4 && cx <= slot.x + (3 * slot.width) / 4 &&
                    cy >= slot.y + slot.height / 4 && cy <= slot.y + (3 * slot.height) / 4;
            }) || null;
        }
        if (!group) return false;
        debug("drop: joining cascade group", group.key);
        index.add(group, this);
        return true;
    }

    /**
     * The quick-tile spots on this window's output, as candidates for WindowGeometry.pickSnapTarget.
     * @returns {Array<{name: string, sides: string[], closed: object, gapped: object}>}
     */
    getSnapCandidates() {
        const g = this.getGridAnchors();
        const L = g.left.fullLeft, LH = g.left.halfHorizontal;
        const R = g.right.fullRight, RH = g.right.halfHorizontal;
        const T = g.top.fullTop, TH = g.top.halfVertical;
        const B = g.bottom.fullBottom, BH = g.bottom.halfVertical;
        const spot = (name, sides, left, right, top, bottom) => ({
            name,
            sides,
            closed: { left: left.closed, right: right.closed, top: top.closed, bottom: bottom.closed },
            gapped: { left: left.gapped, right: right.gapped, top: top.gapped, bottom: bottom.gapped },
        });
        return [
            spot("left", ["left", "top", "bottom"], L, RH, T, B),
            spot("right", ["right", "top", "bottom"], LH, R, T, B),
            spot("topLeft", ["left", "top"], L, RH, T, BH),
            spot("topRight", ["right", "top"], LH, R, T, BH),
            spot("bottomLeft", ["left", "bottom"], L, RH, TH, B),
            spot("bottomRight", ["right", "bottom"], LH, R, TH, B),
            spot("maximize", ["left", "right", "top", "bottom"], L, R, T, B),
        ];
    }

    // --- Tile spot ---

    /**
     * The spots a cascade group can occupy: the quick-tile snap candidates plus the top and
     * bottom halves (which KWin can quick-tile, but a drop never snaps into).
     * @returns {Array<{name: string, sides: string[], closed: object, gapped: object}>}
     */
    getSpotCandidates() {
        const g = this.getGridAnchors();
        const L = g.left.fullLeft, R = g.right.fullRight;
        const T = g.top.fullTop, TH = g.top.halfVertical;
        const B = g.bottom.fullBottom, BH = g.bottom.halfVertical;
        const spot = (name, left, right, top, bottom) => ({
            name,
            closed: { left: left.closed, right: right.closed, top: top.closed, bottom: bottom.closed },
            gapped: { left: left.gapped, right: right.gapped, top: top.gapped, bottom: bottom.gapped },
        });
        return this.getSnapCandidates().concat([spot("top", L, R, T, BH), spot("bottom", L, R, TH, B)]);
    }

    /**
     * The gapped rectangle of a named spot on this window's output.
     * @param {string} position
     * @returns {WindowGeometry|null}
     */
    spotGeometry(position) {
        const c = this.getSpotCandidates().find((cand) => cand.name === position);
        if (!c) return null;
        const r = c.gapped;
        return new WindowGeometry({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
    }

    /**
     * Put the window on the full gapped rectangle of a spot, e.g. when it shows on an activity
     * where it is in no cascade group. Writes only if the geometry changes.
     * @param {string} position
     */
    restoreToSpot(position) {
        const geo = this.spotGeometry(position);
        if (!geo || this.geometry.nearlyEquals(geo, 0)) return;
        const wasBlocked = coordinator.block;
        coordinator.block = true;
        try {
            this.window.frameGeometry = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
        } finally {
            coordinator.block = wasBlocked;
        }
    }

    /**
     * The name of the window's output (the screen number on Plasma 5).
     * @returns {string|number|null}
     */
    getOutputName() {
        const o = this.getOutput();
        return o && typeof o === "object" && o.name !== undefined ? o.name : o;
    }

    /**
     * Work out which tile spot the window is in, using the first rule that applies:
     * 1. window.quickTileMode (Plasma 6.5-6.7);
     * 2. maximizeMode 3 for maximize, or window.tile's rectangle matched against the flush spots
     *    (Plasma 6.8; the tile's positionInLayout is a layout index, also used by custom tiles,
     *    so it is not trusted);
     * 3. the window's own geometry on a spot's gapped rectangle, or on the cascade grid inside it;
     * 4. otherwise null (floating).
     * @returns {{output: (string|number), position: string}|null}
     */
    computeSpot() {
        const at = (position) => ({ output: this.getOutputName(), position });
        const qtm = this.window.quickTileMode;
        if (typeof qtm === "number" && TileableWindow.QUICK_TILE_NAMES[qtm]) return at(TileableWindow.QUICK_TILE_NAMES[qtm]);
        if (this.window.maximizeMode === 3) return at("maximize");

        const candidates = this.getSpotCandidates();
        const tile = this.window.tile;
        if (tile && tile.absoluteGeometry) {
            const t = new WindowGeometry(tile.absoluteGeometry);
            const tol = 4 + (tile.padding || 0);
            const hit = candidates.find((c) =>
                Math.abs(t.left - c.closed.left) <= tol && Math.abs(t.right - c.closed.right) <= tol &&
                Math.abs(t.top - c.closed.top) <= tol && Math.abs(t.bottom - c.closed.bottom) <= tol);
            return hit ? at(hit.name) : null;
        }

        // A window on a spot's gapped rectangle, or a cascade member offset inside it:
        // same top-left and bottom-right shortfall on both axes, in whole cascade steps.
        const g = this.geometry;
        const step = TileableWindow.CASCADE_STEP;
        const near = (v, w) => Math.abs(v - w) <= 2;
        const onGrid = (v) => near(v, Math.round(v / step) * step);
        let best = null;
        candidates.forEach((c) => {
            const dx = g.left - c.gapped.left, dy = g.top - c.gapped.top;
            const dw = c.gapped.right - c.gapped.left - g.width, dh = c.gapped.bottom - c.gapped.top - g.height;
            if (dx < -2 || dy < -2 || dw < -2 || !near(dx, dy) || !near(dw, dh) || dx > dw + 2) return;
            if (!onGrid(dx) || !onGrid(dw)) return;
            if (!best || dw < best.dw) best = { name: c.name, dw };
        });
        return best ? at(best.name) : null;
    }

    /**
     * Recompute and store the window's spot. While the script itself is moving windows the
     * stored spot is kept, since the geometry then is the script's, not KWin's.
     * @returns {{output: (string|number), position: string}|null}
     */
    refreshSpot() {
        if (coordinator.block || coordinator.cascadeLayout) return this.cascade.spot;
        this.cascade.spot = this.computeSpot();
        return this.cascade.spot;
    }

    /**
     * Refresh the spot DROP_SETTLE_MS after a tile, output or maximize change, once KWin has
     * finished; several signals for the same change share one refresh.
     */
    scheduleSpotRefresh() {
        if (this._spotTimer) return;
        const timer = new QTimer();
        timer.interval = TileableWindow.DROP_SETTLE_MS;
        timer.singleShot = true;
        timer.timeout.connect(() => {
            this._spotTimer = null;
            this.onSpotSettled();
        });
        this._spotTimer = timer;
        timer.start();
    }

    /**
     * Runs once a tile, output or maximize change has settled.
     */
    onSpotSettled() {
        if (!this.window || coordinator.mouseDragOrResizeInProgress) return;
        const index = coordinator.cascades;
        const group = this.getCascadeGroup();
        const spot = this.refreshSpot();
        const inSpot = (g) => spot && spot.output === g.output && spot.position === g.position;
        if (group && inSpot(group)) return;
        if (group) {
            debug("spot changed: leaving cascade group", group.key, this.getCaption());
            index.remove(group, this);
        }
        // Moved (e.g. with Meta+arrows) into a spot with a group: join it, bottom-right.
        // A maximized window never joins: maximizing takes a window out of its group.
        const target = spot && spot.position !== "maximize" && this.isOnCurrentContext() ? index.groupAt(index.contextOf(this), spot.output, spot.position) : null;
        if (target) {
            debug("spot changed: joining cascade group", target.key, this.getCaption());
            index.add(target, this);
        } else if (group) {
            this.applyGaps();
        }
    }

    /**
     * Connects the signals that can change the window's spot.
     */
    setupSpotSignals() {
        [this.window.tileChanged, this.window.quickTileModeChanged, this.window.outputChanged, this.window.maximizedChanged].forEach((signal) => {
            if (signal) signal.connect(() => this.scheduleSpotRefresh());
        });
    }

    /**
     * If this floating window lines up with a quick-tile spot, or sits against a screen edge,
     * make it a real KWin quick tile there (the same as Meta+arrows). Otherwise leave it alone.
     * @returns {string|null} The spot it was tiled into.
     */
    snapToTile() {
        const area = new WindowGeometry(this.getWorkArea());
        const target = WindowGeometry.pickSnapTarget(this.geometry, area, this.getSnapCandidates(), TileableWindow.SNAP_DISTANCE);
        if (!target) {
            debug("drop: no tile spot nearby, leaving", this.getCaption(), "where it is");
            return null;
        }
        const slot = TileableWindow.SNAP_SLOTS[target];
        if (typeof workspace[slot] !== "function") {
            debug("drop: KWin has no", slot, "- not snapping", this.getCaption());
            return null;
        }
        debug("drop: snapping", this.getCaption(), "into", target);
        workspace.activeWindow = this.window;
        workspace[slot]();
        return target;
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
            // Tile changes also refresh the window's spot (setupSpotSignals), which moves it
            // out of its cascade group when it has left the group's spot.
            [this.window.quickTileModeChanged, "tile mode changed"],
            [this.window.tileChanged, "tile changed"],
            [this.window.desktopsChanged, "desktops changed"],
            [this.window.activitiesChanged, "activities changed"],
        ];
    }
}

if (typeof global !== "undefined") {
    global.TileableWindow = TileableWindow;
}

/** @type {Map<string, TileableWindow>} Cache of instances indexed by window internalId. */
TileableWindow._instances = new Map();

/** How close (px) a dropped window's edges must be to a tile spot or screen edge to snap. */
TileableWindow.SNAP_DISTANCE = 24;
/** How long (ms) to wait after a drag ends for KWin's own tile updates to land. */
TileableWindow.DROP_SETTLE_MS = 50;
/** The cascade offset (px) between one window's title bar and the next. */
TileableWindow.CASCADE_STEP = 32;
/** Plasma 6.5-6.7 quickTileMode flags (Left 1, Right 2, Top 4, Bottom 8) by spot. */
TileableWindow.QUICK_TILE_NAMES = {
    1: "left",
    2: "right",
    4: "top",
    8: "bottom",
    5: "topLeft",
    6: "topRight",
    9: "bottomLeft",
    10: "bottomRight",
    15: "maximize",
};
/** The KWin workspace slot that quick-tiles the active window into each spot. */
TileableWindow.SNAP_SLOTS = {
    left: "slotWindowQuickTileLeft",
    right: "slotWindowQuickTileRight",
    topLeft: "slotWindowQuickTileTopLeft",
    topRight: "slotWindowQuickTileTopRight",
    bottomLeft: "slotWindowQuickTileBottomLeft",
    bottomRight: "slotWindowQuickTileBottomRight",
    maximize: "slotWindowMaximize",
};

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
        // Share the window's cascade data with its cached TileableWindow.
        this.cascade = TileableWindow.get(window).cascade;
    }

    /**
     * The windows that can form a new cascade group with this one: on the current activity and
     * desktop, in the same spot on the same output, not ignored or minimized, and in no group here.
     * This is the only place that scans the window list for cascades.
     * @param {{output: (string|number), position: string}} spot
     * @returns {TileableWindow[]}
     */
    selectSameSlotWindows(spot) {
        debug("selectSameSlotWindows called for", this.getCaption());
        const allWindows = workspace.windowList ? workspace.windowList() : workspace.clientList();
        const same = [];
        allWindows.forEach((window) => {
            const tw = window.internalId === this.window.internalId ? this : TileableWindow.get(window);
            if (!tw || window.minimized || tw.shouldIgnore() || !tw.isOnCurrentContext() || tw.isInCascade()) return;
            if (tw.getOutputName() !== spot.output) return;
            const s = tw.refreshSpot();
            if (s && s.position === spot.position) same.push(tw);
        });
        // The ring starts in stacking order, bottom to top, when KWin reports it.
        const stack = Array.isArray(workspace.stackingOrder) ? workspace.stackingOrder : null;
        if (stack) {
            const rank = (tw) => {
                const i = stack.indexOf(tw.window);
                return i < 0 ? stack.length : i;
            };
            same.sort((p, q) => rank(p) - rank(q));
        }
        return same;
    }

    /**
     * Ctrl+}. In a group: on the active window it brings the top-left window to the front (the
     * ring rotates by one); on any other member it makes that member active. Not in a group: join the group in this
     * window's spot, or start one from the windows sharing the spot.
     */
    startCascade() {
        debug("startCascade method triggered for", this.getCaption());
        const index = coordinator.cascades;
        const group = this.getCascadeGroup();
        if (group) {
            if (group.activeId() === this.window.internalId) group.cycle();
            else group.activate(this.window.internalId);
            return;
        }

        const spot = this.refreshSpot();
        if (!spot) {
            debug("startCascade: window is in no tile spot, nothing to cascade");
            return;
        }
        const ctx = index.contextOf(this);
        const existing = index.groupAt(ctx, spot.output, spot.position);
        if (existing) {
            index.add(existing, this);
            return;
        }
        const same = this.selectSameSlotWindows(spot);
        if (same.length <= 1) {
            debug("startCascade: only one window in slot, nothing to cascade");
            return;
        }
        index.create(ctx, spot.output, spot.position, same.map((tw) => tw.window.internalId), this.window.internalId);
    }

    /**
     * Ctrl+{: dissolve the group; every member goes back to the full slot, this window on top.
     */
    stopCascade() {
        debug("stopCascade method triggered for", this.getCaption());
        const group = this.getCascadeGroup();
        if (!group) {
            debug("stopCascade: window not in a cascade group");
            return;
        }
        coordinator.cascades.dissolve(group);
        workspace.activeWindow = this.window;
    }
}

if (typeof global !== "undefined") {
    global.ActiveWindow = ActiveWindow;
}
