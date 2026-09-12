#!/usr/bin/env bash
# =============================================================================
# Auralis — mise à jour du serveur en une commande
# -----------------------------------------------------------------------------
# Usage (depuis le dossier deploy/, ou depuis la racine via npm run deploy:up) :
#     ./update.sh             git pull + reconstruction + redémarrage du service
#     ./update.sh --no-pull   ignorer git (installation par archive/tarball)
#
# Ce que fait le script :
#   1. récupère la dernière version du code (git pull --ff-only) ;
#   2. reconstruit l'image Docker (docker compose build --pull) ;
#   3. remplace le conteneur en cours (docker compose up -d) ;
#   4. supprime les vieilles images devenues inutiles ;
#   5. attend que le service réponde à nouveau (sonde /api/health).
#
# Les données (./music et ./data) ne sont PAS touchées : elles vivent en dehors
# du conteneur, une mise à jour ne supprime ni la bibliothèque ni la base.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

# --- Paramètres --------------------------------------------------------------

DO_GIT_PULL=1
case "${1:-}" in
  "") ;;
  --no-pull) DO_GIT_PULL=0 ;;
  -h|--help)
    cat <<'EOF'
Usage : ./update.sh [--no-pull]

Met à jour Auralis : git pull (si applicable), reconstruction de l'image
Docker, redémarrage du service, nettoyage des anciennes images, contrôle
de santé. Les données (./music, ./data) ne sont jamais touchées.

Options :
  --no-pull   ignorer l'étape git (installation par archive/tarball)
EOF
    exit 0
    ;;
  *)
    echo "ERREUR : option inconnue « ${1} »." >&2
    echo "Usage : ./update.sh [--no-pull]" >&2
    exit 1
    ;;
esac

# --- Vérifications -----------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  echo "ERREUR : docker est introuvable. Installez-le puis relancez (voir DEPLOY.md)." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERREUR : le plugin « docker compose » est absent (Docker doit être récent)." >&2
  exit 1
fi

# --- Premier lancement : préparation de .env ---------------------------------

if [ ! -f .env ]; then
  cp .env.example .env
  cat >&2 <<'EOF'

AVERTISSEMENT : aucun fichier .env n'existait.
Un fichier de configuration par défaut vient d'être créé : deploy/.env

Éditez-le pour définir AU MINIMUM le mot de passe administrateur
(AURALIS_ADMIN_PASSWORD), puis relancez ./update.sh.

EOF
  exit 1
fi

# --- Dossiers de données (avant Docker, pour qu'ils appartiennent à
# l'utilisateur courant et non à root) ----------------------------------------

mkdir -p music data data/backups

# --- 1. Mise à jour du code --------------------------------------------------

if [ "$DO_GIT_PULL" = "1" ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "AVERTISSEMENT : git est introuvable — étape git ignorée."
  elif ! git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "AVERTISSEMENT : $REPO_DIR n'est pas un dépôt git — étape git ignorée."
  else
    OLD_COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo inconnu)"
    echo "Récupération des dernières modifications..."
    git -C "$REPO_DIR" fetch --quiet

    if git -C "$REPO_DIR" rev-parse --verify --quiet '@{u}' >/dev/null 2>&1; then
      INCOMING="$(git -C "$REPO_DIR" rev-list --count 'HEAD..@{u}')"
      if [ "$INCOMING" -gt 0 ]; then
        echo "Version actuelle : $OLD_COMMIT — $INCOMING nouveau(x) commit(s) disponible(s) :"
        git -C "$REPO_DIR" log --oneline 'HEAD..@{u}' | head -n 5
        if [ "$INCOMING" -gt 5 ]; then
          echo "  ... et $((INCOMING - 5)) autres"
        fi
      else
        echo "Version actuelle : $OLD_COMMIT — code déjà à jour."
      fi
    fi

    if ! git -C "$REPO_DIR" pull --ff-only; then
      echo "ERREUR : git pull --ff-only a échoué." >&2
      echo "Des modifications locales divergent probablement du dépôt distant." >&2
      echo "Résolvez le conflit à la main (git -C $REPO_DIR status) puis relancez." >&2
      exit 1
    fi
    NEW_COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo inconnu)"
    echo "Code en place : $NEW_COMMIT (ancien : $OLD_COMMIT)"
  fi
else
  echo "Option --no-pull : étape git ignorée."
fi

# --- 2. Reconstruction de l'image --------------------------------------------

echo "Reconstruction de l'image Docker (cela peut prendre quelques minutes)..."
docker compose build --pull

# --- 3. Redémarrage du service ----------------------------------------------

echo "Redémarrage du service..."
# Sauvegarde de la base AVANT l'upgrade : les migrations sont forward-only,
# un retour arrière sans ce fichier serait une perte de données sèche.
if [ -x ./backup.sh ]; then
  echo "Sauvegarde pré-mise à jour..."
  ./backup.sh || echo "ATTENTION : la sauvegarde a échoué — l'upgrade continue quand même."
fi
docker compose up -d --remove-orphans

# --- 4. Nettoyage des anciennes images ---------------------------------------

# Ne purge que les images pendantes du projet compose (pas celles de tout
# l'hôte — un serveur Docker partagé aurait des surprises).
docker image prune -f --filter "label=com.docker.compose.project=auralis" >/dev/null
echo "Anciennes images supprimées."

# --- 5. Attente du retour en service -----------------------------------------

echo "Attente du démarrage (sonde /api/health)..."
STATUS="unknown"
for _ in $(seq 1 45); do
  STATUS="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' auralis 2>/dev/null || echo absent)"
  if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "unhealthy" ]; then
    break
  fi
  sleep 2
done

echo
if [ "$STATUS" = "healthy" ]; then
  echo "Mise à jour terminée : Auralis répond et est en bonne santé."
else
  echo "AVERTISSEMENT : état du conteneur « $STATUS » après 90 secondes."
  echo "Consultez les journaux : docker compose logs -f auralis"
fi
echo
echo "Journaux en direct :   docker compose logs -f auralis"
echo "État du service :      docker compose ps"
echo "Sauvegarde de la base : ./backup.sh"
