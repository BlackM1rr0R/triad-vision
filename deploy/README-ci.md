# CI/CD (GitHub Actions)

Workflow: `.github/workflows/ci-cd.yml`

| Trigger | What runs |
|---|---|
| Push to any branch / pull request | Typecheck (server, client, mobile), client build, CSP-hash check, SSR render check, Caddyfile validation, mobile tests, server unit tests, server e2e tests in 12 parallel shards (each with its own MySQL 8.4) |
| Push to `main`, everything green | Deploy to production, then `https://triad-vision.de/api/health` must answer 200 |
| Actions → CI/CD → Run workflow | Same as a push; untick "deploy" to only test |

A failing check blocks the deploy. A newer push cancels the older run, but a deploy that has started always finishes (separate `production-deploy` concurrency group).

## How the deploy works

The images are built **on the GitHub runner**, never on the server: the production server has 2 GB RAM, and the
server-side build (`npm ci`, Prisma, Vite) swap-thrashed it so badly that the site and SSH were down for 20+ minutes.

1. The runner asks the server `ssh root@server capabilities` (must answer `deploy-prebuilt`, see "One-time install").
2. `deploy/build-images.sh` builds `api`, `ssr` and `web` from `git archive HEAD` (the same bytes the server
   unpacks; same Dockerfiles, targets and contexts as `docker-compose.prod.yml`; `--pull` for patched base images;
   `ssr` and `web` share the cached site build) and writes one gzip'd `docker save` archive (a few hundred MB).
   No build args or secrets: the images hold nothing server-specific (Caddy reads `SITE_DOMAIN`/`ACME_EMAIL`, the API
   its settings, from `.env.production` at runtime), so they are identical to server-built ones.
3. The runner streams `tar(src.tar.gz, images.tar.gz)` over SSH: `… | ssh root@server deploy-prebuilt`.
4. On the server the key is pinned in `/root/.ssh/authorized_keys` as
   `restrict,command="/usr/local/sbin/triad-ci-deploy" ssh-ed25519 … github-actions-deploy@triad-vision`.
   That key can **only** run `deploy/ci-deploy.sh`: no shell, no other command, no port forwarding, no PTY.
5. `triad-ci-deploy` checks free disk (3 GB on `/var/tmp` and Docker's disk, after dropping build cache if
   needed), receives the bundle into `/var/tmp` (not a RAM-backed `/tmp`), checks it, runs the backup once
   (`/usr/local/sbin/triad-backup`), then `deploy/remote-deploy.sh` with `PREBUILT_IMAGES`: `docker load`, re-tag
   to the names compose expects (`src-api`, `src-web`, `src-ssr`), `up -d --no-build`, migrations, seed, cleanup
   (old images and all build cache are removed). Nothing is compiled on the server.

Then the job checks `https://triad-vision.de/api/health`.

### One-time install (after this change, and whenever `deploy/ci-deploy.sh` changes)

```bash
# on the server, from a checkout/unpacked copy of the current main (e.g. /opt/triad-vision/src after a deploy)
install -m 700 deploy/ci-deploy.sh /usr/local/sbin/triad-ci-deploy
```

Until then the deploy job stops at "Server accepts prebuilt images" with this hint (nothing is touched on the server).

### Fallback: build on the server (old flow)

Set the repository variable `DEPLOY_SERVER_BUILD` to `1` (Settings → Secrets and variables → Actions → Variables) and
re-run the job: the runner then streams only the source (`ssh root@server deploy`) and `remote-deploy.sh` builds the
images on the server as before. Risky on the 2 GB server (swap); delete the variable again afterwards.

### Manual deploys from a workstation

- `PREBUILT=1 bash deploy/push.sh root@172.104.149.241` — builds the images locally (needs Docker; builds for
  `linux/amd64`), uploads them and only loads/starts them on the server. Preferred.
- `bash deploy/push.sh root@172.104.149.241` — old flow, builds on the server.

