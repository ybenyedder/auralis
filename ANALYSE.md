# Audit complet du projet Auralis

Audit effectué sur l'intégralité du dépôt github.com/ybenyedder/auralis, tel que
cloné le 12 septembre 2026, avant puis après application des corrections de la
version 1.19.0. Périmètre : serveur (API, base SQLite, scan, paroles, moteur de
recommandation), client web/PWA, client Android natif (27 fichiers Kotlin lus en
entier), client iOS natif, client desktop Electron, Docker, scripts de déploiement
et de sauvegarde, œuf Pterodactyl, workflows GitHub, tests. Chaque constat cite
son fichier et sa ligne. Les gravités vont de P1 (critique : perte de données ou
faille directement exploitable) à P4 (détail).

Les corrections déjà appliquées sont marquées « corrigé ». Le reste constitue le
plan de travail, priorisé en fin de document.

---

## 1. Ce que le projet est

Auralis est un lecteur de musique auto-hébergé pensé d'abord pour le mobile. Un
serveur Next.js embarque une base SQLite (bibliothèque, utilisateurs, historique
d'écoute), un scanner de fichiers (tags ID3, pochettes, paroles LRCLIB), et un
moteur de recommandation calculé par utilisateur. Trois clients le consomment :
une PWA web (React 19 + Zustand, le cœur du projet), une application Android
native en Kotlin/Compose avec Media3, une application iOS en Swift. Un client
desktop Electron lance le serveur en local et l'affiche dans une fenêtre. Le
serveur ne renvoie que des identifiants de titres pour les recommandations ; les
clients résolvent contre leur copie de la bibliothèque. L'écoute est comptée par
un garde-fou côté client : trente secondes réellement écoutées, ou la moitié du
titre, les seek étant exclus du cumul.

Le projet est dans l'ensemble écrit avec soin. Les sections 3 à 9 listent ce qui
ne va pas ; la section 10 note ce qui tient particulièrement bien, parce qu'un
audit qui ne dit que du mal n'est pas crédible.

---

## 2. Corrections déjà appliquées (v1.19.0)

Ces points ont été trouvés lors d'une première passe axée sur la demande
utilisateur (mix aléatoire de titres jamais écoutés, écoute H24, mémorisation des
options), puis corrigés et testés. Le détail est dans le CHANGELOG ; résumé :

- Mix « Jamais écoutés » aléatoire à chaque appui, présent sur l'accueil et
  l'onglet Radio de la PWA et dans l'application Android (`startUnheardMix` dans
  `src/store/slices/playbackSlice.ts`, `playUnheardMix` dans
  `android-native/.../ui/AppViewModel.kt`).
- Fin de file d'attente : la continuation autoplay privilégie désormais les
  titres jamais joués puis les moins joués (`buildContinuation` dans
  `src/store/slices/helpers.ts`, `appendContinuation` dans AppViewModel.kt), et
  l'application Android recycle la bibliothèque au lieu de s'arrêter en silence
  quand tout a été mis en file.
- Options de lecture (boucle, aléatoire, lecture continue) synchronisées dans les
  réglages du compte serveur par les bascules de `queueSlice.ts`, et adoptées au
  démarrage par `hydrateFromServer` quand le client n'a aucun choix local
  persisté.
- Session reprise en pause qui n'était plus perdue (`partialize` de
  `src/store/player.ts` écrivait la session seulement pendant la lecture).
- Retour Android intégré à l'historique navigateur (`src/app/page.tsx`, bloc
  `popstate`) ; boutons précédent/suivant sur le mini-lecteur mobile ; minuterie
  de sommeil mobile alignée sur le bureau ; correctif d'état « en lecture »
  mensonger après un redémarrage repeat-one raté.
- Android : fond flou du lecteur plein écran réparé (chemin relatif non résolu
  dans `ui/player/Player.kt`) ; déconnexion qui purge `last_session`
  (`data/Prefs.kt`) ; dépendances de test ajoutées au Gradle
  (`app/build.gradle.kts`) et deux tests dépendant d'`android.net.Uri` bornés
  par `Assume` dans `net/AuralisApiTest.kt`.

Une troisième passe de corrections a ensuite traité : authentification de
`/api/art` (4.3), garde SSRF par résolution DNS (4.4), hachage des jetons de
session au repos, application du verdict « mot de passe compromis », parité de
timing à la connexion, Range multi-plages en 200 (4.8), fanion dirty du watcher
(5.3), index de purge et transactions par lots (5.4), single-flight des accents
(5.5, partiel — le GC disque reste à faire), chien de garde de l'alignement de
fond (5.9), conservation des règles/partages à l'import (5.10), `migrate-status`
lecture seule et chemin portable du générateur d'échantillons (5.12), restaure
sur bibliothèque vide, conflit Échap, jetons `--brass`/amber/emerald/pb-safe/
backdrop-in, paroles au clavier, clés de listes, AccountManager, partage sans
presse-papiers, revocation différée, greffe des compteurs, `pointercancel`,
SELECT, barres d'album (6.9/6.10), filtre `onConnect` du service média (7.1),
version réelle et pochettes de playlists côté Android, sauvegarde pré-update et
prune filtrée (10.6).

## 3. Trois problèmes critiques trouvés par l'audit, corrigés depuis

### 3.1 P1 — Le contrôle du mot de passe actuel ne vérifiait rien
`src/server/auth.ts:244`. `verifyCredentials` est asynchrone, mais
`changePassword` ne l'attendait pas : `!Promise` vaut toujours faux, donc la
branche de rejet était inatteignable. N'importe quelle session authentifiée
(ordinateur partagé, membre du foyer) pouvait remplacer le mot de passe de
n'importe quel compte, admin compris, avec un mot de passe actuel bidon. La
vérification du mot de passe actuel, seule protection du changement autonome de
mot de passe, était purement décorative. Corrigé : `await` ajouté, et test de
régression `changePassword rejects a wrong current password` dans
`test/httpRoutes.test.ts`.

