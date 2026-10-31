import { Prisma, type AuthorityType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';

/**
 * Authorities catalogue: German embassies / consulates, Ausländerbehörden, the Agentur für Arbeit, recognition
 * bodies and other Behörden — address, contact data, what they require, average waiting time, contact persons.
 *
 * Cases point at their embassy (Case.embassyAuthorityId) and their Ausländerbehörde (Case.abhAuthorityId);
 * further authorities hang in CaseAuthority. The catalogue starts empty: existing free-text values
 * (Case.appointmentPlace, AcceleratedProcedure.authority, RecognitionProcess.authority) are never rewritten,
 * staff link matching cases from an authority instead (findMatches / linkMatches, only empty links are filled).
 *
 * Waiting time: the team's manual value plus a value computed from linked cases —
 *   EMBASSY              appointment → decision (Case.appointmentAt → decisionAt); plus the appointment lead time
 *                        (status APPOINTMENT_SCHEDULED set → appointmentAt)
 *   AUSLAENDERBEHOERDE   § 81a submitted → pre-approval (AcceleratedProcedure.submittedAt → preApprovalAt)
 *   RECOGNITION          recognition submitted → decision (RecognitionProcess.submittedAt → decisionAt)
 */

export const AUTHORITY_TYPES = ['EMBASSY', 'AUSLAENDERBEHOERDE', 'AGENTUR_FUER_ARBEIT', 'RECOGNITION', 'OTHER'] as const satisfies readonly AuthorityType[];

const DAY = 24 * 60 * 60 * 1000;
const LINKED_CASES_MAX = 200;

// ─── Input ──────────────────────────────────────────────────────────────

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const contactInput = z.object({
  name: z.string().trim().min(1).max(160),
  role: optText(120),
  phone: optText(60),
  email: z
    .string()
    .trim()
    .max(190)
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email().nullable()),
  note: optText(500),
});

const checklistItem = z.object({ label: z.string().trim().min(1).max(200), required: z.boolean().default(true) });

export const authorityInput = z.object({
  type: z.enum(AUTHORITY_TYPES),
  name: z.string().trim().min(2).max(200),
  city: optText(120),
  country: optText(80),
  address: optText(2000),
  website: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), 'website must start with http:// or https://'),
  email: z
    .string()
    .trim()
    .max(190)
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email().nullable()),
  phone: optText(60),
  openingHours: optText(2000),
  requirements: optText(20000),
  checklist: z.array(checklistItem).max(60).default([]),
  notes: optText(20000),
  waitingDaysManual: z.number().int().min(0).max(3650).nullish().transform((v) => v ?? null),
  aliases: optText(2000),
  active: z.boolean().default(true),
  contacts: z.array(contactInput).max(30).default([]),
});
export type AuthorityInput = z.infer<typeof authorityInput>;

export const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(AUTHORITY_TYPES).optional(),
  city: z.string().trim().max(120).optional(),
  active: z.enum(['active', 'inactive', 'all']).default('all'),
});

export const caseAuthoritiesInput = z.object({
  embassyAuthorityId: z.string().trim().min(1).max(40).nullable().optional(),
  abhAuthorityId: z.string().trim().min(1).max(40).nullable().optional(),
});

export const caseLinkInput = z.object({ authorityId: z.string().trim().min(1).max(40), note: optText(300) });

// ─── Waiting time ───────────────────────────────────────────────────────

export interface WaitStat {
  days: number;
  samples: number;
}
export interface AuthorityWaiting {
  manualDays: number | null;
  /** Processing time computed from linked cases (basis depends on the type). */
  computed: (WaitStat & { basis: 'EMBASSY_DECISION' | 'ABH_PRE_APPROVAL' | 'RECOGNITION_DECISION' }) | null;
  /** Embassies: days from "appointment set" to the appointment itself. */
  appointmentLead: WaitStat | null;
  /** What to show as "the" waiting time: the manual value, else the computed one. */
  effectiveDays: number | null;
}

const avg = (values: number[]): WaitStat | null =>
  values.length ? { days: Math.round(values.reduce((a, b) => a + b, 0) / values.length), samples: values.length } : null;

const push = (m: Map<string, number[]>, k: string, v: number) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

