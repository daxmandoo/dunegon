const { app, BrowserWindow } = require("electron");
const path = require("path");

// Disable Chromium's pointer-lock disclosure banner (the gray bar)
app.commandLine.appendSwitch("disable-features", "PointerLockOptions");

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
    win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", function() { app.quit(); });
