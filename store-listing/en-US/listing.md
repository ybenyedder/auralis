# Google Play Store listing — en-US (default locale)

All copy below fits the Play Console limits. Assets in this folder:

| File | Spec | Play Console field |
|---|---|---|
| `icon-512.png` | 512×512 PNG, opaque full-bleed | Icône de l'application |
| `feature-graphic.png` | 1024×500 PNG | Image de présentation |
| `screenshots/01-home.png` … `07-equalizer.png` | 1080×1920 (9:16) PNG | Captures d'écran pour téléphone (2–8) |

Regenerate the feature graphic with `bun scripts/gen-store-listing.mjs`.
Screenshots were captured from the web app (iPhone-class viewport @2x) against
the English demo library (`scripts/gen-sample-music-en.sh`).

---

## App name (30 max)

```
Auralis
```

## Short description (80 max — 72 used)

```
Self-hosted music player. Your music, your server, every device — private.
```

## Full description (4000 max — ~1450 used)

```
Your music. Your server. Zero compromise.

Auralis is a self-hosted music server and player for people who own their music. Run the server on your own hardware — a home server, a NAS, a VPS — and stream your entire library to any device, anywhere. No accounts with big tech. No ads. No tracking. Your collection stays under your control.

YOUR LIBRARY, EVERYWHERE
• Stream your personal collection from your own Auralis server
• Full-quality playback, with a 6-band equalizer and presets
• Background playback with lock-screen and notification controls
• Android Auto support — browse and play from your car's dashboard

BUILT FOR LISTENING
• Smart Radio: an endless mix built from your listening history
• Favorites, playlists and powerful library filters
• Synced lyrics with word-by-word highlighting
• Sleep timer and crossfade for smooth nights

CONNECT ACROSS DEVICES
• Auralis Connect: control the music playing on your PC from your phone
• Playback position and queue stay in sync across your devices
• Multiple accounts on one server — each with their own profile

PRIVATE BY DESIGN
• No analytics, no ads, no trackers, no third-party SDKs
• Your credentials never leave your device — except to connect to YOUR server
• Open source: web, Android, iOS and desktop clients

NOTE: Auralis is a client for a self-hosted Auralis server. Set yours up in minutes at github.com/ybenyedder/auralis, then sign in with your server URL, username and password.
```

## Release notes (500 max — first release)

```
First Auralis release on Google Play!

Connect the app to your self-hosted Auralis server and stream your music anywhere:
• Background playback + lock-screen controls
• Connect sync across devices (phone ↔ PC)
• Favorites, playlists, smart radio
• Synced lyrics, equalizer
• FR/EN interface, dark mode

Your music, your server: 100% private.
```

---

## Screenshot captions (optional, 100 max each)

1. `01-home.png` — Your library, your daily mixes, on any screen
2. `02-player.png` — Full-screen player with artwork and controls
3. `03-lyrics.png` — Synced lyrics with word-by-word highlighting
4. `04-browse.png` — Browse albums, artists and genres
5. `05-search.png` — Find anything in seconds
6. `06-radio.png` — Smart Radio: an endless mix from your history
7. `07-equalizer.png` — Six-band equalizer with presets
