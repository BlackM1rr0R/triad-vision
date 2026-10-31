import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type ReferralPartner } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { XLSX_MIME } from '../../lib/clientsExcel.js';
import { buildPartnerWorkbook, partnerCaseRows, partnerCounts, syncFoldersLater } from '../../lib/partners/index.js';
import { refusalCsv, refusalQuery, refusalReport } from '../../lib/partners/refusals.js'; // Ablehnung by partner / company
import { ensurePartnerFolder, partnerFolderId, partnerFolderIds, syncPartnerFolder } from '../../lib/drive/caseFolders.js';
import { PARTNER_COMMISSION_TRIGGERS, partnerCommissionTotals } from '../../lib/partners/commissions.js';
import { PARTNER_VISIBILITY, codeInUse, partnerLinks, setClientOwner, suggestPartnerCode } from '../../lib/partners/owned.js';
import { normaliseAgentCode } from '../../lib/agents/referral.js';
import { assignCases, deletePartner } from '../../lib/partners/manage.js';
import { partnerLoginRouter, partnerLoginView } from '../../lib/partners/adminLoginRoutes.js';
import { partnerCommissionsRouter } from '../../lib/partners/adminCommissionRoutes.js';
import { maskWith, requestMaskGroups } from '../../lib/privacy/mask.js';
import { partnerFieldsRouter, listFieldDefs } from '../../lib/partners/adminFieldRoutes.js'; // admin-defined form fields
import {
  BANK_FIELDS,
  PARTNER_TYPES,
  CustomFieldError,
  contractDatesInvalid,
  contractReadiness,
  customDataOf,
  dateToDay,
  dayToDate,
  legalCrossError,
  extraFieldsOf,
  mergeCustomData,
  partnerProfileShape,
  partnerView,
  profileChanges,
  stripMaskedProfileInput,
  tagsOf,
} from '../../lib/partners/profile.js';
import { CONTRACT_STATUSES, contractSummaries, lastActivities, partnerClientTotals } from '../../lib/partners/overview.js'; // list filters, profile header
import { loadRows, totalsOf } from '../../lib/settlement/service.js';
import { csvSafe } from '../../lib/csvSafe.js';
import { todayOf } from '../../lib/partnerRecords/contracts.js';

/**
 * Referral partners (middlemen who bring visa clients) — /api/admin/partners.
 * Staff read, create, edit and assign cases (the team manages partners from the shared drive); only
 * admins delete partners. Not to be confused with the
 * public-site partner logos (/admin/content/partners) or the AGENT programme (/admin/agents).
 */
export const adminPartnersRouter = Router();

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const partnerBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: opt(40),
  email: z
    .union([z.literal(''), z.string().trim().email().max(191)])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  note: opt(5000),
  active: z.boolean().optional(),
  /** Default commission per client in cents (null = no automatic commission). */
  commissionCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  /** Personal sign-up code (null removes it; existing owned clients stay with the partner). */
  code: z
    .string()
    .trim()
    .max(32)
    .transform((v) => normaliseAgentCode(v))
    .refine((v) => v.length >= 3, 'CODE_TOO_SHORT')
    .nullable()
    .optional(),
  commissionTrigger: z.enum(PARTNER_COMMISSION_TRIGGERS).optional(),
  visibility: z.enum(PARTNER_VISIBILITY).optional(),
  // Type, company, contacts, address, tax id, bank (ADMIN+), contract, language, website, tags, custom fields.
  ...partnerProfileShape,
});
type PartnerBody = Partial<z.infer<typeof partnerBody>>;

const canSeeBank = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');
const view = (req: Request, p: ReferralPartner) => partnerView(p, { canSeeBank: canSeeBank(req) });

/**
 * The columns written for a create / update: profile days as dates, JSON columns (tags, extra fields,
 * custom data — the latter validated against the admin-defined fields) and everything else as sent.
 */