/** Computed waiting times for the given authorities (one pass per source, no per-authority queries). */
export const waitingStats = async (rows: { id: string; type: AuthorityType; waitingDaysManual: number | null }[]): Promise<Map<string, AuthorityWaiting>> => {
  const embassyIds = rows.filter((r) => r.type === 'EMBASSY').map((r) => r.id);
  const abhIds = rows.filter((r) => r.type === 'AUSLAENDERBEHOERDE').map((r) => r.id);
  const recIds = rows.filter((r) => r.type === 'RECOGNITION').map((r) => r.id);
  const decision = new Map<string, number[]>();
  const lead = new Map<string, number[]>();
  const abh = new Map<string, number[]>();
  const rec = new Map<string, number[]>();

  if (embassyIds.length) {
    const cases = await prisma.case.findMany({
      where: { embassyAuthorityId: { in: embassyIds }, appointmentAt: { not: null } },
      select: { id: true, embassyAuthorityId: true, appointmentAt: true, decisionAt: true },
    });
    for (const c of cases) {
      if (c.decisionAt && c.decisionAt >= c.appointmentAt!) push(decision, c.embassyAuthorityId!, (c.decisionAt.getTime() - c.appointmentAt!.getTime()) / DAY);
    }
    if (cases.length) {
      const set = await prisma.caseEvent.groupBy({
        by: ['caseId'],
        where: { caseId: { in: cases.map((c) => c.id) }, toStatus: 'APPOINTMENT_SCHEDULED' },
        _min: { createdAt: true },
      });
      const setAt = new Map(set.map((s) => [s.caseId, s._min.createdAt]));
      for (const c of cases) {
        const from = setAt.get(c.id);
        if (from && c.appointmentAt! >= from) push(lead, c.embassyAuthorityId!, (c.appointmentAt!.getTime() - from.getTime()) / DAY);
      }
    }
  }
  if (abhIds.length) {
    const cases = await prisma.case.findMany({ where: { abhAuthorityId: { in: abhIds } }, select: { id: true, abhAuthorityId: true } });
    if (cases.length) {
      const byCase = new Map(cases.map((c) => [c.id, c.abhAuthorityId!]));
      const procs = await prisma.acceleratedProcedure.findMany({
        where: { caseId: { in: [...byCase.keys()] }, submittedAt: { not: null }, preApprovalAt: { not: null } },
        select: { caseId: true, submittedAt: true, preApprovalAt: true },
      });
      for (const p of procs) if (p.preApprovalAt! >= p.submittedAt!) push(abh, byCase.get(p.caseId)!, (p.preApprovalAt!.getTime() - p.submittedAt!.getTime()) / DAY);
    }
  }
  if (recIds.length) {
    const links = await prisma.caseAuthority.findMany({ where: { authorityId: { in: recIds } }, select: { caseId: true, authorityId: true } });
    if (links.length) {
      const procs = await prisma.recognitionProcess.findMany({
        where: { caseId: { in: [...new Set(links.map((l) => l.caseId))] }, submittedAt: { not: null }, decisionAt: { not: null } },
        select: { caseId: true, submittedAt: true, decisionAt: true },
      });
      for (const l of links)
        for (const p of procs) if (p.caseId === l.caseId && p.decisionAt! >= p.submittedAt!) push(rec, l.authorityId, (p.decisionAt!.getTime() - p.submittedAt!.getTime()) / DAY);
    }
  }

  const out = new Map<string, AuthorityWaiting>();
  for (const r of rows) {
    const computedStat =
      r.type === 'EMBASSY'
        ? (() => {
            const s = avg(decision.get(r.id) ?? []);
            return s && { ...s, basis: 'EMBASSY_DECISION' as const };
          })()
        : r.type === 'AUSLAENDERBEHOERDE'
          ? (() => {
              const s = avg(abh.get(r.id) ?? []);
              return s && { ...s, basis: 'ABH_PRE_APPROVAL' as const };
            })()
          : r.type === 'RECOGNITION'
            ? (() => {
                const s = avg(rec.get(r.id) ?? []);
                return s && { ...s, basis: 'RECOGNITION_DECISION' as const };
              })()
            : null;
    out.set(r.id, {
      manualDays: r.waitingDaysManual,
      computed: computedStat,
      appointmentLead: r.type === 'EMBASSY' ? avg(lead.get(r.id) ?? []) : null,
      effectiveDays: r.waitingDaysManual ?? computedStat?.days ?? null,
    });
  }
  return out;
};

