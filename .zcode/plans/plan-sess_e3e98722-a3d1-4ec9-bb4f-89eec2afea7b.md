## Contexte — ce que j'ai trouvé en lisant le code

RAS sur les bases : `tsc --noEmit` passe, les workflows de release (desktop/Android/APT) existent et se déclenchent sur `git push tag v*`. Version actuelle `1.13.1`.

**Cause racine confirmée du bug de cover BMW (la "correction" 1.13.1 n'a jamais marché) :**
`src/server/library/art.ts:84` définit `ART_VARIANT_SIZES = [96, 160, 256, 384, 640]` — **il n'y a pas de bucket 512px**. Les 3 clients demandent `?w=512` (web `page.tsx:194`, Android `PlaybackService.kt:182` + `PlayerHolder.kt:254`), mais `readArtVariant(hash, 512)` (art.ts:133) retombe sur la branche "taille inconnue → renvoyer l'original pleine résolution", que BMW iDrive jette silencieusement. Donc la cover n'apparaît jamais.

**Cause racine confirmée du "ça crash et demande de reload" :**
Il n'existe **aucune React Error Boundary** dans tout `src/` (grep `componentDidCatch`/`getDerivedStateFromError` → 0). Une erreur levée pendant le rendu d'une rangée/cartes virtualisée fait planter tout l'app shell → l'utilisateur doit reload la page. C'est exactement le symptôme.

---

## Plan d'exécution (v1.14.0)

### 1. Fix cover BMW — ajouter le bucket 512px manquant
- `src/server/library/art.ts:84` : passer `ART_VARIANT_SIZES` de `[96,160,256,384,640]` à `[96,160,256,384,512,640]`. Les thumbnails 512px seront générés/cachés à la demande (le mécanisme `readArtVariant` existe déjà). C'est la correction unique qui fait fonctionner la cover sur tous les clients (web/Android/iOS) sans toucher au code client.
- Test : ajout d'un cas dans `test/art.test.ts` couvrant `readArtVariant(hash, 512)` → génère bien une variante webp 512.

### 2. Stop le crash → Error Boundary + robustesse scroll
- Nouveau `src/components/auralis/ErrorBoundary.tsx` : React class component (`getDerivedStateFromError` + `componentDidCatch`). Fallback sobre ("Une erreur est survenue dans cet onglet" + bouton **Réessayer** qui reset l'état via une `key` qui s'incrémente, + bouton **Recharger**). Capture l'erreur via `console.error`/le logger existant. **Plus de reload forcé** : on remonte un écran de secours au lieu d'un écran blanc.
- `src/app/page.tsx` : wrapper le `viewEl` (lignes ~690) dans `<ErrorBoundary key={view.view+view.id+retry}>` afin qu'un crash d'une vue (Library/Detail/Explore…) isole la casse à cette vue seulement, sans tuer la barre de lecture ni le panneau latéral.
- Wrapper aussi le `NowPlayingPanel` / `FullscreenPlayer` dans des boundaries séparés (panneau secondaire qui crash ne doit pas tuer le reste).
- Robustesse scroll (cause secondaire du "demande de reload") : dans `Virtualized.tsx`, ajouter un guard dans `measure()` quand `stride <= 0` ou `outerRef` non monté retourne sans `setRange` (déjà partiellement fait, je renforce), et faire que le reset scrollTop sur changement d'onglet (`LibraryView.tsx:112`) attende un `requestAnimationFrame` pour s'appliquer après le remontage de la liste (évite le blank space puis crash de la mesure).
- Vérifier que les `test/*.test.ts` passent toujours ; ajouter un test léger sur l'ErrorBoundary.

### 3. "Trop IA" — les 3 leviers (l'utilisateur a demandé "tout")

**3a. Branding/marketing "IA" → sobre (garder la fonction, retirer le côté "magique IA")**
- `src/store/player.ts` : `generateAiPlaylist` — toast "Création de votre Mix IA…" → "Création de votre mix…", "Mix IA « … » prêt" → "Mix « … » prêt", description playlist "Généré par l'IA d'après…" → "Mix personnalisé d'après ta sélection et tes goûts".
- `src/components/auralis/views/LibraryView.tsx:491` : bouton **Smart** avec icône `Sparkles` → garder l'icône mais la rendre moins clinquante, ou remplacer `Sparkles` par `Wand2`/`Sliders` (icône "réglages" plutôt que "étincelle magique"). Pareil pour le bouton multi-select → AI playlist.
- `src/components/auralis/SelectionBar.tsx` : retirer le terme "IA" / ✨ des libellés d'action.
- Ne touche PAS au moteur de reco (fonctionnalité réelle) — uniquement le wording/branding.

**3b. Fond animé (starfield/météores) → un réglage "Arrière-plan sobre"**
Hook propre confirmé par l'exploration : `ThemeBackdrop.tsx:38` est l'unique point de bascule (`theme.backdrop.kind`).
- `src/store/player.ts` : ajouter `flatBackdrop: boolean` (persisté comme `theme`).
- `src/components/auralis/ThemeBackdrop.tsx:38` : forcer `kind = "none"` quand `flatBackdrop` est actif (les `<div>` ne se montent pas → aucun paint, donc ni le CSS `globals.css:560-752` ni le canvas ne tournent). `--bg-solid` existe pour chaque thème (`themes.ts:110`) donc le rendu reste correct (verre transparent sur fond uni sobre).
- Écran Réglages (`DetailView.tsx` SettingsView) : un toggle **"Arrière-plan sobre"** sous le sélecteur de thème.
- Miroir Android : `ThemeBackdrop.kt:31` retour anticipé quand le réglage est actif (via Prefs). iOS : pas de backdrop, rien à faire.

**3c. Brillance/glow/reflets décoratifs**
- Le `TiltStage` est déjà nettoyé (le highlight spéculaire a été retiré en 1.13.0, TiltStage.tsx:99). Vérifier le reste : `Cards.tsx` (boutons play avec `shadow-[0_8px_16px…]` — gardés, c'est de la lisibilité, pas du clinquant), `VisualizerOverlay`, `BrandMark`. Passer un coup de balai ciblé sur les dégradés décoratifs + `text-shadow` sur texte qui "brille". Minimal et chirurgical.

### 4. Paroles + contrôle depuis le tel quand la musique joue sur le PC
Le hub Connect transporte déjà `trackhash` dans `NowPlaying` (`server/sync.ts:26`) et `RemoteControls` (`ConnectButton.tsx:141`) envoie déjà play/pause/next/prev/seek. Il manque juste les **paroles** côté contrôleur. L'utilisateur veut "les deux" : aperçu court dans le panneau Connect + bouton plein écran.

- `src/store/sync.ts` : ajouter `remoteLyricsOpen: boolean` + `toggleRemoteLyrics()`. Publier/consommer inchangé (le `trackhash` est déjà là).
- `src/components/auralis/ConnectButton.tsx` : dans `RemoteControls`, sous les boutons de transport, ajouter un aperçu paroles synchronisées (récup via `GET /api/lyrics/{trackhash}` existant) qui suit la position interpolée `livePos` + un bouton **"Paroles"** pour ouvrir le plein écran.
- Nouveau `src/components/auralis/RemoteLyricsOverlay.tsx` : plein écran (rendu au niveau racine dans `page.tsx` à côté de `FullscreenPlayer`) qui lit le `NowPlaying` du device contrôlé, fetch les paroles synchronisées, auto-scroll + surlignage ligne active (réutilise la logique de `LyricsView.tsx` mais branchée sur la position distante au lieu de l'`<audio>` local). Bouton fermer.
- `src/app/page.tsx` : monter `<RemoteLyricsOverlay />` quand `remoteLyricsOpen && controllingId`.
- L'endpoint paroles existe déjà et marche par `trackhash` (`/api/lyrics/[trackhash]`), rien à changer serveur.

### 5. Version, commit, tag, release (l'utilisateur a confirmé "v1.14.0 + tag + push")
- `package.json` : `1.13.1` → `1.14.0`.
- `CHANGELOG.md` : ajout entrée `[1.14.0]` résumant les 4 chantiers ci-dessus en français (format Keep a Changelog, cohérent avec l'existant).
- `npm run check` (lint + typecheck + build) doit être vert avant de pousser.
- `npm test` (les `test/*.test.ts`) doit passer.
- Commit sur `main` (la branche courante est déjà `main`), message du type "v1.14.0 : cover BMW, anti-crash/scroll, anti-IA, paroles & contrôle distants".
- Créer le tag `v1.14.0` et le pousser → déclenche `.github/workflows/release.yml` (build desktop Electron Windows/Linux + APK Android signé + un-draft + latest) puis `apt-repo.yml` (rebuild du dépôt APT sur GitHub Pages).
- Note : les workflows dépendent de secrets dépôt déjà configurés (`ANDROID_KEYSTORE_BASE64`, `APT_GPG_PRIVATE_KEY`, etc.) — je ne peux pas les vérifier ni les créer ; si un secret manque, le job correspondant échouera et je le signalerai dans le rendu.

---

## Vérification finale (audit de complétion avant de dire "fini")
Checklist que je respecterai avant de déclarer terminé :
1. `tsc --noEmit` vert.
2. `npm run lint` vert.
3. `npm run build` vert.
4. `npm test` vert (dont nouveau test `readArtVariant(...,512)`).
5. `grep -r "IA\|Sparkles" src/components` : branding IA retiré là où c'était décoratif.
6. Le bucket 512 présent dans `ART_VARIANT_SIZES`.
7. ErrorBoundary en place autour des vues + panneaux.
8. Réglage "Arrière-plan sobre" persistant + miroir Android.
9. RemoteLyricsOverlay + aperçu Connect fonctionnels (au moins typecheck + rendu logique).
10. `package.json` = 1.14.0, CHANGELOG à jour, tag `v1.14.0` poussé.

Ce que je **ne ferai pas** sans instruction supplémentaire : pousser un PAT codé en dur, modifier les secrets, ou toucher au moteur de recommandation (la vraie IA) — seul le branding/look change.