### 3.2 P1 — Un scan sur montage vide effaçait la bibliothèque et tout l'historique
`src/server/library/scanner.ts` (fonction `runScan`, bloc de purge vers la ligne
305). Le scan ne court-circuite que si le dossier musique n'existe pas. Si le
dossier existe mais est vide ou illisible au moment du scan — montage NFS/CIFS
pas encore monté au démarrage du conteneur, point de montage automount vide,
glitch de permissions, changement du dossier configuré — le walk renvoie zéro
fichier et la purge supprime toutes les pistes, puis la cascade
(`scanner.ts:323-341`) efface définitivement favoris, dislikes, compteurs
d'écoute, historique récent, événements d'écoute, pistes de playlists et paroles
de tous les utilisateurs. Quand le montage revient, les fichiers sont réindexés
mais l'historique est perdu pour toujours. Corrigé : soupape de sécurité qui
refuse la purge quand plus de 60 % de la bibliothèque (ou plus de 50 titres)
disparaît en un scan, avec message explicite dans la progression, et variable
d'échappement `AURALIS_ALLOW_MASS_PRUNE=1` pour le cas réel d'une bibliothèque
volontairement vidée.

### 3.3 P1 — La clé de signature Android n'est pas couverte par le .gitignore
`android-native/.gitignore` ne couvrait ni le keystore ni
`keystore.properties`, alors que les commentaires de `app/build.gradle.kts:59-63`
et des workflows de release racontent que la clé d'origine a déjà fuité et que la
nouvelle est chargée depuis un fichier « gitignored ». `git check-ignore` le
confirmait : toute restauration locale de la clé pour un build de release, suivie
d'un `git add android-native`, committe la nouvelle clé — reproduisant l'incident
et permettant de signer des fausses mises à jour pour tous les utilisateurs de la
branche GitHub. Corrigé : entrées ajoutées au `.gitignore` (vérifié par
`git check-ignore`).

---

## 4. Serveur — sécurité et surface HTTP

### 4.1 P2 — Déni de service mémoire pré-authentification via la connexion
`src/app/api/auth/login/route.ts:16,22-23` et `src/server/rateLimit.ts:33-44`.
Le nom d'utilisateur du corps JSON n'a aucun contrôle de type ni de longueur,
peut peser jusqu'à la limite de 12 Mo du corps, et sert de clé de compartiment
de limite de débit telle quelle. La purge ne démarre qu'au-delà de 5000 clés :
quelques milliers de requêtes d'un mégaoctet saturent la RAM d'un NAS. Par
ailleurs, un nom non-chaîne lève un `TypeError` sur `.trim()` et rend un 500.
Corrigé : type et longueur validés, 400 sur anomalie (le hachage de clé est devenu
inutile puisque les clés sont désormais bornées).

### 4.2 P2 — Les sessions n'expirent jamais et la table croît sans limite
`src/server/auth.ts:270-287` et `src/app/api/auth/status/route.ts:18`.
`decodeSessionToken` ne vérifie aucune date ; `SESSION_TTL_MS` (30 jours) ne
gouverne que le cookie. Un jeton copié hors du navigateur reste valable
indéfiniment, et `GET /api/auth/status` fabrique une ligne de session à chaque
appel. Corrigé (sauf le point `status`, neutralisé par la purge) : TTL vérifié dans
`decodeSessionToken` et purge périodique sur le balayage de 30 s.

### 4.3 P3 — `/api/art/[hash]` est la seule surface de contenu sans authentification
`src/app/api/art/[hash]/route.ts:12`. Pas de traversée de chemin (le hash est
validé par regex), mais chaque requête anonyme peut déclencher un travail sharp
et six variantes disque, sans limite de débit. Ajouter `checkAuth`, sauf besoin
documenté d'un accès anonyme pour les aperçus, auquel cas passer par des URLs
signées de courte durée.

### 4.4 P3 — La garde SSRF de l'import d'playlist par URL directe est contournable
`src/server/library/externalPlaylist.ts:347-355,435-448`. `isPrivateHost`
compare la chaîne du nom d'hôte : `127.1`, `0x7f000001`, `2130706433`,
`[::ffff:10.0.0.5]` et tout nom DNS résolvant en privé passent, puis le fetch
se connecte. Les imports Spotify/Deezer/YouTube sont sûrs (identifiant extrait,
hôte codé en dur). Correctif : résoudre avec `dns.lookup({all:true})` et rejeter
si une adresse résolue est privée, boucle ou link-local.

### 4.5 P3 — La déconnexion ne révoque pas les jetons bearer
`src/app/api/auth/logout/route.ts:13-22`. Seul le cookie est révoqué alors que
les clients s'authentifient d'abord par jeton localStorage. « Je me suis
déconnecté du PC partagé » ne termine rien. Corrigé : les trois identifiants sont révoqués.

### 4.6 P3 — La CSP autorise `script-src 'unsafe-inline'`
`next.config.ts:95`. La présence d'une CSP est déjà bien ; le `'unsafe-inline'`
l'annule pour les scripts, et le jeton porteur vit dans localStorage
(`src/lib/auralis/api.ts:28-45`), donc XSS égal vol de session. Passer à un
CSP à nonce via middleware Next.

### 4.7 P3 — Un GET de paroles sans cache déclenche jusqu'à trois appels sortants non limités
`src/app/api/lyrics/[trackhash]/route.ts:14-26`. Seul le POST est limité. Un
compte peut balayer des hash au hasard et faire bannir l'IP du serveur par
LRCLIB/Musixmatch pour tout le monde. Corrigé : limite de 90 requêtes/min par
compte sur les GET hors cache.

### 4.8 P4 — Divers
- L'action `setting` lève sur une valeur > 16 Ko et rend un 500 brut au lieu
  d'un 400 (`src/app/api/state/route.ts:81-84`, `userState.ts:198`). Corrigé :
  la route renvoie désormais un 400.
