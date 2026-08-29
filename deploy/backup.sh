#!/usr/bin/env bash
# =============================================================================
# Auralis — sauvegarde et restauration de la base de données
# -----------------------------------------------------------------------------
# Usage (depuis le dossier deploy/, ou depuis la racine via npm run deploy:backup) :
#     ./backup.sh                          créer une sauvegarde cohérente
#                                          (le serveur reste en ligne)
#     ./backup.sh restore <fichier>        restaurer une sauvegarde
#                                          (arrête puis relance le service)
#     ./backup.sh restore --oui <fichier>  restaurer sans demande de confirmation
#     ./backup.sh list                     lister les sauvegardes disponibles
#
# Comment ça marche :
#   La sauvegarde utilise l'API de sauvegarde en ligne de SQLite (via le module
#   better-sqlite3 déjà présent dans le conteneur) : l'image de la base est
#   cohérente même si le serveur écrit pendant l'opération. Copier simplement
#   le fichier auralis.db à chaud serait incorrect (données encore dans le
#   journal WAL).
#
#   Les sauvegardes sont écrites dans ./data/backups/ (côté serveur) et les
#   10 plus récentes sont conservées.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DB_HOST_PATH="data/auralis.db"     # côté serveur (monté dans le conteneur sur /data/auralis.db)
BACKUP_DIR="data/backups"
KEEP=10

usage() {
  cat <<'EOF'
Usage : ./backup.sh [commande]

  (aucune)                   créer une sauvegarde (serveur en ligne)
  restore <fichier>          restaurer une sauvegarde (arrêt temporaire du service)
  restore --oui <fichier>    idem, sans demande de confirmation
  list                       lister les sauvegardes disponibles
EOF
}

die() {
  echo "ERREUR : $*" >&2
  exit 1
}

# --- Vérifications communes --------------------------------------------------

command -v docker >/dev/null 2>&1 || die "docker est introuvable. Installez-le puis relancez (voir DEPLOY.md)."
docker compose version >/dev/null 2>&1 || die "le plugin « docker compose » est absent (Docker doit être récent)."
[ -f .env ] || die "aucun fichier deploy/.env — lancez d'abord ./update.sh."

