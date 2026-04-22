const { app, BrowserWindow } = require("electron");
const path = require("path");

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
            contextIsolation: true
        }
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, "index.html"), {
        query: launchConnectLobby ? { connect_lobby: launchConnectLobby } : {}
    });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", function() { app.quit(); });