- Un cookie malformé (`%` orphelin) fait lever `decodeURIComponent` dans
  `parseCookie` et 500 toutes les requêtes du client fautif
  (`src/server/auth.ts:294`, `logout/route.ts:19`). Corrigé : décodage tolérant.
- `token_version` est incrémenté mais jamais lu ; l'invalidation fonctionne en
  réalité par suppression des sessions (`src/server/auth.ts:235`). Documenter
  ou supprimer.
- Les jetons de session sont stockés en clair dans `sessions.id` : la
  sauvegarde admin téléchargeable contient donc tous les jetons vivants
  (`src/server/auth.ts:262-264`). Stocker `sha256(token)`.
- `GET /api` divulgue la version exacte et la carte des points d'accès sans
  authentification, alors que `/api/health` s'en garde
  (`src/app/api/route.ts:6-10`). Corrigé : version réservée aux sessions.
- La garde CSRF honore `X-Forwarded-Host` sans condition ; ne le faire que
  derrière `AURALIS_TRUST_PROXY=1` (`src/server/http.ts:116-117`). Corrigé
  (changement de comportement : les déploiements derrière proxy doivent poser
  la variable, documentée dans `deploy/.env.example`).
- Les requêtes multi-range reçoivent 416 au lieu d'un 200 complet ;
  `If-Range` est ignoré. Aucun lecteur audio n'en envoie, impact nul aujourd'hui
  (`src/app/api/stream/[...path]/route.ts:16-17`).
- Le corps de connexion est lu avant la limite de débit IP — inversion
  défendable mais qui amplifie 4.1 (`login/route.ts:11-24`).
- Le test « mot de passe compromis » est consulté avant validation locale et son
  verdict n'est pas appliqué côté serveur (`src/server/auth.ts:167-179`).
- `deploy/.env.example:16` livre `AURALIS_ADMIN_PASSWORD=changez-moi`
  décommenté (voir aussi 9.3). Corrigé : la variable est commentée avec
  l'explication du mot de passe généré.

---

## 5. Serveur — données, scan, paroles, recommandation

### 5.1 P2 — Le numéroteur de migrations se fie au nombre de fichiers
`src/server/db.ts:23-46`. Les migrations vont de 001 à 012 avec un 011 absent ;
`user_version` est posé à la position dans le tableau, pas au numéro du fichier.
Si un jour un `011.sql` apparaît, toutes les bases déjà migrées (version 11) le
sauteront et rejoueront `012.sql`. Corrigé autrement : `012.sql` est renommé
`011.sql` (le créneau n'a jamais existé dans l'historique git, donc aucune base
existante n'est affectée), le fossé disparaît, et le runner prévient si la base
prétend être plus récente que les fichiers.

### 5.2 P2 — Aucun délai mort sur l'analyse des tags
`src/server/library/metadata.ts:88-89`. `music-metadata` peut ne jamais rendre la
main sur un fichier corrompu ou un montage suspendu ; le lot `Promise.all` ne se
résout jamais, `scanning` reste vrai et plus aucun scan ne repart. Le projet
règle déjà ce problème pour ffmpeg (`analysis.ts:90-93`). Corrigé : chien de
garde de 20 s via `Promise.race`, repli sur les données du nom de fichier.

### 5.3 P3 — Les événements du watcher sont perdus pendant un scan
`src/server/library/watcher.ts:58-65`. Un événement déclenché pendant un scan
est jeté sans ré-armement ; un fichier ajouté après le passage du walk attend le
prochain événement sans rapport. Les `.lrc` et pochettes de dossier ne
déclenchent rien du tout (`watcher.ts:52`), laissant `has_lyrics` périmé. Poser
un fanion « dirty » rejoué en fin de scan ; déclencher aussi sur `.lrc`.

### 5.4 P3 — La purge fait un scan de table par titre supprimé, dans une seule transaction
`src/server/library/scanner.ts:323-349`. Dans favorites, dislikes, playcounts,
recents, playlist_tracks et play_events, `trackhash` est deuxième colonne de clé
ou non indexé : chaque DELETE est un parcours complet, re-préparé dans la boucle,
le tout dans une transaction d'écriture qui bloque scrobbles et favoris pendant
des minutes sur une grande bibliothèque. Ajouter des index sur `trackhash`,
sortir les statements préparés de la boucle, et découper par lots.

### 5.5 P3 — Le cache de pochettes ne se nettoie jamais, et `ensureAccentFor` peut s'emballer
`src/server/library/art.ts`. Les fichiers art et les six tailles de vignettes ne
sont jamais supprimés (la cascade ne retire que les lignes `art_colors`) ; et
l'accent calcule sharp `.stats()` en concurrence sans dédoublonnage à l'arrivée
des premières requêtes. Ajouter un ramasse-miettes périodique (fichiers sans
référence `tracks.arthash`) et un single-flight par clé.

### 5.6 P3 — Le sidecar .lrc modifié à la main est écrasé par le cache
`src/server/lyrics/service.ts:329-339`. Malgré le commentaire, `isFresh` renvoie
vrai pour toujours sur les paroles trouvées : une fois cachées depuis LRCLIB,
modifier le `.lrc` n'a plus aucun effet. Comparer la date du sidecar à
`fetched_at`.

### 5.7 P3 — Le cache du profil reco garde une copie complète du catalogue par utilisateur
`src/server/reco/engine.ts:313-339`. Les BLOB d'embedding sont chargés pour
chaque piste et mis en cache par utilisateur (2,5 s de TTL, éviction seulement
par inactivité) : centaines de Mo retenus avec de grandes bibliothèques et
plusieurs comptes actifs. Charger les embeddings à la demande ou les exclure des
lignes mises en cache, et borner le cache à quelques utilisateurs.

### 5.8 P3 — `recommendTrajectory` est quadratique
`src/server/reco/engine.ts:531-561`. Chaque pas re-scanne tout le bassin pour la
similarité : dix millions d'évaluations par requête sur cent mille titres,
synchrone sur la boucle d'événements. Pré-trier une fois vers le point milieu de
l'arc, ou bureauter par grille arousal×valence.

### 5.9 P3 — L'alignement de fond n'a pas de délai mort
`src/server/library/alignment.ts:190` contre `:82-117`. Le passage forcé
post-scan peut rester `aligning = true` pour toujours si le processus Python se
suspend ; le chemin à la demande a déjà son SIGKILL, réutiliser le motif.

### 5.10 P3 — L'import de sauvegarde perd les règles de playlists intelligentes et le partage
`src/server/state/userState.ts:373-381`. `replaceUserState` recrée les playlists
sans `rules` ni `is_shared`, et orpheline les lignes `playlist_collaborators`.
Exporter puis réimporter détruit la configuration des playlists intelligentes.

### 5.11 P3 — Incohérences de signatures dans le moteur de recommandation
Le bonus UCB mélange deux horizons temporels (`bandit.ts:22-28` utilisé à
`engine.ts:397` : dénominateur sur 180 jours, numérateur à vie), ce qui change
l'algorithme selon l'âge du compte. La chaîne de Markov relie A→C à travers un
titre B sauté (`session.ts:66-82`). Rendre les deux horizons cohérents et couper
la chaîne sur les skips.

### 5.12 P4 — Divers
- `migrate-status.ts:20` crée la base au lieu de l'ouvrir en lecture seule.
- Les requêtes du récap mensuel utilisent `strftime` et ratent l'index
  (`recap.ts:87-98`, `stats.ts:42-52`) — remplacer par un prédicat de bornes.
- Un échec d'analyse transitoire est marqué analysé pour toujours
  (`analysis.ts:322-328`) — reposer `analyzed_at = 0` avec un compteur borné.
- Les bornes jour/mois utilisent l'heure du serveur : en conteneur UTC, les
  séries d'un utilisateur UTC+2 sont décalées (`temporal.ts:46-53`,
  `stats.ts:29-34`). Accepté mais à documenter.
