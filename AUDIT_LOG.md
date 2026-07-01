# Journal d'audit continu (local, non poussé sur GitHub)

Ce fichier suit les passes d'amélioration continue (sécurité / bugs / perf / UI) lancées
en local via `/loop 5h`. Chaque entrée résume ce qui a été trouvé, corrigé, testé, et ce
qu'il reste à explorer pour la prochaine passe. Ne pas pousser sur un remote — usage
local uniquement (voir consigne utilisateur : tout reste sur cette machine).

## 2026-06-30 — Passe 1

**Méthode** : 3 agents d'audit en parallèle (sécurité API, perf/ressources, micro-bugs UI),
puis un agent de contre-vérification adversariale sur les findings UI douteux avant tout
correctif — plusieurs "bugs" rapportés se sont révélés être des faux positifs après lecture
du code réel.

### Sécurité (routes API — src/app/api/**)
Aucune vulnérabilité critique. Prepared statements partout, CSRF (`checkCsrf`), IDOR
protégé sur les playlists collaboratives, path traversal impossible (`resolveLibraryPath`),
rate limiting sur login/lyrics, secrets non exposés. Rien à corriger cette passe.
Points mineurs notés (non bloquants) : `error.message` brut renvoyé par `/api/library` en
cas d'exception (vérifier qu'aucune exception ne fuite un chemin absolu), pas de limite
explicite de taille de body JSON dans next.config (repose sur la limite par défaut Next.js).

### Perf / ressources — CORRIGÉ
1. **N+1 SQLite sur les playlists** (`src/server/state/userState.ts:49-89`) : une requête
   `playlist_tracks` par playlist (jusqu'à N+1 requêtes sur chaque `getUserState()`, donc
   à chaque reload client). Remplacé par une seule requête `IN (...)` groupée en Map côté
   JS, ordre préservé (`ORDER BY playlist_id ASC, position ASC, added_at ASC`).
2. **Chargement illimité de `play_events`** (`src/server/reco/engine.ts:129-131`) : la requête
   de recommandation chargeait jusqu'à 400 jours d'historique (pruning existant) sans borne
   côté lecture, itérés en JS à chaque appel (cache TTL 2.5s seulement). Ajout d'une fenêtre
   de lecture `EVENTS_WINDOW_MS = 180 * DAY` : au-delà, le decay (`HALF_LIFE_MS = 21 * DAY`)
   réduit déjà la contribution d'un événement à <0.3%, donc aucun changement perceptible du
   scoring, juste moins de lignes chargées/itérées pour les gros utilisateurs.

Non-problèmes confirmés par l'agent d'audit (déjà corrects, ne pas retoucher) :
virtualisation des listes longues (VirtualList/VirtualGrid), lazy-load des covers,
cleanup systématique des listeners/intervals, sélecteurs Zustand atomiques, cache HTTP
ETag sur `/api/library`, batching du scanner.

### UI — 1 bug réel corrigé, plusieurs faux positifs écartés
- **CORRIGÉ** : `src/components/auralis/Cards.tsx:90` — `{album.year}` affichait littéralement
  "undefined" pour un album sans année (le type `Album.year` est `number | undefined`).
  Aligné sur la convention déjà utilisée dans `DetailView.tsx:139` : `album.year ?? "année inconnue"`.
- **FAUX POSITIF écarté** : `QueueList.tsx:121` — l'agent a lu `lg:hidden lg:group-hover:flex`
  comme "boutons cachés sur mobile". En réalité c'est l'inverse : la classe de base `flex`
  (sans préfixe) s'applique sur mobile → boutons TOUJOURS visibles au toucher ; `lg:hidden`
  + `lg:group-hover:flex` ne s'appliquent qu'à partir du breakpoint `lg` (desktop), où le
  hover-to-reveal a du sens. Comportement voulu, ne pas "corriger".
- **FAUX POSITIF écarté** (vérifié par un 2e agent) : `Artwork.tsx:61` (destructuring
  `[c1, c2]` d'un tuple à 3 couleurs) et `FullscreenPlayer.tsx:141` (gradient avec
  `colors[0]`/`colors[2]`) — `colors` est un tuple `[string, string, string]` garanti par
  le type système et par `paletteFor()`/`paletteForName()` qui retournent toujours 3
  couleurs valides. Aucun chemin réel où le rendu casse.
- **FAUX ALARME après contre-vérification** : le handler clavier global
  (`src/app/page.tsx:502-597`) ne bloque que Space/Enter quand le focus est sur un
  `[role='slider']`/bouton/lien (évite la double-activation native de ces touches).
  Les autres touches (r/m/s/l/q/f/v) restent actives globalement même si le focus est sur
  le slider volume/progression, qui ne les gère pas lui-même. Un agent l'a d'abord qualifié
  de "bug" (double action), mais en pratique il n'y a **qu'un seul** effet déclenché (le
  raccourci global ; le slider ne fait rien pour ces touches) — c'est le comportement
  attendu d'un lecteur média (raccourcis globaux actifs sauf saisie texte ou activation
  native Space/Enter d'un contrôle). Décision : ne pas modifier, pattern intentionnel.
- **Noté pour une prochaine passe (pas corrigé aujourd'hui, changement visuel non testé en
  navigateur dans cette session)** : `BlendShelf.tsx:15-28` et
  `ExploreView.tsx:60-84` n'affichent aucun indicateur de chargement pendant leurs fetch
  (flash de contenu qui apparaît/change sans transition). Amélioration UX mineure et sûre à
  faire, mais nécessite une vérification visuelle réelle avant de la committer.

### Validation
`npm run check` (lint + typecheck + build) ✅ — `npm test` : 61/61 ✅.

### Pistes pour la prochaine passe (dans l'ordre)
1. Écrire un test couvrant `getUserState()` (playlists + collaborateurs) pour verrouiller
   le comportement du fix N+1 ci-dessus — aucun test ne l'exerçait directement.
2. Ajouter un état de chargement à `BlendShelf.tsx` et `ExploreView.tsx` (voir note UI
   ci-dessus), avec vérification visuelle réelle (`/run` ou capture d'écran) avant commit.
3. Auditer `android-native/` (Kotlin/Compose) — non couvert par cette passe (agents focalisés
   sur web/API/SQLite).
4. Auditer `desktop/` (Electron main process) — non couvert par cette passe.
5. Vérifier le point mineur sécurité : s'assurer qu'aucune exception renvoyée brute par
   `/api/library` (`error.message`) ne peut fuiter un chemin absolu du système en prod.