// ─── Catalogue ──────────────────────────────────────────────────────────

const checklistOf = (v: Prisma.JsonValue | null): { label: string; required: boolean }[] =>
  Array.isArray(v)
    ? v.flatMap((i) => (i && typeof i === 'object' && !Array.isArray(i) && typeof i.label === 'string' ? [{ label: i.label, required: i.required !== false }] : []))
    : [];

const linkedCounts = { _count: { select: { embassyCases: true, abhCases: true, caseLinks: true, contacts: true } } } as const;

export const listAuthorities = async (q: z.infer<typeof listQuery>) => {
  const where: Prisma.AuthorityWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.city ? { city: q.city } : {}),
    ...(q.active === 'active' ? { active: true } : q.active === 'inactive' ? { active: false } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q } }, { city: { contains: q.q } }, { address: { contains: q.q } }, { aliases: { contains: q.q } }, { email: { contains: q.q } }] }
      : {}),
  };
  const [rows, cityRows, byType] = await Promise.all([
    prisma.authority.findMany({
      where,
      orderBy: [{ active: 'desc' }, { type: 'asc' }, { city: 'asc' }, { name: 'asc' }],
      take: 500,
      select: {
        id: true,
        type: true,
        name: true,
        city: true,
        country: true,
        address: true,
        website: true,
        email: true,
        phone: true,
        waitingDaysManual: true,
        active: true,
        updatedAt: true,
        ...linkedCounts,
      },
    }),
    prisma.authority.findMany({ where: { city: { not: null } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
    prisma.authority.groupBy({ by: ['type'], _count: { _all: true } }),
  ]);
  const waits = await waitingStats(rows);
  return {
    items: rows.map(({ _count, ...r }) => ({
      ...r,
      linkedCases: _count.embassyCases + _count.abhCases + _count.caseLinks,
      contactCount: _count.contacts,
      waiting: waits.get(r.id)!,
    })),
    cities: cityRows.map((c) => c.city!).filter(Boolean),
    counts: Object.fromEntries(byType.map((b) => [b.type, b._count._all])) as Partial<Record<AuthorityType, number>>,
  };
};

/** Short list for pickers (case card): active authorities, optionally of one type. */
export const authorityOptions = async (type?: AuthorityType) =>
  prisma.authority.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: [{ type: 'asc' }, { city: 'asc' }, { name: 'asc' }],
    select: { id: true, type: true, name: true, city: true, country: true },
    take: 1000,
  });

const caseRow = { id: true, number: true, status: true, appointmentAt: true, decisionAt: true, client: { select: { firstName: true, lastName: true } } } as const;

export const loadAuthority = async (id: string) => {
  const a = await prisma.authority.findUnique({ where: { id }, include: { contacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } });
  if (!a) throw notFound('AUTHORITY_NOT_FOUND');
  const [embassy, abh, links, totals] = await Promise.all([
    prisma.case.findMany({ where: { embassyAuthorityId: id }, orderBy: { createdAt: 'desc' }, take: LINKED_CASES_MAX, select: caseRow }),
    prisma.case.findMany({ where: { abhAuthorityId: id }, orderBy: { createdAt: 'desc' }, take: LINKED_CASES_MAX, select: caseRow }),
    prisma.caseAuthority.findMany({ where: { authorityId: id }, orderBy: { createdAt: 'desc' }, take: LINKED_CASES_MAX, select: { note: true, case: { select: caseRow } } }),
    prisma.authority.findUniqueOrThrow({ where: { id }, select: linkedCounts }),
  ]);
  const waits = await waitingStats([a]);
  return {
    authority: { ...a, checklist: checklistOf(a.checklist) },
    waiting: waits.get(a.id)!,
    cases: [
      ...embassy.map((c) => ({ ...c, role: 'EMBASSY' as const, note: null })),
      ...abh.map((c) => ({ ...c, role: 'ABH' as const, note: null })),
      ...links.map((l) => ({ ...l.case, role: 'OTHER' as const, note: l.note })),
    ],
    totalCases: totals._count.embassyCases + totals._count.abhCases + totals._count.caseLinks,
  };
};

