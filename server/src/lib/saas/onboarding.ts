import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { BRAND_LANGUAGES, getBrand, readBrandSetting } from '../brand/index.js';
import { getLicense, instanceDomain, type LicenseState } from '../license/index.js';
import { MODULES_SETTING_KEY } from '../navModules.js';

/**
 * Onboarding wizard of a newly provisioned agency instance (deploy/whitelabel/new-instance.sh creates the server,
 * the database and the first SUPER_ADMIN; this wizard walks that SUPER_ADMIN through the rest).
 *
 * The wizard never duplicates a setting: every step writes to the existing place (System → Brand, the theme,
 * System → Modules, VisaCategory.published, requirement templates, staff accounts). This module only keeps the
 * progress — one AgencyOnboarding row (id "instance") — and computes live checks from the database so a step done
 * outside the wizard shows as done too.
 *
 * Shown automatically (banner + redirect hint) to SUPER_ADMINs of a CUSTOMER instance until completed; on the
 * owner's own instance it is never pushed, only reachable by URL (/admin/system/onboarding).
 */

export const ONBOARDING_ID = 'instance';
export const STEP_KEYS = ['brand', 'languages', 'offer', 'modules', 'staff', 'documents', 'email', 'employer', 'golive'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_STATUSES = ['open', 'done', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
/** Steps that cannot be skipped: without them the instance is not usable under the agency's name. */
export const REQUIRED_STEPS: readonly StepKey[] = ['brand', 'languages', 'email', 'golive'];

export interface StepState {
  status: StepStatus;
  at?: string;
  by?: string;
  data?: Record<string, unknown>;
}
export type Steps = Record<StepKey, StepState>;

export const isStepKey = (v: unknown): v is StepKey => typeof v === 'string' && (STEP_KEYS as readonly string[]).includes(v);

const stepStateSchema = z.object({
  status: z.enum(STEP_STATUSES).catch('open'),
  at: z.string().max(40).optional().catch(undefined),
  by: z.string().max(40).optional().catch(undefined),
  data: z.record(z.unknown()).optional().catch(undefined),
});

/** Every step present; unknown keys / malformed entries dropped (the JSON column is input like any other). */
export const normalizeSteps = (raw: unknown): Steps => {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    STEP_KEYS.map((k) => {
      const p = stepStateSchema.safeParse(src[k]);
      return [k, p.success ? p.data : { status: 'open' as const }];
    }),
  ) as Steps;
};

/** First step still open (golive last), or null when all are done / skipped. */
export const nextOpenStep = (steps: Steps): StepKey | null => STEP_KEYS.find((k) => steps[k].status === 'open') ?? null;

export const progressOf = (steps: Steps) => {
  const finished = STEP_KEYS.filter((k) => steps[k].status !== 'open').length;
  return { finished, total: STEP_KEYS.length, percent: Math.round((finished / STEP_KEYS.length) * 100), next: nextOpenStep(steps) };
};

export class StepError extends Error {
  constructor(public code: 'STEP_NOT_SKIPPABLE' | 'STEPS_OPEN' | 'ALREADY_COMPLETED') {
    super(code);
  }
}

/** Pure: a step update. Required steps cannot be skipped; golive is only set through completeOnboarding. */
export const applyStep = (steps: Steps, key: StepKey, update: { status: StepStatus; data?: Record<string, unknown> }, userId: string, now = new Date()): Steps => {
  if (update.status === 'skipped' && REQUIRED_STEPS.includes(key)) throw new StepError('STEP_NOT_SKIPPABLE');
  const prev = steps[key];
  const next: StepState = update.status === 'open' ? { status: 'open', ...(prev.data || update.data ? { data: { ...prev.data, ...update.data } } : {}) } : { status: update.status, at: now.toISOString(), by: userId, ...(prev.data || update.data ? { data: { ...prev.data, ...update.data } } : {}) };
  return { ...steps, [key]: next };
};

/** Pure: everything before golive must be done or skipped. */
export const missingBeforeGoLive = (steps: Steps): StepKey[] => STEP_KEYS.filter((k) => k !== 'golive' && steps[k].status === 'open');

// ─── Persistence ──────────────────────────────────────────────────────

export const readOnboarding = async () => {
  const row = await prisma.agencyOnboarding.findUnique({ where: { id: ONBOARDING_ID } });
  const steps = normalizeSteps(row?.steps);
  return {
    steps,
    currentStep: isStepKey(row?.currentStep) ? row!.currentStep : (nextOpenStep(steps) ?? 'golive'),
    completedAt: row?.completedAt?.toISOString() ?? null,
    completedById: row?.completedById ?? null,
  };
};

const save = async (steps: Steps, currentStep: StepKey, extra: { completedAt?: Date | null; completedById?: string | null } = {}) => {
  const value = steps as unknown as Prisma.InputJsonValue;
  await prisma.agencyOnboarding.upsert({
    where: { id: ONBOARDING_ID },
    create: { id: ONBOARDING_ID, steps: value, currentStep, ...extra },
    update: { steps: value, currentStep, ...extra },
  });
};

export const updateStep = async (key: StepKey, update: { status: StepStatus; data?: Record<string, unknown> }, userId: string) => {
  const cur = await readOnboarding();
  if (cur.completedAt) throw new StepError('ALREADY_COMPLETED');
  const steps = applyStep(cur.steps, key, update, userId);
  await save(steps, update.status === 'open' ? key : (nextOpenStep(steps) ?? 'golive'));
  return readOnboarding();
};

export const setCurrentStep = async (key: StepKey) => {
  const cur = await readOnboarding();
  await save(cur.steps, key);
  return readOnboarding();
};

export const completeOnboarding = async (userId: string) => {
  const cur = await readOnboarding();
  if (cur.completedAt) throw new StepError('ALREADY_COMPLETED');
  if (missingBeforeGoLive(cur.steps).length) throw new StepError('STEPS_OPEN');
  const steps = applyStep(cur.steps, 'golive', { status: 'done' }, userId);
  await save(steps, 'golive', { completedAt: new Date(), completedById: userId });
  return readOnboarding();
};

/** Opens the wizard again (e.g. after a re-branding); the progress is kept. */
export const reopenOnboarding = async () => {
  const cur = await readOnboarding();
  const steps = { ...cur.steps, golive: { status: 'open' as const } };
  await save(steps, nextOpenStep(steps) ?? 'golive', { completedAt: null, completedById: null });
  return readOnboarding();
};

/** Is the wizard pushed to SUPER_ADMINs of this instance? (customer instance and not completed yet) */
export const onboardingApplicable = (license: LicenseState = getLicense()) => license.role === 'customer';

// ─── Live checks ──────────────────────────────────────────────────────

/** Is the sender address on the instance's own domain (or a subdomain)? Pure. */
export const senderOnDomain = (emailFrom: string, domain: string) => {
  const m = /<?([^<>\s@]+)@([^<>\s@]+?)>?\s*$/.exec(emailFrom.trim());
  if (!m) return false;
  const host = m[2].toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().replace(/^www\./, '');
  return host === d || host.endsWith(`.${d}`);
};

export const liveChecks = async () => {
  const license = getLicense();
  const [brandSetting, brand, visas, modulesRow, staffCount, invitedPending, globalTemplates, companies, vacancies, settings] = await Promise.all([
    readBrandSetting(),
    getBrand(),
    prisma.visaCategory.findMany({ select: { id: true, slug: true, title: true, visaLabel: true, published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.setting.findUnique({ where: { key: MODULES_SETTING_KEY } }),
    prisma.user.count({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true } }),
    prisma.passwordResetToken.count({ where: { usedAt: null, expiresAt: { gt: new Date() }, user: { role: { in: ['STAFF', 'ADMIN'] }, isActive: true } } }),
    prisma.requirementTemplate.count(),
    prisma.company.count(),
    prisma.vacancy.count(),
    prisma.setting.findMany({ where: { key: { in: ['legal', 'contact'] } }, select: { key: true } }),
  ]);
  const domain = instanceDomain();
  const settingKeys = new Set(settings.map((s) => s.key));
  return {
    brand: {
      named: !!brandSetting.name,
      logo: !!(brandSetting.logoLight || brandSetting.logoDark),
      icon: !!brandSetting.iconSet,
      name: brand.name,
      isDefault: brand.isDefault,
    },
    languages: { configured: !!brandSetting.languages?.length, languages: brand.languages, defaultLanguage: brand.defaultLanguage, available: BRAND_LANGUAGES },
    offer: { visas, published: visas.filter((v) => v.published).length },
    modules: { stored: !!modulesRow },
    staff: { active: staffCount, pendingInvites: invitedPending, limit: license.staffLimit },
    documents: { templates: globalTemplates },
    email: {
      smtpConfigured: !!config.smtp.host,
      emailFrom: brand.emailFrom,
      domain,
      senderOnDomain: senderOnDomain(brand.emailFrom, domain),
    },
    employer: { companies, vacancies },
    golive: {
      license: license.status,
      legal: settingKeys.has('legal'),
      contact: settingKeys.has('contact'),
      https: config.clientUrl.startsWith('https://'),
      clientUrl: config.clientUrl,
    },
  };
};
