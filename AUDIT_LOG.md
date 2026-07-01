# Journal d'audit continu (local, non poussé sur GitHub)

Ce fichier suit les passes d'amélioration continue (sécurité / bugs / perf / UI) lancées
en local via `/loop 5h`. Chaque entrée résume ce qui a été trouvé, corrigé, testé, et ce
qu'il reste à explorer pour la prochaine passe. Ne pas pousser sur un remote — usage
local uniquement (voir consigne utilisateur : tout reste sur cette machine).

## 2026-06-30 — Passe 9 (`/goal` actif) — CommandPalette/menus contextuels/Queue

Dernières zones UI jamais vues en détail. Code jugé "globalement solide" par l'agent lui-même
(pas de crash, pas de fuite de listeners, pas de double-exécution, fermeture menu correcte
au clic extérieur/Escape). 2 findings mineurs remontés, **les 2 écartés après vérification** :

- "Race condition CommandPalette" (index de sélection clavier hors limites si on tape puis
  spamme ArrowDown avant que le debounce ne se résolve) — l'agent lui-même le note comme
  "TRÈS MARGINAL", déjà protégé par un guard `if (it)` (pas de crash), impact = "bruit UI"
  <1% du temps. Pas corrigé, rapport coût/bénéfice défavorable.
- "Submenu playlist qui déborde l'écran à droite sur petits écrans" — **FAUX POSITIF**,
  vérifié : `ContextMenu.tsx:582-591`, le wrapper est `className="relative"` mais le
  submenu lui-même n'a NI `absolute` NI `fixed` — c'est un simple bloc en flux normal
  (marges `mb-1 ml-2`, pas un décalage de positionnement) qui s'étend VERTICALEMENT sous
  l'item de menu, à l'intérieur du panneau parent déjà clampé horizontalement (`Math.min(x,
  window.innerWidth - menuW - 8)`). Le commentaire du code ("the original side fly-out")
  est trompeur — il n'y a pas de fly-out latéral en CSS, donc pas de débordement possible
  par ce mécanisme. Non modifié.

Aucun changement de code cette passe — les deux zones (CommandPalette, ContextMenu/Queue)
étaient déjà correctes. Confirme le pattern des dernières passes : les larges sweeps
d'audit de zones jamais vues rapportent de moins en moins de vrais bugs actionnables ; le
vrai rendement de fin de session vient de la relecture adversariale du travail déjà fait
(passe 8) plutôt que de continuer à chercher du terrain neuf.

### Validation
Aucun changement — `npm run check`/`npm test` toujours à l'état de la passe 8 (80/80).

## 2026-06-30 — Passe 8 (`/goal` actif) — revue adversariale des fixes déjà appliqués

**Méthode** : suite à la piste #3 de la passe 7, au lieu de chercher une nouvelle zone,
relecture sceptique des fixes déjà committés cette session. Ça a payé immédiatement :

### CORRIGÉ — vrai bug introduit par MOI passe 6, trouvé par calcul, pas par un agent
`MAX_JSON_BODY_BYTES = 10MB` (passe 6, `readJsonBody`) est plus PETIT que ce que le
propre `MAX_COVER_BYTES = 8MB` de la route autorise une fois encodé : le base64 gonfle
les octets bruts de 4/3, donc une image de 8MB devient ~11.2MB de JSON une fois encodée
en data URL. Résultat : l'upload de cover exactement à la taille max que le code est
censé permettre recevait un faux 413 AVANT même d'atteindre le check `MAX_COVER_BYTES`
de la route. Plafond relevé à 12MB avec marge. Reproduit puis vérifié avec un VRAI test
d'intégration qui PUT une vraie image de 8MB à travers `/api/state` (pas juste un calcul
d'octets) — le test échoue avant le fix, passe après.

### Test ajouté pour le fix `navigate()` de la passe 7
`store/player.ts` n'avait aucun test dédié pour `navigate()`/`back()`. Ajouté :
même référence d'objet + pas de doublon d'historique sur re-navigation vers la vue
active, `back()` qui saute bien à la vraie vue précédente (pas coincé sur un doublon),
`fullscreenPlayer` qui se ferme quand même sur une navigation redondante.

### Point méthode confirmé
Cette passe valide la piste de la passe 7 : les bugs les plus coûteux de cette session
(la fuite `checkBodySize`, ce plafond trop petit) n'ont PAS été trouvés par les agents
d'audit — ils ont été trouvés en écrivant de VRAIS tests d'intégration qui appellent le
code réellement modifié avec des données réalistes, puis en refaisant le calcul à la
main. Un agent qui lit du code ne simule pas l'encodage base64 ; un test qui construit
un vrai payload de 8MB, si.

