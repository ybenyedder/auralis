// Auralis desktop shell (Electron).
//
// The desktop app is a thin native window around the very same self-hosted Auralis
// server that powers the web build. In production it spawns the Next.js standalone
// server (which carries the SQLite library, streaming, art and lyrics services)
// on a private loopback port, waits for it to come up, then loads it in a
// frameless window with native window controls and media-key support.

const { app, BrowserWindow, ipcMain, globalShortcut, shell, Menu, dialog, session } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { fork } = require("child_process");
const { initAutoUpdater } = require("./updater");

const isDev = !app.isPackaged || process.env.AURALIS_DESKTOP_DEV === "1";
const DEV_URL = process.env.AURALIS_DEV_URL || "http://localhost:4237";

let serverProcess = null;
let mainWindow = null;
let resolvedPort = 0;
// The origin the main window is actually showing — either our spawned local
// server or a host-chosen remote server. Used to re-create the window on macOS
// activate without falling back to the wrong URL.
let currentUrl = null;
// Origin of the server WE run on this machine (spawned standalone in local mode,
// the dev server in dev). The dialog:pickFolder guard compares the main window's
// live URL against it so a remote server's page — possibly reached over
// cleartext HTTP — can't pop the native folder picker.
let localServerOrigin = null;

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
    return true;
  } catch (error) {
    console.error("Failed to persist desktop setup:", error);
    return false;
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

// Hosts that can only be "close to the machine": loopback, a private LAN range,
// or mDNS names on the local network. A plain-http base URL is acceptable there
// — that is the intended frictionless NAS-on-the-LAN case.
function isTrustedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  // URL hostnames for IPv6 literals come back without brackets ("::1").
  if (host === "::1") return true;
  const octets = host.split(".");
  if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o))) return false;
  const [a, b] = octets.map(Number);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// Warn before persisting a cleartext http:// base for a host that is clearly NOT
// local: the login password and session token would travel the internet
// unencrypted. Anything LAN-ish (see isTrustedHost) passes without prompting.
async function confirmPlainHttpRemote(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return true; } // normalizeSetup already validated it
  if (parsed.protocol !== "http:" || isTrustedHost(parsed.hostname)) return true;
  try {
    const { response } = await dialog.showMessageBox(setupWindow, {
      type: "warning",
      buttons: ["Continuer sans chiffrement", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      title: "Connexion non chiffrée",
      message: `${parsed.host} utilise HTTP non chiffré.`,
      detail: "Le mot de passe et le jeton de session circuleront en clair sur le réseau. Préférez HTTPS si le serveur est accessible au-delà de votre réseau local.",
    });
    return response === 0;
  } catch {
    // The setup window disappeared mid-prompt — do not persist anything.
    return false;
  }
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
  const persisted = writeSetup(cfg);
  const resolve = setupResolver;
  setupResolver = null;
  if (setupWindow) {
    setupWindow.removeAllListeners("closed");
    setupWindow.close();
    setupWindow = null;
  }
  if (resolve) resolve(cfg);
  return persisted;
}

// Only the first-run chooser window (setup.html, loaded from a file:// URL) may
// drive these. Without this guard a page loaded in the MAIN window — which in
// remote mode is a third-party server, possibly reached over cleartext HTTP —
// could call submitSetup() to silently repoint the app at an attacker's server
// on the next launch (a persistence hijack that bypasses the will-navigate
// origin lock), or call cancelSetup() to quit the app.
function fromSetupWindow(event) {
  return setupWindow !== null && !setupWindow.isDestroyed() && event.sender === setupWindow.webContents;
}

// Renderer (setup.html) submits the chosen source here.
ipcMain.handle("setup:submit", async (event, raw) => {
  if (!fromSetupWindow(event)) return { ok: false, error: "Not allowed." };
  const cfg = normalizeSetup(raw);
  if (!cfg) return { ok: false, error: "Configuration invalide." };
  // Interactive-only check: a saved config replayed at boot must never prompt,
  // which is why this lives in the submit handler and not in normalizeSetup().
  if (cfg.mode === "remote" && !(await confirmPlainHttpRemote(cfg.url))) {
    return { ok: false, error: "Connexion HTTP non confirmée — saisissez une URL HTTPS ou réessayez." };
  }
  // The chosen source still applies to this running session either way (completeSetup
  // resolves with the in-memory cfg) — `persisted: false` only means writeSetup()
  // couldn't save it to disk (e.g. disk full/permissions), so setup will re-run next launch.
  const persisted = completeSetup(cfg);
  return { ok: true, persisted };
});
ipcMain.on("setup:cancel", (event) => { if (fromSetupWindow(event)) app.quit(); });

