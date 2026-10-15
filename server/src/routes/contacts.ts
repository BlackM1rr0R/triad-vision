import express, { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import {
  canDelete,
  canEdit,
  contactSelect,
  contactsToCsv,
  csvToRecords,
  normaliseEmail,
  normaliseEmails,
  normaliseTags,
  searchContactIds,
  toContact,
  visibilityWhere,
  type ContactActor,
  type ContactOut,
} from '../lib/workspace/contacts.js';

/** Shared address book (/api/contacts): search, CRUD, tags, CSV import/export, merge, platform suggestions. */
export const contactsRouter = Router();
contactsRouter.use(requireMinRole('STAFF'));

const actorOf = (req: Request): ContactActor => ({ id: req.user!.id, role: req.user!.role });

const PAGE_SIZE = 50;
const SORTS = ['name', 'recent', 'company', 'lastContact'] as const;

const optText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((s) => (s === undefined ? undefined : s && s.trim() ? s.trim() : null));

const emailField = z
  .string()
  .max(190)
  .nullable()
  .optional()
  .transform((s) => (s === undefined ? undefined : normaliseEmail(s)))
  .refine((s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'INVALID_EMAIL');

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: optText(80),
  email: emailField,
  emails: z.array(z.string().max(190)).max(10).optional(),
  phone: optText(40),
  company: optText(120),
  companyId: optText(40),
  position: optText(120),
  address: optText(255),
  notes: optText(5000),
  tags: z.array(z.string().max(40)).max(20).optional(),
  shared: z.boolean().optional(),
});

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  shared: z.enum(['true', 'false']).optional(),
  letter: z.string().trim().max(2).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(SORTS).optional(),
});

const orderFor = (sort: (typeof SORTS)[number]): Prisma.ContactOrderByWithRelationInput[] => {
  switch (sort) {
    case 'recent':
      return [{ updatedAt: 'desc' }];
    case 'company':
      return [{ company: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }];
    case 'lastContact':
      return [{ lastContactAt: { sort: 'desc', nulls: 'last' } }, { lastName: 'asc' }];
    default:
      return [{ lastName: 'asc' }, { firstName: 'asc' }];
  }
};

const loadContact = async (id: string, actor: ContactActor) => {
  const c = await prisma.contact.findFirst({ where: { AND: [{ id }, visibilityWhere(actor)] }, select: contactSelect });
  if (!c) throw notFound('CONTACT_NOT_FOUND');
  return c;
};

const validateCompany = async (companyId: string | null | undefined) => {
  if (!companyId) return companyId;
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!c) throw badRequest('INVALID_COMPANY');
  return companyId;
};

/** Does the actor already have a visible contact for this address? (import dedupe, from-user links) */
const findByEmail = (actor: ContactActor, email: string) =>
  prisma.contact.findFirst({ where: { AND: [{ email }, visibilityWhere(actor)] }, select: contactSelect });

// ─── Lookups (before /:id) ─────────────────────────────────────────────

/** GET /api/contacts/tags → { tags: [{ tag, count }] } over the contacts I can see. */
contactsRouter.get('/tags', async (req, res) => {
  const rows = await prisma.contact.findMany({ where: visibilityWhere(actorOf(req)), select: { tags: true } });
  const counts = new Map<string, { tag: string; count: number }>();
  for (const r of rows) {
    for (const tag of normaliseTags(r.tags)) {
      const key = tag.toLowerCase();
      const e = counts.get(key) ?? { tag, count: 0 };
      e.count++;
      counts.set(key, e);
    }
  }
  res.json({ tags: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)) });
});

/**
 * GET /api/contacts/suggest?q= → people on the platform who are not contacts yet: clients with a
 * case, employer users and companies. Each row carries what the "Add" button needs.
 */
