# Changelog

All notable changes to Auralis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Bibliothèque instantanée à grande échelle.** Le snapshot `/api/library` est
  désormais un catalogue **indépendant du compte**, construit une seule fois par
  changement de bibliothèque puis mémoïsé : à 10 000 titres, sa génération côté
  serveur passe de ~5,5 s à ~0,6 ms entre deux scans. Son ETag ne dépend plus des
  favoris ni des écoutes, donc chaque réouverture de l'app est un simple 304
  instantané au lieu d'un re-téléchargement complet du catalogue. Les compteurs
  d'écoute par artiste/titre sont dérivés côté client à partir de tes propres
  écoutes (source unique et fiable), et le payload est allégé (plus de couleur ni
  de champs par-compte par titre).
- **Moins de travail à chaque rendu.** Résolution des pistes par hash via l'index
  préconstruit (accueil, playlists, récents) au lieu de reconstruire une table de
  toute la bibliothèque à chaque appel ; l'écran Analyse ne recopie plus les
  10 000 objets piste à chaque écoute comptée.
- **Scan non bloquant.** Le parcours du dossier de musique est désormais
  asynchrone : il ne gèle plus les requêtes HTTP concurrentes sur les grandes
  bibliothèques.

### Fixed
- **Barre latérale (768–1023 px).** Affiche enfin ses libellés, filtres et noms de
  playlists au lieu d'une colonne de 280 px à moitié vide remplie d'icônes.
- **Dossiers sur mobile.** Plus de double zone de défilement qui piégeait le
  geste : la vue défile d'un seul tenant sous `lg`, virtualisation préservée.
- **Notifications (toasts)** sur deux lignes au lieu d'être tronquées en plein
  milieu d'une phrase ; **menu « Ajouter à une playlist »** défilant au lieu de
  rogner les longues listes.
- **Accessibilité des barres de lecture** : les lecteurs d'écran annoncent
  désormais la position réelle (« 1:23 sur 3:45 ») au lieu d'un pourcentage brut.
- Le bandeau d'accueil reprend la couleur d'accent du thème au lieu d'un gris figé.

### Android
- **Bibliothèque increvable.** Les grilles Albums/Artistes sont enfin fenêtrées
  (seules les rangées à l'écran sont composées) au lieu de tout composer d'un coup
  — fini le risque de gel/plantage à l'ouverture d'un grand catalogue.
- **Pochettes dimensionnées.** Le client demande des miniatures webp adaptées
  (`?w=`) au lieu de télécharger et décoder l'original pleine résolution (souvent
  plusieurs Mo) pour une vignette de 46 dp — beaucoup moins de mémoire et de
  réseau, et le cache d'images en garde bien plus.
- **Fluidité.** Le mapping des ~10 000 pistes au chargement et la construction de
  la « radio » de lecture continue (filtre + tri sur toute la bibliothèque)
  passent hors du thread principal ; correction d'un comparateur de tri non
  déterministe (risque de crash) ; index de ligne gratuit via `itemsIndexed` ;
  écritures de session dédupliquées (plus d'écriture disque inutile en pause).

### Security
- CSP de production durcie : `'unsafe-eval'` (nécessaire seulement au runtime de
  développement) n'est plus émis en production.

## [1.5.0] — 2026-06-26

### Added
- **Onglet « J'aime » dans la Bibliothèque.** Tes titres likés sont désormais
  accessibles directement depuis la Bibliothèque (web, Linux et Windows), en plus
  de la page Favoris — alimenté en temps réel par tes cœurs.

### Changed
- **Bibliothèque increvable et instantanée — virtualisation de toutes les listes.**
  Titres, albums, artistes, favoris, file d'attente, dossiers, résultats de
  recherche et pages de détail n'affichent plus que ce qui est réellement à
  l'écran (une trentaine d'éléments), quelle que soit la taille de la collection.
  Résultat : ouvrir « Bibliothèque » est instantané et l'application ne se fige
  plus et ne plante plus, même avec des centaines de milliers de titres (vérifié
  à plus de 6 000 titres : ~20 lignes rendues au lieu de 6 000).
- **Refonte visuelle « anti-AI look ».** Suppression des effets génériques qui
  trahissaient une interface générée : survols qui zooment, halos colorés, flous
  « verre », ombres excessives, dégradés et emoji décoratifs. Surfaces plates,
  jetons de couleur sémantiques, typographie maîtrisée — un rendu plus épuré et
  cohérent, fidèle à l'esprit Spotify (les éléments volontairement colorés —
  cartes genres/humeurs, tuile « titres likés », fonds animés du bureau — sont
  conservés).
- **Recherche unifiée** (fini la double barre de recherche sur ordinateur) et
  **palette de commandes** qui cherche désormais dans tout le catalogue (et non
  les 40 premiers titres).

### Fixed
- Pochettes recyclées au défilement qui restaient parfois bloquées sur l'image de
  repli ; chargement des pochettes sans clignotement (dégradé déterministe en
  fond).
- Pluralisation française correcte (« 1 titre » / « N titres »).
- Onglet Titres affichant « Scan en cours… » pendant l'indexation au lieu d'un
  message trompeur ; suppression d'un halo orange résiduel de l'ancien thème ;
  divers correctifs de contraste, d'états vides et de cohérence visuelle.

## [1.4.0] — 2026-06-26

