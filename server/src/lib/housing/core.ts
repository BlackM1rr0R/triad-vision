import type { CaseHousing, HousingProposal, Locale, PartnerHousing, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { TASK_TEMPLATES } from '../clientProcess/texts.js';
import { invalidateMyWork } from '../myWork.js';
import { fmtBerlin, fmtDayUtc, housingNotice, type HousingClientKind, type HousingNoticeParams, type HousingStaffKind } from './texts.js';

/**
 * Housing search + Anmeldung for one APPROVED case (lib/housing):
 *  - a housing checklist (budget → handover protocol) the client ticks and staff watch;
 *  - the rental contract in the client's vault with an optional (human, no AI) review request;
 *  - the Anmeldung: move-in date → two-week deadline, Bürgeramt appointment (reminders 3 d / 1 d / morning,
 *    jobs/housing.ts), "what to bring" ticks, Meldebescheinigung upload → done → onboarding item
 *    "anmeldung" ticked + follow-on client tasks (Steuer-ID, bank account, health card);
 *  - partner landlord listings: matching by employer or city, contact details only once introduced.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const HOUSING_STEPS = ['budget', 'documents', 'search', 'viewings', 'scams', 'contract', 'deposit', 'handover'] as const;
export type HousingStep = (typeof HOUSING_STEPS)[number];
export const BRING_ITEMS = ['passport', 'wohnungsgeber', 'form', 'contract', 'family'] as const;
export type BringItem = (typeof BRING_ITEMS)[number];
export const LISTING_TYPES = ['ROOM', 'SHARED_FLAT', 'APARTMENT', 'WORKER_HOUSING', 'BOARDING_HOUSE'] as const;
export const FOLLOW_UP_TEMPLATES = ['STEUER_ID', 'BANK_ACCOUNT', 'HEALTH_CARD'] as const;

/** § 17 (1) Bundesmeldegesetz: register within two weeks after moving in. */
export const ANMELDUNG_DAYS = 14;
/** Staff (and the client, without an appointment) are warned from this many days before the deadline. */
export const DEADLINE_WARN_DAYS = 3;
export const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

// ─── German time ───────────────────────────────────────────────────────

const berlinFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const berlinParts = (d: Date) => {
  const p = Object.fromEntries(berlinFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
};

const offsetAt = (t: number) => {
  const p = berlinParts(new Date(t));
  const [y, m, d] = p.day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, p.hour, p.minute) - Math.floor(t / 60000) * 60000;
};

/** "2026-11-02" + "09:30" in Germany → the UTC instant (DST-aware). */
export const berlinWallToUtc = (day: string, time: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
};

/** Calendar day "YYYY-MM-DD" → 00:00 UTC of that day (how move-in dates are stored). */
export const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const dateToDay = (d: Date) => d.toISOString().slice(0, 10);

// ─── Deadline ──────────────────────────────────────────────────────────

export type DeadlineState = 'none' | 'done' | 'ok' | 'soon' | 'overdue';

/** Last day for the Anmeldung: move-in day + 14 days (general rule; some offices count differently). */
export const anmeldungDeadline = (moveIn: Date | null | undefined) => (moveIn ? new Date(moveIn.getTime() + ANMELDUNG_DAYS * DAY) : null);

/** Whole days from today (German calendar) to the deadline day; negative once passed. */
export const daysLeft = (deadline: Date, now = new Date()) => Math.round((dayToDate(dateToDay(deadline)).getTime() - dayToDate(berlinParts(now).day).getTime()) / DAY);

export const deadlineInfo = (h: Pick<CaseHousing, 'moveInDate' | 'anmeldungDoneAt'> | null, now = new Date()) => {
  const deadline = anmeldungDeadline(h?.moveInDate);
  if (!deadline) return { deadline: null, daysLeft: null, state: (h?.anmeldungDoneAt ? 'done' : 'none') as DeadlineState };
  const left = daysLeft(deadline, now);
  const state: DeadlineState = h?.anmeldungDoneAt ? 'done' : left < 0 ? 'overdue' : left <= DEADLINE_WARN_DAYS ? 'soon' : 'ok';
  return { deadline: dateToDay(deadline), daysLeft: left, state };
};

// ─── Appointment reminders ─────────────────────────────────────────────

export type ReminderKind = '3d' | '1d' | 'morning';
export const MORNING_HOUR = 7;

/**
 * The three appointment reminders: 3 days and 1 day before, and 07:00 German time on the day (2 h before
 * when the appointment itself is that early). A reminder whose time had already passed when the appointment
 * was saved is skipped (the confirmation said it all).
 */
export const reminderPlan = (appointmentAt: Date, setAt: Date) => {
  let morning = berlinWallToUtc(berlinParts(appointmentAt).day, `0${MORNING_HOUR}:00`);
  if (morning.getTime() >= appointmentAt.getTime()) morning = new Date(appointmentAt.getTime() - 2 * HOUR);
  const plan: { kind: ReminderKind; at: Date }[] = [
    { kind: '3d', at: new Date(appointmentAt.getTime() - 3 * DAY) },
    { kind: '1d', at: new Date(appointmentAt.getTime() - DAY) },
    { kind: 'morning', at: morning },
  ];
  return plan.map((r) => ({ ...r, skipped: r.at.getTime() <= setAt.getTime() }));
};

/** The reminder that is due at `now` (the latest one whose time has come), or null. */
export const dueReminder = (appointmentAt: Date, setAt: Date, now: Date): ReminderKind | null => {
  if (appointmentAt.getTime() <= now.getTime()) return null;
  const due = reminderPlan(appointmentAt, setAt).filter((r) => !r.skipped && r.at.getTime() <= now.getTime());
  return due.length ? due[due.length - 1].kind : null;
};

// ─── Case + record ─────────────────────────────────────────────────────

export const caseSelect = {
  id: true,
  number: true,
  status: true,
  clientId: true,
  companyId: true,
  parentCaseId: true,
  assignedStaffId: true,
  decisionAt: true,
  company: { select: { id: true, name: true, city: true } },
  vacancy: { select: { city: true } },
  arrivalPlan: { select: { housingCity: true, housingFrom: true, status: true } },
  client: { select: { id: true, firstName: true, lastName: true, locale: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true, isActive: true, locale: true } },
} satisfies Prisma.CaseSelect;

export type HousingCase = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

/** The client's approved case: the given one, else the latest approved main application (else any approval). */
export const approvedCaseFor = async (clientId: string, caseId?: string | null) => {
  if (caseId) return prisma.case.findFirst({ where: { id: caseId, clientId, status: 'APPROVED' }, select: caseSelect });
  const order = [{ decisionAt: 'desc' as const }, { createdAt: 'desc' as const }];
  return (
    (await prisma.case.findFirst({ where: { clientId, status: 'APPROVED', parentCaseId: null }, orderBy: order, select: caseSelect })) ??
    (await prisma.case.findFirst({ where: { clientId, status: 'APPROVED' }, orderBy: order, select: caseSelect }))
  );
};

export const loadCase = (caseId: string) => prisma.case.findUnique({ where: { id: caseId }, select: caseSelect });

/** The record, created on first use ("view as client" never writes: an unsaved blank is returned). */
export const ensureHousing = async (caseId: string): Promise<CaseHousing> => {
  const found = await prisma.caseHousing.findUnique({ where: { caseId } });
  if (found) return found;
  if (isImpersonating()) {
    const now = new Date();
    return {
      id: '', caseId, city: null, budgetMax: null, housingSteps: null, bringItems: null, moveInDate: null, contractVaultDocId: null, contractUploadedAt: null,
      contractReview: 'NONE', contractQuestion: null, contractReply: null, contractReviewRequestedAt: null, contractReviewedAt: null, contractReviewedById: null,
      appointmentAt: null, appointmentAddress: null, appointmentNote: null, appointmentSetAt: null, appointmentSetById: null, meldeVaultDocId: null,
      anmeldungDoneAt: null, anmeldungDoneVia: null, createdAt: now, updatedAt: now,
    };
  }
  return prisma.caseHousing.upsert({ where: { caseId }, create: { caseId }, update: {} });
};

/** Where the client looks for a flat: their own entry, else the arrival plan's city, the job's or the employer's. */
export const caseCity = (c: HousingCase, h: Pick<CaseHousing, 'city'> | null) => h?.city || c.arrivalPlan?.housingCity || c.vacancy?.city || c.company?.city || null;

export const ticks = (v: Prisma.JsonValue | null | undefined): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as Record<string, string>;
};

