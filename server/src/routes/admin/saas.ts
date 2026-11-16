import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { getBrand } from '../../lib/brand/index.js';
import { badRequest, conflict, HttpError, notFound, parse } from '../../lib/http.js';
import { assertStaffSeat } from '../../lib/license/index.js';
import { ensurePersonalRoot } from '../../lib/drive/roots.js';
import { renderEmail, sendMail, sendMailDetailed } from '../../lib/mailer.js';
import { listLeads, leadPatchSchema, updateLead } from '../../lib/saas/pipeline.js';
import { sellsPlatform } from '../../lib/saas/demoRequest.js';
import {
  REQUIRED_STEPS,
  STEP_KEYS,
  STEP_STATUSES,
  StepError,
  completeOnboarding,
  liveChecks,
  onboardingApplicable,
  progressOf,
  readOnboarding,
  reopenOnboarding,
  setCurrentStep,
  updateStep,
} from '../../lib/saas/onboarding.js';
import { INVITE_MAIL, TEST_MAIL } from '../../lib/saas/texts.js';

/**
 * SaaS administration (mounted under /api/admin, SUPER_ADMIN only — see routes/admin/index.ts):
 *
 * Owner instance — sales pipeline of the platform (System → Customers):
 *   GET   /saas-leads               → { items, counts, stages }
 *   PATCH /saas-leads/:id           { stage?, demoAt?, staffNotes? }  (trial / customer create / update the white-label customer record)
 *
 * Every instance — onboarding wizard (System → Onboarding):
 *   GET   /onboarding               → { applicable, state, progress, checks, steps, required }
 *   GET   /onboarding/status        → { applicable, completed, percent, next }  (admin banner)
 *   PUT   /onboarding/steps/:key    { status: open | done | skipped, data? }
 *   PUT   /onboarding/current       { step }
 *   PUT   /onboarding/offer         { countries: ISO2[], visaCategoryIds: string[] } → publishes exactly those visa types
 *   POST  /onboarding/invite        { email, firstName, lastName, role: STAFF | ADMIN, locale } → staff account + set-password e-mail
 *   POST  /onboarding/test-email    → sends a test e-mail to the signed-in SUPER_ADMIN, returns the SMTP outcome
 *   POST  /onboarding/complete      (every step before go-live done or skipped)
 *   POST  /onboarding/reopen
 */

// ─── Owner: SaaS pipeline ─────────────────────────────────────────────

export const adminSaasLeadsRouter = Router();

adminSaasLeadsRouter.use((_req, _res, next) => {
  if (!sellsPlatform()) return next(notFound('NOT_OWNER_INSTANCE'));
  next();
});

adminSaasLeadsRouter.get('/', async (_req, res) => {
  res.json(await listLeads());
});

adminSaasLeadsRouter.patch('/:id', async (req, res) => {
  const patch = parse(leadPatchSchema, req.body ?? {});
  const r = await updateLead(String(req.params.id), patch);
  if (!r.lead) throw r.error === 'LEAD_NOT_FOUND' ? notFound(r.error) : conflict(r.error ?? 'STAGE_TRANSITION');
  await audit(req, 'SAAS_LEAD_UPDATED', `saas-lead:${r.lead.id}`, { fields: Object.keys(patch), stage: r.lead.stage });
  res.json({ lead: r.lead });
});

// ─── Onboarding wizard ────────────────────────────────────────────────

export const adminOnboardingRouter = Router();

const stepError = (err: unknown): never => {
  if (err instanceof StepError) throw conflict(err.code);
  throw err;
};

const view = async () => {
  const [state, checks] = await Promise.all([readOnboarding(), liveChecks()]);
  return { applicable: onboardingApplicable(), state, progress: progressOf(state.steps), checks, steps: STEP_KEYS, required: REQUIRED_STEPS };
};

adminOnboardingRouter.get('/', async (_req, res) => {
  res.json(await view());
});

/** Light status for the admin-layout banner (read on every admin page load of a SUPER_ADMIN). */
adminOnboardingRouter.get('/status', async (_req, res) => {
  const state = await readOnboarding();
  const p = progressOf(state.steps);
  res.json({ applicable: onboardingApplicable(), completed: !!state.completedAt, percent: p.percent, next: p.next });
});

const stepKeySchema = z.enum(STEP_KEYS);

