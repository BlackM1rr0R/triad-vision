import type { Inquiry, Locale, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { notifyUser } from '../notifications.js';

/**
 * Leads (Inquiry) of the admin list: server-side filters / sort / paging, the owner (assignedStaffId) and the
 * display data of the related people (staff, agent, partner, converted client / employer). Used by
 * routes/admin/inquiries.ts and the bulk actions (routes/admin/bulk.ts, "all matching").
 */

export const INQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] as const;
export const INQUIRY_SORTS = ['hot', 'newest', 'oldest', 'score', 'workers'] as const;
/** Source groups of the filter: "web" = the site's contact form (no source), the rest a `source` prefix. */
export const INQUIRY_SOURCES = ['web', 'agent', 'event', 'landing', 'ebook', 'package', 'cost-calculator', 'quiz', 'success-share'] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Query of GET /admin/inquiries (every value also lives in the page URL, so saved views keep it). */
export const inquiryListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(INQUIRY_STATUSES).optional(),
  kind: z.enum(['company', 'contact']).optional(),
  /** me | none | <staff id> */
  assignee: z.string().trim().min(1).max(40).optional(),
  level: z.enum(['HOT', 'WARM', 'COLD', 'NONE']).optional(),
  source: z.enum(INQUIRY_SOURCES).optional(),
  /** agent | agent:<id> | partner | partner:<id> */
  via: z
    .string()
    .trim()
    .regex(/^(agent|partner)(:[\w-]{1,40})?$/)
    .optional(),
  from: day.optional(),
  to: day.optional(),
  converted: z.enum(['yes', 'no']).optional(),
  sort: z.enum(INQUIRY_SORTS).default('hot'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type InquiryListQuery = z.infer<typeof inquiryListQuery>;

/** Baku has no DST: a calendar day there is [00:00, 24:00) at UTC+4. */
const bakuDay = (d: string, end = false) => new Date(new Date(`${d}T00:00:00+04:00`).getTime() + (end ? 24 * 60 * 60 * 1000 : 0));

/** Prisma filter of the list. `omit` leaves one filter out (status chip counts, assignee counts). */
export const inquiryListWhere = (q: Partial<InquiryListQuery>, viewerId: string, omit: ('status' | 'assignee')[] = []): Prisma.InquiryWhereInput => {
  const and: Prisma.InquiryWhereInput[] = [];
  if (q.status && !omit.includes('status')) and.push({ status: q.status });
  if (q.kind) and.push({ kind: q.kind });
  if (q.assignee && !omit.includes('assignee')) {
    if (q.assignee === 'me') and.push({ assignedStaffId: viewerId });
    else if (q.assignee === 'none') and.push({ assignedStaffId: null });
    else and.push({ assignedStaffId: q.assignee });
  }
  if (q.level) and.push({ scoreLevel: q.level === 'NONE' ? null : q.level });
  if (q.source) {
    if (q.source === 'web') and.push({ source: null, agentId: null });
    else if (q.source === 'agent') and.push({ OR: [{ agentId: { not: null } }, { source: { startsWith: 'agent:' } }] });
    else and.push({ source: { startsWith: q.source } });
  }
  if (q.via) {
    const [type, id] = q.via.split(':') as ['agent' | 'partner', string | undefined];
    if (type === 'agent') and.push(id ? { agentId: id } : { agentId: { not: null } });
    else and.push(id ? { partnerId: id } : { partnerId: { not: null } });
  }
  if (q.from) and.push({ createdAt: { gte: bakuDay(q.from) } });
  if (q.to) and.push({ createdAt: { lt: bakuDay(q.to, true) } });
  if (q.converted === 'yes') and.push({ convertedAt: { not: null } });
  if (q.converted === 'no') and.push({ convertedAt: null });
  const s = q.q?.trim();
  if (s) {
    const contains = { contains: s };
    and.push({ OR: [{ contactName: contains }, { email: contains }, { phone: contains }, { companyName: contains }, { message: contains }, { sector: contains }] });
  }
  return and.length ? { AND: and } : {};
};

/** "Hot first": open before closed (enum order NEW, IN_PROGRESS, DONE, ARCHIVED), then score, then newest. */
export const inquiryOrderBy = (sort: InquiryListQuery['sort']): Prisma.InquiryOrderByWithRelationInput[] => {
  switch (sort) {
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'score':
      return [{ score: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
    case 'workers':
      return [{ workersNeeded: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }];
    default:
      return [{ status: 'asc' }, { score: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  }
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Adds the names behind the id columns (Inquiry has no relations): owner, agent, partner, converted client / employer. */
export const enrichInquiries = async (rows: Inquiry[]) => {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const userIds = uniq([...rows.map((r) => r.assignedStaffId), ...rows.map((r) => r.convertedUserId)]);
  const [users, agents, partners, companies] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, role: true } }) : [],
    uniq(rows.map((r) => r.agentId)).length
      ? prisma.agent.findMany({ where: { id: { in: uniq(rows.map((r) => r.agentId)) } }, select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } })
      : [],
    uniq(rows.map((r) => r.partnerId)).length ? prisma.referralPartner.findMany({ where: { id: { in: uniq(rows.map((r) => r.partnerId)) } }, select: { id: true, name: true } }) : [],
    uniq(rows.map((r) => r.convertedCompanyId)).length ? prisma.company.findMany({ where: { id: { in: uniq(rows.map((r) => r.convertedCompanyId)) } }, select: { id: true, name: true } }) : [],
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const a = new Map(agents.map((x) => [x.id, { id: x.id, code: x.code, name: fullName(x.user) }]));
  const p = new Map(partners.map((x) => [x.id, x]));
  const c = new Map(companies.map((x) => [x.id, x]));
  return rows.map((r) => {
    const staff = r.assignedStaffId ? u.get(r.assignedStaffId) : undefined;
    const client = r.convertedUserId ? u.get(r.convertedUserId) : undefined;
    return {
      ...r,
      assignedStaff: staff ? { id: staff.id, name: fullName(staff) } : null,
      agent: r.agentId ? (a.get(r.agentId) ?? { id: r.agentId, code: '', name: '—' }) : null,
      partner: r.partnerId ? (p.get(r.partnerId) ?? null) : null,
      convertedUser: client ? { id: client.id, name: fullName(client), email: client.email, role: client.role } : null,
      convertedCompany: r.convertedCompanyId ? (c.get(r.convertedCompanyId) ?? null) : null,
    };
  });
};

export const assertInquiryStaff = async (staffId: string | null) => {
  if (!staffId) return null;
  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true, isActive: true, locale: true, firstName: true, lastName: true } });
  if (!staff || !staff.isActive || !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(staff.role)) throw badRequest('INVALID_STAFF');
  return staff;
};