# -----------------------------------------------------------------------------
# Mode « restore »
# -----------------------------------------------------------------------------
if [ "${1:-}" = "restore" ]; then
  shift
  CONFIRM=0
  if [ "${1:-}" = "--oui" ]; then
    CONFIRM=1
    shift
  fi
  [ $# -ge 1 ] || { usage; exit 1; }
  BACKUP_FILE="$1"

  [ -f "$BACKUP_FILE" ] || die "le fichier « $BACKUP_FILE » n'existe pas."
  [ -s "$BACKUP_FILE" ] || die "le fichier « $BACKUP_FILE » est vide."
  # Un fichier SQLite commence toujours par la même signature ASCII.
  [ "$(head -c 15 "$BACKUP_FILE")" = "SQLite format 3" ] \
    || die "« $BACKUP_FILE » n'est pas une base SQLite (signature invalide)."

  # Chemin absolu : le conteneur sera arrêté, mais le fichier reste côté serveur.
  BACKUP_FILE="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"

  if [ "$CONFIRM" != "1" ]; then
    echo "Cette opération va REMPLACER la base actuelle par : $BACKUP_FILE"
    if [ -t 0 ]; then
      printf "Tapez OUI pour confirmer : "
      read -r ANSWER
      [ "$ANSWER" = "OUI" ] || { echo "Annulé."; exit 1; }
    else
      echo "Confirmation impossible sans terminal." >&2
      echo "Relancez avec : ./backup.sh restore --oui <fichier>" >&2
      exit 1
    fi
  fi

  echo "Arrêt du service Auralis..."
  docker compose stop auralis

  # Copie de sécurité de la base actuelle avant de l'écraser.
  SAFETY_COPY=""
  if [ -f "$DB_HOST_PATH" ]; then
    SAFETY_COPY="${DB_HOST_PATH}.avant-restauration-$(date +%Y%m%d-%H%M%S)"
    cp -p "$DB_HOST_PATH" "$SAFETY_COPY"
    echo "Base actuelle conservée dans : $SAFETY_COPY"
  fi

  # Suppression de l'ancienne base et de ses fichiers annexes : un journal WAL
  # résiduel de l'ancienne base corromprait la base restaurée.
  rm -f "$DB_HOST_PATH" "${DB_HOST_PATH}-wal" "${DB_HOST_PATH}-shm"

  echo "Restauration de : $BACKUP_FILE"
  cp "$BACKUP_FILE" "$DB_HOST_PATH"

  # La base doit appartenir à l'utilisateur du conteneur (node, uid 1000).
  if ! chown 1000:1000 "$DB_HOST_PATH" 2>/dev/null; then
    echo "AVERTISSEMENT : impossible de donner la base à l'utilisateur 1000 (non-root ?)."
    echo "Si le serveur ne démarre pas : sudo chown 1000:1000 $DB_HOST_PATH"
  fi

  echo "Redémarrage du service..."
  docker compose start auralis

  echo
  echo "Restauration terminée."
  [ -n "$SAFETY_COPY" ] && echo "L'ancienne base reste disponible dans : $SAFETY_COPY"
  echo "Vérifiez le démarrage : docker compose logs -f auralis"
  exit 0
fi

# -----------------------------------------------------------------------------
# Mode « list »
# -----------------------------------------------------------------------------
if [ "${1:-}" = "list" ]; then
  if ! ls -1 "$BACKUP_DIR"/auralis-*.db >/dev/null 2>&1; then
    echo "Aucune sauvegarde dans $BACKUP_DIR."
    echo "Créez-en une avec : ./backup.sh"
    exit 0
  fi
  echo "Sauvegardes disponibles (du plus récent au plus ancien) :"
  ls -lht "$BACKUP_DIR"/auralis-*.db | awk '{print "  " $9 "  (" $5 ")"}'
  exit 0
fi

# -----------------------------------------------------------------------------
# Mode par défaut : création d'une sauvegarde (serveur en ligne)
# -----------------------------------------------------------------------------
[ $# -eq 0 ] || { usage; die "commande inconnue « $1 »."; }

# Le conteneur doit tourner pour utiliser son module better-sqlite3.
RUNNING="$(docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -c '^auralis$' || true)"
[ "$RUNNING" = "1" ] || die "le conteneur auralis n'est pas en cours d'exécution. Lancez d'abord ./update.sh."

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="/data/backups/auralis-${STAMP}.db"     # chemin vu DEPUIS le conteneur

echo "Création de la sauvegarde (le service reste en ligne)..."

if ! docker compose exec -T auralis node -e '
  const fs = require("fs");
  const path = require("path");
  const Database = require("better-sqlite3");
  const dest = process.argv[1];
  if (!fs.existsSync("/data/auralis.db")) {
    console.error("base introuvable : /data/auralis.db");
    process.exit(1);
  }
  if (fs.existsSync(dest)) {
    console.error("la destination existe deja : " + dest);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const db = new Database("/data/auralis.db");
  db.backup(dest)
    .then(() => { db.close(); console.log("sauvegarde écrite : " + dest); })
    .catch((err) => {
      try { db.close(); } catch (e) {}
      console.error((err && err.message) ? err.message : String(err));
      process.exit(1);
    });
' "$DEST"; then
  die "la sauvegarde a échoué dans le conteneur. Consultez : docker compose logs auralis"
fi

HOST_BACKUP="$BACKUP_DIR/auralis-${STAMP}.db"
[ -f "$HOST_BACKUP" ] || die "le conteneur a écrit la sauvegarde mais elle est introuvable côté serveur : $HOST_BACKUP"

echo "Sauvegarde créée : $HOST_BACKUP ($(du -h "$HOST_BACKUP" | cut -f1))"

# Conservation des $KEEP sauvegardes les plus récentes uniquement.
OLDIES="$(ls -1t "$BACKUP_DIR"/auralis-*.db 2>/dev/null | tail -n +$((KEEP + 1)) || true)"
if [ -n "$OLDIES" ]; then
  echo "$OLDIES" | xargs -r rm -f
  echo "Anciennes sauvegardes supprimées (les $KEEP plus récentes sont conservées)."
fi

echo "Restauration éventuelle : ./backup.sh restore $HOST_BACKUP"
