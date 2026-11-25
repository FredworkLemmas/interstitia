/**
 * CascadeGroup Class
 * A group of windows cascaded in one tile spot, in one context (activity and virtual desktop).
 * The windows form a ring in a fixed order, with a pointer to the active one. The active window
 * is always bottom-right and in front; the others run from top-left after it round the ring, so
 * activating another window rotates the layout without ever changing the order.
 * Its slot geometry is worked out from its output and spot whenever it is laid out, so a
 * resolution or panel change never leaves it stale.
 */
class CascadeGroup {
    /**
     * @param {string} ctx - The context key (TileableWindow.currentContextKey()) the group belongs to.
     * @param {string|number} output - The output's name.
     * @param {string} position - The named spot (left, topRight, maximize, ...).
     * @param {string[]} [ring] - Window internalIds in ring order.
     * @param {number} [active] - Index into `ring` of the active window (the last by default).
     */
    constructor(ctx, output, position, ring = [], active = ring.length - 1) {
        this.ctx = ctx;
        this.output = output;
        this.position = position;
        /** @type {string[]} Window internalIds in their fixed order. */
        this.ring = ring.slice();
        /** @type {number} Index into `ring` of the active (bottom-right, front) window. */
        this.active = Math.max(0, active);
    }

    /**
     * The windows in layout order, top-left (back) to bottom-right (front):
     * ring[active + 1], ring[active + 2], ... round to ring[active].
     * @returns {string[]}
     */
    get members() {
        const n = this.ring.length;
        const out = [];
        for (let k = 1; k <= n; k++) out.push(this.ring[(this.active + k) % n]);
        return out;
    }

    /** The active window's internalId, or null for an empty group. */
    activeId() {
        return this.ring.length ? this.ring[this.active] : null;
    }

    /** @param {string} id */
    has(id) {
        return this.ring.includes(id);
    }

    /**
     * Put a window into the ring just after the active one, and make it active, so the others
     * keep their order and their places.
     * @param {string} id
     */
    insert(id) {
        if (this.has(id)) return;
        if (this.ring.length === 0) {
            this.ring.push(id);
            this.active = 0;
            return;
        }
        this.ring.splice(this.active + 1, 0, id);
        this.active += 1;
    }

    /**
     * Take a window out of the ring. If it was active, the window before it in the ring (the one
     * just above-left of it) becomes active.
     * @param {string} id
     */
    drop(id) {
        const j = this.ring.indexOf(id);
        if (j < 0) return;
        this.ring.splice(j, 1);
        const n = this.ring.length;
        if (n === 0) this.active = 0;
        else if (j < this.active) this.active -= 1;
        else if (j === this.active) this.active = (j - 1 + n) % n;
    }

    /** A readable name for logs. */
    get key() {
        return `${this.ctx}@${CascadeIndex.spotKey(this.output, this.position)}`;
    }

    /** True when the group's context is the one showing. */
    isCurrent() {
        return this.ctx === TileableWindow.currentContextKey();
    }

    /**
     * The members' TileableWindow instances, in member order.
     * @returns {TileableWindow[]}
     */
    windows() {
        return this.ring.map((id) => TileableWindow._instances.get(id)).filter(Boolean);
    }

    /**
     * The members' TileableWindow instances in layout order, top-left to bottom-right.
     * @returns {TileableWindow[]}
     */
    ordered() {
        return this.members.map((id) => TileableWindow._instances.get(id)).filter(Boolean);
    }

    /**
     * The gapped rectangle the group fills. It follows the members' KWin tile, wherever its
     * split is: the first member whose tile is in the group's spot gives it. If no member
     * reports a tile now, the last tile slot is kept while the work area is unchanged; otherwise
     * it is the spot's standard rectangle on a member's output.
     * @returns {WindowGeometry|null}
     */
    slotGeometry() {
        const members = this.windows();
        if (members.length === 0) return null;
        const area = new WindowGeometry(members[0].getWorkArea());
        for (const tw of members) {
            const slot = tw.tileSlotGeometry(this.position);
            if (slot) {
                this._tileSlot = { area, slot };
                return slot;
            }
        }
        if (this._tileSlot && this._tileSlot.area.equals(area)) return this._tileSlot.slot;
        return members[0].spotGeometry(this.position);
    }

