---
name: gaps-and-windows
description: This skill should be used when working on the core gap logic, window geometry, signal handling, drag/resize behavior, cascade feature, or any bug involving window positioning in Interstitia. Load this when investigating or fixing issues with how windows are moved, resized, or gapped.
allowed-tools: [Read, Edit, Bash]
version: 0.2.0
---

# Gaps and Windows Logic

Core window geometry and gap logic lives in `contents/code/035_tileable_window.js`.

## Key Classes

**`WindowCoordinator`** (singleton, `coordinator`)
- `block` — set to `true` before any programmatic geometry write, cleared after. Prevents re-entrant `applyGaps` calls triggered by the writes themselves.
- `mouseDragOrResizeInProgress` — set by `interactiveMoveResizeStarted` / cleared by `interactiveMoveResizeFinished`. Used to suppress gap recalculation while the user is dragging.
- `cascadeGroups` — `Map<string, {slotGeometry, members: string[], output}>`. The cascade registry. Key is a slot key string derived from the slot geometry.

**`TileableWindow`**
- Wraps a KWin window. Always obtain via `TileableWindow.get(window)` (never `new`).
- `shouldIgnore()` — returns true for special windows, fullscreen, or maximized (if `includeMaximized = false`). **Not** checked until after cascade cleanup in `applyGaps` — see ordering note below.
- `applyGaps(updateCascade)` — main entry point. Calls `applyGapsArea` (screen edge snapping) then `applyGapsWindows` (inter-window gap insertion). Writes all geometry changes in a single pass at the end.
- `getGridAnchors()` — computes closed/gapped snap positions for each edge at 0%, 25%, 50%, 75%, 100% of the work area. The `panel.*` flags suppress gaps on panel-adjacent edges for non-maximized windows.
- `isMaximized()` — near-equality check (threshold 5px) against `KWin.MaximizeArea`. Uses `nearlyEquals` rather than strict equality to handle fractional display scaling and compositor rounding. Used in `shouldIgnore` and `getGridAnchors`.
- `initialize()` — called when a window is added. Calls `applyGaps`, `setupGeometrySignals`, `setupMouseDragTracking`.

**`ActiveWindow`** (extends `TileableWindow`)
- Handles the cascade feature: finds windows occupying the same tile slot and offsets them to reveal stacked title bars.

## Signal Flow

```
window added
  → TileableWindow.get(window).initialize()
      → applyGaps()
      → setupGeometrySignals()   ← connects per-window signals
      → setupMouseDragTracking() ← connects drag start/end

per-window signals → applyGaps()
  frameGeometryChanged
  moveResizedChanged
  fullScreenChanged
  maximizedChanged
  minimizedChanged
  quickTileModeChanged           (also triggers cascade check via applyGaps(true))
  tileChanged                    (also triggers cascade check via applyGaps(true))
  desktopsChanged
  activitiesChanged

workspace-wide signals → TileableWindow.applyGapsAll()  (070_reaction.js)
  currentDesktopChanged, screensChanged, outputOrderChanged, etc.
  windowAdded where client.dock == true
```

## Gap Algorithm

`applyGapsArea` — snaps each window edge to the nearest grid anchor using `nearArea()`:
- tolerance = gapSize + 2
- snaps if edge is within tolerance of either the closed or gapped anchor position

`applyGapsWindows` — inserts gaps between adjacent windows:
- checks horizontal overlap (`overlapVer`) and vertical overlap (`overlapHor`)
- if two window edges are within `gapSize + 5` of each other, splits the gap evenly between them
- **modifies both windows' entries in `clientGeometries`** — the geometry write loop at the end of `applyGaps` applies changes to all windows in the map, not just the one being processed

`getGridAnchors` — panel suppression logic:
- For non-maximized windows: if `panel.X` is true, the "gapped" position on that edge equals the "closed" position (no gap added — the panel provides visual separation)
- For maximized windows (`unmaximized = false`): panel suppression is disabled, gaps always applied

## `applyGaps` Ordering — Critical

The top of `applyGaps` follows this specific order, which matters:

