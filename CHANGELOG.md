# Changelog

All notable changes to Auralis are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.33.0] - 2026-11-02

Correction du bug « les titres téléchargés disparaissent après une mise à jour »
+ filet de sécurité anti-perte et bug de file d'attente du téléchargement.

### Corrigé — Serveur : téléchargements effacés à chaque mise à jour (perte de données)
Cause racine : les titres téléchargés (« Télécharger » depuis la recherche,
import de playlists) étaient écrits dans `<musicDir>/Auralis Downloads`. Sur un
serveur Docker qui ne monte que des SOUS-DOSSIERS de `/music` (ex. `/music/ssd`,
cas de notre production), ce dossier reste dans la **couche éphémère du
conteneur** : `docker rm` / toute mise à jour l'efface, puis le scan purge les
titres devenus introuvables. D'où le « je dois re-télécharger après chaque maj ».
- **`AURALIS_DOWNLOADS_DIR` accepte désormais un chemin ABSOLU** : pointez-le
  sur un dossier monté et persistant (ex. `/music/ssd/Auralis Downloads`). Un
  chemin hors de la racine musique est refusé (non indexable) avec repli.
- **Procédures mises à jour** : `deploy/PRODUCTION.local.md` (env ajoutée au
  `docker run`), `deploy/.env.example` et `DEPLOY.md` (avertissement montage).
- **Procédure de récupération** des titres déjà perdus depuis les sauvegardes
  `pre-*.db` (dans `deploy/PRODUCTION.local.md`).

### Ajouté — Restauration automatique des téléchargements perdus
Nouvelle table `downloads` (migration 014) : le manifeste des titres
téléchargés, qui survit volontairement à la purge du scan. Au démarrage, tout
titre téléchargé dont le fichier a disparu est **re-téléchargé automatiquement**
(3 tentatives max par titre, `AURALIS_DOWNLOADS_RESTORE=0` pour désactiver ;
une re-téléchargement explicite par un utilisateur réinitialise le budget).

### Corrigé — Serveur : file de téléchargement qui se bloquait toute seule
`pumpQueue` calibrait la concurrence sur la PROFONDEUR de file (en attente +
en cours) : dès 3 téléchargements mis en file d'un coup (lots d'import de
playlist, restauration), `activeCount() > MAX_ACTIVE` était vrai immédiatement
et **rien ne démarrait jamais** (« En file » éternel). Le pacing compte
désormais les seuls travaux réellement en cours.
- Durcissement connexe : un téléchargement en échec ne peut plus s'approprier le
  fichier d'un téléchargement concurrent (le filet « fichier le plus récent »
  exige désormais le marqueur `[videoId]`).

### Tests
- Nouveaux tests : résolution de `AURALIS_DOWNLOADS_DIR` (absolu/relatif/hors
  racine), manifeste + restauration après perte, abandon après épuisement du
  budget, re-téléchargement explicite, pacing de lot (5 téléchargements).
  **205 tests web verts**, typecheck et lint verts.

## [1.32.0] - 2026-11-01

Correction de trois bugs signalés après la mise à jour : titres de playlist
disparus / comptés à zéro, et silence sur certains morceaux.

### Corrigé — Android/Serveur : titres de playlist perdus (perte de données)
Le vrai bug de fond : une mise à jour « métadonnées seulement » (renommer,
épingler, changer la pochette) envoyait `trackhashes: []`. Côté serveur,
`if (input.trackhashes)` est **vrai pour un tableau vide** en JS → la playlist
était **vidée de tous ses titres** puis réinsérée… vide. C'est la cause des
« anciennes playlists où j'ai perdu mes titres ».
- **Serveur** : les titres ne sont réécrits que si une liste **non vide** est
  fournie ; une liste vide/absente les laisse intacts.

### Corrigé — Android : « 0 titre » mais 30 au clic
Les playlists **intelligentes** affichaient `trackhashes.size` (= 0, car leurs
titres sont calculés par règles) dans la liste, alors que le détail évalue les
règles (30 titres). Le compte reflète désormais la **vraie liste évaluée**.

### Corrigé — Android : silence sur certains morceaux (ex. Kanye West)
Deux causes, deux garde-fous :
- **Gain de normalisation sauvage** : un `gain` corrompu/ancien (non borné)
  poussait le volume du lecteur vers 0 → le morceau tournait **sans son**. La
  normalisation est désormais **planchée** (−12 dB max d'attenuation) et
  immunisée contre NaN/∞ → un mauvais gain peut baisser le son, jamais le
  couper. Aussi : un membre non fini ne peut plus empoisonner la moyenne d'album.
- **Fondu bloqué à zéro** : l'enveloppe de fondu (crossfade) pouvait rester à 0
  après une transition interrompue → **plus de son jusqu'au redémarrage de
  l'app**. Le fondu atterrit toujours à 1 (garanti `try/finally`) et le fondu
  désactivé passe directement à pleine puissance.

### Tests
- Nouveaux tests JVM : plancher de normalisation (jamais de silence), garde
  NaN/∞, moyenne d'album protégée, sortie audible au pire cas. **197 tests web
  verts** ; build + tests Android verts.

## [1.31.0] - 2026-11-01

Grande passe « qualité perçue » sur Android : paroles façon Liner, pochettes de
playlist réelles, home nettoyée, et un audit de performance complet pour enfin
une app fluide.

### Changé — Android : paroles façon Liner
- **Îlot verre** : une barre dépolie unique en bas du voile de paroles — la
  source qui les a servies (« Musixmatch », « NetEase », « LRCLIB »…) à gauche,
  le bouton Karaoké et le pas-à-pas de décalage (− / +0.1s / +) à droite. Fini
  la rangée de puces brutes en haut.
- **Rendu karaoke** : ligne active plus grande et centrée, révélation mot à mot
  plus lisible, voisines atténuées et adoucies.

### Changé — Android : pochettes de playlist réelles (comme Spotify)
- Fini le dégradé généré par hash (« trop IA ») : sans pochette custom, une
  playlist affiche une **mosaïque 2×2 des pochettes d'albums de ses titres**
  (1 titre → sa pochette, 2/3 → réparti). Le dégradé n'apparaît que pour une
  playlist vraiment vide. Partout : liste + écran de détail.

### Changé — Android : home nettoyée et remontée
- **« Blend du foyer » supprimé** de la home (et son chargement réseau).
- **« Pour votre humeur »** : la petite icône carrée disparaît.
- Le hero (« Bonsoir / ACCUEIL ») et tout le contenu sont **remontés** — l'espace
  vide en haut est comblé (retraits haut réduits).

### Changé — Android : transitions plus fluides
- Le changement d'onglet (Accueil ↔ Nouveau…) est un **fondu rapide + micro
  échelle** — plus de glissement latéral qui sautillait ; le push d'écran garde
  son glissement doux.

### Corrigé — paroles introuvables (ex. « South Park — Kyle's mom »)
- **Variantes de recherche** : chaque provider essaie titre+artiste → nettoyé
  (apostrophes, parenthèses, « feat. » retirés) → titre seul. Les titres
  décorés résolvent enfin.
- **Cache négatif** : « introuvable » est retenté au bout d'**1 jour** au lieu
  d'une semaine (un titre cherché avant NetEase/QQ restait bloqué des jours).

### Performance — audit complet (fluidité)
- **Position de lecture** : plus collectée à la racine Shell (elle tiquait
  4×/sec et recomposait toute l'app + le lecteur entier) → collectée dans les
  feuilles concernées (mini-player, scrubber, paroles).
- **Glissement de fermeture** du lecteur : le calcul d'échelle passe en phase de
  dessin (plus de recomposition à chaque frame du doigt).
- **Sélecteur de sélection / toggle de lecture** : mémoïsés et arrêtent de
  capturer tout l'état (plus de recomposition de chaque ligne à chaque changement).
- **Home** : scans mémoïsés (tuiles rapides, « jamais écoutés »).
- **Visualiseur** : amplitudes collectées dans l'overlay (plus de 20 Hz sur toute
  l'app).
- **Clés de liste** sûres sur recherche/historique (crash « Key was already used »).

### Tests
- Suite web : **197 tests verts** ; build + tests Android verts.

## [1.30.0] - 2026-11-01

Suite de la refonte « vibe Liner » : finition de l'expérience de chargement et
de la barre de navigation, deux points qui juraient à l'ouverture de l'app.

### Changé — Android : chargement en skeleton (fini le spinner)
- Le lancement affiche désormais un **skeleton complet qui mime la home à
  venir** — barre de nav, hero, étagère de cartes, tuiles rapides, lignes — le
  tout en shimmer. Le contenu « se matérialise » au lieu d'un spinner sur fond
  vide, puis d'un saut brutal (le rythme de chargement calme de Liner).

### Changé — Android : barre de nav & titres refaits
- **Profil** : l'avatar est une vraie puce de profil — cercle avec **anneau
  dégradé accent** — plus un simple rond gris flottant dans la barre.
- **Barre de nav** : alignement et espacement retravaillés (le titre ne se
  battait plus avec le contenu), chevron de retour plus fin, ellipsis propre
  sur les longs titres.
- **Titres des onglets** : un vrai hero façon Liner — petit kicker muet au-dessus
  du grand titre (« Bonjour / Bonsoir… » sur la home, « Fraîchement ajouté »,
  « Trouve tout, tout de suite », « Ta musique, ton espace »), avec sous-titre
  optionnel. Fini le mot en gras isolé coincé dans le coin.

### Ajouté
- Salutations contextuelles selon l'heure (Bonjour / Bon après-midi / Bonsoir /
  Bonne nuit) sur la home.
- Composants réutilisés : `PageHero`, `SkeletonScreen`, `greetingKeyFor`.

### Tests
- Suite web : **193 tests verts** ; build + tests Android verts.

Deux chantiers : une refonte visuelle complète de l'app Android (« je rouvre
Auralis, on dirait une toute nouvelle app ») et un moteur de paroles élargi
(« il y a plein de morceaux où ça ne met aucune parole »).

### Changé — Android : refonte « vibe Liner » (nouvelle identité)
- **Palette profonde** : stage `#000000`, surfaces quasi-noires (`#0A0A0A` →
  `#1A1A1A`), un seul accent rouge `#FF4D4D`, texte blanc/70 %/45 %. Fini les
  gris iOS translucides — l'interface est sombre, nette, moderne.
