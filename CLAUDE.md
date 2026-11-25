# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interstitia is a KWin (KDE window manager) script for Plasma 6 that automatically adds configurable gaps around tiled windows. It is installed as a KDE plugin (`kwin/scripts/interstitia`).

## Commands

All development tasks can be run via npm scripts or the Python `invoke` task runner:

```bash
# Testing
npm test                    # Run Jest tests
invoke dev:test             # Same via invoke

# Linting / Formatting
npm run lint                # ESLint on source files
npm run format              # Prettier formatting
invoke dev:lint
invoke dev:format

# Building
invoke dev:bundle           # Concatenate source files into contents/code/main.js
invoke dev:install          # Bundle then run install.sh (installs to KDE plugin dir)
invoke dev:release --dry-run  # Bundle, package and check; print release notes (publishes nothing)
invoke dev:release          # Same, then publish the GitHub release (clean origin/main only; see the release skill)
invoke dev:clean-repo       # Remove generated main.js

# Run a single test file
npx jest tests/tileable_window.test.js
npx jest --testNamePattern="pattern"

# Debugging (tail KWin logs for this script)
invoke dev:show-logs
```

## Architecture

### Bundling Model

The `contents/code/` directory contains numbered source modules that `invoke dev:bundle` concatenates in numeric order into `contents/code/main.js`. **`main.js` is auto-generated — never edit it directly.** The numeric prefixes (010, 020, ...) define load order, which matters because all files share a single global scope.

| File | Purpose |
|------|---------|
| `010_init.js` | Global flags, Plasma 6 detection (`isPlasma6`) |
| `020_logging.js` | `debug()` / `fulldebug()` utilities |
| `030_config.js` | Config loading from KDE settings with multi-API fallback |
| `034_geometry.js` | `WindowGeometry` value object (x, y, width, height, and derived edges) and static geometry helpers |
| `035_tileable_window.js` | Core logic: `WindowCoordinator`, `BaseWindow`, `TileableWindow`, `ActiveWindow` |
| `036_cascade_index.js` | Cascade groups: `CascadeGroup` and `CascadeIndex` (sets `coordinator.cascades`) |
| `070_reaction.js` | Workspace signal wiring (`onRelayouted`) |
| `080_main_loop.js` | Entry point: config load, shortcut registration, window init |

### Core Classes (in `035_tileable_window.js`)

**`WindowCoordinator`** (singleton) — guards against recursive geometry updates. The `block` flag must be set before any programmatic window move/resize and cleared after, to prevent the geometry signal handlers from re-triggering.

