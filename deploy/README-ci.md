# CI/CD (GitHub Actions)

Workflow: `.github/workflows/ci-cd.yml`

| Trigger | What runs |
|---|---|
| Push to any branch / pull request | Typecheck (server, client, mobile), client build, CSP-hash check, Caddyfile validation, mobile tests, server unit tests, server e2e tests in 12 parallel shards (each with its own MySQL 8.4) |
| Push to `main`, everything green | Deploy to production, then `https://triad-vision.de/api/health` must answer 200 |
| Actions → CI/CD → Run workflow | Same as a push; untick "deploy" to only test |

A failing check blocks the deploy. A newer push cancels the older run, but a deploy that has started always finishes (separate `production-deploy` concurrency group).

## How the deploy works

1. The runner streams `git archive HEAD` over SSH: `… | ssh root@server deploy`.
2. On the server the key is pinned in `/root/.ssh/authorized_keys` as
   `restrict,command="/usr/local/sbin/triad-ci-deploy" ssh-ed25519 … github-actions-deploy@triad-vision`.
   That key can **only** run `deploy/ci-deploy.sh`: no shell, no other command, no port forwarding, no PTY.
3. `triad-ci-deploy` checks the archive, runs the nightly backup script once (`/usr/local/sbin/triad-backup`),
   then the normal `deploy/remote-deploy.sh` (build, migrations, seed, cleanup).

Manual deploys from a workstation (`bash deploy/push.sh root@172.104.149.241`) keep working.

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
