// ============================================================================
// INSTALL / PWA DISPLAY HELPERS
// ----------------------------------------------------------------------------
// The browser fires `beforeinstallprompt` once it considers the app
// installable (manifest + service worker + HTTPS). We capture that event in a
// module-level store so SettingsView can surface a real "Installer
// l'application" row, and the capture itself can toast an actionable
// invitation. Everything is client-only by construction (the events only
// exist on window), so this module must never be imported from server code.
// ============================================================================

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Called by PwaRegistrar when the browser offers (or withdraws) an install prompt. */
export function setDeferredInstallPrompt(event: InstallPromptEvent | null): void {
  deferredPrompt = event;
  emit();
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

/** React-friendly subscription: fn is called whenever availability changes. */
export function subscribeInstallAvailability(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Consume the captured prompt: shows the native install dialog.
 * Returns the user's choice, or "unavailable" when nothing was captured
 * (already installed, unsupported browser, or already consumed).
 */
export async function triggerInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return "dismissed";
  }
}

/** True when running as an installed app (PWA / TWA / iOS home-screen). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const media = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : false;
  const iOSHomeScreen = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return media || iOSHomeScreen;
}

/** iOS Safari never fires beforeinstallprompt — the only path is the Share sheet. */
export function isIOSBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchstart" in document.documentElement);
  const iOSHomeScreen = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return iOSDevice && !iOSHomeScreen;
}
