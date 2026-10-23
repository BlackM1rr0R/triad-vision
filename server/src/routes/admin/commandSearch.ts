import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { limiter, parse } from '../../lib/http.js';
import { DriveAccessCtx, nodeLiteSelect, type NodeLite } from '../../lib/drive/access.js';
import { allows } from '../../lib/drive/levels.js';
import { caseVisibilityWhere, parseTaskRef, taskKey, type Actor } from '../../lib/tasks/core.js';

/**
 * Staff command palette (Ctrl+K): one small query per entity type, run in parallel, top 5 each.
 *
 *   GET /api/admin/command-search?q=…   (STAFF+, the admin router already requires it)
 *
 * Access follows the existing rules: every staff role sees every case and task (as in the admin lists),
 * drive files only when the drive engine grants at least VIEW, and the JSON goes through the global
 * masking middleware (a company's VAT id is "•••• 6789" for STAFF by default).
 * The query text is personal data (names, e-mails, phone numbers): it is never logged, and a failing
 * query is reported without the Prisma message (which would repeat the arguments).
 */
export const adminCommandSearchRouter = Router();

const PER_TYPE = 5;
/** Drive candidates checked against the permission engine before the top 5 visible ones are kept. */
const DRIVE_CANDIDATES = 60;

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 120, keyGenerator: (req) => `cmdk:${req.user?.id ?? 'anon'}` });

const querySchema = z.object({ q: z.string().trim().min(2).max(100) });

const CASE_NO = /^TV-\d{4}-\d{1,6}$/i;

/** Escapes LIKE wildcards for the raw vacancy query (Prisma's `contains` does this itself). */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const words = (q: string) => q.split(/\s+/).filter(Boolean).slice(0, 4);

/** Every word must match one of the name / e-mail columns ("Kamran Həs" finds Kamran Həsənov). */
const personWhere = (q: string): Prisma.UserWhereInput => ({
  AND: words(q).map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { email: { contains: w } }] })),
});

const searchCases = async (q: string) => {
  const exactNo = CASE_NO.test(q) ? q.toUpperCase() : null;
  const select = {
    id: true,
    number: true,
    status: true,
    profession: true,
    client: { select: { firstName: true, lastName: true } },
  } satisfies Prisma.CaseSelect;
  const [exact, rows] = await Promise.all([
    exactNo ? prisma.case.findUnique({ where: { number: exactNo }, select }) : Promise.resolve(null),
    prisma.case.findMany({
      where: { OR: [{ number: { contains: q } }, { client: personWhere(q) }] },
      select,
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE + 1,
    }),
  ]);
  // The exact case number always comes first, then number prefixes, then the rest by recency.
  const up = q.toUpperCase();
  const sorted = rows.filter((r) => r.id !== exact?.id).sort((a, b) => Number(b.number.startsWith(up)) - Number(a.number.startsWith(up)));
  return [...(exact ? [exact] : []), ...sorted].slice(0, PER_TYPE).map((c) => ({
    id: c.id,
    number: c.number,
    status: c.status,
    profession: c.profession,
    clientName: `${c.client.firstName} ${c.client.lastName}`.trim(),
    exact: c.id === exact?.id,
  }));
};

const searchUsers = async (q: string) => {
  // Phone numbers are stored as typed ("+994 50 777 66 55"): compare digits only.
  const digits = q.replace(/\D/g, '');
  const byPhone =
    digits.length >= 4 && digits.length >= q.replace(/[\s()+.-]/g, '').length
      ? (
          await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM \`User\` WHERE phone IS NOT NULL AND mergedIntoId IS NULL
              AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${`%${digits}%`}
            ORDER BY updatedAt DESC LIMIT ${PER_TYPE}`)
        ).map((r) => r.id)
      : [];
  const rows = await prisma.user.findMany({
    where: { mergedIntoId: null, OR: [personWhere(q), ...(byPhone.length ? [{ id: { in: byPhone } }] : [])] },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isActive: true },
    orderBy: { updatedAt: 'desc' },
    take: PER_TYPE,
  });
  return rows.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, phone: u.phone, role: u.role, isActive: u.isActive }));
};

