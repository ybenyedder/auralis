# Auralis — client iOS natif (SwiftUI)

Client iOS 100 % natif (SwiftUI + AVFoundation), miroir du client Android
(`android-native/`). Il consomme la **même API serveur** — aucune modification serveur
requise. Le serveur n'a besoin d'aucun changement pour le supporter.

## Ce qui est couvert

- **Connexion serveur** (URL auto-hébergée) → **login** (liste de comptes + mot de passe),
  jeton de session bearer stocké dans le **Keychain**.
- **Shell 3 onglets** : Accueil / Recherche / Bibliothèque, plus détails Album / Artiste /
  Playlist et Réglages.
- **Lecture en arrière-plan** (`AVPlayer` + `AVAudioSession`), intégration
  **Centre de contrôle / écran verrouillé** (`MPNowPlayingInfoCenter` +
  `MPRemoteCommandCenter`).
- **Lecteur plein écran** avec **paroles synchronisées** (surlignage à la ligne).
- Favoris / je-n'aime-pas, recommandations « Fait pour vous », recherche serveur (FTS),
  statistiques d'écoute, choix du thème (teinte d'accent).

Le jeton est attaché en en-tête `Authorization: Bearer …` sur le flux (`AVURLAsset`),
jamais en `?token=` — comme le client Android.

## Endpoints consommés

`/api/health`, `/api/auth/login|accounts`, `/api/library`, `/api/state` (GET + PUT :
`play` / `skip` / `favorite` / `dislike` / `setting`), `/api/stats`, `/api/recommend`,
`/api/search`, `/api/lyrics/{hash}`, `/api/stream/{filepath}` (bearer), `/api/art/{hash}`.

## Build

Le projet Xcode est **généré** depuis `project.yml` via [XcodeGen](https://github.com/yonaskolb/XcodeGen)
— pas de `.xcodeproj` maintenu à la main.

```bash
brew install xcodegen
cd ios-native
xcodegen generate
open Auralis.xcodeproj      # puis Run sur un appareil/simulateur
```

### CI

`.github/workflows/ios.yml` compile un **`.ipa` non signé** sur un runner macOS
(`xcodebuild … CODE_SIGNING_ALLOWED=NO`) et le publie en artefact. L'app ne peut pas
être compilée hors macOS.

### Installation

L'`.ipa` est **non signé** : installez-le par sideload (AltStore / Sideloadly) ou
re-signez-le avec votre compte développeur Apple dans Xcode. Pas de mise à jour in-app
(l'App Store / le sideload gère les mises à jour — l'équivalent de l'updater APK Android
est sans objet sur iOS).

## Structure

```
Auralis/
  App/       AuralisApp (entry), AppState (store + phase router)
  Model/     Models + tolerant JSON parsing
  Net/       AuralisAPI (URLSession, bearer)
  Store/     Prefs (UserDefaults) + Keychain (token)
  Playback/  AudioPlayer (AVPlayer + Now Playing/remote commands)
  UI/        Auth, Shell, Home, Search, Library, Detail, Settings, Player, Components, Theme
```
