// One-time library bootstrap. The first time the API is touched on a fresh data
// directory, kick off a background scan so the app fills itself without the user
// having to press anything.

import { getDb } from "./db";
import { runScan, getScanProgress } from "./library/scanner";
import { initWatcher } from "./library/watcher";

let kicked = false;

export function ensureLibraryReady(): void {
  if (kicked) return;
  kicked = true;
  try {
    const db = getDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM tracks").get() as { n: number }).n;
    const scannedAt = db.prepare("SELECT value FROM settings WHERE key = 'scannedAt'").get();
    if (count === 0 && !scannedAt && getScanProgress().status !== "scanning") {
      void runScan();
    }
    
    initWatcher();

    // Re-download any title the server downloaded whose file has since
    // vanished (wiped downloads folder, unmounted volume...). Lazy import: the
    // download engine is heavy and must not load on every request path just
    // for this check.
    void import("./library/downloader")
      .then((m) => {
        m.restoreLostDownloads();
      })
      .catch(() => {
        /* never block bootstrap on the download engine */
      });
  } catch {
    // never block the request on bootstrap problems
  }
}
