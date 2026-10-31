#!/usr/bin/env bash
# Weekly restore test of the newest backup written by deploy/backup.sh.
#
#   1. picks the newest $BACKUP_DIR/triad-*.tar.gz.enc (fails when it is older than $MAX_AGE_HOURS)
#   2. decrypts it with $KEY_FILE and extracts only database.sql into a private temp dir
#   3. starts a throwaway MySQL container (same image as production, no network, its own anonymous
#      volume removed afterwards, random root password that is never printed) and loads the dump into it
#   4. sanity checks: at least $MIN_TABLES tables; $REQUIRED_TABLES are not empty; for $KEY_TABLES the restored
#      row count is at least $MIN_RATIO % of the live count (the backup is at most a day old, so a big gap
#      means a truncated dump)
#   5. removes the container and the temp files (also on failure / Ctrl-C)
#   6. writes the result into the live database (Setting row `ops:backupCheck`, via docker exec into the db
#      container, like backup.sh does for the dump). The API (server/src/jobs/backupCheck.ts) turns a new result
#      into an in-app notification + e-mail to the admins, warns when no check arrived for 9 days, and shows the
#      status on Admin > Security.
#
# Install on the server (once, as root; see deploy/README-ci.md "Backup restore test"):
#   install -m 700 deploy/backup-verify.sh /usr/local/sbin/triad-backup-verify
#   printf '%s\n' 'SHELL=/bin/bash' \
#     '30 4 * * 0 root /usr/local/sbin/triad-backup-verify >> /var/log/triad-backup-verify.log 2>&1' \
#     > /etc/cron.d/triad-backup-verify && chmod 644 /etc/cron.d/triad-backup-verify
#   /usr/local/sbin/triad-backup-verify      # first run by hand, then check Admin > Security
#
# Local dry run (no production needed): BACKUP_DIR=/path/with/archives KEY_FILE=/path/key DB_CONTAINER=<a local
# mysql container with MYSQL_ROOT_PASSWORD + MYSQL_DATABASE in its env> bash deploy/backup-verify.sh
# NO_REPORT=1 skips step 6 (prints the JSON only).
#
# Exit code: 0 = backup verified, 1 = verification failed (the failure is reported too), 2 = could not report.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/triad}"
KEY_FILE="${KEY_FILE:-/root/.triad-backup.key}"
DB_CONTAINER="${DB_CONTAINER:-src-db-1}"
VERIFY_IMAGE="${VERIFY_IMAGE:-mysql:8.4}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"
MIN_TABLES="${MIN_TABLES:-50}"
MIN_RATIO="${MIN_RATIO:-90}"
REQUIRED_TABLES="${REQUIRED_TABLES:-User Setting _prisma_migrations}"
KEY_TABLES="${KEY_TABLES:-User Case Document Inquiry Task Setting _prisma_migrations}"
READY_TIMEOUT="${READY_TIMEOUT:-300}"
VERIFY_MEMORY="${VERIFY_MEMORY:-768m}"

umask 077
STARTED="$(date -u +%s)"
WORK="$(mktemp -d)"
NAME="triad-backup-verify-$$"
BACKUP_FILE=""
BACKUP_AT=""
TABLES="null"
COUNTS=""

