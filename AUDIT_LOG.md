# Journal d'audit continu (local, non poussé sur GitHub)

Ce fichier suit les passes d'amélioration continue (sécurité / bugs / perf / UI) lancées
en local via `/loop 5h`. Chaque entrée résume ce qui a été trouvé, corrigé, testé, et ce
qu'il reste à explorer pour la prochaine passe. Ne pas pousser sur un remote — usage
local uniquement (voir consigne utilisateur : tout reste sur cette machine).

## 2026-06-30 — Passe 3 (`/goal` actif : continuer automatiquement, sans redemander)

**Méthode** : suite du punch-list passe 2 (item next.config + zones non couvertes :
store Zustand/moteur audio, PWA/service worker, SSE sync).

### Sécurité — CORRIGÉ
`src/server/http.ts` : ajout de `checkBodySize()` (pré-check `Content-Length`, 413 si
dépassement) — `request.json()` d'App Router n'a AUCUNE limite intégrée, un body énorme
est entièrement bufferisé en mémoire avant que la moindre validation de route (ex: le
check 8MB de `playlist.cover`) ait une chance de le rejeter. Câblé sur les 6 routes qui
parsent un body JSON, y compris `/api/auth/login` qui est pré-authentification (surface la
plus exposée). `npm run check` + `npm test` (66/66) verts après coup.

### Store Zustand / moteur audio — AUDITÉ, AUCUN vrai bug trouvé
Un agent a remonté 3 "race conditions" (page.tsx:242-245 dataset.trackhash mis à jour
après `audio.load()`, player.ts:633/658 reset de currentTime lors d'une re-sélection
rapide, page.tsx:463 loadedmetadata désynchronisé). Les 3 ont été vérifiées ligne par
ligne et écartées :
- page.tsx:242-245 : impossible en JS — deux instructions synchrones dans la même
  fonction ne peuvent jamais être interrompues par un event listener (aucun point de
  suspension entre elles). Le scénario proposé n'existe pas.
- player.ts:633/658 : le commentaire du code explique déjà l'intention exacte (forcer un
  restart à 0 UNIQUEMENT quand on re-sélectionne la piste DÉJÀ chargée, dataset ==
  nouvelle piste). Pour un changement vers une piste VRAIMENT différente, le test est
  censé être faux (aucun reset nécessaire : un nouveau `src` repart de 0 nativement dans
  le navigateur). Le scénario "B reprend où A s'est arrêté" décrit par l'agent ne découle
  pas de la mécanique réelle de `audio.src`.
- page.tsx:463 : `consumeResumeSeek()` (player.ts:49-56) compare déjà le trackhash avant
  de renvoyer quoi que ce soit — verrou complet, pas juste une atténuation partielle.
Aucune modification. Sélecteurs Zustand, cleanup des listeners, gestion d'erreur audio et
persistance confirmés corrects par l'agent (RAS).

### PWA / SSE — 2 petits fixes corrigés, 1 faux positif "GRAVE" écarté après vérification
Pas de service worker enregistré (juste `src/app/manifest.ts`) → aucun des risques
PWA (cache de données privées, staleness) ne s'applique, rien à faire.
- **FAUX POSITIF écarté malgré le label "GRAVE"** : un agent a signalé une fuite mémoire
  de listeners `EventSource` dans `src/store/sync.ts` (5 listeners par `connect()`,
  soi-disant jamais nettoyés à la reconnexion). Vérifié : `connect()` retourne
  immédiatement si `es` (le handle module-level, `let es: EventSource | null`) est déjà
  défini (ligne 100) — impossible d'attacher un second jeu de listeners tant que l'ancien
  n'est pas fermé. Et `es` est une simple variable réassignée, pas un tableau qui
  accumule : dès que `es = source` pointe vers la nouvelle connexion, l'ancien
  `EventSource` (+ tous ses listeners, qui ne sont que des propriétés internes de CET
  objet) perd sa dernière référence externe et devient éligible au GC comme un tout —
  attacher un listener à un objet ne "fuit" pas globalement, ça garde seulement CET
  objet vivant tant que lui-même est référencé. Aucune modification.
- **CORRIGÉ** (`src/app/api/sync/stream/route.ts`) : `cancel()` (méthode séparée de
  `start()` sur le même `ReadableStream`, donc scope différent) ne voyait jamais le flag
  `closed` — celui-ci était déclaré `let closed = false` À L'INTÉRIEUR de `start()`,
  invisible depuis `cancel()`. Un abort concurrent aurait pu déclencher `unregisterSubscriber`
  deux fois (inoffensif aujourd'hui car idempotent, mais c'est exactement la classe de bug
  déjà rencontrée ici — voir commit historique "fix: SSE controller double-close crash").
  `closed` remonté au scope partagé par `start()` ET `cancel()`, `cancel()` le vérifie/pose
  désormais comme `cleanup()` le fait déjà. Vérifié : `src/app/api/library/events/route.ts`
  n'a PAS ce bug (l'agent l'avait signalé à tort aussi) — son `cancel()` appelle
  `cleanup?.()`, la MÊME closure que `start()` utilise pour l'abort, donc le flag `closed`
  qu'elle capture est déjà correctement partagé par construction.