- `scripts/gen-sample-music.sh:5` code en dur `/home/z/my-project/music`.
- L'identité des titres est le chemin relatif (`ids.ts:30-32`) : renommer des
  fichiers réinitialise leur historique utilisateur. Un repli de fusion sur
  (albumhash, titre, artiste) éviterait l'essentiel des dégâts, en complément de
  la soupape 3.2.
- La pochette de dossier est relue et hachée pour chaque titre du dossier
  (`metadata.ts:94-96`) — mémoïser par dossier et par scan.

---

## 6. Client web (PWA)

### 6.1 P2 — Les flèches haut/bas ne font plus défiler les listes
`src/app/page.tsx:591-598`. Le gestionnaire global appelle `preventDefault()`
pour régler le volume, sans portée : le défilement clavier de toutes les vues est
bloqué. Corrigé : volume uniquement quand un contrôle de transport a le focus, sinon
le navigateur défile normalement.

### 6.2 P2 — L'export M3U embarque le jeton d'authentification
`src/lib/auralis/playlistIO.ts:40-46` via `api.streamUrl` et `api.url`
(`api.ts:36-42`) : le `.m3u8` censé « jouer ailleurs » contient le jeton porteur
de longue durée. Corrigé : `api.streamUrlShared` construit l'URL sans jeton (et l'import tolère
désormais un BOM UTF-8).

### 6.3 P2 — Deux fonds d'écran du lecteur contournent `api.assetUrl`
`src/components/auralis/FullscreenPlayer.tsx:254` et
`mobile/MobileDock.tsx:83` utilisent `currentTrack.image` brut : cassés en
déploiement à base distante (chemin relatif / 401) et ils téléchargent la
pochette pleine résolution au lieu d'une variante `?w=`. Corrigé : les deux fonds passent par `api.assetUrl` (vignettes 640/256).

### 6.4 P2 — L'anglais est à moitié fictif
L'app affiche un sélecteur FR/EN, mais toute une série d'écrans code le français
en dur hors `messages.ts` : la navigation de bureau entière
(`Sidebar.tsx:32-144`), le panneau de lecture à droite (`NowPlayingPanel.tsx`),
la file (`QueueList.tsx`), les paroles (`LyricsView.tsx`), la connexion
(`AuthGate.tsx`), l'aide clavier, la palette de commandes, `StickyViewHeader`,
`SelectionBar`, « Titres likés » (`HomeView.tsx:155`), les libellés de trajets
(`MoodMixes.tsx:15-18`, les clés `trajectory.*` n'existent même pas dans le
catalogue), `uiSlice.ts:228` (seul toast codé en dur des tranches). Migrer vers
les clés existantes ; la plomberie `useT`/`translate` est déjà en place partout.

### 6.5 P2 — `usePullToRefresh` réinstalle quatre écouteurs par image pendant le geste
`src/lib/auralis/usePullToRefresh.ts:120`. `pull` est dans les dépendances de
l'effet et change à chaque mouvement de doigt : quinze à vingt
désabonnements/réabonnements par geste. Corrigé : état en refs, écouteurs posés une seule fois, et plus de repli sur
`document.body` (échec franc si le conteneur ne résout pas).

### 6.6 P2 — Le shell hors-ligne est figé à l'installation
`public/sw.js:62-75`. Les navigations sont network-first mais le HTML récupéré
n'est jamais `cache.put` ; le seul document en cache est celui de
l'installation, qui référence des chunks hachés d'une époque révolue. Corrigé : les deux.

