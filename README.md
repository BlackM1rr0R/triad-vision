# Triad Vision

Website and client portal for **Triad Vision**, an agency that places workers from Azerbaijan with German companies (triad-vision.de).

- **Public site** in 4 languages (AZ, DE, EN, RU) with an animated hero globe (CSS/SVG, no WebGL) and scroll animations
- **Client portal** for the visa case: document upload → review → contract e-signature → embassy documents → appointment → decision, with an in-app and email notification at every step
- **Admin panel** (Azerbaijani) to run cases and edit all site content
- **Staff document workspaces**: every staff member has a folder on the server named by first name, with a fixed layout, one folder per company:
  ```
  server/docs/tofig/senedleri
  server/docs/abdulla/senedleri/arintransport/senedler
  server/docs/abdulla/senedleri/kayatransport/senedler
  ```
  Upload/download/rename/move/delete into any folder, "Yeni firma" creates `senedleri/<firma>/senedler` in one click, ZIP export, and per-person permissions (view only / download / edit) granted by the super admin. Files are limited to 5 MB (`DOCS_MAX_FILE_MB`, `UPLOAD_MAX_FILE_MB`).
- **Super admin** (the seeded account) creates staff accounts, sets workspace permissions, can log anyone out everywhere and reads the audit trail
- **Oversight** (super admin, `/admin/oversight`): everything in one place — users by role, who is online, per-staff activity (online time per day, logins, case actions, documents reviewed, messages, workspace uploads, assigned cases), daily activity series, and a per-person drill-down (sessions, timeline, workspace sharing). All figures are derived from existing tables (sessions, case events, messages, documents, audit log); nothing is stored twice.

## Stack

| Part | Tech |
|---|---|
| Frontend (`client/`) | React 19, Vite, TypeScript, Tailwind CSS 4, Framer Motion, i18next, TanStack Query |
| Backend (`server/`) | Node.js, Express 5, TypeScript, Prisma, MySQL 8.4, Nodemailer, pdf-lib |

## First run

Requirements: Node.js 20+, Docker Desktop.

```bash
npm install                 # installs client and server (npm workspaces)
cp server/.env.example server/.env   # then set JWT_SECRET (already done on the dev machine)
npm run setup               # starts MySQL in Docker (port 3308), runs migrations, seeds content + admin user
npm run dev                 # API on :4000, site on http://localhost:5173
```

Admin login after seeding: the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `server/.env`. This account is the **super admin**. **Change the password after the first login.**

Roles: `CLIENT` < `STAFF` < `ADMIN` < `SUPER_ADMIN`. Staff work cases and have a document workspace; admins also edit site content and settings; only the super admin manages accounts and workspace permissions.

## Email

Without `SMTP_HOST`, emails are printed to the server console and logged in the `EmailLog` table. To send real email via Gmail, set in `server/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@gmail.com
SMTP_PASS=<16-char Google App Password>
```

Staff notifications (new applications, inquiries, client actions) go to `ADMIN_NOTIFY_EMAIL`.

## Security

- **Sessions** are server-side (`Session` table). The JWT only references a session, so logout, a password change/reset, a deactivation or an admin action revokes it immediately. Web sessions end after 30 min of inactivity and 12 h at most; mobile sessions after 14 / 30 days (`SESSION_*` in `.env`). Clients receive `401 SESSION_EXPIRED` / `SESSION_REVOKED` and show the reason.
- **Login protection**: per-IP rate limit plus a per-account lock after 5 wrong passwords (`LOGIN_*`), constant-time password check, no user enumeration on login or password reset.
- **CSRF**: `SameSite=Lax` cookie, CORS restricted to `CLIENT_URL`/`ALLOWED_ORIGINS`, and every cookie-authenticated write must carry a matching `Origin`/`Sec-Fetch-Site` header. Mobile uses Bearer tokens.
- **Uploads**: the declared type must match the extension *and* the file's magic bytes; HTML/SVG/scripts are never stored in workspaces; files are served with `nosniff` and a sandboxed CSP; names are sanitised and paths cannot leave the workspace.
- **Headers**: helmet (CSP `default-src 'none'`, HSTS in production, no-referrer), `Cache-Control: no-store` on every private API response, `X-Request-Id` on every response for log correlation.
- **Audit log** (`AuditLog` table, visible to the super admin under Sənədlər → Audit): logins that failed, password changes/resets, session revocations, account changes, permission changes and every workspace file change.
- **Deployment**: set `NODE_ENV=production`, a 32+ character `JWT_SECRET` (the server refuses to start otherwise), `TRUST_PROXY=1` only behind exactly one reverse proxy, and serve the API and the site from the same origin (the session cookie is `SameSite=Lax`).

## Production deployment (Docker, one server)

