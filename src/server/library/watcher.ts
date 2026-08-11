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
  log.info("starting watch mode", { musicDir });

  watcherInstance = watch(musicDir, {
    ignoreInitial: true,
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