**`TileableWindow`** — wraps a `KWin.Window` object. Use the factory `TileableWindow.get(window)` (never `new`) to get a singleton per window. Key methods:
- `applyGaps()` — entry point for the gap algorithm; runs only for windows in a KWin tile or maximized (`isTiledOrMaximized()`), and calls `applyGapsArea()` (snap edges to the gapped grid anchors)
- `afterDrop()` — 50 ms after a drag ends: a moved window dropped on a cascade group joins it (`joinGroupAfterDrop()`); otherwise tiled or maximized windows get gaps and a floating window is left where it was dropped (KWin's own edge and corner tiling places it)
- `getGridAnchors()` — calculates quarter/half/full snap points for the tiling grid, accounting for gap offsets
- `shouldIgnore()` — checks window against app blacklist/whitelist
- `initialize()` / `setupGeometrySignals()` — connects KWin signals for this window

**`ActiveWindow`** (extends `TileableWindow`) — the Ctrl+} / Ctrl+{ shortcuts: `startCascade()` / `stopCascade()`. It shares its window's `cascade` data with the cached `TileableWindow`.

### Cascade groups (in `036_cascade_index.js`)

- Each `TileableWindow` keeps `this.cascade = { spot, groups }`: `spot` is `{ output, position }` (output name; position `left`, `right`, `top`, `bottom`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `maximize`) or null when floating, from `computeSpot()`. A KWin 6.8 tile that matches no standard spot (an off-centre split, a custom-layout column) is named by the work area edges it touches (`tileSpotName()`, `TILE_SIDES_SPOT`); `groups` maps a context key to the window's group there.
- A context is the current activity and virtual desktop (`TileableWindow.currentContextKey()`, `activity|desktopId`). Groups never reach across contexts; a window on several activities or desktops can be in a different group on each.
- **`CascadeIndex`** (`coordinator.cascades`): `contexts` is `Map<ctx, Map<"output|position", CascadeGroup>>`. Lookups (`groupOf`, `groupAt`, `groupsIn`) never scan other windows. Only `create`/`add`/`remove`/`dissolve`/`removeWindow` write the index or the windows' back-references.
- **`CascadeGroup`**: `ctx`, `output`, `position`, a `ring` of window ids in a fixed order and `active` (an index into it). `members` is the layout order, top-left to bottom-right: `ring[active+1]` ... round to `ring[active]`, which is always bottom-right and in front. `activate(id)` moves the pointer (A B C D E, activate B → C D E A B); `cycle()` (Ctrl+}) activates the top-left window; `insert()` puts a joining window just after the active one and makes it active; `drop()` makes the window above-left active when the active one leaves. Its slot geometry (`slotGeometry()`) is a member's KWin tile, gapped like a lone window in it (`tileSlotGeometry()`), so it follows the split; with no tile reported it keeps the last tile slot while the work area is unchanged, else the spot's standard rectangle. When KWin moves a member (a dragged split), `onMemberMoved()` re-lays the group out if the slot moved, or once if the member is off its place; windows in different tiles with the same spot name never share a group (`fitsGroup()`); only groups of the showing context are laid out, writing only geometry that changes, with `coordinator.cascadeLayout` set (`workspace.raiseWindow` when KWin has it, else activation).
- **Focus rotation:** `workspace.windowActivated` → `CascadeIndex.onWindowActivated()`, which rotates the group after `CascadeIndex.FOCUS_SETTLE_MS` (400 ms) unless a move started or another window was focused. A press activates a window up to ~315 ms before KWin reports its drag, and a click cannot be told from Alt+Tab, so every activation waits.
- **Context switch:** `070_reaction.js` calls `coordinator.cascades.layoutContext()` before `applyGapsAll()`, which lays out the current context's groups and puts windows that are grouped elsewhere, but not here, back on their full spot. `applyGapsAll()` visits only windows on the current activity and desktop.
- **Joining and leaving:** a drop (spot lookup, or the middle half of a group's slot), Ctrl+} on a window in a group's spot, or a settled tile change into a group's spot (Meta+arrows) joins; a move start (a resize keeps the window in its group; the group re-lays out in the resized tile when it ends) (the dragged window is raised and refocused after the group re-lays out, `bringToFront()`), a maximize (out of a half or quarter group), a restore from maximized (out of a `maximize` group, decided in `settleMoved()`), or a settled tile change to another spot leaves. Maximizing a window joins a `maximize` group; maximized windows can cascade even with `includeMaximized` off (`shouldIgnore(true)`). KWin moving a member is handled `DROP_SETTLE_MS` later (`onMemberMoved()` → `settleMoved()`), so several moves share one layout.
- No cascade data is stored on KWin window objects.

### Gap Algorithm

1. Get the window's work area (screen minus panels)
2. Compute grid anchors: edge positions at 0%, 25%, 50%, 75%, 100% of the work area
3. For each anchor, there are two snapping positions: "closed" (no gap) and "open" (with gap)
4. If any window edge is near an anchor (within tolerance), snap it to the "open" version
5. The gap between windows tiled side by side comes from the half/quarter anchors, which include `gapMid`; neighbouring windows are never resized
6. A window in a KWin 6.8 tile (`window.tile.absoluteGeometry`) is gapped from its tile, not its own edges (`gapTileRect()`): screen edges get the outer gaps, a split within `gapMid + 2` of a quarter/half point gets that anchor, any other split `gapMid / 2` each side. Each split is judged from the tile alone, so the tiles either side always agree
7. Only tiled and maximized windows are gapped; floating windows are never moved or resized

### Signal / State Management

- `WindowCoordinator.block` — prevents re-entrant geometry changes
- `WindowCoordinator.mouseDragOrResizeInProgress` — skips gap recalculation during active user drags; gaps are applied only on `moveResizedChanged` (drag complete)
- `WindowCoordinator.skippedDuringDrag` — windows skipped during a drag (KWin resizes a tile's neighbours with it); re-gapped by `regapSkippedDuringDrag()` once the drop settles
- `WindowCoordinator.cascadeLayout` — true while a cascade group moves and raises its own windows
- A window's spot is refreshed `DROP_SETTLE_MS` after tile, output and maximize changes (`setupSpotSignals()`); a member whose spot changed leaves its group

### Plasma API Compatibility

The codebase bridges Plasma 5 and Plasma 6 APIs:
- Window list: `workspace.windowList()` (P6) vs `workspace.clientList()` (P5)
- Screen: `window.output` (P6) vs `window.screen` (P5)
- The `isPlasma6` global (set in `010_init.js`) gates these branches
- KWin 6.8 rects (`clientArea()`, `frameGeometry`) carry only x/y/width/height; wrap them in `WindowGeometry` before reading `left`/`right`/`top`/`bottom`
- KWin 6.8 removed `window.quickTileMode`; use `window.tile` (with `quickTileMode` only as a pre-6.8 fallback)
- `tests/plasma68.test.js` runs every scenario against both the 6.8 and the 6.5–6.7 API shape

### Configuration

Config is read from KDE's KConfig system via `loadConfig()` in `030_config.js`. It tries multiple API paths for compatibility. Settings defined in `contents/config/main.xml` and exposed through `contents/ui/config.ui`.