    /**
     * The flush rectangle of the KWin tile the group's members are in, or null if none reports
     * one in the group's spot.
     * @param {TileableWindow} [except] - A window not to ask (one about to join).
     * @returns {WindowGeometry|null}
     */
    tileRect(except) {
        for (const tw of this.windows()) {
            if (tw === except) continue;
            const t = tw.tileRect();
            if (t && tw.tileSpotName(t) === this.position) return t;
        }
        return null;
    }

    /**
     * Where the member at step k (0 = top-left) of n goes in a slot.
     * @returns {{x: number, y: number, width: number, height: number}}
     */
    static geometryAt(slot, k, n) {
        const step = CascadeGroup.STEP;
        return {
            x: slot.x + k * step,
            y: slot.y + k * step,
            width: slot.width - (n - 1) * step,
            height: slot.height - (n - 1) * step,
        };
    }

    /**
     * A member's geometry changed and the script did not do it: KWin moved it, typically
     * because the user dragged its tile's split. Lay the group out again when the slot has
     * moved, or once when the member is off its place; a window that refuses its place
     * (say a minimum size) cannot make the group lay out over and over.
     * @param {TileableWindow} tw
     */
    onMemberMoved(tw) {
        if (!this.isCurrent()) return;
        const slot = this.slotGeometry();
        if (!slot) return;
        const slotMoved = !this._laidSlot || !this._laidSlot.nearlyEquals(slot, 1);
        if (!slotMoved && (this._nudged || this.isInPlace(tw))) return;
        debug("CascadeGroup: member moved by KWin, laying out", this.key, slotMoved ? "(slot moved)" : "");
        this.layout();
        this._nudged = !slotMoved;
    }

    /**
     * True when a member is where the last layout put it, within 2 px.
     * @param {TileableWindow} tw
     * @returns {boolean}
     */
    isInPlace(tw) {
        if (!this._laidSlot) return false;
        const windows = this.ordered();
        const k = windows.indexOf(tw);
        if (k < 0) return true;
        return tw.geometry.nearlyEquals(CascadeGroup.geometryAt(this._laidSlot, k, windows.length), 2);
    }

    /**
     * Make `id` the active window and lay the group out: it goes bottom-right and in front, and
     * the ring rotates round it. Only the showing context's groups are laid out; others are laid
     * out when their context shows.
     * @param {string} id
     */
    activate(id) {
        const j = this.ring.indexOf(id);
        if (j >= 0) this.active = j;
        this.layout();
    }

    /**
     * Lay the group out, first making `activeId` active if given.
     * @param {string|null} activeId
     */
    reapply(activeId) {
        if (activeId) this.activate(activeId);
        else this.layout();
    }

    /**
     * Place every member: step k (0 = top-left) at slot + k * STEP, all the size slot - (n - 1) * STEP.
     * Writes only geometry that changes, then raises the members back to front.
     */
    layout() {
        if (!this.isCurrent()) return;
        const slot = this.slotGeometry();
        const windows = this.ordered();
        if (!slot || windows.length === 0) return;
        const n = windows.length;
        debug("CascadeGroup.layout:", n, "windows in", this.key);
        this._laidSlot = slot;
        this._nudged = false;
        this._place(windows, (k) => CascadeGroup.geometryAt(slot, k, n));
    }

    /**
     * Put every member back on the full slot, keeping the stacking order.
     */
    restoreAll() {
        if (!this.isCurrent()) return;
        const slot = this.slotGeometry();
        if (!slot) return;
        this._place(this.ordered(), () => ({ x: slot.x, y: slot.y, width: slot.width, height: slot.height }));
    }

    /**
     * Set each window's geometry from `geoFor(k)` and raise them in order, last on top.
     * The coordinator's block and cascadeLayout flags are set throughout, so neither the gap
     * handlers nor focus rotation react to the script's own moves and activations.
     * @param {TileableWindow[]} windows
     * @param {function(number): object} geoFor
     */
    _place(windows, geoFor) {
        const wasBlocked = coordinator.block;
        const wasLaying = coordinator.cascadeLayout;
        coordinator.block = true;
        coordinator.cascadeLayout = true;
        try {
            windows.forEach((tw, k) => {
                const geo = geoFor(k);
                if (!new WindowGeometry(tw.window.frameGeometry).nearlyEquals(geo, 0)) {
                    tw.window.frameGeometry = geo;
                }
            });
            windows.forEach((tw) => {
                if (typeof workspace.raiseWindow === "function") workspace.raiseWindow(tw.window);
                else workspace.activeWindow = tw.window;
            });
            const front = windows[windows.length - 1];
            if (front && workspace.activeWindow !== front.window) workspace.activeWindow = front.window;
        } finally {
            coordinator.block = wasBlocked;
            coordinator.cascadeLayout = wasLaying;
        }
    }

