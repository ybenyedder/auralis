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
    allowMixedContent: true,
  },
  server: {
    // Serve the bundled connect screen over http://localhost so that reaching a
    // plain-HTTP LAN server is same-scheme (no mixed-content blocking).
    androidScheme: "http",
    cleartext: true,
    // Keep navigation to the user's self-hosted server INSIDE the WebView instead
    // of bouncing out to the system browser.
    allowNavigation: ["*"],
  },
};

export default config;