contactsRouter.get('/suggest', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(120).optional() }), req.query);
  const [linkedUsers, linkedCompanies] = await Promise.all([
    prisma.contact.findMany({ where: { userId: { not: null } }, select: { userId: true } }),
    prisma.contact.findMany({ where: { companyId: { not: null } }, select: { companyId: true } }),
  ]);
  const userIds = linkedUsers.map((c) => c.userId!);
  const companyIds = linkedCompanies.map((c) => c.companyId!);
  const nameFilter = q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }] } : {};
  const [clients, employers, companies] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'CLIENT', isActive: true, id: { notIn: userIds }, cases: { some: {} }, ...nameFilter },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, _count: { select: { cases: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.user.findMany({
      where: { role: 'COMPANY', isActive: true, id: { notIn: userIds }, ...nameFilter },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.company.findMany({
      where: { id: { notIn: companyIds }, ...(q ? { OR: [{ name: { contains: q } }, { contactName: { contains: q } }, { email: { contains: q } }] } : {}) },
      select: { id: true, name: true, contactName: true, email: true, phone: true, city: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);
  res.json({
    clients: clients.map((u) => ({ kind: 'client' as const, userId: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, cases: u._count.cases })),
    employers: employers.map((u) => ({ kind: 'employer' as const, userId: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, company: u.company?.name ?? null, companyId: u.company?.id ?? null })),
    companies: companies.map((c) => ({ kind: 'company' as const, companyId: c.id, name: c.name, contactName: c.contactName, email: c.email, phone: c.phone, city: c.city, status: c.status })),
  });
});

/** GET /api/contacts/export.csv → every contact I can see (same columns as the import). */
contactsRouter.get('/export.csv', async (req, res) => {
  const actor = actorOf(req);
  const rows = await prisma.contact.findMany({ where: visibilityWhere(actor), select: contactSelect, orderBy: orderFor('name') });
  await audit(req, 'CONTACTS_EXPORTED', undefined, { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(contactsToCsv(rows.map((r) => toContact(r, actor))));
});

/**
 * POST /api/contacts/import — CSV as text/csv (or text/plain) body, or JSON { csv, shared?, update? }.
 * Dedupes by e-mail: existing contacts are skipped unless update=1 (then blanks are filled and tags
 * merged). Answers { created, updated, skipped, invalid, total, columns, unmapped }.
 */
contactsRouter.post('/import', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), async (req, res) => {
  const actor = actorOf(req);
  let csv: string;
  let shared = true;
  let update = false;
  if (typeof req.body === 'string') {
    csv = req.body;
    const qs = parse(z.object({ shared: z.enum(['true', 'false']).optional(), update: z.enum(['1', 'true']).optional() }), req.query);
    shared = qs.shared !== 'false';
    update = !!qs.update;
  } else {
    const b = parse(z.object({ csv: z.string().max(5_000_000), shared: z.boolean().optional(), update: z.boolean().optional() }), req.body);
    csv = b.csv;
    shared = b.shared ?? true;
    update = b.update ?? false;
  }
  if (!csv.trim()) throw badRequest('EMPTY_CSV');
  const { records, columns, unmapped } = csvToRecords(csv);
  if (!columns.length) throw badRequest('NO_KNOWN_COLUMNS');
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of records) {
    if (r.email) {
      if (seen.has(r.email)) {
        skipped++;
        continue;
      }
      seen.add(r.email);
      const existing = await findByEmail(actor, r.email);
      if (existing) {
        if (!update || !canEdit(actor, existing)) {
          skipped++;
          continue;
        }
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            lastName: existing.lastName ?? r.lastName,
            phone: existing.phone ?? r.phone,
            company: existing.company ?? r.company,
            position: existing.position ?? r.position,
            address: existing.address ?? r.address,
            notes: existing.notes ?? r.notes,
            tags: normaliseTags([...normaliseTags(existing.tags), ...r.tags]),
          },
        });
        updated++;
        continue;
      }
    }
    await prisma.contact.create({
      data: { ...r, tags: r.tags, emails: [], shared, source: 'IMPORT', createdById: actor.id },
    });
    created++;
  }
  await audit(req, 'CONTACTS_IMPORTED', undefined, { created, updated, skipped });
  res.json({ created, updated, skipped, invalid: 0, total: records.length, columns, unmapped });
});

/**
 * POST /api/contacts/merge { keepId, mergeIds[] } → fills blanks of `keep` from the merged contacts,
 * unions e-mails and tags, keeps the newest lastContactAt, then deletes the merged ones.
 */
contactsRouter.post('/merge', async (req, res) => {
  const actor = actorOf(req);
  const { keepId, mergeIds } = parse(z.object({ keepId: z.string().min(1).max(40), mergeIds: z.array(z.string().min(1).max(40)).min(1).max(20) }), req.body);
  const ids = [...new Set(mergeIds.filter((id) => id !== keepId))];
  if (!ids.length) throw badRequest('NOTHING_TO_MERGE');
  const keep = await loadContact(keepId, actor);
  if (!canEdit(actor, keep)) throw forbidden();
  const others = await prisma.contact.findMany({ where: { AND: [{ id: { in: ids } }, visibilityWhere(actor)] }, select: contactSelect });
  if (others.length !== ids.length) throw notFound('CONTACT_NOT_FOUND');
  if (others.some((o) => !canDelete(actor, o))) throw forbidden();

  const primary = keep.email ?? others.find((o) => o.email)?.email ?? null;
  const emails = normaliseEmails(
    [keep.email, ...normaliseEmails(keep.emails, null), ...others.flatMap((o) => [o.email, ...normaliseEmails(o.emails, null)])].filter(Boolean),
    primary,
  );
  const first = <T>(...vals: (T | null | undefined)[]) => vals.find((v) => v !== null && v !== undefined && v !== '') ?? null;
  const latest = [keep.lastContactAt, ...others.map((o) => o.lastContactAt)].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const notes = [keep.notes, ...others.map((o) => o.notes)].filter((n): n is string => !!n && n.trim() !== '');
  const data: Prisma.ContactUpdateInput = {
    email: primary,
    emails,
    lastName: first(keep.lastName, ...others.map((o) => o.lastName)),
    phone: first(keep.phone, ...others.map((o) => o.phone)),
    company: first(keep.company, ...others.map((o) => o.company)),
    position: first(keep.position, ...others.map((o) => o.position)),
    address: first(keep.address, ...others.map((o) => o.address)),
    notes: [...new Set(notes)].join('\n\n') || null,
    tags: normaliseTags([...normaliseTags(keep.tags), ...others.flatMap((o) => normaliseTags(o.tags))]),
    lastContactAt: latest,
    shared: keep.shared || others.some((o) => o.shared),
  };
  const userId = first(keep.userId, ...others.map((o) => o.userId));
  const companyId = first(keep.companyId, ...others.map((o) => o.companyId));
  const [, row] = await prisma.$transaction([
    prisma.contact.deleteMany({ where: { id: { in: ids } } }),
    prisma.contact.update({
      where: { id: keep.id },
      data: { ...data, ...(userId ? { user: { connect: { id: userId } } } : {}), ...(companyId ? { companyRef: { connect: { id: companyId } } } : {}) },
      select: contactSelect,
    }),
  ]);
  await audit(req, 'CONTACTS_MERGED', keep.id, { merged: ids });
  res.json({ contact: toContact(row, actor), merged: ids.length });
});

/** POST /api/contacts/from-user/:userId → contact linked to a client / employer account. */
contactsRouter.post('/from-user/:userId', async (req, res) => {
  const actor = actorOf(req);
  const u = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, role: true, firstName: true, lastName: true, email: true, phone: true, city: true, profession: true, company: { select: { id: true, name: true } } },
  });
  if (!u || !['CLIENT', 'COMPANY'].includes(u.role)) throw notFound('USER_NOT_FOUND');
  const linked = await prisma.contact.findFirst({ where: { userId: u.id }, select: contactSelect });
  if (linked) throw conflict('CONTACT_EXISTS', linked.id);
  const row = await prisma.contact.create({
    data: {
      firstName: u.firstName,
      lastName: u.lastName,
      email: normaliseEmail(u.email),
      phone: u.phone,
      company: u.company?.name ?? null,
      companyId: u.company?.id ?? null,
      position: u.role === 'CLIENT' ? u.profession : null,
      address: u.city,
      tags: [u.role === 'CLIENT' ? 'client' : 'employer'],
      emails: [],
      shared: true,
      source: 'MANUAL',
      userId: u.id,
      createdById: actor.id,
    },
    select: contactSelect,
  });
  await audit(req, 'CONTACT_CREATED', row.id, { fromUser: u.id });
  res.status(201).json({ contact: toContact(row, actor) });
});

