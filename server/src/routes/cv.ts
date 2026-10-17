import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { pickL10n } from '../lib/jobsNotifications.js';
import { openVacancyWhere } from '../lib/vacancies.js';
import { CV_LANGS, CV_TEMPLATES, cvCompleteness, cvPutSchema, readCv } from '../lib/cv/schema.js';
import { prefillCv } from '../lib/cv/prefill.js';
import { buildCvPdf, cvProfileSelect, cvView, ensureCv } from '../lib/cv/load.js';
import { attachmentHeader, asciiName } from '../lib/cv/pdf.js';
import { LETTER_KINDS, LETTER_LANGS, buildLetter, letterAnswersSchema, letterRecipient, type LetterAnswers, type LetterContext, type LetterKind, type LetterLang } from '../lib/cv/letters.js';
import { renderLetterPdf } from '../lib/cv/letterPdf.js';

/** CV builder and motivation letters — mounted at /api/cv (clients). */
export const cvRouter = Router();
cvRouter.use(requireRole('CLIENT'));

const uid = (req: { user?: { id: string } }) => req.user!.id;

// ─── CV ────────────────────────────────────────────────────────────────

const loadProfile = (userId: string) => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: cvProfileSelect });

cvRouter.get('/', async (req, res) => {
  const [row, profile] = await Promise.all([ensureCv(uid(req)), loadProfile(uid(req))]);
  const cv = cvView(row);
  res.json({ cv, profile, completeness: cvCompleteness(cv.data, profile) });
});

cvRouter.put('/', async (req, res) => {
  const body = parse(cvPutSchema, req.body);
  const before = await ensureCv(uid(req));
  const row = await prisma.candidateCv.update({
    where: { userId: uid(req) },
    data: {
      data: body.data as unknown as Prisma.InputJsonValue,
      ...(body.template ? { template: body.template } : {}),
      ...(body.shareWithEmployers !== undefined ? { shareWithEmployers: body.shareWithEmployers } : {}),
    },
  });
  if (body.shareWithEmployers !== undefined && body.shareWithEmployers !== before.shareWithEmployers) {
    await audit(req, body.shareWithEmployers ? 'CV_SHARE_ENABLED' : 'CV_SHARE_DISABLED', `user:${uid(req)}`);
  }
  const profile = await loadProfile(uid(req));
  const cv = cvView(row);
  res.json({ cv, completeness: cvCompleteness(cv.data, profile) });
});

cvRouter.post('/prefill', async (req, res) => {
  const [row, profile] = await Promise.all([ensureCv(uid(req)), loadProfile(uid(req))]);
  const { data, filled } = prefillCv(readCv(row.data), profile);
  const saved = filled.length ? await prisma.candidateCv.update({ where: { userId: uid(req) }, data: { data: data as unknown as Prisma.InputJsonValue } }) : row;
  const cv = cvView(saved);
  res.json({ cv, filled, completeness: cvCompleteness(cv.data, profile) });
});

const pdfQuery = z.object({
  template: z.enum(CV_TEMPLATES).optional(),
  lang: z.enum(CV_LANGS).default('de'),
  photo: z.enum(['0', '1']).default('1'),
  inline: z.enum(['0', '1']).optional(),
});

cvRouter.get('/pdf', async (req, res) => {
  const q = parse(pdfQuery, req.query);
  await ensureCv(uid(req));
  const out = await buildCvPdf(uid(req), { template: q.template, lang: q.lang, photo: q.photo === '1' });
  if (!out) throw notFound();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, q.inline === '1'));
  res.send(out.pdf);
});

// ─── Motivation letters ────────────────────────────────────────────────

