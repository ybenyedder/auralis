#!/bin/bash
# Auralis — wrapper de démarrage Pterodactyl.
#
# Lance `next start`. Quand l'alignement forcé est activé
# (AURALIS_LYRICS_FORCED_ALIGN=true), il se contente de CÂBLER l'environnement vers
# les dépendances déjà installées par le script d'installation de l'egg DANS le
# dossier data/ (qui survit aux reinstalls : `git clean` préserve music/ et data/).
# Le boot reste donc rapide ; rien n'est téléchargé ici.
#
# Tout vit sous data/ pour survivre à un Reinstall :
#   data/pydeps       -> torch / torchaudio / demucs (pip --target)
#   data/bin/ffmpeg   -> ffmpeg statique (conteneur runtime non-root)
#   data/torch-cache  -> modèle MMS_FA (~1,2 Go) en cache (pas de re-DL au reinstall)
set -u

cd "$(dirname "$0")/.." 2>/dev/null || true   # racine du repo (= /home/container)

PORT="${SERVER_PORT:-${AURALIS_PORT:-3000}}"
DATA_DIR="${AURALIS_DATA_DIR:-/home/container/data}"

if [ "${AURALIS_LYRICS_FORCED_ALIGN:-false}" = "true" ]; then
  export PYTHONPATH="$DATA_DIR/pydeps${PYTHONPATH:+:$PYTHONPATH}"
  export PATH="$DATA_DIR/bin:$PATH"
  export TORCH_HOME="$DATA_DIR/torch-cache"
  export AURALIS_PYTHON="${AURALIS_PYTHON:-python3}"
  # Garde-fou : si les deps ne sont pas là (ex. activé sans reinstall, ou install
  # ratée), on neutralise la fonctionnalité pour ce boot pour que le job serveur
  # ne tente pas de lancer un Python/ffmpeg incomplet. Le serveur démarre normalement.
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import torch, torchaudio' >/dev/null 2>&1 \
     && command -v ffmpeg >/dev/null 2>&1; then
    echo '[forced-align] dépendances prêtes — karaoké mot-à-mot actif après le prochain scan.'
  else
    echo '[forced-align] dépendances absentes/incomplètes — désactivé pour ce boot. Activez la variable PUIS faites un Reinstall.'
    export AURALIS_LYRICS_FORCED_ALIGN=false
  fi
fi

exec npx --no-install next start -H 0.0.0.0 -p "$PORT"
