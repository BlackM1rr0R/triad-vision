import fs from 'node:fs';
import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import { berlinToday, isSoon, nextDeadline, upcomingDeadlines } from '../../lib/study/deadlines.js';
import { programmeData, programmeInput, uniqueProgrammeSlug } from '../../lib/study/catalogue.js';
import { programmesCsv, parseProgrammesCsv } from '../../lib/study/csv.js';
import { studyFilePath } from '../../lib/study/apply.js';

/**
 * Almaniyada təhsil, staff side — mounted at /api/admin/study (STAFF+ read / create / edit / import, ADMIN+ delete):
 *   GET    /programmes                     all programmes (drafts too) + next deadline, "soon" marker, application count
 *   GET    /programmes/export.csv          the whole catalogue as CSV (same columns the import reads)
 *   POST   /programmes/import?dryRun=1     CSV text (text/csv or { csv }) → upsert by slug, all-or-nothing
 *   GET    /programmes/:id                 one programme (with internal note)
 *   POST   /programmes                     create
 *   PATCH  /programmes/:id                 update (full body, same schema as create)
 *   DELETE /programmes/:id                 ADMIN+; applications keep their snapshot (programmeId set null)
 *   GET    /applications/:inquiryId/:file  cv | diploma of a "study programme" lead, as a download
 * Every write clears the public caches so /study shows it at once.
 */
export const adminStudyRouter = Router();

const withComputed = <T extends { deadlines: unknown }>(r: T, today = berlinToday()) => {
  const next = nextDeadline(r.deadlines, today);
  return { ...r, nextDeadline: next, soon: isSoon(next), upcoming: upcomingDeadlines(r.deadlines, today) };
};

adminStudyRouter.get('/programmes', async (_req, res) => {
  const rows = await prisma.studyProgramme.findMany({ orderBy: [{ published: 'desc' }, { name: 'asc' }], include: { _count: { select: { applications: true } } } });
  const today = berlinToday();
  const items = rows
    .map(({ _count, ...r }) => ({ ...withComputed(r, today), applications: _count.applications }))
    .sort((a, b) => (a.nextDeadline?.daysLeft ?? 1e9) - (b.nextDeadline?.daysLeft ?? 1e9) || a.name.localeCompare(b.name));
  res.json({ items });
});

adminStudyRouter.get('/programmes/export.csv', async (req, res) => {
  const rows = await prisma.studyProgramme.findMany({ orderBy: { name: 'asc' } });
  await audit(req, 'STUDY_PROGRAMMES_EXPORTED', 'study-programmes', { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="study-programmes-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(programmesCsv(rows));
});

const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '2mb' });

adminStudyRouter.post('/programmes/import', csvBody, async (req, res) => {
  const text = typeof req.body === 'string' ? req.body : typeof req.body?.csv === 'string' ? (req.body.csv as string) : '';
  if (!text.trim()) throw badRequest('EMPTY_FILE');
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const { rows, errors } = parseProgrammesCsv(text);
  const existing = new Map(
    (await prisma.studyProgramme.findMany({ where: { slug: { in: rows.flatMap((r) => (r.slug ? [r.slug] : [])) } }, select: { id: true, slug: true } })).map((r) => [r.slug, r.id]),
  );
  const plan = rows.map((r) => ({ row: r.row, slug: r.slug, name: r.input.name, action: r.slug && existing.has(r.slug) ? ('update' as const) : ('create' as const) }));
  const summary = { created: plan.filter((p) => p.action === 'create').length, updated: plan.filter((p) => p.action === 'update').length, errors, rows: plan };
  if (errors.length || dryRun) {
    res.status(errors.length ? 422 : 200).json({ ...summary, dryRun, written: false });
    return;
  }
  const written: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const id = r.slug ? existing.get(r.slug) : undefined;
      if (id) {
        await tx.studyProgramme.update({ where: { id }, data: programmeData(r.input, r.slug!) });
        written.push(r.slug!);
      } else {
        const slug = await uniqueProgrammeSlug(r.input, undefined, tx);
        await tx.studyProgramme.create({ data: programmeData(r.input, slug) });
        written.push(slug);
      }
    }
  });
  clearCache();
  await audit(req, 'STUDY_PROGRAMMES_IMPORTED', 'study-programmes', { created: summary.created, updated: summary.updated });
  res.json({ ...summary, dryRun: false, written: true, slugs: written });
});

adminStudyRouter.get('/programmes/:id', async (req, res) => {
  const row = await prisma.studyProgramme.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('PROGRAMME_NOT_FOUND');
  res.json({ programme: withComputed(row) });
});

adminStudyRouter.post('/programmes', async (req, res) => {
  const body = parse(programmeInput, req.body);
  if (body.slug && (await prisma.studyProgramme.findUnique({ where: { slug: body.slug }, select: { id: true } }))) throw badRequest('SLUG_TAKEN');
  const slug = await uniqueProgrammeSlug(body);
  const row = await prisma.studyProgramme.create({ data: programmeData(body, slug) });
  clearCache();
  await audit(req, 'STUDY_PROGRAMME_CREATED', `study-programme:${row.id}`, { slug, published: row.published });
  res.status(201).json({ programme: withComputed(row) });
});

adminStudyRouter.patch('/programmes/:id', async (req, res) => {
  const current = await prisma.studyProgramme.findUnique({ where: { id: String(req.params.id) }, select: { id: true, slug: true } });
  if (!current) throw notFound('PROGRAMME_NOT_FOUND');
  const body = parse(programmeInput, req.body);
  let slug = current.slug;
  if (body.slug && body.slug !== current.slug) {
    const taken = await prisma.studyProgramme.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (taken) throw badRequest('SLUG_TAKEN');
    slug = body.slug;
  }
  const row = await prisma.studyProgramme.update({ where: { id: current.id }, data: programmeData(body, slug) });
  clearCache();
  await audit(req, 'STUDY_PROGRAMME_UPDATED', `study-programme:${row.id}`, { slug, published: row.published });
  res.json({ programme: withComputed(row) });
});

adminStudyRouter.delete('/programmes/:id', requireMinRole('ADMIN'), async (req, res) => {
  const row = await prisma.studyProgramme.findUnique({ where: { id: String(req.params.id) }, select: { id: true, slug: true } });
  if (!row) throw notFound('PROGRAMME_NOT_FOUND');
  await prisma.studyProgramme.delete({ where: { id: row.id } });
  clearCache();
  await audit(req, 'STUDY_PROGRAMME_DELETED', `study-programme:${row.id}`, { slug: row.slug });
  res.json({ ok: true });
});

adminStudyRouter.get('/applications/:inquiryId/:file', async (req, res) => {
  const kind = parse(z.enum(['cv', 'diploma']), String(req.params.file));
  const app = await prisma.studyApplication.findUnique({ where: { inquiryId: String(req.params.inquiryId) } });
  const name = kind === 'cv' ? app?.cvStoredName : app?.diplomaStoredName;
  if (!app || !name) throw notFound('FILE_NOT_FOUND');
  const file = studyFilePath(name);
  if (!fs.existsSync(file)) throw notFound('FILE_NOT_FOUND');
  await audit(req, 'STUDY_APPLICATION_FILE_DOWNLOADED', `inquiry:${app.inquiryId}`, { kind });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const original = (kind === 'cv' ? app.cvOriginalName : app.diplomaOriginalName) ?? kind;
  const mime = (kind === 'cv' ? app.cvMime : app.diplomaMime) ?? 'application/octet-stream';
  res.download(file, original, { headers: { 'Content-Type': mime } });
});
