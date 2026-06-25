# Security Policy

## Reporting a vulnerability

If you discover a security issue in Auralis, please report it **privately** so it
can be fixed before public disclosure.

- **Email:** [volt@webtvmedia.net](mailto:volt@webtvmedia.net)
- Please include reproduction steps and the affected version/commit.

You'll get an acknowledgement as soon as possible. Please do not open a public
issue for security vulnerabilities.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.2.x   | ✅        |
| 1.1.x   | ✅        |
| 1.0.x   | ✅        |

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
- Set `AURALIS_TOKEN` for an extra shared bearer requirement on `/api`. Only enable
  `AURALIS_TRUST_PROXY=1` when behind a proxy you control (the login rate-limiter
  otherwise ignores spoofable `X-Forwarded-For`).
- Keep the data directory (`AURALIS_DATA_DIR`) — which holds the SQLite database and
  session secret — off any publicly served path.
