---
name: gaps-and-windows
description: This skill should be used when working on the core gap logic, window geometry, signal handling, drag/resize behavior, cascade feature, or any bug involving window positioning in Interstitia. Load this when investigating or fixing issues with how windows are moved, resized, or gapped.
allowed-tools: [Read, Edit, Bash]
version: 0.1.0
---

# Gaps and Windows Logic

Core window geometry and gap logic lives in `contents/code/035_tileable_window.js`.

## Key Classes

**`WindowCoordinator`** (singleton, `coordinator`)
- `block` — set to `true` before any programmatic geometry write, cleared after. Prevents re-entrant `applyGaps` calls triggered by the writes themselves.
- `mouseDragOrResizeInProgress` — set by `interactiveMoveResizeStarted` / cleared by `interactiveMoveResizeFinished`. Used to suppress gap recalculation while the user is dragging.

**`TileableWindow`**
- Wraps a KWin window. Always obtain via `TileableWindow.get(window)` (never `new`).
- `shouldIgnore()` — returns true for special windows, fullscreen, or maximized (if `includeMaximized = false`). Always checked at the top of `applyGaps`.
- `applyGaps(updateCascade)` — main entry point. Calls `applyGapsArea` (screen edge snapping) then `applyGapsWindows` (inter-window gap insertion). Writes all geometry changes in a single pass at the end.
- `getGridAnchors()` — computes closed/gapped snap positions for each edge at 0%, 25%, 50%, 75%, 100% of the work area. The `panel.*` flags suppress gaps on panel-adjacent edges for non-maximized windows.
- `isMaximized()` — strict geometry equality check against `KWin.MaximizeArea`. Used in `shouldIgnore` and `getGridAnchors`.
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
  interactiveMoveResizeFinished  (also clears cascade)
  fullScreenChanged
  maximizedChanged
  minimizedChanged
  quickTileModeChanged           (also triggers cascade check)
  tileChanged                    (also triggers cascade check)
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

`getGridAnchors` — panel suppression logic:
- For non-maximized windows: if `panel.X` is true, the "gapped" position on that edge equals the "closed" position (no gap added — the panel provides visual separation)
- For maximized windows (`unmaximized = false`): panel suppression is disabled, gaps always applied

## Drag/Resize Behavior

**Invariant:** `applyGaps` must never modify window geometry while a drag or resize is in progress (`coordinator.mouseDragOrResizeInProgress == true`). Doing so repositions the window under the user's cursor, causing the shrink/vanish bug.

**Correct pattern:**
```javascript
if (coordinator.mouseDragOrResizeInProgress) return; // unconditional
```

**After drag ends:** `interactiveMoveResizeFinished` calls `applyGaps()` once to snap the window to its final gapped position.

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
- `shouldIgnore` returning silently — no log; absence of `gaps for` after a signal means shouldIgnore returned true

## Known Issues / In Progress

- **Drag/resize causes shrink or vanish**: The `mouseDragOrResizeInProgress` guard has escape conditions (750ms timeout + size change check) that allow `applyGaps` to fire mid-drag. Fix: make the guard an unconditional `return`.
- **`panel.*` flags are global**: Panel presence is configured globally but only the primary screen has a panel in a multi-monitor setup. Tiled windows on auxiliary screens may incorrectly suppress gaps on panel-side edges.
