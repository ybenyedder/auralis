# Security Policy

## Reporting a vulnerability

If you discover a security issue in Auralis, please report it **privately** so it
can be fixed before public disclosure.

- **Email:** [volt@webtvmedia.net](mailto:volt@webtvmedia.net)
- Please include reproduction steps and the affected version/commit.

You'll get an acknowledgement as soon as possible. Please do not open a public
issue for security vulnerabilities.

## Supported versions

Only the latest release is supported. Auralis is a single-maintainer, fast-moving
self-hosted project with no long-term-support branches — please upgrade to the
latest tag before reporting an issue.

## Hardening notes for self-hosters

- Set a strong `AURALIS_ADMIN_PASSWORD` (or change the random one written to
  `INITIAL_ADMIN_PASSWORD.txt` at first boot from **Settings → Account**, then delete
  that file). Changing a password now **revokes all existing sessions** for that
  account (a leaked token can't outlive a password reset).
- Put the server behind HTTPS (a reverse proxy such as Caddy or nginx) if it leaves
  your LAN. Cookie-authenticated writes are CSRF-guarded (same-origin Origin check).
  If your proxy **rewrites the `Host` header** and doesn't forward the public host in
  `X-Forwarded-Host`, set `AURALIS_ALLOWED_ORIGINS=https://your.public.host` so
  legitimate writes aren't rejected with `403`.
- Over HTTPS the session cookie is automatically flagged `Secure` (detected from the
  request scheme or `X-Forwarded-Proto`), so it is never sent back over cleartext;
  plain-HTTP LAN installs keep working. An `HSTS` header is emitted (honoured only on
  HTTPS responses). `X-Powered-By` is suppressed and `/api/health` withholds the exact
  version and library size from anonymous callers to limit fingerprinting.
- Set `AURALIS_TOKEN` for an extra shared bearer requirement on `/api`. Only enable
  `AURALIS_TRUST_PROXY=1` when behind a proxy you control (the login rate-limiter
  otherwise ignores spoofable `X-Forwarded-For`).
- Keep the data directory (`AURALIS_DATA_DIR`) — which holds the SQLite database and
  session secret — off any publicly served path.

## Native clients

- The Android app ships as a **release** (non-debuggable) build with backups disabled,
  and its in-app updater installs a new APK only after verifying it carries the **same
  signing certificate** as the running app (a substituted release asset is rejected
  before install).
- The desktop (Electron) shell runs the renderer with `contextIsolation`, `sandbox`,
  and no Node integration; it denies all device-permission requests and confines
  navigation to the configured origin.