### 6.7 P2 — Égaliseur + ReplayGain peuvent clipper
`src/lib/auralis/audioGraph.ts:109` accepte un gain jusqu'à 8 (+18 dB), les six
biquads montent à +12 dB, et rien ne limite la somme : un preset de basses sur un
titre peu normalisé clippe en dur au DAC. Corrigé : gain plafonné à +6 dB dans `setGraphGain` (atténuation intacte).

### 6.8 P2 — La sélection par appui long est quasi impossible au doigt
`TrackRow.tsx:118` annule la minuterie de 450 ms au moindre `pointermove` ; un
doigt posé micro-bouge toujours. Corrigé : rayon de 10 px, plus gestion de `pointercancel`.

### 6.9 P3 — Divers
- `<html lang="fr">` codé en dur au premier rendu (`layout.tsx:79`) — lu par les
  lecteurs d'écran avant hydratation.
- `maximumScale: 1, userScalable: false` interdit le zoom (`layout.tsx:61-62`,
  WCAG 1.4.4) ; Android honore, iOS ignore.
- Pas de `pointercancel` sur le scrubber plein écran ni sur les gestes de
  balayage (`FullscreenPlayer.tsx:643-657`, `:122-189`) : palm rejeté ou appel
  entrant, l'état de scrub reste collé. Le bureau le fait déjà
  (`PlayerBar.tsx:341`).
- `share.ts:29-33` annonce la copie réussie même sans presse-papiers
  (`await undefined`).
- `restoreLastSession` sort sans `setHydrated(true)` si la bibliothèque est
  vide (`playbackSlice.ts:369`) : une piste supprimée peut ressusciter en session
  indéfiniment.
- Les lignes de paroles sont cliquables mais pas atteignables au clavier
  (`LyricsView.tsx:234-255`).
- Échappement ferme le menu contextuel *et* referme le lecteur plein écran
  (`ContextMenu.tsx:82-84` et `page.tsx:623-625`) — le visualiseur règle déjà ce
  conflit correctement, s'en inspirer.
