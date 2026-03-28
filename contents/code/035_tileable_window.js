/**
 * WindowCoordinator Class (Singleton)
 * Manages shared global state previously held in global variables.
 */
class WindowCoordinator {
    constructor() {
        if (WindowCoordinator.instance) {
            return WindowCoordinator.instance;
        }
        this.block = false;
        this.mouseDragOrResizeInProgress = false;
        this.mouseDragOrResizeStartingGeometry = null;
        this.mouseDragOrResizeStartTime = null;
        this.mouseDragOrResizeNumUpdates = null;
        WindowCoordinator.instance = this;
    }

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
 */
class TileableWindow {
    static _instances = new Map();

    /**
     * Factory method to get or create a TileableWindow instance for a KWin window.
     * @param {KWin.Window} window - The underlying KWin window object.
     * @returns {TileableWindow}
     */
    static get(window) {
        if (!window) return null;
        const id = window.internalId;
        if (!TileableWindow._instances.has(id)) {
            TileableWindow._instances.set(id, new TileableWindow(window));
        }
        return TileableWindow._instances.get(id);
    }

    constructor(window) {
        this.window = window;
    }

    // --- Utilities (from 04_windowing.js) ---

    getOutput() {
        if (this.window.output !== undefined) return this.window.output;
        if (this.window.screen !== undefined) return this.window.screen;
        return null;
    }

    getDesktops() {
        if (this.window.desktops !== undefined) return this.window.desktops;
        if (this.window.desktop !== undefined) return [this.window.desktop];
        return [];
    }

    isOnSameOutput(other) {
        const otherWin = other instanceof TileableWindow ? other : TileableWindow.get(other);
        return this.getOutput() == otherWin.getOutput();
    }

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

    getWorkArea() {
        return workspace.clientArea(KWin.MaximizeArea, this.window);
    }

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

    getCaption() {
        return this.window ? this.window.caption : null;
    }

    isMaximized() {
        return geometriesEqual(this.window.frameGeometry, workspace.clientArea(KWin.MaximizeArea, this.window));
    }

    // --- Gap Logic (from 05_gaps.js) ---

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
        debug("old geo", getWindowGeometry(this.window.frameGeometry));

        const clientGeometries = workspace.windowList().reduce((acc, c) => {
            const tw = TileableWindow.get(c);
            if (!tw.shouldIgnore()) {
                acc[c.internalId] = copyGeometry(c.frameGeometry);
            }
            return acc;
        }, {});

        this.applyGapsArea(clientGeometries);
        this.applyGapsWindows(clientGeometries);

