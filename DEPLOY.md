# Déployer Auralis sur un serveur

Guide d'auto-hébergement pour un petit VPS. L'objectif : installer en 4
commandes, mettre à jour en 1 commande, sauvegarder en 1 commande.

## ⚙️ Procédure de mise à jour COMPLÈTE (à suivre à chaque livraison)

> Pour toute nouvelle session de travail : quand on « met à jour », on met à
> jour **PARTOUT** — le dépôt, les releases GitHub, ET le serveur de
> production. Voici l'ordre exact :

1. **Code** : bump de `package.json` (version sémantique) + entrée dans
   `CHANGELOG.md` (format Keep a Changelog, français).
2. **Vérifications** (les deux doivent être vertes) :
   - Web : `npm run typecheck && npm run lint && npx vitest run`
   - Android : `cd android-native && JAVA_HOME=<JDK 17> ./gradlew --offline
     :app:compileFullDebugKotlin :app:testFullDebugUnitTest`
     (le JDK par défaut est souvent Java 8 → inutilisable ; et `--offline` car
     Google Maven est inaccessible depuis la machine de dev).
3. **Commit + push sur `main`**. NB : les tests vivent dans `test/` qui est
   gitignoré → `git add -f test/…` pour les nouveaux fichiers de test.
4. **Release** : tag annoté `vX.Y.Z` (DOIT être identique à la version de
   `package.json`, la CI échoue sinon) + `git push origin vX.Y.Z` → le
   workflow `release.yml` construit desktop (Linux + Windows), l'APK Android,
   l'AAB Play Store et l'IPA iOS, puis publie la release GitHub.
5. **Après les builds** (3 workflows : Desktop / Play Store AAB / iOS) :
   - rédiger les **notes de release** depuis la section `CHANGELOG.md`
     correspondante (via l'API GitHub — token dans le credential store git ;
     `PATCH /repos/<owner>/<repo>/releases/<id>` avec `{ body }`) ;
   - vérifier le marqueur **"latest"** : les workflows finissent parfois dans
     un ordre qui le pose sur l'avant-dernière version — le corriger
     (`make_latest: "true"` sur la dernière) ;
   - vérifier les **10 assets** (x64.exe, Setup.exe, AppImage, .deb, .apk,
     .aab, .ipa, blockmap, latest.yml, latest-linux.yml).
6. **Serveur de production** : suivre `deploy/PRODUCTION.local.md`
   (gitignoré — accès + commandes exactes) : `git pull` + rebuild de l'image
   `auralis:local` + recréation du conteneur + sonde `/api/health`.
   ⚠️ Ne jamais oublier cette étape : le serveur doit être à jour lui aussi, et
   ses **patchs locaux préservés** (détails dans le fichier).

Le reste de ce document décrit le déploiement générique (Docker compose).

## Prérequis

