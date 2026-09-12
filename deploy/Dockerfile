# =============================================================================
# Auralis — image de production (sortie "standalone" de Next.js)
# -----------------------------------------------------------------------------
# Construction :   docker compose build        (depuis le dossier deploy/)
# Contexte de build : la racine du projet (voir "context: .." dans
#                     docker-compose.yml ; le fichier .dockerignore à la racine
#                     filtre music/, data/, .git, node_modules, les .env...)
# =============================================================================

# -----------------------------------------------------------------------------
# Étape 1 / 2 : construction de l'application
# -----------------------------------------------------------------------------
FROM node:22-slim AS builder

# Chaîne de compilation pour better-sqlite3 : le module natif propose des
# binaires précompilées pour linux/amd64 et linux/arm64, mais si aucune ne
# correspond (autre architecture, glibc trop ancienne...) npm doit pouvoir
# recompiler depuis les sources. Ces outils restent dans l'étape de build,
# ils n'alourdissent pas l'image finale.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances d'abord, dans une couche dédiée : tant que package.json ne
# change pas, Docker rejoue ce cache au lieu de retélécharger les paquets.
# `npm ci` avec le lockfile commis : builds reproductibles et versions
# exactement celles testées — un `npm install` résolu à la volée laissait une
# dépendance compromise ou cassante entrer sur le serveur de fichiers.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Pas de télémétrie Next.js pendant le build.
ENV NEXT_TELEMETRY_DISABLED=1

# Sources de l'application. Le .dockerignore de la racine exclut les dossiers
# volumineux ou locaux (music/, data/, .git, node_modules, .env*, skills/...).
COPY . .

# Produit .next/standalone/ (server.js autonome + node_modules tracés),
# .next/static/ et les assets pré-rendus. Les types sont vérifiés pendant
# le build : une erreur TypeScript fait échouer l'image (voulu).
RUN npm run build

# -----------------------------------------------------------------------------
# Étape 2 / 2 : image d'exécution minimale
# -----------------------------------------------------------------------------
FROM node:22-slim AS runner

# dumb-init : transmet proprement SIGTERM/SIGINT au processus Node. Auralis
# s'en sert pour fermer la base SQLite proprement (checkpoint WAL) lors d'un
# `docker stop` ou d'une mise à jour.
# ffmpeg : requis par l'analyse audio (BPM, énergie, humeur) et l'alignement
# des paroles — sans lui le serveur démarre mais dégrade silencieusement la
# recommandation et le karaoké.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /music /data \
    && chown -R node:node /music /data

# Volumes montés par docker-compose.yml : /music (bibliothèque) et /data
# (base SQLite, cache pochettes, sauvegardes). Créés dans la couche ci-dessus
# pour appartenir à l'utilisateur non-root "node" (uid 1000) si le montage
# arrive vide.
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    AURALIS_MUSIC_DIR=/music \
    AURALIS_DATA_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1

# Sortie autonome de Next.js : server.js + les node_modules strictement
# nécessaires (dont le binaire better-sqlite3 compilé à l'étape précédente).
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Bundles statiques du client et dossier public (icônes PWA, robots.txt...).
# Les deux sont servis par server.js depuis son propre répertoire.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Migrations SQLite : lues au démarrage depuis <répertoire de travail>/migrations
# (src/server/db.ts). Le traceur de fichiers de Next.js ne les embarque pas
# (accès dynamique au système de fichiers), il faut donc les copier
# explicitement sinon la base n'est jamais créée.
COPY --from=builder --chown=node:node /app/migrations ./migrations

# Jamais root.
USER node

EXPOSE 3000

# Sonde de santé : l'API publique /api/health répond 200 tant que le serveur
# sert des requêtes. Node 22 fournit fetch en global, aucun outil de plus.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
