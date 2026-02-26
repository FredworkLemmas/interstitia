/**
 * Log a message to the console if debugMode is enabled.
 * @param {...any} args - The arguments to log.
 */
function debug(...args) {
    if (debugMode) console.log("interstitia:", ...args);
}

/**
 * Log a detailed debug message to the console if fullDebugMode is enabled.
 * @param {...any} args - The arguments to log.
 */
function fulldebug(...args) {
    if (fullDebugMode) {
        console.debug("interstitia:", ...args);
    }
}