- `--brass` est utilisé partout pour les sur-titres mais n'est défini nulle part
  (`DetailView.tsx:147` et une douzaine d'emplacements) : la couleur accent
  prévue ne rend jamais.
- Classes Tailwind inexistantes (`text-amber`, `bg-emerald/12`, `pb-safe`,
  `backdrop-in`) : silencieusement sans effet (`DetailView.tsx:1163,1351`,
  `Toast.tsx:27`, `RadioView.tsx:45`, `CommandPalette.tsx:181`).
- « Ajouter l'album à la file » fait N écritures de store et N toasts
  (`ContextMenu.tsx:357-359`) — une action `addToQueueEndMany` en fait une.
- Un M3U avec BOM produit une entrée fantôme non appariée
  (`playlistIO.ts`, découpage sans retirer `\uFEFF`).
- `Virtualized.tsx:150-168` recrée un ResizeObserver par frame de défilement
  rapide (à chaque recyclage de la ligne 0).
- Sync multi-appareils : les scrobbles optimistes faits pendant le GET de
  `hydrateFromServer` sont écrasés sans greffe (`playbackSlice.ts:344`,
  `playCounts: s.playCounts`) alors que favoris et dislikes sont greffés
  correctement ; les onglets sans `navigator.locks` deviennent tous leaders
  (`sync.ts:98-118`).
- `usePullToRefresh.ts:108-109` retombe sur `document.body` si le sélecteur ne
  résout pas : échouer au lieu de lier n'importe où.
- `PlaylistDetail` utilise `trackhash` comme clé de liste : doublons possibles
  si une playlist distante en contient (`DetailView.tsx:624` — `QueueList.tsx:57`
  fait déjà hash+index).
- `alignLyrics` interroge pendant 12 minutes sans tenir compte de la
  visibilité (`playbackSlice.ts:480-507`).
- Le garde de frappe de `page.tsx:557` oublie `SELECT` : Espace sur une liste
  déroulante déclenche lecture/pause.

### 6.10 P4 — Détails
Révocation d'URL de blob trop rapide pour Firefox (`playlistIO.ts`) ;
`weekKey()` ignore les semaines ISO (`DailyMixes.tsx:13-18`) ; l'indicateur
« en lecture » d'un album s'affiche aussi en pause (`Cards.tsx:28`) ; CSS mort
`.scrubber:focus { outline: none }` (`globals.css:653`) et `--font-geist-mono`
indéfinie ; le paramètre `?view=` des raccourcis n'est pas retiré après
navigation ; pour les clients à jeton, `api.url` ajoute le token en requête même
pour les appels qui portent déjà l'en-tête Bearer (`api.ts:41`).

---

## 7. Android natif

### 7.1 P2 — Le service média exporté accepte n'importe quel contrôleur
`AndroidManifest.xml:53-61` (`exported="true"`, requis pour Android Auto) et
`PlaybackService.kt:102-162` : `MediaSession.Callback.onConnect` n'est pas
surchargé, donc toute application installée peut lier un MediaBrowser et
parcourir favoris et historique complet, ou piloter la lecture. Filtrer les
appelants dans `onConnect` (paquet propre, paquets Auto/Assistant, SystemUI) et
rejeter le reste.

### 7.2 P2 — Scrobbles, minuterie de sommeil et sauvegarde de session meurent avec le ViewModel
`AppViewModel.kt:495-516,737-764,1068-1071`. Quand l'utilisateur balaye l'app
en gardant la lecture au casque ou sur Auto, `onCleared` annule le ticker de
scrobble, la persistance de session et la minuterie : toute l'écoute en arrière-
plan n'est jamais comptée, et la position sauvegardée devient fausse. C'est le
scénario d'usage principal d'un lecteur mobile. Déplacer la comptabilité dans
`PlaybackService` (qui possède déjà le lecteur et une coroutine scope).

### 7.3 P2 — Le jeton de session part dans l'URL du flux SSE de synchronisation
`sync/SyncManager.kt:224-227` construit `?...&token=$token`, contredisant la
posture documentée du reste du client (en-tête Authorization pour les flux, pour
ne rien laisser dans les journaux du serveur ou du proxy). Corrigé : en-tête `Authorization`, le serveur l'acceptait déjà.

### 7.4 P2 — Base serveur forcée en http par défaut
`net/AuralisApi.kt:234-239` préfixe `http://` à toute adresse sans schéma, et le
manifeste autorise le cleartext global. Taper `musique.exemple.com` depuis un
réseau hostile envoie identifiant et mot de passe en clair. Corrigé : heuristique — IP, `localhost` et `.local` restent en `http://`, tout
autre hôte sans schéma passe en `https://`.

### 7.5 P2 — Préférences de lecture persistées depuis un instantané périmé
`AppViewModel.kt:353-361,690-695`. `prefs.setPlayback(shuffle = player.snapshot.value.shuffle)`
lit l'état du contrôleur avant que l'IPC n'ait fait le tour : la valeur
persistée peut être l'ancienne, et la session restaurée rejoue l'ancien état.
Corrigé pour shuffle/repeat (valeur calculée localement puis posée) ;
l'écriture du volume est en plus débouncée (600 ms).

### 7.6 P2 — Tempête de recompositions sur l'état de position
`Shell.kt:124-125` collecte la position (nouvelle valeur quatre fois par
seconde) au niveau de la coquille entière, et le volume passe par `UiState` à
chaque cran du curseur : sur une bibliothèque de dix mille titres, chaque
geste de volume invalide tout l'état monolithique. Collecter la position dans le
seul lecteur, sortir le volume de `UiState`, scinder l'état volumineux.

### 7.7 P3 — Divers
- Pas de `setWakeMode(C.WAKE_MODE_NETWORK)` sur ExoPlayer
  (`PlaybackService.kt:57-68`) : streaming qui cale écran éteint sur certains
  Wi-Fi agressifs.
- Le catalogue Android Auto est lu sans synchronisation entre threads
  (`PlaybackService.kt:200-238`) : publier un seul objet immuable `@Volatile`.
- Le future de navigation Auto peut ne jamais se compléter si le scope meurt
  en cours de chargement (`PlaybackService.kt:119-133`) — `try/finally`.
- Les réglages affichent « 2.0 (Kotlin) » en dur au lieu de
  `BuildConfig.VERSION_NAME` (`SettingsScreen.kt:176-177`).
- Retour prédictif non adopté (`MainActivity.kt:39-48`) : dès que la plateforme
  activera le drapeau, le bouton retour quittera l'app depuis un écran de
  détail.
- Les échecs d'opérations admin (rescan, création de playlist) sont avalés et
  annoncés en succès (`AppViewModel.kt:957-963`, `AuralisApi.kt:185-204`).
- La pochette de playlist part en base64 jusqu'à ~11 Mo de JSON, sans
  redimensionnement (`DetailScreens.kt:180-192`).
- « Réinitialiser le mot de passe » pose `changeme123` en un tap, sans
  confirmation ni affichage (`SettingsScreen.kt:275-277`).
- L'export de données passe par `EXTRA_TEXT` : `TransactionTooLargeException`
  au-delà d'un mégaoctet, et partage implicite vers l'app choisie
  (`SettingsScreen.kt:158-167`). Passer par FileProvider.
- Écritures DataStore au rythme du curseur de volume et toutes les 5 s en
  lecture (`AppViewModel.kt:690-695,737-764`) : débouncer.
- Toute l'interface est en français codé en dur ; `strings.xml` ne contient que
  le nom de l'app (`res/values/strings.xml`).
- Release sans R8 avec `material-icons-extended` complet et lint désactivé
  (`build.gradle.kts:83-108`) : APK plusieurs fois trop gros.
- Un checkout frais ne compile pas sans le keystore secret, sans message utile
  (`build.gradle.kts:69-87`) — prévoir un repli sur le keystore de debug.
- Les tests Android ne tournent dans aucun workflow ; `compareVersions`, qui
  décide de chaque proposition de mise à jour, n'a aucun test
  (`.github/workflows/ci.yml`).
- Les transformations de bibliothèque lourdes tournent sur le thread UI à la
  composition (`Screens.kt:100-121,330-349` etc.) : dériver dans le ViewModel.

### 7.8 P4 — Détails
Tap sur tuile récente joue au lieu de naviguer (`Screens.kt:132-140`) ;
`playUnheardMix`/`playShuffled` laissent l'aléatoire activé pour la session
suivante (`AppViewModel.kt:336-338`) ; le visualiseur est un sin() déguisé en
réactif audio (`Overlays.kt:108-133`) ; carte « Apparence » inerte et
`Prefs.themeFlow` mort ; paroles demandées deux fois par changement de piste
(`AppViewModel.kt:479` et `Player.kt:475`) ; scrubber sur la durée des tags au
lieu de celle du lecteur (`Player.kt:293-303`) ; minuterie de sommeil sur
l'horloge murale au lieu de `elapsedRealtime` ; NetworkImage sans annulation des
requêtes au défilement rapide ; `onGetItem` du service sans `ensureLoaded` ;
file d'attente copiée en O(n) à chaque événement lecteur et croissante sans
borne en écoute infinie ; déconnexion SSE qui attend le heartbeat (25 s) ;
collision du scheme de versionCode quand minor ≥ 100 ; exclusion de
`*.kotlin_module` du packaging ; tuiles de playlists sans pochettes
personnalisées (`Cards.kt:113`) ; lacunes TalkBack (réordonnancement de playlist
impossible, pictogrammes non libellés) ; jeton dans DataStore en clair
(Keychain côté iOS, voir 8) ; libellé « Mix IA » qui laisse fuir le nom interne
(`TrackMenu.kt:95`).

---

## 8. iOS natif

Le client iOS est fonctionnel et soigné sur les fondamentaux (jeton dans le
Keychain, jamais dans les URL de flux, commandes distantes sérialisées sur le
MainActor, artwork 512 px pour les autoradios). Il lui manque en revanche une
vraie machine à états de lecture.

### 8.1 P2 — Aucune gestion des interruptions et changements de route audio
`Auralis/Playback/AudioPlayer.swift:43-47`. Un appel ou Siri met la lecture en
pause sans jamais la reprendre, et le débranchement du casque laisse `isPlaying`
à vrai avec l'écran de verrouillage mensonger. Observer
`interruptionNotification` et `routeChangeNotification`, resynchroniser
`isPlaying` sur `timeControlStatus`.

### 8.2 P2 — `load()` déclare la lecture sans observer le statut de l'item
`AudioPlayer.swift:49-68`. Un flux 401/404 laisse la file bloquée, l'UI en
« lecture », sans erreur. Observer `AVPlayerItem.status`, basculer en erreur et
passer au titre suivant.

### 8.3 P2 — Aucun traitement du 401
`AppState.swift:60-129`. Tout appel est avalé par `try?` en `.empty` : un jeton
expiré donne une application « prête » et vide, indistinguable d'une perte de
données. Router vers l'écran de connexion sur 401.

### 8.4 P3 — Divers
- Courses de chargement : deux taps rapides peuvent charger l'ancien titre
  (`AppState.swift:206-211`) ; l'artwork d'un ancien titre peut habiller le
  nouveau sur l'écran de verrouillage (`AudioPlayer.swift:114-122`). Compteur de
  génération.
- Fin de file sans répétition : `isPlaying` reste vrai, deux taps pour reprendre
  (`AppState.swift:229-244`).
- Le bloc `info:` (background audio, ATS, orientations) est déclaré sous la
  cible de tests dans `project.yml:29-59` : ça fonctionne par effet de bord de
  XcodeGen, un refactor le casse. Le déplacer sur la cible app.
- ATS global ouvert plus base http forcée (`project.yml:52-53`,
  `AuralisAPI.swift:188-194`) : mêmes remarques que pour Android (7.4).
- Thème mort : `setTheme`, `theme.accent` constant, version « v1.0.0 » codée en
  dur (`AppState.swift:267-271`, `Theme.swift:10`, `SettingsView.swift:60`).
- Parité : pas de découverte/radios/minuterie/égaliseur côté iOS alors que le
  serveur les expose ; les gestionnaires de commandes distantes répondent
  `.success` même sans lecteur (`AudioPlayer.swift:93-102`) ; pas d'icône
  d'application.

---

## 9. Desktop (Electron)

La base est saine : rendu isolé et bac à sable, verrou d'origine couvrant
navigation et redirections, popups refusées, permissions niées, pont IPC minimal
et `setup:submit` correctement gardé par l'identité de l'émetteur.

### 9.1 P3 — `desktop:reconfigure` est appelable par n'importe quelle page chargée
`desktop/main.js:153-163` et `desktop/preload.js:18`. Contrairement aux autres
canaux, pas de garde d'émetteur, et en mode distant la fenêtre EST la page
distante : un contenu MITM peut effacer la configuration locale et relancer
l'assistant. Corrigé : boîte de dialogue native de confirmation.

### 9.2 P3 — Le mode distant force http et expose le pont à un contenu MITM
`desktop/main.js:66-72`. Le verrou d'origine ne protège pas contre l'attaquant
qui EST l'origine. Avertir sur les bases http non privées, et réduire le pont
(windows, media keys) aux seules origines locales.

### 9.3 P4 — Détails
`dialog:pickFolder` sans garde d'émetteur ; la course port/health accepte
n'importe quel répondeur < 500 sur le port choisi (`main.js:165-198`) ; le
serveur local embarqué n'a aucun jeton, donc tout processus local peut tout
faire (`main.js:207-226`) ; commentaire trompeur sur `allowDowngrade` dans
`updater.js` ; `prepare-desktop.mjs` embarque `android-native/`, `ios-native/`,
la documentation et les scripts d'œuf dans le paquet desktop (le`extraResources`
prend le standalone tel quel) ; les media keys n'informent pas de leur échec
d'enregistrement.

