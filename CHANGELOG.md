# Changelog

All notable changes to Auralis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-24

First public release. Auralis is a self-hosted, local-first music platform with
web, desktop (Linux/Windows) and Android clients served by one server.

### Added
- **Native Android media notification** via `@jofr/capacitor-media-session` — a real
  system notification + lock-screen controls (play/pause, prev/next, seek, artwork),
  fixing the WebView limitation where the web Media Session was not promoted to a
  system notification on MIUI/Xiaomi. A unified `nativeMedia.ts` layer routes to the
  native plugin on device and to `navigator.mediaSession` on web/desktop.
- **One-time support reminder** and a persistent *Soutenir Auralis* button
  (Settings → About) linking to the project's donation page.
- Project metadata: `LICENSE` (Auralis Attribution License — use/fork freely with
  mandatory credit to the author), `CONTRIBUTING.md`, `SECURITY.md`, this changelog
  and funding info.
- Documentation: marketing-grade README with desktop + mobile screenshots.

### Security
- **Removed the hard-coded default password.** The admin password is now random per
  install (printed once to the logs) or set via `AURALIS_ADMIN_PASSWORD`.
- **Login rate-limiting** with exponential back-off against brute-force.
- **Security headers** (CSP, `X-Frame-Options`, `Referrer-Policy`,
  `X-Content-Type-Options`, `Permissions-Policy`) applied to every response,
  including the HTML document.
- **Removed wildcard CORS** from authenticated API responses; only `/api/health`
  opts back in.
- **Bounded the state-replace endpoint** (favorites / play counts / playlists /
  settings size caps + value validation) to block trivial DoS by an authenticated
  client.

### Changed
- Bumped version to `1.0.0` across the app, API and health endpoint.

### Removed
- Unused dependencies `puppeteer-core` and `tailwindcss-animate`.
