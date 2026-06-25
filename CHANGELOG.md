# Changelog

All notable changes to Auralis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Engagement, security, ergonomics and homogeneity pass. Adds one forward-only DB
migration (v3 `play_events`, v4 `users.token_version`); no manual data migration.

### Added
- **Engagement loop.** The server already recorded plays/history/favourites but
  surfaced none of it. New read-only `GET /api/stats` exposes a listening **streak**
  (consecutive days, computed from a new append-only `play_events` log), today/week
  play counts and a 7-day sparkline. The Home view gains a **“Mix du jour”** (a
  deterministic per-day shuffle of what you like/play, stable until midnight), a
  **“Reprendre l’écoute”** shelf, an **“À redécouvrir”** shelf (favourites you
  haven’t played lately), a **“Récemment ajoutés”** shelf (new files, from the
  scanner’s `added_at`) and a time-of-day greeting. A streak chip sits in the
  sidebar / mobile header and links to a weekly recap in Insights, and crossing a
  streak milestone (3/7/14/30…) is celebrated once.
- **Continuous playback (autoplay / radio).** When the queue runs out, the player
  now auto-appends a continuation of similar tracks (same artist/genre, else a
  library shuffle) instead of stopping — endless listening, with a Settings toggle
  (on by default).
- **PWA shortcuts + deep links.** The installed icon offers Recherche / Favoris /
  Bibliothèque shortcuts, and the shell resolves `?view=` on load so views are
  shareable and bookmarkable.
- **Onboarding.** An empty library now shows a “Configurer la bibliothèque” CTA on
  the hero instead of a disabled Play button.
- **More discovery + stats.** A **“Découvertes”** shelf (tracks you own but have
  never played), an **“À suivre”** next-track peek in the full-screen player, a
  **listening-time** stat and a **“Tes artistes les plus écoutés”** panel in
  Insights, and an **`L` = like** keyboard shortcut.
- **Sleep timer “fin du titre”** — stop playback at the end of the current track.
- **Resume where you left off.** The current track, play order and playhead position
  are persisted on close and restored (paused) on reopen — press play to continue.
- **Share.** A Share action (native share sheet → clipboard fallback) on the track
  context menu, Now-Playing panel and full-screen player.
- **Empty states are now actionable** — empty queue → shuffle-all, empty
  favourites / history → browse the library.
- **OS lock-screen scrubbing** — `seekbackward` / `seekforward` MediaSession
  handlers (web + native Android) wired to ±10 s.
- **Mini-player Previous button** and full keyboard operability + opaque focus ring
  for the volume slider.

### Security
- **Revocable sessions.** Session tokens embed a `token_version`; changing a
  password bumps it so every previously-issued token (incl. a leaked 30-day one)
  stops validating. The password-change endpoint re-issues a fresh cookie/token so
  the current device stays signed in while others are signed out.
- **CSRF / same-origin guard** on cookie-authenticated mutations (`/api/state`,
  `/api/auth/password`, `/api/auth/users`, `library/source`, `library/scan`).
  Bearer/`?token=` clients are exempt; reverse-proxy setups are honoured via
  `X-Forwarded-Host` and an `AURALIS_ALLOWED_ORIGINS` allowlist.
- **Lyrics egress hardening.** Outbound lookups now use `redirect: "error"`
  (anti-SSRF) + a 512 KB response cap, concurrent resolves are de-duplicated to a
  single request, and forced re-fetches are rate-limited (12/min/user).
- **Native shells.** Electron gains a `will-navigate` origin guard, an app-level
  `web-contents-created` clamp (no popups / `<webview>`) and `sandbox: true`;
  Capacitor sets `allowMixedContent: false`.
- **`/api/health`** trimmed to a minimal liveness probe (no uptime / scan internals
  on the unauthenticated, CORS-open response).

### Fixed
- **Play counts are trustworthy.** A play is counted only after a real listen
  threshold (min 30 s / 50 %), not on track selection, so skips no longer inflate
  counts/recents; the client now reconciles to the server’s authoritative count
  instead of double-incrementing locally.
- **Biased shuffle** (`Math.random() - 0.5`) replaced with the existing Fisher-Yates
  shuffle in Favourites and Album detail.
- **Karaoke timing round-trips** — `serializeLrc` preserves per-word stamps and
  rolls 100 centiseconds into the next second.
- **Wrong-song lyrics** — LRCLIB candidate scoring now weighs title/artist
  similarity (not just duration), so a different track of similar length is no
  longer attached.
- **Admin self password-reset** via the accounts list no longer logs the admin out
  (the session is re-issued, mirroring the self-change endpoint).
- Visualizer canvas no longer tears down ~4×/s; the global keyboard listener binds
  once instead of on every track change; the audio stream route uses one async
  `stat` instead of two blocking sync calls per range request.

### Changed
- **Homogeneity.** A single per-theme `--primary-foreground` (theme `ink`) fixes
  dark text on light accents across all 16 themes; toggle/active states unified on
  `bg-primary/15`; `::selection` and the focus ring now track the active theme.
- **A11y.** Focus trap + restore for the command palette, keyboard-help, context
  menu, full-screen player and visualizer (all proper `role=dialog`); palette is a
  combobox/listbox; `aria-current` on nav; `role=tab` on the now-playing tabs;
  labelled search inputs; toast carries a tone (success/error/info) with an
  assertive live region for errors and an optional **Annuler** action (clearing the
  queue is undoable).
- Reduced-transparency users get an opaque, blur-free fallback for glass themes.
- **Fully French UI.** The context menu, command palette and keyboard-help modal
  (previously English) plus stray English labels/aria are now French throughout,
  and login/password forms carry the right `autoComplete` hints.

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
