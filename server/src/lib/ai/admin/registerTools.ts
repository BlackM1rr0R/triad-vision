import { z } from 'zod';
import type { CaseStatus, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../../db.js';
import { conflict, notFound } from '../../http.js';
import { audit } from '../../audit.js';
import { syncCaseFolder, syncPartnerFolder } from '../../drive/caseFolders.js';
import { listColumns, loadRows, NOTE_KEY, type RegisterRow } from '../../register/rows.js';
import { applyChanges, type Change } from '../../register/save.js';
import { partnerCases, partnerCounts, syncFoldersLater } from '../../partners/index.js';
import { partnerCommissionTotals, syncCaseCommissions, type PartnerTotals } from '../../partners/commissions.js';
import type { AnyAiTool } from '../types.js';
import { actorReq, clip, defineTool, listNames, localeOf, money, tr } from './common.js';
import { foldName, pathsOf } from './paths.js';
import { caseIdOf, findCases, partnerIdOf, staffIdOf } from './refs.js';

/**
 * Client register, cases and referral partners. Register writes go through lib/register/save (the same
 * batch save as the Excel-like admin page: client data, visa type, partner, staff, custom columns), followed
 * by the same follow-ups as the route: partner commissions, drive folder sync, audit.
 */

const via = { via: 'ai' } as const;
const STATUSES = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const VISA = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

const lookups = async () => {
  const [partners, staff] = await Promise.all([
    prisma.referralPartner.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return { partners: new Map(partners.map((p) => [p.id, p.name])), staff: new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()])) };
};

const registerQuery = defineTool({
  name: 'register_query',
  description: 'Searches the client register (one row per case incl. family members): client data, visa type, category, status, partner, staff, internal note and the custom columns. q searches case number, names, e-mail, phone, passport.',
  schema: z.object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(STATUSES).optional(),
    visaType: z.enum(VISA).optional(),
    partner: z.string().trim().max(120).optional().describe('Partner name / id, or "none".'),
    staff: z.string().trim().max(120).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: async (a, ctx) => {
    let { rows } = await loadRows(localeOf(ctx), { q: a.q });
    if (a.q && !rows.length) {
      const f = foldName(a.q);
      rows = (await loadRows(localeOf(ctx))).rows.filter((r) => foldName(`${r.firstName} ${r.lastName}`).includes(f));
    }
    if (a.status) rows = rows.filter((r) => r.status === a.status);
    if (a.visaType) rows = rows.filter((r) => r.visaType === a.visaType);
    if (a.partner) {
      const pid = a.partner === 'none' ? null : (await partnerIdOf(a.partner)).id;
      rows = rows.filter((r) => r.partnerId === pid);
    }
    if (a.staff) {
      const sid = (await staffIdOf(a.staff)).id;
      rows = rows.filter((r) => r.assignedStaffId === sid);
    }
    const [{ partners, staff }, columns] = await Promise.all([lookups(), listColumns()]);
    const label = new Map(columns.map((c) => [c.id, c.label]));
    const page = rows.slice(a.offset, a.offset + a.limit);
    return {
      count: rows.length,
      offset: a.offset,
      ...(a.offset + page.length < rows.length ? { nextOffset: a.offset + page.length } : {}),
      columns: columns.map((c) => ({ label: c.label, type: c.type, ...(c.options.length ? { options: c.options } : {}) })),
      rows: page.map((r: RegisterRow) => ({
        caseId: r.id,
        number: r.number,
        ...(r.kind === 'member' ? { member: true, parent: r.parentNumber, relation: r.relation } : {}),
        name: `${r.firstName} ${r.lastName}`.trim(),
        passport: r.passportNumber,
        birthDate: r.birthDate,
        phone: r.phone,
        email: r.email,
        visaType: r.visaType,
        category: r.category,
        status: r.status,
        partner: r.partnerId ? (partners.get(r.partnerId) ?? r.partnerId) : null,
        staff: r.assignedStaffId ? (staff.get(r.assignedStaffId) ?? r.assignedStaffId) : null,
        created: r.createdAt.slice(0, 10),
        ...(r._note ? { note: clip(r._note, 200) } : {}),
        ...(Object.keys(r.data).length ? { extra: Object.fromEntries(Object.entries(r.data).map(([k, v]) => [label.get(k) ?? k, v])) } : {}),
      })),
    };
  },
});

