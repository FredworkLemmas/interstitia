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
    var val = defaultValue;
    var source = "default";
    
    try {
        if (typeof readConfig === 'function') {
            // Standard KWin Scripting API
            // Try Script-interstitia specifically (this matches our main.xml group)
            var gVal = readConfig(key, "MISSING", "Script-interstitia");
            if (gVal !== "MISSING" && gVal !== undefined) {
                val = gVal;
                source = "readConfig(Script-interstitia)";
            } else {
                // Try no group (base section)
                gVal = readConfig(key, "MISSING");
                if (gVal !== "MISSING" && gVal !== undefined) {
                    val = gVal;
                    source = "readConfig(no-group)";
                } else {
                    // Try with General prefix (old Plasma 6 style or from main.xml group)
                    gVal = readConfig("General/" + key, "MISSING");
                    if (gVal !== "MISSING" && gVal !== undefined) {
                        val = gVal;
                        source = "readConfig(General/key)";
                    } else {
                        // Try [General] group
                        gVal = readConfig(key, "MISSING", "General");
                        if (gVal !== "MISSING" && gVal !== undefined) {
                            val = gVal;
                            source = "readConfig(General)";
                        } else {
                            // Try [Script-interstitia][General]
                            gVal = readConfig(key, "MISSING", "Script-interstitia", "General");
                            if (gVal !== "MISSING" && gVal !== undefined) {
                                val = gVal;
                                source = "readConfig(General in Script-interstitia)";
                            }
                        }
                    }
                }
            }
        } else if (typeof KWin !== 'undefined' && typeof KWin.readConfig === 'function') {
            // KWin.readConfig API
            // Try Script-interstitia
            var gVal = KWin.readConfig(key, "MISSING", "Script-interstitia");
            if (gVal !== "MISSING" && gVal !== undefined) {
                val = gVal;
                source = "KWin.readConfig(Script-interstitia)";
            } else {
                // Try no group first
                gVal = KWin.readConfig(key, "MISSING");
                if (gVal !== "MISSING" && gVal !== undefined) {
                    val = gVal;
                    source = "KWin.readConfig(no-group)";
                } else {
                    // Try with prefix
                    gVal = KWin.readConfig("General/" + key, "MISSING");
                    if (gVal !== "MISSING" && gVal !== undefined) {
                        val = gVal;
                        source = "KWin.readConfig(General/key)";
                    } else {
                        gVal = KWin.readConfig(key, "MISSING", "General");
                        if (gVal !== "MISSING" && gVal !== undefined) {
                            val = gVal;
                            source = "KWin.readConfig(General)";
                        } else {
                            gVal = KWin.readConfig(key, "MISSING", "Script-interstitia", "General");
                            if (gVal !== "MISSING" && gVal !== undefined) {
                                val = gVal;
                                source = "KWin.readConfig(General in Script-interstitia)";
                            }
                        }
                    }
                }
            }
        } else if (typeof options !== 'undefined' && options[key] !== undefined) {
            val = options[key];
            source = "options";
        }
    } catch (e) {
        console.log("interstitia: error reading config key " + key + ": " + e);
    }
    
    // Check if debugMode is defined before using it (it's loaded first)
    if (typeof debugMode !== 'undefined' && debugMode) {
        console.log("interstitia: CONFIG_CHECK [" + key + "] = " + val + " (" + source + ")");
    }
    return val;
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

    console.log("interstitia: loaded sizes (l/r/t/b/m):",
        gap.left, gap.right, gap.top, gap.bottom, gap.mid);
}
