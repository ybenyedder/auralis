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
const fs = require("fs");
const { fork } = require("child_process");

const isDev = !app.isPackaged || process.env.AURALIS_DESKTOP_DEV === "1";
const DEV_URL = process.env.AURALIS_DEV_URL || "http://localhost:4237";

let serverProcess = null;
let mainWindow = null;
let resolvedPort = 0;
// The origin the main window is actually showing — either our spawned local
// server or a host-chosen remote server. Used to re-create the window on macOS
// activate without falling back to the wrong URL.
let currentUrl = null;

// ---------------------------------------------------------------------------
// First-run source configuration.
//
// On the very first launch the user decides whether Auralis runs LOCALLY on this
// machine (it spawns the bundled server and indexes a chosen music folder) or
// connects to a REMOTE Auralis server they already host (just a URL). The choice
// is persisted in the per-user data dir so it is only asked once; it can be
// changed later from Settings (which triggers a relaunch into the setup window).
// ---------------------------------------------------------------------------

function setupConfigPath() {
  return path.join(app.getPath("userData"), "desktop-setup.json");
}

function readSetup() {
  try {
    const cfg = JSON.parse(fs.readFileSync(setupConfigPath(), "utf8"));
    return normalizeSetup(cfg);
  } catch {
    return null;
  }
}

function writeSetup(cfg) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(setupConfigPath(), JSON.stringify(cfg, null, 2));
  } catch (error) {
    console.error("Failed to persist desktop setup:", error);
  }
}

// Validate + normalise a raw setup choice into { mode: "remote", url } or
// { mode: "local", musicDir: string|null }. Returns null when unusable.
function normalizeSetup(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.mode === "remote") {
    let url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    // Strip any trailing slash so origin comparisons stay clean.
    return { mode: "remote", url: parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname) };
  }
  if (raw.mode === "local") {
    const dir = typeof raw.musicDir === "string" && raw.musicDir.trim()
      ? path.resolve(raw.musicDir.trim())
      : null;
    return { mode: "local", musicDir: dir };
  }
  return null;
}

let setupWindow = null;
let setupResolver = null;

function runSetup() {
  return new Promise((resolve) => {
    setupResolver = resolve;
    setupWindow = new BrowserWindow({
      width: 580,
      height: 390,
      resizable: false,
      backgroundColor: "#0f0f0d",
      frame: false,
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    setupWindow.once("ready-to-show", () => setupWindow.show());
    setupWindow.loadFile(path.join(__dirname, "setup.html"));
    // Closing the window without choosing aborts the launch.
    setupWindow.on("closed", () => {
      setupWindow = null;
      if (setupResolver) { setupResolver = null; app.quit(); }
    });
  });
}

// Resolve the setup promise and tear down the chooser window.
function completeSetup(cfg) {
  writeSetup(cfg);
  const resolve = setupResolver;
  setupResolver = null;
  if (setupWindow) {
    setupWindow.removeAllListeners("closed");
    setupWindow.close();
    setupWindow = null;
  }
  if (resolve) resolve(cfg);
}

// Renderer (setup.html) submits the chosen source here.
ipcMain.handle("setup:submit", async (_e, raw) => {
  const cfg = normalizeSetup(raw);
  if (!cfg) return { ok: false, error: "Configuration invalide." };
  completeSetup(cfg);
  return { ok: true };
});
ipcMain.on("setup:cancel", () => app.quit());

// Reset the chosen source and relaunch so the user can re-pick (URL vs folder).
ipcMain.handle("desktop:reconfigure", () => {
  try { fs.unlinkSync(setupConfigPath()); } catch { /* already absent */ }
  app.relaunch();
  app.exit(0);
});

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

async function startServer(musicDir) {
  resolvedPort = await pickPort();
  // The standalone server is shipped as an unpacked resource (see electron-builder).
  const serverDir = path.join(process.resourcesPath, "app", "server");
  const serverEntry = path.join(serverDir, "server.js");

  const env = {
    ...process.env,
    // Run the bundled server with Electron's Node runtime (matches the rebuilt
    // native better-sqlite3 binding).
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(resolvedPort),
    HOSTNAME: "127.0.0.1",
    // Persist the library DB + art cache in the per-user app data directory.
    AURALIS_DATA_DIR: path.join(app.getPath("userData"), "data"),
  };
  // The folder chosen at first run seeds the library root. A later in-app change
  // (Settings → dossier) is persisted to host-settings.json and outranks this.
  if (musicDir) env.AURALIS_MUSIC_DIR = musicDir;

  serverProcess = fork(serverEntry, [], {
    cwd: serverDir,
    env,
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

// Resolve the URL the main window should load from the chosen source. Remote =
// the host's own server (no child process); local = our spawned standalone.
async function boot(cfg) {
  if (isDev) return DEV_URL;
  if (cfg.mode === "remote") return cfg.url;
  return startServer(cfg.musicDir);
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
      // The renderer only loads our own server's UI; sandbox it. The preload uses
      // just contextBridge + ipcRenderer (+ process.platform), all available in a
      // sandboxed preload, so nothing breaks.
      sandbox: true,
    },
  });

  // Open large: start maximised rather than in the default 1320×860 box (that
  // size stays as the restore-down geometry). The user asked for the app to
  // launch big like a full desktop app, not in a small window.
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadURL(url);

  // The window must only ever show OUR server's origin. Any other navigation
  // (a poisoned link, a redirect, a saved-address swap) would otherwise run
  // untrusted remote code in the trusted app context next to the preload bridge.
  const expectedOrigin = (() => { try { return new URL(url).origin; } catch { return null; } })();
  mainWindow.webContents.on("will-navigate", (event, target) => {
    let sameOrigin = false;
    try { sameOrigin = expectedOrigin !== null && new URL(target).origin === expectedOrigin; } catch { sameOrigin = false; }
    if (!sameOrigin) {
      event.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });

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
  const parent = BrowserWindow.getFocusedWindow() ?? mainWindow ?? setupWindow ?? undefined;
  const res = await dialog.showOpenDialog(parent, {
    title: "Choisir le dossier de musique",
    properties: ["openDirectory"],
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

// Defense in depth: clamp EVERY web contents the app creates — deny popups
// (external links go to the system browser) and forbid <webview> embedding, so
// no path can spawn an untrusted frame inside the trusted app.
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
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
      // First launch (or after a reconfigure) asks the user for the source; the
      // saved choice is reused silently on every later launch. Dev always runs
      // against the local dev server.
      let cfg = isDev ? { mode: "local", musicDir: null } : readSetup();
      if (!cfg) cfg = await runSetup();
      currentUrl = await boot(cfg);
      createWindow(currentUrl);
      registerMediaKeys();
    } catch (error) {
      console.error("Failed to start Auralis:", error);
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && currentUrl) {
        createWindow(currentUrl);
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