- **CORRIGÉ** (`src/store/library.ts`) : `EventSource("/api/library/events")` n'avait pas
  `{ withCredentials: true }` contrairement à `store/sync.ts`, qui l'a déjà. Sans ça, une
  session cookie-only (sans `?token=`) ne s'authentifierait pas sur cet endpoint en
  cross-origin. Mineur (le token query param compense la plupart du temps) mais correctif
  sûr et cohérent avec l'autre canal SSE du projet.

### Validation
`npm run check` + `npm test` (66/66) ✅ après le lot store/PWA/SSE.

### Pistes pour la passe 4
1. android-native/ : header Authorization ExoPlayer (reporté passe 2, toujours en attente
   d'un device/émulateur pour vérifier).
2. desktop/ : câblage visuel `setup.html` (reporté passe 2, idem, besoin de test manuel).
3. Repasser sur des zones encore non auditées : composants de settings/admin,
   `src/lib/auralis/*` (utilitaires partagés), scanner de bibliothèque (`scanner.ts`)
   ligne par ligne (seulement survolé indirectement jusqu'ici), lyrics/musixmatch,
   forced-align (`alignment.ts`, mentionné dans le warning NFT trace du build — à
   vérifier si c'est un vrai souci ou juste un warning bénin de Next.js).
4. Élargir la couverture de tests : `art.ts` (cache d'images) et les routes API
   elles-mêmes (tests actuels = unitaires sur la couche server/lib, pas d'intégration
   HTTP sur les routes) n'ont pas de tests dédiés.
   **Correction** : `reco/engine.ts` a en fait déjà une bonne couverture dans
   `test/reco.test.ts` (cold start, skip vs complete, dislikes, généralisation par
   contenu, seeds, recap) — j'avais écrit cette ligne sans vérifier d'abord. Passe 4 y a
   ajouté le seul vrai trou (la fenêtre de lecture à 180 jours). Toujours grep/lire avant
   d'affirmer qu'un module n'a "aucun test".

## 2026-06-30 — Passe 2 (déclenchée par `/goal continue toute les prochaine passe sans que j te demande`)

**Méthode** : suite du punch-list de la passe 1. Test unitaire écrit pour verrouiller le fix
N+1, 2 agents d'audit en parallèle pour les zones non couvertes (desktop/ Electron,
android-native/ Kotlin). **Découverte importante** : le sandbox a un Gradle offline
fonctionnel (`./gradlew --offline compileDebugKotlin` marche, ~15-20s) — donc les futures
passes PEUVENT et DOIVENT compiler-vérifier tout changement Kotlin, pas juste éditer à
l'aveugle. Utilisé ici pour valider le fix PlayerHolder avant commit.

### Test de non-régression — AJOUTÉ
`test/userState.test.ts` (5 tests) : couvre le fix N+1 de la passe 1 (playlists propres +
collaboratives, ordre par position, playlist vide, cas zéro-playlist, stress 25 playlists
pour vérifier que le groupement de la requête `IN (...)` ne mélange pas les trackhashes
entre playlists). 66/66 tests passent au total.

### Sécurité — CORRIGÉ
`src/app/api/library/route.ts` était la seule route de tout le projet à renvoyer
`error.message` brut au client (toutes les autres écrivent un message générique à la main).
Une erreur fs peut contenir un chemin absolu serveur. Loggé côté serveur via le logger
existant, message générique renvoyé au client — comportement aligné sur le reste du projet.

### android-native/ — 1 vrai bug corrigé, plusieurs faux positifs écartés après lecture réelle
- **CORRIGÉ** (`PlayerHolder.kt`) : `release()` ne faisait jamais `scope.cancel()`. Le
  ticker de position (`while (true) { delay(250) }` dans `startTicker()`) tournait donc
  indéfiniment après release — coroutine zombie, fuite mémoire + réveil CPU toutes les
  250ms pour toujours, à chaque destruction de `PlaybackService`/`AppViewModel`. Vérifié :
  `release()` n'est appelé qu'une seule fois en usage réel (`AppViewModel.onCleared()` →
  `PlaybackService.onDestroy()`), donc `scope.cancel()` est sûr (pas de réutilisation après
  release). Compile OK (`compileDebugKotlin`).
- **FAUX POSITIFS écartés (vérifiés un par un, pas en bloc)** : les "9 icônes sans
  `contentDescription`" signalées par l'agent d'audit sont TOUTES des icônes décoratives
  directement accolées à un `Text` qui porte déjà le label (ex: `TrackMenu.MenuRow`,
  `PlayPill`, icône de recherche dans un `OutlinedTextField` avec placeholder, pochette de
  fallback à côté du titre de la piste) — `contentDescription = null` y est le pattern
  recommandé par Google (évite un double-annoncement redondant par TalkBack). Le seul cas
  où le code ajoute une vraie description (`Shell.kt:200`, bouton icône seul sans texte,
  `"Lire la sélection"`) confirme que la convention du projet est déjà correcte. Ne pas
  "corriger" ces 9 occurrences dans une future passe sans relire le contexte réel.
  `NetworkImage`'s "Box vide sans feedback" est aussi inexact : `CoverArt` lui passe déjà un
  `fallback` (icône + dégradé), ce n'est pas un blanc vide.
- **NON MODIFIÉ, INTENTIONNEL** : `android:usesCleartextTraffic="true"` — le README documente
  explicitement "saisis l'URL de ton serveur Auralis (LAN/VPS)" : c'est un client pour
  serveur self-hosted, souvent en HTTP simple sur le LAN sans certificat TLS. Désactiver le
  cleartext casserait la connexion pour la majorité des déploiements réels. Pas un bug.
- **DIFFÉRÉ (vrai compromis, nécessite un test runtime avec émulateur/appareil que je n'ai
  pas ici)** : `AuralisApi.appendToken()` met le token en query param (`?token=...`) pour
  les URLs de stream/image passées telles quelles à ExoPlayer/au chargeur d'images — les
  appels JSON classiques utilisent déjà correctement `Authorization: Bearer` (ligne ~203).
  Recommandation concrète pour la prochaine passe : `DefaultHttpDataSource.Factory()
  .setDefaultRequestProperties(mapOf("Authorization" to "Bearer $token"))` côté ExoPlayer
  pour le stream, et vérifier si le chargeur d'images (`ArtCache`) a un hook équivalent —
  sinon le param restera nécessaire pour les images. Nécessite de vérifier que la lecture
  audio et le chargement d'images fonctionnent toujours après coup (émulateur/device requis).
- **NOTÉ, pas corrigé (besoin de jugement UX, pas de vérification visuelle possible ici)** :
  `AppViewModel.fetchReco()` avale silencieusement les erreurs réseau de `/api/recommend`
  (`runCatching{...}.getOrDefault(EMPTY)`) — la section "Fait pour vous" reste juste vide
  sans feedback. Amélioration UX légitime mais mineure.

### desktop/ (Electron) — 2 petits fixes corrigés, 1 point noté sans action
Audit complet : contextIsolation/sandbox/nodeIntegration/CSP/IPC/auto-update tous corrects,
aucune vulnérabilité Electron directe.
- **CORRIGÉ** (`main.js`) : `setup:submit` retournait toujours `{ ok: true }` même quand
  `writeSetup()` échouait à écrire sur le disque (permissions/disque plein) — l'utilisateur
  n'avait aucun moyen de savoir que sa config ne serait pas mémorisée au prochain lancement.
  `writeSetup`/`completeSetup` remontent maintenant un booléen `persisted`, inclus dans la
  réponse IPC (`{ ok: true, persisted }`). La session en cours n'était déjà pas affectée
  (le cfg en mémoire est utilisé quoi qu'il arrive) — seul le rappel au prochain lancement
  change. Note : `setup.html` ne lit pas encore ce champ pour afficher un avertissement
  avant de fermer la fenêtre (la fenêtre se ferme immédiatement au succès) — câblage UI
  différé, nécessite une vérification visuelle Electron que je ne peux pas faire ici.
- **CORRIGÉ** : `dialog:pickFolder` n'avait pas de try/catch — une exception de
  `dialog.showOpenDialog` (rare) aurait fait rejeter la promesse IPC au lieu de renvoyer
  `null` proprement. Ajouté, vérifié par `node --check`.
- **NOTÉ, pas corrigé (faible priorité)** : `normalizeSetup()` ne vérifie pas que
  `musicDir` existe/est un dossier avant de l'accepter — délégué au serveur enfant qui doit
  de toute façon gérer un `AURALIS_MUSIC_DIR` invalide (même risque en déploiement
  non-Electron via variable d'env). Pas de renderer non-fiable ici (contextIsolation +
  sandbox actifs, setup.html est un fichier local livré par l'app, pas du contenu distant).

### Validation
`npm test` : 66/66 ✅. `./gradlew --offline compileDebugKotlin` : succès ✅.
`node --check desktop/main.js` : ✅. (Pas de `npm run check` ré-exécuté, aucun fichier
`src/` web modifié dans cette passe après le commit de la passe 1.)

### Pistes pour la passe 3
1. android-native/ : implémenter le header Authorization pour le stream ExoPlayer (voir
   note ci-dessus) — nécessite un device/émulateur pour vérifier que l'audio joue toujours.
2. desktop/ : câbler `setup.html` pour afficher le `persisted: false` avant de fermer la
   fenêtre de setup (nécessite vérification visuelle Electron).
3. Ajouter un feedback UI (toast/état vide explicite) quand `/api/recommend` échoue,
   web (`ExploreView`/home) ET android (`AppViewModel.fetchReco`).
4. Repasser sur `src/` avec un angle différent de la passe 1 (composants pas encore
   audités : lecteur audio bas niveau, store Zustand, service worker/PWA, service SSE).
5. Revérifier le point mineur passe 1 : taille de body JSON non bornée explicitement dans
   next.config (repose sur la limite Next.js par défaut).

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