const ASSIGNED_TEXT: Record<Locale, (name: string, by: string | null) => { title: string; body: string }> = {
  az: (n, by) => ({ title: `Sizə lid təyin edildi: ${n}`, body: by ? `${by} "${n}" müraciətini sizə təyin etdi.` : `"${n}" müraciəti avtomatik olaraq sizə təyin edildi.` }),
  de: (n, by) => ({ title: `Ihnen wurde eine Anfrage zugewiesen: ${n}`, body: by ? `${by} hat Ihnen die Anfrage „${n}“ zugewiesen.` : `Die Anfrage „${n}“ wurde Ihnen automatisch zugewiesen.` }),
  en: (n, by) => ({ title: `A lead was assigned to you: ${n}`, body: by ? `${by} assigned the inquiry "${n}" to you.` : `The inquiry "${n}" was assigned to you automatically.` }),
  ru: (n, by) => ({ title: `Вам назначен лид: ${n}`, body: by ? `${by} назначил(а) вам запрос «${n}».` : `Запрос «${n}» назначен вам автоматически.` }),
};

export const inquiryLabel = (q: Pick<Inquiry, 'contactName' | 'companyName'>) => (q.companyName ? `${q.companyName} · ${q.contactName}` : q.contactName);

/** In-app (+ push / e-mail per preferences) notice to the new owner of a lead. Never throws. */
export const notifyInquiryAssignee = async (staffId: string, q: Pick<Inquiry, 'id' | 'contactName' | 'companyName'>, actorId: string | null) => {
  try {
    if (actorId && actorId === staffId) return; // "take it myself" needs no notice
    const [staff, actor] = await Promise.all([
      prisma.user.findUnique({ where: { id: staffId }, select: { locale: true } }),
      actorId ? prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } }) : null,
    ]);
    if (!staff) return;
    const t = ASSIGNED_TEXT[staff.locale](inquiryLabel(q), actor ? fullName(actor) : null);
    await notifyUser(staffId, { type: 'INQUIRY_ASSIGNED', title: t.title, body: t.body, link: `/admin/inquiries?open=${q.id}` });
  } catch (err) {
    console.error('[inquiries] assignee notice failed', err);
  }
};

/** Sets (or clears) the owner of a lead; notifies a new owner. Returns the previous owner. */
export const setInquiryAssignee = async (inquiryId: string, staffId: string | null, actorId: string | null, opts: { notify?: boolean } = {}) => {
  const before = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: { id: true, assignedStaffId: true, contactName: true, companyName: true } });
  if (!before) return null;
  if (before.assignedStaffId === staffId) return { previous: before.assignedStaffId, changed: false };
  await prisma.inquiry.update({ where: { id: inquiryId }, data: { assignedStaffId: staffId, assignedAt: staffId ? new Date() : null } });
  if (staffId && opts.notify !== false) void notifyInquiryAssignee(staffId, before, actorId);
  return { previous: before.assignedStaffId, changed: true };
};

const BULK_TEXT: Record<Locale, (count: number, by: string) => { title: string; body: string }> = {
  az: (c, by) => ({ title: `Sizə ${c} lid təyin edildi`, body: `${by} ${c} müraciəti sizə təyin etdi.` }),
  de: (c, by) => ({ title: `Ihnen wurden ${c} Anfragen zugewiesen`, body: `${by} hat Ihnen ${c} Anfragen zugewiesen.` }),
  en: (c, by) => ({ title: `${c} leads were assigned to you`, body: `${by} assigned ${c} inquiries to you.` }),
  ru: (c, by) => ({ title: `Вам назначено лидов: ${c}`, body: `${by} назначил(а) вам запросов: ${c}.` }),
};

/** One notice for a bulk assignment (instead of one per lead). Never throws. */
export const notifyInquiryAssigneeBulk = async (staffId: string, ids: string[], actorId: string) => {
  try {
    if (!ids.length || staffId === actorId) return;
    if (ids.length === 1) {
      const q = await prisma.inquiry.findUnique({ where: { id: ids[0] }, select: { id: true, contactName: true, companyName: true } });
      if (q) await notifyInquiryAssignee(staffId, q, actorId);
      return;
    }
    const [staff, actor] = await Promise.all([
      prisma.user.findUnique({ where: { id: staffId }, select: { locale: true } }),
      prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } }),
    ]);
    if (!staff) return;
    const t = BULK_TEXT[staff.locale](ids.length, actor ? fullName(actor) : '—');
    await notifyUser(staffId, { type: 'INQUIRY_ASSIGNED', title: t.title, body: t.body, link: '/admin/inquiries?assignee=me' });
  } catch (err) {
    console.error('[inquiries] bulk assignee notice failed', err);
  }
};