/** Applies { key: true|false } to a ticks map (true keeps an earlier date). */
export const applyTicks = (current: Prisma.JsonValue | null, changes: Record<string, boolean>, allowed: readonly string[], now = new Date()) => {
  const out = ticks(current);
  for (const [k, v] of Object.entries(changes)) {
    if (!allowed.includes(k)) continue;
    if (v) out[k] ??= now.toISOString();
    else delete out[k];
  }
  return out;
};

export type AnmeldungStatus = 'NOT_STARTED' | 'APPOINTMENT_SET' | 'DONE';
export const anmeldungStatus = (h: Pick<CaseHousing, 'anmeldungDoneAt' | 'appointmentAt'>): AnmeldungStatus => (h.anmeldungDoneAt ? 'DONE' : h.appointmentAt ? 'APPOINTMENT_SET' : 'NOT_STARTED');

const fileRef = async (id: string | null, userId: string) => {
  if (!id) return null;
  const d = await prisma.vaultDocument.findFirst({ where: { id, userId }, select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } });
  return d ?? null;
};

/** One shape for the client and staff (staff additionally get ids of who did what). */
export const housingView = async (h: CaseHousing, c: HousingCase, now = new Date(), staff = false) => {
  const steps = ticks(h.housingSteps);
  const bring = ticks(h.bringItems);
  const [contractFile, meldeFile] = await Promise.all([fileRef(h.contractVaultDocId, c.clientId), fileRef(h.meldeVaultDocId, c.clientId)]);
  const deadline = deadlineInfo(h, now);
  return {
    caseId: c.id,
    city: h.city,
    effectiveCity: caseCity(c, h),
    budgetMax: h.budgetMax,
    steps: HOUSING_STEPS.map((key) => ({ key, doneAt: steps[key] ?? null })),
    progress: { done: HOUSING_STEPS.filter((k) => steps[k]).length, total: HOUSING_STEPS.length },
    contract: {
      file: contractFile,
      uploadedAt: h.contractUploadedAt,
      review: h.contractReview,
      question: h.contractQuestion,
      reply: h.contractReply,
      requestedAt: h.contractReviewRequestedAt,
      reviewedAt: h.contractReviewedAt,
      ...(staff ? { reviewedById: h.contractReviewedById } : {}),
    },
    anmeldung: {
      status: anmeldungStatus(h),
      moveInDate: h.moveInDate ? dateToDay(h.moveInDate) : null,
      ...deadline,
      appointment: h.appointmentAt
        ? {
            at: h.appointmentAt,
            day: berlinParts(h.appointmentAt).day,
            time: berlinParts(h.appointmentAt).time,
            address: h.appointmentAddress,
            note: h.appointmentNote,
            past: h.appointmentAt.getTime() <= now.getTime(),
            reminders: reminderPlan(h.appointmentAt, h.appointmentSetAt ?? h.updatedAt).map((r) => ({ kind: r.kind, at: r.at, skipped: r.skipped, sent: !r.skipped && r.at.getTime() <= now.getTime() })),
            ...(staff ? { setById: h.appointmentSetById, setAt: h.appointmentSetAt } : {}),
          }
        : null,
      bring: BRING_ITEMS.map((key) => ({ key, doneAt: bring[key] ?? null })),
      certificate: meldeFile,
      doneAt: h.anmeldungDoneAt,
      doneVia: h.anmeldungDoneVia,
    },
    updatedAt: h.updatedAt,
  };
};

