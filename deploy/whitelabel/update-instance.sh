#!/usr/bin/env bash
# Rolls a new version out to a white-label customer instance (backup first, then the normal deploy:
# fresh src/, image build, migrations on start, idempotent seed). Run from the repository root:
#
#   bash deploy/whitelabel/update-instance.sh root@203.0.113.10            # deploys HEAD
#   bash deploy/whitelabel/update-instance.sh root@203.0.113.10 v2026.11   # a tag / branch / commit
#   for t in $(cat instances.txt); do bash deploy/whitelabel/update-instance.sh "$t" || echo "FAILED: $t"; done
#
# Optional: APP_DIR (default /opt/triad-vision), WORKTREE=1 (deploy the working tree with deploy/push.sh),
#           LICENSE_KEY (replaces the key in .env.production, e.g. after a renewal, and restarts the API).
# Never use it for triad-vision.de: the owner's instance is deployed by GitHub Actions (deploy/ci-deploy.sh).
set -euo pipefail
# shellcheck source=deploy/whitelabel/lib.sh
source "$(dirname "$0")/lib.sh"

TARGET=${1:-}
REF=${2:-HEAD}
[ -n "$TARGET" ] || die "usage: update-instance.sh <ssh-target> [git-ref]"

ssh -o BatchMode=yes "$TARGET" "test -f '$APP_DIR/.env.production' && test -f '$APP_DIR/docker-compose.instance.yml'" \
  || die "$TARGET:$APP_DIR is not a white-label instance (run new-instance.sh first)"
if ssh "$TARGET" "grep -q '^SITE_DOMAIN=triad-vision.de$' '$APP_DIR/.env.production'"; then
  die "this is the owner's triad-vision.de server — it is deployed by CI"
fi

if [ -n "${LICENSE_KEY:-}" ]; then
  [[ "$LICENSE_KEY" =~ ^TV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || die "LICENSE_KEY is not a TV1 token"
  node "$WL_DIR/issue-license.mjs" --verify "$LICENSE_KEY" >/dev/null || die "the licence key does not verify"
  say "replacing LICENSE_KEY"
  ssh "$TARGET" "sed -i 's|^LICENSE_KEY=.*|LICENSE_KEY=$LICENSE_KEY|' '$APP_DIR/.env.production'"
fi

say "backup before the update"
ssh "$TARGET" "if [ -x /usr/local/sbin/triad-backup ]; then APP_DIR='$APP_DIR' /usr/local/sbin/triad-backup; else echo '   (no backup script installed)'; fi"

if [ "${WORKTREE:-0}" = 1 ]; then
  APP_DIR="$APP_DIR" bash "$REPO_ROOT/deploy/push.sh" "$TARGET"
else
  ship_release "$TARGET" "$REF"
fi

DOMAIN=$(ssh "$TARGET" "sed -n 's/^SITE_DOMAIN=//p' '$APP_DIR/.env.production'")
say "health"
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then echo "   https://$DOMAIN is up"; exit 0; fi
  sleep 5
done
die "https://$DOMAIN/api/health did not answer — check: ssh $TARGET 'cd $APP_DIR/src && docker compose -f docker-compose.prod.yml -f $APP_DIR/docker-compose.instance.yml logs --tail 100 api'"
