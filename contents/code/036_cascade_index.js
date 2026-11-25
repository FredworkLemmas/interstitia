/**
 * CascadeGroup Class
 * A group of windows cascaded in one tile spot, in one context (activity and virtual desktop).
 * Its slot geometry is worked out from its output and spot whenever it is laid out, so a
 * resolution or panel change never leaves it stale.
 */
class CascadeGroup {
    /**
     * @param {string} ctx - The context key (TileableWindow.currentContextKey()) the group belongs to.
     * @param {string|number} output - The output's name.
     * @param {string} position - The named spot (left, topRight, maximize, ...).
     * @param {string[]} members - Window internalIds, back (top-left) to front (bottom-right).
     */
    constructor(ctx, output, position, members) {
        this.ctx = ctx;
        this.output = output;
        this.position = position;
        this.members = members.slice();
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
        return this.members.map((id) => TileableWindow._instances.get(id)).filter(Boolean);
    }

    /**
     * The gapped rectangle of the group's spot, worked out from a member's output.
     * @returns {WindowGeometry|null}
     */
    slotGeometry() {
        const tw = this.windows()[0];
        return tw ? tw.spotGeometry(this.position) : null;
    }

    /**
     * Lay the group out with `activeId` at the front (bottom-right), the others keeping their order.
     * Only the showing context's groups are laid out; others are laid out when their context shows.
     * @param {string|null} activeId - The window to put in front, or null to keep the current order.
     */
    reapply(activeId) {
        if (activeId && this.members.includes(activeId)) {
            this.members = this.members.filter((id) => id !== activeId).concat([activeId]);
        }
        this.layout();
    }

    /**
     * Place every member: step k (0 = top-left) at slot + k * STEP, all the size slot - (n - 1) * STEP.
     * Writes only geometry that changes, then raises the members back to front.
     */
    layout() {
        if (!this.isCurrent()) return;
        const slot = this.slotGeometry();
        const windows = this.windows();
        if (!slot || windows.length === 0) return;
        const step = CascadeGroup.STEP;
        const n = windows.length;
        debug("CascadeGroup.layout:", n, "windows in", this.key);
        this._place(windows, (k) => ({
            x: slot.x + k * step,
            y: slot.y + k * step,
            width: slot.width - (n - 1) * step,
            height: slot.height - (n - 1) * step,
        }));
    }

    /**
     * Put every member back on the full slot, keeping the stacking order.
     */
    restoreAll() {
        if (!this.isCurrent()) return;
        const slot = this.slotGeometry();
        if (!slot) return;
        this._place(this.windows(), () => ({ x: slot.x, y: slot.y, width: slot.width, height: slot.height }));
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
        if (this.members.length <= 1) return;
        debug("CascadeGroup.cycle:", this.key);
        this.reapply(this.members[0]);
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
            if (!group.members.includes(id)) group.members.push(id);
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
        if (!group.members.includes(id)) group.members.push(id);
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
        if (group.members.length <= 1) this.dissolve(group);
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
        group.members = [];
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

    /** Forget every group (tests). */
    clear() {
        this.contexts.clear();
    }

    /**
     * Unlink a window from a group without laying anything out.
     * @param {CascadeGroup} group
     * @param {TileableWindow} tw
     */
    _detach(group, tw) {
        const id = tw.window.internalId;
        group.members = group.members.filter((m) => m !== id);
        if (tw.cascade.groups.get(group.ctx) === group) tw.cascade.groups.delete(group.ctx);
    }
}

if (typeof global !== "undefined") {
    global.CascadeIndex = CascadeIndex;
}

coordinator.cascades = new CascadeIndex();
