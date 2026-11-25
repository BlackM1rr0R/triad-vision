#!/usr/bin/env bash
# Runs ON THE SERVER (started by deploy/ci-deploy.sh or deploy/push.sh): unpack, build or load, start, migrate, seed.
#   bash remote-deploy.sh /opt/triad-vision /tmp/triad-vision.tar.gz
#   PREBUILT_IMAGES=/var/tmp/.../images.tar.gz bash remote-deploy.sh /opt/triad-vision /tmp/triad-vision.tar.gz
# With PREBUILT_IMAGES (a `docker save` archive from deploy/build-images.sh, built in CI) nothing is compiled here:
# the images are loaded, re-tagged and started. Without it the images are built on this server as before
# (fallback; on the 2 GB production server that build can swap-thrash it, see deploy/README-ci.md).
set -euo pipefail
APP_DIR=${1:-/opt/triad-vision}
ARCHIVE=${2:-/tmp/triad-vision.tar.gz}
PREBUILT_IMAGES=${PREBUILT_IMAGES:-}
PREBUILT_REPO=${PREBUILT_REPO:-triad-vision-prebuilt}
# Free space (MB) the image load needs on Docker's disk besides the archive itself (layers are unpacked there).
MIN_FREE_MB=${MIN_FREE_MB:-2048}
free_mb() { df -Pm "$1" | awk 'NR==2 {print $4}'; }
COMPOSE="docker compose -f docker-compose.prod.yml"
# White-label customer instances (deploy/whitelabel/) keep a compose override next to .env.production, e.g. to
# leave out the owner's built-in mail server. The owner's server has no such file: the stack stays as it is.
if [ -f "$APP_DIR/docker-compose.instance.yml" ]; then
  COMPOSE="$COMPOSE -f $APP_DIR/docker-compose.instance.yml"
fi

cd "$APP_DIR"
[ -f .env.production ] || { echo "missing $APP_DIR/.env.production — run deploy/server-setup.sh first"; exit 1; }

if [ -f "$ARCHIVE" ]; then
  echo "== unpacking source"
  # Into a fresh directory, so files deleted in the repo disappear here too (an overlay would keep them).
  rm -rf src.new && mkdir -p src.new
  tar -xzf "$ARCHIVE" -C src.new
  rm -f "$ARCHIVE"
  rm -rf src && mv src.new src
fi
# Secrets and data stay outside the source tree; compose reads both from the app root.
ln -sfn "$APP_DIR/.env.production" src/.env.production
ln -sfn "$APP_DIR/data" src/data
# The API runs as the unprivileged `node` user (uid 1000); it must own the folders it writes to.
mkdir -p "$APP_DIR/data/uploads" "$APP_DIR/data/docs"
chown -R 1000:1000 "$APP_DIR/data/uploads" "$APP_DIR/data/docs"
# The mail server runs as uid 2000. The Cloudflare token file must exist before compose starts, or
# Docker would create a directory in its place; it stays readable by that user only.
mkdir -p "$APP_DIR/data/mail/etc" "$APP_DIR/data/mail/data"
[ -f "$APP_DIR/data/mail/cloudflare-dns-token" ] || install -m 400 /dev/null "$APP_DIR/data/mail/cloudflare-dns-token"
chown -R 2000:2000 "$APP_DIR/data/mail"
chmod 400 "$APP_DIR/data/mail/cloudflare-dns-token"
cd src

