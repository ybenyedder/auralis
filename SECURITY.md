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
| 1.0.x   | ✅        |

## Hardening notes for self-hosters

- Set a strong `AURALIS_ADMIN_PASSWORD` (or change the random one printed at first
  boot from **Settings → Account**).
- Put the server behind HTTPS (a reverse proxy such as Caddy or nginx) if it leaves
  your LAN.
- Set `AURALIS_TOKEN` for an extra shared bearer requirement on `/api`.
- Keep the data directory (`AURALIS_DATA_DIR`) — which holds the SQLite database and
  session secret — off any publicly served path.
