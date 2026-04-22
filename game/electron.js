const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const steam = require("./steamworks");

try {
    require("steamworks.js").electronEnableSteamOverlay();
} catch (_err) {}

// Disable Chromium's pointer-lock disclosure banner (the gray bar)
app.commandLine.appendSwitch("disable-features", "PointerLockOptions");

function getConnectLobbyFromArgv(argv) {
    if (!Array.isArray(argv)) return "";
    for (let i = 0; i < argv.length; i++) {
        const a = String(argv[i] || "").trim();
        if (a === "+connect_lobby" && argv[i + 1]) return String(argv[i + 1]).trim();
        if (a.indexOf("+connect_lobby=") === 0) return a.slice("+connect_lobby=".length).trim();
        if (a.indexOf("--join-code=") === 0) return a.slice("--join-code=".length).trim();
    }
    return "";
}

const launchConnectLobby = getConnectLobbyFromArgv(process.argv);

function createWindow() {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        resizable: true,
        title: "Dunegon 3D",
        icon: path.join(__dirname, "icon.ico"),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });

    ipcMain.handle("steam:getStatus", function() {
        return steam.getStatus();
    });
    ipcMain.handle("steam:getLaunchLobbyCode", function() {
        return steam.getLaunchLobbyCode() || "";
    });
    ipcMain.handle("steam:getLobbyState", function() {
        return steam.getLobbyState();
    });
    ipcMain.handle("steam:setLobbyCode", function(_event, code) {
        return steam.setLobbyCode(code || "");
    });
    ipcMain.handle("steam:openInviteDialog", function(_event, connectCode) {
        return steam.openInviteDialog(connectCode || "");
    });
    ipcMain.handle("steam:openFriendsChat", function() {
        shell.openExternal("steam://open/chat");
        return { ok: true };
    });

    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, "index.html"), {
        query: launchConnectLobby ? { connect_lobby: launchConnectLobby } : {}
    });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", function() { app.quit(); });
