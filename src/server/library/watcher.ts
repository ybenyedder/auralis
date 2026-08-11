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

  const { musicDir } = getConfig();
  // Polling mode bypasses inotify — required when the library is a Docker bind
  // mount written to from the host (or another container, e.g. deemix) since
  // inotify events don't reliably cross that boundary. Costs a periodic stat()
  // sweep of the tree; default interval is 30s.
  const usePolling = process.env.AURALIS_WATCH_POLL === "1";
  const pollInterval = Number(process.env.AURALIS_WATCH_POLL_INTERVAL ?? 30000);
  log.info("starting watch mode", { musicDir, usePolling, pollInterval });

  watcherInstance = watch(musicDir, {
    ignoreInitial: true,
    usePolling,
    interval: pollInterval,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
    ignored: /(^|[\/\\])\../, // ignore dotfiles
  });

  const queueScan = (event: string, path: string) => {
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
