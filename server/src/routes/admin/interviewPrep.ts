import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { fitsVisaType, VISA_TYPES } from '../interviewPrep.js';

/**
 * Interview question bank — mounted at /api/admin/interview-prep (STAFF+ to read, ADMIN+ to write).
 *   GET    /                 ?kind=&category=&visaType=&published=&q=
 *   POST   /                 create
 *   PUT    /:id              update (partial)
 *   PATCH  /:id/publish      { published }
 *   POST   /reorder          { ids: [...] } — sortOrder follows the given order
 *   DELETE /:id
 */
export const adminInterviewPrepRouter = Router();
const adminOnly = requireMinRole('ADMIN');

const text = (max: number) => z.string().trim().max(max);
const l10nRequired = z.object({ az: text(500).min(1), de: text(500).min(1), en: text(500).min(1), ru: text(500).min(1) });
const l10nOptional = z.object({ az: text(1000), de: text(1000), en: text(1000), ru: text(1000) });

const questionSchema = z.object({
  kind: z.enum(['EMBASSY', 'EMPLOYER']),
  category: z.string().trim().min(1).max(40).regex(/^[a-z0-9_-]+$/),
  question: l10nRequired,
  answerDe: z.string().trim().min(1).max(5000),
  tips: l10nOptional.nullable().optional(),
  visaTypes: z.array(z.enum(VISA_TYPES)).max(VISA_TYPES.length).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  published: z.boolean().optional(),
});

const listQuery = z.object({
  kind: z.enum(['EMBASSY', 'EMPLOYER']).optional(),
  category: z.string().max(40).optional(),
  visaType: z.enum(VISA_TYPES).optional(),
  published: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
});

type QuestionInput = Partial<z.infer<typeof questionSchema>>;

/** Empty tips and an empty visa list are stored as NULL (no tips / every visa type). */
const tipsJson = (tips: QuestionInput['tips']) => (tips && Object.values(tips).some((v) => v) ? tips : Prisma.DbNull);
const visaJson = (visaTypes: QuestionInput['visaTypes']) => (visaTypes && visaTypes.length ? Array.from(new Set(visaTypes)) : Prisma.DbNull);

const toData = (d: QuestionInput) => {
  const { tips, visaTypes, ...rest } = d;
  const out: Prisma.InterviewPrepQuestionUpdateInput = { ...rest };
  if (tips !== undefined) out.tips = tipsJson(tips);
  if (visaTypes !== undefined) out.visaTypes = visaJson(visaTypes);
  return out;
};

adminInterviewPrepRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const rows = await prisma.interviewPrepQuestion.findMany({
    where: {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.published ? { published: q.published === 'true' } : {}),
    },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const needle = q.q?.toLowerCase();
  const items = rows.filter(
    (r) =>
      (!q.visaType || fitsVisaType(r.visaTypes, q.visaType)) &&
      (!needle || JSON.stringify(r.question).toLowerCase().includes(needle) || r.answerDe.toLowerCase().includes(needle)),
  );
  const categories = await prisma.interviewPrepQuestion.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
  res.json({ items, categories: categories.map((c) => c.category) });
});

adminInterviewPrepRouter.post('/', adminOnly, async (req, res) => {
  const d = parse(questionSchema, req.body ?? {});
  const sortOrder = d.sortOrder ?? ((await prisma.interviewPrepQuestion.aggregate({ where: { kind: d.kind }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
  const item = await prisma.interviewPrepQuestion.create({
    data: { kind: d.kind, category: d.category, question: d.question, answerDe: d.answerDe, tips: tipsJson(d.tips), visaTypes: visaJson(d.visaTypes), sortOrder, published: d.published ?? true },
  });
  await audit(req, 'INTERVIEW_PREP_CREATED', `interviewPrep:${item.id}`);
  res.status(201).json({ item });
});

adminInterviewPrepRouter.post('/reorder', adminOnly, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(1000) }), req.body ?? {});
  const unique = Array.from(new Set(ids));
  const found = await prisma.interviewPrepQuestion.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw notFound('QUESTION_NOT_FOUND');
  await prisma.$transaction(unique.map((id, i) => prisma.interviewPrepQuestion.update({ where: { id }, data: { sortOrder: i } })));
  await audit(req, 'INTERVIEW_PREP_REORDERED', undefined, { count: unique.length });
  res.json({ ok: true });
});

adminInterviewPrepRouter.put('/:id', adminOnly, async (req, res) => {
  const existing = await prisma.interviewPrepQuestion.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw notFound('QUESTION_NOT_FOUND');
  const d = parse(questionSchema.partial(), req.body ?? {});
  const item = await prisma.interviewPrepQuestion.update({ where: { id: existing.id }, data: toData(d) });
  await audit(req, 'INTERVIEW_PREP_UPDATED', `interviewPrep:${item.id}`);
  res.json({ item });
});

adminInterviewPrepRouter.patch('/:id/publish', adminOnly, async (req, res) => {
  const { published } = parse(z.object({ published: z.boolean() }), req.body ?? {});
  const existing = await prisma.interviewPrepQuestion.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw notFound('QUESTION_NOT_FOUND');
  const item = await prisma.interviewPrepQuestion.update({ where: { id: existing.id }, data: { published } });
  await audit(req, published ? 'INTERVIEW_PREP_PUBLISHED' : 'INTERVIEW_PREP_UNPUBLISHED', `interviewPrep:${item.id}`);
  res.json({ item });
});

adminInterviewPrepRouter.delete('/:id', adminOnly, async (req, res) => {
  const existing = await prisma.interviewPrepQuestion.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) throw notFound('QUESTION_NOT_FOUND');
  await prisma.interviewPrepQuestion.delete({ where: { id: existing.id } });
  await audit(req, 'INTERVIEW_PREP_DELETED', `interviewPrep:${existing.id}`);
  res.json({ ok: true });
});
