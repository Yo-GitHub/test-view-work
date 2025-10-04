#!/usr/bin/env bash
set -euo pipefail
REPO="/Volumes/LaCie/Dropbox/A2_WORK/英通Web_ver3/test-view-work"   # ←主のリポのパスに変更
cd "$REPO"

FILE="docs/implementation_memo.md"
if ! git diff --quiet -- "$FILE"; then
  git add "$FILE"
  git commit -m "chore: memo update $(date '+%F %T %z')"
  git push origin main
fi