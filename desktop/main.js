// Auralis desktop shell (Electron).
//
// The desktop app is a thin native window around the very same self-hosted Auralis
// server that powers the web build. In production it spawns the Next.js standalone
// server (which carries the SQLite library, streaming, art and lyrics services)
// on a private loopback port, waits for it to come up, then loads it in a
// frameless window with native window controls and media-key support.

const { app, BrowserWindow, ipcMain, globalShortcut, shell, Menu, dialog } = require("electron");
const path = require("path");
const http = require("http");
const { fork } = require("child_process");

const isDev = !app.isPackaged || process.env.AURALIS_DESKTOP_DEV === "1";
const DEV_URL = process.env.AURALIS_DEV_URL || "http://localhost:3000";

let serverProcess = null;
let mainWindow = null;
let resolvedPort = 0;

function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Auralis server did not start in time"));
      else setTimeout(attempt, 300);
    };
    attempt();
  });
}

async function startServer() {
  if (isDev) return DEV_URL;

  resolvedPort = await pickPort();
  // The standalone server is shipped as an unpacked resource (see electron-builder).
  const serverDir = path.join(process.resourcesPath, "app", "server");
  const serverEntry = path.join(serverDir, "server.js");

  serverProcess = fork(serverEntry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      // Run the bundled server with Electron's Node runtime (matches the rebuilt
      // native better-sqlite3 binding).
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(resolvedPort),
      HOSTNAME: "127.0.0.1",
      // Persist the library DB + art cache in the per-user app data directory.
      AURALIS_DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  serverProcess.on("exit", (code) => {
    if (code && code !== 0 && !app.isQuitting) {
      // Surface a hard failure rather than a blank window.
      if (mainWindow) mainWindow.loadURL(`data:text/html,<body style="background:%230f0f0d;color:%23f3efe6;font-family:sans-serif;padding:2rem"><h2>Auralis server stopped (code ${code})</h2></body>`);
    }
  });

  await waitForServer(resolvedPort);
  return `http://127.0.0.1:${resolvedPort}`;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0f0f0d",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(url);

  // External links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });

  const emitWindowState = () => mainWindow?.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function registerMediaKeys() {
  const send = (action) => () => mainWindow?.webContents.send("media:key", action);
  globalShortcut.register("MediaPlayPause", send("playpause"));
  globalShortcut.register("MediaNextTrack", send("next"));
  globalShortcut.register("MediaPreviousTrack", send("prev"));
}

// Window-control IPC for the frameless chrome.
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

// Native folder picker so the host can repoint the music library from Settings.
ipcMain.handle("dialog:pickFolder", async () => {
  const res = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Choisir le dossier de musique",
    properties: ["openDirectory"],
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      const url = await startServer();
      createWindow(url);
      registerMediaKeys();
    } catch (error) {
      console.error("Failed to start Auralis:", error);
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && resolvedPort) {
        createWindow(isDev ? DEV_URL : `http://127.0.0.1:${resolvedPort}`);
      }
    });
  });
}

app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