const REGISTER_FIELDS = ['firstName', 'lastName', 'passportNumber', 'birthDate', 'phone', 'visaType', 'partner', 'staff', 'note'];

const registerUpdate = defineTool({
  name: 'register_update',
  description: `Batch change of client register rows (one confirm for all). Fields: ${REGISTER_FIELDS.join(', ')} or the label of a custom column. partner / staff by name (null = none); birthDate "YYYY-MM-DD"; visaType ${VISA.join('/')}. Changing names, passport, visa type or partner also renames / moves the client's drive folder; a partner change also updates the automatic partner commissions. Status and dates are read-only here.`,
  confirm: true,
  schema: z.object({
    changes: z
      .array(z.object({ case: z.string().trim().min(1).max(120).describe('Case id or number.'), field: z.string().trim().min(1).max(80), value: z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]) }))
      .min(1)
      .max(2000),
  }),
  summary: async (a, ctx) => {
    const sample = a.changes.slice(0, 6).map((c) => `${c.case}: ${c.field} = ${c.value === null ? '∅' : String(c.value).slice(0, 40)}`);
    const more = a.changes.length > 6 ? ` +${a.changes.length - 6}` : '';
    return tr(ctx, { az: `Müştəri reyestrində ${a.changes.length} dəyişiklik: ${sample.join('; ')}${more}`, de: `${a.changes.length} Änderung(en) im Kundenregister: ${sample.join('; ')}${more}`, en: `${a.changes.length} change(s) in the client register: ${sample.join('; ')}${more}`, ru: `${a.changes.length} изменени(й) в реестре клиентов: ${sample.join('; ')}${more}` });
  },
  run: async (a, ctx) => {
    const columns = await listColumns();
    const changes: Change[] = [];
    const early: { caseId: string; field: string; ok: false; error: string }[] = [];
    for (const c of a.changes) {
      let caseId: string;
      try {
        caseId = await caseIdOf(c.case);
      } catch (err) {
        early.push({ caseId: c.case, field: c.field, ok: false, error: (err as { code?: string }).code ?? 'CASE_NOT_FOUND' });
        continue;
      }
      let field = c.field;
      let value: unknown = c.value;
      try {
        if (field === 'partner' || field === 'partnerId') {
          field = 'partnerId';
          value = value === null || value === '' ? null : (await partnerIdOf(String(value))).id;
        } else if (field === 'staff' || field === 'assignedStaff' || field === 'assignedStaffId') {
          field = 'assignedStaffId';
          value = value === null || value === '' ? null : (await staffIdOf(String(value))).id;
        } else if (field === 'note' || field === NOTE_KEY) field = NOTE_KEY;
        else if (!['firstName', 'lastName', 'passportNumber', 'birthDate', 'phone', 'visaType'].includes(field)) {
          const col = columns.find((x) => x.id === field) ?? columns.find((x) => foldName(x.label) === foldName(field));
          if (col) field = col.id;
        }
      } catch (err) {
        early.push({ caseId, field: c.field, ok: false, error: (err as { code?: string }).code ?? 'INVALID_VALUE' });
        continue;
      }
      changes.push({ caseId, field, value });
    }
    const { results, folderSync, partnerChanges } = changes.length ? await applyChanges(changes, columns) : { results: [], folderSync: [], partnerChanges: [] };
    const commissionsCreated = partnerChanges.length ? await syncCaseCommissions(partnerChanges, ctx.user.id) : 0;
    const saved = results.filter((r) => r.ok).length;
    if (saved) {
      await audit(actorReq(ctx), 'CLIENT_REGISTER_SAVED', undefined, {
        changes: saved,
        failed: results.length - saved + early.length,
        cases: new Set(results.filter((r) => r.ok).map((r) => r.caseId)).size,
        fields: [...new Set(results.filter((r) => r.ok).map((r) => r.field))].slice(0, 50),
        ...via,
      });
    }
    for (const id of folderSync) await syncCaseFolder(id).catch(() => undefined);
    return { saved, failed: results.length - saved + early.length, errors: [...early, ...results.filter((r) => !r.ok)], foldersSynced: folderSync.length, commissionsCreated };
  },
});

