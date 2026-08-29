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
    const onBeforeInstall = (event: Event) => {
      // Keep the browser's cramped infobar out; Settings owns the real button.
      event.preventDefault();
      setDeferredInstallPrompt(event as InstallPromptEvent);
      if (!isStandaloneDisplay()) {
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
      }
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      if (!isStandaloneDisplay()) notify(translate(usePlayer.getState().locale, "toast.appInstalled"));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [notify]);

  return null;
}