---

## 10. Déploiement

### 10.1 P2 — L'image de deploy installe avec `npm install` sans lockfile, sur un commentaire faux
`deploy/Dockerfile:26-31` affirme que `package-lock.json` n'est pas dans le
dépôt — il l'est (370 Ko) et le Dockerfile racine, lui, utilise `npm ci`. Un
build non reproduit et non verrouillé qui tire les dépendances à chaque
`./update.sh` sur un serveur qui a accès au disque musique. Corrigé : `npm ci` avec `package-lock.json` copié.

### 10.2 P3 — L'image documentée n'a pas ffmpeg
`deploy/Dockerfile:48-57` n'installe que `dumb-init` : qui suit DEPLOY.md obtient
un serveur où BPM, énergie, timbre et karaoké aligné ne fonctionnent jamais,
avec une ligne de log pour seule explication. Corrigé.

### 10.3 P3 — Mot de passe admin connu sur le chemin manuel
`deploy/.env.example:16` livré décommenté ; `update.sh` protège le chemin
automatique mais le `cp .env.example .env` suivi de `docker compose up -d`
documenté dans le compose passe avec le mot de passe du dictionnaire.
Corrigé : variable commentée avec la marche à suivre (mot de passe généré
dans `data/INITIAL_ADMIN_PASSWORD.txt`).

### 10.4 P3 — Deux Dockerfiles divergents dont un orphelin
Le Dockerfile racine (port 4237, ffmpeg, sans HEALTHCHECK) n'est référencé par
aucun workflow ni script, et le compose/health de `update.sh` supposent l'image
de deploy. Corrigé : le Dockerfile racine, référencé nulle part, est supprimé.