- **Dark par défaut** : l'app démarre en dark (le mode clair reste dispo dans
  les réglages).
- **« La couleur vient du contenu »** : un **fond ambiant piloté par la
  pochette** — deux teintes dominantes extraites de l'artwork lavent le fond
  noir d'un halo doux, et glissent d'un titre à l'autre au lieu de claquer.
  L'ambiance suit ce qui joue (comme Liner).
- **Verre, pas de boîtes** : le chrome flottant (mini-player, barre d'onglets)
  est un verre dépoli translucide qui floute le contenu en dessous — plus de
  panneaux gris opaques.
- **Lecteur plein écran** : voile flouté de la pochette plus profond + lueur
  chaude en haut (la couleur de la pochette déborde du bord).
- Bouton lecture en cercle rouge plein, vignettes « en cours » animées.

### Ajouté — Moteur de paroles multi-providers (NetEase + QQ Music)
La chaîne de repli s'élargit pour couvrir les « paroles introuvables » — en
particulier titres CN/JP/KR et internationaux absents de LRCLIB :
- **NetEase Cloud Music** (music.163.com) : sert le format **`yrc` mot à mot**
  (vrai karaoke par mot) quand il existe, sinon le `lrc` ligne à ligne +
  traduction. Converti en LRC amélioré pour le karaoke.
- **QQ Music** (y.qq.com) : second grand réservoir de paroles manquantes,
  format `lrc`.
- Nouvel ordre : **Musixmatch (richsync) → NetEase (yrc) → LRCLIB → QQ Music →
  lyrics.ovh**. Les deux nouvelles sources comblent les trous que LRCLIB laisse ;
  le tout reste auto-hébergé (écrit dans le cache + sidecar `.lrc`).
- Sélection de candidat protégée (titre/artiste/durée) : jamais les paroles de
  la mauvaise chanson.
- Config : `AURALIS_LYRICS_NETEASE` / `AURALIS_LYRICS_QQ` (on par défaut).

### Tests
- Suite web : **193 tests verts** ; build + tests Android verts.

## [1.29.0] - 2026-11-01

Deux chantiers : une refonte visuelle complète de l'app Android (« je rouvre
Auralis, on dirait une toute nouvelle app ») et un moteur de paroles élargi
(« il y a plein de morceaux où ça ne met aucune parole »).

### Changé — Android : refonte « vibe Liner » (nouvelle identité)
- **Palette profonde** : stage `#000000`, surfaces quasi-noires (`#0A0A0A` →
  `#1A1A1A`), un seul accent rouge `#FF4D4D`, texte blanc/70 %/45 %. Fini les
  gris iOS translucides — l'interface est sombre, nette, moderne.
- **Dark par défaut** : l'app démarre en dark (le mode clair reste dispo dans
  les réglages).
- **« La couleur vient du contenu »** : un **fond ambiant piloté par la
  pochette** — deux teintes dominantes extraites de l'artwork lavent le fond
  noir d'un halo doux, et glissent d'un titre à l'autre au lieu de claquer.
  L'ambiance suit ce qui joue (comme Liner).
- **Verre, pas de boîtes** : le chrome flottant (mini-player, barre d'onglets)
  est un verre dépoli translucide qui floute le contenu en dessous — plus de
  panneaux gris opaques.
- **Lecteur plein écran** : voile flouté de la pochette plus profond + lueur
  chaude en haut (la couleur de la pochette déborde du bord).
- Bouton lecture en cercle rouge plein, vignettes « en cours » animées.

### Ajouté — Moteur de paroles multi-providers (NetEase + QQ Music)
La chaîne de repli s'élargit pour couvrir les « paroles introuvables » — en
particulier titres CN/JP/KR et internationaux absents de LRCLIB :
- **NetEase Cloud Music** (music.163.com) : sert le format **`yrc` mot à mot**
  (vrai karaoke par mot) quand il existe, sinon le `lrc` ligne à ligne +
  traduction. Converti en LRC amélioré pour le karaoke.
- **QQ Music** (y.qq.com) : second grand réservoir de paroles manquantes,
  format `lrc`.
- Nouvel ordre : **Musixmatch (richsync) → NetEase (yrc) → LRCLIB → QQ Music →
  lyrics.ovh**. Les deux nouvelles sources comblent les trous que LRCLIB laisse ;
  le tout reste auto-hébergé (écrit dans le cache + sidecar `.lrc`).
- Sélection de candidat protégée (titre/artiste/durée) : jamais les paroles de
  la mauvaise chanson.
- Config : `AURALIS_LYRICS_NETEASE` / `AURALIS_LYRICS_QQ` (on par défaut).

### Tests
- Nouveaux tests JVM : parseur `yrc` NetEase (timing par mot), gardes QQ
  (décodage base64, rejet des réponses sans timestamp). Suite web : **193 tests
  verts** ; build + tests Android verts.

## [1.28.0] - 2026-11-01

Grosse passe de correction et de finition sur l'app Android. Deux retours
utilisateurs centraux : « je lance une musique dans une playlist, je vois le

### Corrigé — Android : bouton Lecture/Pause par playlist (le bug principal)
- **Une seule source active** : l'app trace désormais ce qui a engendré la file
  (`playlist:<id>`, `favoris`, `album:<hash>`, `artiste:<hash>`). Le bouton
  hero Pause/Reprendre ne s'allume que sur la liste qu'on écoute réellement —
  plus jamais sur toutes les playlists qui contiennent le titre en cours.
- **Reprise en place** : sur la liste active, le bouton met en pause / reprend
  **à la position actuelle** ; il ne reconstruit plus la file depuis le titre 0.
  Sur une autre liste, il démarre cette liste depuis le début (comportement
  attendu).
- Même logique appliquée aux écrans Album, Artiste et Favoris.

### Corrigé — Android : barre de progression du lecteur plein écran
- La barre restait figée à `0:00` pendant tout le morceau : le calcul était une
  **division entière** (`positionMs / durMs` sur deux `Long`) qui valait 0 tant
  qu'on n'avait pas atteint la fin. Corrigé en division flottante, extraite dans
  `PlaybackProgress` (testé) — la barre et les compteurs `m:ss` suivent
  maintenant la lecture en temps réel.
- Après un *seek*, la barre revient à la bonne position immédiatement (elle
  clignotait en arrière avant que le ticker ne rattrape).

### Corrigé — Android : autres bugs et illogismes
- **Tap sur la piste en cours** : met en pause / reprend au lieu de relancer le
  morceau depuis 0 (partout dans les listes).
- **Égaliseur « en cours »** : correctement atténué quand la lecture est en
  pause (il restait toujours « actif »).
- **Crash silencieux** : une playlist contenant deux fois le même titre faisait
  planter la liste (« Key was already used ») — clés de liste uniques.
- **Play/Pause du lecteur** : ne se désynchronise plus du vrai état pendant une
  mise en mémoire tampon ; l'état « fin de file » n'affiche plus Pause à tort.
- **Titre de la barre de navigation** : l'animation de repli (grand titre →
  titre compact) était inversée — elle s'affichait en remontant et disparaissait
  en descendant. Comportement iOS classique restauré.
- **Playlists intelligentes** : le flash « playlist vide » pendant l'évaluation
  des règles est remplacé par des squelettes de chargement.
- **Libellés d'accessibilité** : le bouton Lecture/Pause annonçait toujours
  « Lecture » ; « ▶ Enregistrer » (renommer) n'a plus son faux triangle de
  lecture ; les doublons d'annonce « Lire » sur les cartes sont supprimés.
- **Cibles tactiles** : les boutons favori / ⋯ des lignes de titre passent de
  20dp à 40dp (sous le minimum mobile jusqu'ici).

### Changé — Android : finition visuelle
- **Profondeur** : ombres portées sur les pochettes des écrans de détail
  (album, playlist, artiste) et des cartes (albums, artistes) — le rendu à plat
  faisait « bon marché » à côté du web.
- **Bouton lecture du lecteur plein écran** : cercle plein rouge signature
  (comme le web) au lieu d'un glyphe nu.
- **Cartes** : les vignettes « en cours » affichent maintenant Pause.
- **Espacement** : les écrans de détail reprennent le même retrait haut que les
  listes (les contenus démarraient 12dp plus haut sans raison).
- Barre de sélection multi-titre : suppression d'un double padding.

### Tests
- Nouveaux tests JVM de non-régression sur le calcul de progression
  (`PlaybackProgressTest`) — suite Android et web vertes (186 tests web).

## [1.27.0] - 2026-10-31

Deux retours utilisateurs : « j'ajoute une playlist et je ne vois rien se
télécharger — je veux voir les titres se télécharger un par un et s'ajouter à
la playlist » et « je veux pouvoir enlever la bulle Shazam en la glissant vers
le bas, comme la vraie app ».

### Changé — Android : import de playlist, téléchargement VISIBLE
- **Téléchargement automatique** : dès qu'un import (lien Spotify/Deezer/Apple
  Music/YouTube ou fichier .m3u/.json) laisse des titres manquants, le
  téléchargement démarre tout seul (plus de boîte de confirmation) avec un
  toast « Téléchargement de N titres… ».
- **Feuille live titre par titre** : chaque titre manquant affiche son statut
  en temps réel — « En attente… » → « Téléchargement… 42 % » (vraie
  progression du job) → « ✅ Ajouté à la playlist » / « ❌ Échec (raison) » /
  « Annulé ». Le titre rejoint la playlist **à l'instant** où son
  téléchargement finit — tu le vois arriver.
- **Boutons** : « Voir la playlist » (dès le premier ajout), « Fermer » (ça
  continue en arrière-plan), « Tout annuler ».
- **Bannière sur la playlist** : « N titres en cours de téléchargement… » tant
  que ça tourne (appui = rouvrir la feuille) — même si tu navigues ailleurs.
- Plus jamais de silence : un échec de démarrage affiche la raison serveur
  (ex. limite de lots) + un bouton « Réessayer ».

### Ajouté — Android : bulle Shazam à glisser pour supprimer
- **Glisse la bulle vers le bas** → une pastille rouge « Supprimer » apparaît
  en bas ; lâcher dessus = bulle retirée proprement (service arrêté, réglage
  mis à jour, toast « Bulle masquée — réactive-la dans les réglages »).