Stack: MySQL 8.4 + API + Caddy (serves the built site, obtains Let's Encrypt certificates, proxies `/api` and `/uploads`). DNS: `triad-vision.de` and `www` → the server's IP as plain A records (Cloudflare "DNS only").

```bash
# 1. once, on a fresh Ubuntu server (installs Docker, firewall, /opt/triad-vision, generates secrets)
ssh root@SERVER 'bash -s' < deploy/server-setup.sh
# 2. fill SMTP_* and SEED_ADMIN_PASSWORD in /opt/triad-vision/.env.production on the server
# 3. from your machine, every time you want to ship the current code
deploy/push.sh root@SERVER
```

`push.sh` uploads the working tree (ignored files excluded), builds the images on the server, applies migrations, runs the idempotent seed and prints the container status. Data lives on the host under `/opt/triad-vision/data`: `mysql/`, `uploads/` (case files), `docs/` (staff workspaces, e.g. `docs/tofig/senedleri/...`), `caddy/` (certificates). Back up that directory.

Useful on the server (`cd /opt/triad-vision/src`): `docker compose -f docker-compose.prod.yml logs -f api`, `... ps`, `... restart api`, `... exec db mysqldump -uroot -p triad_vision > backup.sql`.

**White-label (other agencies, one instance each):** brand configuration, licence keys and provisioning scripts are
described in [deploy/whitelabel/README.md](deploy/whitelabel/README.md).

## Tests

```bash
npm test -w server          # unit + e2e (e2e needs the MySQL container: npm run db:up)
npm run test:unit -w server
npm run test:e2e -w server
npm run typecheck -w server
npm run typecheck -w client && npm run build -w client
```

The e2e suite uses a separate database `triad_vision_test` and temp upload/docs folders. On a fresh container the grants come from `docker/mysql-init.sql`; on a container created before that file existed, run it once: `docker exec -i triad-vision-mysql mysql -uroot -ptriad_root_dev_password < docker/mysql-init.sql`.

## Visa case workflow

Enforced on the server in `server/src/lib/caseFlow.ts`; every transition is an atomic conditional update, so two people can never move a case at once.

```
DOCUMENTS_PENDING ──client submits──▶ DOCUMENTS_REVIEW ──staff requests changes──▶ DOCUMENTS_PENDING
                                          │ all required docs accepted + contract PDF uploaded
                                          ▼
                                    CONTRACT_SENT ──client e-signs──▶ CONTRACT_SIGNED ──staff rejects signature──▶ CONTRACT_SENT
                                                                          │ staff confirms
                                                                          ▼
EMBASSY_DOCUMENTS ──client submits──▶ EMBASSY_REVIEW ──staff requests changes──▶ EMBASSY_DOCUMENTS
                                          │ all required embassy docs accepted
                                          ▼
                              APPOINTMENT_SCHEDULED (reschedulable) ──lodged──▶ DECISION_PENDING ──▶ APPROVED | REJECTED (reason required)

Any open case ──▶ CANCELLED.   REJECTED / CANCELLED ──reopen──▶ DOCUMENTS_PENDING | EMBASSY_DOCUMENTS
```

The signed contract is produced on the server: the original PDF plus a signature certificate page (signer name, email, UTC time, IP, user agent, SHA-256 of the original, drawn signature).

Case documents are stored in `server/uploads/private` and are only served to the case owner and staff.

## Project layout

```
server/
  prisma/schema.prisma   data model
  prisma/seed.ts         initial content (4 languages), admin user, contact settings
  src/lib/caseFlow.ts    workflow state machine
  src/lib/notifications.ts  notification texts (4 languages) + email
  src/lib/docs.ts        staff document workspaces (folders, paths, access levels)
  src/lib/fileCheck.ts   upload content sniffing (magic bytes per MIME type)
  src/lib/zip.ts         dependency-free ZIP writer for workspace export
  src/middleware/auth.ts sessions (issue/verify/revoke), role hierarchy, CSRF origin guard
  src/routes/            auth, public, cases (client), files, notifications, docs (workspaces), admin/*
  src/routes/admin/oversight.ts  super-admin oversight: summary, daily activity series, staff drill-down
client/
  src/i18n/              UI strings az/de/en/ru
  src/components/        layout, motion, home sections, 3D globe, cards
  src/pages/             public pages, auth, account/ (client portal), admin/
```

## Before going live

- Replace placeholder photos (Unsplash) with your own via Admin → Məzmun.
- Office addresses in Admin → Ayarlar are placeholders.
- Add Impressum and Datenschutzerklärung pages (required for a German site).
- Use a managed MySQL 8 (utf8mb4), set `NODE_ENV=production`, a strong `JWT_SECRET`, HTTPS, and back up `server/uploads/private`.

## Testing

The API has a Vitest suite in `server/tests` (`unit/` has no database; `e2e/` drives `createApp()` in-process with supertest).

```bash
npm run db:up                  # the e2e tests need the MySQL container (localhost:3308)
npm test -w server             # unit + e2e
npm run test:unit -w server    # unit tests only (no database)
npm run test:e2e -w server     # e2e tests only
npm run test:coverage -w server  # coverage report in server/coverage/
npm run test:watch -w server   # watch mode
npm run typecheck -w server    # type-checks src and tests
```

- The e2e tests use their own database, `triad_vision_test`. It is created and migrated automatically (`prisma migrate deploy`) before the run, and every test starts from empty tables. The dev database `triad_vision` is never touched.
- Uploaded files go to a temp folder (`UPLOADS_DIR`), not `server/uploads`. Emails are recorded in the `EmailLog` table and push sending is off (`NODE_ENV=test`).
- E2E files run one after another because they share the database. To use another MySQL server, set `TEST_DB_HOST`, `TEST_DB_USER`, `TEST_DB_PASSWORD` or `TEST_DB_NAME`.