### 10.5 P3 — L'œuf Pterodactyl peut installer avec un Node différent du runtime
`pterodactyl-egg.json:27` épinglé à node:20 alors que l'opérateur peut choisir un
yolk Node 22 : ABI de better-sqlite3 incompatible, crash au premier accès base,
sans compilateur dans le yolk. Corrigé : le script de démarrage teste le chargement de better-sqlite3 et le
reconstruit pour le runtime en cas de décalage d'ABI.

### 10.6 P4 — Détails
Aucune sauvegarde de base avant `docker compose up -d` dans `update.sh` (les
migrations ne reviennent pas en arrière) ; `docker image prune -f` sans filtre
nettoie tout l'hôte ; les trois modèles d'environnement divergent
(`AURALIS_TRUST_PROXY` absent de deploy/.env.example alors que le déploiement
inverse-proxy recommandé en a besoin, `AURALIS_EMBEDDINGS` absent des deux) ;
les copies de sûreté de restauration (`*.avant-restauration-*`) ne sont jamais
purgées ; compose sans bornes de journaux ni `container_name` supprimable ;
`AURALIS_ALLOW_MASS_PRUNE` à documenter dans les deux exemples (nouvelle
variable, voir 3.2).

---

## 11. Ce qui tient bien

Vérifié dans le code, pas de la complaisance :

- Le streaming audio est défendu en profondeur : confinement lexical puis
  realpath contre la traversée de chemin, liste blanche d'extensions, Range
  correct avec 416 et `Content-Range`, contre-pression réelle et descripteur
  détruit à l'annulation (`src/app/api/stream/[...path]/route.ts`).
- Le modèle CSRF est cohérent et appliqué partout, l'exemption bearer exige un
  jeton qui authentifie réellement, et la limite de force brute résiste à la
  falsification d'en-têtes (`AURALIS_TRUST_PROXY`).
- Aucune injection SQL relevée : tout est en statements préparés, y compris les
  listes IN dynamiques et le FTS5 échappé jeton par jeton.
- La discipline « pas de secrets dans les journaux » est réelle : mot de passe
  admin initial écrit dans un fichier 0600, jeton jamais journalisé, IPs
  dérivées de X-Forwarded-For traitées comme non fiables.
- Le Web Audio, le playhead isolé (4 Hz sans re-rendu des listes), la garde de
  scrobble sensible aux seek, le disjoncteur d'erreurs média et la reprise MIUI
  au retour de premier plan sont corrects et bien raisonnés.
- La fusion multi-appareils de `hydrateFromServer` (greffe des favoris faits
  pendant le GET, refus de ressusciter un réglage local plus récent) est le
  genre de détail que la plupart des projets ratent.
- La virtualisation gère explicitement les cas dégénérés et est testée ; le
  karaoke (fenêtre partagée rAF/CSS via `@property`) est précis.
- Côté Android : discipline de thread autour de MediaController, rejeu des
  préférences au liage du contrôleur, comptabilité de skip réfléchie, cache
  média avec clés sans jeton, et un auto-updater qui vérifie le certificat de
  signature de l'APK avant d'installer — le genre de soin qu'on voit rarement.
- `backup.sh` utilise l'API de sauvegarde en ligne de SQLite dans le conteneur
  (sauvegardes à chaud cohérentes), la restauration stoppe le service et purge
  WAL/SHM ; les deux images Docker tournent en non-root avec init.

---

## 12. Plan d'action suggéré

État après les deux passes de corrections de cette session. Reste à faire, dans
l'ordre de rapport effort/bénéfice :

1. Fait. Verrouillage du changement de mot de passe (3.1), soupape de purge
   (3.2), .gitignore du keystore (3.3), expiration des sessions (4.2), validation
   de la connexion (4.1), révocation complète au logout (4.5), limite des GET de
   paroles (4.7), P4 serveur faciles (4.8 sauf token haché/multi-range/pwned),
   chien de garde du parseur (5.2), migration 011 (5.1), flèches (6.1), M3U
   (6.2), pochettes distantes (6.3), pull-to-refresh (6.5), shell hors-ligne
   (6.6), headroom audio (6.7), appui long (6.8), BOM M3U (6.9), jeton hors de
   l'URL SSE (7.3), https par défaut (7.4), persistance des valeurs voulues
   (7.5), reconfigure confirmé (9.1), image de deploy npm ci + ffmpeg + mot de
   passe (10.1-10.3), Dockerfile orphelin (10.4), auto-réparation ABI de l'œuf
   (10.5).
2. Android (refactor) : déplacer scrobble, minuterie de sommeil et persistance
   de session dans `PlaybackService` (7.2) — le plus gros chantier restant ;
   filtrer `onConnect` du service média (7.1) ; scinder `UiState` et sortir la
   position du niveau Shell (7.6).
3. Web : i18n réelle des surfaces codées en dur (6.4), CSP à nonce (4.6),
   authentification de `/api/art` ou URLs signées (4.3), garde SSRF par
   résolution DNS (4.4).
4. Données : index sur `trackhash` et purge par lots (5.4), fanion dirty du
   watcher (5.3), GC du cache de pochettes (5.5), sidecar plus récent que le
   cache (5.6), greffe des scrobbles pendant `hydrateFromServer` (6.9).
5. iOS : interruptions et statut de l'item (8.1, 8.2), 401 (8.3), Info.plist sur
   la bonne cible (8.4). Non compilable dans l'environnement de cet audit
   (Linux), à traiter sur macOS.
6. Recommandation : horizons UCB cohérents et coupure Markov sur les skips
   (5.11), cache profil sans BLOB (5.7), trajectoire non quadratique (5.8).
7. Le reste des P3/P4, au fil de l'eau.

Méthode employée pour cet audit : lecture intégrale des sources serveur et
clients par cinq passes indépendantes, recoupement des affirmations avec le
code, corrections vérifiées par la suite de tests (`bun run lint`, `typecheck`,
148 tests vitest, build de production, compilation et tests unitaires Android
avec JDK 21 / SDK 36).
