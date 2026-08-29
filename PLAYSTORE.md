# Publier l'application Android sur le Google Play Store

Auralis est une PWA : l'application Android est une « coquille » (TWA,
Trusted Web Activity) qui affiche votre serveur Auralis sans barre d'adresse,
en mode plein écran. Pas de code natif à écrire : PWABuilder fabrique le
paquet Android à partir de votre URL.

## Étape 0 — Serveur HTTPS et domaine

Indispensable avant tout le reste (voir DEPLOY.md) : un domaine en HTTPS
(ex. https://musique.exemple.tld), servi par Auralis. Google exige HTTPS pour
les PWA installables et pour la vérification des liens numériques. Notez
l'URL exacte : c'est elle qui deviendra l'adresse de l'application.

## Étape 1 — Générer le paquet Android avec PWABuilder (option recommandée, zéro code)

1. Ouvrez https://www.pwabuilder.com
2. Entrez l'URL de votre serveur (https://musique.exemple.tld) puis
   « Start ». Le manifeste PWA d'Auralis est déjà complet (nom, icônes,
   mode standalone) : le score devrait être au vert. Corrigez au besoin ce
   que l'outil signale sur le serveur, puis relancez `./update.sh`.
3. Cliquez « Package for stores » puis « Android ».
4. Options conseillées : « Signed APK » ou « App Bundle (AAB) » — les valeurs
   par défaut (nom, icône, couleurs) reprennent le manifeste ; vous pouvez
   ajuster le « Package ID » (voir ci-dessous) et la version.
5. Téléchargez le paquet : vous obtenez un fichier `.apk`/`.aab` (et,
   si PWABuilder a généré la clé, un fichier `.keystore`).

**Package ID** : l'identifiant unique de l'application sur le Play Store, en
notation inversée, par exemple `com.exemple.auralis`. Il est définitif :
impossible à changer après la première publication.

## Étape 2 — La clé de signature (keystore)

Le paquet Android doit être signé. Deux possibilités :

- **PWABuilder génère la clé pour vous** : au moment du téléchargement,
  choisissez « Generate new ». Conservez précieusement le fichier
  `.keystore` téléchargé et ses deux mots de passe.
- **Vous créez votre clé vous-même** (Java requis) :

```bash
keytool -genkeypair -v \
  -keystore auralis.keystore -alias auralis \
  -keyalg RSA -keysize 2048 -validity 10000
```

Règle absolue : **le même keystore doit signer toutes les mises à jour** de
l'application, pour toujours. Si vous le perdez, vous ne pouvez plus mettre à
jour l'application existante et vous perdez votre base d'utilisateurs
(classements, avis, mises à jour automatiques). Faites-en au moins deux
sauvegardes dans des endroits différents (coffre-fort numérique, clé USB).
Notez aussi les mots de passe.

## Étape 3 — Le fichier assetlinks.json (vérification app/serveur)

C'est le mécanisme qui prouve à Google que votre application Android a le
droit d'ouvrir votre site sans barre d'adresse : le serveur doit publier une
déclaration sur `https://votre-domaine/.well-known/assetlinks.json`.

**Empreinte à utiliser** : si vous publiez un AAB (recommandé, obligatoire
pour les nouvelles applications), Google re-signe le paquet avec sa propre
clé. L'empreinte à déclarer est donc celle affichée dans la Play Console
après le premier téléversement : Play Console → Version → Configuration →
« Clés de signature d'application » → certificat SHA-256. Avec un APK signé
par votre propre clé (Play App Signing désactivé), utilisez l'empreinte de
votre keystore :

```bash
keytool -list -v -keystore auralis.keystore -alias auralis
# ligne « SHA256: »
```

Deux façons de servir la déclaration chez Auralis (choisissez UNE seule) :

**a) Par variables d'environnement (recommandé)** — dans `deploy/.env` :

```
AURALIS_PLAYSTORE_PACKAGE=com.exemple.auralis
AURALIS_PLAYSTORE_FINGERPRINT=AA:BB:CC:...(empreinte SHA-256)
```

Puis `./update.sh --no-pull` pour recréer le conteneur. La route
`/.well-known/assetlinks.json` sert alors la déclaration (les deux-points et
les majuscules sont acceptés : l'empreinte est normalisée automatiquement).
Sans ces variables, la route répond 404 — aucune déclaration mensongère.

**b) Par fichier statique** — déposez votre déclaration dans
`public/.well-known/assetlinks.json` dans le dépôt, puis `./update.sh`.

Vérification :

- `curl -s https://musique.exemple.tld/.well-known/assetlinks.json` doit
  renvoyer le JSON avec votre package et votre empreinte ;