const toData = (body: AuthorityInput) => ({
  type: body.type,
  name: body.name,
  city: body.city,
  country: body.country,
  address: body.address,
  website: body.website,
  email: body.email,
  phone: body.phone,
  openingHours: body.openingHours,
  requirements: body.requirements,
  checklist: body.checklist as Prisma.InputJsonValue,
  notes: body.notes,
  waitingDaysManual: body.waitingDaysManual,
  aliases: body.aliases,
  active: body.active,
});

const contactRows = (contacts: AuthorityInput['contacts']) => contacts.map((c, i) => ({ ...c, sortOrder: i }));

export const createAuthority = async (body: AuthorityInput, actorId: string) =>
  prisma.authority.create({ data: { ...toData(body), createdById: actorId, contacts: { create: contactRows(body.contacts) } } });

/** Full update; contact persons are replaced by the list sent. Returns the changed field names for the audit log. */
export const updateAuthority = async (id: string, body: AuthorityInput) => {
  const before = await prisma.authority.findUnique({ where: { id }, include: { contacts: true } });
  if (!before) throw notFound('AUTHORITY_NOT_FOUND');
  const data = toData(body);
  const changed = Object.entries(data)
    .filter(([k, v]) => JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null))
    .map(([k]) => k);
  const contactKey = (c: { name: string; role: string | null; phone: string | null; email: string | null; note: string | null }) => [c.name, c.role, c.phone, c.email, c.note].join('|');
  const contactsChanged =
    JSON.stringify([...before.contacts].sort((x, y) => x.sortOrder - y.sortOrder).map(contactKey)) !== JSON.stringify(body.contacts.map(contactKey));
  const row = await prisma.$transaction(async (tx) => {
    if (contactsChanged) {
      await tx.authorityContact.deleteMany({ where: { authorityId: id } });
      if (body.contacts.length) await tx.authorityContact.createMany({ data: contactRows(body.contacts).map((c) => ({ ...c, authorityId: id })) });
    }
    return tx.authority.update({ where: { id }, data });
  });
  return { row, changed: contactsChanged ? [...changed, 'contacts'] : changed };
};

/** Delete only while no case points at it (deactivate otherwise: the links and history stay meaningful). */
export const deleteAuthority = async (id: string) => {
  const a = await prisma.authority.findUnique({ where: { id }, select: { id: true, name: true, type: true, ...linkedCounts } });
  if (!a) throw notFound('AUTHORITY_NOT_FOUND');
  if (a._count.embassyCases + a._count.abhCases + a._count.caseLinks > 0) throw conflict('AUTHORITY_IN_USE');
  await prisma.authority.delete({ where: { id } });
  return a;
};

// ─── Free-text matches (non-destructive linking of existing cases) ─────

const terms = (a: { name: string; aliases: string | null }) =>
  [...new Set([a.name, ...(a.aliases ?? '').split(/\r?\n|;/)].map((s) => s.trim()).filter((s) => s.length >= 4))].slice(0, 20);

export interface MatchRow {
  caseId: string;
  number: string;
  status: string;
  clientName: string;
  /** The free text that matched. */
  text: string;
}

/**
 * Cases whose free text names this authority and that are not linked yet:
 * EMBASSY → Case.appointmentPlace (no embassy set), AUSLAENDERBEHOERDE → § 81a authority (no ABH set),
 * RECOGNITION → recognition process authority (not linked). Other types have no free-text source.
 */