        for (const c of workspace.windowList()) {
            if (c.internalId in clientGeometries && !geometriesEqual(c.frameGeometry, clientGeometries[c.internalId])) {
                debug("set geometry", TileableWindow.get(c).getCaption(), getWindowGeometry(clientGeometries[c.internalId]));
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

    applyGapsArea(clientGeometries) {
        let grid = this.getGridAnchors();
        let geo = clientGeometries[this.window.internalId];

        if (nearArea(geo.left, grid.left.fullLeft.closed, grid.left.fullLeft.gapped, gap.left))
            geo.left = grid.left.fullLeft.gapped;
        if (nearArea(geo.left, grid.left.quarterLeft.closed, grid.left.quarterLeft.gapped, gap.mid))
            geo.left = grid.left.quarterLeft.gapped;
        if (nearArea(geo.left, grid.left.halfHorizontal.closed, grid.left.halfHorizontal.gapped, gap.mid))
            geo.left = grid.left.halfHorizontal.gapped;
        if (nearArea(geo.left, grid.left.quarterRight.closed, grid.left.quarterRight.gapped, gap.mid))
            geo.left = grid.left.quarterRight.gapped;

        if (nearArea(geo.right, grid.right.fullRight.closed, grid.right.fullRight.gapped, gap.right))
            geo.right = grid.right.fullRight.gapped;
        if (nearArea(geo.right, grid.right.quarterRight.closed, grid.right.quarterRight.gapped, gap.mid))
            geo.right = grid.right.quarterRight.gapped;
        if (nearArea(geo.right, grid.right.halfHorizontal.closed, grid.right.halfHorizontal.gapped, gap.mid))
            geo.right = grid.right.halfHorizontal.gapped;
        if (nearArea(geo.right, grid.right.quarterLeft.closed, grid.right.quarterLeft.gapped, gap.mid))
            geo.right = grid.right.quarterLeft.gapped;

        if (nearArea(geo.top, grid.top.fullTop.closed, grid.top.fullTop.gapped, gap.top))
            geo.top = grid.top.fullTop.gapped;
        if (nearArea(geo.top, grid.top.quarterTop.closed, grid.top.quarterTop.gapped, gap.mid))
            geo.top = grid.top.quarterTop.gapped;
        if (nearArea(geo.top, grid.top.halfVertical.closed, grid.top.halfVertical.gapped, gap.mid))
            geo.top = grid.top.halfVertical.gapped;
        if (nearArea(geo.top, grid.top.quarterBottom.closed, grid.top.quarterBottom.gapped, gap.mid))
            geo.top = grid.top.quarterBottom.gapped;

        if (nearArea(geo.bottom, grid.bottom.fullBottom.closed, grid.bottom.fullBottom.gapped, gap.bottom))
            geo.bottom = grid.bottom.fullBottom.gapped;
        if (nearArea(geo.bottom, grid.bottom.quarterBottom.closed, grid.bottom.quarterBottom.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterBottom.gapped;
        if (nearArea(geo.bottom, grid.bottom.halfVertical.closed, grid.bottom.halfVertical.gapped, gap.mid))
            geo.bottom = grid.bottom.halfVertical.gapped;
        if (nearArea(geo.bottom, grid.bottom.quarterTop.closed, grid.bottom.quarterTop.gapped, gap.mid))
            geo.bottom = grid.bottom.quarterTop.gapped;

        geo.x = geo.left;
        geo.y = geo.top;
        geo.width = geo.right - geo.left;
        geo.height = geo.bottom - geo.top;
    }

    applyGapsWindows(clientGeometries) {
        let geo1 = clientGeometries[this.window.internalId];

        for (const c2 of workspace.windowList()) {
            const tw2 = TileableWindow.get(c2);
            if (this.shouldIgnoreOther(tw2)) continue;

            let geo2 = clientGeometries[c2.internalId];

            if (overlapVer(geo1, geo2)) {
                if (nearWindow(geo1.left, geo2.right, gap.mid)) {
                    let diff = gap.mid - (geo1.left - geo2.right);
                    geo1.left += diff / 2;
                    geo1.width -= diff / 2;
                    geo2.right -= diff / 2;
                    geo2.width -= diff / 2;
                }
                if (nearWindow(geo1.right, geo2.left, gap.mid)) {
                    let diff = gap.mid - (geo2.left - geo1.right);
                    geo1.right -= diff / 2;
                    geo1.width -= diff / 2;
                    geo2.left += diff / 2;
                    geo2.width -= diff / 2;
                }
            }
            if (overlapHor(geo1, geo2)) {
                if (nearWindow(geo1.top, geo2.bottom, gap.mid)) {
                    let diff = gap.mid - (geo1.top - geo2.bottom);
                    geo1.top += diff / 2;
                    geo1.height -= diff / 2;
                    geo2.bottom -= diff / 2;
                    geo2.height -= diff / 2;
                }
                if (nearWindow(geo1.bottom, geo2.top, gap.mid)) {
                    let diff = gap.mid - (geo2.top - geo1.bottom);
                    geo1.bottom -= diff / 2;
                    geo1.height -= diff / 2;
                    geo2.top += diff / 2;
                    geo2.height -= diff / 2;
                }
            }
        }
        geo1.x = geo1.left;
        geo1.y = geo1.top;
    }

    // --- Cascade Logic (from 06_cascade.js) ---

    applyCascade(applyGapsGeometry) {
        if (!this.window.interstitia_cascade_data) {
            this.window.interstitia_cascade_data = {};
        }

        this.window.interstitia_cascade_data.activities = this.window.activities;
        this.window.interstitia_cascade_data.desktops = this.window.desktops;
        this.window.interstitia_cascade_data.screen = this.getOutput();
        this.window.interstitia_cascade_data.applyGapsGeometry = copyGeometry(applyGapsGeometry);
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
                geometriesNearlyEqual(applyGapsGeometry, otherGeometry)
            ) {
                otherClients.push(other);
            }
        });

        debug("applyCascade: found group of", otherClients.length + 1, "windows for slot");
        this.applyCascadeGroup(otherClients);
    }

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

    applyCascadeGroup(otherClients) {
        const group = [this.window].concat(otherClients);
        const hasCascade = group.some((c) => c.interstitia_cascade_data && c.interstitia_cascade_data.cascadeState);

        let applyGapsGeometry = this.window.interstitia_cascade_data ? this.window.interstitia_cascade_data.applyGapsGeometry : null;

        if (!applyGapsGeometry) {
            applyGapsGeometry = copyGeometry(this.window.frameGeometry);
        }

        if (!hasCascade) {
            debug("applyCascadeGroup: cascade is disabled, resetting geometries for slot");
            group.forEach((c) => {
                c.frameGeometry = copyGeometry(applyGapsGeometry);
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

    initialize() {
        debug("added", this.getCaption());
        this.applyGaps();
        this.setupGeometrySignals();
        this.setupMouseDragTracking();
    }

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

    setupGeometrySignals() {
        this.window.moveResizedChanged.connect(() => {
            debug("move resized changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.frameGeometryChanged.connect(() => {
            debug("frame geometry changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.interactiveMoveResizeFinished.connect(() => {
            debug("finish user moved resized", this.getCaption());
            workspace.slotWindowClose.connect(() => {}); 
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.fullScreenChanged.connect(() => {
            debug("fullscreen changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.maximizedChanged.connect(() => {
            debug("maximized changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.minimizedChanged.connect(() => {
            debug("unminimized", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.quickTileModeChanged.connect(() => {
            debug("tile mode changed", this.getCaption());
            debug("triggering cascade check for", this.getCaption(), "due to tile change");
            this.applyGaps(true);
        });
        this.window.tileChanged.connect(() => {
            debug("tile changed", this.getCaption());
            debug("triggering cascade check for", this.getCaption(), "due to tile change");
            this.applyGaps(true);
        });
        this.window.desktopsChanged.connect(() => {
            debug("desktops changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
        this.window.activitiesChanged.connect(() => {
            debug("activities changed", this.getCaption());
            this.removeCascadeIfNotApplying();
            this.applyGaps();
        });
    }
}

if (typeof global !== "undefined") {
    global.TileableWindow = TileableWindow;
}