cleanup() {
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# JSON-safe, SQL-string-safe text: printable ASCII only, no quotes or backslashes, at most 300 characters.
clean() { printf '%s' "$1" | LC_ALL=C tr -cd '[:print:]' | tr -d "\"'\\\\\`" | cut -c1-300; }

# Runs SQL from stdin against the live database inside the production db container (password from its env).
live_sql() { docker exec -i "$DB_CONTAINER" sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE"' 2>/dev/null; }
# Same for the throwaway container (its own random password is in its env, never on our command line).
test_sql() { docker exec -i "$NAME" sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B' 2>/dev/null; }

report() { # status error
  local status="$1" err json now dur
  err="$(clean "${2:-}")"
  now="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  dur=$(( $(date -u +%s) - STARTED ))
  json="{\"status\":\"$status\",\"checkedAt\":\"$now\",\"backupFile\":$( [ -n "$BACKUP_FILE" ] && printf '"%s"' "$(clean "$BACKUP_FILE")" || printf null ),\"backupAt\":$( [ -n "$BACKUP_AT" ] && printf '"%s"' "$BACKUP_AT" || printf null ),\"tables\":$TABLES,\"counts\":{${COUNTS}},\"durationSec\":$dur,\"error\":$( [ -n "$err" ] && printf '"%s"' "$err" || printf null ),\"host\":\"$(clean "$(hostname)")\"}"
  echo "$(date -u +%FT%TZ) backup-verify $status ${BACKUP_FILE:-none}${err:+ - $err}"
  if [ "${NO_REPORT:-0}" = 1 ]; then echo "$json"; return 0; fi
  if ! printf "INSERT INTO \`Setting\` (\`key\`, \`value\`) VALUES ('ops:backupCheck', CAST('%s' AS JSON)) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`);\n" "$json" | live_sql >/dev/null; then
    echo "backup-verify: could not write the result into the live database ($DB_CONTAINER)" >&2
    exit 2
  fi
}

fail() { report failed "$1"; exit 1; }

# -- 1. newest archive --------------------------------------------------
[ -s "$KEY_FILE" ] || fail "backup key $KEY_FILE missing"
BACKUP_PATH="$(ls -1t "$BACKUP_DIR"/triad-*.tar.gz.enc 2>/dev/null | head -n 1 || true)"
[ -n "$BACKUP_PATH" ] || fail "no backup archive in $BACKUP_DIR"
BACKUP_FILE="$(basename "$BACKUP_PATH")"
# triad-YYYYmmdd-HHMM.tar.gz.enc (UTC stamp written by backup.sh)
STAMP="$(printf '%s' "$BACKUP_FILE" | sed -n 's/^triad-\([0-9]\{8\}\)-\([0-9]\{4\}\)\.tar\.gz\.enc$/\1\2/p')"
if [ -n "$STAMP" ]; then
  BACKUP_AT="${STAMP:0:4}-${STAMP:4:2}-${STAMP:6:2}T${STAMP:8:2}:${STAMP:10:2}:00.000Z"
fi
MTIME="$(stat -c %Y "$BACKUP_PATH")"
AGE_H=$(( ( $(date -u +%s) - MTIME ) / 3600 ))
[ "$AGE_H" -le "$MAX_AGE_HOURS" ] || fail "newest backup is ${AGE_H} h old (limit ${MAX_AGE_HOURS} h) - is the nightly backup cron running?"

# -- 2. decrypt + extract the dump --------------------------------------
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$BACKUP_PATH" 2>/dev/null \
  | tar -xzf - -C "$WORK" database.sql 2>/dev/null || fail "archive does not decrypt or has no database.sql"
[ -s "$WORK/database.sql" ] || fail "database.sql is empty"
tail -n 1 "$WORK/database.sql" | grep -q "Dump completed" || fail "database.sql is truncated (no completion marker)"
DB_NAME="$(sed -n 's/^CREATE DATABASE[^`]*`\([^`]*\)`.*/\1/p' "$WORK/database.sql" | head -n 1)"
[ -n "$DB_NAME" ] || fail "no CREATE DATABASE statement in the dump"

# -- 3. throwaway MySQL -------------------------------------------------
TEST_PW="$(openssl rand -hex 24)"
printf 'MYSQL_ROOT_PASSWORD=%s\n' "$TEST_PW" > "$WORK/env"
unset TEST_PW
docker run -d --name "$NAME" --network none --env-file "$WORK/env" \
  --memory "$VERIFY_MEMORY" --pids-limit 512 \
  --security-opt no-new-privileges:true \
  "$VERIFY_IMAGE" --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci >/dev/null 2>&1 \
  || fail "could not start the test container ($VERIFY_IMAGE)"
rm -f "$WORK/env"

ready=0
for _ in $(seq 1 "$READY_TIMEOUT"); do
  # The entrypoint first runs a temporary server to initialise the data dir, then restarts: wait for the
  # "init process done" line before trusting a successful login.
  if docker logs "$NAME" 2>&1 | grep -q "init process done" && echo "SELECT 1;" | test_sql >/dev/null 2>&1; then ready=1; break; fi
  docker ps -q --filter "name=^${NAME}$" | grep -q . || fail "test container stopped during start-up"
  sleep 1
done
[ "$ready" = 1 ] || fail "test MySQL did not become ready in ${READY_TIMEOUT} s"

test_sql < "$WORK/database.sql" >/dev/null || fail "loading the dump into the test database failed"
rm -f "$WORK/database.sql"

# -- 4. sanity checks ---------------------------------------------------
TABLES="$(echo "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME';" | test_sql | tr -dc '0-9' || true)"
TABLES="${TABLES:-0}"
[ "$TABLES" -ge "$MIN_TABLES" ] || fail "only $TABLES tables restored (expected at least $MIN_TABLES)"

problems=""
for t in $KEY_TABLES; do
  restored="$(echo "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$t\`;" | test_sql | tr -dc '0-9' || true)"
  live="$(echo "SELECT COUNT(*) FROM \`$t\`;" | live_sql | tr -dc '0-9' || true)"
  if [ -z "$restored" ]; then problems="$problems; table $t missing"; continue; fi
  COUNTS="${COUNTS:+$COUNTS,}\"$t\":{\"restored\":$restored,\"live\":${live:-null}}"
  case " $REQUIRED_TABLES " in *" $t "*) [ "$restored" -gt 0 ] || problems="$problems; $t is empty" ;; esac
  if [ -n "$live" ] && [ "$live" -gt 0 ] && [ $(( restored * 100 )) -lt $(( live * MIN_RATIO )) ]; then
    problems="$problems; $t has $restored rows vs $live live"
  fi
done
for t in $REQUIRED_TABLES; do
  case " $KEY_TABLES " in *" $t "*) ;; *)
    restored="$(echo "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$t\`;" | test_sql | tr -dc '0-9' || true)"
    [ -n "$restored" ] && [ "$restored" -gt 0 ] || problems="$problems; $t is empty or missing" ;;
  esac
done
[ -z "$problems" ] || fail "${problems#; }"

# -- 5./6. clean up (trap) and report -----------------------------------
docker rm -f -v "$NAME" >/dev/null 2>&1 || true
report ok ""