export const findMatches = async (id: string): Promise<MatchRow[]> => {
  const a = await prisma.authority.findUnique({ where: { id }, select: { id: true, type: true, name: true, aliases: true } });
  if (!a) throw notFound('AUTHORITY_NOT_FOUND');
  const words = terms(a);
  if (!words.length) return [];
  const name = (c: { client: { firstName: string; lastName: string } }) => `${c.client.firstName} ${c.client.lastName}`.trim();
  if (a.type === 'EMBASSY') {
    const cases = await prisma.case.findMany({
      where: { embassyAuthorityId: null, OR: words.map((w) => ({ appointmentPlace: { contains: w } })) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, number: true, status: true, appointmentPlace: true, client: { select: { firstName: true, lastName: true } } },
    });
    return cases.map((c) => ({ caseId: c.id, number: c.number, status: c.status, clientName: name(c), text: c.appointmentPlace ?? '' }));
  }
  const source =
    a.type === 'AUSLAENDERBEHOERDE'
      ? await prisma.acceleratedProcedure.findMany({ where: { OR: words.map((w) => ({ authority: { contains: w } })) }, select: { caseId: true, authority: true }, take: 1000 })
      : a.type === 'RECOGNITION'
        ? await prisma.recognitionProcess.findMany({ where: { OR: words.map((w) => ({ authority: { contains: w } })) }, select: { caseId: true, authority: true }, take: 1000 })
        : [];
  if (!source.length) return [];
  const text = new Map(source.map((s) => [s.caseId, s.authority ?? '']));
  const cases = await prisma.case.findMany({
    where: {
      id: { in: [...text.keys()] },
      ...(a.type === 'AUSLAENDERBEHOERDE' ? { abhAuthorityId: null } : { authorityLinks: { none: { authorityId: a.id } } }),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, status: true, client: { select: { firstName: true, lastName: true } } },
  });
  return cases.map((c) => ({ caseId: c.id, number: c.number, status: c.status, clientName: name(c), text: text.get(c.id) ?? '' }));
};

const ROLE_NOTE = { EMBASSY: 'Səfirlik', ABH: 'Ausländerbehörde', OTHER: 'Qurum' } as const;

/** Links the chosen matching cases (only those still matching and still empty). Returns the linked case ids. */
export const linkMatches = async (id: string, caseIds: string[], actorId: string) => {
  const a = await prisma.authority.findUniqueOrThrow({ where: { id }, select: { id: true, type: true, name: true } });
  const wanted = new Set(caseIds);
  const ids = (await findMatches(id)).map((m) => m.caseId).filter((c) => wanted.has(c));
  if (!ids.length) return [];
  const role = a.type === 'EMBASSY' ? 'EMBASSY' : a.type === 'AUSLAENDERBEHOERDE' ? 'ABH' : 'OTHER';
  await prisma.$transaction(async (tx) => {
    if (role === 'EMBASSY') await tx.case.updateMany({ where: { id: { in: ids }, embassyAuthorityId: null }, data: { embassyAuthorityId: a.id } });
    else if (role === 'ABH') await tx.case.updateMany({ where: { id: { in: ids }, abhAuthorityId: null }, data: { abhAuthorityId: a.id } });
    else await tx.caseAuthority.createMany({ data: ids.map((caseId) => ({ caseId, authorityId: a.id })), skipDuplicates: true });
    await tx.caseEvent.createMany({ data: ids.map((caseId) => ({ caseId, type: 'CASE_UPDATED' as const, note: `${ROLE_NOTE[role]} → ${a.name}`, actorId, visibleToClient: false })) });
  });
  return ids;
};

// ─── Case ───────────────────────────────────────────────────────────────

const caseInfo = {
  id: true,
  type: true,
  name: true,
  city: true,
  country: true,
  address: true,
  website: true,
  email: true,
  phone: true,
  openingHours: true,
  requirements: true,
  checklist: true,
  waitingDaysManual: true,
  active: true,
} as const;
type CaseInfoRow = Prisma.AuthorityGetPayload<{ select: typeof caseInfo }>;

const withWaiting = async (rows: CaseInfoRow[]) => {
  const waits = await waitingStats(rows);
  return (r: CaseInfoRow | null) => (r ? { ...r, checklist: checklistOf(r.checklist), waiting: waits.get(r.id)! } : null);
};

/** Staff case card: embassy, Ausländerbehörde and further authorities with their key info. */
export const caseAuthorities = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      appointmentPlace: true,
      embassyAuthority: { select: caseInfo },
      abhAuthority: { select: caseInfo },
      authorityLinks: { orderBy: { createdAt: 'asc' }, select: { note: true, authority: { select: caseInfo } } },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const all = [c.embassyAuthority, c.abhAuthority, ...c.authorityLinks.map((l) => l.authority)].filter((x): x is CaseInfoRow => !!x);
  const fmt = await withWaiting(all);
  return {
    embassy: fmt(c.embassyAuthority),
    abh: fmt(c.abhAuthority),
    others: c.authorityLinks.map((l) => ({ ...fmt(l.authority)!, note: l.note })),
    appointmentPlace: c.appointmentPlace,
  };
};

