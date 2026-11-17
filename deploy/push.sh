#!/usr/bin/env bash
# Deploys the working tree (committed + uncommitted, minus ignored files) to the server and
# rebuilds the stack. Run from the repository root on your machine (Git Bash on Windows works):
#   deploy/push.sh root@172.104.149.241
#   PREBUILT=1 deploy/push.sh root@172.104.149.241   # build the images HERE (needs Docker), the server only loads them
# Without PREBUILT the images are built on the server, which can swap-thrash the 2 GB production server
# (normal deploys go through CI, which always builds off the server: deploy/README-ci.md).
# Requires deploy/server-setup.sh to have run once on the server.
set -euo pipefail

# Default target: the production server (also reachable as `ssh triad` via ~/.ssh/config).
TARGET=${1:-root@172.104.149.241}
APP_DIR=${APP_DIR:-/opt/triad-vision}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

PREBUILT=${PREBUILT:-}
ARCHIVE=$(mktemp -t triad-vision-XXXXXX.tar.gz)
IMAGES=$(mktemp -t triad-vision-images-XXXXXX.tar.gz)
trap 'rm -f "$ARCHIVE" "$IMAGES"' EXIT

echo "== packing source"
# Tracked + untracked files, honouring .gitignore (so node_modules, .env, dist, data never leave the machine).
# Files deleted in the working tree are still listed by ls-files, so drop them before packing.
git ls-files -co --exclude-standard | grep -vxF -f <(git ls-files -d; echo '__none__') | tar --verbatim-files-from -T - -czf "$ARCHIVE"
echo "   $(du -h "$ARCHIVE" | cut -f1)"

if [ -n "$PREBUILT" ]; then
  echo "== building the images locally (from the packed source)"
  bash deploy/build-images.sh "$ARCHIVE" "$IMAGES"
fi

echo "== uploading"
scp -q "$ARCHIVE" deploy/remote-deploy.sh "$TARGET:/tmp/"
ssh "$TARGET" "mv /tmp/$(basename "$ARCHIVE") /tmp/triad-vision.tar.gz"
if [ -n "$PREBUILT" ]; then
  # /var/tmp, not /tmp: /tmp may be RAM-backed (tmpfs) on the server.
  scp -q "$IMAGES" "$TARGET:/var/tmp/triad-vision-images.tar.gz"
  echo "== loading and starting on the server"
  ssh "$TARGET" "PREBUILT_IMAGES=/var/tmp/triad-vision-images.tar.gz bash /tmp/remote-deploy.sh '$APP_DIR' /tmp/triad-vision.tar.gz"
else
  echo "== building and starting on the server"
  # The remote script runs from a file (not stdin), so `docker compose exec` cannot swallow it.
  ssh "$TARGET" "bash /tmp/remote-deploy.sh '$APP_DIR' /tmp/triad-vision.tar.gz"
fi

echo "== deployed"
