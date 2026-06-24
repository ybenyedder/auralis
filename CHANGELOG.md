# Changelog

All notable changes to Auralis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-06-24

Security, performance and mobile hardening pass. No data migration required.

### Security
- **Admin-only host operations.** Repointing the music directory (`/api/library/source`)
  and triggering scans (`/api/library/scan`) now require an admin account — previously
  any authenticated user could repoint the library at an arbitrary host path and stream
  every audio file on the machine (a privilege-escalation + path-escape). New
  `requireAdmin` guard in `src/server/http.ts`.
- **Per-user library snapshot.** `is_favorite` / `playcount` JOINs are now scoped to the
  requesting user id (`trackSelect(uid)`), closing an IDOR that leaked one account's
  listening activity and favourites into another's view.
- **Admin password no longer logged.** The generated initial password is written to a
  `0600` file (`<dataDir>/INITIAL_ADMIN_PASSWORD.txt`) instead of the structured logs.
- **`/api/health` no longer leaks the absolute `musicDir`** (OS username / FS layout).
- **Brute-force hardening.** `X-Forwarded-For` is trusted only when
  `AURALIS_TRUST_PROXY=1`, and a global per-username failure cap stops IP rotation from
  bypassing the login rate limit.

### Fixed
- **Android media notification / lock-screen controls now actually appear.** Added the
  `POST_NOTIFICATIONS` (Android 13+) and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (Android 14)
  permissions plus a runtime notification-permission request — without them the media
  foreground service was silently killed on modern Android.
- **Mobile auto-reconnect.** The Android connect screen reconnects to a known, reachable
  server automatically instead of asking on every launch.
- **"Add to playlist" works on touch.** The context-menu outside-press handler matched
  only the desktop popover, so taps inside the mobile sheet closed the menu before they
  registered.

### Changed
- **Home redesign** — removed the library-stats grid for a cleaner, less "dashboard" hero.
- **Removed the intrusive donation pop-up** (the *Soutenir Auralis* button remains in Settings).
- **Major render-performance pass** — every store subscription converted to atomic
  selectors, list cards memoised, `content-visibility` on long lists, debounced
  persistence, throttled OS-position updates, isolated full-screen scrubber.
- Bumped version to `1.1.0` across the app, API and health endpoint.

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
