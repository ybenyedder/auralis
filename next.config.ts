import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hide the floating Next.js dev-tools badge (the black "N" button) — a dev-only
  // overlay we don't want surfacing in this product.
  devIndicators: false,
  // Allow LAN hosts to load dev resources (phones/other devices hitting `npm run dev`).
  allowedDevOrigins: ["192.168.1.46", "localhost", "127.0.0.1"],
  // Produce a self-contained server bundle that the Electron desktop shell spawns.
  output: "standalone",
  // Native / Node-only packages must be required at runtime, never bundled.
  serverExternalPackages: ["better-sqlite3", "music-metadata"],
  // The standalone tracer otherwise copies the whole project root into
  // .next/standalone — including build outputs (dist-desktop), the native-app
  // sources (android/mobile) and the prior package — which snowballs the desktop
  // bundle on every rebuild. Exclude everything not needed at runtime.
  outputFileTracingExcludes: {
    "*": [
      "dist-desktop/**",
      "android/**",
      "mobile/**",
      "test/**",
      "scripts/**",
      "**/*.apk",
      "**/*.deb",
      "**/*.AppImage",
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
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
        ],
      },
    ];
  },
};

export default nextConfig;
