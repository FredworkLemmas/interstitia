/**
 * Configuration for gap sizes.
 * @type {{left: number, right: number, top: number, bottom: number, mid: number}}
 */
const gap = { left: 8, right: 8, top: 8, bottom: 8, mid: 8 };

/**
 * Configuration for panel presence on each screen edge.
 * @type {{left: boolean, right: boolean, top: boolean, bottom: boolean}}
 */
const panel = { left: false, right: false, top: false, bottom: false };

/**
 * General script configuration.
 * @type {{includeMaximized: boolean, excludeMode: boolean, includeMode: boolean, applications: string[]}}
 */
const config = { includeMaximized: false, excludeMode: true, includeMode: false, applications: [] };

/**
 * Reads a configuration value from the KWin script settings.
 * @param {string} key - The configuration key to read.
 * @param {any} defaultValue - The default value if the key is not found.
 * @returns {any} The configuration value.
 */
function readConfigValue(key, defaultValue) {
    try {
        if (typeof readConfig === "function") {
            var val = readConfig(key, "MISSING", "Script-interstitia");
            if (val !== "MISSING" && val !== undefined) {
                if (typeof debugMode !== "undefined" && debugMode) {
                    console.log("interstitia: CONFIG_CHECK [" + key + "] = " + val);
                }
                return val;
            }
        }
    } catch (e) {
        console.log("interstitia: error reading config key " + key + ": " + e);
    }
    if (typeof debugMode !== "undefined" && debugMode) {
        console.log("interstitia: CONFIG_CHECK [" + key + "] = " + defaultValue + " (default)");
    }
    return defaultValue;
}

/**
 * Loads configuration values and updates the global settings.
 */
function loadConfig() {
    console.log("interstitia: loadConfig() CALLED");

    debugMode = Boolean(readConfigValue("debugMode", true));
    fullDebugMode = Boolean(readConfigValue("fullDebugMode", false));

    gap.left = parseInt(readConfigValue("gapLeft", 8));
    gap.right = parseInt(readConfigValue("gapRight", 8));
    gap.top = parseInt(readConfigValue("gapTop", 8));
    gap.bottom = parseInt(readConfigValue("gapBottom", 8));
    gap.mid = parseInt(readConfigValue("gapMid", 8));

    panel.left = Boolean(readConfigValue("panelLeft", false));
    panel.right = Boolean(readConfigValue("panelRight", false));
    panel.top = Boolean(readConfigValue("panelTop", false));
    panel.bottom = Boolean(readConfigValue("panelBottom", false));

    config.includeMaximized = Boolean(readConfigValue("includeMaximized", false));
    config.excludeMode = Boolean(readConfigValue("excludeMode", true));
    config.includeMode = Boolean(readConfigValue("includeMode", false));
    config.applications = String(readConfigValue("applications", "")).toLowerCase().split("\n");

    console.log("interstitia: loaded sizes (l/r/t/b/m):", gap.left, gap.right, gap.top, gap.bottom, gap.mid);
}
