#!/bin/bash
# Auralis — wrapper de démarrage Pterodactyl.
#
# Lance `next start`. Deux fonctionnalités optionnelles s'appuient sur des
# dépendances Python installées par le script d'installation de l'egg DANS le
# dossier data/ (qui survit aux reinstalls : `git clean` préserve music/ et data/) :
#   • AURALIS_LYRICS_FORCED_ALIGN=true → karaoké mot-à-mot (torch/torchaudio + MMS_FA)
#   • AURALIS_EMBEDDINGS=1             → embeddings audio profonds (librosa / OpenL3,
#                                        + Demucs si AURALIS_STEMS=1) pour la reco
# Ce script se contente de CÂBLER l'environnement vers ces deps déjà installées ;
# rien n'est téléchargé ici, le boot reste rapide.
#
# Tout vit sous data/ pour survivre à un Reinstall :
#   data/pydeps       -> deps Python (torch/torchaudio/demucs + librosa/openl3)
#   data/bin/ffmpeg   -> ffmpeg statique (conteneur runtime non-root, si fourni)
#   data/torch-cache  -> modèles ML (ex. MMS_FA ~1,2 Go) en cache (pas de re-DL)
set -u

cd "$(dirname "$0")/.." 2>/dev/null || true   # racine du repo (= /home/container)

PORT="${SERVER_PORT:-${AURALIS_PORT:-3000}}"
DATA_DIR="${AURALIS_DATA_DIR:-/home/container/data}"

# Le forced-align ET l'extracteur d'embeddings utilisent les deps sous data/pydeps.
# On câble l'environnement une seule fois si l'une des deux fonctionnalités est active.
NEED_PYDEPS=false
[ "${AURALIS_LYRICS_FORCED_ALIGN:-false}" = "true" ] && NEED_PYDEPS=true
[ "${AURALIS_EMBEDDINGS:-0}" = "1" ] && NEED_PYDEPS=true
if [ "$NEED_PYDEPS" = "true" ]; then
  export PYTHONPATH="$DATA_DIR/pydeps${PYTHONPATH:+:$PYTHONPATH}"
  export PATH="$DATA_DIR/bin:$PATH"
  export TORCH_HOME="$DATA_DIR/torch-cache"
  export AURALIS_PYTHON="${AURALIS_PYTHON:-python3}"
fi

# Garde-fou forced-align : si les deps ne sont pas là (activé sans reinstall, ou
# install ratée), on neutralise la fonctionnalité pour ce boot pour que le serveur
# ne tente pas de lancer un Python/ffmpeg incomplet. Le serveur démarre normalement.
if [ "${AURALIS_LYRICS_FORCED_ALIGN:-false}" = "true" ]; then
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import torch, torchaudio' >/dev/null 2>&1 \
     && command -v ffmpeg >/dev/null 2>&1; then
    echo '[forced-align] dépendances prêtes — karaoké mot-à-mot actif après le prochain scan.'
  else
    echo '[forced-align] dépendances absentes/incomplètes — désactivé pour ce boot. Activez la variable PUIS faites un Reinstall.'
    export AURALIS_LYRICS_FORCED_ALIGN=false
  fi
fi

# Garde-fou embeddings : même logique. On vérifie que le backend choisi s'importe
# (librosa par défaut, openl3 si demandé) avant de laisser l'extracteur se lancer.
if [ "${AURALIS_EMBEDDINGS:-0}" = "1" ]; then
  if [ "${AURALIS_OPENL3:-0}" = "1" ]; then EMB_MOD='openl3'; else EMB_MOD='librosa'; fi
  if command -v python3 >/dev/null 2>&1 && python3 -c "import ${EMB_MOD}" >/dev/null 2>&1; then
    echo "[embeddings] backend ${EMB_MOD} prêt — extraction du timbre après le prochain scan (ou POST /api/library/analyze)."
  else
    echo '[embeddings] dépendances absentes/incomplètes — désactivé pour ce boot. Activez la variable PUIS faites un Reinstall.'
    export AURALIS_EMBEDDINGS=0
  fi
fi

exec npx --no-install next start -H 0.0.0.0 -p "$PORT"