// ─── Notifications ─────────────────────────────────────────────────────

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const noticeParams = (c: HousingCase, h: Pick<CaseHousing, 'appointmentAt' | 'appointmentAddress' | 'moveInDate'> | null, locale: Locale, extra: Partial<HousingNoticeParams> = {}): HousingNoticeParams => {
  const dl = anmeldungDeadline(h?.moveInDate);
  return {
    number: c.number,
    client: fullName(c.client),
    when: h?.appointmentAt ? fmtBerlin(h.appointmentAt, locale) : null,
    address: h?.appointmentAddress ?? null,
    deadline: dl ? fmtDayUtc(dl, locale) : null,
    ...extra,
  };
};

const CLIENT_LINK = '/account/housing';
const staffLink = (caseId: string) => `/admin/cases/${caseId}#case-housing`;

export const notifyHousingClient = async (c: HousingCase, h: Pick<CaseHousing, 'appointmentAt' | 'appointmentAddress' | 'moveInDate'> | null, kind: HousingClientKind, extra: Partial<HousingNoticeParams> = {}) => {
  const locale = c.client.locale;
  const msg = housingNotice(kind, locale, noticeParams(c, h, locale, extra));
  await notifyUser(c.clientId, { type: `HOUSING_${kind}`, ...msg, caseId: c.id, link: CLIENT_LINK });
};

