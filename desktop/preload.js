// Preload bridge: exposes a minimal, safe desktop API to the renderer. The web UI
// feature-detects `window.auralisDesktop` to show native window controls and to
// respond to OS media keys. No Node APIs are leaked to the page.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("auralisDesktop", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  // Native folder picker (returns the chosen absolute path, or null if cancelled).
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  onWindowState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("window:state", handler);
    return () => ipcRenderer.removeListener("window:state", handler);
  },
  onMediaKey: (cb) => {
    const handler = (_e, action) => cb(action);
    ipcRenderer.on("media:key", handler);
    return () => ipcRenderer.removeListener("media:key", handler);
  },
});