// Reset the chosen source and relaunch so the user can re-pick (URL vs folder).
ipcMain.handle("desktop:reconfigure", async () => {
  // Destructive: it wipes the saved setup and relaunches into the assistant. In
  // remote mode the "main window" IS the remote page, so unlike the setup:
  // channels there is no sender trust to lean on — confirm through a native
  // dialog the page content cannot fake or suppress.
  const choice = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "question",
    buttons: ["Reconfigurer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    title: "Reconfigurer Auralis",
    message: "Réinitialiser la configuration et relancer l'assistant de configuration ?",
  });
  if (choice.response !== 0) return { ok: false };
  try { fs.unlinkSync(setupConfigPath()); } catch { /* already absent */ }
  // app.exit(0) fires neither before-quit nor will-quit, so the will-quit
  // serverProcess.kill() below would be skipped — leaving the embedded Next
  // server alive on its port with the SQLite DB open, and the relaunched instance
  // would spawn a SECOND server on the same DB. Kill it here first.
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  app.relaunch();
  app.exit(0);
  return { ok: true };
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

// Poll until the spawned server answers /api/health AND identifies itself as
// Auralis. "Some process answers the port" is not enough: anything local could
// have grabbed the port in the window between pickPort() and the first poll
// (TOCTOU), so require the health endpoint's anonymous payload — it returns
// { name: "Auralis", status } to unauthenticated callers (see
// src/app/api/health/route.ts). `crashDetail` lets the caller surface "the
// server died" separately from "the server is slow" instead of blaming the
// timeout for both.
function waitForServer(port, timeoutMs = 30000, crashDetail = () => null) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      // Guard so a single probe can't schedule two retries: on timeout we destroy
      // the request, and destroy() also emits 'error' — without this flag each
      // timeout would double the number of concurrent polling loops.
      let settled = false;
      const once = (fn) => (...args) => { if (settled) return; settled = true; fn(...args); };
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 2000 }, once((res) => {
        // The outer guard is spent the moment the response arrives, so the body
        // handlers carry their OWN: they must not share `settled`, or the 'end'
        // handler would be disarmed by the very callback that attached it.
        let done = false;
        const finish = (fn) => (...args) => { if (done) return; done = true; fn(...args); };
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("error", finish(retry));
        res.on("end", finish(() => {
          let isAuralis = false;
          try {
            isAuralis = res.statusCode < 500 && JSON.parse(body).name === "Auralis";
          } catch { isAuralis = false; }
          if (isAuralis) resolve();
          else retry();
        }));
      }));
      req.on("error", once(retry));
      req.on("timeout", once(() => { req.destroy(); retry(); }));
    };
    const retry = () => {
      // A dead child is a different failure than a slow one: report the crash
      // immediately (and with the exit detail) rather than burning the timeout.
      const crashed = crashDetail();
      if (crashed) return reject(new Error(`Auralis server exited before becoming ready (${crashed})`));
      if (Date.now() > deadline) {
        reject(new Error(`Auralis server still starting: no valid /api/health answer on port ${port} within ${Math.round(timeoutMs / 1000)}s`));
      } else setTimeout(attempt, 300);
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
  // How the child died, if it died — fed to waitForServer so a startup failure
  // that kills the process is reported as a crash, not as a slow start.
  let exitDetail = null;
  serverProcess.on("exit", (code, signal) => {
    // A crash reports either a non-zero code OR a terminating signal (SIGSEGV/OOM
    // give code === null) — treat both as a hard failure so a signal-killed server
    // doesn't leave a silent blank window.
    if (signal || (code !== null && code !== 0)) {
      exitDetail = signal ? `signal ${signal}` : `code ${code}`;
      if (!app.isQuitting && mainWindow) {
        loadErrorPage("Le serveur Auralis s'est arrêté", signal ? `Signal ${signal}` : `Code ${code}`);
      }
    }
  });

  await waitForServer(resolvedPort, 30000, () => exitDetail);
  // Publish the origin for the IPC guards (see localServerOrigin).
  localServerOrigin = `http://127.0.0.1:${resolvedPort}`;
  return localServerOrigin;
}

// Resolve the URL the main window should load from the chosen source. Remote =
// the host's own server (no child process); local = our spawned standalone.
async function boot(cfg) {
  if (isDev) {
    // The dev server is this machine's own Auralis too — treat it as the trusted
    // local origin so dev behaves like a packaged local-mode run.
    localServerOrigin = new URL(DEV_URL).origin;
    return DEV_URL;
  }
  if (cfg.mode === "remote") return cfg.url;
  return startServer(cfg.musicDir);
}

