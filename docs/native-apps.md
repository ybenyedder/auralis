# Native apps

Auralis ships real native clients alongside the web app. Every command below maps
to committed source and produces an installable artifact.

## Desktop — Electron (Debian / Windows)

Source: `desktop/main.js`, `desktop/preload.js`, `electron-builder.yml`,
`scripts/prepare-desktop.mjs`.

The desktop app spawns the Next.js standalone server (the same self-hosted core,
with its SQLite library, streaming, art and lyrics services) on a private loopback
port and loads it in a frameless window with custom window controls and OS media
keys. The bundled server's `better-sqlite3` binding is recompiled for the Electron
ABI during `desktop:prepare`.

```bash
npm run desktop:build:linux   # → dist-desktop/auralis_<version>_amd64.deb + AppImage
npm run desktop:build:win     # → dist-desktop/Auralis-Setup-<version>.exe (+ portable)
```

The Debian `.deb` installs the app into `/opt/Auralis`, registers a desktop entry
and icon, and declares its GTK/NSS/ALSA runtime dependencies. Building the Windows
target on Linux requires Wine; otherwise build it on Windows.

## Android — native Kotlin/Compose

Source: `android-native/` (Kotlin + Jetpack Compose + media3), `scripts/build-native-apk.mjs`.

The Android app is a fully native client for a self-hosted Auralis server — no
WebView. An onboarding screen asks for the server's LAN address on first launch,
verifies it via `/api/health` and logs in, then the whole UI (home, library, player
with ExoPlayer/media3, lyrics, playlists, insights + the recommendation/mood-recap
features) is rendered natively against the server's `/api`. Cleartext is enabled for
plain-HTTP LAN servers.

```bash
npm run mobile:native   # → android-native/app/build/outputs/apk/debug/app-debug.apk
```

Requires a JDK and the Android SDK (`android-native/local.properties` → `sdk.dir`).
The Gradle wrapper fetches Gradle on first run; pass `--offline` once the cache is
warm. A release (signed) build follows the standard Gradle `assembleRelease` flow
with a configured keystore.

## CI

`.github/workflows/ci.yml` runs lint + typecheck + tests + build on every push, and
builds the Linux desktop package and the Android APK on version tags.