### Added
- **Recommandations pilotées par tes retours.** Un moteur de goût côté serveur
  apprend de ton écoute : un titre **skippé** remonte moins (et, via les données
  audio energy/bpm/humeur, ses voisins de même ambiance aussi), une **écoute
  complète** ou un **like** le font remonter, un **« Je n'aime pas »** l'exclut.
  Nouvel endpoint `/api/recommend` (mix « Fait pour vous » + radio) et nouvelle
  étagère **« Fait pour vous »** sur l'accueil.
- **Bilan mensuel d'humeur.** À la fin de chaque mois, Auralis te dit l'ambiance
  dans laquelle tu as le plus vécu (mélancolique, heureuse, électrique…) avec un
  résumé, la répartition des humeurs, tes titres/artistes du mois et une
  comparaison au mois précédent — dans **Analyse**, plus une notification en début
  de mois (`/api/recap`).
- **Action « Je n'aime pas »** dans le menu d'un titre, et un toggle **« lecture
  continue »** sur le client natif.
- **Classification d'humeur audio réelle** (DSP ffmpeg : energy/bpm/brillance →
  6 humeurs) qui alimente les mixes d'humeur et les recommandations.
- **Fonds animés par thème** (desktop) et **vignettes de pochettes WebP
  redimensionnées** (`?w=`) pour un chargement nettement plus rapide.

### Changed
- **Mobile : application 100 % native.** L'ancienne app Android Capacitor (WebView)
  est supprimée au profit du **client natif Kotlin/Compose**. L'interface web reste
  entièrement responsive et installable en PWA : ouvrir l'adresse du serveur depuis
  un téléphone garde une belle interface mobile.
- Le **client natif** passe à parité avec le web (recommandations + bilan d'humeur).

## [1.3.2] — 2026-06-26

### Changed
- **App desktop : démarrage en grand.** La fenêtre s'ouvre désormais
  **maximisée** au lancement (la taille 1320×860 reste la géométrie de
  restauration), au lieu d'une petite fenêtre.
- **App desktop : connexion par URL uniquement.** L'écran de premier lancement
  ne propose plus de serveur local : on saisit directement l'**URL du serveur
  Auralis**, exactement comme sur l'application mobile.

## [1.3.1] — 2026-06-26

### Fixed
- **Barre latérale (desktop) : puces de filtre de la bibliothèque coupées.** La
  rangée *Favoris / Historique / Dossiers / Analyse* débordait horizontalement et
  la dernière puce (« Analyse ») était tronquée au bord de la sidebar, sans
  indication de défilement. Les puces passent désormais à la ligne (`flex-wrap`)
  et restent toutes visibles.

## [1.3.0] — 2026-06-25

Native mobile rewrite, desktop onboarding and a gentle donation reminder.

### Added
- **Native Android client (`android-native/`).** A from-scratch **Kotlin / Jetpack
  Compose** app replacing the Capacitor WebView shell. It talks to a self-hosted
  Auralis server over the same HTTP API and plays audio natively with
  **Media3 / ExoPlayer** + a `MediaSessionService` — real background playback,
  lock-screen controls and audio focus (no more WebView wake-lock workaround).
  Feature parity with the web app: connect/login, library (sort + grid/list +
  counts), search (server FTS + genre mixes + history), Home shelves (mix du jour,
  reprendre, à redécouvrir, découvertes), favourites (5-way sort), folders, insights,
  album/artist/playlist detail, mini + fullscreen player, queue, synced **karaoke
  lyrics** (offset + toggle), track ⋮ context menu (play next / queue /
  add-to-playlist), playlist create/rename/delete/reorder/pin, sleep timer, in-app
  volume, session resume, streak-milestone toasts, command palette, a visualiser,
  all 14 themes with an animated Compose backdrop, and full settings (password
  change, admin user management, rescan, change folder, export/import, reset
  history). Build with `npm run mobile:native` (offline: `AURALIS_OFFLINE=1`).
- **Desktop first-run setup.** On first launch the desktop app asks whether to run
  **locally** (spawns the bundled server on a chosen music folder) or **connect to a
  remote Auralis server** by URL — re-pickable later from Settings.
- **Donation reminder.** A dismissible popup invites support on the first launch and
  then every third launch thereafter (web/desktop and the native app).

## [1.2.0] — 2026-06-25

Engagement, security, ergonomics and homogeneity pass. Adds two forward-only DB
migrations (v3 `play_events`, v4 `users.token_version`); no manual data migration.

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
  never played), **“Tes mix par genre”** on Explore (a one-tap shuffle per
  well-represented genre), an **“À suivre”** next-track peek in the full-screen
  player, a **listening-time** stat (week + total) and a **“Tes artistes les plus
  écoutés”** panel in Insights, and **`L` = like** / **`Q` = queue** shortcuts.
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
- **Data control / privacy.** A **“Réinitialiser l’écoute”** action (Settings → Data)
  wipes your server-side play counts / recents / event log (favourites + playlists
  kept), scoped to your own account. A one-time nudge prompts personalising the
  auto-generated admin password. `robots.txt` now disallows all crawling (Auralis is
  a private app, not a public site).

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
  and login/password forms carry the right `autoComplete` hints. The document
  `lang` is now `fr` (screen readers use the right voice) and the page title,
  meta description and PWA manifest name/description are French too. A polite
  live region announces the now-playing track on each change.

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
