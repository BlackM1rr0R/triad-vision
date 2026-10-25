#!/usr/bin/env bash
# Shared helpers of the white-label scripts (sourced, not run).

WL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$WL_DIR/../.." && pwd)"
APP_DIR="${APP_DIR:-/opt/triad-vision}"

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "== $*"; }

# Brand texts end up in .env.production, HTML, JSON and PDFs: same character rule as the server (lib/brand).
check_text() {
  local name=$1 value=$2
  case "$value" in
    *'<'* | *'>'* | *'"'* | *'&'* | *'\'* | *'{'* | *'}'* | *'$'* | *'`'*) die "$name must not contain < > \" & \\ { } \$ \`" ;;
  esac
  [[ "$value" != *$'\n'* ]] || die "$name must be one line"
}

check_domain() {
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "invalid domain: $1"
}

# Ships a committed version of the repository (git archive, like the CI deploy) and runs the normal
# deploy/remote-deploy.sh on the server: unpack into a fresh src/, build images, start, migrate, seed.
#   ship_release <ssh-target> <git-ref>
ship_release() {
  local target=$1 ref=${2:-HEAD} archive
  git -C "$REPO_ROOT" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || die "unknown git ref: $ref"
  archive="$(mktemp -t wl-release-XXXXXX.tar.gz)"
  # shellcheck disable=SC2064
  trap "rm -f '$archive'" RETURN
  say "packing $(git -C "$REPO_ROOT" rev-parse --short "$ref") ($ref)"
  git -C "$REPO_ROOT" archive --format=tar.gz -o "$archive" "$ref"
  say "uploading"
  scp -q "$archive" "$target:/tmp/triad-vision.tar.gz"
  scp -q "$REPO_ROOT/deploy/remote-deploy.sh" "$target:/tmp/remote-deploy.sh"
  say "building and starting on the server (first build: 10–20 minutes on a small VM)"
  ssh "$target" "bash /tmp/remote-deploy.sh '$APP_DIR' /tmp/triad-vision.tar.gz"
}

# docker compose on the server, with the instance override.
remote_compose() {
  local target=$1; shift
  ssh "$target" "cd '$APP_DIR/src' && docker compose -f docker-compose.prod.yml -f '$APP_DIR/docker-compose.instance.yml' $*"
}