- Un VPS modeste suffit : 1 vCPU et 1 Go de RAM (prévoyez 2 Go de swap pour le
  confort des reconstructions d'image, voir « Dépannage »).
- Docker et son plugin Compose, installés depuis le dépôt officiel :
  https://docs.docker.com/engine/install/
- Un nom de domaine pointant vers le serveur, avec HTTPS. C'est indispensable
  pour installer la PWA sur mobile et pour publier l'application Android
  (voir PLAYSTORE.md) : Google et les navigateurs exigent HTTPS.
- Git pour récupérer le code (ou une archive du projet).

## Installation en 4 commandes

```bash
git clone https://github.com/ybenyedder/auralis.git /opt/auralis
cd /opt/auralis/deploy
cp .env.example .env && nano .env      # au minimum : AURALIS_ADMIN_PASSWORD
./update.sh
```


Le script `update.sh` crée les dossiers `music/` et `data/`, construit l'image
Docker puis démarre le service. À la fin il affiche l'état de santé. Si vous
lancez `./update.sh` sans avoir créé `.env`, il le crée et vous demande de
l'éditer avant de continuer.

Première connexion : ouvrez `http://IP-DU-SERVEUR:3000` et connectez-vous avec
le compte `admin` et le mot de passe défini dans `.env`, puis changez ce mot
de passe dans l'application (Paramètres). Copiez ensuite votre musique dans
`/opt/auralis/deploy/music/` : au premier démarrage sur base vide, le scan
démarre tout seul.

## Mise à jour (une commande)

```bash
cd /opt/auralis/deploy && ./update.sh
```

Le script fait tout : `git pull`, reconstruction de l'image, remplacement du
conteneur, nettoyage des vieilles images, contrôle de santé. Les données
(`music/` et `data/`) ne sont jamais touchées.

> ⚠️ **Téléchargements** (« Télécharger » depuis la recherche, import de
> playlists) : les titres atterrissent dans `<dossier musique>/Auralis
> Downloads`. Avec le montage par défaut (`./music:/music`) tout est persistant ;
> mais si vous ne montez que des **sous-dossiers** de `/music` (ex.
> `/music/ssd`), le dossier par défaut reste dans l'éphémère du conteneur et
> **disparaît à chaque mise à jour**. Dans ce cas, définissez
> `AURALIS_DOWNLOADS_DIR` sur un dossier monté (voir `deploy/.env.example`).
> Filet de sécurité : le serveur garde en base la liste de ses téléchargements
> et les re-télécharge automatiquement au démarrage s'ils ont disparu
> (`AURALIS_DOWNLOADS_RESTORE`, 3 tentatives par titre).

Pour une installation sans git (archive tarball) : `./update.sh --no-pull`
(reconstruit et redémarre sans toucher au code).

## Retour arrière

```bash
cd /opt/auralis
git checkout v1.17.0          # la version précédente voulue
cd deploy && ./update.sh --no-pull
```

Attention : les migrations SQLite s'appliquent automatiquement au démarrage et
ne reviennent jamais en arrière. Si la version plus ancienne est antérieure à
une migration déjà appliquée, restaurez aussi une sauvegarde de la base
(voir ci-dessous).

## Sauvegardes

```bash
cd /opt/auralis/deploy
./backup.sh                   # sauvegarde cohérente, serveur en ligne
./backup.sh list              # lister les sauvegardes
./backup.sh restore data/backups/auralis-20240101-030000.db
```

La sauvegarde passe par l'API de sauvegarde en ligne de SQLite : pas besoin
d'arrêter le serveur, l'image obtenue est cohérente. Les fichiers sont écrits
dans `deploy/data/backups/`, les 10 plus récents sont conservés.

Sauvegarde automatique chaque nuit à 3 h 17 (crontab -e) :

```
17 3 * * * cd /opt/auralis/deploy && ./backup.sh >> data/backups/cron.log 2>&1
```

Si le cron tourne sous un utilisateur non-root, celui-ci doit appartenir au
groupe `docker`. La restauration arrête brièvement le service, conserve
l'ancienne base en `.avant-restauration-...`, puis redémarre.

## Reverse proxy et HTTPS

Le plus simple : Caddy, qui obtient et renouvelle le certificat
automatiquement.

```
# /etc/caddy/Caddyfile
auralis.exemple.tld {
    reverse_proxy 127.0.0.1:3000
}
```

Avec nginx, tout proxy inverse classique fonctionne ; pensez à
`proxy_buffering off;` pour le suivi de scan en temps réel (SSE). Dans les
deux cas, si le proxy tourne sur la même machine, le port 3000 n'a pas besoin
d'être ouvert vers l'extérieur (voir « Sécurité réseau »).

Une fois le domaine en place, renseignez-le dans `deploy/.env` :

```
AURALIS_PUBLIC_URL=https://auralis.exemple.tld
```

puis relancez `./update.sh` — les aperçus de partage de liens (og:image) et
les métadonnées de l'app utiliseront la bonne URL. C'est aussi le prérequis
pour la publication Play Store (voir PLAYSTORE.md).

## Où sont les données

| Contenu                  | Côté serveur                 | Dans le conteneur |
|--------------------------|------------------------------|-------------------|
| Bibliothèque musicale    | `deploy/music/`              | `/music`          |
| Base SQLite              | `deploy/data/auralis.db`     | `/data/auralis.db`|
| Cache de pochettes       | `deploy/data/art/`           | `/data/art`       |
| Sauvegardes              | `deploy/data/backups/`       | `/data/backups`   |

Ajouter de la musique = copier des fichiers dans `deploy/music/` (rsync, scp,
SFTP...). Relancez ensuite un scan depuis l'application (Paramètres) ; pour
que chaque ajout/suppression soit détecté automatiquement, activez
`AURALIS_WATCH=1` dans `.env`. Les métadonnées, playlists et favoris vivent
dans la base SQLite, pas dans les fichiers.

## Musique sur NAS ou disque USB

Montez le partage côté serveur (par exemple dans `/mnt/nas/music` via
`/etc/fstab`), puis indiquez-le dans `docker-compose.yml` :

```yaml
    volumes:
      - /mnt/nas/music:/music
      - ./data:/data
```

Sur un montage réseau (NFS/SMB), les notifications de fichiers ne fonctionnent
pas : si vous voulez la surveillance automatique, activez dans `.env` :

```
AURALIS_WATCH=1
AURALIS_WATCH_POLL=1
```

## Surveillance au quotidien

```bash
docker compose ps              # état et santé (healthy) du conteneur
docker compose logs -f auralis # journaux en direct
curl -s http://127.0.0.1:3000/api/health
```

`/api/health` répond `ok`, ou `degraded` si la base est inaccessible ou si le
dossier musique est illisible (mauvais montage, mauvaises permissions) —
c'est le premier réflexe quand la bibliothèque apparaît vide.

## Sécurité réseau

N'ouvrez que les ports nécessaires : 22 (SSH), 80 et 443 (HTTP/HTTPS). Le
port 3000 n'a pas besoin d'être exposé si un reverse proxy tourne sur la
même machine ; vous pouvez même le limiter au loopback dans
`docker-compose.yml` :

```yaml
    ports:
      - "127.0.0.1:${AURALIS_PORT:-3000}:3000"
```

Exemple avec ufw : `ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable`.
Changez aussi le mot de passe admin initial et, si vous exposez l'API à
d'autres clients, définissez `AURALIS_TOKEN` dans `.env`.

## Dépannage rapide

- **Permission refusée sur `data/` ou `music/`** : le conteneur tourne sous
  l'utilisateur `node` (uid 1000). `sudo chown -R 1000:1000 data music`.
- **Le build échoue par manque de mémoire (VPS 1 Go)** : ajoutez du swap —
  ```
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
    && sudo mkswap /swapfile && sudo swapon /swapfile
  ```
  puis relancez `./update.sh`.
- **Le conteneur démarre mais `degraded`** : vérifiez le montage du dossier
  musique (`docker compose logs auralis` au démarrage) et les permissions.
- **Changer le port d'écoute** : `AURALIS_PORT=8080` dans `.env`, puis
  `./update.sh --no-pull` ; adaptez le reverse proxy si besoin.
