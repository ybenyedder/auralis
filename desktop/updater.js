// Auralis desktop auto-update.
//
// Wires electron-updater to the GitHub Releases the CI publishes on every `v*`
// tag (see .github/workflows/release.yml). The flow is fully automatic: on launch
// — and every few hours after — the app checks GitHub, downloads a newer build in
// the background, and installs it on the next quit. The user is told an update is
// ready and offered an immediate restart, but never has to hunt for a download.
//
// Platform coverage: Windows (NSIS) and the Linux AppImage self-update in place.
// The Linux `.deb` package is updated by the system package manager instead, so
// electron-updater is a no-op there (handled gracefully — errors are swallowed).

const { autoUpdater } = require("electron-updater");
const { dialog } = require("electron");

// Re-check this often while the app stays open (ms). 6 hours keeps long-running
// installs current without hammering the GitHub API.
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let started = false;

function log(...args) {
  console.log("[updater]", ...args);
}

// electron-updater throws on environments it can't update (running unpacked, a
// .deb install with no AppImage env, a portable Windows build). Those are normal,
// not failures the user should see — log and move on.
function checkSafely() {
  autoUpdater.checkForUpdates().catch((err) => {
    log("check skipped:", err && err.message ? err.message : err);
  });
}

// Wire the updater. `mainWindow` is used to parent the "ready to install" dialog.
function initAutoUpdater(getMainWindow) {
  if (started) return;
  started = true;

  // Download the update as soon as one is found; defer the actual install to quit
  // so playback is never interrupted mid-session.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // The .deb/AppImage on Linux ships without an upgrade-blocking signature check;
  // allow downgrades only via explicit republish, never silently.
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (err) => {
    log("error:", err && err.message ? err.message : err);
  });
  autoUpdater.on("update-available", (info) => {
    log("update available:", info && info.version);
  });
  autoUpdater.on("update-not-available", () => {
    log("up to date");
  });
  autoUpdater.on("download-progress", (p) => {
    log(`downloading ${Math.round(p.percent)}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log("update downloaded:", info && info.version);
    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    const opts = {
      type: "info",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      title: "Mise à jour disponible",
      message: `Auralis ${info && info.version ? info.version : ""} est prêt.`,
      detail: "La nouvelle version s'installera au prochain démarrage, ou redémarrez maintenant pour l'appliquer tout de suite.",
    };
    try {
      const { response } = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
      if (response === 0) {
        // quitAndInstall after the current tick so the dialog closes cleanly.
        setImmediate(() => autoUpdater.quitAndInstall());
      }
    } catch (err) {
      log("install prompt failed:", err && err.message ? err.message : err);
    }
  });

  // First check shortly after launch (let the window settle), then on an interval.
  setTimeout(checkSafely, 4000);
  setInterval(checkSafely, RECHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdater };
