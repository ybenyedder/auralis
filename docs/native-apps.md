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

## Android — Capacitor

Source: `capacitor.config.ts`, `mobile/www/index.html`, generated `android/` project,
`scripts/build-apk.mjs`.

The Android app is a native client for a self-hosted Auralis server. A small bundled
screen asks for the server's LAN address on first launch, verifies it via
`/api/health`, then navigates the WebView to your server so the full UI and its
same-origin `/api` load from it. Cleartext is enabled for plain-HTTP LAN servers.

```bash
npm run mobile:add    # one-time: npx cap add android
npm run mobile:sync   # copy connect screen + config into the project
npm run mobile:apk    # → android/app/build/outputs/apk/debug/app-debug.apk
```

Requires a JDK and the Android SDK. The Gradle wrapper fetches Gradle on first run.
A release (signed) build follows the standard Android signing flow in Android Studio
or via Gradle `assembleRelease` with a configured keystore.

## CI

`.github/workflows/ci.yml` runs lint + typecheck + tests + build on every push, and
builds the Linux desktop package and the Android APK on version tags.
