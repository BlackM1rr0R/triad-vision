#!/usr/bin/env bash
# Builds the three production images (api, web, ssr) OFF the server — on the GitHub runner (CI deploy) or on a
# workstation with Docker (PREBUILT=1 deploy/push.sh) — and writes them into one gzip'd `docker save` archive.
# The production server (2 GB RAM) then only loads and starts them (deploy/remote-deploy.sh, PREBUILT_IMAGES):
# building there swap-thrashed it until even SSH stopped answering.
#
#   deploy/build-images.sh SRC.tar.gz OUT.tar.gz
#
# SRC.tar.gz is the exact source tarball that is shipped to the server (git archive / push.sh's file list), so the
# images are built from the same bytes the server unpacks: no local .env, node_modules or untracked files.
# Same Dockerfiles, contexts and targets as docker-compose.prod.yml; no build args, no secrets: the images carry no
# environment-specific values (Caddy reads SITE_DOMAIN/ACME_EMAIL and the API its settings from .env.production at
# runtime), so one image set works for any server.
set -euo pipefail

SRC=${1:?usage: build-images.sh SRC.tar.gz OUT.tar.gz}
OUT=${2:?usage: build-images.sh SRC.tar.gz OUT.tar.gz}
# Loaded on the server under these names, then re-tagged to the names compose expects (src-api, …).
REPO=${PREBUILT_REPO:-triad-vision-prebuilt}
# The production server is x86_64; build for it even from an ARM laptop.
PLATFORM=${PREBUILT_PLATFORM:-linux/amd64}

SRC=$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")
CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
tar -xzf "$SRC" -C "$CTX"

build() { # build <service> <dockerfile> [target]
  local svc=$1 file=$2 target=${3:-}
  echo "== building $svc"
  # --pull: always on top of the newest patched base images (node, caddy), as the server build did.
  DOCKER_BUILDKIT=1 docker build --pull --platform "$PLATFORM" -f "$CTX/$file" ${target:+--target "$target"} \
    -t "$REPO/$svc:incoming" "$CTX"
}
build api deploy/api.Dockerfile
# web and ssr share the `build` stage of web.Dockerfile: the second build reuses the cached site build.
build ssr deploy/web.Dockerfile ssr
build web deploy/web.Dockerfile

echo "== saving images"
# One archive: layers shared by api and ssr (node:22-bookworm-slim) are stored once. pigz when available.
if command -v pigz >/dev/null 2>&1; then gz=(pigz -6); else gz=(gzip -6); fi
docker save "$REPO/api:incoming" "$REPO/web:incoming" "$REPO/ssr:incoming" | "${gz[@]}" > "$OUT"
docker image ls --filter "reference=$REPO/*"
echo "   $(du -h "$OUT" | cut -f1) $OUT"