```javascript
if (coordinator.block || !this.window) return;

// 1. Cascade cleanup FIRST — must run before shouldIgnore()
if (this.isInCascade()) {
    if (this.isMaximized()) {
        removeFromCascadeGroup(this, key);  // sets wasRemovedFromCascadeByMaximize
        // falls through to gap application
    } else if (!updateCascade) {
        return;  // early return for non-cascade-triggered signals
    }
}

// 2. shouldIgnore() SECOND
if (this.shouldIgnore()) {
    if (wasRemovedFromCascadeByMaximize) workspace.activeWindow = this.window;
    return;
}
```

**Why cascade before shouldIgnore:** When `config.includeMaximized = false`, `shouldIgnore()` returns `true` for maximized windows. If it ran first, a cascade member being maximized would return early and stay in the cascade group indefinitely, causing the cascade to fight Plasma's maximize state.

**Why `wasRemovedFromCascadeByMaximize`:** After `removeFromCascadeGroup` calls `reapplyCascade`, the remaining cascade members get set as `workspace.activeWindow` one by one. This buries the maximized window behind them. The flag is used at two points — after the `shouldIgnore` early return and after the full gap application — to restore focus to the maximized window.

## Cascade Architecture

### Data model
- `window.interstitia_cascadeSlotKey` — string key stored directly on the KWin window object. Set for all members of a cascade group.
- `coordinator.cascadeGroups` — registry mapping slot key → `{slotGeometry, members: [internalId, ...], output}`.

### Key static methods on `TileableWindow`
- `removeFromCascadeGroup(tw, key)` — removes one member. If ≤1 remain, dissolves the group. Otherwise calls `reapplyCascade`.
- `addToCascadeGroup(tw, key)` — adds a member on top, re-cascades.
- `dissolveCascadeGroup(key)` — restores all members to `slotGeometry`, clears the group.
- `reapplyCascade(key, activeId)` — lays out all members with cascade offsets (32px per step). `activeId` goes last (on top). Sets `coordinator.block = true` during geometry writes.
- `slotKey(geo)` — derives a stable string key from a geometry object.

### `applyCascade(applyGapsGeometry)`
Called from `applyGaps` when `updateCascade = true` (i.e., on `quickTileModeChanged` / `tileChanged`). Stores the gapped geometry, then if the window is in a cascade:
- Checks if window moved to a genuinely different slot (tolerance: `(numMembers-1) * 32 + 50`px). If so, removes from cascade.
- Otherwise updates `slotGeometry` to the new gapped geometry and calls `reapplyCascade`.

**Known limitation:** `applyCascade` uses the window's raw gapped position to update `slotGeometry`. If `quickTileModeChanged` fires for a cascade member while it's at a cascade-offset position (not the slot origin), `slotGeometry` may drift. The tolerance check helps but doesn't fully prevent this.