### Validation
`npm run check` + `npm test` (80/80) verts après chaque commit.

### Pistes pour la passe 9
1. Continuer la revue adversariale sur les fixes non testés : SSE `cancel()`/`closed`
   (passe 3, pas de test dédié — testable via un reader manuel sur le ReadableStream),
   les fixes Android/Electron (compile-vérifiés seulement, pas de test comportemental
   possible sans device/émulateur — accepter cette limite).
2. android-native/ ExoPlayer + desktop/ setup.html : toujours en attente de device.
3. Zones jamais vues en détail : CommandPalette, menus contextuels, Queue complet,
   vues Home/Library/Explore de haut niveau.

## 2026-06-30 — Passe 7 (`/goal` actif)

**Méthode** : dernière grande zone UI non auditée (Sidebar/Shell/TitleBar), agent le plus
minutieux de la session (70 appels d'outils). Bilan : event listeners, responsive,
accessibilité (skip-link, aria-current, focus-visible, vrais `<button>`), drag-region
Electron — tout confirmé correct, RAS. 3 findings de perf/re-render remontés, triés :

- **CORRIGÉ, et plus important que la sévérité "MOYEN" annoncée** : `navigate()`
  (`store/player.ts`) recréait TOUJOURS un nouvel objet `view` et poussait TOUJOURS
  l'entrée courante sur `navHistory`, même en navigant vers la vue déjà active (re-clic
  sur un lien sidebar déjà sélectionné). Au-delà du re-render gâché (tout sélecteur
  atomique `s.view` re-render pour rien), ça polluait `navHistory` d'un doublon — `back()`
  “revenait” alors sur la même vue, un appui perdu avant d'aller réellement en arrière.
  Correction à la source (le store, pas juste le sélecteur Sidebar comme suggéré) : même
  référence `view` réutilisée et pas de push d'historique si la cible est identique ;
  `fullscreenPlayer: false` reste inconditionnel (un clic de nav doit toujours sortir du
  plein écran).
- **CLAIM ÉCARTÉE** : "Shell re-render à chaque tick du sleepTimer (~chaque seconde)" —
  faux, vérifié dans `store/player.ts` : `sleepTimer` ne change que 3 fois par cycle de
  vie (démarrage / fin-de-piste / expiration), le compte à rebours est un `setTimeout`
  unique calculé une fois, pas un `setInterval` qui tick. Non modifié.
- **NOTÉ, pas corrigé (sévérité réelle plus faible que "MOYEN-HAUT")** : la liste de
  playlists de la Sidebar n'utilise pas `Virtualized.tsx` (qui existe et sert déjà les
  vraies grosses listes — bibliothèque de morceaux avec cover art). Mais elle est plafonnée
  server-side à 500 playlists, chaque ligne est juste icône statique + texte (pas d'image
  réseau par ligne) — pas la classe de liste pour laquelle la virtualisation a été
  construite. Pas assez d'impact réel pour justifier la complexité d'intégration ici.

### Point méthode important de cette passe
`npm run check` (lint --max-warnings 0 + typecheck + build) a échoué après le commit
"passe 6" précédent (`test/art.test.ts` utilisait des `!` non-null assertions interdites
par ESLint) — **je ne l'avais PAS relancé après ces tests, seulement `npm test` (plus
étroit)**. Recorrigé immédiatement. Leçon : toujours lancer `npm run check` en entier
après CHAQUE changement, pas seulement `npm test`, même pour un ajout "juste des tests" —
`npm test` ne lint pas.

### Validation
`npm run check` + `npm test` (76/76) verts après correction.

### Pistes pour la passe 8
1. android-native/ ExoPlayer + desktop/ setup.html : toujours en attente de device/test
   manuel.
2. La couverture d'audit ligne-par-ligne a maintenant traversé : API routes, perf/SQLite,
   store/moteur audio, PWA/SSE, scanner, musixmatch/ffmpeg, settings/admin/lib,
   Sidebar/Shell/TitleBar. Zones encore non vues en détail : CommandPalette, contextes de
   menu (context menus track/album/playlist), le composant Queue complet (au-delà de
   QueueList déjà touché passe 1), et les vues Home/Library/Explore elles-mêmes
   (composants de haut niveau, pas juste leurs sous-parties déjà auditées).