    /**
     * Ctrl+}: bring the top-left (rear) window to the front.
     */
    cycle() {
        if (this.ring.length <= 1) return;
        debug("CascadeGroup.cycle:", this.key);
        this.activate(this.ring[(this.active + 1) % this.ring.length]);
    }
}

/** The cascade offset (px) between one window's title bar and the next. */
CascadeGroup.STEP = TileableWindow.CASCADE_STEP;

if (typeof global !== "undefined") {
    global.CascadeGroup = CascadeGroup;
}

/**
 * CascadeIndex Class
 * Every cascade group, by context (activity and virtual desktop) and then by spot (output and
 * position). Each TileableWindow also points back at its group in each context
 * (tw.cascade.groups). Only create(), add(), remove() and dissolve() write either side, so the
 * two never drift apart. Lookups never scan other windows.
 */
class CascadeIndex {
    constructor() {
        /** @type {Map<string, Map<string, CascadeGroup>>} */
        this.contexts = new Map();
        /** @type {QTimer|null} The pending focus rotation, if any. */
        this._focusTimer = null;
    }

    /**
     * @param {string|number} output
     * @param {string} position
     * @returns {string}
     */
    static spotKey(output, position) {
        return `${output}|${position}`;
    }

    /**
     * The context a window is looked up in: the current activity and desktop. A window on all
     * activities or desktops is in that context too, so it can be in a different group on each.
     * @returns {string}
     */
    contextOf() {
        return TileableWindow.currentContextKey();
    }

    /**
     * The group a window is in, in a context (the current one by default).
     * @param {TileableWindow} tw
     * @param {string} [ctx]
     * @returns {CascadeGroup|null}
     */
    groupOf(tw, ctx = this.contextOf()) {
        return (tw && tw.cascade.groups.get(ctx)) || null;
    }

    /**
     * The group in a spot of a context.
     * @returns {CascadeGroup|null}
     */
    groupAt(ctx, output, position) {
        const spots = this.contexts.get(ctx);
        return (spots && spots.get(CascadeIndex.spotKey(output, position))) || null;
    }

    /**
     * Every group of one context.
     * @param {string} ctx
     * @returns {CascadeGroup[]}
     */
    groupsIn(ctx) {
        const spots = this.contexts.get(ctx);
        return spots ? Array.from(spots.values()) : [];
    }

    /**
     * Create a group (or extend the one already in that spot) and lay it out.
     * @param {string} ctx
     * @param {string|number} output
     * @param {string} position
     * @param {string[]} ids - member internalIds, back to front
     * @param {string|null} activeId - the window to put in front
     * @returns {CascadeGroup}
     */
    create(ctx, output, position, ids, activeId) {
        let group = this.groupAt(ctx, output, position);
        if (!group) {
            group = new CascadeGroup(ctx, output, position, []);
            if (!this.contexts.has(ctx)) this.contexts.set(ctx, new Map());
            this.contexts.get(ctx).set(CascadeIndex.spotKey(output, position), group);
        }
        ids.forEach((id) => {
            const tw = TileableWindow._instances.get(id);
            if (!tw) return;
            const old = tw.cascade.groups.get(ctx);
            if (old && old !== group) this.remove(old, tw);
            group.insert(id);
            tw.cascade.groups.set(ctx, group);
        });
        debug("CascadeIndex.create:", group.key, "with", group.members.length, "windows");
        group.reapply(activeId);
        return group;
    }

    /**
     * Add a window to a group, in front, and lay the group out.
     * @param {CascadeGroup} group
     * @param {TileableWindow} tw
     */
    add(group, tw) {
        const id = tw.window.internalId;
        const old = tw.cascade.groups.get(group.ctx);
        if (old && old !== group) this.remove(old, tw);
        group.insert(id);
        tw.cascade.groups.set(group.ctx, group);
        debug("CascadeIndex.add:", tw.getCaption(), "to", group.key);
        group.reapply(id);
    }