const letterView = (l: { id: string; kind: LetterKind; caseId: string | null; vacancyId: string | null; title: string; language: string; answers: unknown; body: string; createdAt: Date; updatedAt: Date }) => ({
  id: l.id,
  kind: l.kind,
  caseId: l.caseId,
  vacancyId: l.vacancyId,
  title: l.title,
  language: l.language === 'en' ? 'en' : 'de',
  answers: readAnswers(l.answers),
  body: l.body,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

const readAnswers = (v: unknown): LetterAnswers => {
  const r = letterAnswersSchema.safeParse(v ?? {});
  return r.success ? r.data : {};
};

/** Cases and vacancies the client may link a letter to. */
cvRouter.get('/letters/options', async (req, res) => {
  const lang = (req.query.lang === 'en' ? 'en' : 'de') as LetterLang;
  const [cases, apps] = await Promise.all([
    prisma.case.findMany({
      where: { clientId: uid(req) },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, number: true, profession: true, status: true, vacancyId: true, visaCategory: { select: { title: true, visaLabel: true } } },
    }),
    prisma.vacancyApplication.findMany({
      where: { userId: uid(req) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, status: true, vacancy: { select: { id: true, title: true, city: true, showCompany: true, company: { select: { name: true } } } } },
    }),
  ]);
  res.json({
    cases: cases.map((c) => ({ id: c.id, number: c.number, profession: c.profession, status: c.status, vacancyId: c.vacancyId, visa: c.visaCategory ? pickL10n(c.visaCategory.title, lang) : null })),
    applications: apps.map((a) => ({
      id: a.id,
      status: a.status,
      vacancyId: a.vacancy.id,
      title: pickL10n(a.vacancy.title, lang),
      city: a.vacancy.city,
      company: a.vacancy.showCompany ? (a.vacancy.company?.name ?? null) : null,
    })),
  });
});

cvRouter.get('/letters', async (req, res) => {
  const items = await prisma.motivationLetter.findMany({ where: { userId: uid(req) }, orderBy: { updatedAt: 'desc' }, take: 100 });
  res.json({ items: items.map(letterView) });
});

/** Everything the template needs; checks that the case / vacancy belong to (or are visible to) the client. */
const letterContext = async (userId: string, input: { kind: LetterKind; language: LetterLang; caseId?: string | null; vacancyId?: string | null; answers: LetterAnswers }) => {
  const [user, row] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { ...cvProfileSelect } }),
    prisma.candidateCv.findUnique({ where: { userId } }),
  ]);
  let caseInfo: LetterContext['caseInfo'] = null;
  let vacancyId = input.vacancyId ?? null;
  if (input.caseId) {
    const c = await prisma.case.findFirst({ where: { id: input.caseId, clientId: userId }, select: { profession: true, vacancyId: true, visaCategory: { select: { title: true } } } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    caseInfo = { profession: c.profession, visaTitle: c.visaCategory ? pickL10n(c.visaCategory.title, input.language) : null };
    vacancyId ??= c.vacancyId;
  }
  let vacancy: LetterContext['vacancy'] = null;
  if (vacancyId) {
    const v = await prisma.vacancy.findFirst({
      where: { id: vacancyId, OR: [{ applications: { some: { userId } } }, { cases: { some: { clientId: userId } } }, openVacancyWhere()] },
      select: { title: true, city: true, showCompany: true, company: { select: { name: true } } },
    });
    if (!v) throw notFound('VACANCY_NOT_FOUND');
    vacancy = { title: pickL10n(v.title, input.language), city: v.city, company: v.showCompany ? (v.company?.name ?? null) : null };
  }
  const ctx: LetterContext = {
    kind: input.kind,
    language: input.language,
    person: user,
    cv: readCv(row?.data),
    caseInfo,
    vacancy,
    answers: input.answers,
  };
  return { ctx, user, vacancyId };
};

const createSchema = z
  .object({
    kind: z.enum(LETTER_KINDS),
    caseId: z.string().max(40).nullable().optional(),
    vacancyId: z.string().max(40).nullable().optional(),
    language: z.enum(LETTER_LANGS).default('de'),
    answers: letterAnswersSchema.default({}),
  })
  .strict();

cvRouter.post('/letters', async (req, res) => {
  const body = parse(createSchema, req.body);
  if ((await prisma.motivationLetter.count({ where: { userId: uid(req) } })) >= 50) throw conflict('TOO_MANY_LETTERS');
  const { ctx, vacancyId } = await letterContext(uid(req), body);
  const { title, body: text } = buildLetter(ctx);
  const letter = await prisma.motivationLetter.create({
    data: {
      userId: uid(req),
      kind: body.kind,
      caseId: body.caseId ?? null,
      vacancyId: body.vacancyId ?? vacancyId ?? null,
      language: body.language,
      answers: body.answers as Prisma.InputJsonValue,
      title,
      body: text,
    },
  });
  res.status(201).json({ letter: letterView(letter) });
});

const ownLetter = async (userId: string, id: string) => {
  const l = await prisma.motivationLetter.findFirst({ where: { id, userId } });
  if (!l) throw notFound('LETTER_NOT_FOUND');
  return l;
};

cvRouter.get('/letters/:id', async (req, res) => {
  res.json({ letter: letterView(await ownLetter(uid(req), String(req.params.id))) });
});

cvRouter.patch('/letters/:id', async (req, res) => {
  const body = parse(
    z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        body: z.string().max(20_000).optional(),
        answers: letterAnswersSchema.optional(),
      })
      .strict(),
    req.body,
  );
  const l = await ownLetter(uid(req), String(req.params.id));
  const updated = await prisma.motivationLetter.update({
    where: { id: l.id },
    data: { ...(body.title ? { title: body.title } : {}), ...(body.body !== undefined ? { body: body.body } : {}), ...(body.answers ? { answers: body.answers as Prisma.InputJsonValue } : {}) },
  });
  res.json({ letter: letterView(updated) });
});