3. Envisager un premier passage volontairement ADVERSARIAL sur les fixes DÉJÀ appliqués
   dans ce journal (relire chaque diff des passes 1-7 avec un œil sceptique) plutôt que de
   continuer à chercher de nouvelles zones — la passe 6 a montré qu'un "fix" peut sembler
   correct (compile, buildé) sans être réellement testé en conditions réelles.

## 2026-06-30 — Passe 6 (`/goal` actif)

### ExoPlayer Authorization header — RECOMMANDATION DES PASSES 2-5 CORRIGÉE, pas implémentée
En creusant pour l'implémenter (compile-check possible via Gradle offline, mais pas de
device pour tester le runtime), j'ai trouvé un détail de design qui change la donne :
`AuralisMediaCache.dataSourceFactory()` (`PlaybackService.kt:246-259`) est un
`CacheDataSource.Factory` **long-lived** créé UNE FOIS dans `onCreate()`, et son
`CacheKeyFactory` (ligne 254-257) **strip explicitement le `?token` de la clé de cache**
avec ce commentaire : *"the rotating ?token so a track keeps ONE entry across rotations"*
— autrement dit, le token-en-query-param est un choix DÉLIBÉRÉ qui anticipe déjà la
rotation du token (après changement de mot de passe / re-login, cf. `token = json.optString`
dans `AuralisApi.kt:91`).

`DefaultHttpDataSource.Factory().setDefaultRequestProperties(map)` (la fix que j'avais
recommandée passes 2-4) fige une Map de headers AU MOMENT de la création de la factory
(`onCreate()`, une fois pour toute la durée du service). Si le token tourne ensuite
(reset mdp), soit il faut muter cette même Map partagée en place (comportement non
garanti/non documenté par media3 sans vérification runtime), soit le header reste
PÉRIMÉ silencieusement — un bug d'auth qui casserait la lecture APRÈS un changement de
mot de passe, plus difficile à repérer qu'un simple oubli de header. Risque plus élevé
que ce que j'avais évalué avant d'avoir lu ce commentaire.

**Non implémenté.** Recommandation révisée pour qui reprend ça avec un device : il faut
soit (a) une Map mutable partagée mise à jour à chaque rotation de token + vérifier
empiriquement que media3 relit bien la map à chaque requête plutôt que de la copier à la
construction, soit (b) un `HttpDataSource.Factory` custom qui lit le token courant depuis
`Prefs`/`AuralisApi` à chaque `createDataSource()`. Dans les deux cas : test runtime
obligatoire (lecture avant/après un changement de mot de passe) avant de merger.

### Test HTTP d'intégration réel → a trouvé un VRAI trou dans mon propre fix de la passe 3
J'ai écrit `test/httpRoutes.test.ts` (appelle les vrais handlers `POST` des routes, pas
juste `checkCsrf`/`checkBodySize` en isolation comme `csrf.test.ts`) pour combler le gap
"aucun test d'intégration HTTP" noté depuis 2 passes. Premier test écrit — body JSON de
11MB sur `/api/auth/login`, attendu 413 — **a échoué (401 reçu)**. En creusant :
`new Request(url, { body: "grosse-string" })` construit en JS **ne pose PAS de header
`content-length`** (vérifié : `req.headers.get("content-length")` → `null` malgré un body
de 11MB) — donc `checkBodySize()` (la fix de la passe 3, basée uniquement sur ce header)
ne bloquait RIEN pour un client qui n'envoie pas ce header, le mentait, ou utilisait un
chunked transfer-encoding. Exactement le vecteur DoS que la fix était censée fermer,
grand ouvert pour n'importe quel client qui ne coopère pas.

**CORRIGÉ** : remplacé `checkBodySize()` + `request.json()` par `readJsonBody()`
(`src/server/http.ts`) sur les 6 routes concernées — lit le stream manuellement avec un
compteur d'octets réel et annule le reader dès que la limite est dépassée, donc la limite
tient peu importe ce que le client déclare ou omet. Le check `Content-Length` est gardé
comme fast-path (rejette sans rien lire pour une requête honnêtement trop grosse) mais
n'est plus la seule ligne de défense. Les 4 nouveaux tests (413 sur body réellement gros,
401 sans cookie sur mauvais mdp, 200 + cookie HttpOnly + token sur bon login, 400 sur JSON
invalide) passent, ainsi que toute la suite (71/71).

**Point méthode** : un `npm run check` qui passe ne prouve QUE la compilation — il n'a
jamais exercé le vrai comportement runtime de `checkBodySize`. Un test d'intégration qui
appelle le handler réel avec un `Request` construit comme un vrai client le ferait aurait
dû exister dès la passe 3. À refaire : écrire le test qui exerce vraiment le nouveau code,
pas seulement vérifier que ça compile, à chaque fix futur touchant une route API.

