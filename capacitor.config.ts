import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a native client for a self-hosted Auralis server. It boots a
// small bundled "connect" screen (mobile/www) that remembers the server address and
// navigates the WebView to it; the full UI and its same-origin /api are then served
// by the user's own server. Cleartext is enabled so a plain-HTTP LAN server works.
const config: CapacitorConfig = {
  appId: "local.auralis.client",
  appName: "Auralis",
  webDir: "mobile/www",
  android: {
    // Don't let an HTTPS server's page pull in plain-HTTP sub-resources. Pure-HTTP
    // LAN servers (cleartext below) and pure-HTTPS servers are both unaffected;
    // this only blocks the genuinely-mixed case a MITM could exploit.
    allowMixedContent: false,
  },
  server: {
    // Serve the bundled connect screen over http://localhost so that reaching a
    // plain-HTTP LAN server is same-scheme (no mixed-content blocking).
    androidScheme: "http",
    cleartext: true,
    // NOTE: this is a CLIENT for a user-chosen self-hosted server, so navigation
    // can't be pinned to a fixed allowlist at build time — the operator points it
    // at their own origin. "*" keeps that navigation inside the WebView (instead of
    // bouncing to the system browser). Prefer an HTTPS server on untrusted networks;
    // cleartext exists only so a plain-HTTP LAN server works.
    allowNavigation: ["*"],
  },
};

export default config;
