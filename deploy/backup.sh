#!/usr/bin/env bash
# Nightly encrypted backup of the database and uploaded files.
#   - MySQL: consistent logical dump (mysqldump --single-transaction) taken inside the db container
#   - Files: data/uploads (CMS images, case documents) and data/docs (staff document workspaces)
# Each backup is one AES-256 encrypted archive in $BACKUP_DIR; archives older than $KEEP_DAYS are removed.
#
# Restore:  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/root/.triad-backup.key \
#             -in triad-YYYYmmdd-HHMM.tar.gz.enc | tar -xz -C /tmp/restore
# Keep a copy of /root/.triad-backup.key OFF the server, or the archives can't be decrypted.
#
# Optional off-site copy: BACKUP_REMOTE=user@host:/path/ (scp, key-based) uploads each archive after it was
# verified, e.g. for white-label customer instances (deploy/whitelabel/new-instance.sh writes the cron line).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/triad-vision}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/triad}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEY_FILE="${KEY_FILE:-/root/.triad-backup.key}"
DB_CONTAINER="${DB_CONTAINER:-src-db-1}"

umask 077
mkdir -p "$BACKUP_DIR"
[ -s "$KEY_FILE" ] || { openssl rand -base64 48 > "$KEY_FILE"; chmod 400 "$KEY_FILE"; echo "created new key $KEY_FILE"; }

STAMP="$(date -u +%Y%m%d-%H%M)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

docker exec "$DB_CONTAINER" sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --triggers --events --hex-blob --databases "$MYSQL_DATABASE"' 2>/dev/null > "$WORK/database.sql"
# a dump without the completion marker means mysqldump failed half-way
tail -n 1 "$WORK/database.sql" | grep -q "Dump completed" || { echo "mysqldump failed" >&2; exit 1; }

# Mail (Stalwart's RocksDB) is copied with the mail server stopped for a few seconds, so the copy is
# consistent; senders simply retry during that window.
MAIL_CONTAINER="${MAIL_CONTAINER:-src-mail-1}"
MAIL_DIRS=()
if [ -d "$APP_DIR/data/mail" ]; then
  MAIL_DIRS=(mail)
  if docker ps -q --filter "name=^${MAIL_CONTAINER}$" | grep -q .; then
    docker stop -t 30 "$MAIL_CONTAINER" >/dev/null
    trap 'docker start "$MAIL_CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
    RESTART_MAIL=1
  fi
fi
tar -czf "$WORK/backup.tar.gz" -C "$WORK" database.sql -C "$APP_DIR/data" uploads docs "${MAIL_DIRS[@]}"
if [ "${RESTART_MAIL:-0}" = 1 ]; then docker start "$MAIL_CONTAINER" >/dev/null; fi
OUT="$BACKUP_DIR/triad-$STAMP.tar.gz.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" -in "$WORK/backup.tar.gz" -out "$OUT"

# verify the archive decrypts and is a valid tarball before trusting it
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$OUT" | tar -tz >/dev/null

if [ -n "${BACKUP_REMOTE:-}" ]; then
  scp -q -o BatchMode=yes "$OUT" "$BACKUP_REMOTE" || echo "off-site copy to $BACKUP_REMOTE failed" >&2
fi

find "$BACKUP_DIR" -name 'triad-*.tar.gz.enc' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) ok $(du -h "$OUT" | cut -f1) $OUT"