const partnerData = async (body: PartnerBody, current: ReferralPartner | null) => {
  const { customData, contractStart, contractEnd, tags, extraFields, ...rest } = body;
  if (contractDatesInvalid(contractStart !== undefined ? contractStart : current?.contractStart, contractEnd !== undefined ? contractEnd : current?.contractEnd))
    throw badRequest('CONTRACT_DATES_INVALID');
  // Betriebsnummer only for German partners, 5-digit PLZ in Germany (on the merged values).
  const pick = <K extends 'country' | 'betriebsnummer' | 'postalCode'>(k: K) => (body[k] !== undefined ? body[k] : current?.[k]);
  const cross = legalCrossError({ country: pick('country'), betriebsnummer: pick('betriebsnummer'), postalCode: pick('postalCode') });
  if (cross) throw badRequest(cross);
  const defs = customData !== undefined ? await listFieldDefs() : [];
  let merged: ReturnType<typeof mergeCustomData> | undefined;
  if (customData !== undefined) {
    try {
      merged = mergeCustomData(defs, current?.customData, customData);
    } catch (e) {
      if (e instanceof CustomFieldError) throw badRequest('INVALID_CUSTOM_FIELD', defs.find((d) => d.id === e.field)?.label ?? e.field);
      throw e;
    }
  }
  const json = (v: unknown) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
  const data = {
    ...rest,
    ...(contractStart !== undefined ? { contractStart: dayToDate(contractStart) } : {}),
    ...(contractEnd !== undefined ? { contractEnd: dayToDate(contractEnd) } : {}),
    ...(tags !== undefined ? { tags: json(tags?.length ? tags : null) } : {}),
    ...(extraFields !== undefined ? { extraFields: json(extraFields?.length ? extraFields : null) } : {}),
    ...(merged !== undefined ? { customData: json(merged) } : {}),
  };
  // The same values in plain form for the audit diff (field names only for bank data).
  const plain: Record<string, unknown> = {
    ...rest,
    ...(contractStart !== undefined ? { contractStart: contractStart ?? null } : {}),
    ...(contractEnd !== undefined ? { contractEnd: contractEnd ?? null } : {}),
    ...(tags !== undefined ? { tags: tags?.length ? tags : null } : {}),
    ...(extraFields !== undefined ? { extraFields: extraFields?.length ? extraFields : null } : {}),
    ...(merged !== undefined ? { customData: merged } : {}),
  };
  return { data, plain, labels: new Map(defs.map((d) => [d.id, d.label])) };
};

/** Bank data is ADMIN+ only: staff may not set or change it (masked values were already dropped). */
const assertBankAllowed = (req: Request, body: PartnerBody, current: ReferralPartner | null) => {
  if (canSeeBank(req)) return;
  const touched = BANK_FIELDS.some((k) => body[k] !== undefined && (body[k] ?? null) !== (current?.[k] ?? null));
  if (touched) throw forbidden('ADMIN_REQUIRED');
};

/** Search over the JSON columns (tags, custom and extra field values) — the partner table is small. */
const jsonSearchIds = async (needle: string) => {
  const n = needle.toLocaleLowerCase();
  const rows = await prisma.referralPartner.findMany({ select: { id: true, tags: true, customData: true, extraFields: true } });
  return rows
    .filter((r) =>
      [
        ...tagsOf(r.tags),
        ...Object.values(customDataOf(r.customData))
          .filter((v) => typeof v !== 'boolean')
          .map(String),
        ...extraFieldsOf(r.extraFields).flatMap((f) => [f.label, f.value]),
      ].some((s) => s.toLocaleLowerCase().includes(n)),
    )
    .map((r) => r.id);
};

/** Text columns the partner search looks in (besides tags and custom / extra field values). */
const SEARCH_COLUMNS = ['name', 'phone', 'email', 'companyName', 'contactPerson', 'phone2', 'whatsapp', 'city', 'country', 'address', 'street', 'postalCode', 'taxId', 'vatId', 'betriebsnummer', 'registerNumber', 'website', 'code'] as const;

/** Codes are unique across partners, agents and client "bring a friend" codes. */
const assertCodeFree = async (code: string | null | undefined, exceptId?: string) => {
  if (code && (await codeInUse(code, exceptId))) throw conflict('PARTNER_CODE_TAKEN');
};