adminOnboardingRouter.put('/steps/:key', async (req, res) => {
  const key = parse(stepKeySchema, req.params.key);
  if (key === 'golive') throw badRequest('USE_COMPLETE');
  const body = parse(
    z
      .object({
        status: z.enum(STEP_STATUSES),
        data: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(100)).max(100)])).optional(),
      })
      .strict(),
    req.body ?? {},
  );
  await updateStep(key, body, req.user!.id).catch(stepError);
  await audit(req, 'ONBOARDING_STEP', `onboarding:${key}`, { status: body.status });
  res.json(await view());
});

adminOnboardingRouter.put('/current', async (req, res) => {
  const { step } = parse(z.object({ step: stepKeySchema }), req.body ?? {});
  await setCurrentStep(step);
  res.json(await view());
});

adminOnboardingRouter.put('/offer', async (req, res) => {
  const body = parse(
    z.object({
      countries: z
        .array(
          z
            .string()
            .trim()
            .regex(/^[A-Za-z]{2}$/)
            .transform((s) => s.toUpperCase()),
        )
        .max(60),
      visaCategoryIds: z.array(z.string().max(40)).max(200),
    }),
    req.body ?? {},
  );
  const ids = [...new Set(body.visaCategoryIds)];
  const known = await prisma.visaCategory.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (known.length !== ids.length) throw badRequest('VISA_NOT_FOUND');
  if (!ids.length) throw badRequest('VISA_REQUIRED');
  await prisma.$transaction([
    prisma.visaCategory.updateMany({ where: { id: { in: ids } }, data: { published: true } }),
    prisma.visaCategory.updateMany({ where: { id: { notIn: ids } }, data: { published: false } }),
  ]);
  const countries = [...new Set(body.countries)];
  await updateStep('offer', { status: 'done', data: { countries, visaCount: ids.length } }, req.user!.id).catch(stepError);
  await audit(req, 'ONBOARDING_OFFER', 'onboarding:offer', { countries, visaCategoryIds: ids });
  res.json(await view());
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

adminOnboardingRouter.post('/invite', async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      role: z.enum(['STAFF', 'ADMIN']),
      locale: z.enum(['az', 'de', 'en', 'ru']).default('en'),
    }),
    req.body ?? {},
  );
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict('EMAIL_TAKEN');
  await assertStaffSeat(); // white-label plan: staff seat limit
  // A random password nobody knows: the colleague sets their own through the e-mailed link.
  const user = await prisma.user.create({
    data: { email: body.email, firstName: body.firstName, lastName: body.lastName, role: body.role, locale: body.locale, passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12) },
    select: { id: true, email: true, role: true },
  });
  await ensurePersonalRoot(user.id);
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  const brand = await getBrand();
  const inviter = [req.user!.firstName, req.user!.lastName].filter(Boolean).join(' ') || brand.name;
  const m = INVITE_MAIL[body.locale];
  void sendMail(user.email, m.subject(brand.name), renderEmail(m.subject(brand.name), m.body(inviter, brand.name), { label: m.cta, url: `${config.clientUrl}/reset-password?token=${token}` }));
  await audit(req, 'USER_CREATED', `user:${user.id}`, { email: user.email, role: user.role, via: 'onboarding' });
  res.status(201).json({ user, ...(await view()) });
});

adminOnboardingRouter.post('/test-email', async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, locale: true } });
  if (!me) throw new HttpError(401, 'UNAUTHORIZED');
  const m = TEST_MAIL[me.locale];
  const result = await sendMailDetailed({ to: me.email, subject: m.subject, html: renderEmail(m.subject, m.body) });
  await audit(req, 'ONBOARDING_TEST_EMAIL', 'onboarding:email', { status: result.status });
  res.json({ result: { status: result.status, error: result.error ? result.error.slice(0, 300) : undefined }, to: me.email });
});

adminOnboardingRouter.post('/complete', async (req, res) => {
  await completeOnboarding(req.user!.id).catch(stepError);
  await audit(req, 'ONBOARDING_COMPLETED', 'onboarding:instance');
  res.json(await view());
});

adminOnboardingRouter.post('/reopen', async (req, res) => {
  await reopenOnboarding();
  await audit(req, 'ONBOARDING_REOPENED', 'onboarding:instance');
  res.json(await view());
});