## 2026-06-30 — Passe 5 (`/goal` actif)

**Méthode** : suite du punch-list passe 4 (musixmatch.ts/analysis.ts jamais audités,
settings/admin/lib jamais audités).

### musixmatch.ts — AUDITÉ, RAS
Timeout AbortController 9s, JSON/schema défensifs partout (optional chaining), tous les
paramètres utilisateur `encodeURIComponent()`-és, pas de secret en dur. Rien à corriger.

### analysis.ts (classifieur mood ffmpeg) — 1 vrai bug corrigé, 1 claim écartée
- **CORRIGÉ** : `decodePcm()` n'avait aucun timeout — `-t 60` borne la durée de l'AUDIO
  décodé par ffmpeg, PAS le temps d'exécution réel du process. Un fichier corrompu ou un
  dossier musique monté en réseau (NFS/SMB, cas réel en self-hosted) qui stall peut laisser
  le process ffmpeg bloqué indéfiniment (aucun événement `data`/`close`/`error` ne se
  déclenche jamais), gelant la Promise pour toujours. Avec `CONCURRENCY=2`, deux fichiers à
  problème suffisent à bloquer TOUT le reste de la passe d'analyse en arrière-plan sans la
  moindre erreur visible. Ajout d'un timer de 30s qui `kill()` le process et résout `null`.
- **CLAIM ÉCARTÉE** : le même agent a aussi affirmé que le cap `CAP` (garde-fou sur la
  taille du buffer PCM) causait un blocage par backpressure sur stdout. Faux — le listener
  `data` continue de CONSOMMER (drainer) chaque chunk, il arrête juste de les STOCKER
  au-delà de CAP ; le pipe ne se remplit donc jamais, pas de blocage. Non modifié.