const searchCompanies = async (q: string) =>
  prisma.company.findMany({
    where: { OR: [{ name: { contains: q } }, { contactName: { contains: q } }, { email: { contains: q } }] },
    select: { id: true, name: true, city: true, status: true, vatId: true },
    orderBy: { updatedAt: 'desc' },
    take: PER_TYPE,
  });

const searchVacancies = async (q: string) => {
  // The title is a JSON object per language; the cast searches all four at once.
  const like = `%${likeEscape(q.toLowerCase())}%`;
  const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM \`Vacancy\`
    WHERE LOWER(CAST(title AS CHAR)) LIKE ${like} OR LOWER(profession) LIKE ${like} OR LOWER(city) LIKE ${like}
    ORDER BY updatedAt DESC LIMIT ${PER_TYPE}`);
  if (!ids.length) return [];
  const rows = await prisma.vacancy.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: { id: true, title: true, status: true, city: true, company: { select: { name: true } }, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((v) => ({ id: v.id, title: v.title, status: v.status, city: v.city, companyName: v.company?.name ?? null }));
};

const searchDrive = async (ctx: DriveAccessCtx, q: string) => {
  const rows = await prisma.driveNode.findMany({
    where: { deletedAt: null, system: false, name: { contains: q } },
    select: { ...nodeLiteSelect, mimeType: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: DRIVE_CANDIDATES,
  });
  await ctx.addWithAncestors(rows as NodeLite[]);
  return rows
    .filter((r) => allows(ctx.level(r.id), 'VIEW'))
    .slice(0, PER_TYPE)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      mimeType: r.mimeType,
      parentId: r.parentId,
      parentName: r.parentId ? (ctx.nodes.get(r.parentId)?.name ?? null) : null,
    }));
};

const searchTasks = async (actor: Actor, q: string) => {
  // "T-0012" / "t12" also finds the task by its number (shown first).
  const ref = /^t-?\d{1,6}$/i.test(q) ? parseTaskRef(q) : null;
  const no = ref && 'number' in ref ? ref.number : null;
  const rows = await prisma.task.findMany({
    where: { AND: [caseVisibilityWhere(actor), { OR: [{ title: { contains: q } }, ...(no !== null ? [{ number: no }] : [])] }] },
    select: { id: true, number: true, title: true, status: true, priority: true, dueAt: true },
    orderBy: { updatedAt: 'desc' },
    take: PER_TYPE + 1,
  });
  rows.sort((a, b) => Number(b.number === no) - Number(a.number === no));
  return rows.slice(0, PER_TYPE).map((t) => ({ id: t.id, key: taskKey(t.number), title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt }));
};

adminCommandSearchRouter.get('/', searchLimiter, async (req, res) => {
  const { q } = parse(querySchema, req.query);
  const actor: Actor = { id: req.user!.id, role: req.user!.role };
  const ctx = new DriveAccessCtx(actor);
  try {
    const [cases, users, companies, vacancies, files, tasks] = await Promise.all([
      searchCases(q),
      searchUsers(q),
      searchCompanies(q),
      searchVacancies(q),
      searchDrive(ctx, q),
      searchTasks(actor, q),
    ]);
    res.json({ q, cases, users, companies, vacancies, files, tasks });
  } catch (err) {
    // No query text and no Prisma message (it echoes the arguments) in the log.
    const code = (err as { code?: string })?.code ?? (err as Error)?.name ?? 'Error';
    console.error(`[command-search] failed (${code}) [${(res.locals as { requestId?: string }).requestId ?? '-'}]`);
    res.status(500).json({ error: 'INTERNAL' });
  }
});