Neither runs the backup first (CI does); run `/usr/local/sbin/triad-backup` on the server before if in doubt.

### Rolling back

Revert the bad commit on `main` (or re-run the deploy job of the last good run made after this change): images are
rebuilt from that commit and loaded the same way. Careful: re-running a run from *before* this change uses that
commit's workflow, i.e. the old server-side build. Database migrations are not rolled back.
To undo this change itself, set `DEPLOY_SERVER_BUILD=1` (above); `ci-deploy.sh` still accepts the old `deploy` command.

## Secrets (repository → Settings → Secrets and variables → Actions)

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `172.104.149.241` |
| `DEPLOY_SSH_KEY` | private key of the deploy-only key pair (ed25519) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519,ecdsa,rsa 172.104.149.241` (host key ED25519 `SHA256:9pMxjDouYVRHa3tNqYRYrC3n9Ucnvh0cXPzUkJr2BVc`) |

## Rotating or revoking the deploy key

- Revoke: delete the `github-actions-deploy@triad-vision` line from `/root/.ssh/authorized_keys` on the server.
- Rotate: `ssh-keygen -t ed25519 -N "" -C github-actions-deploy@triad-vision -f deploy_key`, put the new
  `.pub` into that line (keep the `restrict,command=…` prefix), store the private key in `DEPLOY_SSH_KEY`, delete the local files.
- After updating `deploy/ci-deploy.sh` in the repo, install it again on the server:
  `install -m 700 deploy/ci-deploy.sh /usr/local/sbin/triad-ci-deploy`.

## Optional hardening

- Settings → Environments → `production`: add yourself as a required reviewer to approve each deploy by hand.
- Settings → Branches: protect `main` (require the CI/CD checks before merging pull requests).

## Backup restore test (weekly)

`deploy/backup-verify.sh` restores the newest archive of the nightly backup (`/usr/local/sbin/triad-backup`,
`/var/backups/triad/triad-*.tar.gz.enc`) into a throwaway MySQL container (same `mysql:8.4` image, no network,
random root password that is never printed, removed afterwards), checks it (at least 50 tables; `User`, `Setting`,
`_prisma_migrations` not empty; `User`, `Case`, `Document`, `Inquiry`, `Task`, `Setting`, `_prisma_migrations` at
least 90 % of the live row counts; newest archive not older than 48 h) and writes the result into the live
database (Setting row `ops:backupCheck`, via `docker exec` into the db container). The API then notifies all
admins (in-app + e-mail; a failure is e-mailed even to admins with e-mail notifications off), warns once when no
check arrived for 9 days, and shows the last result on **Admin → Security** ("Backup verification").

Install once on the server (as root, from a checkout of the repo, e.g. `/opt/triad-vision/src`):

```bash
install -m 700 deploy/backup-verify.sh /usr/local/sbin/triad-backup-verify
printf '%s\n' 'SHELL=/bin/bash' \
  '30 4 * * 0 root /usr/local/sbin/triad-backup-verify >> /var/log/triad-backup-verify.log 2>&1' \
  > /etc/cron.d/triad-backup-verify
chmod 644 /etc/cron.d/triad-backup-verify
/usr/local/sbin/triad-backup-verify   # first run by hand (2-5 minutes); then check Admin → Security
```

Sunday 04:30 server time, after the nightly backup (02:30). Settings via environment in the cron line if needed:
`BACKUP_DIR`, `KEY_FILE`, `DB_CONTAINER` (default `src-db-1`), `VERIFY_IMAGE`, `MAX_AGE_HOURS`, `MIN_TABLES`,
`MIN_RATIO`, `KEY_TABLES`, `REQUIRED_TABLES`, `VERIFY_MEMORY` (default `768m`). `NO_REPORT=1` only prints the
result JSON (dry run). Exit code 0 = verified, 1 = failed (reported), 2 = the result could not be written.
After changing `deploy/backup-verify.sh` in the repo, run the `install` line again.
