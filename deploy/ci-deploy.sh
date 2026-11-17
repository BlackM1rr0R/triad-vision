#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key (see deploy/README-ci.md). The key in
# /root/.ssh/authorized_keys is pinned to this script with `restrict,command="…"`, so the CI can do
# exactly one thing: stream a deploy on stdin and have it deployed. No shell, no other command,
# no port forwarding.
#
#   ssh root@server capabilities                      # prints "deploy deploy-prebuilt" (CI probes this first)
#   tar -cf - src.tar.gz images.tar.gz | ssh root@server deploy-prebuilt
#       images built in CI (deploy/build-images.sh): the server only loads and starts them (the normal path)
#   git archive --format=tar.gz HEAD | ssh root@server deploy
#       source only: the images are built ON the server (fallback; can swap-thrash a 2 GB server)
#
# Accepting images from CI adds no privilege: the source tarball's deploy/remote-deploy.sh already runs as root.
# Install on the server: install -m 700 deploy/ci-deploy.sh /usr/local/sbin/triad-ci-deploy
set -euo pipefail
# Same umask as an interactive root shell on the server: the API image (deploy/api.Dockerfile) relies on
# group-readable source (root:node), so 077 here would lock the API out of its own code.
umask 027

APP_DIR="${APP_DIR:-/opt/triad-vision}"
MAX_BYTES=$((300 * 1024 * 1024))   # a source tarball is a few MB; refuse anything absurd
MAX_BUNDLE_BYTES=$((2048 * 1024 * 1024))   # source + images (a few hundred MB gzip'd)
# On disk, not in /tmp: /tmp may be a RAM-backed tmpfs, and the image archive must not take the 2 GB of RAM.
DEPLOY_TMP="${DEPLOY_TMP:-/var/tmp}"
# Free space needed before receiving images: the bundle, its unpacked copy and the loaded layers.
MIN_FREE_MB="${MIN_FREE_MB:-3072}"
free_mb() { df -Pm "$1" | awk 'NR==2 {print $4}'; }

case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy) MODE=source ;;
  deploy-prebuilt) MODE=prebuilt ;;
  capabilities) echo "deploy deploy-prebuilt"; exit 0 ;;
  *) echo "ci-deploy: only the 'deploy', 'deploy-prebuilt' and 'capabilities' commands are allowed" >&2; exit 2 ;;
esac

# One deploy at a time (a second push waits in GitHub's concurrency group, this is the safety net).
exec 9>/run/triad-ci-deploy.lock
flock -n 9 || { echo "ci-deploy: another deploy is running" >&2; exit 3; }

# Leftovers of a deploy that was cut off (reboot, killed SSH session) would hold hundreds of MB on disk.
find "$DEPLOY_TMP" -maxdepth 1 -name 'triad-ci-deploy.*' -mmin +120 -exec rm -rf {} + 2>/dev/null || true
WORK="$(mktemp -d "$DEPLOY_TMP/triad-ci-deploy.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [ "$MODE" = prebuilt ]; then
  # The images are linux/amd64 (deploy/build-images.sh).
  [ "$(uname -m)" = x86_64 ] || { echo "ci-deploy: prebuilt images are amd64, this server is $(uname -m)" >&2; exit 6; }
  docker_root=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
  for dir in "$WORK" "$docker_root"; do
    have=$(free_mb "$dir")
    if [ "$have" -lt "$MIN_FREE_MB" ]; then
      # Build cache is useless once images come from CI; dangling images are leftovers of earlier deploys.
      docker builder prune -af >/dev/null 2>&1 || true
      docker image prune -f >/dev/null 2>&1 || true
      have=$(free_mb "$dir")
      [ "$have" -ge "$MIN_FREE_MB" ] || { echo "ci-deploy: only ${have} MB free on $dir, need ${MIN_FREE_MB} MB" >&2; exit 7; }
    fi
  done
  head -c "$((MAX_BUNDLE_BYTES + 1))" > "$WORK/bundle.tar"
  [ "$(stat -c %s "$WORK/bundle.tar")" -le "$MAX_BUNDLE_BYTES" ] || { echo "ci-deploy: bundle too large" >&2; exit 4; }
  # Exactly these two members, nothing else is extracted (no paths from the bundle reach the filesystem).
  tar -xf "$WORK/bundle.tar" -C "$WORK" src.tar.gz images.tar.gz || { echo "ci-deploy: bundle must hold src.tar.gz and images.tar.gz" >&2; exit 5; }
  rm -f "$WORK/bundle.tar"
  gzip -t "$WORK/images.tar.gz" || { echo "ci-deploy: images.tar.gz is not a valid gzip file" >&2; exit 5; }
else
  head -c "$((MAX_BYTES + 1))" > "$WORK/src.tar.gz"
fi
[ "$(stat -c %s "$WORK/src.tar.gz")" -le "$MAX_BYTES" ] || { echo "ci-deploy: archive too large" >&2; exit 4; }
tar -tzf "$WORK/src.tar.gz" > "$WORK/list" || { echo "ci-deploy: not a valid tar.gz" >&2; exit 5; }
grep -qx 'deploy/remote-deploy.sh' "$WORK/list" || { echo "ci-deploy: deploy/remote-deploy.sh missing" >&2; exit 5; }
tar -xzf "$WORK/src.tar.gz" -C "$WORK" deploy/remote-deploy.sh

echo "== backup before deploy"
/usr/local/sbin/triad-backup

cp "$WORK/src.tar.gz" /tmp/triad-vision.tar.gz
if [ "$MODE" = prebuilt ]; then
  PREBUILT_IMAGES="$WORK/images.tar.gz" bash "$WORK/deploy/remote-deploy.sh" "$APP_DIR" /tmp/triad-vision.tar.gz
else
  bash "$WORK/deploy/remote-deploy.sh" "$APP_DIR" /tmp/triad-vision.tar.gz
fi
