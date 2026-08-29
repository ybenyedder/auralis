# Politique de confidentialité — Auralis / Privacy Policy

> Date d'entrée en vigueur / Effective date : 30 août 2026
>
> Cette politique s'applique à l'application Android **Auralis** (package
> `local.auralis.client`) et à toute interface client Auralis présente dans ce
> dépôt. This policy applies to the Android **Auralis** app and to any Auralis
> client shipped in this repository.

---

## 1. Principe : votre musique, votre serveur

Auralis est un lecteur **auto-hébergé** : l'application ne fonctionne qu'en
se connectant au serveur Auralis que **vous** (ou l'administrateur que vous
désignez) exploitez sur votre propre machine. L'application ne communique
avec **aucun serveur de l'éditeur** et ne contient **aucun traceur**.

Auralis is a **self-hosted** player: the app only works by connecting to the
Auralis server that **you** operate. It communicates with **no developer
server** and contains **no trackers**.

## 2. Données stockées sur votre appareil

L'application enregistre localement, uniquement pour fonctionner :

- l'**adresse de votre serveur** (URL que vous saisissez vous-même) ;
- votre **identifiant** et votre **mot de passe / jeton de session**,
  conservés dans le stockage privé de l'application.

Ces données :

- ne quittent votre appareil que pour vous authentifier auprès de **votre
  propre serveur** ;
- sont supprimées lors de la **déconnexion** dans l'application ;
- sont supprimées lors de la **désinstallation** de l'application.

The app stores locally, solely to operate: your **server URL** (that you
enter yourself) and your **username / session token**, kept in the app's
private storage. They only ever leave the device to authenticate against
**your own server**, and are deleted on logout or uninstall.

## 3. Données transmises

Toutes les requêtes (authentification, bibliothèque, lecture, position de
lecture, favoris) sont envoyées **exclusivement au serveur que vous avez
configuré**. Aucune donnée n'est transmise à l'éditeur ni à un tiers.

All requests go **exclusively to the server you configured**. No data is
sent to the developer or any third party.

## 4. Vérification des mises à jour (github.com)

L'application peut vérifier l'existence d'une nouvelle version en
interrogeant l'API publique de **GitHub** (`github.com/ybenyedder/auralis`,
releases). Cette requête ne contient **aucune donnée personnelle** et ne
transmet ni identifiant, ni statistiques d'utilisation. Elle peut être
ignorée si vous désactivez la recherche de mises à jour.

The app may check for updates against the public **GitHub** API of this
repository. That request carries **no personal data** and no usage
statistics.

## 5. Autorisations Android utilisées

| Autorisation | Usage |
|---|---|
| `INTERNET` | Communiquer avec votre serveur Auralis |
| `POST_NOTIFICATIONS` | Afficher les commandes de lecture (notification média) |
| `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Lecture audio en arrière-plan |
| `WAKE_LOCK` | Maintenir la lecture pendant que l'écran est éteint |
| `REQUEST_INSTALL_PACKAGES` | Mise à jour de l'application par elle-même (APK signé issu des releases GitHub), optionnelle |

Aucune autre autorisation sensible (contacts, position, micro, caméra,
stockage partagé) n'est demandée.

No other sensitive permission (contacts, location, microphone, camera,
shared storage) is requested.

## 6. Absence de publicité, d'analyse et de profilage

L'application ne contient **aucun** : publicité, SDK d'analytique, SDK
publicitaire, profilage, empreinte de l'appareil.

The app contains **no** ads, analytics SDKs, ad SDKs, profiling or device
fingerprinting.

## 7. Côté serveur (responsabilité de l'opérateur)

Le serveur Auralis est exploité par vous-même : ses journaux et ses données
(bibliothèque, comptes) restent sur **votre** machine et ne sont accessibles
qu'à vous. La récupération facultative de paroles en ligne (LRCLIB), si
activée, est effectuée par **votre serveur** et régie par la configuration
que vous choisissez.

The server is operated by you: its logs and data stay on **your** machine.
Optional online lyrics fetching (LRCLIB), if enabled, is performed by
**your** server under your own configuration.

## 8. Enfants

L'application n'est pas destinée aux enfants de moins de 13 ans et ne
collecte sciemment aucune donnée les concernant.

The app is not directed at children under 13.

## 9. Contact

Signalements et questions : https://github.com/ybenyedder/auralis/issues
