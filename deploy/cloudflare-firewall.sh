#!/usr/bin/env bash
# Allow HTTP/HTTPS to the containers only from Cloudflare, so nobody can bypass Cloudflare (DDoS/WAF)
# by talking to the server's IP directly. SSH is not touched.
#
# Docker publishes ports through its own iptables chains, which skip ufw's INPUT rules; the only
# supported hook is the DOCKER-USER chain. We keep the rules in ufw's after*.rules files so they
# survive reboots and `ufw reload`.
#
# Usage (root): deploy/cloudflare-firewall.sh        install / refresh (safe to re-run; weekly cron)
set -euo pipefail

IFACE="${IFACE:-$(ip -o -4 route show default | awk '{print $5}' | head -1)}"
BEGIN="# BEGIN triad-vision cloudflare"
END="# END triad-vision cloudflare"

fetch() {
  local list
  list="$(curl -fsS --max-time 20 "$1")" || return 1
  # sanity check: Cloudflare publishes 10+ v4 and 5+ v6 ranges; refuse anything suspicious
  [ "$(printf '%s\n' "$list" | grep -cE '^[0-9a-f:.]+/[0-9]+$')" -ge "$2" ] || return 1
  printf '%s\n' "$list" | grep -E '^[0-9a-f:.]+/[0-9]+$'
}

if ! V4="$(fetch https://www.cloudflare.com/ips-v4 10)" || ! V6="$(fetch https://www.cloudflare.com/ips-v6 5)"; then
  echo "Could not download Cloudflare ranges; keeping the current rules." >&2
  exit 1
fi

block() { # $1 = list of ranges
  echo "$BEGIN"
  echo "*filter"
  echo ":DOCKER-USER - [0:0]"
  echo "-F DOCKER-USER"
  echo "-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN"
  echo "-A DOCKER-USER ! -i $IFACE -j RETURN"
  while read -r net; do
    [ -n "$net" ] || continue
    echo "-A DOCKER-USER -i $IFACE -s $net -p tcp -m multiport --dports 80,443 -j RETURN"
    echo "-A DOCKER-USER -i $IFACE -s $net -p udp --dport 443 -j RETURN"
  done <<< "$1"
  echo "-A DOCKER-USER -i $IFACE -p tcp -m multiport --dports 80,443 -j DROP"
  echo "-A DOCKER-USER -i $IFACE -p udp --dport 443 -j DROP"
  echo "-A DOCKER-USER -j RETURN"
  echo "COMMIT"
  echo "$END"
}

install_block() { # $1 = file, $2 = block text
  local file="$1" tmp
  tmp="$(mktemp)"
  # drop any previous copy of our block, then append the fresh one
  awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$file" > "$tmp"
  printf '%s\n' "$2" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

cp -a /etc/ufw/after.rules "/etc/ufw/after.rules.bak.$(date +%Y%m%d%H%M)"
cp -a /etc/ufw/after6.rules "/etc/ufw/after6.rules.bak.$(date +%Y%m%d%H%M)"
install_block /etc/ufw/after.rules "$(block "$V4")"
install_block /etc/ufw/after6.rules "$(block "$V6")"

# Port 80/443 rules in ufw's INPUT chain are meaningless for Docker-published ports; remove them so the
# ufw status shows the real picture (only SSH is open on the host itself).
for rule in "80/tcp" "443/tcp" "443/udp"; do
  while ufw status | grep -qE "^$rule +ALLOW( IN)? +Anywhere"; do ufw --force delete allow "$rule" >/dev/null || break; done
done

ufw reload >/dev/null
echo "Cloudflare-only HTTP/HTTPS active on $IFACE: $(printf '%s\n' "$V4" | wc -l) IPv4 + $(printf '%s\n' "$V6" | wc -l) IPv6 ranges."
