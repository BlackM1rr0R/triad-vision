import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { COVER_JOB_TYPES, COVER_PLACEHOLDERS, PLACEHOLDER_HELP, fillTemplate, type CoverValues } from '../../lib/coverLetters/fill.js';
import { DEFAULT_COVER_TEMPLATES } from '../../lib/coverLetters/defaults.js';
import { coverTemplateInput, listCoverTemplates } from '../../lib/coverLetters/index.js';

/**
 * Anschreiben templates — mounted at /api/admin/cover-letter-templates (ADMIN+):
 *   GET    /             one template per job type (custom or built-in) + the placeholder list
 *   PUT    /:jobType     { name, subject, body } → saves the custom template
 *   DELETE /:jobType     back to the built-in default
 *   POST   /preview      { subject, body } → filled with sample data (missing / unknown placeholders listed)
 */
export const adminCoverLetterTemplatesRouter = Router();

const placeholders = () => COVER_PLACEHOLDERS.map((key) => ({ key, ...PLACEHOLDER_HELP[key] }));

adminCoverLetterTemplatesRouter.get('/', async (_req, res) => {
  res.json({ items: await listCoverTemplates(), placeholders: placeholders(), defaults: DEFAULT_COVER_TEMPLATES });
});

const jobTypeParam = z.enum(COVER_JOB_TYPES);

adminCoverLetterTemplatesRouter.put('/:jobType', async (req, res) => {
  const jobType = parse(jobTypeParam, req.params.jobType);
  const body = parse(coverTemplateInput, req.body);
  await prisma.coverLetterTemplate.upsert({
    where: { jobType },
    update: { ...body, updatedById: req.user!.id },
    create: { jobType, ...body, updatedById: req.user!.id },
  });
  await audit(req, 'COVER_LETTER_TEMPLATE_SAVED', `cover-template:${jobType}`, {});
  res.json({ items: await listCoverTemplates() });
});

adminCoverLetterTemplatesRouter.delete('/:jobType', async (req, res) => {
  const jobType = parse(jobTypeParam, req.params.jobType);
  await prisma.coverLetterTemplate.deleteMany({ where: { jobType } });
  await audit(req, 'COVER_LETTER_TEMPLATE_RESET', `cover-template:${jobType}`, {});
  res.json({ items: await listCoverTemplates() });
});

adminCoverLetterTemplatesRouter.post('/preview', (req, res) => {
  const body = parse(z.object({ subject: z.string().max(300).default(''), body: z.string().max(12_000) }).strict(), req.body);
  const sample = Object.fromEntries(COVER_PLACEHOLDERS.map((k) => [k, PLACEHOLDER_HELP[k].example])) as CoverValues;
  const subject = fillTemplate(body.subject, sample);
  const text = fillTemplate(body.body, sample);
  res.json({ subject: subject.text, body: text.text, unknown: Array.from(new Set([...subject.unknown, ...text.unknown])) });
});