const expectType = async (authorityId: string, type: AuthorityType) => {
  const a = await prisma.authority.findUnique({ where: { id: authorityId }, select: { id: true, type: true, name: true } });
  if (!a) throw badRequest('AUTHORITY_NOT_FOUND');
  if (a.type !== type) throw badRequest('AUTHORITY_TYPE_MISMATCH');
  return a;
};

/** Sets / clears the embassy and the Ausländerbehörde of a case (only the keys sent). Returns what changed. */
export const setCaseAuthorities = async (caseId: string, body: z.infer<typeof caseAuthoritiesInput>, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, embassyAuthorityId: true, abhAuthorityId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const data: { embassyAuthorityId?: string | null; abhAuthorityId?: string | null } = {};
  const notes: string[] = [];
  if (body.embassyAuthorityId !== undefined && body.embassyAuthorityId !== c.embassyAuthorityId) {
    const a = body.embassyAuthorityId ? await expectType(body.embassyAuthorityId, 'EMBASSY') : null;
    data.embassyAuthorityId = a?.id ?? null;
    notes.push(`${ROLE_NOTE.EMBASSY} → ${a?.name ?? '—'}`);
  }
  if (body.abhAuthorityId !== undefined && body.abhAuthorityId !== c.abhAuthorityId) {
    const a = body.abhAuthorityId ? await expectType(body.abhAuthorityId, 'AUSLAENDERBEHOERDE') : null;
    data.abhAuthorityId = a?.id ?? null;
    notes.push(`${ROLE_NOTE.ABH} → ${a?.name ?? '—'}`);
  }
  if (!notes.length) return { changed: {} as typeof data };
  await prisma.$transaction([
    prisma.case.update({ where: { id: caseId }, data }),
    prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', note: notes.join('; '), actorId, visibleToClient: false } }),
  ]);
  return { changed: data };
};

export const addCaseLink = async (caseId: string, body: z.infer<typeof caseLinkInput>, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const a = await prisma.authority.findUnique({ where: { id: body.authorityId }, select: { id: true, name: true } });
  if (!a) throw badRequest('AUTHORITY_NOT_FOUND');
  const exists = await prisma.caseAuthority.findUnique({ where: { caseId_authorityId: { caseId, authorityId: a.id } } });
  if (exists) throw conflict('ALREADY_LINKED');
  await prisma.$transaction([
    prisma.caseAuthority.create({ data: { caseId, authorityId: a.id, note: body.note } }),
    prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', note: `${ROLE_NOTE.OTHER} + ${a.name}`, actorId, visibleToClient: false } }),
  ]);
  return a;
};

export const removeCaseLink = async (caseId: string, authorityId: string, actorId: string) => {
  const link = await prisma.caseAuthority.findUnique({ where: { caseId_authorityId: { caseId, authorityId } }, include: { authority: { select: { name: true } } } });
  if (!link) throw notFound('LINK_NOT_FOUND');
  await prisma.$transaction([
    prisma.caseAuthority.delete({ where: { id: link.id } }),
    prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', note: `${ROLE_NOTE.OTHER} − ${link.authority.name}`, actorId, visibleToClient: false } }),
  ]);
  return link;
};

// ─── Client portal ─────────────────────────────────────────────────────

/**
 * Read-only for the client's own case: public data of the linked authorities (address, contact channels,
 * opening hours, requirements, checklist, waiting time). Never internal notes, aliases or contact persons.
 */
export const clientCaseAuthorities = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');
  const card = await caseAuthorities(caseId);
  const pub = (a: NonNullable<Awaited<ReturnType<typeof caseAuthorities>>['embassy']>) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    city: a.city,
    country: a.country,
    address: a.address,
    website: a.website,
    email: a.email,
    phone: a.phone,
    openingHours: a.openingHours,
    requirements: a.requirements,
    checklist: a.checklist,
    waitingDays: a.waiting.effectiveDays,
  });
  return [card.embassy, card.abh, ...card.others].filter((a): a is NonNullable<typeof a> => !!a).map(pub);
};