/** POST /api/contacts/from-company/:companyId → contact linked to an employer company. */
contactsRouter.post('/from-company/:companyId', async (req, res) => {
  const actor = actorOf(req);
  const c = await prisma.company.findUnique({ where: { id: req.params.companyId } });
  if (!c) throw notFound('COMPANY_NOT_FOUND');
  const linked = await prisma.contact.findFirst({ where: { companyId: c.id, userId: null }, select: contactSelect });
  if (linked) throw conflict('CONTACT_EXISTS', linked.id);
  const [firstName, ...rest] = (c.contactName?.trim() || c.name).split(/\s+/);
  const row = await prisma.contact.create({
    data: {
      firstName: firstName.slice(0, 80),
      lastName: rest.join(' ').slice(0, 80) || null,
      email: normaliseEmail(c.email),
      phone: c.phone,
      company: c.name,
      companyId: c.id,
      address: [c.address, c.city].filter(Boolean).join(', ').slice(0, 255) || null,
      tags: ['employer'],
      emails: [],
      shared: true,
      source: 'MANUAL',
      createdById: actor.id,
    },
    select: contactSelect,
  });
  await audit(req, 'CONTACT_CREATED', row.id, { fromCompany: c.id });
  res.status(201).json({ contact: toContact(row, actor) });
});

