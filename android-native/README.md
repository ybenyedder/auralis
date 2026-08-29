# Auralis — client Android natif (Kotlin / Jetpack Compose)

Réécriture **100 % native Kotlin** du client mobile, en remplacement de l'ancien
wrapper Capacitor (WebView). L'app se connecte à un serveur Auralis auto-hébergé
via la même API HTTP que le web, et lit l'audio **nativement** avec Media3/ExoPlayer.

## Pourquoi natif

- **Lecture en arrière-plan réelle** : un `MediaSessionService` + ExoPlayer gèrent
  le focus audio, la notification média et les contrôles de l'écran verrouillé.
  Cela remplace entièrement le bricolage `PARTIAL_WAKE_LOCK` du WebView (qui calait
  sur MIUI/HyperOS écran éteint).
- **UI Compose** fluide, thème « Oxide » partagé avec le web.
- **Zéro WebView, zéro JS embarqué** : du Kotlin de bout en bout.

## Stack

| Élément | Version |
|---|---|
| Gradle | 8.11.1 |
| Android Gradle Plugin | 8.9.1 |
| Kotlin | 2.1.0 (+ plugin Compose 2.1.0) |
| compileSdk / targetSdk | 36 |
| minSdk | 24 |
| Jetpack Compose | 1.9.1 |
| Material 3 | 1.5.0-alpha08 |
| Media3 (ExoPlayer + Session) | 1.8.0 |

JSON parsé avec `org.json` (intégré à Android) — pas de plugin de sérialisation.
Images chargées par un petit loader OkHttp maison (`NetworkImage`).

## Build

```bash
# depuis la racine du repo
npm run mobile:native            # build en ligne
AURALIS_OFFLINE=1 npm run mobile:native   # build hors-ligne (cache Gradle)
```

ou directement :

```bash
cd android-native
./gradlew assembleDebug
```

APK produit : `android-native/app/build/outputs/apk/debug/app-debug.apk`
(`applicationId` = `local.auralis.client`, identique à l'ancien client : l'APK
natif remplace l'app installée).

`local.properties` doit pointer le SDK : `sdk.dir=/chemin/vers/Android/Sdk`.

## Fonctionnement

1. **Écran Connexion** : saisis l'URL de ton serveur Auralis (LAN/VPS). Vérifiée
   via `/api/health`.
2. **Login** : identifiant + mot de passe → jeton de session (bearer) mémorisé.
   Au relancement, l'app saute directement à la bibliothèque.
3. **Bibliothèque** : `/api/library` (titres, albums, artistes, dossiers). État
   par utilisateur (favoris, playlists, récents, compteurs) via `/api/state`,
   statistiques via `/api/stats`.
4. **Lecture** : URL `/api/stream/...?token=` confiée à ExoPlayer (Range/seek natif),
   pochettes via `/api/art/...`. Scrobble déclenché après 30 s (ou 50 % du titre)
   d'écoute réelle, comme le web.
5. **Paroles** : `/api/lyrics/<trackhash>`, synchronisées avec surlignage karaoké.

## Architecture (`app/src/main/java/local/auralis/client/`)

- `model/` — modèles de données + parsing `org.json`
- `net/AuralisApi.kt` — client OkHttp (auth bearer, endpoints, URL stream/art)
- `data/Prefs.kt` — DataStore (serveur, jeton, préférences de lecture)
- `playback/` — `PlaybackService` (MediaSessionService) + `PlayerHolder` (MediaController)
- `ui/AppViewModel.kt` — machine d'état (équivalent du store `usePlayer` web)
- `ui/` — Compose : `AppRoot`, `Shell` (dock 4 onglets), écrans, lecteur, thème

L'ancien projet Capacitor (`android/`) reste en place mais n'est plus le client
de référence ; ce module natif le remplace.
