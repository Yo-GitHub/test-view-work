#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date -u +'%Y-%m-%d')"
DIR="backups/$STAMP"
mkdir -p "$DIR"
for f in group.json match.json mcq.json themes.json; do
  [ -f "$f" ] && cp "$f" "$DIR/" || true
done
echo "snapshot to $DIR"