### Cascade debounce
Both `quickTileModeChanged` and `tileChanged` fire for the same tile operation. The second call would read the window at its cascade-offset position (placed there by the first call's `reapplyCascade`) and compute wrong gaps. A 0ms `QTimer` debounce prevents this: the first call sets `_cascadeUpdateDebouncing = true`; subsequent calls within the same event loop iteration return early.

### Cascade membership check in `clientGeometries`
Other members of the same cascade group are excluded from the `clientGeometries` layout scan:
```javascript
if (myKey && c.interstitia_cascadeSlotKey === myKey && c.internalId !== this.window.internalId) {
    return acc;  // skip cascade siblings
}
```
`myKey` is read **after** `removeFromCascadeGroup` may have deleted the key — so if the window just left its cascade, `myKey` is `undefined` and siblings are included in the layout scan.

### Cascade and maximize interaction
When a cascade member is maximized:
1. `removeFromCascadeGroup` is called (cascade cleanup runs before `shouldIgnore`)
2. `reapplyCascade` repositions the remaining members into the original slot
3. The maximized window falls through to normal gap application
4. `workspace.activeWindow = this.window` restores focus after `reapplyCascade` cycled it away

## Drag/Resize Behavior

**Invariant:** `applyGaps` must never modify window geometry while a drag or resize is in progress (`coordinator.mouseDragOrResizeInProgress == true`). Doing so repositions the window under the user's cursor, causing the shrink/vanish bug.

**Correct pattern:**
```javascript
if (coordinator.mouseDragOrResizeInProgress) return; // unconditional
```

**On drag start** (`interactiveMoveResizeStarted`): the pre-drag geometry and tile state are recorded on the `TileableWindow` instance (`_dragStartGeometry`, `_dragStartWasTiled`). If the window is in cascade, it leaves the cascade group at drag start (`_dragStartCascadeKey` records the key for potential re-join on drop).

**On drag end** (`interactiveMoveResizeFinished` in `setupMouseDragTracking`):
1. `coordinator.mouseDragOrResizeInProgress = false` is set first
2. If the window was tiled before the drag, its recorded tiled dimensions (width/height) are restored at the drop position (x/y)
3. `_findCascadeDropTarget()` checks if the window was dropped onto an existing cascade group's detection zone (center 50% of the slot). If so, joins that group; otherwise calls `applyGaps()`.

**Important:** `interactiveMoveResizeFinished` must NOT be in `getTriggers` — it is fully handled in `setupMouseDragTracking`. If it were in both places, `applyGaps` would be called while `mouseDragOrResizeInProgress` is still `true` (because `getTriggers` connects before `setupMouseDragTracking`), causing the post-drag snap to silently do nothing.

**Known limitation:** Plasma saves the window's restore geometry before firing `interactiveMoveResizeStarted`, so we cannot intercept it. While dragging a tiled window, it will show its pre-tiled floating size. The tiled dimensions are restored only on release.

## `coordinator.block` vs `mouseDragOrResizeInProgress`

| Flag | Purpose | Set by |
|------|---------|--------|
| `block` | Prevents re-entrant applyGaps during programmatic geometry writes | `applyGaps` itself |
| `mouseDragOrResizeInProgress` | Prevents applyGaps during user-driven drag/resize | `interactiveMoveResizeStarted/Finished` |

Both cause `applyGaps` to return early, but for different reasons. Do not conflate them.

## Configuration

All config in `030_config.js`, read from KDE config via `readConfigValue()`:
- `gap.left/right/top/bottom/mid` — gap sizes in pixels
- `panel.left/right/top/bottom` — which screen edges have a floating panel (global, applies to all outputs)
- `config.includeMaximized` — whether to gap maximized windows
- `config.excludeMode` / `config.includeMode` / `config.applications` — app allowlist/blocklist

## Common Debugging

Check live logs (interstitia prefix only):
```bash
journalctl --user -n 100 --no-pager | grep "interstitia:"
```

Key log patterns:
- `gaps for <window>` — gap calculation ran for this window
- `set geometry <window>` — geometry was actually changed
- `applyGaps: skipping because window is in cascade state` — cascade suppressed normal gapping
- `applyGaps: cascade member maximized, removing from group` — cascade cleanup on maximize
- `reapplyCascade: laying out N windows for group` — cascade re-layout fired
- `applyCascade: window moved to different slot` — cascade member detected as moved, removed from group
- `shouldIgnore` returning silently — no log; absence of `gaps for` after a signal means shouldIgnore returned true

## Known Issues / In Progress

- **Tiled window shows floating size while dragging**: Plasma restores the pre-tiled floating dimensions when a drag starts and there is no way to prevent this from a script. Tiled dimensions are restored on release. Considered acceptable for now.
- **`panel.*` flags are global**: Panel presence is configured globally but only the primary screen has a panel in a multi-monitor setup. Tiled windows on auxiliary screens may incorrectly suppress gaps on panel-side edges.
- **`applyCascade` slotGeometry drift**: If `quickTileModeChanged` fires for a cascade member while it's at a cascade-offset position, `applyCascade` may update `slotGeometry` to the offset position rather than the true slot origin. This can cause the cascade to slowly drift or shrink on repeated tile signals. The `maxCascadeOffset + 50` tolerance check reduces the frequency but doesn't eliminate it.