- Lâcher ailleurs = la bulle retourne au bord le plus proche ; l'appui simple
  (identifier) est inchangé.

### Tests
- 31 nouveaux tests JVM (modèle de statut des téléchargements, logique de
  glissement/suppression de la bulle) — suite Android verte.

## [1.26.0] - 2026-10-30

L'expérience Shazam complète sur Android : une bulle flottante au-dessus de
tes apps — tu regardes un TikTok, une vidéo, un jeu… tu appuies sur la bulle,
et la chanson est identifiée puis ajoutée à ta bibliothèque.

### Ajouté — Android : « Bulle Shazam »
- **Bulle flottante système** (superposition au-dessus de toutes les apps,
  déplaçable) : états animés (repos / capture avec compte à rebours /
  identification / trouvé ou non), pilotable depuis les réglages et la
  reconnaissance.
- **Capture de l'AUDIO INTERNE** (comme le vrai Shazam) : MediaProjection +
  AudioPlaybackCapture (Android 10+) — le fameux dialogue « enregistrer mon
  écran » — pour capter la musique de ta vidéo/TikTok/jeu en direct ; repli
  micro sur les vieux Android, avec mention du mode utilisé.
- **Identification + ajout automatique** : 10 s d'audio → Shazam → la chanson
  est téléchargée dans ta bibliothèque automatiquement (notification « Ajouté
  à ta bibliothèque : titre — artiste ») ; si elle y est déjà → « Dans ta
  bibliothèque » + actions Lire / Ajouter à la file depuis la notification ;
  sinon « Rien d'identifié ».
- **Service avant-plan** dédié (notification persistante « Bulle Shazam
  active »), permission de superposition + consentement d'écran gérés
  proprement (réinitialisable depuis les réglages), dernière identification
  visible dans la feuille de reconnaissance.
- Tests : encodeur WAV (en-tête RIFF), mapping résultat → notification.

## [1.25.1] - 2026-10-30

Correctif bloquant remonté par les utilisateurs : « les boutons des menus gris
en bas (créer une playlist, importer…) sont cachés par le mini-player ».

### Corrigé
- **Les menus du bas passent au-dessus du mini-player et du dock.** Les menus
  contextuels rendus par les écrans (menu « + » de la bibliothèque, menu ⋯ des
  playlists, menu ⋯ de la page playlist) étaient dessinés SOUS la barre de
  lecture flottante — leurs dernières lignes (« Nouvelle playlist », « Importer
  un lien », « Descendre », « Supprimer »…) étaient invisibles et
  inclicables. Ils sont maintenant hébergés dans la couche d'overlays de
  l'app, avec un voile plein écran au-dessus du mini-player et du dock —
  même comportement, mêmes actions.
- Navigation : l'état des menus éphémères est réinitialisé en quittant l'écran
  (comportement d'origine préservé).

### Ajouté
- **Import de playlist plus visible** : libellés explicites (« Importer depuis
  Spotify, Deezer, Apple Music, YouTube », « Importer un fichier (.m3u/.json) »)
  et un bouton d'appel direct « Importer une playlist… » sur l'état vide des
  playlists — l'import n'est plus jamais perdu.

## [1.25.0] - 2026-10-30

Refonte de l'expérience mobile, guidée par les retours utilisateurs : « c'est
trop moche, rends-la smooth », « enlève Radio », « la bibliothèque c'est trop
chargé », « ton chercheur en chantant ne marche pas, je préfère le vrai
Shazam », « mes titres likés doivent jouer aléatoirement, pas des titres que
je n'ai pas likés », « il y a plein de boutons mis bizarrement ».

### Changé — Android, comportement
- **Catégorie Radio supprimée** : dock à 4 onglets (Accueil / Nouveau /
  Recherche / Bibliothèque), code mort retiré. Les radios par graine depuis les
  menus titre/album/artiste restent disponibles.
- **Bibliothèque déchargée** : un seul menu « + » (nouvelle playlist, import
  fichier, import lien), plus de création de playlist « intelligente » (les
  existantes restent évaluées et lisibles), chips et actions redondantes
  retirées ; l'Accueil perd ses doublons (étagères qui répétaient Nouveau et
  Bibliothèque, chips de série).
- **Titres likés : « Lire » lit MES titres, aléatoirement.** File aléatoire
  composée uniquement de titres likés, et la continuation de lecture porte
  désormais une source (Bibliothèque / Favoris / Playlist) : elle ne peut plus
  injecter un titre hors de l'ensemble lancé (elle s'arrête quand il est
  épuisé) — pareil pour les playlists. Testé (13 tests JVM).
- **« Identifier la musique » = vrai Shazam.** L'app enregistre l'ambiance (ou
  ton fredonnement), le serveur identifie via **Shazam réel** (reconnaissance
  mondiale sans clé API) et affiche « Identifié » avant « Dans ta bibliothèque »
  ; un résultat identifié se télécharge en un appui dans ta bibliothèque. Les
  erreurs s'affichent toujours (plus de feuille vide silencieuse).

### Changé — Serveur
- **Vrai moteur Shazam** (`src/server/melody/shazam.ts`) : signature spectrale
  (shazamio-core WASM, PCM décodé par ffmpeg puis signatures par fenêtres de
  12 s — le décodeur WASM gère mal les conteneurs compressés) + endpoint
  officiel Shazam, sans clé ni compte. Validé en réel : clip de 12 s de
  « Get Lucky » identifié en 547 ms.
- `POST /api/recognize` : Shazam en premier, ACRCloud reste un extra
  optionnel ; `remoteEnabled` toujours vrai.