/** Rebuilds title and body from the template (with new answers / language when given). */
cvRouter.post('/letters/:id/regenerate', async (req, res) => {
  const body = parse(z.object({ answers: letterAnswersSchema.optional(), language: z.enum(LETTER_LANGS).optional() }).strict(), req.body ?? {});
  const l = await ownLetter(uid(req), String(req.params.id));
  const answers = body.answers ?? readAnswers(l.answers);
  const language = body.language ?? (l.language === 'en' ? 'en' : 'de');
  const { ctx } = await letterContext(uid(req), { kind: l.kind, language, caseId: l.caseId, vacancyId: l.vacancyId, answers }).catch(async (err) => {
    // A case or vacancy that is gone (or no longer visible) must not block regenerating.
    if ((err as { status?: number }).status === 404) return letterContext(uid(req), { kind: l.kind, language, answers });
    throw err;
  });
  const built = buildLetter(ctx);
  const updated = await prisma.motivationLetter.update({ where: { id: l.id }, data: { title: built.title, body: built.body, language, answers: answers as Prisma.InputJsonValue } });
  res.json({ letter: letterView(updated) });
});

cvRouter.delete('/letters/:id', async (req, res) => {
  const l = await ownLetter(uid(req), String(req.params.id));
  await prisma.motivationLetter.delete({ where: { id: l.id } });
  res.json({ ok: true });
});

cvRouter.get('/letters/:id/pdf', async (req, res) => {
  const l = await ownLetter(uid(req), String(req.params.id));
  const language: LetterLang = l.language === 'en' ? 'en' : 'de';
  const answers = readAnswers(l.answers);
  const { ctx, user } = await letterContext(uid(req), { kind: l.kind, language, caseId: l.caseId, vacancyId: l.vacancyId, answers }).catch(() =>
    letterContext(uid(req), { kind: l.kind, language, answers }),
  );
  const pdf = await renderLetterPdf({
    language,
    sender: { name: `${user.firstName} ${user.lastName}`.trim(), address: user.address, city: user.city, phone: user.phone, email: user.email },
    recipient: letterRecipient(l.kind, language, ctx.vacancy, answers),
    title: l.title,
    body: l.body,
  });
  const prefix = { VISA: language === 'de' ? 'Motivationsschreiben' : 'Motivation_letter', JOB: language === 'de' ? 'Anschreiben' : 'Cover_letter', ANERKENNUNG: language === 'de' ? 'Antrag_Anerkennung' : 'Recognition_letter' }[l.kind];
  const name = `${prefix}_${asciiName(user.lastName).replace(/[^A-Za-z0-9-]+/g, '-') || 'Brief'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(name, req.query.inline === '1'));
  res.send(pdf);
});
