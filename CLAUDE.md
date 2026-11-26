# Triad Vision — project map for Claude

Agency placing Azerbaijani workers with German employers (triad-vision.de). Owner writes Azerbaijani; answer in Azerbaijani.

## Stack
- `client/` React + Vite + Tailwind, SSR via `client/ssr/server.mjs` (prerender; Caddy include `/__ssr/render`). Public data prefetched for SSR: `SSR_QUERY_KEYS` in `client/src/entry-server.tsx`.
- `server/` Express + Prisma (MySQL 8.4). Routes mounted in `server/src/app.ts` and `server/src/routes/admin/index.ts`. Jobs: `server/src/jobs/*` (in-process scheduler `lib/scheduler.ts`).
- `mobile/` Expo app (only some features). `deploy/` Caddyfile, Docker, deploy scripts. `tests/visual/baseline` screenshot baselines.
- Languages: az (default, no prefix), de, en, ru, tr, uk (`/de/...`). Copy modules: `client/src/i18n/pages*.ts` exporting `{az,de,en,ru,tr?,uk?}`; large ones load per language via `?lazy-copy` (`client/vite/lazyCopy.ts`). Server texts: `texts.ts` per lib. Azerbaijani wording rules: `docs/az-terminology.md` (test enforces).

## Roles & access (security-critical)
- Roles: CLIENT, COMPANY (employer; internal roles in `lib/companyAccess`), AGENT (partner; permissions in `lib/partnerAccess`), STAFF, ADMIN, SUPER_ADMIN.
- Staff permissions + case scope: `server/src/lib/access/*` (`routeMap.ts` must map every admin route — unit test enforces). Sensitive field masking: `lib/privacy/mask.ts`, `sensitiveRules.ts`. Login security: `lib/loginSecurity`.
- "View as client" (impersonation) is read-only at DB level (`impersonationWriteGuard` in `src/db.ts`); GET handlers must skip lazy writes with `isImpersonating()`.
- Defaults must reproduce existing access; changes only via the Access Center (`/admin/access`).

## Business rules
- We do NOT offer apostille or translation and do NOT book embassy appointments: we prepare documents, the client applies, the embassy decides.
- No paid AI features for new work (cost). Phone everywhere: +994 51 414 14 01 (`client/src/lib/brand.ts`, `server/src/lib/brand`).
- Vacancies: one source (`/admin/vacancies`); places = `positions` − filled; policy "clients only apply to active vacancies" (`lib/vacancyPlaces/policy.ts`); deactivated = CLOSED after publication or expired (`lib/vacancyActive.ts`).
- Contracts: ONE contract (`lib/caseContracts`): Əmək müqaviləsi (staff upload own PDF → client signs → Triad signs → approved); the İş müqaviləsi is retired (kept only for old cases that already have one). After approval: once the client has paid, the German documents (Arbeitsvertrag etc.) are prepared in the Drive workflow (Schon geschrieben → In Bearbeitung → Fertig) and sent from Fertig; that send moves the case CONTRACT_SIGNED → EMBASSY_DOCUMENTS and the employer is shown to the client. No employer signer.

## Working rules (keep token use low)
- Small change → do it directly; read only the files involved. Use subagents only for large independent work, at most 1–2 at a time; use a cheaper model (`model: "sonnet"` / `"haiku"`) for simple tasks (translations, test writing, searches).
- Local checks: only typecheck + the tests of what changed. Full unit/e2e/visual run in CI — rely on CI.
  - server: `npx prisma generate`, `npx tsc --noEmit -p .`, `npx tsc --noEmit -p tests/tsconfig.json`, `npx vitest run --project unit <files>`
  - client: `npx tsc --noEmit -p .`, `npx vitest run <files>`
- Windows dev machine: run npm/npx from PowerShell; keep file line endings (some files are CRLF).
- e2e tests need MySQL (CI only). Test helpers: `server/tests/helpers/*`; `resetDb` must list new tables.
- Visual baseline changes: run the "Visual baselines" workflow, check the PNGs, commit them.

## Deploy
- Push to `main` → CI (`.github/workflows/ci-cd.yml`): typecheck/build, unit, 12 e2e shards, images built in parallel on the runner → deploy ships prebuilt images (`deploy/ci-deploy.sh deploy-prebuilt`). Never build on the 2 GB server.
- Server: Linode 172.104.149.241, app in `/opt/triad-vision/src` (replaced each deploy). Secrets only in `/opt/triad-vision/.env.production` (src/.env.production is a symlink). Never print secrets.
- Commit messages end with the Co-Authored-By line given by the harness.
