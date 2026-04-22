const fs = require("fs");
const path = require("path");

let sw = null;
let client = null;
let initialized = false;
let initError = "";
let launchLobbyCode = "";
let currentLobby = null;

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
    sw = require("steamworks.js");
    let appId = undefined;
    try {
        const appIdTxt = fs.readFileSync(path.join(__dirname, "steam_appid.txt"), "utf8").trim();
        const parsed = parseInt(appIdTxt, 10);
        if (!Number.isNaN(parsed) && parsed > 0) appId = parsed;
    } catch (_e) {}

    client = sw.init(appId);
    initialized = !!client;

    if (initialized && client.callback && client.callback.register && sw.SteamCallback) {
        client.callback.register(sw.SteamCallback.GameLobbyJoinRequested, function(evt) {
            // Steam sent an invite/join request while app is running.
            if (!evt || !evt.lobby_steam_id) return;
            client.matchmaking.joinLobby(evt.lobby_steam_id).then(function(lobby) {
                currentLobby = lobby;
                const code = lobby.getData("connect_code") || "";
                if (code) launchLobbyCode = code;
            }).catch(function() {});
        });
    }
} catch (err) {
    initError = err && err.message ? err.message : "Steamworks not available";
}

function ensureSteamLobby(code) {
    if (!initialized || !client) return Promise.resolve({ ok: false, reason: initError || "steam_not_initialized" });

    if (currentLobby) {
        try {
            if (code) currentLobby.setData("connect_code", code);
            currentLobby.setData("name", "Dunegon Lobby");
            currentLobby.setJoinable(true);
            return Promise.resolve({ ok: true, steamLobbyId: String(currentLobby.id) });
        } catch (err) {
            return Promise.resolve({ ok: false, reason: err && err.message ? err.message : "steam_lobby_update_failed" });
        }
    }

    const lobbyType = client.matchmaking && client.matchmaking.LobbyType
        ? client.matchmaking.LobbyType.FriendsOnly
        : 1;

    return client.matchmaking.createLobby(lobbyType, 2).then(function(lobby) {
        currentLobby = lobby;
        if (code) lobby.setData("connect_code", code);
        lobby.setData("name", "Dunegon Lobby");
        lobby.setJoinable(true);
        return { ok: true, steamLobbyId: String(lobby.id) };
    }).catch(function(err) {
        return { ok: false, reason: err && err.message ? err.message : "steam_lobby_create_failed" };
    });
}

function setLobbyCode(code) {
    launchLobbyCode = String(code || "").trim();
    if (!initialized || !client) return Promise.resolve({ ok: false, reason: initError || "steam_not_initialized" });

    try {
        if (client.localplayer && client.localplayer.setRichPresence) {
            client.localplayer.setRichPresence("connect", "+connect_lobby " + launchLobbyCode);
            client.localplayer.setRichPresence("status", "In a Dunegon lobby");
        }
    } catch (_err) {}

    return ensureSteamLobby(launchLobbyCode);
}

function openInviteDialog(connectCode) {
    const code = String(connectCode || launchLobbyCode || "").trim();
    if (!initialized || !client) return Promise.resolve({ ok: false, reason: initError || "steam_not_initialized" });

    return ensureSteamLobby(code).then(function(res) {
        if (!res || !res.ok || !currentLobby) return res || { ok: false, reason: "steam_lobby_missing" };
        try {
            currentLobby.openInviteDialog();
            return { ok: true, steamLobbyId: String(currentLobby.id) };
        } catch (err) {
            try {
                if (client.overlay && client.overlay.activateDialog && client.overlay.Dialog) {
                    client.overlay.activateDialog(client.overlay.Dialog.Friends);
                    return { ok: true, fallback: "friends_overlay" };
                }
            } catch (_err) {}
            return { ok: false, reason: err && err.message ? err.message : "invite_dialog_failed" };
        }
    });
}

function getLaunchLobbyCode() {
    return launchLobbyCode;
}

function getStatus() {
    return {
        available: initialized,
        launchLobbyCode: launchLobbyCode,
        error: initError || "",
        steamLobbyId: currentLobby ? String(currentLobby.id) : ""
    };
}

function getLobbyState() {
    var memberCount = 0;
    var ownerId = "";
    try {
        if (currentLobby) {
            memberCount = Number(currentLobby.getMemberCount() || 0);
            var owner = currentLobby.getOwner && currentLobby.getOwner();
            if (owner && owner.steamId64 != null) ownerId = String(owner.steamId64);
        }
    } catch (_err) {}

    return {
        available: initialized,
        steamLobbyId: currentLobby ? String(currentLobby.id) : "",
        memberCount: memberCount,
        ownerId: ownerId,
        launchLobbyCode: launchLobbyCode,
        error: initError || ""
    };
}

module.exports = {
    getStatus,
    getLaunchLobbyCode,
    getLobbyState,
    setLobbyCode,
    openInviteDialog
};
