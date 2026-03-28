# Signal Cleanup Memo

## Current Implementation
In the current refactored state, `TileableWindow.setupGeometrySignals()` connects several KWin window signals (e.g., `moveResizedChanged`, `frameGeometryChanged`, `maximizedChanged`, etc.) to methods within the `TileableWindow` instance.

```javascript
setupGeometrySignals() {
    this.window.moveResizedChanged.connect(() => { ... });
    // ... other signals
}
```

## Memory Leak Risk
While KWin generally cleans up signal connections when a window object is destroyed, explicit disconnection is safer, especially in long-running scripts. Currently, there is no explicit `destroy()` or `cleanup()` method called when a window is closed.

## Proposed Future Implementation
A "feature-flag" system could be introduced to enable explicit cleanup. 

1.  **Window Closure Tracking**: Connect to `workspace.windowRemoved` or the window's own `windowClosed` signal.
2.  **Cleanup Method**: Implement a `cleanup()` method in `TileableWindow` that disconnects all signals.
3.  **Cache Removal**: The `cleanup()` method should also remove the instance from `TileableWindow._instances` Map.

Example:
```javascript
// In TileableWindow.initialize()
this.window.windowClosed.connect(() => {
    if (config.enableExplicitCleanup) {
        this.cleanup();
    }
});

cleanup() {
    // Disconnect all signals
    // ...
    TileableWindow._instances.delete(this.window.internalId);
}
```

This ensures that the wrapper objects and their signal connections are properly garbage collected when the underlying KWin window is closed.