/** The case manager, or every active ADMIN+ when nobody (active) is assigned. */
export const responsibleStaff = async (c: HousingCase) => {
  if (c.assignedStaff?.isActive) return [{ id: c.assignedStaff.id, locale: c.assignedStaff.locale }];
  return prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });
};

export const notifyHousingStaff = async (c: HousingCase, h: Pick<CaseHousing, 'appointmentAt' | 'appointmentAddress' | 'moveInDate'> | null, kind: HousingStaffKind, extra: Partial<HousingNoticeParams> = {}, opts: { exclude?: string } = {}) => {
  const users = (await responsibleStaff(c)).filter((u) => u.id !== opts.exclude);
  await Promise.all(
    users.map((u) => {
      const msg = housingNotice(kind, u.locale, noticeParams(c, h, u.locale, extra));
      return notifyUser(u.id, { type: `HOUSING_${kind}`, ...msg, caseId: c.id, link: staffLink(c.id) }).catch((e) => console.error('[housing] staff notification failed', e));
    }),
  );
};

// ─── Anmeldung done → onboarding + follow-on tasks ─────────────────────

/** Ticks an onboarding item (by slug) for the case, keeping an earlier date. No-op when the item does not exist. */
export const tickOnboarding = async (caseId: string, slug: string, note?: string) => {
  const item = await prisma.onboardingItem.findUnique({ where: { slug }, select: { id: true } });
  if (!item) return false;
  const row = await prisma.caseOnboarding.findUnique({ where: { caseId_itemId: { caseId, itemId: item.id } } });
  if (row?.doneAt) return true;
  await prisma.caseOnboarding.upsert({
    where: { caseId_itemId: { caseId, itemId: item.id } },
    create: { caseId, itemId: item.id, doneAt: new Date(), note: note ?? null },
    update: { doneAt: new Date() },
  });
  return true;
};

/** Steuer-ID, bank account and health card as client tasks (once per case; templates from lib/clientProcess). */
export const createFollowUpTasks = async (c: HousingCase, actorId: string | null, now = new Date()) => {
  const existing = await prisma.clientTask.findMany({ where: { caseId: c.id, template: { in: [...FOLLOW_UP_TEMPLATES] }, status: { not: 'CANCELLED' } }, select: { template: true } });
  const have = new Set(existing.map((t) => t.template));
  const locale = c.client.locale;
  let created = 0;
  for (const key of FOLLOW_UP_TEMPLATES) {
    if (have.has(key)) continue;
    const tpl = TASK_TEMPLATES.find((t) => t.key === key);
    if (!tpl) continue;
    await prisma.clientTask.create({
      data: { caseId: c.id, template: key, title: tpl.title[locale], description: tpl.description[locale], dueAt: new Date(now.getTime() + tpl.dueDays * DAY), createdById: actorId },
    });
    created++;
  }
  if (created) {
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CLIENT_TASK_CREATED', note: 'Anmeldung → Steuer-ID / Girokonto / Gesundheitskarte', actorId, visibleToClient: true } });
    invalidateMyWork();
  }
  return created;
};

/** Marks the Anmeldung done (idempotent) and feeds the onboarding checklist and the follow-on tasks. */
export const completeAnmeldung = async (c: HousingCase, via: 'UPLOAD' | 'STAFF', actorId: string | null, extra: { meldeVaultDocId?: string } = {}) => {
  const now = new Date();
  const res = await prisma.caseHousing.updateMany({
    where: { caseId: c.id, anmeldungDoneAt: null },
    data: { anmeldungDoneAt: now, anmeldungDoneVia: via, ...(extra.meldeVaultDocId ? { meldeVaultDocId: extra.meldeVaultDocId } : {}) },
  });
  if (extra.meldeVaultDocId && !res.count) await prisma.caseHousing.update({ where: { caseId: c.id }, data: { meldeVaultDocId: extra.meldeVaultDocId } });
  if (!res.count) return false;
  await tickOnboarding(c.id, 'anmeldung');
  await prisma.caseEvent.create({ data: { caseId: c.id, type: 'ANMELDUNG_DONE', note: via === 'UPLOAD' ? 'Meldebescheinigung' : null, actorId, visibleToClient: true } });
  await createFollowUpTasks(c, actorId, now);
  return true;
};

// ─── Partner listings ──────────────────────────────────────────────────

/** "Frankfurt am Main" ~ "frankfurt", "Nürnberg" ~ "Nuernberg" ~ "nurnberg". */
export const normCity = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const cityMatches = (a: string | null | undefined, b: string | null | undefined) => {
  const x = normCity(a);
  const y = normCity(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
};

/**
 * Who sees a listing without a proposal: an employer-linked listing only that employer's workers; any other
 * listing the clients whose housing city matches. Inactive listings are never offered.
 */
export const listingMatchesCase = (l: Pick<PartnerHousing, 'active' | 'city' | 'companyId'>, ctx: { city: string | null; companyId: string | null }) => {
  if (!l.active) return false;
  if (l.companyId) return !!ctx.companyId && l.companyId === ctx.companyId;
  return cityMatches(l.city, ctx.city);
};

type ListingWithCompany = PartnerHousing & { company?: { id: string; name: string } | null };

export const photosOf = (v: Prisma.JsonValue | null) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : []);

/** What a client sees of a listing: never the internal notes; contact details only once introduced. */
export const listingClientView = (l: ListingWithCompany, p: HousingProposal | null) => {
  const introduced = !!p?.introducedAt && !p.withdrawnAt;
  return {
    id: l.id,
    name: l.name,
    city: l.city,
    type: l.type,
    priceMin: l.priceMin,
    priceMax: l.priceMax,
    description: l.description,
    photos: photosOf(l.photos),
    employer: l.companyId && l.company ? l.company.name : null,
    contact: introduced ? { name: l.contactName, phone: l.contactPhone, email: l.contactEmail, address: l.address } : null,
    proposal: p && !p.withdrawnAt ? { id: p.id, source: p.source, staffNote: p.staffNote, response: p.response, clientNote: p.clientNote, respondedAt: p.respondedAt, introducedAt: p.introducedAt, createdAt: p.createdAt } : null,
  };
};

export const listingStaffView = (l: ListingWithCompany & { _count?: { proposals: number } }) => ({
  ...l,
  photos: photosOf(l.photos),
  company: l.company ? { id: l.company.id, name: l.company.name } : null,
  proposals: l._count?.proposals ?? undefined,
  _count: undefined,
});