// ─── List / CRUD ───────────────────────────────────────────────────────

/**
 * GET /api/contacts?q=&tag=&company=&shared=&letter=&page=&limit=&sort= → { items, total, page, pageSize, mode }.
 * With `q` the result is ranked (fulltext, LIKE fallback) and the Mail compose autocomplete uses limit=8.
 */
contactsRouter.get('/', async (req, res) => {
  const actor = actorOf(req);
  const p = parse(listSchema, req.query);
  const pageSize = p.limit ?? PAGE_SIZE;
  const page = p.page ?? 1;
  const filters: Prisma.ContactWhereInput[] = [visibilityWhere(actor)];
  if (p.shared === 'true') filters.push({ shared: true });
  if (p.shared === 'false') filters.push({ shared: false, createdById: actor.id });
  if (p.company) filters.push({ company: p.company });
  if (p.letter) filters.push({ OR: [{ lastName: { startsWith: p.letter } }, { AND: [{ lastName: null }, { firstName: { startsWith: p.letter } }] }] });
  // Tags are JSON: the exact (case-insensitive) match is checked in memory below.

  let items: ContactOut[];
  let total: number;
  let mode: 'fulltext' | 'like' | null = null;
  if (p.q) {
    const found = await searchContactIds(actor, p.q, 500);
    mode = found.mode;
    const rows = found.ids.length ? await prisma.contact.findMany({ where: { AND: [{ id: { in: found.ids } }, ...filters] }, select: contactSelect }) : [];
    const order = new Map(found.ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    let all = rows.map((r) => toContact(r, actor));
    if (p.tag) all = all.filter((c) => c.tags.some((t) => t.toLowerCase() === p.tag!.toLowerCase()));
    total = all.length;
    items = all.slice((page - 1) * pageSize, page * pageSize);
  } else {
    const where = { AND: filters };
    const orderBy = orderFor(p.sort ?? 'name');
    if (p.tag) {
      const rows = await prisma.contact.findMany({ where, select: contactSelect, orderBy });
      const all = rows.map((r) => toContact(r, actor)).filter((c) => c.tags.some((t) => t.toLowerCase() === p.tag!.toLowerCase()));
      total = all.length;
      items = all.slice((page - 1) * pageSize, page * pageSize);
    } else {
      const [rows, n] = await Promise.all([
        prisma.contact.findMany({ where, select: contactSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.contact.count({ where }),
      ]);
      total = n;
      items = rows.map((r) => toContact(r, actor));
    }
  }
  res.json({ items, total, page, pageSize, mode });
});

contactsRouter.post('/', async (req, res) => {
  const actor = actorOf(req);
  const b = parse(bodySchema, req.body);
  const email = b.email ?? null;
  await validateCompany(b.companyId);
  const row = await prisma.contact.create({
    data: {
      firstName: b.firstName,
      lastName: b.lastName ?? null,
      email,
      emails: normaliseEmails(b.emails ?? [], email),
      phone: b.phone ?? null,
      company: b.company ?? null,
      companyId: b.companyId ?? null,
      position: b.position ?? null,
      address: b.address ?? null,
      notes: b.notes ?? null,
      tags: normaliseTags(b.tags ?? []),
      shared: b.shared ?? true,
      source: 'MANUAL',
      createdById: actor.id,
    },
    select: contactSelect,
  });
  await audit(req, 'CONTACT_CREATED', row.id);
  res.status(201).json({ contact: toContact(row, actor) });
});

contactsRouter.get('/:id', async (req, res) => {
  const actor = actorOf(req);
  const c = await loadContact(req.params.id, actor);
  const contact = toContact(c, actor);
  // Activity: linked platform account and its cases (cheap, from existing tables).
  const user = c.userId
    ? await prisma.user.findUnique({
        where: { id: c.userId },
        select: {
          id: true,
          role: true,
          firstName: true,
          lastName: true,
          email: true,
          cases: { select: { id: true, number: true, status: true, profession: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 10 },
        },
      })
    : null;
  const companyRef = c.companyId ? await prisma.company.findUnique({ where: { id: c.companyId }, select: { id: true, name: true, status: true, city: true } }) : null;
  res.json({
    contact,
    user: user ? { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email } : null,
    cases: user?.cases ?? [],
    companyRef,
  });
});

contactsRouter.patch('/:id', async (req, res) => {
  const actor = actorOf(req);
  const c = await loadContact(req.params.id, actor);
  if (!canEdit(actor, c)) throw forbidden();
  const b = parse(bodySchema.partial(), req.body);
  await validateCompany(b.companyId);
  const email = b.email === undefined ? c.email : b.email;
  const data: Prisma.ContactUncheckedUpdateInput = {};
  if (b.firstName !== undefined) data.firstName = b.firstName;
  for (const k of ['lastName', 'phone', 'company', 'companyId', 'position', 'address', 'notes'] as const) {
    if (b[k] !== undefined) data[k] = b[k];
  }
  if (b.email !== undefined) data.email = b.email;
  if (b.emails !== undefined || b.email !== undefined) data.emails = normaliseEmails(b.emails ?? normaliseEmails(c.emails, null), email);
  if (b.tags !== undefined) data.tags = normaliseTags(b.tags);
  // Only the creator (or an admin) may flip a contact between private and shared.
  if (b.shared !== undefined && b.shared !== c.shared) {
    if (c.createdById !== actor.id && actor.role === 'STAFF') throw forbidden();
    data.shared = b.shared;
  }
  const row = await prisma.contact.update({ where: { id: c.id }, data, select: contactSelect });
  res.json({ contact: toContact(row, actor) });
});

/** PATCH /api/contacts/:id/touch → lastContactAt = now (the mail module writes it directly when sending). */
contactsRouter.patch('/:id/touch', async (req, res) => {
  const actor = actorOf(req);
  const c = await loadContact(req.params.id, actor);
  const row = await prisma.contact.update({ where: { id: c.id }, data: { lastContactAt: new Date() }, select: contactSelect });
  res.json({ contact: toContact(row, actor) });
});

contactsRouter.delete('/:id', async (req, res) => {
  const actor = actorOf(req);
  const c = await loadContact(req.params.id, actor);
  if (!canDelete(actor, c)) throw forbidden();
  await prisma.contact.delete({ where: { id: c.id } });
  await audit(req, 'CONTACT_DELETED', c.id, { email: c.email });
  res.json({ ok: true });
});