/** Names are unique regardless of case/whitespace (the drive folder is named after the partner). */
const assertNameFree = async (name: string, exceptId?: string) => {
  const clash = await prisma.referralPartner.findFirst({ where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw conflict('PARTNER_NAME_TAKEN');
};

const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false', 'all']).default('all'),
  type: z.enum(PARTNER_TYPES).optional(),
  country: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  /** active | expiring (≤ 30 days left) | expired | none (lib/partners/overview.ts). */
  contract: z.enum(CONTRACT_STATUSES).optional(),
  sort: z.enum(['name', 'clients', 'activeCases', 'commissions', 'pending', 'lastActivity', 'created', 'contractEnd']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

/** The partner list with counts, commission totals, contract status and last activity — filtered and sorted. */
const listPartners = async (req: Request, q: ListQuery) => {
  const search = q.search;
  const where: Prisma.ReferralPartnerWhereInput = {
    ...(q.active !== 'all' ? { active: q.active === 'true' } : {}),
    ...(q.type ? { partnerType: q.type } : {}),
    ...(q.country ? { country: q.country } : {}),
    ...(search ? { OR: [...SEARCH_COLUMNS.map((k) => ({ [k]: { contains: search } })), { id: { in: await jsonSearchIds(search) } }] } : {}),
  };
  let partners = await prisma.referralPartner.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  if (q.tag) {
    const tag = q.tag.toLocaleLowerCase();
    partners = partners.filter((p) => tagsOf(p.tags).some((t) => t.toLocaleLowerCase() === tag));
  }
  const contracts = await contractSummaries(partners);
  if (q.contract) partners = partners.filter((p) => contracts.get(p.id)?.status === q.contract);
  const ids = partners.map((p) => p.id);
  const [counts, totals, folders, activity] = await Promise.all([partnerCounts(ids), partnerCommissionTotals(ids), partnerFolderIds(partners), lastActivities(partners)]);
  // folderId: the partner's live folder below "Partner" (null when it was deleted in the drive — the card offers to recreate it).
  const items = partners.map((p) => ({
    ...view(req, p),
    counts: counts.get(p.id)!,
    commissionTotals: totals.get(p.id),
    folderId: folders.get(p.id) ?? null,
    contract: contracts.get(p.id)!,
    lastActivityAt: activity.get(p.id) ?? null,
    readiness: contractReadiness(p),
  }));
  if (q.sort) {
    const dir = q.dir === 'desc' ? -1 : 1;
    const num = (v: number | null | undefined) => v ?? Number.NEGATIVE_INFINITY;
    const key = (i: (typeof items)[number]): number | string => {
      switch (q.sort) {
        case 'clients':
          return i.counts.clients;
        case 'activeCases':
          return i.counts.activeCases;
        case 'commissions':
          return num(i.commissionTotals?.totalCents);
        case 'pending':
          return num(i.commissionTotals && i.commissionTotals.pendingCents + i.commissionTotals.approvedCents);
        case 'lastActivity':
          return num(i.lastActivityAt?.getTime());
        case 'created':
          return i.createdAt.getTime();
        case 'contractEnd':
          // Open-ended contracts after every dated one, partners without a contract last.
          return i.contract.status === 'none' ? Number.POSITIVE_INFINITY : i.contract.endDate ? Date.parse(i.contract.endDate) : Number.MAX_SAFE_INTEGER;
        default:
          return i.name.toLocaleLowerCase();
      }
    };
    items.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : x < y ? -1 : x > y ? 1 : 0;
      return c * dir || a.name.localeCompare(b.name);
    });
  }
  return items;
};

/** Distinct countries and tags of all partners (the list filter options). */
const listFacets = async () => {
  const rows = await prisma.referralPartner.findMany({ select: { country: true, tags: true } });
  const countries = [...new Set(rows.map((r) => r.country?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const tagMap = new Map<string, string>();
  for (const r of rows) for (const t of tagsOf(r.tags)) if (!tagMap.has(t.toLocaleLowerCase())) tagMap.set(t.toLocaleLowerCase(), t);
  return { countries, tags: [...tagMap.values()].sort((a, b) => a.localeCompare(b)) };
};

/**
 * GET / — partners (?search name/company/phone/code/VÖEN/…, ?active, ?type, ?country, ?tag, ?contract,
 * ?sort, ?dir) + filter facets. GET /export.csv — the same list as CSV (VÖEN masked per settings).
 */
adminPartnersRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const [items, facets] = await Promise.all([listPartners(req, q), listFacets()]);
  res.json({ items, facets });
});

const CSV_HEADERS = [
  'Ad',
  'Növ',
  'Şirkət',
  'Əlaqədar şəxs',
  'Telefon',
  'E-poçt',
  'Kod',
  'Şəhər',
  'Ölkə',
  'VÖEN',
  'USt-IdNr',
  'Aktiv',
  'Müştərilər',
  'Aktiv müraciətlər',
  'Viza verilib',
  'Rədd',
  'Komissiya (cəmi)',
  'Gözləyən',
  'Ödənilib',
  'Valyuta',
  'Müqavilə',
  'Müqavilə sonu',
  'Son fəaliyyət',
  'Teqlər',
];
const CONTRACT_AZ: Record<string, string> = { active: 'Aktiv', expiring: 'Bitir (30 gün)', expired: 'Bitib', none: 'Yoxdur' };
const dmy = (day: string | null | undefined) => (day ? day.split('-').reverse().join('.') : '');

adminPartnersRouter.get('/export.csv', async (req, res) => {
  const q = parse(listQuery, req.query);
  const items = await listPartners(req, q);
  const mask = requestMaskGroups(res);
  const cents = (v: number | null | undefined) => (v == null ? '' : (v / 100).toFixed(2));
  const cell = (v: unknown) => {
    const s = csvSafe(v == null ? '' : String(v));
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((p) => [
    p.name,
    p.partnerType === 'COMPANY' ? 'Şirkət' : 'Fiziki şəxs',
    p.companyName,
    p.contactPerson,
    p.phone,
    p.email,
    p.code,
    p.city,
    p.country,
    maskWith(mask, 'taxId', p.taxId),
    p.vatId,
    p.active ? 'Bəli' : 'Xeyr',
    p.counts.clients,
    p.counts.activeCases,
    p.counts.approved,
    p.counts.rejected,
    cents(p.commissionTotals?.totalCents),
    cents(p.commissionTotals ? p.commissionTotals.pendingCents + p.commissionTotals.approvedCents : null),
    cents(p.commissionTotals?.paidCents),
    p.currency,
    CONTRACT_AZ[p.contract.status],
    dmy(p.contract.endDate),
    dmy(dateToDay(p.lastActivityAt)),
    p.tags.join(', '),
  ]);
  await audit(req, 'PARTNERS_EXPORTED', undefined, { format: 'csv', count: items.length, filters: { ...q } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="partnyorlar-${dateToDay(new Date())}.csv"`);
  // BOM so Excel opens the UTF-8 file with the right characters.
  res.send(`﻿${[CSV_HEADERS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);
});

/**
 * GET /clients/:userId/owner — the client's owning partner and the history of changes (staff).
 * PATCH /clients/:userId/owner { partnerId | null, note } — ADMIN+ reassign (audited, history kept;
 * open cases of the old owner follow, lib/partners/owned.ts).
 */
adminPartnersRouter.get('/clients/:userId/owner', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: String(req.params.userId) },
    select: { id: true, ownerPartnerAt: true, ownerPartner: { select: { id: true, name: true, code: true } } },
  });
  if (!user) throw notFound('USER_NOT_FOUND');
  const history = await prisma.partnerClientChange.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ids = [...new Set(history.flatMap((h) => [h.fromPartnerId, h.toPartnerId]).filter((x): x is string => !!x))];
  const actorIds = [...new Set(history.map((h) => h.actorId).filter((x): x is string => !!x))];
  const [partners, actors] = await Promise.all([
    prisma.referralPartner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const aName = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  res.json({
    owner: user.ownerPartner,
    ownedSince: user.ownerPartnerAt,
    history: history.map((h) => ({
      id: h.id,
      source: h.source,
      from: h.fromPartnerId ? { id: h.fromPartnerId, name: pName.get(h.fromPartnerId) ?? null } : null,
      to: h.toPartnerId ? { id: h.toPartnerId, name: pName.get(h.toPartnerId) ?? null } : null,
      actor: h.actorId ? (aName.get(h.actorId) ?? null) : null,
      note: h.note,
      createdAt: h.createdAt,
    })),
  });
});

adminPartnersRouter.patch('/clients/:userId/owner', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ partnerId: z.string().min(1).max(40).nullable(), note: z.string().trim().max(500).optional() }), req.body);
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  if (user.role !== 'CLIENT') throw badRequest('NOT_A_CLIENT');
  if (body.partnerId && !(await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true } }))) throw badRequest('INVALID_PARTNER');
  const result = await setClientOwner(user.id, body.partnerId, req.user!.id, body.note ?? null);
  await audit(req, 'PARTNER_CLIENT_OWNER_CHANGED', `user:${user.id}`, { from: result?.from ?? null, to: body.partnerId, casesMoved: result?.casesMoved ?? 0, note: body.note ?? null });
  res.json({ ok: true, ...result });
});

