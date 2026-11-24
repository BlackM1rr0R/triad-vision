# Browser tests (Playwright, Chromium)

Real clicks through the built app: public pages, the client cabinet and admin/workspace screens. They catch what the
unit and API e2e tests cannot see — covered dropdowns, links that do nothing, auto-sent uploads, contradicting status
texts, growing iframes, scroll jumps. Every test also fails on uncaught page errors, `console.error` (minus
[allowlist.ts](allowlist.ts)) and HTTP 5xx answers.

CI: job **Browser tests** in `.github/workflows/ci-cd.yml`, on every push / PR; the deploy waits for it.
Artifacts: `browser-report` (HTML report, traces, videos, screenshots — only when something failed) and
`browser-crawl` (full-page screenshots of the key screens, always; not compared with anything). 14 days.

## How it runs

```
playwright.config.ts  ── webServer 1: npx tsx tests/browser/scripts/start-api.ts
                      │     prisma migrate deploy → server/tests/browser/seed.ts → server/tests/browser/serve.ts (API :4100)
                      └─ webServer 2: scripts/ci/static-server.mjs  client/dist on :4173, /api + /uploads → :4100
```

- **Database**: own database `triad_vision_browser` (env `BROWSER_DB_NAME`; host/user/password from the e2e variables
  `TEST_DB_HOST`, `TEST_DB_USER`, `TEST_DB_PASSWORD`). The seed **wipes every row** first (`resetDb`), then builds
  the data through the real API in-process, and writes ids / tokens to `tests/browser/.data/seed.json`.
  It refuses to run without `NODE_ENV=test` or against a database whose name does not contain `_browser`.
- **API**: the normal `createApp()` with `NODE_ENV=test`, but without the job scheduler (jobs would change the seeded
  data mid-run). Environment: [env.ts](env.ts).
- **Seeded clients** (one per scenario so tests never depend on each other): `viewer` (handed in, read-only tests),
  `docs` (nothing uploaded), `submit` (all uploaded, not handed in), `replace` (one document rejected),
  `messages` (staff message + "Yeni mesaj" notification), `review` (pending documents, client message, drive folder).
  Flow specs (flows.spec.ts): `contract` (Əmək müqaviləsi sent, client signs first), `docLink` (embassy list exists; one upload fills both lists), `external` (apply via Triad Vision, guide to self-send; employer-page fetch replaced by an injected offline fetcher).
  Plus a super admin with a mailbox (two long HTML mails) and an open vacancy.

### How staff sign in (2FA)

Staff accounts always need two-factor authentication and **nothing is bypassed**:

- The seed enrolls the super admin in TOTP with a random secret (stored sealed, exactly like a real enrolment) and
  writes the secret to `seed.json`. The test "staff login with password + authenticator code" types the password,
  then the current 6-digit code computed from that secret (`totp()` in [fixtures.ts](fixtures.ts)) — the real
  `/login` → `/login/2fa` flow.
- All other tests start with a session cookie that the seed opened with `issueSession` (the same helper the server
  e2e tests use) — a direct row in the **test** database, signed with the test-only `JWT_SECRET` from env.ts.

No server code knows about the browser tests: there is no flag, header or setting that skips 2FA, so production
cannot be weakened by them. `serve.ts` and the seed throw unless `NODE_ENV=test`.

## Run locally

Needs MySQL (`npm run db:up` — port 3308, user `triad`) and Chromium once: `npx playwright install chromium`.

```powershell
npm run build -w client                  # or: cd client; npx vite build
npx playwright test -c tests/browser     # starts seed + API + static server itself
npx playwright test -c tests/browser specs/client.spec.ts --headed
npx playwright show-report tests/browser/output/report
npx playwright show-trace tests/browser/output/test-results/<test>/trace.zip
```

Locally a running API / static server on 4100 / 4173 is reused (`reuseExistingServer`) — then the seed does not run
again; stop them (or restart `npx tsx tests/browser/scripts/start-api.ts`) for fresh data. The tests change their
data (uploads, hand-ins, reviews), so run them on a fresh seed; that is also why there are no retries.

Checks without MySQL: `npx tsc --noEmit -p tests/browser`, `npx playwright test -c tests/browser --list`, and the
server typecheck for the seed (`cd server; npx tsc --noEmit -p tests/tsconfig.json`).

## Writing / updating tests

- Selectors: roles and the Azerbaijani texts the user sees (`getByRole('button', { name: 'Göndər' })`), ids that
  already exist (`#docs-initial`, `#current-step-title`), `data-testid` only where text is ambiguous.
- No fixed sleeps for state: `expect(...)` polls. Fixed windows are only used where the measurement *is* time
  (scroll jumps after load, iframe height measured twice 1 s apart).
- New scenario → new seeded user in `server/tests/browser/seed.ts` and its type in `Seed` (fixtures.ts).
- Copy changed → update the strings here; a renamed button failing a test is the point.
- Known app bug kept visible as `test.fixme`: mail reader frame grows without end for a mail with a
  `min-height:100vh` block (admin.spec.ts). Remove the fixme when `MailBody.tsx` is fixed.
