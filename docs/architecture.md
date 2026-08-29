# Auralis Architecture

> Where the seams are, and what each module owns. Start here when navigating the
> codebase. The design system (palette, modes, components) is documented
> separately in [design-system.md](./design-system.md).

## High-level shape

Auralis is a **single-process Next.js 16 app** (App Router, standalone output)
that doubles as a **local music server**. One server powers the web app, the
Electron desktop shell (which forks the same standalone `server.js`), and the
native Android/iOS clients (which point at the HTTP API).

```
                 ┌─────────────────────────────────────────┐
   browser ──────▶                                          │
   electron ────▶  Next.js server (port 4237)               │
   android ─────▶  ┌────────────┐  ┌─────────────────────┐ │
   ios ─────────▶  │ src/server │  │ src/app/api/*       │ │
                   │ (domain)   │◀▶│ (thin controllers)  │ │
                   └─────┬──────┘  └─────────────────────┘ │
                         │                                   │
                   ┌─────▼──────┐  ┌─────────────────────┐ │
                   │ SQLite (DB)│  │ music dir (FS)      │ │
                   │ + FTS5     │  │ + art cache          │ │
                   └────────────┘  └─────────────────────┘ │
                 └─────────────────────────────────────────┘
```

The web client (`src/components/`, `src/store/`) runs in the same server
process as the API, so there is no separate backend/frontend split — only
server code vs. client code within one Next.js app.

## Server (`src/server/`)

Domain logic, no React. Thin API routes delegate here.

| Module | Owns |
|---|---|
| `db.ts` | SQLite connection (WAL, better-sqlite3), forward-only migrations (`migrations/*.sql`), graceful shutdown + WAL checkpoint. The `getDb()` singleton is shared process-wide. |
| `auth.ts` | Scrypt password hashing (async), HMAC session tokens, the `sessions` table (stateful revocation), first-run admin seeding, CSRF helpers live in `http.ts`. |
| `http.ts` | Shared HTTP helpers: `json()` (security headers), `checkAuth`/`requireAdmin`, `withAuth`/`withAdmin` route wrappers, `readJsonBody` (stream-capped body parsing), `checkCsrf`. |
| `config.ts` | Env + XDG paths (data dir, music dir). |
| `paths.ts` | Path-traversal guards (lexical + realpath), audio MIME sniffing. |
| `rateLimit.ts` | In-memory sliding-window + exponential-backoff limiters. |
| `bootstrap.ts` | One-time init: DB, auth, library scan trigger. |
| `library/` | Scanner (incremental walk, batched txns), metadata (music-metadata), art (content-addressed cache, sharp thumbnails), analysis (ffmpeg mood/energy/bpm), watcher (chokidar, opt-in). |
| `lyrics/` | LRC parser/serializer, multi-source resolver (sidecar → Musixmatch → LRCLIB → lyrics.ovh) with SSRF guards. |
| `reco/` | The recommendation engine. `engine.ts` fuses 10 scoring axes; `config.ts` centralizes all tuning weights; submodules (clusters, session, temporal, graph, embedding, bandit, diversity) each own one signal. |
| `state/` | Per-user state: favorites, play counts, recents, playlists, settings, play events (analytics). |

## API (`src/app/api/*`)

~26 routes, all App Router handlers, `runtime: "nodejs"`, `dynamic: "force-dynamic"`.
They are **thin controllers** — they parse the request, call `src/server/`, and
return `json(...)`. Auth is resolved via `withAuth`/`withAdmin` wrappers (which
hand the resolved user to the handler) or the lower-level `getRequestUser`.

Key routes: `/api/library` (catalogue + ETag), `/api/state` (per-user snapshot +
mutations), `/api/stream/[...path]` (range audio), `/api/recommend` (reco),
`/api/lyrics/[trackhash]`, `/api/recap`, `/api/sync` (Connect hub).

## Client (`src/`)

| Layer | Owns |
|---|---|
| `app/layout.tsx`, `app/page.tsx` | Root layout (Inter font, anti-FOUC), the `AuralisShell` (composes Sidebar + main + PlayerBar + overlays). |
| `app/globals.css` | The Apple Music palette (dark+light), radius scale, animations, karaoke lyrics CSS. |
| `store/` | Zustand stores, split by update frequency: `player` (playback/queue/playlists/UI), `playhead` (position, ~4×/s), `library` (catalogue snapshot + scan SSE), `reco`, `stats`, `sync`. The player store is the largest; it persists to `localStorage` with a coalesced write. |
| `components/auralis/` | 45 components: shell chrome (Sidebar, TitleBar, PlayerBar, FullscreenPlayer), views (Home, Library, Explore, Detail, Favorites, Recents, Folders, Insights), primitives (Cards, TrackRow, Artwork, Virtualized, ContextMenu, Toast). `Virtualized.tsx` does the windowing that keeps long lists instant. |
| `lib/auralis/` | Pure client helpers: `api` (fetch wrapper), `themes` (dark/light/auto mode), `i18n` (catalogue + `useT`), `reco` (feature vectors), `audioGraph` (Web Audio graph), `nativeMedia` (MediaSession wiring), `brand` (palette/format helpers). |

## Appearance

Driven by `src/lib/auralis/themes.ts` (`Mode = "dark" | "light" | "auto"`). The
concrete palette lives in `globals.css` (`:root` dark, `:root.light` light);
`applyMode()` just flips `data-mode` + the class. An inline script in `layout.tsx`
applies the persisted mode before first paint. See [design-system.md](./design-system.md).

## Native clients

- `desktop/` (Electron) — frameless window around the standalone server. Context
  isolation, sandbox, origin lock, all-permissions-denied. See `desktop/main.js`.
- `android-native/` — Kotlin + Jetpack Compose, Media3/ExoPlayer + MediaSession
  (background audio, Android Auto). Points at the HTTP API with a bearer token.
- `ios-native/` — SwiftUI + AVFoundation, XcodeGen-driven (`project.yml`),
  unsigned `.ipa` (sideload). Token in Keychain, sent as `Authorization: Bearer`.

## Tests (`test/`)

Vitest + jsdom + @testing-library/react. Integration tests spin a real temp
SQLite DB and call route handlers with real `Request` objects. The recommendation
engine has the deepest coverage (`reco*.test.ts`). `virtualized.test.tsx` guards
the windowing math. Run with `npm test`, coverage with `npm run test:coverage`.
