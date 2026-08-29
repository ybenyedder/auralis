# syntax=docker/dockerfile:1
# Auralis — image de production (Next.js standalone). Générée pour l'hébergement Ptero.
# Node 22 partagé build/runtime (ABI better-sqlite3).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
RUN npm ci
COPY . .
# Build mémoire-borné (volthost : 3 Go libres).
ENV NODE_OPTIONS=--max-old-space-size=2560
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=4237 \
    AURALIS_DATA_DIR=/data \
    AURALIS_MUSIC_DIR=/music
# Sortie standalone + assets statiques + public.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /data /music && chown -R node:node /data /music
USER node
EXPOSE 4237
VOLUME ["/data", "/music"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