// Commissions (all partners) and portal logins live in their own routers; mounted before "/:id".
adminPartnersRouter.use('/commissions', partnerCommissionsRouter);
adminPartnersRouter.use('/', partnerLoginRouter);
adminPartnersRouter.use('/', partnerFieldsRouter); // GET/POST/PATCH/DELETE /fields, PUT /fields/order

/**
 * GET /refusals — visa refusals ("Ablehnung") per partner or per employer company: cases, visas, refusals,
 * refusal rate (?group=partner|company, ?from, ?to, ?basis=created|decision, ?partnerId, ?withPartner=0).
 * GET /refusals.csv — the same as CSV.
 */
adminPartnersRouter.get('/refusals', async (req, res) => {
  res.json(await refusalReport(parse(refusalQuery, req.query)));
});

adminPartnersRouter.get('/refusals.csv', async (req, res) => {
  const q = parse(refusalQuery, req.query);
  const report = await refusalReport(q);
  await audit(req, 'PARTNER_REFUSALS_EXPORTED', q.partnerId, { group: q.group, from: q.from ?? null, to: q.to ?? null, basis: q.basis });
  const name = `Ablehnung-${q.group === 'partner' ? 'partnyorlar' : 'sirketler'}${q.from ? `-${q.from}` : ''}${q.to ? `_${q.to}` : ''}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(refusalCsv(report));
});

/** PATCH /assign { caseIds, partnerId | null } — staff link (or unlink) cases to a partner in bulk. */
adminPartnersRouter.patch('/assign', async (req, res) => {
  const body = parse(
    z.object({ caseIds: z.array(z.string().min(1).max(40)).min(1).max(500), partnerId: z.string().min(1).max(40).nullable() }),
    req.body,
  );
  const ids = [...new Set(body.caseIds)];
  if (body.partnerId) {
    const p = await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true } });
    if (!p) throw badRequest('INVALID_PARTNER');
  }
  if ((await prisma.case.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('INVALID_CASE');
  // Folders move in the background; automatic commissions follow (lib/partners/manage.ts).
  const { changed, commissionsCreated } = await assignCases(ids, body.partnerId, req.user!.id);
  await audit(req, body.partnerId ? 'PARTNER_CASES_ASSIGNED' : 'PARTNER_CASES_UNASSIGNED', body.partnerId ?? undefined, {
    caseIds: ids,
    changed: changed.length,
    commissionsCreated,
  });
  res.json({ ok: true, updated: changed.length, commissionsCreated });
});

adminPartnersRouter.get('/:id', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const [cases, counts, totals, login, ownedClients] = await Promise.all([
    partnerCaseRows(partner.id),
    partnerCounts([partner.id]),
    partnerCommissionTotals([partner.id]),
    partnerLoginView(partner.userId),
    prisma.user.findMany({
      where: { ownerPartnerId: partner.id },
      orderBy: { ownerPartnerAt: 'desc' },
      take: 1000,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, ownerPartnerAt: true },
    }),
  ]);
  res.json({
    partner: {
      ...view(req, partner),
      ...(partner.code ? partnerLinks(partner.code) : { shareLink: null, shortLink: null }),
      counts: counts.get(partner.id),
      commissionTotals: totals.get(partner.id),
      login,
      folderId: await partnerFolderId(partner),
      contract: (await contractSummaries([partner])).get(partner.id),
      readiness: contractReadiness(partner),
    },
    cases,
    // Clients who belong to the partner (sign-up link, partner portal, admin) — with or without a case.
    ownedClients,
  });
});

/**
 * GET /:id/stats — the header of the full profile page: clients (total / active), cases by stage, visas,
 * refusals, commissions (earned / pending / paid), contract status with days left, last activity, data
 * completeness for contract generation and counts of the tabs.
 */
adminPartnersRouter.get('/:id/stats', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const [counts, totals, contracts, activity, clients, caseCount, settlements, contacts, activities, login] = await Promise.all([
    partnerCounts([partner.id]),
    partnerCommissionTotals([partner.id]),
    contractSummaries([partner]),
    lastActivities([partner]),
    partnerClientTotals(partner.id),
    prisma.case.count({ where: { partnerId: partner.id } }),
    prisma.settlementEntry.count({ where: { partnerId: partner.id } }),
    prisma.contact.count({ where: { referralPartnerId: partner.id } }),
    prisma.partnerActivity.count({ where: { referralPartnerId: partner.id } }),
    partner.userId ? partnerLoginView(partner.userId) : Promise.resolve(null),
  ]);
  const c = counts.get(partner.id)!;
  const t = totals.get(partner.id)!;
  res.json({
    stats: {
      clients,
      cases: { total: caseCount, active: c.activeCases, approved: c.approved, refused: c.rejected, cancelled: c.cancelled, stages: c.stages },
      commissions: {
        currency: partner.currency,
        earnedCents: t.totalCents,
        pendingCents: t.pendingCents + t.approvedCents,
        paidCents: t.paidCents,
        thisMonthCents: t.thisMonthCents,
        count: t.pendingCount + t.approvedCount + t.paidCount,
      },
      contract: contracts.get(partner.id)!,
      lastActivityAt: activity.get(partner.id) ?? null,
      readiness: contractReadiness(partner),
      legacyContract: partner.contractStart || partner.contractEnd ? { start: dateToDay(partner.contractStart), end: dateToDay(partner.contractEnd) } : null,
      counts: { settlements, contacts, activities },
      portal: { hasLogin: !!partner.userId, active: login?.isActive ?? false, lastSeenAt: login?.lastSeenAt ?? null, visibility: partner.visibility },
    },
  });
});

/**
 * POST /:id/legacy-contract { title? } — the old profile dates (contractStart / contractEnd) become a
 * PartnerContract once: the contract is created (ACTIVE, or EXPIRED when the end has passed) and the
 * profile dates are cleared (409 NO_LEGACY_CONTRACT when there are none). Staff and above, audited.
 */
adminPartnersRouter.post('/:id/legacy-contract', async (req, res) => {
  const body = parse(z.object({ title: z.string().trim().min(1).max(200).optional() }), req.body ?? {});
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  if (!partner.contractStart && !partner.contractEnd) throw conflict('NO_LEGACY_CONTRACT');
  const ended = !!partner.contractEnd && partner.contractEnd < todayOf(); // Baku day, like lib/partnerRecords
  const contract = await prisma.$transaction(async (tx) => {
    // Conditional clear: a second click at the same time finds no dates and creates nothing.
    const cleared = await tx.referralPartner.updateMany({
      where: { id: partner.id, OR: [{ contractStart: { not: null } }, { contractEnd: { not: null } }] },
      data: { contractStart: null, contractEnd: null },
    });
    if (!cleared.count) throw conflict('NO_LEGACY_CONTRACT');
    return tx.partnerContract.create({
      data: {
        referralPartnerId: partner.id,
        title: body.title ?? 'Əməkdaşlıq müqaviləsi',
        kind: 'COMMISSION',
        status: ended ? 'EXPIRED' : 'ACTIVE',
        startDate: partner.contractStart,
        endDate: partner.contractEnd,
        note: 'Profildəki müqavilə tarixlərindən yaradılıb.',
        createdById: req.user!.id,
      },
    });
  });
  await audit(req, 'PARTNER_LEGACY_CONTRACT_CONVERTED', partner.id, {
    contractId: contract.id,
    fields: ['contractStart', 'contractEnd'],
    changes: {
      contractStart: { from: dateToDay(partner.contractStart), to: null },
      contractEnd: { from: dateToDay(partner.contractEnd), to: null },
    },
  });
  res.status(201).json({ contract: { ...contract, startDate: dateToDay(contract.startDate), endDate: dateToDay(contract.endDate) } });
});

/** GET /:id/settlements — the partner's rows of the settlement ledger (Hesablaşmalar) and the partner-share totals. */
adminPartnersRouter.get('/:id/settlements', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const { rows, beneficiaries } = await loadRows({ partnerId: partner.id });
  const totals = totalsOf(rows, beneficiaries);
  // The partner's view of the ledger: no owner / team shares (those stay on the Hesablaşmalar page).
  const items = rows.map(({ shares: _s, netCents: _n, roundingCents: _r, expensesCents: _e, ...r }) => r);
  res.json({ rows: items, totals: { count: totals.count, amount: totals.amount, paid: totals.paid, partner: totals.partner } });
});

/** POST /:id/code (ADMIN+) — a fresh suggested code from the partner's name (stored at once). */
adminPartnersRouter.post('/:id/code', requireMinRole('ADMIN'), async (req, res) => {
  const current = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true, code: true } });
  if (!current) throw notFound('PARTNER_NOT_FOUND');
  const code = await suggestPartnerCode(current.name, current.id);
  const partner = await prisma.referralPartner.update({ where: { id: current.id }, data: { code } });
  await audit(req, 'PARTNER_CODE_GENERATED', partner.id, { from: current.code, to: code });
  res.json({ partner: { ...view(req, partner), ...partnerLinks(code) } });
});

/**
 * POST /:id/folder — the partner's drive folder, made available again: the live one, else the one in the
 * recycle bin (restored with its client folders), else a new one. Staff and above.
 */
adminPartnersRouter.post('/:id/folder', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const r = await ensurePartnerFolder(partner.id, { restore: true });
  if (!r) throw new HttpError(500, 'PARTNER_FOLDER_FAILED');
  if (r.restored || r.created) {
    await audit(req, r.restored ? 'PARTNER_FOLDER_RESTORED' : 'PARTNER_FOLDER_CREATED', partner.id, { name: partner.name, folderId: r.folderId });
    // Client folders that ended up elsewhere move (back) into the partner's folder.
    const cases = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { id: true } });
    syncFoldersLater(cases.map((c) => c.id));
  }
  res.json(r);
});

adminPartnersRouter.get('/:id/export.xlsx', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const data = await buildPartnerWorkbook(partner, requestMaskGroups(res), { canSeeBank: canSeeBank(req) }); // masked for STAFF per settings
  await audit(req, 'PARTNER_EXPORTED', partner.id, { format: 'xlsx' });
  const ascii = partner.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'partner';
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Partnyor-${ascii}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Partnyor-${partner.name}.xlsx`)}`,
  );
  res.send(data);
});

adminPartnersRouter.post('/', async (req, res) => {
  const body = parse(partnerBody, stripMaskedProfileInput(req.body));
  await assertNameFree(body.name);
  // Code, commission rule and visibility decide ownership, money and data access: ADMIN and above.
  if ((body.code || body.commissionTrigger || body.visibility) && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('ADMIN_REQUIRED');
  assertBankAllowed(req, body, null);
  await assertCodeFree(body.code);
  // Profile fields; the basic ones are set explicitly below.
  const { name: _n, code: _c, commissionTrigger: _t, visibility: _v, phone: _p, email: _e, note: _no, active: _a, commissionCents: _cc, currency: _cu, ...profileBody } = body;
  const { data: profile } = await partnerData(profileBody, null);
  const partner = await prisma.referralPartner.create({
    data: {
      ...profile,
      name: body.name,
      // Every new partner gets a sign-up code right away (editable later).
      code: body.code ?? (await suggestPartnerCode(body.name)),
      ...(body.commissionTrigger ? { commissionTrigger: body.commissionTrigger } : {}),
      ...(body.visibility ? { visibility: body.visibility } : {}),
      phone: body.phone ?? null,
      email: body.email ?? null,
      note: body.note ?? null,
      active: body.active ?? true,
      commissionCents: body.commissionCents ?? null,
      ...(body.currency ? { currency: body.currency } : {}),
    },
  });
  // Field names only: bank data and custom values are not repeated in the audit log.
  await audit(req, 'PARTNER_CREATED', partner.id, { name: partner.name, fields: Object.entries(body).filter(([, v]) => v != null).map(([k]) => k) });
  // The partner's folder in "Gemeinsame Dokumente/Partner" exists from the start, even without clients.
  const folderId = await syncPartnerFolder(partner.id);
  res.status(201).json({ partner: view(req, partner), folderId });
});

adminPartnersRouter.patch('/:id', async (req, res) => {
  const body = parse(partnerBody.partial(), stripMaskedProfileInput(req.body));
  const current = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!current) throw notFound('PARTNER_NOT_FOUND');
  if (body.name !== undefined && body.name !== current.name) await assertNameFree(body.name, current.id);
  // Code, commission rule and visibility decide ownership, money and data access: ADMIN and above.
  const sensitive =
    (body.code !== undefined && body.code !== current.code) ||
    (body.commissionTrigger !== undefined && body.commissionTrigger !== current.commissionTrigger) ||
    (body.visibility !== undefined && body.visibility !== current.visibility);
  if (sensitive && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('ADMIN_REQUIRED');
  assertBankAllowed(req, body, current);
  if (body.code !== undefined && body.code !== current.code) await assertCodeFree(body.code, current.id);
  const { data, plain, labels } = await partnerData(body, current);
  const partner = await prisma.referralPartner.update({ where: { id: current.id }, data });
  // What changed: before / after for ordinary fields, names only for bank data, tax id, note and extra fields.
  const { fields, changes } = profileChanges(current as unknown as Record<string, unknown>, plain, labels);
  await audit(req, 'PARTNER_UPDATED', partner.id, {
    fields,
    changes: changes as Prisma.InputJsonValue,
    ...(partner.name !== current.name ? { from: current.name, to: partner.name } : {}),
  });
  if (partner.name !== current.name) {
    // The partner's drive folder is renamed (files stay); the client folders inside follow.
    await syncPartnerFolder(partner.id, { previousName: current.name });
    const cases = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { id: true } });
    syncFoldersLater(cases.map((c) => c.id));
  }
  res.json({ partner: view(req, partner) });
});

/**
 * DELETE /:id (admins) — without `?force=1` a partner with cases answers 409 PARTNER_HAS_CASES (with the
 * counts, so the UI can ask first). With force the partner is deleted anyway: cases unassigned (client
 * folders back to "Anträge", automatic commissions cancelled), settlement rows kept without the partner,
 * portal login unlinked, empty partner folder to the recycle bin (lib/partners/manage.ts).
 */
adminPartnersRouter.delete('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const { force } = parse(z.object({ force: z.enum(['1', 'true', '0', 'false']).optional() }), req.query);
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { cases: true, settlements: true } } } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  if (partner._count.cases > 0 && force !== '1' && force !== 'true') {
    const clients = (await partnerCounts([partner.id])).get(partner.id)?.clients ?? 0;
    res.status(409).json({ error: 'PARTNER_HAS_CASES', message: 'PARTNER_HAS_CASES', cases: partner._count.cases, clients, settlements: partner._count.settlements });
    return;
  }
  const summary = await deletePartner(partner.id, req.user!.id);
  if (!summary) throw notFound('PARTNER_NOT_FOUND');
  await audit(req, 'PARTNER_DELETED', partner.id, { ...summary, force: partner._count.cases > 0 });
  res.json({ ok: true, ...summary });
});