# Hashed JS/CSS of the build that is running now go to data/assets-archive (kept 21 days): a browser tab opened
# before this deploy still finds its lazy chunks after it (the web container serves them from /srv-archive, see
# the Caddyfile "/assets/*" handle). Without this, the first click in such a tab failed to load the page.
mkdir -p "$APP_DIR/data/assets-archive"
web_cid=$($COMPOSE ps -q web 2>/dev/null || true)
if [ -n "$web_cid" ]; then
  echo "== keep the previous build's assets"
  assets_tmp=$(mktemp -d)
  if docker cp "$web_cid:/srv/assets/." "$assets_tmp/" 2>/dev/null; then
    for f in "$assets_tmp"/*; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      [ -e "$APP_DIR/data/assets-archive/$name" ] || { mv "$f" "$APP_DIR/data/assets-archive/$name" && touch "$APP_DIR/data/assets-archive/$name"; }
    done
  fi
  rm -rf "$assets_tmp"
fi
find "$APP_DIR/data/assets-archive" -type f -mtime +21 -delete 2>/dev/null || true

if [ -n "$PREBUILT_IMAGES" ]; then
  echo "== load prebuilt images + start (built in CI: no compile on this server)"
  [ -s "$PREBUILT_IMAGES" ] || { echo "prebuilt image archive $PREBUILT_IMAGES is missing or empty" >&2; exit 1; }
  # Room to unpack the layers: compressed archive size x3 (gzip ratio) plus a margin; refuse rather than fill the disk.
  docker_root=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
  need_mb=$(( $(du -m "$PREBUILT_IMAGES" | cut -f1) * 3 + MIN_FREE_MB ))
  have_mb=$(free_mb "$docker_root")
  if [ "$have_mb" -lt "$need_mb" ]; then
    echo "   only ${have_mb} MB free on $docker_root, need ${need_mb} MB: dropping build cache and dangling images"
    docker builder prune -af >/dev/null 2>&1 || true
    docker image prune -f >/dev/null 2>&1 || true
    have_mb=$(free_mb "$docker_root")
    [ "$have_mb" -ge "$need_mb" ] || { echo "not enough disk on $docker_root: ${have_mb} MB free, need ${need_mb} MB" >&2; exit 1; }
  fi
  # Streams the layers to disk; needs little memory (no Node, no compiler).
  docker load -i "$PREBUILT_IMAGES"
  rm -f "$PREBUILT_IMAGES"
  # Compose names built images <project>-<service> (project = this directory, "src": src-api, src-web, src-ssr).
  images=$($COMPOSE config --images 2>/dev/null || true)
  for svc in api web ssr; do
    target="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}-$svc"
    if [ -n "$images" ] && ! grep -qx "$target" <<<"$images"; then
      echo "compose does not expect an image named $target (it lists: $(echo $images))" >&2; exit 1
    fi
    docker tag "$PREBUILT_REPO/$svc:incoming" "$target"
    docker rmi "$PREBUILT_REPO/$svc:incoming" >/dev/null
  done
  # MySQL 8.4 patch release, as before. The app images are only ever loaded, never built or pulled, here.
  $COMPOSE pull db
  $COMPOSE up -d --no-build --remove-orphans
else
  echo "== build + start"
  # --pull: always rebuild on top of the newest patched base images (node, caddy) and MySQL 8.4 patch.
  $COMPOSE pull db
  # One image at a time: the server has 2 GB RAM, and the API compile and the site build together run out of memory.
  $COMPOSE build --pull api
  $COMPOSE build --pull web
  # Same Dockerfile as web (stage `ssr`): reuses the cached site build, only adds the small Node image.
  $COMPOSE build --pull ssr
  $COMPOSE up -d --remove-orphans
fi

echo "== waiting for the API (migrations run on start)"
api_up=0
for _ in $(seq 1 90); do
  if $COMPOSE exec -T api curl -fsS http://localhost:4000/api/health >/dev/null 2>&1 </dev/null; then
    echo "   api is up"
    api_up=1
    break
  fi
  sleep 2
done
# A failed migration or crash loop must fail the deploy with the reason, not surface later as a seed error.
if [ "$api_up" != 1 ]; then
  echo "== the API did not become healthy in 180 s; last log lines:" >&2
  $COMPOSE logs --tail 80 api >&2 || true
  exit 1
fi

echo "== seed (idempotent: super admin + initial content when the tables are empty)"
$COMPOSE exec -T api npm run seed -w server </dev/null

docker image prune -f >/dev/null
if [ -n "$PREBUILT_IMAGES" ]; then
  # Images now come from CI: build cache here only takes disk (a later fallback build simply starts cold).
  echo "== cleanup (drop build cache and the previous, now untagged images)"
  docker builder prune -af >/dev/null 2>&1 || true
else
  echo "== cleanup (keep at most 4 GB of build cache, drop untagged images; the disk filled up without it)"
  docker builder prune -f --keep-storage 4GB >/dev/null 2>&1 || docker builder prune -f --max-used-space 4GB >/dev/null 2>&1 || true
fi
docker image prune -f >/dev/null 2>&1 || true

echo "== containers"
$COMPOSE ps