// Render a self-contained error page (data: URL — no network, no origin concern)
// with a "Réessayer" button wired to the desktop:retry channel. Loading a data:
// URL programmatically doesn't trip the will-navigate origin lock.
function loadErrorPage(title, detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0f0d;color:#f3efe6;font-family:system-ui,sans-serif;-webkit-app-region:drag">
    <div style="text-align:center;max-width:30rem;padding:2rem">
      <h2 style="margin:0 0 .5rem;font-size:1.25rem">${esc(title)}</h2>
      <p style="margin:0 0 1.5rem;color:#a8a29a;font-size:.9rem">${esc(detail)}</p>
      <button onclick="window.auralisDesktop&&window.auralisDesktop.retry()" style="-webkit-app-region:no-drag;cursor:pointer;border:0;border-radius:.5rem;padding:.6rem 1.4rem;background:#f3efe6;color:#0f0f0d;font-weight:600;font-size:.9rem">Réessayer</button>
    </div></body>`;
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html)).catch(() => {});
}

// Retry loading the trusted source URL (from the error page's button only — the
// channel just reloads currentUrl, so a remote page invoking it gains nothing).
ipcMain.handle("desktop:retry", () => {
  if (mainWindow && !mainWindow.isDestroyed() && currentUrl) {
    mainWindow.loadURL(currentUrl).catch(() => {});
  }
});

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
  mainWindow.loadURL(url).catch(() => { /* did-fail-load below surfaces this */ });

  // The window must only ever show OUR server's origin. Any other navigation
  // (a poisoned link, a redirect, a saved-address swap) would otherwise run
  // untrusted remote code in the trusted app context next to the preload bridge.
  const expectedOrigin = (() => { try { return new URL(url).origin; } catch { return null; } })();
  const enforceOrigin = (event, target) => {
    let sameOrigin = false;
    try { sameOrigin = expectedOrigin !== null && new URL(target).origin === expectedOrigin; } catch { sameOrigin = false; }
    if (!sameOrigin) {
      event.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  };
  mainWindow.webContents.on("will-navigate", enforceOrigin);
  // will-navigate does NOT fire for server-side HTTP redirects (302). Without this,
  // a MITM on a cleartext remote connection could answer the initial load with a
  // redirect to attacker.tld and run in the trusted window beside the preload
  // bridge — exactly the threat the origin lock exists to stop.
  mainWindow.webContents.on("will-redirect", enforceOrigin);

  // A failed initial load (remote server down/unreachable) otherwise leaves a blank
  // frameless window with no native chrome — the controls are drawn by the web UI
  // that never loaded, so the user can only Alt+F4. Show an actionable error page.
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (a superseded navigation), not a real failure. Only react
    // to the top-level document failing.
    if (!isMainFrame || errorCode === -3) return;
    loadErrorPage(`Impossible de joindre le serveur Auralis`, errorDescription || `Code ${errorCode}`);
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
  // register() returns false when the OS refuses the binding — usually another
  // app already owns the media keys. Ownership can change between launches, so
  // this is diagnostic only: collect the failures and log them, never nag with
  // UI at startup.
  const failed = [];
  const bind = (accel, action) => {
    if (!globalShortcut.register(accel, send(action))) failed.push(accel);
  };
  bind("MediaPlayPause", "playpause");
  bind("MediaNextTrack", "next");
  bind("MediaPreviousTrack", "prev");
  if (failed.length) console.warn(`Media keys not registered (likely owned by another app): ${failed.join(", ")}`);
}

// Window-control IPC for the frameless chrome.
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

// Native folder picker so the host can repoint the music library from Settings.
// The native dialog is a sensitive surface (a page can use it to probe the
// filesystem or lend legitimacy to a phishing path), and in remote mode the
// "main window" IS a third-party page — so only answer the setup window, or a
// main window whose CURRENT url is still our locally spawned server's origin.
ipcMain.handle("dialog:pickFolder", async (event) => {
  let fromLocalMain = false;
  if (mainWindow && !mainWindow.isDestroyed() && localServerOrigin && event.sender === mainWindow.webContents) {
    try { fromLocalMain = new URL(mainWindow.webContents.getURL()).origin === localServerOrigin; }
    catch { fromLocalMain = false; } // e.g. the error page's data: URL has no origin
  }
  if (!fromSetupWindow(event) && !fromLocalMain) return null;
  try {
    const parent = BrowserWindow.getFocusedWindow() ?? mainWindow ?? setupWindow ?? undefined;
    const res = await dialog.showOpenDialog(parent, {
      title: "Choisir le dossier de musique",
      properties: ["openDirectory"],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  } catch (error) {
    console.error("Folder picker failed:", error);
    return null;
  }
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
    // Focus whichever window is live — during first-run only the setup chooser
    // exists, so focusing mainWindow alone would make a second launch look dead.
    const win = mainWindow ?? setupWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized?.()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    // Auralis needs no device permissions (it only plays audio it fetches over
    // HTTP). Deny every permission request/check so that content loaded in the
    // window — notably a remote server's UI in remote mode — cannot prompt for or
    // silently obtain camera, microphone, geolocation, notifications, etc. The
    // server's own Permissions-Policy only covers the local server; this covers
    // the remote case too.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    try {
      // First launch (or after a reconfigure) asks the user for the source; the
      // saved choice is reused silently on every later launch. Dev always runs
      // against the local dev server.
      let cfg = isDev ? { mode: "local", musicDir: null } : readSetup();
      if (!cfg) cfg = await runSetup();
      currentUrl = await boot(cfg);
      createWindow(currentUrl);
      registerMediaKeys();
      // Self-update from the GitHub Releases the CI publishes. No-op in dev /
      // unpackaged runs; updates the app silently in the background otherwise.
      if (!isDev) initAutoUpdater(() => mainWindow);
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
