# Triad Vision

Website and client portal for **Triad Vision**, an agency that places workers from Azerbaijan with German companies (triad-vision.de).

- **Public site** in 4 languages (AZ, DE, EN, RU) with 3D globe hero and scroll animations
- **Client portal** for the visa case: document upload → review → contract e-signature → embassy documents → appointment → decision, with an in-app and email notification at every step
- **Admin panel** (Azerbaijani) to run cases and edit all site content

## Stack

| Part | Tech |
|---|---|
| Frontend (`client/`) | React 19, Vite, TypeScript, Tailwind CSS 4, Framer Motion, GSAP ScrollTrigger, Lenis, Three.js (react-three-fiber), i18next, TanStack Query |
| Backend (`server/`) | Node.js, Express 5, TypeScript, Prisma, MySQL 8.4, Nodemailer, pdf-lib |

## First run

Requirements: Node.js 20+, Docker Desktop.

```bash
npm install                 # installs client and server (npm workspaces)
cp server/.env.example server/.env   # then set JWT_SECRET (already done on the dev machine)
npm run setup               # starts MySQL in Docker (port 3308), runs migrations, seeds content + admin user
npm run dev                 # API on :4000, site on http://localhost:5173
```

Admin login after seeding: the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `server/.env`. **Change the password after the first login.**

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
  src/routes/            auth, public, cases (client), files, notifications, admin/*
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