const caseLookup = defineTool({
  name: 'case_lookup',
  description: 'Finds cases by client name (accent-insensitive), passport number, e-mail or case number, optionally by status / partner / staff. Returns status, visa type, category, staff, partner, pending documents and the client folder in the drive.',
  schema: z.object({
    query: z.string().trim().max(120).optional(),
    status: z.enum(STATUSES).optional(),
    partner: z.string().trim().max(120).optional(),
    staff: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  run: async (a, ctx) => {
    const where: Prisma.CaseWhereInput = {};
    if (a.query) {
      where.id = { in: (await findCases(a.query, 200)).map((c) => c.id) };
    } else if (ctx.context?.caseId && !a.status && !a.partner && !a.staff) where.id = ctx.context.caseId;
    if (a.status) where.status = a.status as CaseStatus;
    if (a.partner) where.partnerId = a.partner === 'none' ? null : (await partnerIdOf(a.partner)).id;
    if (a.staff) where.assignedStaffId = (await staffIdOf(a.staff)).id;
    const [total, cases] = await Promise.all([
      prisma.case.count({ where }),
      prisma.case.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: a.limit,
        select: {
          id: true,
          number: true,
          status: true,
          visaType: true,
          profession: true,
          createdAt: true,
          appointmentAt: true,
          decisionAt: true,
          driveFolderId: true,
          parentCaseId: true,
          client: { select: { firstName: true, lastName: true, passportNumber: true, email: true, phone: true } },
          assignedStaff: { select: { firstName: true, lastName: true } },
          partner: { select: { id: true, name: true } },
          visaCategory: { select: { visaLabel: true } },
          _count: { select: { documents: { where: { status: 'PENDING' } } } },
        },
      }),
    ]);
    const paths = await pathsOf(cases.map((c) => c.driveFolderId).filter((x): x is string => !!x));
    return {
      total,
      cases: cases.map((c) => ({
        id: c.id,
        number: c.number,
        client: `${c.client.firstName} ${c.client.lastName}`.trim(),
        passport: c.client.passportNumber,
        email: c.client.email,
        phone: c.client.phone,
        status: c.status,
        visaType: c.visaType as VisaType,
        category: c.visaCategory?.visaLabel ?? null,
        profession: c.profession,
        ...(c.parentCaseId ? { familyMember: true } : {}),
        staff: c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() : null,
        partner: c.partner?.name ?? null,
        pendingDocuments: c._count.documents,
        created: c.createdAt.toISOString().slice(0, 10),
        ...(c.appointmentAt ? { appointment: c.appointmentAt.toISOString().slice(0, 16) } : {}),
        ...(c.decisionAt ? { decision: c.decisionAt.toISOString().slice(0, 10) } : {}),
        folder: c.driveFolderId ? { id: c.driveFolderId, path: (paths.get(c.driveFolderId) ?? '').replace(/^Gemeinsame Dokumente\//, '') } : null,
      })),
    };
  },
});

const totalsBrief = (t: PartnerTotals | undefined, currency: string) =>
  t ? { pending: money(t.pendingCents, currency), approved: money(t.approvedCents, currency), paid: money(t.paidCents, currency), total: money(t.totalCents, currency), thisMonth: money(t.thisMonthCents, currency) } : null;

const partnerList = defineTool({
  name: 'partner_list',
  description: 'Referral partners (middlemen) with client / case counts and commission totals (pending, approved, paid).',
  schema: z.object({ search: z.string().trim().max(120).optional(), active: z.enum(['true', 'false', 'all']).default('all') }),
  run: async (a) => {
    const partners = await prisma.referralPartner.findMany({
      where: { ...(a.active !== 'all' ? { active: a.active === 'true' } : {}), ...(a.search ? { OR: [{ name: { contains: a.search } }, { phone: { contains: a.search } }, { email: { contains: a.search } }] } : {}) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 300,
    });
    const [counts, totals] = await Promise.all([partnerCounts(partners.map((p) => p.id)), partnerCommissionTotals(partners.map((p) => p.id))]);
    return {
      count: partners.length,
      partners: partners.map((p) => ({ id: p.id, name: p.name, phone: p.phone, email: p.email, active: p.active, defaultCommission: p.commissionCents ? money(p.commissionCents, p.currency) : null, counts: counts.get(p.id), commissions: totalsBrief(totals.get(p.id), p.currency) })),
    };
  },
});

const partnerInfo = defineTool({
  name: 'partner_info',
  description: 'One partner: contact, default commission, counts, commission totals, the drive folder and the cases (newest first, max 50).',
  schema: z.object({ partner: z.string().trim().min(1).max(120) }),
  run: async (a) => {
    const { id } = await partnerIdOf(a.partner);
    const partner = await prisma.referralPartner.findUnique({ where: { id } });
    if (!partner) throw notFound('PARTNER_NOT_FOUND');
    const [cases, counts, totals, commissions] = await Promise.all([
      partnerCases(id),
      partnerCounts([id]),
      partnerCommissionTotals([id]),
      prisma.partnerCommission.findMany({ where: { partnerId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, amountCents: true, currency: true, status: true, caseId: true, note: true, createdAt: true, paidAt: true } }),
    ]);
    const folderId = await syncPartnerFolder(id).catch(() => null);
    return {
      id,
      name: partner.name,
      phone: partner.phone,
      email: partner.email,
      active: partner.active,
      note: partner.note ? clip(partner.note, 400) : null,
      defaultCommission: partner.commissionCents ? money(partner.commissionCents, partner.currency) : null,
      counts: counts.get(id),
      commissions: totalsBrief(totals.get(id), partner.currency),
      recentCommissions: commissions.map((c) => ({ amount: money(c.amountCents, c.currency), status: c.status, caseId: c.caseId, note: c.note, created: c.createdAt.toISOString().slice(0, 10), paid: c.paidAt?.toISOString().slice(0, 10) ?? null })),
      folderId,
      cases: cases.slice(0, 50).map((c) => ({ id: c.id, number: c.number, client: `${c.client.firstName} ${c.client.lastName}`.trim(), passport: c.client.passportNumber, status: c.status, visaType: c.visaType, created: c.createdAt.toISOString().slice(0, 10) })),
      totalCases: cases.length,
    };
  },
});

const partnerCreate = defineTool({
  name: 'partner_create',
  description: 'Creates a referral partner (unique name); their folder in "Partner" is created right away. commission = default commission per client in major units (creates a PENDING commission whenever a case is assigned).',
  confirm: true,
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().max(191).optional(),
    note: z.string().trim().max(5000).optional(),
    commission: z.number().min(0).max(1_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  }),
  summary: async (a, ctx) => {
    const extra = [a.phone, a.email, a.commission != null ? `${a.commission} ${a.currency ?? 'EUR'}` : null].filter(Boolean).join(', ');
    return tr(ctx, { az: `Yeni partnyor: "${a.name}"${extra ? ` (${extra})` : ''}`, de: `Neuer Partner „${a.name}“${extra ? ` (${extra})` : ''}`, en: `New partner "${a.name}"${extra ? ` (${extra})` : ''}`, ru: `Новый партнёр «${a.name}»${extra ? ` (${extra})` : ''}` });
  },
  run: async (a, ctx) => {
    const clash = await prisma.referralPartner.findFirst({ where: { name: a.name }, select: { id: true } });
    if (clash) throw conflict('PARTNER_NAME_TAKEN');
    const partner = await prisma.referralPartner.create({
      data: { name: a.name, phone: a.phone ?? null, email: a.email ?? null, note: a.note ?? null, active: true, commissionCents: a.commission != null ? Math.round(a.commission * 100) : null, ...(a.currency ? { currency: a.currency } : {}) },
    });
    await audit(actorReq(ctx), 'PARTNER_CREATED', partner.id, { name: partner.name, ...via });
    const folderId = await syncPartnerFolder(partner.id);
    return { id: partner.id, name: partner.name, folderId };
  },
});

const partnerAssignCases = defineTool({
  name: 'partner_assign_cases',
  description: 'Assigns cases to a partner (or removes the partner with partner: null). The client folders move under "Partner/<name>" and automatic commissions follow.',
  confirm: true,
  schema: z.object({ cases: z.array(z.string().trim().min(1).max(120)).min(1).max(500).describe('Case ids or numbers.'), partner: z.string().trim().max(120).nullable() }),
  summary: async (a, ctx) =>
    a.partner
      ? tr(ctx, { az: `${a.cases.length} müraciət "${a.partner}" partnyoruna bağlansın: ${listNames(a.cases)}`, de: `${a.cases.length} Antrag/Anträge dem Partner „${a.partner}“ zuordnen: ${listNames(a.cases)}`, en: `Assign ${a.cases.length} case(s) to partner "${a.partner}": ${listNames(a.cases)}`, ru: `Привязать ${a.cases.length} заявк(и) к партнёру «${a.partner}»: ${listNames(a.cases)}` })
      : tr(ctx, { az: `${a.cases.length} müraciətdən partnyor silinsin: ${listNames(a.cases)}`, de: `Partner von ${a.cases.length} Antrag/Anträgen entfernen: ${listNames(a.cases)}`, en: `Remove the partner from ${a.cases.length} case(s): ${listNames(a.cases)}`, ru: `Убрать партнёра у ${a.cases.length} заявк(и): ${listNames(a.cases)}` }),
  run: async (a, ctx) => {
    const partnerId = a.partner ? (await partnerIdOf(a.partner)).id : null;
    const ids: string[] = [];
    for (const c of a.cases) ids.push(await caseIdOf(c));
    const unique = [...new Set(ids)];
    const existing = await prisma.case.findMany({ where: { id: { in: unique } }, select: { id: true, partnerId: true } });
    const changedRows = existing.filter((c) => c.partnerId !== partnerId);
    const changed = changedRows.map((c) => c.id);
    let commissionsCreated = 0;
    if (changed.length) {
      await prisma.case.updateMany({ where: { id: { in: changed } }, data: { partnerId } });
      await prisma.caseEvent.createMany({ data: changed.map((caseId) => ({ caseId, type: 'CASE_UPDATED' as const, actorId: ctx.user.id, visibleToClient: false })) });
      syncFoldersLater(changed);
      commissionsCreated = await syncCaseCommissions(changedRows.map((c) => ({ caseId: c.id, from: c.partnerId, to: partnerId })), ctx.user.id);
    }
    await audit(actorReq(ctx), partnerId ? 'PARTNER_CASES_ASSIGNED' : 'PARTNER_CASES_UNASSIGNED', partnerId ?? undefined, { caseIds: unique, changed: changed.length, commissionsCreated, ...via });
    return { updated: changed.length, unchanged: unique.length - changed.length, commissionsCreated };
  },
});

export const registerTools: AnyAiTool[] = [registerQuery, caseLookup, partnerList, partnerInfo, registerUpdate, partnerCreate, partnerAssignCases];
