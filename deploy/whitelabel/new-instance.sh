#!/usr/bin/env bash
# Provisions a NEW white-label customer instance on a fresh Ubuntu 22.04 / 24.04 server (own VM, own domain,
# own database, own uploads). Run from the repository root on the owner's machine (Git Bash works):
#
#   BRAND_NAME="Acme Visa" ADMIN_EMAIL=owner@acme-visa.de ACME_EMAIL=ops@acme-visa.de \
#   LICENSE_KEY="$(node deploy/whitelabel/issue-license.mjs --key ~/license-private.pem \
#        --customer 'Acme Visa GmbH' --domain acme-visa.de --plan pro --expires 2027-01-31)" \
#   bash deploy/whitelabel/new-instance.sh root@203.0.113.10 acme-visa.de
#
# Required environment: BRAND_NAME, ADMIN_EMAIL (first SUPER_ADMIN), LICENSE_KEY
# Optional: ACME_EMAIL (Let's Encrypt, default ADMIN_EMAIL), BRAND_SHORT, BRAND_LEGAL_NAME, BRAND_SUPPORT_EMAIL,
#   BRAND_PHONE, BRAND_COUNTRY, BRAND_TAGLINE, BRAND_LANGUAGES (e.g. "de,en,tr"), SMTP_HOST, SMTP_PORT, SMTP_USER,
#   SMTP_PASS, MAIL_FROM_ADDRESS (default no-reply@<domain>), BACKUP_REMOTE (user@host:/path/ for off-site copies),
#   APP_DIR (default /opt/triad-vision), REF (git ref to deploy, default HEAD), WORKTREE=1 (deploy the working tree
#   with deploy/push.sh instead of a committed ref)
#
# Steps: server preparation (deploy/server-setup.sh: Docker, firewall, swap, folders) → .env.production from
# env.template with fresh random secrets → compose override (no owner mail server) → build + start + migrate +
# seed (SEED_PROFILE=whitelabel: no Triad Vision business content, one-time setup link for the first SUPER_ADMIN,
# printed below) → nightly encrypted backup (cron). Re-running it is safe: an existing .env.production is kept.
set -euo pipefail
# shellcheck source=deploy/whitelabel/lib.sh
source "$(dirname "$0")/lib.sh"

TARGET=${1:-}
DOMAIN=${2:-}
[ -n "$TARGET" ] && [ -n "$DOMAIN" ] || die "usage: new-instance.sh <ssh-target> <domain>   (see the header for the environment)"
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')
check_domain "$DOMAIN"
[ "$DOMAIN" != "triad-vision.de" ] || die "triad-vision.de is the owner's own instance (deployed by CI), not a customer"

: "${BRAND_NAME:?set BRAND_NAME}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL (first super admin)}"
: "${LICENSE_KEY:?set LICENSE_KEY (node deploy/whitelabel/issue-license.mjs …)}"
ACME_EMAIL=${ACME_EMAIL:-$ADMIN_EMAIL}
for v in BRAND_NAME BRAND_SHORT BRAND_LEGAL_NAME BRAND_SUPPORT_EMAIL BRAND_PHONE BRAND_COUNTRY BRAND_TAGLINE BRAND_LANGUAGES ADMIN_EMAIL ACME_EMAIL SMTP_HOST SMTP_USER MAIL_FROM_ADDRESS; do
  check_text "$v" "${!v:-}"
done
[[ "$LICENSE_KEY" =~ ^TV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || die "LICENSE_KEY is not a TV1 token"
command -v node >/dev/null || die "node is required (renders the env template)"

say "licence"
node "$WL_DIR/issue-license.mjs" --verify "$LICENSE_KEY" | sed 's/^/   /' || die "the licence key does not verify against the public key in the app"
node -e '
  const [, body] = process.argv[1].split(".");
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  const d = process.argv[2], l = p.domain.replace(/^www\./, "");
  const ok = l === "*" || l === d || (l.startsWith("*.") && (d === l.slice(2) || d.endsWith(l.slice(1))));
  if (!ok) { console.error(`licence domain ${p.domain} does not match ${d}`); process.exit(1); }
' "$LICENSE_KEY" "$DOMAIN" || die "licence / domain mismatch"

say "DNS"
IP=$(ssh -o BatchMode=yes "$TARGET" "hostname -I | awk '{print \$1}'") || die "cannot reach $TARGET over SSH (key-based login required)"
RESOLVED=$(node -e 'require("dns").promises.resolve4(process.argv[1]).then(a=>console.log(a.join(" "))).catch(()=>console.log(""))' "$DOMAIN")
echo "   server $IP, $DOMAIN → ${RESOLVED:-nothing}"
case " $RESOLVED " in
  *" $IP "*) ;;
  *) echo "   WARNING: $DOMAIN does not point at $IP yet — HTTPS certificates will fail until the A record (and www) is set." ;;
esac

