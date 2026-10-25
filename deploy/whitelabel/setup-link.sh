#!/usr/bin/env bash
# A new one-time "set your password" link for the SUPER_ADMIN of a white-label instance (when the link printed
# by the first deploy expired or got lost). Earlier unused links of that account stop working.
#
#   bash deploy/whitelabel/setup-link.sh root@203.0.113.10 [admin@agency.example]
set -euo pipefail
# shellcheck source=deploy/whitelabel/lib.sh
source "$(dirname "$0")/lib.sh"

TARGET=${1:-}
EMAIL=${2:-}
[ -n "$TARGET" ] || die "usage: setup-link.sh <ssh-target> [email]"
[ -z "$EMAIL" ] || [[ "$EMAIL" =~ ^[^[:space:]\'\"]+@[^[:space:]\'\"]+$ ]] || die "invalid e-mail"
remote_compose "$TARGET" "exec -T api npx tsx prisma/setupLink.ts '$EMAIL'"
