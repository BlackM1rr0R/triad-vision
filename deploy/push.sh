#!/usr/bin/env bash
# Deploys the working tree (committed + uncommitted, minus ignored files) to the server and
# rebuilds the stack. Run from the repository root on your machine (Git Bash on Windows works):
#   deploy/push.sh root@172.104.149.241
# Requires deploy/server-setup.sh to have run once on the server.
set -euo pipefail

TARGET=${1:?usage: deploy/push.sh user@host}
APP_DIR=${APP_DIR:-/opt/triad-vision}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

ARCHIVE=$(mktemp -t triad-vision-XXXXXX.tar.gz)
trap 'rm -f "$ARCHIVE"' EXIT

echo "== packing source"
# Tracked + untracked files, honouring .gitignore (so node_modules, .env, dist, data never leave the machine).
# Files deleted in the working tree are still listed by ls-files, so drop them before packing.
git ls-files -co --exclude-standard | grep -vxF -f <(git ls-files -d; echo '__none__') | tar --verbatim-files-from -T - -czf "$ARCHIVE"
echo "   $(du -h "$ARCHIVE" | cut -f1)"

echo "== uploading"
scp -q "$ARCHIVE" deploy/remote-deploy.sh "$TARGET:/tmp/"
ssh "$TARGET" "mv /tmp/$(basename "$ARCHIVE") /tmp/triad-vision.tar.gz"

echo "== building and starting on the server"
# The remote script runs from a file (not stdin), so `docker compose exec` cannot swallow it.
ssh "$TARGET" "bash /tmp/remote-deploy.sh '$APP_DIR' /tmp/triad-vision.tar.gz"

echo "== deployed"