### settings/admin (DetailView.tsx) + lib/auralis/*.ts — 2 petits fixes, reste RAS
Agent le plus minutieux de la session (48 appels d'outils) : confirmations sur toutes les
actions destructives (`window.confirm`), CSRF correct sur toutes les mutations, mots de
passe jamais affichés en clair, validation serveur correcte partout (`timingSafeEqual`,
rate limiting), et tous les utilitaires `lib/auralis/*.ts` déjà protégés contre les
divisions par zéro / edge cases (vérifié : `normalizeTempo`, `featureVector`,
`evaluateSmartList`, `parsePlaylistFile`).
- **CORRIGÉ** : `changePassword` (DetailView.tsx:1422) n'avait pas le garde `if (busy)
  return;` que `create` (compte admin) a déjà — même classe de double-soumission,
  appliquée de façon incohérente. Sévérité très basse (React batch les renders, fenêtre de
  course quasi inexistante en pratique) mais correctif gratuit et cohérent.
- **CORRIGÉ** : `resetPassword` (admin réinitialisant le mot de passe d'un autre compte)
  n'avait pas de check de longueur minimale (6) côté client avant l'aller-retour réseau —
  le serveur validait déjà correctement (aucun risque sécu), juste une requête gâchée.

### Validation
`npm run check` + `npm test` (67/67) verts après chaque commit de cette passe.

### Pistes pour la passe 6
1. android-native/ ExoPlayer Authorization header + desktop/ setup.html wiring : toujours
   en attente d'un device/émulateur/test manuel (reporté depuis passe 2).
2. Zones encore non vues en détail : Sidebar/Shell/TitleBar (React), test HTTP
   d'intégration sur au moins une route API, test dédié `art.ts`.
3. Envisager de relire ce journal en entier et vérifier qu'aucune piste "différée" n'a
   été oubliée trop longtemps (5 passes en une session — risque de dérive/redite).

## 2026-06-30 — Passe 4 (`/goal` actif)

**Méthode** : suite du punch-list passe 3 (warning NFT, scanner.ts jamais audité, trou de
test reco). Détails déjà committés individuellement ; résumé ici pour la continuité.

- **Warning build NFT (alignment.ts)** : investigué, annotation `turbopackIgnore` ajoutée
  (recommandation officielle de Next) mais le warning persiste quand même — a priori cette
  version de Turbopack ne l'honore pas pour `fs.existsSync`, seulement pour les imports
  dynamiques. Vérifié l'impact réel : `.next/standalone` fait 59M, pas de bloat (les
  `outputFileTracingExcludes` déjà en place pour ce même problème historique absorbent le
  souci). Conclusion : warning cosmétique, non bloquant, laissé tel quel.
- **Test reco/engine.ts** : ma note de la passe 3 disant "aucun test" était fausse
  (`test/reco.test.ts` existait déjà et couvre bien le moteur) — corrigée. Le seul vrai
  trou (fenêtre de lecture à 180 jours ajoutée passe 1) a reçu un test dédié.
- **Audit `scanner.ts`** : 3 findings remontés par l'agent, **les 3 se sont révélés
  soit faux soit déjà mitigés ailleurs** après vérification ligne par ligne :
  - "GRAVE : un fichier corrompu crash tout le scan" (`buildRow()` → `extractMetadata()`
    sans try/catch dans un `Promise.all`) — FAUX. `extractMetadata()`
    (`metadata.ts:83-139`) a SON PROPRE try/catch interne et retourne un fallback dérivé
    du nom de fichier pour tout conteneur illisible/non supporté ("still index it with
    filename data" est même écrit dans un commentaire) — elle ne lève jamais. Même
    vérification sur `cacheFolderCover()` (`art.ts:42-55`, aussi try/catch par candidat) :
    aucune fonction appelée dans `buildRow()` ne peut réellement rejeter dans ce
    scénario. Le pattern `Promise.all` fail-fast est réel en général mais ne s'applique
    pas ici en pratique.
  - "MODÉRÉ : path traversal via symlinks pendant le scan" (un symlink dans musicDir
    pointant hors racine serait indexé) — le scan lui-même ne valide en effet pas ça,
    MAIS ce n'est pas exploitable pour une exfiltration réelle : la route de streaming
    (`api/stream/[...path]/route.ts:64`) utilise déjà `resolveRealLibraryPath()`
    (`server/paths.ts:30-44`), qui suit le symlink via `realpath` et revérifie le
    confinement dans musicDir AVANT de servir le moindre octet — exactement pour ce
    scénario (commentaire du code : "a symlink inside the library can point outside it;
    this follows the link with realpath and re-checks containment"). Pire cas réel :
    des MÉTADONNÉES (titre/durée dérivés du nom de fichier) de fichiers hors racine
    pourraient apparaître dans l'index, jamais le contenu. Et ça suppose un attaquant qui
    a déjà un accès écriture au dossier musique du serveur (typiquement l'opérateur
    lui-même en self-hosted). Sévérité réelle : basse, pas modérée. Un check `realpath`
    par dossier PENDANT le scan durcirait encore, mais ajoute un syscall par dossier sur
    potentiellement des dizaines de milliers de dossiers — pas justifié vu la sévérité
    réelle et la priorité "moins de ressources" du projet. Non modifié.
  - "MINEUR : pas de validation explicite que `rel` n'échappe pas" — même mécanisme que
    ci-dessus, déjà couvert par `resolveLibraryPath`/`resolveRealLibraryPath` au moment de
    servir. Non modifié.
  - Confirmé correct par l'agent (RAS) : pas de fuite de ressources, pas de race
    (flag `scanning` + Node single-threaded), parallélisme borné (META_BATCH=24,
    WRITE_BATCH=200), transactions SQLite pour l'atomicité.
- **Point méthode à retenir** : cet agent a terminé en 1 seul appel d'outil (lecture
  unique du fichier, pas de vérification croisée des fonctions appelées) — 3ᵉ "GRAVE"/
  "critique" de cette session qui ne survit pas à une relecture réelle des fonctions
  citées (après le leak SSE et les `contentDescription` Android). Toujours ouvrir et lire
  les fonctions APPELÉES par le code signalé, pas seulement le code signalé lui-même.

### Validation
`npm run check` + `npm test` (67/67) verts après chaque commit de cette passe.

### Pistes pour la passe 5
1. android-native/ : header Authorization ExoPlayer (en attente d'un device/émulateur).
2. desktop/ : câblage visuel `setup.html` (en attente de test manuel).
3. Zones encore non auditées : composants settings/admin (web), `src/lib/auralis/*`
   (utilitaires partagés), lyrics/musixmatch (`musixmatch.ts`), mood classifier
   (`analysis.ts`, DSP ffmpeg).
4. Test d'intégration HTTP sur au moins une route API (actuellement tout est unitaire sur
   la couche server/lib) ; test dédié pour `art.ts` (cache d'images).
5. Repasser en detail sur les composants React pas encore vus ligne par ligne (Sidebar,
   Shell/TitleBar, settings panels) — la passe 1 a couvert un échantillon, pas l'exhaustif.

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
