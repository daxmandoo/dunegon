let greenworks = null;
let initialized = false;
let initError = "";
let launchLobbyCode = "";

function parseLaunchLobbyCode(argv) {
    if (!Array.isArray(argv)) return "";
    for (let i = 0; i < argv.length; i++) {
        const a = String(argv[i] || "").trim();
        if (a === "+connect_lobby" && argv[i + 1]) return String(argv[i + 1]).trim();
        if (a.indexOf("+connect_lobby=") === 0) return a.slice("+connect_lobby=".length).trim();
        if (a.indexOf("--join-code=") === 0) return a.slice("--join-code=".length).trim();
    }
    return "";
}

launchLobbyCode = parseLaunchLobbyCode(process.argv);

try {
    greenworks = require("greenworks");
    initialized = !!(greenworks && greenworks.init && greenworks.init());
} catch (err) {
    initError = err && err.message ? err.message : "Steamworks not available";
}

function setLobbyCode(code) {
    launchLobbyCode = String(code || "").trim();
    if (!initialized || !greenworks) return { ok: false, reason: initError || "steam_not_initialized" };

    // Set Rich Presence so friends can join by launch arg.
    try {
        if (greenworks.setRichPresence) {
            greenworks.setRichPresence("connect", "+connect_lobby " + launchLobbyCode);
            greenworks.setRichPresence("status", "In lobby");
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err && err.message ? err.message : "set_rich_presence_failed" };
    }
}

function openInviteDialog(connectCode) {
    const code = String(connectCode || launchLobbyCode || "").trim();
    if (!initialized || !greenworks) return { ok: false, reason: initError || "steam_not_initialized" };

    try {
        if (greenworks.activateGameOverlayInviteDialog) {
            // Uses Steam overlay invite dialog; connect string is delivered to invited user.
            greenworks.activateGameOverlayInviteDialog("+connect_lobby " + code);
            return { ok: true };
        }
        if (greenworks.activateGameOverlay) {
            greenworks.activateGameOverlay("Friends");
            return { ok: true };
        }
        return { ok: false, reason: "overlay_api_missing" };
    } catch (err) {
        return { ok: false, reason: err && err.message ? err.message : "invite_dialog_failed" };
    }
}

function getLaunchLobbyCode() {
    return launchLobbyCode;
}

function getStatus() {
    return {
        available: initialized,
        launchLobbyCode: launchLobbyCode,
        error: initError || ""
    };
}

module.exports = {
    getStatus,
    getLaunchLobbyCode,
    setLobbyCode,
    openInviteDialog
};