say "server preparation (deploy/server-setup.sh)"
ssh "$TARGET" "APP_DIR='$APP_DIR' SITE_DOMAIN='$DOMAIN' ACME_EMAIL='$ACME_EMAIL' ADMIN_EMAIL='$ADMIN_EMAIL' SKIP_ENV=1 bash -s" < "$REPO_ROOT/deploy/server-setup.sh"

if ssh "$TARGET" "test -f '$APP_DIR/.env.production'"; then
  say ".env.production exists on the server — kept (secrets are never regenerated)"
else
  say "rendering .env.production (fresh secrets)"
  ENV_OUT="$(mktemp -t wl-env-XXXXXX)"
  trap 'rm -f "$ENV_OUT"' EXIT
  DOMAIN="$DOMAIN" ACME_EMAIL="$ACME_EMAIL" ADMIN_EMAIL="$ADMIN_EMAIL" LICENSE_KEY="$LICENSE_KEY" \
  BRAND_NAME="$BRAND_NAME" BRAND_SHORT="${BRAND_SHORT:-}" BRAND_LEGAL_NAME="${BRAND_LEGAL_NAME:-}" \
  BRAND_SUPPORT_EMAIL="${BRAND_SUPPORT_EMAIL:-}" BRAND_PHONE="${BRAND_PHONE:-}" BRAND_COUNTRY="${BRAND_COUNTRY:-}" \
  BRAND_TAGLINE="${BRAND_TAGLINE:-}" BRAND_LANGUAGES="${BRAND_LANGUAGES:-}" \
  SMTP_HOST="${SMTP_HOST:-}" SMTP_PORT="${SMTP_PORT:-465}" SMTP_USER="${SMTP_USER:-}" SMTP_PASS="${SMTP_PASS:-}" \
  MAIL_FROM_ADDRESS="${MAIL_FROM_ADDRESS:-no-reply@$DOMAIN}" \
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    const hex = (n) => crypto.randomBytes(n).toString("hex");
    const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
    const vars = { ...process.env,
      DB_PASSWORD: hex(24), DB_ROOT_PASSWORD: hex(24), JWT_SECRET: hex(48), TOTP_ENC_KEY: hex(32),
      VAPID_PUBLIC_KEY: ecdh.getPublicKey("base64url"), VAPID_PRIVATE_KEY: ecdh.getPrivateKey("base64url") };
    const out = fs.readFileSync(process.argv[1], "utf8").replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => {
      if (vars[k] === undefined) throw new Error(`no value for ${k}`);
      return vars[k];
    });
    fs.writeFileSync(process.argv[2], out, { mode: 0o600 });
  ' "$WL_DIR/env.template" "$ENV_OUT"
  scp -q "$ENV_OUT" "$TARGET:$APP_DIR/.env.production"
  ssh "$TARGET" "chmod 600 '$APP_DIR/.env.production'"
fi

say "compose override (no owner mail server)"
scp -q "$WL_DIR/docker-compose.instance.yml" "$TARGET:$APP_DIR/docker-compose.instance.yml"

say "deploy (build, migrations, seed)"
if [ "${WORKTREE:-0}" = 1 ]; then
  APP_DIR="$APP_DIR" bash "$REPO_ROOT/deploy/push.sh" "$TARGET"
else
  ship_release "$TARGET" "${REF:-HEAD}"
fi

say "nightly encrypted backup"
scp -q "$REPO_ROOT/deploy/backup.sh" "$TARGET:/tmp/triad-backup.sh"
ssh "$TARGET" "install -m 700 /tmp/triad-backup.sh /usr/local/sbin/triad-backup && rm -f /tmp/triad-backup.sh && \
  printf '%s\n' 'SHELL=/bin/bash' '30 2 * * * root APP_DIR=$APP_DIR BACKUP_REMOTE=${BACKUP_REMOTE:-} /usr/local/sbin/triad-backup >> /var/log/triad-backup.log 2>&1' > /etc/cron.d/triad-backup && \
  chmod 644 /etc/cron.d/triad-backup && APP_DIR='$APP_DIR' /usr/local/sbin/triad-backup"
echo "   Copy /root/.triad-backup.key from the server to a safe place: without it the backups cannot be decrypted."

say "health"
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then echo "   https://$DOMAIN is up"; break; fi
  sleep 5
done

cat <<EOF

== done: https://$DOMAIN
   - First super admin: open the one-time setup link printed by the seed above (valid 72 h).
     Lost it? bash deploy/whitelabel/setup-link.sh $TARGET
   - Then: System → Brand (logo, icon, colours), Settings (contact, offices, social), Legal (Impressum data),
     System → License (status), and set SMTP_* in $APP_DIR/.env.production if not passed in.
   - Record the customer on your own site: System → Customers (paste the licence key there).
   - Updates: bash deploy/whitelabel/update-instance.sh $TARGET
EOF