- ou https://developers.google.com/digital-asset-links/tools/generator :
  entrez le domaine, le package et l'empreinte, l'outil confirme si la
  déclaration est bien lisible ;
- sur un téléphone de test : si la barre d'URL apparaît quand même, lancez
  `adb logcat | grep -i asset` — un message « Statement not found » indique
  une empreinte ou un package qui ne correspond pas.

## Étape 4 — Publier sur la Play Console

1. Créez un compte développeur : https://play.google.com/console (frais
   uniques de 25 USD).
2. « Créer une application » : nom (Auralis), langue (Français), type
   (Application).
3. Téléversez votre AAB/APK dans une piste de test d'abord (voir ci-dessous),
   puis complétez les éléments obligatoires de la fiche :
   - **Description courte** (80 caractères max) :
     « Votre musique, votre serveur : lecteur auto-hébergé, privé, haute-fidélité. »
   - **Description complète** (proposition ci-dessous).
   - **Captures d'écran** : au moins 4 pour téléphone (PNG/JPEG, format
     téléphone 9:16 ou 16:9). Le dépôt en fournit dans `public/screenshots/`.
   - **Icône** (512 x 512) et **image bannière** (1024 x 500). Le dépôt
     fournit déjà la bannière prête à téléverser : `public/feature-graphic.png`
     (générée par `bun scripts/gen-brand-assets.mjs`, mêmes couleurs de marque
     que le logo et la carte OG).
   - **Politique de confidentialité** : une URL est exigée. Hébergez une page
     simple expliquant qu'aucune donnée n'est collectée (l'application ne
     communique qu'avec votre propre serveur).
4. **Data safety** (sécurité des données) : répondez « Non » partout —
   aucune donnée n'est collectée ni partagée ; l'application ne parle qu'à
   votre serveur.
5. **Classification du contenu** : questionnaire rapide, aucun contenu
   sensible → « Tous publics ». Public cible : 13 ans et plus.
6. **Tests fermés d'abord** : créez une piste « Test interne », ajoutez les
   adresses e-mail de vos testeurs, partagez le lien d'inscription.
   Important : les comptes développeur personnels récents doivent faire
   tester l'application par au moins 12 testeurs pendant 14 jours en test
   fermé avant de pouvoir publier en production.
7. Une fois la fiche complète : « Envoyer pour examen » → production. La
   première validation prend généralement de quelques heures à quelques
   jours.

### Proposition de description complète (à adapter)

> Auralis transforme votre serveur en plateforme musicale privée, pour vous
> et votre famille. Vos fichiers restent chez vous : aucune publicité, aucun
> traqueur, aucun compte à créer chez un tiers.
>
> Votre bibliothèque, simplement mieux rangée :
> - Lecture en streaming directe depuis votre serveur, en haute fidélité
>   (FLAC, MP3, OGG, WAV...) ;
> - Paroles synchronisées ligne à ligne, jusqu'au karaoké mot à mot quand
>   les données sont disponibles ;
> - Recommandations et mixes automatiques construits sur VOS écoutes, sans
>   aucun envoi de données à l'extérieur ;
> - Playlists, favoris et historique multi-comptes : chacun son espace ;
> - Radio intelligente, minuteur de sommeil, mode sombre ;
> - Interface fluide et native, pensée pour le téléphone.
>
> Auralis est le lecteur de musique des audiophiles qui veulent garder la
> main sur leur bibliothèque : vous hébergez, vous contrôlez.
>
> Prérequis : cette application nécessite votre propre serveur Auralis
> (auto-hébergé). Configuration en quelques minutes sur n'importe quel
> petit VPS : https://github.com/ybenyedder/auralis

## Étape 5 — Mettre à jour l'application Android

Le gros avantage du format TWA : **la quasi-totalité des mises à jour se fait
côté serveur, sans repasser par le Play Store**. L'application Android est
une coquille qui charge votre site : nouvelles fonctions, corrections
d'interface, nouveaux mixes... déployez avec `./update.sh` et tous les
utilisateurs les voient immédiatement, comme sur le web.

Une nouvelle soumission Play Store n'est nécessaire que pour ce qui touche
la coquille elle-même : icône, nom, package, URL de démarrage, permissions,
ou un nouveau `versionCode`. Dans ce cas :

1. Rouvrez PWABuilder, même URL, mêmes options ;
2. Incrémentez « versionCode » (1, 2, 3...) et au besoin « version name » ;
3. **Même keystore que la publication d'origine** — sinon Google refuse la
   mise à jour ;
4. Téléversez le nouveau paquet sur la même application, même piste, puis
   progressez vers la production.
