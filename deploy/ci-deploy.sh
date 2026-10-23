#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key (see deploy/README-ci.md). The key in
# /root/.ssh/authorized_keys is pinned to this script with `restrict,command="…"`, so the CI can do
# exactly one thing: stream a source tarball on stdin and have it deployed. No shell, no other command,
# no port forwarding.
#
#   git archive --format=tar.gz HEAD | ssh root@server deploy
#
# Install on the server: install -m 700 deploy/ci-deploy.sh /usr/local/sbin/triad-ci-deploy
set -euo pipefail
# Same umask as an interactive root shell on the server: the API image (deploy/api.Dockerfile) relies on
# group-readable source (root:node), so 077 here would lock the API out of its own code.
umask 027

APP_DIR="${APP_DIR:-/opt/triad-vision}"
MAX_BYTES=$((300 * 1024 * 1024))   # a source tarball is a few MB; refuse anything absurd

case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy) ;;
  *) echo "ci-deploy: only the 'deploy' command is allowed" >&2; exit 2 ;;
esac

# One deploy at a time (a second push waits in GitHub's concurrency group, this is the safety net).
exec 9>/run/triad-ci-deploy.lock
flock -n 9 || { echo "ci-deploy: another deploy is running" >&2; exit 3; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

head -c "$((MAX_BYTES + 1))" > "$WORK/src.tar.gz"
[ "$(stat -c %s "$WORK/src.tar.gz")" -le "$MAX_BYTES" ] || { echo "ci-deploy: archive too large" >&2; exit 4; }
tar -tzf "$WORK/src.tar.gz" > "$WORK/list" || { echo "ci-deploy: not a valid tar.gz" >&2; exit 5; }
grep -qx 'deploy/remote-deploy.sh' "$WORK/list" || { echo "ci-deploy: deploy/remote-deploy.sh missing" >&2; exit 5; }
tar -xzf "$WORK/src.tar.gz" -C "$WORK" deploy/remote-deploy.sh

echo "== backup before deploy"
/usr/local/sbin/triad-backup

cp "$WORK/src.tar.gz" /tmp/triad-vision.tar.gz
bash "$WORK/deploy/remote-deploy.sh" "$APP_DIR" /tmp/triad-vision.tar.gz
