"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player";
import {
  setDeferredInstallPrompt,
  triggerInstallPrompt,
  isStandaloneDisplay,
  type InstallPromptEvent,
} from "@/lib/auralis/install";
import { translate } from "@/lib/auralis/messages";

// localStorage flag marking this browser as already invited: the install toast
// used to pop on EVERY load that received a beforeinstallprompt, which reads as
// nagging. Once set, only the Settings section offers installation.
const INSTALL_TOAST_FLAG = "auralis.installToastDismissed";

function installToastAlreadyDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_TOAST_FLAG) === "1";
  } catch {
    // Storage unavailable (private mode, hardened WebView): keep the old flow.
    return false;
  }
}

function markInstallToastDismissed() {
  try {
    window.localStorage.setItem(INSTALL_TOAST_FLAG, "1");
  } catch {
    // Storage unavailable — worst case the invitation shows again next load.
  }
}

// ============================================================================
// PWA registrar — mounts once from the root layout.
// ----------------------------------------------------------------------------
// • Registers the service worker in PRODUCTION only (dev keeps a full network
//   pass-through so HMR + the standalone scanner never fight a cache).
// • Captures `beforeinstallprompt` (suppressing Chrome's mini infobar) so the
//   Settings "Application" section owns the install affordance, and surfaces
//   a one-time actionable toast so mobile visitors discover it.
// ============================================================================
export function PwaRegistrar() {
  const notify = usePlayer((s) => s.notify);

  // Service worker: production + secure context (PWA installs, TWA webviews).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort — the app works without it */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // Install prompt capture + one-time actionable invitation.
  useEffect(() => {
    let stopWatchingToast: (() => void) | null = null;
    const onBeforeInstall = (event: Event) => {
      // Keep the browser's cramped infobar out; Settings owns the real button.
      event.preventDefault();
      setDeferredInstallPrompt(event as InstallPromptEvent);
      if (isStandaloneDisplay()) return;
      // One invitation per browser: skip once it was dismissed or installed.
      if (installToastAlreadyDismissed()) return;
      const { locale } = usePlayer.getState();
      notify(translate(locale, "toast.installPrompt"), {
        tone: "info",
        action: {
          label: translate(locale, "toast.installAction"),
          run: () => {
            void triggerInstallPrompt();
          },
        },
      });
      // The single-slot toast model has no dismiss callback (ToastHost just
      // clears the store), so watch it instead: the moment our toast leaves
      // the store — closed, Install clicked, auto-timed out or replaced —
      // treat the invitation as seen and remember it for this browser.
      const shownId = usePlayer.getState().toast?.id;
      if (shownId != null) {
        const unsubscribe = usePlayer.subscribe((state) => {
          if (state.toast?.id === shownId) return;
          unsubscribe();
          stopWatchingToast = null;
          markInstallToastDismissed();
        });
        stopWatchingToast = unsubscribe;
      }
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      // Installed: never auto-show the invitation in this browser again.
      markInstallToastDismissed();
      if (!isStandaloneDisplay()) notify(translate(usePlayer.getState().locale, "toast.appInstalled"));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      stopWatchingToast?.();
    };
  }, [notify]);

  return null;
}