### Ajouté — Android, design & fluidité (refonte visuelle)
- **Design tokens** uniques (espacements 4→32, rayons, échelle typographique,
  surfaces tonales + bordures fines, vocabulaire d'animations ressort) appliqués
  à toute l'app — fini les valeurs magiques et les styles par écran.
- **Boutons maîtrisés** : une action primaire + une secondaire maximum par
  carte/écran ; le reste dans un menu « ⋯ » partagé (feuille animée) ; cibles
  tactiles à 48dp partout ; fini les boutons « placés bizarrement » (dont le
  menu « + » qui s'affichait sous le contenu).
- **Mouvement** : transitions d'écran animées (ressort), éléments de liste qui
  s'animent, crossfade des pochettes, player plein écran qui monte depuis le
  mini-player, pilule animée sur l'onglet actif, scrubber agrandi et fluide,
  squelettes de chargement shimmer.
- **Visuel** : héros album/artiste/playlist avec voile dégradé teinté, cartes
  arrondies cohérentes, ombres douces, réglages regroupés en cartes claires,
  onboarding/login/erreurs refaits dans le même langage, thème sombre ET clair
  travaillés.

### Tests
- 158 tests Android (continuation de file contrainte, logique existante) +
  186 tests web verts.

## [1.24.0] - 2026-10-30

Deux demandes : « une sorte de Shazam où tu marmonnes/chantonnes et ça te donne
la musique » et « quand j'importe une playlist Spotify, télécharge tous les sons
que je n'ai pas ». La reconnaissance par fredonnement tourne en local contre ta
propre bibliothèque (validée en réel : mélodie transposée +2 demi-tons, tempo
différent, bruit → retrouvée à 94 % en tête), avec une reconnaissance mondiale
optionnelle par ACRCloud, et l'import de playlist télécharge désormais ses
manquants en un geste.

### Ajouté — « Chercher en chantant » (reconnaissance par fredonnement)
- **Moteur mélodique local** (`src/server/melody/`, sans dépendance externe) :
  détection de hauteur YIN, contour mélodique quantisé par trames, appariement
  par **DTW sous-séquence sur les intervalles** — insensible à la transposition
  (on marmonne dans la tonalité qu'on veut), au tempo et aux octaves, avec
  pré-filtrage par histogramme d'intervalles pour rester rapide sur les grosses
  bibliothèques.
- **Index de mélodies opt-in** (`POST /api/library/melody`, admin) : passe en
  arrière-plan qui décode les titres (ffmpeg) et indexe leur contour (table
  `melody`, migration 013) ; progression visible dans les réglages et dans
  l'objet `scan` du snapshot. Indexation incrémentielle (nouveaux titres +
  fichiers modifiés uniquement).
- **`POST /api/recognize`** : un enregistrement (≤ 30 s, ≤ 8 Mo) →
  correspondances dans ta bibliothèque (score, pochette, lecture en un tap) +
  reconnaissance mondiale si configurée.
- **Reconnaissance mondiale optionnelle (ACRCloud)** : clés
  `ACRACLOUD_HOST/KEY/SECRET` (documentées dans `.env.example`) — identifie
  n'importe quelle chanson à partir d'un fredonnement ou de l'ambiance, puis
  propose « Ajouter à la bibliothèque » (téléchargement YouTube automatique).
  Sans clés, tout reste local et fonctionne hors ligne.
- **Web** : micro dans la recherche (« Chercher en chantant », enregistrement
  ≤ 12 s avec compteur), vue de résultats (bibliothèque + catalogue mondial),
  section réglages « Reconnaissance audio » (statut d'index, déclenchement
  admin, aide ACRCloud). **Android** : idem (permission `RECORD_AUDIO`,
  MediaRecorder, feuille de résultats), carte réglages dédiée.

### Ajouté — Import de playlist → téléchargement des manquants
- **Téléchargement par lot** (`POST /api/download { items }`, max 200, limité à
  3 lots/min) : crée un job par titre manquant, la file partagée rythme les
  téléchargements, déduplication par vidéo.
- **Web + Android** : après un import (fichier .m3u/.json ou lien
  Spotify/Deezer/Apple Music/YouTube), les titres introuvables dans la
  bibliothèque sont proposés en un geste (« Télécharger les N titres
  manquants ») ; chaque titre téléchargé est **ajouté à la playlist au fil de
  l'eau**, avec barre de progression « 12 / 47 téléchargés », toast final et
  compteur d'échecs tolérés.

### Ajouté — Tests
- Moteur mélodique (YIN sur signaux synthétiques, contour, invariance
  transposition/tempo, DTW), durcissement des routes (`/api/recognize`,
  `/api/library/melody`, mode lot), rendu web des états de résultats — 186
  tests web + 113 tests Android.

## [1.23.0] - 2026-10-30

Deux demandes : « fini yt-dlp/Python pour YouTube, passe en JS » et « donne à
l'app Android TOUTES les fonctionnalités du web ». Le téléchargement est
désormais un moteur JavaScript embarqué (validé par un téléchargement réel de
bout en bout sur un serveur standalone : recherche → progression → m4a taggé +
pochette → scan → lecture), et l'Android rattrape l'intégralité du web en 4
chantiers (lecture, playlists, découverte, réglages/i18n) — build Gradle vert,
97 tests JVM.

### Changé
- **Téléchargement YouTube : moteur 100 % JavaScript, yt-dlp/Python supprimé.**
  Nouveau `src/server/library/youtube.ts` (InnerTube via `youtubei.js`) :
  recherche YouTube, extraction d'URL de flux déchiffrées, téléchargement
  streamé avec progression par octets, rotation de clients InnerTube
  (IOS/ANDROID_VR/VISIONOS) et reconstruction de session pour survivre aux
  403/PO-token. Le téléchargement devient un `fetch` annulable
  (`AbortController`) — mêmes jobs, quotas, dédup `[VIDEOID]` et annulation
  qu'avant. La disponibilité n'est plus qu'une question de config
  (`AURALIS_DOWNLOADS`).
- **Métadonnées de téléchargement améliorées.** Nettoyage des titres YouTube
  (« (Official Audio) », « [HQ] », « #shorts »… sans toucher « (feat. …) »),
  split « Artiste - Titre », tags (titre/artiste/album/commentaire) et pochette
  intégrés par ffmpeg en **remux `-c copy`** (aucune transcode — plus rapide et
  sans perte, sortie `.m4a` ; sans ffmpeg, flux brut conservé comme avant).
- **Déploiement :** l'image Docker n'installe plus yt-dlp (ni curl) — ffmpeg
  seul suffit (tags + pochette, analyse, karaoké). Messages web/Android
  nettoyés de toute mention de yt-dlp.
- **Corrigé :** le fichier taggué ne peut plus être détruit par ffmpeg (sortie
  sur fichier `.part` distinct + vérification d'existence défensive) ; les
  titres de résultats mashés par YouTube (compteurs de vues, retours à la
  ligne) sont aplanis.

### Ajouté — Android : parité complète avec le web
- **Lecture :** égaliseur 6 bandes réel (`audiofx.Equalizer` sur la session
  ExoPlayer) avec les 8 préréglages du web (±12 dB, persistés) ; normalisation
  du volume Désactivé/Par titre/Par album (gain ReplayGain du serveur, moyenne
  d'album, split atténuation/`LoudnessEnhancer`) ; fondu enchaîné 0/3/6/12 s ;
  minuteur de sommeil complet (5/10/15/30/45/60 min + « Fin du titre » + compte
  à rebours vivant + annulation) ; visualiseur **réellement audio-réactif**
  (`audiofx.Visualizer` sur la session de l'app, repli décoratif automatique).
- **Playlists :** playlists intelligentes (port fidèle de `smartlist.ts`, les 7
  préréglages, évaluation live, stockage interop web via `playlist.upsert`) ;
  import par lien (Spotify/Deezer/Apple Music/YouTube → `/api/playlist/import`)
  et par fichier (.m3u/.m3u8/.json via SAF) avec appariement à la bibliothèque ;
  export **M3U et JSON au format web exact** (fichiers interchangeables) ;
  partage + collaborateurs (bascule « Partager », invitation, badges
  Collaboratif/Partagée/Smart).
- **Découverte & radios :** radios par graine (titre/album/artiste, « Radio
  aléatoire »), voyages sonores d'humeur (`?path=`), « Blend du foyer » par
  compte avec score de compatibilité, mix de découverte serveur + « À découvrir
  cette semaine » figé par semaine ISO, étagère « Pour votre humeur », mix du
  jour enrichi (logique DailyMixes du web).
- **Menus & partage :** menus contextuels album/artiste (longue pression) avec
  les entrées du web, « Partager » titre/album/artiste (partage système +
  presse-papiers, liens `/?view=…`), « Radio » depuis le menu titre.
- **File d'attente :** réordonnancement par ligne (▲/▼), « Vider » avec
  **annulation** (toast « Annuler » qui restaure la file), raccourci « Lecture
  aléatoire » sur toute la bibliothèque.
- **Réglages & admin :** téléchargement de sauvegarde SQLite (admin,
  `/api/backup`), déclenchement d'analyse d'humeur + progression, progression
  de scan live, statistique de couverture des paroles, sélecteur de thème
  Sombre/Clair/Système.
- **Paroles :** alignement forcé mot-à-mot (`/api/lyrics/<hash>/align` avec
  sondage, karaoké), réinitialisation du décalage.
- **Insights :** temps d'écoute semaine/total, histogramme des genres, titres
  par artiste, albums les plus volumineux.
- **Internationalisation FR/EN complète.** Couche i18n pure (catalogue fr/en
  clé-compatible avec `messages.ts`, `translate()` avec repli), sélecteur
  « Langue » dans les réglages (Français/English, noms d'origine), ~450 sites
  d'appel localisés × 2 langues, formats de dates/durées suivant la locale.

### Ajouté — Tests
- Moteur JS (nettoyage de titres, split artiste/titre, extensions), Android :
  97 tests JVM (EQ, gains, DSP, playlists intelligentes, IO playlists,
  recommandation, liens de partage, file d'attente, catalogue i18n fr↔en).

## [1.22.1] - 2026-10-06

Passe d'audit complète de la v1.22.0 (sécurité, robustesse, E2E navigateur
réel), corrections vérifiées une à une sur un serveur de dev.

### Corrigé
- **Sécurité : `/api/download` applique désormais le contrôle CSRF** comme
  toutes les routes mutantes (les sessions cookie sans Origin valables sont
  refusées ; les clients à jeton restent exemptés). L'annulation d'un job est
  réservée à son demandeur (ou à l'admin), et la liste des jobs ne montre plus
  aux non-admin que leurs propres requêtes.
- **Téléchargement : l'identifiant vidéo est validé** (`^[A-Za-z0-9_-]{11}$`) —
  un `videoId` forgé ne peut plus injecter de paramètres d'URL yt-dlp ni de
  séparateurs de chemin dans le nom de fichier `[id]`.
- **Téléchargement : la miniature ne se fait plus passer pour l'audio.**
  Découvert en E2E réel : sur un échec 403 de YouTube, yt-dlp laisse quand même
  la miniature `.webp` sur le gabarit de sortie — elle était alors « secourue »
  comme fichier téléchargé (puis comme « déjà téléchargé » par la dédup,
  court-circuitant le vrai téléchargement). Désormais seul un fichier AUDIO
  compte, aux trois endroits : chemin imprimé, détection d'existant, secours
  « fichier le plus récent » ; les `.webp` parasites sont nettoyés.
- **Téléchargement : réessais avec rotation de client YouTube.** YouTube
  répond 403 de façon aléatoire sur des requêtes valides (PO token) — jusqu'à
  4 tentatives, chacune retirant des URLs fraîches, les suivantes avec
  `player_client` alternatif. Vérifié en live (échecs ~50 % → succès).
- **Téléchargement : la course au scan est comblée.** Si un scan est déjà en
  cours (rescan au démarrage, autre job), `runScan()` rendait immédiatement et
  le fichier fraîchement déposé pouvait manquer le scan → boucle bornée de
  re-scan (3 essais) avant d'abandonner.
- **Web : la session persistée est fenêtrée** (50 avant / 200 après le titre
  courant). L'écoute infinie fait croître la file sans borne ; sauvegarder
  TOUTE la file gonflait localStorage à chaque écriture. La restauration
  tolérait déjà la troncature.

### Ajouté
- **5 tests d'intégration** sur la route de téléchargement (401, CSRF 403,
  videoId invalide ×5, liste des jobs, DELETE) — suite à 164 tests verts.

## [1.22.0] - 2026-10-06

Deux chantiers demandés par le terrain : « la musique s'arrête parfois en
pleine session » et « quand je cherche un titre que je n'ai pas, télécharge-le ».
Tout est vérifié de bout en bout : tests unitaires sur la continuation, build
web + Android, et un téléchargement réel mené au complet sur un serveur de dev
(POST /api/download → mp3 taggé → scan → trackhash → stream 200).

### Ajouté
- **Téléchargement à la demande depuis la recherche (web + Android).** Quand la
  bibliothèque répond mal à une requête (moins de 5 titres trouvés), une
  section « Trouver ailleurs » propose des résultats YouTube via yt-dlp côté
  serveur. Un appui télécharge le titre SUR LE SERVEUR (mp3 taggé, pochette
  intégrée), le scan l'indexe comme n'importe quel fichier, et il se met à
  jouer dès qu'il apparaît. Nouvelle route `POST/GET/DELETE /api/download`
  (jobs avec progression, annulation, déduplication par vidéo, quotas
  2 actifs + 6 en file, 2 par utilisateur), `GET /api/search?online=1` pour
  les suggestions en ligne. Configuration : `AURALIS_DOWNLOADS` (défaut actif),
  `AURALIS_YTDLP` (chemin du binaire), `AURALIS_DOWNLOADS_DIR` (défaut
  « Auralis Downloads » dans le dossier musique). ffmpeg optionnel (mp3 +
  miniature sans lui : m4a natif). i18n FR/EN complète.

### Corrigé
- **La lecture ne tombe plus jamais en silence en fin de file (web + Android).**
  La continuation d'écoute infinie mourait dès que TOUTE la bibliothèque était
  déjà en file (session longue, lecture de toute la librairie) : le pool
  « titres pas encore en file » se vidait et la lecture s'arrêtait net — le bug
  « je me balade et là ya plus de musique ». Elle RECYCLE désormais les titres
  (mélangés, hors titres tout juste joués, le moins récemment écouté d'abord),
  et ne s'arrête que si tout est détesté. Sur Android, même chose : l'index
  bibliothèque vide (démarrage Android Auto sans UI, échec de chargement) ne
  coupe plus la continuation — la file elle-même est recyclée.
- **Un échec de rechargement de la bibliothèque ne la vide plus (web).** Le flux
  SSE relance un chargement à chaque fin de scan ; une erreur transitoire
  effaçait `tracks` → plus rien à jouer, vues vides. Le catalogue en mémoire
  est conservé ; il n'est remplacé que par une réponse valide du serveur.

## [1.21.1] - 2026-09-29

Trois remontées terrain de l'app Android, toutes vérifiées de bout en bout sur
émulateur contre un serveur de dev (playlist de pistes de 6-9 s pour observer
les fins de file, coupure réseau en pleine lecture).

### Ajouté
- **Android : la carte « Jamais écoutés » est sur l'accueil.** Elle n'existait
  que dans l'onglet Radio ; elle siège désormais entre les tuiles d'accès
  rapide et « Mix du jour », au même endroit que sur la PWA — même carte
  indigo, même mix aléatoire relancé à chaque appui.
- **Android : « Retirer de cette playlist » dans le menu ⋮ d'un titre** lorsque
  la feuille s'ouvre depuis l'écran de la playlist concernée.

### Corrigé
- **Android : supprimer un titre de sa playlist est enfin visible.** L'ancien
  « Retirer » était un libellé gris 12sp que personne ne trouvait — chaque
  rangée porte maintenant une corbeille (cible tactile 40 dp, teinte
  destructive, annoncée par TalkBack), avec toast de confirmation « Retiré de
  « … » ».
- **Android : la musique ne s'arrête plus en fin de file.** L'extension de file
  (`appendContinuation`) atterrissait sur un player `STATE_ENDED` sans jamais
  le relancer : les titres étaient bien ajoutés, mais le silence restait.
  Après l'ajout, un player terminé (ENDED, ou IDLE après erreur) saute
  désormais sur le premier titre ajouté et reprend la lecture. Une file
  restaurée POSITIONNÉE sur son dernier titre déclenche aussi la continuation
  au premier appui sur Lecture (plus aucun transition vers la queue n'arrive
  pour la déclencher).
- **Android : une erreur de lecture ne tue plus la session.** Aucun
  `onPlayerError` n'était branché : un stream qui échoue (réseau mobile
  capricieux, serveur injoignable) laissait le player en `STATE_IDLE`, muet,
  au milieu d'une file pleine. Désormais : toast « Piste illisible », passage
  au titre suivant, et arrêt propre après 6 échecs consécutifs sans aucune
  progression réelle (un serveur mort ne fait pas tourner la file en boucle).
  Le compteur retombe à zéro dès qu'un titre progresse réellement.

## [1.21.0] - 2026-09-14

Six chantiers parallèles supplémentaires, puis une chasse aux régressions dont
les quatre trouvailles sont corrigées ici.

### Ajouté
- **Android : la télécommande Auralis Connect et l'autoplay infini survivent
  maintenant à la fermeture de l'app.** SyncManager (contrôle à distance) et
  `appendContinuation` (extension de file jamais-écoutée) vivent dans le scope
  process-lifetime de `PlaybackAccounting` : un autre appareil garde la main,
  la file continue de s'étendre, et la rotation du token (changement de mot de
  passe, déconnexion) reconnecte proprement le hub.
- **Android : écrans fluides sur grandes bibliothèques** — les tris/filtres/
  regroupements d'accueil, nouveau, radio, bibliothèque et pages de détail
  sont calculés hors du thread UI (l'ancien comportement freezait la
  composition), le scrubber utilise la durée du lecteur, les requêtes d'images
  sont annulées au défilement rapide, et les contrôles épingler/monter/
  descendre sont annotés pour TalkBack.
- **Web : wake lock plein écran** — l'écran ne s'endort plus quand le lecteur
  plein écran ou le visualiseur est ouvert (reprise après visibilitychange).
- **Tests : 12 nouveaux tests serveur** épinglent les comportements récents —
  sidecar `.lrc` édité (gagne/perd selon mtime), GC des pochettes orphelines
  (référencées conservées, junk intacte, idempotent), UCB fenêtré 180 jours
  (mutation-vérifié), rupture Markov sur skip, bornes de mois et minuit local
  des stats, contrat du jeton d'URL de l'API.

### Corrigé
- **Web : le geste retour Android redevient fiable après un retour « à la
  racine »** — la sentinelle d'historique était consommée définitivement au
  premier back sans pile, puis la navigation suivante devenait inatteignable
  par le geste ; elle est réarmée dès que la pile ou le lecteur plein écran
  réexiste, et le double-push du Strict Mode est écarté.
- **Web : les compteurs d'écoute ne rembobinent plus au premier scrobble
  effectué pendant une synchro** (la greffe n'itérait que les titres déjà
  connus avant la requête).
- **Serveur : le rafraîchissement `last_used_at` des sessions pointait sur
  l'identifiant brut au lieu du hash** — écriture morte depuis le hachage des
  jetons (aucun lecteur aujourd'hui, mais toute future UI « sessions actives »
  aurait affiché des données gelées).
- **Serveur : l'intervalle de re-scan du watcher peut fuir** quand un événement
  arrive pendant un scan puis que le suivant part direct — nettoyé.
- **Reco : le tri de la continuation avec jitter aléatoire inline est un ordre
  non stable** — le score est précalculé par titre (le port Android avait
  documenté le même piège).
- **Opérateurs derrière un proxy : un rejet CSRF avec X-Forwarded-Host présent
  mais AURALIS_TRUST_PROXY non défini journalise désormais la marche à suivre**
  au lieu d'échouer en silence.
- **Android : fetch de paroles dédoublonné** avec garde de course, tuiles
  récentes qui naviguent vers l'album, visualiseur honnêtement étiqueté
  « décoratif », carte Apparence morte retirée.
- **Web : pinch-zoom réautorisé** (WCAG 1.4.4), fuite de minuteurs de toast
  corrigée, nag d'installation mémorisé par navigateur.

## [1.20.0] - 2026-09-14

Sept chantiers menés en parallèle pour finir la liste de l'audit — détail des
constats d'origine dans ANALYSE.md.

### Ajouté
- **Android : la comptabilité d'écoute survit à la fermeture de l'interface.**
  Scrobbles, détection de skips, sauvegarde de session et minuterie de sommeil
  vivent désormais dans un singleton à durée de vie process (`PlaybackAccounting`)
  avec son propre contrôleur Media3 : balayer l'app pendant l'écoute ne stoppe
  plus le comptage ni la sauvegarde, et la minuterie coupe vraiment la lecture.
- **Android : R8 + resource shrinking activés en release** (APK vérifié à
  4,2 Mo), repli automatique sur le keystore de debug pour les nouveaux
  contributeurs, pochettes de playlist redimensionnées à ≤1024 px avant envoi
  (fini les uploads de 8-11 Mo), erreurs admin enfin affichées (rescan,
  création de playlist), retour prédictif via `OnBackPressedCallback`,
  wake mode réseau sur ExoPlayer, catalogue Android Auto thread-safe.
- **iOS : lecture enfin résiliente** — interruptions d'appel et débranchement
  du casque gérés, statut des flux observé (un titre injouable affiche
  l'erreur au lieu de bloquer la file en « lecture »), session expirée
  renvoyée vers l'écran de connexion au lieu d'une bibliothèque vide, courses
  de changement de titre éliminées, fin de file qui repasse en pause,
  Info.plist déplacée sur la bonne cible (l'audio en arrière-plan ne pouvait
  pas fonctionner), version réelle affichée, pipeline de thème mort supprimé.
- **Web : l'interface est réellement bilingue.** 88 clés nouvelles (fr + en)
  extraites des surfaces codées en dur : barre latérale, panneau de lecture,
  file, paroles, écran de connexion, aide clavier (avec la ligne volume
  corrigée), palette de commandes, barre de titre, fenêtres, sélection.
- **Serveur : recommandations et données à l'échelle.** Embeddings sortis du
  cache par utilisateur (une copie partagée au lieu de N), trajectoire du reco
  bornée (grille arousal×valence, équivalence prouvée contre l'exhaustif),
  UCB sur un horizon unique 180 jours, chaîne de Markov coupée sur les skips,
  sidecar `.lrc` édité rechargé dès qu'il est plus récent que le cache,
  échecs d'analyse bornés à 3 tentatives, pochette de dossier lue une fois
  par scan, GC des pochettes orphelines après purge.
- **CI : tests unitaires Android dans le pipeline** (`android-tests`), et 7
  tests verrouillant `compareVersions` — la fonction qui décide de chaque
  proposition de mise à jour (comparaison bien numérique, y compris 1.19.1
  > 1.2.0).

### Corrigé
- **Web : le jeton de session ne pollue plus chaque URL** — il ne part plus
  que vers les surfaces qui ne peuvent pas porter d'en-tête (pochettes, flux,
  EventSource) ; les EventSource scan/bibliothèque l'appellent explicitement.
- **Web : l'ajout d'un album/artiste à la file est une écriture unique**
  (fini N écritures + N toasts), la sélection du leader de synchronisation a
  un repli BroadcastChannel pour les onglets sans Web Locks, le partage sans
  presse-papiers est annoncé en échec, le CSS mort est retiré (`.scrubber`,
  keylines, data-glass), les échelles amber/emerald existent enfin (des
  classes de statut étaient silencieusement sans style), `--brass` est défini,
  les barres d'un album ne dansent plus en pause, les clés de listes tolèrent
  les doublons, le deep-link `?view=` est retiré de l'URL après navigation,
  l'alignement de paroles suspend son interro­gation quand l'app est en
  arrière-plan, la révocation des blobs est différée (Firefox), et l'aide
  clavier décrit le vrai comportement des flèches.
- **Desktop : le serveur local est identifié avant affichage** (le /api/health
  doit répondre name=Auralis — un autre process sur le port n'est plus
  confondu avec Auralis, et un crash enfant donne sa cause au lieu d'un faux
  « 30 s dépassé »), les bases http publiques exigent une confirmation
  explicite, le sélecteur de dossier n'est plus invocable par une page
  distante, les raccourcis média échoués sont journalisés, et le paquet
  desktop n'embarque plus android-native/ios-native/docs (liste blanche).
- **Divers :** toast « fondu enchaîné » traduit, week-key ISO du mix
  découverte, verrouillage de version appliqué partout (package.json, lock,
  tag).

## [1.19.1] - 2026-09-12

### Corrigé
- **Android : l'indicateur d'onglet échangeait Bibliothèque et Recherche.**
  La table de correspondance de l'onglet actif pointait Recherche sur le
  créneau de Bibliothèque et toutes les vues de la bibliothèque (favoris,
  récents, réglages, pages de détail…) sur celui de Recherche — appuyer sur
  Recherche allumait Bibliothèque, et inversement. Le mappage suit désormais
  l'ordre réellement affiché par le dock, et un test de régression le verrouille
  (`TabMappingTest`).

## [1.19.0] - 2026-09-12

### Ajouté
- **Mix « Jamais écoutés » — aléatoire, sur tous les écrans mobiles.** Une
  nouvelle action (PWA et Android) construit à la demande une file mélangée
  (Fisher-Yates, à CHAQUE appui — plus de mix figé une semaine) des titres que
  le compte n'a jamais joués, avec repli sur les moins joués quand la
  bibliothèque est presque entièrement écoutée. Présenté en bannière héro sur
  l'Accueil PWA, en carte héro sur l'onglet Radio PWA, via le bouton « Tout
  lire » du rayon Découvertes et une carte héro de l'onglet Radio Android.
- **Onglet Radio PWA : de vraies radios.** L'onglet ne se contente plus de
  lister albums/artistes : héro « Jamais écoutés » + « Radio aléatoire »
  (station seedée sur un titre tiré au hasard de la bibliothèque).
- **Écoute H24 qui explore au lieu de tourner en boucle.** La continuation
  autoplay (web `buildContinuation`, Android `appendContinuation`) privilégie
  désormais les titres **jamais joués** (mélangés), puis les moins joués, en
  gardant l'affinité artiste/genre comme bonus — et l'app Android **recycle**
  la bibliothèque au lieu de s'arrêter en silence quand toute la musique a été
  mise en file.
- **Les options de lecture sont retenues partout.** Chaque bascule
  boucle / aléatoire / lecture continue est désormais aussi synchronisée dans
  les réglages du compte serveur ; un client au stockage effacé (réinstallation,
  éviction WebView/iOS) ou un nouvel appareil retrouve exactement les options
  choisies. Aucune option déjà changée localement n'est écrasée au démarrage.
- Deux nouveaux tests : continuation autoplay prioritaire sur l'inédit et
  randomisée ; `startUnheardMix` (pool inédit pur vs repli least-played).

### Corrigé
- **Les sessions expirent réellement.** La table `sessions` était vérifiée sans
  aucune date et jamais purgée : le TTL de 30 jours ne gouvernait que le cookie,
  donc un jeton copié hors du navigateur restait valable pour toujours, et la
  table grossissait sans limite. L'expiration est désormais appliquée côté
  serveur, et un balayage périodique supprime les sessions périmées.
- **« Se déconnecter » révoque maintenant tous les identifiants de la requête** —
  cookie, jeton `Authorization: Bearer` et l'ancien `?token=`. Auparavant, seul
  le cookie était révoqué alors que les clients s'authentifient d'abord par
  jeton : se déconnecter du PC partagé ne terminait rien.
- **La connexion rejette un nom d'utilisateur malformé** (non-chaîne ou > 128
  caractères) avec un 400 au lieu de lever un 500, et de siéger comme clé de
  limiteur avec plusieurs mégaoctets.
- **`X-Forwarded-Host` n'est plus honoré qu' derrière un proxy déclaré
  (`AURALIS_TRUST_PROXY=1`)**, comme la limite de connexion le faisait déjà —
  l'en-tête est une entrée falsifiable sur un serveur directement exposé.
  Variable documentée dans `deploy/.env.example` ; si vous êtes derrière un
  proxy inverse, ajoutez la variable à votre `.env`.
- **Le GET de paroles hors cache est limité par compte** (90/min) : un balayage
  de hash au hasard ne peut plus faire bannir l'IP du serveur par LRCLIB ou
  Musixmatch pour tout le monde.
- **Un scan ne peut plus se figer pour toujours.** Le parseur de tags
  (music-metadata) peut ne jamais rendre la main sur un fichier corrompu ou un
  montage suspendu ; un chien de garde de 20 s le court-circuite et retombe sur
  les données du nom de fichier.
- **Le fossé de numérotation des migrations est refermé** (012.sql renommé
  011.sql — le créneau n'a jamais été utilisé) et le runner prévient bruyamment
  si la base prétend être plus récente que les fichiers présents.
- **Les flèches haut/bas ne détournent plus le défilement clavier** : elles
  règlent le volume uniquement quand un contrôle de transport a le focus.
- **Les playlists exportées en M3U ne contiennent plus le jeton de session**,
  et l'import tolère un BOM UTF-8 (entrée fantôme « non appariée »).
- **Les fonds d'écran du lecteur (plein écran et mini-lecteur mobile) passent
  par `api.assetUrl`** : ils se résolvent contre une base distante configurée
  (auparavant cassés) et demandent une vignette au lieu de la pochette pleine
  résolution.
- **Plafond de +6 dB dans la chaîne audio** : ReplayGain d'un master discret +
  égaliseur « basses » ne clippent plus au DAC.
- **La sélection par appui long fonctionne au doigt** : les micro-mouvements
  d'un doigt posé n'annulent plus la minuterie (rayon de 10 px), et le pointercancel
  est géré.
- **Le pull-to-refresh n'installe plus ses écouteurs par image** pendant le
  geste (état en refs), et ne se lie plus à `document.body` en repli.
- **Le shell hors-ligne du service worker se rafraîchit** à chaque navigation
  réussie et est réchauffé dans `activate` — il n'est plus figé à l'installation
  avec des chunks d'une version révolue.
- **Android : le jeton de session ne circule plus dans l'URL du flux SSE** de
  synchronisation (en-tête `Authorization`, comme pour le streaming) ; les
  préférences de shuffle/repeat persistent la valeur voulue et non une
  relecture du contrôleur (course IPC) ; l'écriture du volume est débouncée ;
  sans schéma, une adresse publique passe en `https://` par défaut (une IP ou
  `.local` reste en `http://`).
- **Image de deploy : `npm ci` avec le lockfile commis** (build reproductible,
  le commentaire « pas de lockfile » était faux) **et ffmpeg inclus** — l'image
  documentée n'avait ni l'un ni l'autre : BPM/énergie/karaoké ne pouvaient pas
  fonctionner. Le mot de passe admin n'est plus livré actif dans
  `deploy/.env.example`, le Dockerfile racine orphelin (sans healthcheck,
  référencé nulle part) est supprimé, et le script Pterodactyl reconstruit
  better-sqlite3 si le majeur de Node du runtime diffère de celui de
  l'installation.
- **Desktop : la réinitialisation de configuration demande confirmation** dans
  une boîte de dialogue native — en mode distant, n'importe quel script de la
  page pouvait la déclencher en silence.
- **`/api/art` exige désormais une authentification**, comme toutes les autres
  surfaces de contenu — et un Range multi-plages reçoit un 200 complet au lieu
  d'un 416 (RFC 9110 : le serveur peut ignorer l'en-tête).
- **Les jetons de session sont stockés hachés (sha256) en base.** La sauvegarde
  admin téléchargeable ne vaut plus une liste de sessions volables (les lignes
  antérieures restent honorées jusqu'à expiration).
- **Le contrôle « mot de passe compromis » est appliqué côté serveur** (rejet
  400) et ne paie l'appel externe qu'après la validation locale — à la création
  de compte comme au changement/réinitialisation de mot de passe. Un utilisateur
  inconnu consomme désormais le même travail de hachage qu'un existant (le temps
  de réponse ne sert plus à énumérer les comptes).
- **L'import d'playlist par URL directe résout le DNS** et refuse toute adresse
  privée, CGNAT ou de benchmark — les formes non canoniques et le rebinding DNS
  ne passent plus.
- **Migration 012 : index sur `trackhash`** pour les six tables de la cascade de
  purge (fini le scan complet par titre supprimé), purge préparée une fois et
  découpée en transactions de 500 chemins.
- **Le watcher ne perd plus les événements arrivés pendant un scan** : ils
  déclenchent un second scan à la fin du premier.
- **L'extraction d'accent des pochettes est dédoublonnée** (une seule lecture +
  sharp stats par hash, quel que soit le nombre de requêtes concurrentes), et
  l'alignement de fond a un plafond d'une heure (un subprocess suspendu ne
  bloque plus toutes les passes suivantes).
- **L'import de sauvegarde conserve les règles des playlists intelligentes et
  leur statut de partage**, et nettoie les lignes de collaborateurs orphelines.
- Divers : `migrate-status` ouvre la base en lecture seule (plus de création
  accidentelle), `gen-sample-music.sh` écrit dans un dossier paramétrable, la
  restauration de session sur bibliothèque vide libère la sauvegarde (plus de
  titre ressuscité), Échap ne referme plus le lecteur plein écran en fermant un
  menu, un partage sans presse-papiers est annoncé en échec, la révocation des
  blobs est différée (Firefox), les barres d'un album ne dansent plus en pause,
  les lignes de paroles sont atteignables au clavier, les clés de listes de
  playlist tolèrent les doublons, le panneau d'administration ne fait plus de
  setState après démontage, les compteurs d'écoute optimistes ne sont plus
  rembobinés par la synchro serveur, et les curseurs gèrent `pointercancel`.
- **Android : le service média n'accepte plus n'importe quel contrôleur** — les
  appelants inconnus sont rejetés (Android Auto, l'assistant et le SystemUI
  restent autorisés). Les réglages affichent la vraie version et les playlists
  montrent leur pochette personnalisée.
- **Déploiement : `update.sh` sauvegarde la base avant l'upgrade** (les
  migrations sont forward-only) et ne purge plus que ses propres images
  pendantes ; les journaux compose sont bornés ; la rétention inclut les copies
  de sûreté de restauration.
- **Le changement de mot de passe vérifie enfin le mot de passe actuel.**
  `verifyCredentials` est asynchrone mais n'était pas attendue : `!Promise` valant
  toujours faux, la vérification du mot de passe actuel était inatteignable et
  n'importe quelle session authentifiée pouvait reprendre n'importe quel compte
  (admin compris) avec un mot de passe actuel bidon. Test de régression ajouté.
- **Un scan sur montage vide n'efface plus la bibliothèque ni l'historique.**
  Si le dossier musique est vide ou illisible au moment du scan (NFS pas encore
  monté, chemin modifié, glitch de permissions), la purge supprimait toutes les
  pistes puis, par cascade, les favoris, compteurs d'écoute, historiques et
  playlists de tous les utilisateurs. Une soupape annule désormais la purge
  lorsqu'une scan perd plus de 60 % de la bibliothèque, avec message explicite ;
  `AURALIS_ALLOW_MASS_PRUNE=1` permet le cas voulu d'une bibliothèque réellement
  vidée. Variable documentée dans les deux `.env.example`.
- **La clé de signature Android est couverte par `.gitignore`.** Le keystore et
  `keystore.properties` ne l'étaient pas, alors que la documentation du projet
  indique que la clé d'origine a déjà fuité : toute restauration locale suivie
  d'un `git add` aurait commité la nouvelle clé.
- **La session reprise en pause n'est plus perdue.** La sauvegarde de session
  n'était écrite que pendant la lecture : le premier changement d'état en pause
  (un toast, un like…) effaçait la session — recharger l'app perdait alors la
  reprise. La session survit désormais tant qu'un titre est chargé, pause
  comprise, avec la position du scrubber.
- **Le geste retour Android ne quitte plus l'application** (PWA installée) :
  intégration `history` — le retour système ferme le lecteur plein écran, puis
  revient en arrière dans la navigation, et ne sort de l'app que quand il n'y a
  plus rien à dépiler.
- **Repeat-one : un redémarrage raté n'affiche plus « en lecture » à tort**
  (l'échec `play()` remet l'état en pause, comme le chemin principal).
- **Mini-lecteur mobile : boutons précédent / suivant ajoutés** (le duo
  favori/lecture laissait le dock sans transport de file).
- **Minuterie de sommeil mobile alignée sur desktop** : 5/10/15/30/45/60 min
  (contre 15/30/60 auparavant).
- **Android : le fond flou du lecteur plein écran se rend enfin** — le chemin
  relatif de pochette était passé tel quel à OkHttp (exception silencieuse) ;
  il est désormais résolu via l'URL du serveur.
- **Android : la déconnexion n'hiberne plus la file du compte précédent** —
  `last_session` est effacée, la session d'un autre compte ne peut plus être
  restaurée (et scrobblée) sur le nouveau compte.
- **Tests unitaires Android réparés.** Aucune dépendance de test n'était
  déclarée (`testImplementation` absent — JUnit « unresolved ») : les 11 tests
  de `src/test/` n'ont jamais pu compiler ni tourner. JUnit 4 et une
  implémentation réelle de `org.json` sont ajoutés, et les deux tests
  dépendant d'`android.net.Uri` (stub qui lève sur le JVM) sont bornés par
  `Assume` — exécutés sur appareil, ignorés proprement en JVM.

## [1.18.1] - 2026-08-30

### Corrigé
- **La suppression de fichiers ne casse plus le scan de la bibliothèque.** La
  cascade de nettoyage utilisait une mauvaise clé sur `art_colors` (`trackhash`
  au lieu de `arthash`) : toute analyse impliquant des fichiers supprimés
  échouait en bloc et laissait des doublons dans la bibliothèque. Les pochettes
  orphelines sont désormais supprimées avec la bonne clé, et un scan avec
  suppressions se termine proprement.

### Ajouté
- **Variante Google Play du client Android (saveur `play`).** Le bundle .aab
  destiné au Play Store est construit sans `REQUEST_INSTALL_PACKAGES`
  (permission restreinte sur Play pour un lecteur de musique) et sans le
  module de mise à jour interne — les mises à jour arrivent via le store.
  La saveur `full` (GitHub / installation directe) conserve l'auto-update.
- **Kit Play Store complet en anglais** : captures d'écran 1080×1920,
  icône 512, bannière 1024×500, textes d'annonce et notes de version
  (`store-listing/en-US/`), plus une politique de confidentialité FR/EN
  (`PRIVACY.md`).
- **Re-émission du bundle Play avec le code de version 11801** : le code 11800
  avait déjà été consommé par un premier téléversement dans la Play Console,
  qui refuse tout doublon. Aucun changement fonctionnel par rapport à la
  saveur `play` de la 1.18.0 — les utilisateurs GitHub/desktop restent sur
  la 1.18.0 (release « latest » inchangée).

## [1.14.0] - 2026-08-06

### Corrigé
- **La pochette apparaît enfin sur l'écran BMW (et tous les autoradios).** La
  correction de la v1.13.1 n'avait jamais réellement fonctionné : les trois clients
  demandaient bien une vignette `?w=512`, mais le cache d'images ne connaissait que
  les tailles 96/160/256/384/640 — pas de 512. Le serveur renvoyait donc la cover en
  pleine résolution, que BMW iDrive (AVRCP Cover Art), CarPlay et Android Auto
  ignorent silencieusement. Le bucket 512px est désormais généré et mis en cache ;
  la cover s'affiche maintenant sur le tableau de bord, sur les trois clients.
- **Le défilement ne fait plus planter l'application.** Aucune frontière d'erreur
  React n'existait — une exception levée pendant le rendu d'une liste virtualisée
  faisait s'effondrer tout l'app shell (écran blanc, rechargement imposé). Chaque
  vue et panneau est désormais encapsulé dans une `ErrorBoundary` qui isole la casse :
  la barre de lecture et le reste de l'UI restent actifs, et un bouton « Réessayer »
  remonte la zone fautive sans recharger la page.
- **Défilement plus stable dans la bibliothèque.** Le reset du scroll au changement
  d'onglet/filtre passe désormais par une trame (rAF) pour s'appliquer après le
  remontage de la liste, évitant le blanc de mesure puis le gel. La virtualisation
  ignore aussi les géométries dégénérées (conteneur replié pendant un changement
  d'onglet) au lieu de calculer une fenêtre hors-champ.

### Ajouté
- **Paroles + contrôle à distance depuis le téléphone.** Quand la musique joue sur
  le PC, le sélecteur « Connect » (depuis le téléphone, même compte) affiche
  désormais un aperçu de la ligne de paroles en cours, plus un bouton « Paroles »
  qui ouvre les paroles synchronisées en plein écran (auto-scroll, surlignage de la
  ligne active, scrubbing qui envoie la commande seek au PC). Les boutons
  lecture/pause/précédent/suivant pilotaient déjà le PC — l'expérience est
  désormais complète.
- **Réglage « Arrière-plan sobre ».** Un interrupteur (Réglages → Apparence) permet
  de désactiver le fond animé (étoiles, météores, aurores) sur tous les thèmes, pour
  un rendu uni. Disponible sur le web et sur Android.

### Modifié
- **Passe anti-« look IA ».** Retrait du branding « IA » / « ✨ » dans l'interface
  (« Mix IA » → « Mon mix », icône étincelle remplacée par une baguette/réglages,
  libellés des menus de sélection et du karaoké mot-à-mot assagis). Le moteur de
  recommandation (la vraie fonctionnalité) est intact — seul le wording et le
  clinquant visuel changent.

## [1.13.1] - 2026-07-21

### Corrigé
- **La pochette s'affiche enfin sur l'écran de la voiture.** En Bluetooth (AVRCP
  Cover Art), en CarPlay et en Android Auto, les autoradios — BMW iDrive en tête —
  ignoraient silencieusement la pochette parce qu'elle était envoyée en pleine
  résolution (trop lourde/lente à transférer). Auralis transmet désormais une
  vignette compacte (512 px) sur les surfaces média du système, exactement comme le
  font les grandes apps de streaming : la cover apparaît maintenant sur le tableau
  de bord. Correction appliquée aux trois clients (web, Android natif, iOS natif).

## [1.13.0] - 2026-07-07

### Added
- **Les fonds animés (étoiles, étoiles filantes…) reviennent partout.** Le fond
  animé des thèmes cosmiques/ambiances n'était visible que dans l'app de bureau ;
  il s'affiche désormais sur le web et le mobile aussi (densité de particules et
  météores réduites sur petit écran pour la batterie, `prefers-reduced-motion`
  respecté). Contredit volontairement la décision « bureau uniquement » de juin.
- **~10 nouveaux thèmes.** Ardoise, Mousse (classiques) ; Andromède, Polaire,
  Éclipse, Voie lactée (cosmiques, avec étoiles) ; Lagon, Ultraviolet (vibrants) ;
  Lanternes, Orage (ambiances) — entrées de thème pures, sans changement de code.
- **Visualiseur repensé (touche V).** Trois modes cyclables — spectre radial
  autour de la pochette, onde, particules réactives — teintés par la palette du
  thème actif, branchés sur l'analyseur audio réel (FFT plus fine). « V » change
  de mode (un clic aussi), Échap ferme ; le mode choisi est mémorisé.
- **Écrans de chargement en skeleton.** L'Accueil, les détails (album/artiste/
  playlist), la Recherche et l'onglet Playlists affichent des placeholders animés
  pendant le chargement — fini le flash « Configurer la bibliothèque » et les sauts
  de mise en page au démarrage, surtout sur mobile.
- **Client iOS natif (SwiftUI).** Nouvelle app `ios-native/` miroir du client
  Android : lecture en arrière-plan, Centre de contrôle, paroles synchronisées,
  favoris/reco/recherche, choix du thème. CI GitHub Actions produisant un `.ipa`
  non signé (sideload / re-signature).

### Fixed
- **Bibliothèque à grande échelle (10 000+ titres).** Correction des lignes/cartes
  vides lors d'un défilement rapide, du saut de scroll au changement d'onglet/filtre
  et de la dérive de la barre de défilement — la fenêtre de virtualisation est plus
  robuste (overscan directionnel, clamp, remesure).
- **Journaux serveur — plus de spam « sidecar write failed ».** L'écriture du
  fichier `.lrc` à côté de l'audio ne tente plus rien si le fichier audio n'existe
  plus (dossier déplacé/non monté), et les vraies erreurs de permissions sont
  dédupliquées. Les paroles restent servies depuis la base — comportement inchangé.

### Changed
- **Passe « anti-AI look » ciblée.** Remplacement des dégradés décoratifs par des
  aplats de couleur + voile sobre (tuile « Titres likés », cartes humeurs/genres/
  blend/mix, panneau récap), retrait des ombres portées sur texte, du flou de la
  barre de sélection et du reflet spéculaire des pochettes 3D. La tuile « Titres
  likés » n'est plus une exception au style aplati.

## [1.12.3] - 2026-07-07

### Security
- **Bureau — moteur mis à jour.** Le shell desktop passe à Electron 42 (Chromium
  récent, correctifs de sécurité), avec le moteur de base de données recompilé en
  conséquence. Important surtout en mode connexion à un serveur distant.
- **Android — le token de session ne circule plus dans les URLs.** Le jeton
  d'authentification passe désormais par un en-tête HTTP (streaming) au lieu de
  l'URL, et n'est plus ajouté aux adresses de pochettes (endpoint public). Il ne
  se retrouve donc plus dans les journaux de serveurs/proxies.

### Changed
- **Robustesse interne.** Bornage des caches en mémoire (recommandations,
  alignement des paroles), verrou anti-course sur le chargement du catalogue
  Android Auto, décodage des grandes pochettes plafonné (moins de pics mémoire),
  et garde en intégration continue empêchant une release dont l'étiquette ne
  correspond pas à la version.

## [1.12.2] - 2026-07-07

### Fixed
- **Android — préférences de lecture restaurées.** La répétition, la lecture
  aléatoire et le volume choisis sont de nouveau appliqués au démarrage (ils
  pouvaient être ignorés quand la lecture reprenait avant la connexion du
  lecteur, l'affichage montrant alors une valeur différente du son réel).
- **Android — file d'attente fiable.** Taper sur un titre (ou le retirer) dans la
  file agit bien sur ce titre-là, même quand certains morceaux de la file ne sont
  plus présents dans la bibliothèque.
- **Android — moins de plantages.** Ouverture de l'app juste après l'arrêt du
  service de lecture, recherche avec une adresse de serveur invalide, et
  vérification d'une mise à jour : ces cas ne font plus planter ni figer l'app.
- **Paroles — plus de mélange entre deux titres.** En enchaînant rapidement les
  morceaux, une réponse tardive ne vient plus afficher les paroles (ou le message
  « instrumental ») du titre précédent sur le titre en cours.
- **Recherche — indicateur de chargement.** Un discret indicateur s'affiche
  pendant la recherche, au lieu d'un changement brusque des résultats.
- **Bureau (Windows/Linux) — écran d'erreur au lieu d'une fenêtre blanche.** Si le
  serveur est injoignable au lancement, une page « Réessayer » s'affiche ; un
  arrêt inattendu du serveur embarqué est aussi signalé clairement.
- **Stabilité serveur.** L'analyse audio ne peut plus se lancer en double,
  l'écriture des paroles est atomique, et les connexions temps réel (télécommande)
  ne laissent plus d'appareils fantômes.

## [1.12.1] - 2026-07-04

### Changed
- **Visualiseur (touche V) refait.** Fini l'anneau de barres qui tourne, l'onde
  en miroir et le faux disque dégradé. Le visualiseur adopte le langage visuel du
  lecteur plein écran : vraie pochette floutée en fond + wash de la palette du
  titre, la vraie pochette au centre qui respire doucement avec l'énergie du son,
  et un seul spectre bas lissé et discret, teinté à la palette. Barre de
  progression fine et transport en bas.

## [1.12.0] - 2026-07-03

### Added
- **Import d'une playlist par lien.** Collez un lien de playlist (ou d'album)
  **Spotify, Deezer, Apple Music ou YouTube** dans Bibliothèque → Playlists →
  « Depuis un lien » : Auralis récupère la liste des titres, retrouve ceux
  présents dans **votre** bibliothèque et crée la playlist automatiquement (avec
  un retour « X/Y titres retrouvés » quand certains manquent). Les liens directs
  `.m3u`/`.json` sont aussi acceptés. Aucune clé d'API : la tracklist est lue
  depuis les pages/APIs publiques des services, et l'appariement tolère le bruit
  des titres (« (Remastered 2011) », « feat. … », « (Official Video) »…).

## [1.10.0] - 2026-06-30

### Added
- **Connect.** Télécommande en temps réel entre vos appareils (PC ↔ téléphone,
  même compte) via un hub SSE : un appareil pilote la lecture d'un autre
  (lecture/pause, précédent/suivant, recherche dans le morceau) avec un
  now-playing miroir et un scrubber interpolé. Sélecteur d'appareils façon Spotify
  dans la barre du lecteur et en plein écran.

### Changed
- **Plein écran façon Spotify.** Fond thématisé par la pochette (cover floutée +
  glow de la palette), vue paroles desktop avec la pochette épinglée à gauche, et
  un voile de lisibilité en haut pour les pochettes claires.
- **Paroles.** Le mode karaoké (surbrillance mot-à-mot) n'apparaît que pour les
  paroles synchronisées mot-à-mot (richsync) ; les LRC ligne-à-ligne restent en
  affichage Standard.

### Fixed
- **Reprise de session.** Vider la file ou arrêter la lecture efface enfin la
  session sauvegardée (plus de morceau « ressuscité » à la réouverture), tout en
  corrigeant la course qui pouvait afficher « Aucune lecture » au démarrage.

## [1.9.0] - 2026-06-29

### Added
- **Mix IA.** Sélectionnez plusieurs titres (appui long ou ⋮ → « Sélectionner »)
  puis « Mix IA » : le moteur de goût construit une playlist à partir de votre
  sélection et de vos habitudes d'écoute (vibe audio des titres choisis × profil
  de goût), en gardant vos titres en tête puis en ajoutant des recommandations.
- **Sélection multiple** façon Spotify sur mobile et application native : cases à
  cocher, barre d'action flottante (lecture de la sélection + Mix IA).

### Changed
- **Application Android au look Spotify.** Thème Spotify (vert #1ED760 sur noir
  #121212) appliqué par défaut, barre de navigation à 3 onglets
  (Accueil / Recherche / Bibliothèque) et « Titres aimés » intégré à la
  bibliothèque.

## [1.8.0] - 2026-06-29

### Added
- **Recherche puissante.** Recherche serveur (FTS5) classée et tolérante aux
  accents, onglets Tout/Titres/Albums/Artistes et carte « Meilleur résultat ».
- **Radios.** Démarrer une radio personnalisée depuis n'importe quel titre, album
  ou artiste (similarité audio × goût).
- **Découverte enrichie.** Mix du jour par humeur, « À découvrir cette semaine »,
  voyages sonores (radios à trajectoire d'humeur : endormissement, montée en
  énergie…) et **Blend du foyer** (mix qui mélange les goûts de deux comptes).
- **Smart-playlists** dynamiques pilotées par l'analyse audio (Énergie haute,
  Calme du soir, 160+ BPM, Jamais écouté, Récemment ajoutés, Tout en lossless…).
- **Playlists collaboratives.** Partager une playlist et inviter d'autres comptes
  du serveur à y ajouter / retirer des titres.
- **Import / export de playlists** aux formats M3U et JSON.
- **Filtres de bibliothèque** instantanés + pastilles humeur / lossless / genre,
  et tri « ajout récent ».
- **Pochette 3D.** Maintenir la pochette du lecteur l'incline en 3D (reflet + ombre).
- **Couleur réelle de pochette.** L'ambiance du lecteur reprend la vraie couleur
  dominante de la jaquette.
- **Égalisation du volume (ReplayGain).** Niveau homogène entre les titres
  (réglable : désactivé / par titre / par album).
- **Visualiseur réellement réactif** (vraie analyse audio FFT, plus une animation).
- **Fondu enchaîné** réglable entre les titres.
- **Android Auto.** Auralis apparaît sur l'écran de la voiture (Fait pour vous,
  Favoris, Récents).
- **Écoute hors-ligne (Android).** Tout titre déjà écouté rejoue sans connexion
  (cache média 2 Go).
- **Multilingue.** Sélecteur de langue (français / anglais).

### Changed
- **Démarrage plus rapide.** Le catalogue n'est plus re-téléchargé à chaque
  ouverture (revalidation 304) et les écrans lourds se chargent à la demande.
- **Accessibilité.** Lien « Aller au contenu », squelettes de chargement et états
  vides homogènes.
- **Android.** Gestes natifs sur le lecteur (glisser vers le bas pour fermer,
  horizontalement pour changer de titre) et pochettes mises en cache sur le disque.

## [1.7.1] - 2026-06-29

### Fixed
- **Android — la notification de lecture ouvre enfin l'application.** Toucher la
  notification du média (ou la commande sur l'écran verrouillé) ramène désormais
  l'app native au premier plan, au lieu de rediriger vers la page web.

### Changed
- **Barre de recherche (bureau + web) redessinée.** Pastille plus nette et mieux
  proportionnée ; le raccourci `Ctrl K` n'est plus affiché sur l'interface (le
  raccourci clavier continue de fonctionner).
- Empaquetage `.deb` : icônes ré-encodées en RGBA 8 bits et toutes les tailles
  hicolor incluses pour un affichage correct dans les environnements de bureau.

## [1.6.0] - 2026-06-27

### Added
- **Mises à jour automatiques sur toutes les plateformes.** L'application se met
  désormais à jour toute seule.
  - **Bureau (Windows · Linux).** L'app vérifie au lancement, puis toutes les
    6 heures, s'il existe une nouvelle version publiée, la télécharge en arrière-plan
    et l'installe à la fermeture (ou propose un redémarrage immédiat). Couvre
    l'installeur Windows (NSIS) et l'AppImage Linux ; le paquet `.deb` reste géré
    par le gestionnaire de paquets du système.
  - **Android.** Une fois par lancement, l'app compare sa version à la dernière
    publiée ; si une mise à jour existe, elle propose de la télécharger et lance
    l'installation, sans passer par un magasin d'applications.

### Changed
- L'APK Android est désormais signé avec une clé de projet stable et sa version
  est calquée sur le tag de publication, ce qui permet aux mises à jour de
  s'installer proprement par-dessus l'installation existante.

## [1.5.1] - 2026-06-26

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
