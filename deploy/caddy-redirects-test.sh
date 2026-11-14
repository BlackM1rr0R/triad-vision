#!/bin/sh
# Runs deploy/Caddyfile in a throwaway Caddy container (SITE_DOMAIN=localhost, Caddy's internal CA, no API or
# SSR upstream) and checks the redirects that need no backend: legacy ?lng= links, /az/…, trailing slashes and
# the old alias routes. Private areas must keep their ?lng= (no redirect). Used by CI (.github/workflows/ci-cd.yml);
# locally: sh deploy/caddy-redirects-test.sh (needs Docker).
set -u
cd "$(dirname "$0")/.."
NET=tv-caddy-test-$$
NAME=tv-caddy-test-$$
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
trap cleanup EXIT
docker network create "$NET" >/dev/null
docker run -d --name "$NAME" --network "$NET" -e SITE_DOMAIN=localhost -e ACME_EMAIL=ci@example.com \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine >/dev/null
sleep 3

# request | expected status | expected Location ("-" = none)
CASES='
/salary-calculator?lng=ru|301|https://localhost/ru/salary-calculator
/salary-calculator?lng=en&x=1|301|https://localhost/en/salary-calculator?x=1
/cities?x=2&lng=de|301|https://localhost/de/cities?x=2
/?lng=de|301|https://localhost/de
/?lng=az|301|https://localhost/
/contact?lng=az|301|https://localhost/contact
/partners?lng=en|301|https://localhost/en/partners
/salary-calculator?lng=RU|301|https://localhost/ru/salary-calculator
/salary-calculator?lng=ru-RU|301|https://localhost/ru/salary-calculator
/salary-calculator/?lng=uk|301|https://localhost/uk/salary-calculator
/salary-calculator?lng=xx|301|https://localhost/salary-calculator
/salary-calculator?lng=|301|https://localhost/salary-calculator
/de/jobs?lng=ru|301|https://localhost/de/jobs
/de/?lng=en&a=b|301|https://localhost/de?a=b
/ru?lng=ru|301|https://localhost/ru
/tr/about?lng=tr|301|https://localhost/tr/about
/calculators?lng=de|301|https://localhost/de/calculators
/de/calculators|301|https://localhost/de/tools
/employers|301|https://localhost/for-employers
/visas/|301|https://localhost/visas
/de/|301|https://localhost/de
/az/visas|301|https://localhost/visas
/admin?lng=ru|404|-
/partner/home?lng=en|404|-
/r/slug?lng=ru|404|-
/job-alert?token=x&lng=ru|404|-
/de/admin?lng=ru|404|-
'
# (404 / no Location: no redirect happened; the SPA files are not mounted in this container.)
fail=0
echo "$CASES" | while IFS='|' read -r url status location; do
  [ -z "$url" ] && continue
  got=$(docker run --rm --network "$NET" curlimages/curl:8.11.1 -sk --connect-to "localhost:443:$NAME:443" \
    -o /dev/null -w '%{http_code}|%{redirect_url}' "https://localhost$url")
  want="$status|$([ "$location" = "-" ] && echo "" || echo "$location")"
  if [ "$got" = "$want" ]; then
    echo "ok   $url -> $got"
  else
    echo "FAIL $url -> $got (want $want)"
    echo fail >> "/tmp/$NAME.failed"
  fi
done
if [ -f "/tmp/$NAME.failed" ]; then
  rm -f "/tmp/$NAME.failed"
  exit 1
fi
