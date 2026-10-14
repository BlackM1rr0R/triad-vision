#!/usr/bin/env bash
# Runs ON THE SERVER (uploaded and started by deploy/push.sh): unpack, build, start, migrate, seed.
#   bash remote-deploy.sh /opt/triad-vision /tmp/triad-vision.tar.gz
set -euo pipefail
APP_DIR=${1:-/opt/triad-vision}
ARCHIVE=${2:-/tmp/triad-vision.tar.gz}
COMPOSE="docker compose -f docker-compose.prod.yml"

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
cd src

echo "== build + start"
$COMPOSE up -d --build --remove-orphans

echo "== waiting for the API (migrations run on start)"
for _ in $(seq 1 90); do
  if $COMPOSE exec -T api curl -fsS http://localhost:4000/api/health >/dev/null 2>&1 </dev/null; then
    echo "   api is up"
    break
  fi
  sleep 2
done

echo "== seed (idempotent: super admin + initial content when the tables are empty)"
$COMPOSE exec -T api npm run seed -w server </dev/null

docker image prune -f >/dev/null
echo "== containers"
$COMPOSE ps
