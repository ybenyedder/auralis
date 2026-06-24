<div align="center">

<img src="public/logo.svg" alt="Auralis" width="96" height="96" />

# AURALIS

### Your music. Your server. Your universe.

**The self-hosted music platform that finally feels like it was built for you —
not for an algorithm.**

[![CI](https://github.com/ybenyedder/auralis/actions/workflows/ci.yml/badge.svg)](https://github.com/ybenyedder/auralis/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ybenyedder/auralis?display_name=tag&color=c6a15b)](https://github.com/ybenyedder/auralis/releases/latest)
[![License](https://img.shields.io/badge/License-Attribution-7c5cff.svg)](LICENSE)
[![Donate](https://img.shields.io/badge/Support-PayPal-005ea6.svg?logo=paypal)](https://paypal.me/AdamMezerai)

**[⬇️ Download](https://github.com/ybenyedder/auralis/releases/latest) · [🚀 Quick start](#-get-started-in-60-seconds) · [💛 Support](https://paypal.me/AdamMezerai)**

</div>

---

<div align="center">

<img src="docs/screenshot-player.png" alt="Auralis — fullscreen karaoke player" width="100%" />

<em>One window. Your album art glowing in a field of stars, lyrics lighting up word by word.</em>

</div>

---

## 🌌 Imagine this

You press play. The room dims into a living starfield. Your cover art breathes at
the center, the lyrics ignite **word by word in real time**, and the same beautiful
moment follows you from your laptop to your phone to your living-room screen —
because **one server you own** is powering all of it.

No subscription. No ads. No "we've curated this for you." No company watching what
you listen to at 3 a.m. Just **your** collection, in stunning fidelity, exactly the
way you want it.

That's Auralis. A music platform that respects your taste *and* your privacy — and
looks like a flagship app while doing it.

> 💛 **Auralis is free and open-source.** If it gives you that "finally, something
> made *right*" feeling, a one-time tip keeps it alive →
> **[paypal.me/AdamMezerai](https://paypal.me/AdamMezerai)**

---

## ✨ Why you'll love it

| | |
|---|---|
| 🎤 **Karaoke that actually syncs** | Word-level highlighting with a tunable lead-in. Sing along like it's a music video — because it basically is. |
| 🌠 **A UI that feels premium** | A living starfield backdrop, cover-derived color washes, 12 hand-crafted themes, buttery animations. It doesn't look self-hosted. It looks *shipped*. |
| 🔒 **100% yours** | Local-first. The only request it ever makes is an optional lyrics lookup — and you can switch even that off. Zero telemetry. Forever. |
| 📚 **It reads your library for real** | Real ID3/Vorbis/MP4 tags, embedded cover art, bitrate, codec — parsed and indexed into a fast SQLite + FTS5 search engine. |
| 📝 **Lyrics that become yours** | Missing lyrics? Auralis fetches them from LRCLIB and **writes them back as `.lrc` files next to your music** — so they're self-hosted from then on. |
| 📱 **Everywhere you are** | One server → a polished **web app**, a native **desktop app** (Linux & Windows), and a native **Android app** with a *real* lock-screen notification. |
| ⚡ **Built like a product** | Multi-user accounts, scrypt-hashed passwords, rate-limited login, CSP & security headers, secure range streaming. Enterprise-grade under the hood. |

---

## 📱 Looks just as good in your pocket

<div align="center">

<img src="docs/screenshot-mobile.jpeg" alt="Auralis on Android — karaoke lyrics" width="300" />

<em>Native Android client. Real system media notification. Full karaoke view.
Your whole library, one tap away.</em>

</div>

---

## 🚀 Get started in 60 seconds

```bash
git clone https://github.com/ybenyedder/auralis.git
cd auralis
npm ci
npm run dev          # → http://localhost:3000
```

Point it at your music and you're done:

```env
# .env.local
AURALIS_MUSIC_DIR=/absolute/path/to/Music
```

A scan kicks off automatically and streams progress live. For production:
`npm run build && npm start`.

**First login:** Auralis creates an `admin` account on first boot. **No password is
hard-coded** — it's either your `AURALIS_ADMIN_PASSWORD`, or a random one printed
once to the server logs. Log in, then change it in **Settings → Account**.

---

## 🖥️ Desktop app (Linux & Windows)

A native Electron shell wrapping the same server in a frameless window with custom
controls and OS media keys.

```bash
npm run desktop:build:linux     # → *.deb + *.AppImage
npm run desktop:build:win       # → *.exe (installer + portable)
```

## 📲 Android app

A native client that connects to your self-hosted server. On Android, Auralis ships
the [`@jofr/capacitor-media-session`](https://github.com/jofr/capacitor-media-session)
native plugin so you get a **real system notification + lock-screen controls** —
artwork, scrubbing, play/pause/skip — not the half-working WebView version.

```bash
npm run mobile:sync             # sync web + native plugins
npm run mobile:apk              # → app-debug.apk
```

👉 **Grab the prebuilt APK from the [latest release](https://github.com/ybenyedder/auralis/releases/latest).**

---

## ⚙️ Configuration

Everything has a sane default — see [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `AURALIS_MUSIC_DIR` | `~/Music` | Library root that's scanned & streamed |
| `AURALIS_DATA_DIR` | platform data dir | SQLite DB + art cache |
| `PORT` | `3000` | Server port |
| `AURALIS_ADMIN_PASSWORD` | _(random)_ | Seed the admin password |
| `AURALIS_TOKEN` | _(empty)_ | Require this bearer token on every `/api` call |
| `AURALIS_LYRICS_ONLINE` | `true` | Allow LRCLIB lookups |
| `AURALIS_LYRICS_SIDECAR` | `true` | Write fetched lyrics back as `.lrc` |

---

## 🔒 Hardened by design

No default password · scrypt-hashed credentials · rate-limited login · signed
`httpOnly` sessions · path-traversal-proof streaming · CSP + security headers on
every response · no wildcard CORS on authenticated routes · bounded import endpoint.

Found something? See [SECURITY.md](SECURITY.md).

## 🏗️ Architecture

```
src/server/   framework-agnostic core (config · db · auth · rateLimit · library · lyrics · state)
src/app/api/  thin Next.js route handlers
src/components, store/   the shared UI (powers all three clients)
desktop/      Electron shell    ·    android/ + mobile/www/   native client
```

## 🧪 Develop

```bash
npm run dev · npm run check · npm test · npm run lint · npm run typecheck
```

---

## 💛 Support the dream

Auralis is free, ad-free and tracker-free — and it stays that way. If it earns a
place in your day, fuel the next feature with a one-time tip:

<div align="center">

### → **[paypal.me/AdamMezerai](https://paypal.me/AdamMezerai)** ←

</div>

## 📬 Contact

**Adam Mezerai** — [volt@webtvmedia.net](mailto:volt@webtvmedia.net)

## 📄 License

[Auralis Attribution License](LICENSE) © Adam Mezerai.
**You're free to use, fork and build on Auralis — as long as you credit the author
and link back. No modifying it into your own thing without the tag.** 🏷️
