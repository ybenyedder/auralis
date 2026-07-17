import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework — one less fingerprint for CVE-targeting.
  poweredByHeader: false,
  // Hide the floating Next.js dev-tools badge (the black "N" button) — a dev-only
  // overlay we don't want surfacing in this product.
  devIndicators: false,
  // Allow LAN hosts to load dev resources (phones/other devices hitting `npm run dev`).
  // The extra origin is configurable so no developer's LAN IP is hardcoded in the
  // committed source — set AURALIS_DEV_ORIGIN to your phone-test host if needed.
  allowedDevOrigins: ["localhost", "127.0.0.1", ...(process.env.AURALIS_DEV_ORIGIN ? [process.env.AURALIS_DEV_ORIGIN] : [])],
  // Produce a self-contained server bundle that the Electron desktop shell spawns.
  output: "standalone",
  // Native / Node-only packages must be required at runtime, never bundled.
  serverExternalPackages: ["better-sqlite3", "music-metadata"],
  // The standalone tracer otherwise copies the whole project root into
  // .next/standalone — including build outputs (dist-desktop), the native-app
  // sources (android/mobile) and the prior package — which snowballs the desktop
  // bundle on every rebuild. Exclude everything not needed at runtime.
  // The standalone tracer otherwise copies the whole project root into
  // .next/standalone — including build outputs (dist-desktop), the native-app
  // sources (android/mobile), git history and assorted root files. Confine the
  // trace to this project and prune everything not needed at runtime so the
  // "Finalizing" step stops snowballing (it was copying 5+ GB and stalling).
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "*": [
      // The music library and the runtime data dir (db + art cache) routinely live
      // INSIDE the deployment directory (e.g. ./music, ./data on the self-hosted
      // server). They are read at runtime via dynamic fs paths, so the standalone
      // tracer would otherwise copy the ENTIRE library into .next/standalone —
      // hundreds of GB — and fill the disk. They are never bundle dependencies.
      "music/**",
      "data/**",
      "nas/**",
      "dist-desktop/**",
      "android/**",
      "android-native/**",
      "mobile/**",
      "test/**",
      "tests/**",
      "scripts/**",
      "docs/**",
      ".git/**",
      ".next/cache/**",
      "node_modules/.cache/**",
      "node_modules/@swc/**",
      "node_modules/@esbuild/**",
      "node_modules/esbuild/**",
      "node_modules/typescript/**",
      "node_modules/electron/**",
      "node_modules/electron-builder/**",
      "node_modules/app-builder-bin/**",
      "**/*.apk",
      "**/*.deb",
      "**/*.AppImage",
      "**/*.map",
      "**/*.md",
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
  // Cover art is served by our own route with explicit cache headers; no remote loader.
  images: {
    unoptimized: true,
  },
  // Baseline security headers on every response, including the HTML document
  // (the per-route json() helper only covers API responses). The CSP is
  // intentionally same-origin for media/img/connect to shrink the XSS surface
  // while leaving script/style inline allowances Next's runtime needs.
  async headers() {
    // 'unsafe-eval' is only needed by the dev runtime (HMR / Turbopack eval the
    // module graph); the production bundle never evals, so we drop it there to
    // shrink the XSS surface. 'unsafe-inline' stays — Next's bootstrap scripts
    // are inline and unnonced.
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "connect-src 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Honoured only on HTTPS responses (browsers ignore it over plain HTTP),
          // so it's inert for LAN http:// installs and force-upgrades any TLS
          // deployment for two years, subdomains included.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
