const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("steamBridge", {
    getStatus: function() {
        return ipcRenderer.invoke("steam:getStatus");
    },
    getLaunchLobbyCode: function() {
        return ipcRenderer.invoke("steam:getLaunchLobbyCode");
    },
    setLobbyCode: function(code) {
        return ipcRenderer.invoke("steam:setLobbyCode", code);
    },
    openInviteDialog: function(connectCode) {
        return ipcRenderer.invoke("steam:openInviteDialog", connectCode);
    },
    openFriendsChat: function() {
        return ipcRenderer.invoke("steam:openFriendsChat");
    }
});
