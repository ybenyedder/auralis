#!/usr/bin/env bash
# Installs the Python dependencies that unlock Auralis's two opt-in ML features:
#
#   1. Word-by-word forced lyrics alignment (scripts/forced_align.py)
#      — upgrades line-level .lrc to karaoke-style word-synced lyrics.
#   2. Deep audio embeddings (scripts/extract_embeddings.py)
#      — powers the "deep" recommendation axis (cosine similarity to your
#        liked-embedding centroid).
#
# Both are OPTIONAL: the app runs fine without them, the recommendation engine
# degrades gracefully (the deep axis returns 0), and line-level lyrics still work.
# AURALIS_ALIGN=1 / AURALIS_EMBEDDINGS=1 in .env.local (or server env) turn them on.
#
# Requires Python 3.10+ on PATH.

set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is not installed. Install Python 3.10+ first." >&2
  exit 1
fi

PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Using Python $PYVER"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Installing Python dependencies from scripts/requirements-align.txt..."
python3 -m pip install --upgrade pip >/dev/null
python3 -m pip install -r "$ROOT/scripts/requirements-align.txt"

cat <<EOF

Done. To enable the features, set in your environment (.env.local or server env):

  AURALIS_ALIGN=1        # word-by-word lyrics alignment
  AURALIS_EMBEDDINGS=1   # deep recommendation embeddings

Then restart Auralis. A rescan will pick up the new analysis.
EOF