/** The client's listings: proposals (not withdrawn; inactive listings only once introduced) + matching ones. */
export const listingsForCase = async (c: HousingCase, h: Pick<CaseHousing, 'city'> | null) => {
  const proposals = await prisma.housingProposal.findMany({
    where: { caseId: c.id, withdrawnAt: null },
    include: { listing: { include: { company: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const proposed = proposals.filter((p) => p.listing.active || p.introducedAt).map((p) => listingClientView(p.listing, p));
  const ids = new Set(proposals.map((p) => p.listingId));
  const city = caseCity(c, h);
  const candidates = await prisma.partnerHousing.findMany({
    where: { active: true, OR: [...(c.companyId ? [{ companyId: c.companyId }] : []), { companyId: null }] },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ priceMin: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  });
  const matching = candidates.filter((l) => !ids.has(l.id) && listingMatchesCase(l, { city, companyId: c.companyId })).slice(0, 50).map((l) => listingClientView(l, null));
  return { proposed, matching, city };
};

// ─── DSGVO export ──────────────────────────────────────────────────────

/**
 * The client's housing data for the personal-data export (lib/privacy/export.ts): per case the checklist,
 * move-in date / deadline, Bürgeramt appointment, contract review texts and the vault files' names; the
 * partner listings proposed / asked about with the client's answers (landlord contact only once introduced).
 */
export const housingExport = async (userId: string) => {
  const [records, proposals] = await Promise.all([
    prisma.caseHousing.findMany({ where: { case: { clientId: userId } }, include: { case: { select: { number: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.housingProposal.findMany({ where: { case: { clientId: userId } }, include: { case: { select: { number: true } }, listing: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const fileIds = records.flatMap((h) => [h.contractVaultDocId, h.meldeVaultDocId]).filter((x): x is string => !!x);
  const files = fileIds.length ? await prisma.vaultDocument.findMany({ where: { id: { in: fileIds }, userId }, select: { id: true, filename: true, createdAt: true } }) : [];
  const file = (id: string | null) => {
    const f = id ? files.find((x) => x.id === id) : null;
    return f ? { filename: f.filename, uploadedAt: f.createdAt, storedIn: 'vault' } : null;
  };
  return {
    records: records.map((h) => ({
      case: h.case.number,
      city: h.city,
      budgetMax: h.budgetMax,
      checklist: ticks(h.housingSteps),
      anmeldungChecklist: ticks(h.bringItems),
      moveInDate: h.moveInDate ? dateToDay(h.moveInDate) : null,
      anmeldungDeadline: h.moveInDate ? dateToDay(anmeldungDeadline(h.moveInDate)!) : null,
      appointment: h.appointmentAt ? { at: h.appointmentAt, address: h.appointmentAddress, note: h.appointmentNote, savedAt: h.appointmentSetAt } : null,
      rentalContract: file(h.contractVaultDocId),
      contractReview: { status: h.contractReview, question: h.contractQuestion, reply: h.contractReply, requestedAt: h.contractReviewRequestedAt, reviewedAt: h.contractReviewedAt },
      meldebescheinigung: file(h.meldeVaultDocId),
      anmeldungDoneAt: h.anmeldungDoneAt,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    })),
    partnerListings: proposals.map((p) => {
      const introduced = !!p.introducedAt && !p.withdrawnAt;
      return {
        case: p.case.number,
        listing: { name: p.listing.name, city: p.listing.city, type: p.listing.type },
        source: p.source === 'CLIENT' ? 'asked by me' : 'proposed by Triad Vision',
        messageFromTeam: p.staffNote,
        myAnswer: p.response,
        myNote: p.clientNote,
        answeredAt: p.respondedAt,
        introducedAt: p.introducedAt,
        withdrawnAt: p.withdrawnAt,
        landlordContact: introduced ? { name: p.listing.contactName, phone: p.listing.contactPhone, email: p.listing.contactEmail, address: p.listing.address } : null,
        createdAt: p.createdAt,
      };
    }),
  };
};
