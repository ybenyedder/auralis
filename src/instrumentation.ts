// Runs once when the Next.js server boots (before any request is handled).
// We use it to start the library watcher eagerly so downloads written into the
// music dir from OUTSIDE the app (e.g. deemix writing to a Docker bind-mounted
// SSD) are picked up even when nobody has opened the web UI yet. The library
// route also calls ensureLibraryReady() on first touch, but that only fires
// once a request arrives — instrumentation guarantees the watcher is live from
// boot. Safe to await here: Next invokes register() exactly once at startup.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureLibraryReady } = await import("./server/bootstrap");
    ensureLibraryReady();
  }
}
