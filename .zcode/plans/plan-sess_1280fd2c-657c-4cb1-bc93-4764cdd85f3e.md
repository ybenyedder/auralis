# AURALIS — GRAND PLAN DE TRANSFORMATION (Deep Audit → Apple Music + Engineering Pass)

Résumé des 4 décisions actées :
- **Exécution parallèle** : UI + archi + tests + backend en workstreams simultanés
- **Suppression totale** des 23 thèmes cosmiques/vivid/ambiance (champs d'étoiles, nébuleuses, glass, neon)
- **Dark + Light** complets comme Apple Music
- **Clone fidèle** d'Apple Music (rouge #FA233B, SF Pro, surfaces opaques, covers carrés)

L'audit a révélé un projet **solide côté backend/sécurité** (reco-engine 10-axes, scrypt, CSRF, FTS5, SSRF guards) mais **l'UI est un clone de Spotify** (accent vert #1ED760, sidebar empilée, blurred-cover wash, tilt 3D) enrobé dans **23 thèmes cosmiques** (starfields/galaxies/neon/glass). C'est ça qu'on démolit.

Le plan est organisé en **6 workstreams parallèles**. Chacun est livrable indépendamment.

---

## WORKSTREAM A — SYSTÈME DE DESIGN APPLE MUSIC (fondation, à faire en 1er)

C'est le socle. Tout le reste de l'UI dépend de ces tokens.

### A1. Refonte de `src/app/globals.css` (762 lignes)
**Supprimer** (lignes 520–752) : tous les `.bd-*` (stars, aurora, blob, mesh, ocean, particle), `.theme-backdrop`, les keyframes `bd-drift/twinkle/float/mesh-rot/grid`.
**Remplacer `:root` (lignes 45–100)** : palette Spotify → palette Apple Music **dark + light**.

Nouveaux tokens (dark par défaut, `.light` inverse) :
```
/* DARK (Apple Music) */
--background: #000000;
--surface-1: #1C1C1E;     /* cards iOS secondarySystemBackground */
--surface-2: #2C2C2E;     /* elevated cards */
--surface-3: #3A3A3C;     /* hover */
--sidebar: #000000;
--popover: #1C1C1EBlu;    /* blur popover */
--primary: #FA233B;       /* Apple Music red */
--primary-hover: #FC3158; /* iOS variant */
--ink: #FFFFFF;           /* text on red */
--foreground: #FFFFFF;
--text-muted: #98989F;    /* iOS secondaryLabel */
--text-faint: #636366;    /* iOS tertiaryLabel */
--line: rgba(255,255,255,0.08);
--line-strong: rgba(255,255,255,0.16);
--ring: rgba(250,35,59,0.5);
--destructive: #FF453A;   /* iOS systemRed dark */

/* LIGHT (.light) */
--background: #FFFFFF;
--surface-1: #F2F2F7;     /* iOS secondarySystemBackground */
--surface-2: #E5E5EA;
--surface-3: #D1D1D6;
--foreground: #000000;
--text-muted: #3C3C43 opacity 60%;
--line: rgba(0,0,0,0.08);
--destructive: #FF3B30;
```

**Police** : `--font-sans: -apple-system, "SF Pro Display", "SF Pro Text", "Inter", system-ui, ...`. Charger **Inter** via `next/font/google` dans `layout.tsx` comme approximation légale de SF Pro (SF Pro n'est pas redistribuable hors Apple) — `-apple-system` résout nativement vers SF Pro sur macOS/iOS.

**Radius** : base 8→ **10px** (Apple), corriger `--radius-xs` (actuellement **0px**, bug). Enregistrer `xl`/`2xl`/`xs` dans tailwind.config. Standardiser les **299 usages `rounded-*`** → soit tokens, soit `rounded-xl` covers, `rounded-lg` cards, `rounded-full` boutons.

### A2. `src/app/layout.tsx` — thème dynamique
- Retirer `className="dark"` codé en dur.
- Ajouter inline script anti-FOUC qui lit le thème (`localStorage`) AVANT paint.
- Charger `Inter` via `next/font/google` avec variable CSS, assigner `className` au `<body>`.
- `statusBarStyle` dynamique selon thème, `themeColor` → `#000000`/`#FFFFFF`.

### A3. `src/lib/auralis/themes.ts` (651 lignes) → **réécrire à ~150 lignes**
Supprimer les 31 thèmes + `BackdropSpec`/`glass`/`backdrop`. Nouveau système **minimal** :
```ts
type Mode = "dark" | "light" | "auto";
// Plus de THEMES[]. Juste applyMode(mode) qui pose data-mode + classe .light sur :root.
```
Garder `applyTheme` comme alias rétro-compatible (appelé depuis `player.ts:536,1401,1465,1534`) mais qui délègue à `applyMode`.

### A4. Supprimer `src/components/auralis/ThemeBackdrop.tsx` (597 lignes)
+ son import dans `page.tsx:14,646`. Plus de backdrop animulé. Apple Music = **fond uni**.

### A5. Nettoyer le store
Dans `src/store/player.ts` : supprimer `flatBackdrop` (lignes 158, 386, 435, 596, 1408–1410, 1462, 1519–1534), `THEMES`/`ThemeId` (export l.20). Remplacer `theme: ThemeId` par `mode: Mode`. Dans `DetailView.tsx` (l.688, 1180–1183) : retirer le toggle « Uni/Animé », ajouter un sélecteur **Sombre/Clair/Auto**.

### A6. `tailwind.config.ts`
Déclarer `darkMode: ["class", '[data-mode="dark"]']`, enregistrer `surface-1/2/3`, `text-muted/faint`, `ink`, radius complets, famille `sans` → variable Inter.

---

## WORKSTREAM B — REFAITE DES COMPOSANTS UI EN APPLE MUSIC

Chaque composant : retirer le vernis Spotify, appliquer la grammaire Apple Music (rouge, SF Pro bold, surfaces opaques, covers carrés, pas de glow/blur-wash/tilt).

### B1. `Sidebar.tsx` (193 lignes)
Spotify (3 boxes arrondies empilées) → **Apple Music sidebar plate** : liste unique flat, icônes SF Symbols-like (lucide), accent rouge sur l'item actif, sections "Apple Music" / "Bibliothèque" / "Playlists". Pas de `bg-panel` boxes.

### B2. `TitleBar.tsx` (102 lignes)
Chercher orange→blanc, back/forward en chevrons simples rouge, search field plein largeur style iOS (pas rond `bg-black/40`).

### B3. `PlayerBar.tsx` (496 lignes) — **barre now-playing**
- Bouton play : blanc→**rouge `bg-primary`** (Apple). Ou garde blanc mais cohérent.
- Sliders : track `#4d4d4d` → `--text-faint`, fill `--primary` au hover. Volume à droite.
- Track info : cover `rounded-lg` 56px, titre `text-[13px] font-semibold`, artiste gris.
- Layout 3 colonnes conservé mais re-typé.

### B4. `FullscreenPlayer.tsx` (400 lignes) — **le plus visible**
Démolir le pattern Spotify :
- **Supprimer** le backdrop blurred-cover `scale-125 blur-[80px] saturate-150 opacity-45` (l.134) → le remplacer par un **gradient vertical sobre** dérivé de la cover (Apple utilise un tint subtil, pas un blur saturé).
- **Supprimer `TiltStage`** (tilt 3D parallaxe) → cover **carrée statique, grande** (Apple). Garder en option derrière un toggle si tu y tiens.
- Play button `h-16 w-16 bg-white` → `bg-primary`.
- Typography : titre `text-[28px] font-bold`, artiste `text-[17px]` (échelle iOS).
- Scrubber fin, boutons transport espacés.

### B5. `TiltStage.tsx` — supprimer (plus de tilt) ou rendre opt-in off par défaut.

### B6. `Cards.tsx` (227 lignes)
`matte-panel rounded-lg` → `bg-surface-1 rounded-xl`. Play FAB `signal-button` blanc → rouge `bg-primary`. Hover : pas de lift, juste `bg-surface-2`. Covers carrés `rounded-lg`. ArtistCard garde le cercle. Titres `font-semibold text-[15px]`.

### B7. `TrackRow.tsx` (230 lignes)
Hover `bg-white/[0.10]` → `bg-surface-3`. Track courant `text-primary` rouge. EqualizerBars rouge. Durée tabular. Index→play au hover conservé.

### B8. `views/HomeView.tsx` (392 lignes)
Supprimer le wash vert `linear-gradient(var(--primary),transparent)` (l.181). Greeting `text-[28px] font-bold` (iOS Large Title). QuickTiles → **grandes cards éditoriales** style Apple Music (image large + titre overlay). Carousels snap-x conservés mais relookés.

### B9. `views/LibraryView.tsx` (681 lignes)
Onglets soulignés → **segmented control iOS** (pill gris). Pills filtre blanc → `bg-surface-2`. Cards `matte-panel` → `bg-surface-1 rounded-xl`.

### B10. `views/ExploreView.tsx`, `DetailView.tsx`, `InsightsView.tsx`, `FavoritesView.tsx`, `RecentsView.tsx`, `FoldersView.tsx` — passer au peigne fin du vernis (accent rouge, surfaces, typo).

### B11. `mobile/MobileDock.tsx` + `MobileHeader.tsx` — retyper en iOS (tab bar translucide sobre, header Large Title).

### B12. `Artwork.tsx` — uniformiser `rounded-xl`, fallback palette sobre (retirer le neon de `brand.ts signalPalettes`).

### B13. `LyricsView.tsx` (451 lignes) — karaoke : garder le wipe mot-à-mot (excellent) mais couleurs Apple (texte actif `--foreground`, glow sobre, fond uni).

### B14. Divers : `Toast`, `ContextMenu`, `CommandPalette`, `EmptyState`, `Skeletons`, `DonateReminder`, `SelectionBar`, `StickyViewHeader`, `SectionHeader`, `QueueList`, `NowPlayingPanel`, `VisualizerOverlay` — audit accent/typo/surfaces.

---

## WORKSTREAM C — ARCHITECTURE & BACKEND (parallèle)

### C1. Découper `player.ts` (1 692 lignes → 4 slices Zustand)
`queueSlice.ts` (transport + queue), `playlistSlice.ts`, `uiSlice.ts` (panels/fullscreen), `themeModeSlice.ts`. Composé via `create<...>()(...slices)`. Éliminer les singletons module-level (`skipExempt`, `pendingResumeSeek`) → les passer dans le store ou un `PlaybackController` injectable. Objectif : testable.

### C2. Remplacer la persistance bespoke par `zustand/middleware/persist`
Lignes 409–515 de `player.ts` → `persist` + `version` + `migrate`. Moins de code, gestion de version native.

### C3. `/api/state` RPC (13-case switch) → routes REST
`/api/playlists/[id]` (GET/PATCH/DELETE), `/api/feedback` (POST favorite/dislike), `/api/settings` (PUT). Conserver `/api/state` GET (snapshot) mais vider la partie PUT. Wrapper `withAuth(handler)` pour standardiser les 3 patterns d'auth actuels.

### C4. Cascade de suppression dans le scanner
`scanner.ts:307-323` — quand un track est pruné, supprimer aussi ses lignes dans `playlist_tracks`, `play_events`, `favorites`, `playcounts`, `recents`, `lyrics`. Évite l'accumulation d'orphelins.

### C5. `rebuildAggregates` O(n) → upsert merge
`scanner.ts:411` — ne plus `DELETE FROM albums/artists` à chaque scan. Merger incrémental.

### C6. Watch-mode scanner (inotify/fsevents via `chokidar`)
Re-scan automatique à l'ajout de fichiers. Opt-in via `AURALIS_WATCH=1`.

### C7. Reco-engine : `engine.ts` (737 lignes) → extraire `engine/modes.ts` (radio/blend/trajectory/discovery). Externaliser les poids magiques (`W_*`, `MMR_LAMBDA`) dans `reco/config.ts`. Ajouter un **harness d'évaluation offline** (skip-prediction, NDCG@k) pour calibrer défensivement.

### C8. DB migrations inline → `migrations/001.sql` … `010.sql` + `migrate:status` CLI.

### C9. `scryptSync` → `scrypt` async (auth.ts:38) pour ne plus bloquer l'event loop.

### C10. Sessions stateful (table `sessions`) → permettre "révoquer une session", audit, log. Conserver les tokens signés en parallèle.

### C11. Sécurité : policy mot de passe (haveibeenpwned ou bloom local), `engines.node>=20` dans package.json, déprécier `?token=` (URLs loggées) au profit du header Bearer, headers SSE sur `sync/stream`.

### C12. Supprimer `/api/music` alias (7 lignes, mort).

---

## WORKSTREAM D — TESTS, QA, OBSERVABILITÉ (parallèle)

### D1. Migration test runner : Node `--test` → **Vitest** + jsdom + `@testing-library/react`. Couverture `c8`.
### D2. Combler les gaps : tests route pour les **21 routes non couvertes** ; tests composants (render PlayerBar/Sidebar/Cards/TrackRow) ; **test de régression `Virtualized.tsx`** (296 lignes critiques non testées) ; test range-request `/api/stream`.
### D3. **Playwright E2E** : login → play → scrobble → favori.
### D4. **axe-core** en CI + skip-link + `aria-setsize`/`aria-posinset` sur les listes virtualisées.
### D5. **Sentry** (ou ingest self-hosted opt-in) + routes Next.js `error.tsx`/`global-error.tsx`/`not-found.tsx`.
### D6. CI : matrice Linux+Win+macOS (build web), **bundle-size budget** (832 KB → cibler <300 KB first-load), **Lighthouse CI**, `npm audit --audit-level=high`, coverage gate. Ajouter `@next/bundle-analyzer`.
### D7. i18n : extraire les ~centaines de strings FR codées en dur (`MobileDock`, `MobileHeader`, `ErrorBoundary`, `Toast`, `player.ts`, etc.) dans le catalogue `i18n.ts`. Ajouter `es`, `de`.

---

## WORKSTREAM E — NETTOYAGE & DOCS (parallèle, low-effort)

### E1. Convertir `AUDIT_LOG.md` (70 KB) en `docs/adr/` (Architecture Decision Records). Le sortir du repo ou le gitignorer.
### E2. Gitignorer `tsconfig.tsbuildinfo` (140 KB committé).
### E3. Promouvoir les règles ESLint `no-explicit-any`/`no-non-null-assertion`/`ban-ts-comment`/`exhaustive-deps` de `warn` → `error`.
### E4. `target: ES2017` → `ES2022`.
### E5. Sortir `docs/screenshot-player.png` (996 KB) du repo → GitHub release/CDN.
### E6. Documenter la dépendance Python (forced alignment + embeddings) dans README + script d'install.
### E7. `docs/` : ajouter `architecture.md`, `ui-design-system.md` (le nouveau), `apple-music-spec.md`.

---

## WORKSTREAM F — MOBILE NATIF (parallèle, post-UI)

Une fois l'UI web stabilisée (A+B), reporter le design Apple Music sur :
### F1. `android-native/` (Kotlin/Compose) — Material→design system aligné, accent #FA233B.
### F2. `ios-native/` (SwiftUI) — naturellement proche d'Apple Music, aligner accent/typo.
### F3. Tests natifs (les deux apps en ont **zéro**).

---

## ORDRE D'EXÉCUTION (parallèle mais avec dépendances)

```
Semaine 1 :  A (design system) + C1/C2 (refactor player store) + D1 (Vitest setup) + E (cleanup)
            → fondation posée, plus de thèmes cosmiques, store découplé
Semaine 2 :  B (tous les composants UI) en parallèle + C3-C7 (backend) + D2-D4 (tests)
Semaine 3 :  C8-C12 + D5-D7 (observabilité/CI) + D7 (i18n) + F (mobile)
```

**Critère de succès phase 1** : ouvrir l'app → fond uni noir/blanc, accent rouge, SF Pro, covers carrés, zéro étoile/nébuleuse/glow, sidebar plate — indistinguable d'Apple Music au premier coup d'œil.

---

## RISQUES & MITIGATIONS
- **Police SF Pro non-redistribuable** → `-apple-system` natif + Inter fallback. Documenté.
- **Casse des thèmes persistés** → migration `persist` : ancien `theme: "galaxy"` → `mode: "dark"`.
- **Bundle 832 KB** → le retrait de ThemeBackdrop + thèmes allège significativement ; audit lucide tree-shaking.
- **Refactor player.ts** → garder l'API publique du store identique (mêmes selectors) pour ne pas casser 45 composants.

Je commence par le **Workstream A** (fondation) car tout l'UI en dépend, puis j'enchaîne B en parallèle de C/D. OK pour lancer ?