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
invoke dev:release          # Bundle then package.sh (creates distributable)
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
| `034_geometry.js` | `TileableWindowGeometry` value object (x, y, width, height) |
| `035_tileable_window.js` | Core logic: `WindowCoordinator`, `TileableWindow`, `ActiveWindow` |
| `070_reaction.js` | Workspace signal wiring (`onRelayouted`) |
| `080_main_loop.js` | Entry point: config load, shortcut registration, window init |

### Core Classes (in `035_tileable_window.js`)

**`WindowCoordinator`** (singleton) — guards against recursive geometry updates. The `block` flag must be set before any programmatic window move/resize and cleared after, to prevent the geometry signal handlers from re-triggering.

**`TileableWindow`** — wraps a `KWin.Window` object. Use the factory `TileableWindow.get(window)` (never `new`) to get a singleton per window. Key methods:
- `applyGaps()` — entry point for the gap algorithm; calls `applyGapsArea()` (snap to screen edges) then `applyGapsWindows()` (snap to adjacent windows)
- `getGridAnchors()` — calculates quarter/half/full snap points for the tiling grid, accounting for gap offsets
- `shouldIgnore()` — checks window against app blacklist/whitelist
- `initialize()` / `setupGeometrySignals()` — connects KWin signals for this window

**`ActiveWindow`** (extends `TileableWindow`) — handles the cascade feature: finding windows occupying the same slot and offsetting them to reveal stacked title bars.

### Gap Algorithm

1. Get the window's work area (screen minus panels)
2. Compute grid anchors: edge positions at 0%, 25%, 50%, 75%, 100% of the work area
3. For each anchor, there are two snapping positions: "closed" (no gap) and "open" (with gap)
4. If any window edge is near an anchor (within tolerance), snap it to the "open" version
5. For inter-window gaps, check neighboring windows and insert spacing between them

### Signal / State Management

- `WindowCoordinator.block` — prevents re-entrant geometry changes
- `WindowCoordinator.mouseDragOrResizeInProgress` — skips gap recalculation during active user drags; gaps are applied only on `moveResizedChanged` (drag complete)
- Cascade state is stored on `window.interstitia_cascade_data` directly on the KWin window object

### Plasma API Compatibility

The codebase bridges Plasma 5 and Plasma 6 APIs:
- Window list: `workspace.windowList()` (P6) vs `workspace.clientList()` (P5)
- Screen: `window.output` (P6) vs `window.screen` (P5)
- The `isPlasma6` global (set in `010_init.js`) gates these branches

### Configuration

Config is read from KDE's KConfig system via `loadConfig()` in `030_config.js`. It tries multiple API paths for compatibility. Settings defined in `contents/config/main.xml` and exposed through `contents/ui/config.ui`.
