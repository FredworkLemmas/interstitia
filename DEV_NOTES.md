# Developer Notes - Interstitia

This document details the design, architecture, and implementation of Interstitia, a KWin script for managing window gaps and cascading.

## Architecture Overview

### Modularization & Bundling
Since KWin scripts are typically single-file JavaScript execution environments without standard `import`/`export` support, Interstitia uses a custom bundling process.
- **Source Files**: Logical units are separated into multiple files in `contents/code/`.
- **Bundler**: A Python-based task runner (`tasks.py` using `invoke`) concatenates these files into a single `contents/code/main.js`.
- **Order Matters**: The concatenation order is critical because dependencies are implicit (global functions/variables). The order defined in `tasks.py` is:
    1. `01_init.js` (Global state & entry)
    2. `02_logging.js` (Debug utilities)
    3. `03_config.js` (Configuration loading)
    4. `04_windowing.js` (Geometry & Window utilities)
    5. `05_gaps.js` (Core gap logic)
    6. `06_cascade.js` (Cascading logic)
    7. `07_reaction.js` (Event handlers)
    8. `08_main_loop.js` (Script initialization)

### State Management
- **Global Flags**: Uses `block` to prevent recursive event loops when the script itself modifies window geometry.
- **Mouse Tracking**: `mouseDragOrResizeInProgress` and related variables prevent "fighting" with the user during active window manipulation.
- **Metadata**: Stores ephemeral state (like cascade info) directly on the `KWin.Window` object using a custom property `interstitia_cascade_data`.

---

## Sources

### `01_init.js`
- **Purpose**: Establishes the initial environment and global state.
- **Key Logic**: Detects Plasma version (Plasma 6 vs 5) and initializes global control flags like `block` and mouse tracking variables.

### `02_logging.js`
- **Purpose**: Provides throttled and conditional logging.
- **Key Logic**: Implements `debug()` and `fullDebug()` which respect `debugMode` and `fullDebugMode` flags.

### `03_config.js`
- **Purpose**: Bridges KWin's configuration system with the script's internal logic.
- **Key Logic**: 
    - Implements a robust `readConfigValue` function that attempts to find settings across multiple possible KWin API locations and groups (`Script-interstitia`, `General`, etc.), ensuring compatibility across Plasma versions.
    - Maps `KConfig` values to a global `config` object. 
    - Handles blacklisting/whitelisting of window classes via `config.applications`.

### `04_windowing.js`
- **Purpose**: Abstracted utility functions for window properties and geometry.
- **Key Logic**: 
    - Normalizes API differences between Plasma 5 and 6 (e.g., `frameGeometry` vs `geometry`).
    - Includes `TileableWindowGeometry` class to handle geometry operations (copy, equality, approximate equality).
    - Implements relationship checks like `onSameDesktop`, `isOnSameActivity`, and `onSameOutput`.

### `05_gaps.js`
- **Purpose**: The engine for calculating and applying window gaps.
- **Key Logic**: 
    - `applyGaps()`: The main entry point for a single window. It implements a 750ms "cooldown" for mouse drags to prevent excessive calculations during resizing.
    - `applyGapsArea()`: Calculates gaps relative to screen edges and panels. It uses a "grid" system to determine if a window edge is "anchored" to a screen boundary.
    - `applyGapsWindows()`: Iterates through all windows to find neighbors. When two windows are adjacent, it splits the `gap.mid` space between them, adjusting both windows' geometries simultaneously.
    - Uses a `clientGeometries` map (passed to sub-functions) to perform batch updates. Only after all calculations are done are the actual `window.frameGeometry` properties updated, which minimizes flickering.

### `06_cascade.js`
- **Purpose**: Implements the window cascading feature (Ctrl+} / Ctrl+{).
- **Key Logic**: 
    - Identifies "slots" (windows with nearly identical geometry).
    - `applyCascadeGroup()`: Iteratively offsets windows in a stack so title bars are visible.
    - Stores `cascadeState` in window metadata to persist across gapping updates.

### `07_reaction.js`
- **Purpose**: Connects KWin events to script actions.
- **Key Logic**: 
    - `onAdded()`: Initializes new windows.
    - `onRegeometrized()`: Watches for `frameGeometryChanged`, `maximizedChanged`, etc.
    - `onRelayouted()`: Responds to workspace-wide changes like desktop switching or screen count changes.

### `08_main_loop.js`
- **Purpose**: Orchestrates the startup sequence.
- **Key Logic**: Loads config, registers global shortcuts, and performs the initial pass on existing windows.

---

## Future Goals & Architectural Evolution

### Planned: Class-based Activity/Screen Management
The current architecture relies heavily on global state and top-down iteration through `workspace.windowList()`. To move toward a more "tractable" model:

1.  **Activity/Screen Controllers**:
    - Create classes that "own" a specific Activity/Screen combination.
    - These controllers would maintain their own filtered list of windows, reducing the complexity of the "find adjacent windows" logic.
2.  **Window Wrapper Class**:
    - Instead of attaching metadata directly to `KWin.Window` (which can be fragile), wrap them in an `InterstitiaWindow` class that manages its own state, original geometry, and gap calculations.
3.  **Slot Management**:
    - Explicitly define a `Slot` class to manage stacked windows. This would stabilize the cascading function by treating a stack of windows as a single unit for gapping purposes.

### Questions for Clarification
- **Cascading Stability**: You mentioned leveraging the organized data model to stabilize cascading. Is the primary instability currently related to windows "falling out" of the stack when resized, or is it related to the order of operations between gapping and cascading?
- **Data Persistence**: Do we need cascade state to persist across KWin restarts, or is ephemeral per-session state sufficient?
- **Conflict Resolution**: How should the script handle cases where KWin's own "Edge Snap" or "Tiling" (Plasma 6) conflicts with our gap calculations?

### Suggestions
- **Event Debouncing**: As the script grows, implementing a formal debounce for `applyGapsAll` might be necessary to avoid CPU spikes during rapid window changes.
- **Unit Testing**: Leveraging the existing Jest setup to test the `04_windowing.js` logic in isolation (using mocks) will be crucial as the data model becomes more complex.
