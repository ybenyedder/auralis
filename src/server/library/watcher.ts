import { watch, FSWatcher } from "chokidar";
import { getConfig } from "../config";
import { runScan, getScanProgress } from "./scanner";
import { createLogger } from "../logger";

const log = createLogger("watcher");
let watcherInstance: FSWatcher | null = null;
let timeout: NodeJS.Timeout | null = null;

export function initWatcher() {
  if (process.env.AURALIS_WATCH !== "1") return;
  if (watcherInstance) return;

  const { musicDir, dataDir } = getConfig();
  // Polling mode bypasses inotify — required when the library is a Docker bind
  // mount written to from the host (or another container, e.g. deemix) since
  // inotify events don't reliably cross that boundary. Costs a periodic stat()
  // sweep of the tree; default interval is 30s.
  const usePolling = process.env.AURALIS_WATCH_POLL === "1";
  const pollInterval = Number(process.env.AURALIS_WATCH_POLL_INTERVAL ?? 30000);
  log.info("starting watch mode", { musicDir, usePolling, pollInterval });

  // Ignore dotfiles AND the data dir. When the data dir lives INSIDE the music
  // tree (e.g. /media/music/auralis_data mounted at both /data and visible
  // under /music), the SQLite WAL/SHM churn would otherwise fire a scan every
  // poll — pure waste since those aren't music files.
  const ignorePaths: Array<RegExp | ((p: string) => boolean)> = [/(^|[\/\\])\../];
  if (dataDir) {
    const norm = dataDir.replace(/\/+$/, "");
    ignorePaths.push((p: string) => p === norm || p.startsWith(norm + "/"));
  }

  watcherInstance = watch(musicDir, {
    ignoreInitial: true,
    usePolling,
    interval: pollInterval,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
    ignored: ignorePaths,
  });

  const queueScan = (event: string, path: string) => {
    // Only react to audio files or directory add/remove. A bind-mounted library
    // often colocates non-music churn (SQLite WAL/SHM when the data dir sits
    // inside the music tree, cover.jpg, .lrc sidecars, logs) which would
    // otherwise retrigger a full scan on every poll. The scanner itself reads
    // tags for every audio file, so gating on extension here is both cheap and
    // sufficient.
    const isDir = event === "addDir" || event === "unlinkDir";
    const isAudio = /\.(mp3|flac|opus|ogg|oga|m4a|aac|wma|wav|alac|aiff?|dsf|dsd)$/i.test(path);
    if (!isDir && !isAudio) return;

    log.info("fs event detected", { event, path });
    if (timeout) clearTimeout(timeout);
    // Debounce the full scan by 5 seconds
    timeout = setTimeout(() => {
      if (getScanProgress().status !== "scanning") {
        log.info("triggering scan from watch mode");
        void runScan();
      } else {
        log.info("scan already in progress, skipping trigger");
      }
    }, 5000);
  };

  watcherInstance.on("all", queueScan);
  watcherInstance.on("error", (error: unknown) => log.error("watcher error", { error }));
}
