#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 server. Run as root:
#   ssh root@SERVER 'bash -s' < deploy/server-setup.sh
# Installs Docker, opens the firewall for SSH/HTTP/HTTPS, prepares /opt/triad-vision and a
# .env.production with generated secrets (you still fill in SMTP and the admin password).
set -euo pipefail

APP_DIR=/opt/triad-vision

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  echo "== docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

echo "== firewall"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

echo "== swap (small servers need it to build the images)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== app directory"
mkdir -p "$APP_DIR"/data/{mysql,uploads/private,uploads/public,docs,caddy/data,caddy/config}
cd "$APP_DIR"

if [ ! -f .env.production ]; then
  echo "== generating .env.production"
  DB_PW=$(openssl rand -hex 16)
  ROOT_PW=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 48)
  cat > .env.production <<EOF
SITE_DOMAIN=triad-vision.de
ACME_EMAIL=abdllyevv@gmail.com
CLIENT_URL=https://triad-vision.de
ALLOWED_ORIGINS=

MYSQL_DATABASE=triad_vision
MYSQL_USER=triad
MYSQL_PASSWORD=$DB_PW
MYSQL_ROOT_PASSWORD=$ROOT_PW
DATABASE_URL=mysql://triad:$DB_PW@db:3306/triad_vision

JWT_SECRET=$JWT
SESSION_IDLE_MINUTES=30
SESSION_MAX_HOURS=12
MOBILE_SESSION_IDLE_DAYS=14
MOBILE_SESSION_MAX_DAYS=30
LOGIN_MAX_FAILURES=5
LOGIN_LOCK_MINUTES=15

DOCS_MAX_FILE_MB=5
UPLOAD_MAX_FILE_MB=5

SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Triad Vision <no-reply@triad-vision.de>
ADMIN_NOTIFY_EMAIL=abdllyevv@gmail.com

SEED_ADMIN_EMAIL=abdllyevv@gmail.com
SEED_ADMIN_PASSWORD=CHANGE_ME_$(openssl rand -hex 6)
EOF
  chmod 600 .env.production
  echo "   wrote $APP_DIR/.env.production (fill SMTP_* and SEED_ADMIN_PASSWORD)"
fi

echo "== done. Next: deploy/push.sh root@$(hostname -I | awk '{print $1}')"