    /**
     * Take a window out of a group. A group left with one window dissolves.
     * @param {CascadeGroup} group
     * @param {TileableWindow} tw
     */
    remove(group, tw) {
        this._detach(group, tw);
        debug("CascadeIndex.remove:", tw.getCaption(), "from", group.key, "remaining:", group.members.length);
        if (group.ring.length <= 1) this.dissolve(group);
        else group.reapply(null);
    }

    /**
     * Put every member back on the full slot and delete the group.
     * @param {CascadeGroup} group
     */
    dissolve(group) {
        debug("CascadeIndex.dissolve:", group.key);
        group.restoreAll();
        group.windows().forEach((tw) => {
            if (tw.cascade.groups.get(group.ctx) === group) tw.cascade.groups.delete(group.ctx);
        });
        group.ring = [];
        group.active = 0;
        const spots = this.contexts.get(group.ctx);
        if (spots) {
            const key = CascadeIndex.spotKey(group.output, group.position);
            if (spots.get(key) === group) spots.delete(key);
            if (spots.size === 0) this.contexts.delete(group.ctx);
        }
    }

    /**
     * Take a closed window out of every group it is in.
     * @param {TileableWindow} tw
     */
    removeWindow(tw) {
        Array.from(tw.cascade.groups.values()).forEach((group) => this.remove(group, tw));
    }

    /**
     * After an activity, desktop or screen change: lay out every group of the current context,
     * and put each window showing here that is in a group elsewhere, but in none here, back on
     * its full slot. Touches only those windows.
     */
    layoutContext() {
        const ctx = this.contextOf();
        this.groupsIn(ctx).forEach((group) => group.layout());
        const seen = new Set();
        this.contexts.forEach((spots, other) => {
            if (other === ctx) return;
            spots.forEach((group) => {
                group.windows().forEach((tw) => {
                    const id = tw.window.internalId;
                    if (seen.has(id)) return;
                    seen.add(id);
                    if (tw.cascade.groups.has(ctx) || !tw.isOnCurrentContext()) return;
                    tw.restoreToSpot(group.position);
                });
            });
        });
    }

    /**
     * workspace.windowActivated: when a background member of a group in the current context is
     * focused, rotate the group to it after FOCUS_SETTLE_MS, unless a move has started by then or
     * another window has been focused. A mouse press activates a window before KWin reports the
     * drag, and a click cannot be told from Alt+Tab, so every activation waits the same.
     * @param {KWin.Window} window
     */
    onWindowActivated(window) {
        if (coordinator.cascadeLayout) return;
        this._cancelFocus();
        if (!window) return;
        const tw = TileableWindow._instances.get(window.internalId);
        const group = this.groupOf(tw);
        if (!group || group.activeId() === window.internalId) return;
        const timer = new QTimer();
        timer.interval = CascadeIndex.FOCUS_SETTLE_MS;
        timer.singleShot = true;
        timer.timeout.connect(() => {
            if (this._focusTimer !== timer) return;
            this._focusTimer = null;
            if (window.move || coordinator.mouseDragOrResizeInProgress) return;
            if (workspace.activeWindow !== window) return;
            const now = this.groupOf(tw);
            if (now && now.activeId() !== window.internalId) {
                debug("focus: rotating", now.key, "to", tw.getCaption());
                now.activate(window.internalId);
            }
        });
        this._focusTimer = timer;
        timer.start();
    }

    /** Drop a pending focus rotation. */
    _cancelFocus() {
        if (!this._focusTimer) return;
        if (typeof this._focusTimer.stop === "function") this._focusTimer.stop();
        this._focusTimer = null;
    }

    /** Forget every group (tests). */
    clear() {
        this.contexts.clear();
        this._focusTimer = null;
    }

    /**
     * Unlink a window from a group without laying anything out.
     * @param {CascadeGroup} group
     * @param {TileableWindow} tw
     */
    _detach(group, tw) {
        const id = tw.window.internalId;
        group.drop(id);
        if (tw.cascade.groups.get(group.ctx) === group) tw.cascade.groups.delete(group.ctx);
    }
}

/** How long (ms) a focused background member waits before its group rotates (Phase 0, F4). */
CascadeIndex.FOCUS_SETTLE_MS = 400;

if (typeof global !== "undefined") {
    global.CascadeIndex = CascadeIndex;
}

coordinator.cascades = new CascadeIndex();
