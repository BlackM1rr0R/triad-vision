import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import { pdfUpload, sendPdf } from '../../lib/esign/http.js';
import {
  activateTemplate,
  caseFormsOverview,
  catalogue,
  createTemplate,
  dataSheetForCase,
  deleteTemplate,
  fieldMapSchema,
  fillForCase,
  fillOr404,
  fillValuesOf,
  fillView,
  installDefaultTemplates,
  KEY_RE,
  latestFillOfKey,
  listTemplates,
  markSubmitted,
  previewTemplate,
  resolveForCase,
  activeTemplate,
  templateDetail,
  updateTemplate,
  withdrawFill,
} from '../../lib/officialForms/service.js';
import { sendToEmployer } from '../../lib/officialForms/employer.js';
import type { FieldMap } from '../../lib/officialForms/catalog.js';

/**
 * Official forms (mounted on /api/admin, STAFF+; template changes ADMIN+).
 *
 *   GET    /official-forms/catalog                         data keys, groups, formats, built-in templates
 *   GET    /official-forms/templates                       all versions
 *   POST   /official-forms/templates                       (ADMIN) multipart file + key, title, version, notes
 *   POST   /official-forms/templates/install-defaults      (ADMIN) download the official PDFs, apply the shipped mapping
 *   GET    /official-forms/templates/:id                   fields, mapping, suggestions
 *   PUT    /official-forms/templates/:id                   (ADMIN) { title?, notes?, fieldMap? }
 *   POST   /official-forms/templates/:id/activate          (ADMIN)
 *   DELETE /official-forms/templates/:id                   (ADMIN) delete (no fills) or deactivate
 *   GET    /official-forms/templates/:id/file              the blank PDF
 *   POST   /official-forms/templates/:id/preview           { caseId, fieldMap? } → rows + missing
 *   POST   /official-forms/templates/:id/preview.pdf       { caseId, fieldMap?, flatten? } → filled PDF (not stored)
 *   GET    /official-forms/sample-cases?q=                 case picker for the preview
 *   GET    /cases/:id/official-forms                       case panel
 *   GET    /cases/:id/official-forms/:key                  resolution (rows, missing with fix links, latest fill)
 *   POST   /cases/:id/official-forms/:key/fill             { fieldOverrides?, flatten? } → generate + store + drive
 *   GET    /cases/:id/official-forms/:key/datasheet        data sheet PDF (fallback)
 *   POST   /cases/:id/official-forms/:key/send-to-employer Erklärung zum Beschäftigungsverhältnis → company portal
 *   GET    /official-forms/fills/:fillId/file              generated PDF (?download=1)
 *   POST   /official-forms/fills/:fillId/withdraw          take it back from the employer
 *   POST   /official-forms/fills/:fillId/submitted         mark as handed in
 */
export const adminOfficialFormsRouter = Router();

const admin = requireMinRole('ADMIN');
const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName });
const keyParam = (req: Request) => {
  const key = String(req.params.key).toUpperCase();
  if (!KEY_RE.test(key)) throw badRequest('INVALID_KEY');
  return key;
};
const flagFalse = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');

// ─── Catalogue / templates ─────────────────────────────────────────────

adminOfficialFormsRouter.get('/official-forms/catalog', (_req, res) => {
  res.json(catalogue());
});

adminOfficialFormsRouter.get('/official-forms/templates', async (_req, res) => {
  res.json({ items: await listTemplates() });
});

adminOfficialFormsRouter.post('/official-forms/templates/install-defaults', admin, async (req, res) => {
  const results = await installDefaultTemplates(req.user!.id);
  await audit(req, 'OFFICIAL_FORM_DEFAULTS_INSTALLED', 'officialForms', { results: results.map((r) => ({ key: r.key, version: r.version, status: r.status, reason: r.reason ?? null })) });
  res.json({ results, items: await listTemplates() });
});

adminOfficialFormsRouter.post('/official-forms/templates', admin, pdfUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const body = parse(
    z.object({
      key: z.string().trim().toUpperCase().regex(KEY_RE),
      title: z.string().trim().min(2).max(200),
      version: z.string().trim().min(1).max(40),
      notes: z.string().trim().max(4000).optional(),
    }),
    req.body ?? {},
  );
  const { template, fields } = await createTemplate({ ...body, pdf: req.file.buffer, userId: req.user!.id });
  await audit(req, 'OFFICIAL_FORM_TEMPLATE_CREATED', `officialForm:${template.id}`, { key: template.key, version: template.version, fields: fields.length });
  res.status(201).json(await templateDetail(template.id));
});

adminOfficialFormsRouter.get('/official-forms/templates/:id', async (req, res) => {
  res.json(await templateDetail(String(req.params.id)));
});

adminOfficialFormsRouter.put('/official-forms/templates/:id', admin, async (req, res) => {
  const body = parse(z.object({ title: z.string().trim().min(2).max(200).optional(), notes: z.string().trim().max(4000).nullable().optional(), fieldMap: fieldMapSchema.optional() }), req.body ?? {});
  const out = await updateTemplate(String(req.params.id), { ...body, fieldMap: body.fieldMap as FieldMap | undefined });
  await audit(req, 'OFFICIAL_FORM_TEMPLATE_UPDATED', `officialForm:${out.template.id}`, { fields: Object.keys(body), mapped: out.template.mapped, dropped: out.dropped });
  res.json(out);
});

adminOfficialFormsRouter.post('/official-forms/templates/:id/activate', admin, async (req, res) => {
  const t = await activateTemplate(String(req.params.id));
  await audit(req, 'OFFICIAL_FORM_TEMPLATE_ACTIVATED', `officialForm:${t.id}`, { key: t.key, version: t.version });
  res.json({ template: t, items: await listTemplates() });
});

adminOfficialFormsRouter.delete('/official-forms/templates/:id', admin, async (req, res) => {
  const out = await deleteTemplate(String(req.params.id));
  await audit(req, out.deleted ? 'OFFICIAL_FORM_TEMPLATE_DELETED' : 'OFFICIAL_FORM_TEMPLATE_DEACTIVATED', `officialForm:${req.params.id}`, {});
  res.json(out);
});

adminOfficialFormsRouter.get('/official-forms/templates/:id/file', async (req, res) => {
  const t = await prisma.officialFormTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  sendPdf(res, t.fileKey, `${t.key.toLowerCase()}-${t.version}.pdf`, req.query.download === '1');
});

const previewBody = z.object({ caseId: z.string().trim().min(1).max(40), fieldMap: fieldMapSchema.optional(), flatten: flagFalse.optional() });

adminOfficialFormsRouter.post('/official-forms/templates/:id/preview', async (req, res) => {
  const body = parse(previewBody, req.body ?? {});
  const out = await previewTemplate(String(req.params.id), body.caseId, { fieldMap: body.fieldMap as FieldMap | undefined });
  res.json({ rows: out.rows, missing: out.missing, errors: out.errors, caseNumber: out.caseNumber });
});

adminOfficialFormsRouter.post('/official-forms/templates/:id/preview.pdf', async (req, res) => {
  const body = parse(previewBody, req.body ?? {});
  const out = await previewTemplate(String(req.params.id), body.caseId, { fieldMap: body.fieldMap as FieldMap | undefined, flatten: body.flatten });
  await audit(req, 'OFFICIAL_FORM_PREVIEW', `case:${body.caseId}`, { templateId: out.template.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="preview-${out.template.key.toLowerCase()}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});

adminOfficialFormsRouter.get('/official-forms/sample-cases', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(80).optional() }), req.query).q ?? '';
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const items = await prisma.case.findMany({
    where: words.length
      ? { AND: words.map((w) => ({ OR: [{ number: { contains: w } }, { client: { firstName: { contains: w } } }, { client: { lastName: { contains: w } } }] })) }
      : {},
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: { id: true, number: true, visaType: true, client: { select: { firstName: true, lastName: true } }, company: { select: { name: true } } },
  });
  res.json({ items: items.map((c) => ({ id: c.id, number: c.number, visaType: c.visaType, clientName: `${c.client.firstName} ${c.client.lastName}`.trim(), companyName: c.company?.name ?? null })) });
});

// ─── Case ───────────────────────────────────────────────────────────────

adminOfficialFormsRouter.get('/cases/:id/official-forms', async (req, res) => {
  res.json(await caseFormsOverview(String(req.params.id)));
});

adminOfficialFormsRouter.get('/cases/:id/official-forms/:key', async (req, res) => {
  const key = keyParam(req);
  const caseId = String(req.params.id);
  const t = await activeTemplate(key);
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const latest = await latestFillOfKey(caseId, key);
  const values = latest && (latest.status === 'DRAFT' || latest.status === 'GENERATED' || latest.status === 'SENT_TO_EMPLOYER') ? fillValuesOf(latest) : {};
  const r = await resolveForCase(t, caseId, values);
  res.json({
    template: { id: t.id, key: t.key, title: t.title, version: t.version },
    fields: r.fields.map((f) => ({ name: f.name, type: f.type, options: f.options, page: f.page })),
    rows: r.rows,
    missing: r.missing,
    fieldOverrides: values.fieldOverrides ?? {},
    flatten: values.flatten ?? false,
    latest: latest ? fillView({ ...latest, template: t }) : null,
  });
});

adminOfficialFormsRouter.post('/cases/:id/official-forms/:key/fill', async (req, res) => {
  const key = keyParam(req);
  const body = parse(z.object({ fieldOverrides: z.record(z.string().max(300), z.string().max(500)).optional(), flatten: z.boolean().optional() }), req.body ?? {});
  const out = await fillForCase(String(req.params.id), key, { ...body, userId: req.user!.id });
  await audit(req, 'OFFICIAL_FORM_FILLED', `case:${req.params.id}`, { key, fillId: out.fill.id, missing: out.missing.map((m) => m.source), overrides: Object.keys(body.fieldOverrides ?? {}).length });
  res.status(201).json(out);
});

adminOfficialFormsRouter.get('/cases/:id/official-forms/:key/datasheet', async (req, res) => {
  const key = keyParam(req);
  const out = await dataSheetForCase(String(req.params.id), key);
  await audit(req, 'OFFICIAL_FORM_DATASHEET', `case:${req.params.id}`, { key });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});

adminOfficialFormsRouter.post('/cases/:id/official-forms/:key/send-to-employer', async (req, res) => {
  const key = keyParam(req);
  if (key !== 'EMPLOYMENT_DECLARATION') throw badRequest('NOT_AN_EMPLOYER_FORM');
  const fill = await sendToEmployer(String(req.params.id), req.user!.id);
  await audit(req, 'OFFICIAL_FORM_SENT_TO_EMPLOYER', `case:${req.params.id}`, { fillId: fill.id, companyId: fill.companyId });
  res.status(201).json({ fill });
});

// ─── Fills ──────────────────────────────────────────────────────────────

adminOfficialFormsRouter.get('/official-forms/fills/:fillId/file', async (req, res) => {
  const f = await fillOr404(String(req.params.fillId));
  if (!f.fileKey) throw notFound('FILE_NOT_GENERATED');
  const [t, c] = await Promise.all([
    prisma.officialFormTemplate.findUnique({ where: { id: f.templateId }, select: { key: true } }),
    prisma.case.findUnique({ where: { id: f.caseId }, select: { number: true } }),
  ]);
  await audit(req, 'OFFICIAL_FORM_DOWNLOADED', `case:${f.caseId}`, { fillId: f.id });
  sendPdf(res, f.fileKey, `${c?.number ?? 'case'}-${(t?.key ?? 'form').toLowerCase()}.pdf`, req.query.download === '1');
});

adminOfficialFormsRouter.post('/official-forms/fills/:fillId/withdraw', async (req, res) => {
  const fill = await withdrawFill(String(req.params.fillId), actorOf(req));
  await audit(req, 'OFFICIAL_FORM_WITHDRAWN', `case:${fill.caseId}`, { fillId: fill.id });
  res.json({ fill });
});

adminOfficialFormsRouter.post('/official-forms/fills/:fillId/submitted', async (req, res) => {
  const fill = await markSubmitted(String(req.params.fillId), req.user!.id);
  await audit(req, 'OFFICIAL_FORM_SUBMITTED', `case:${fill.caseId}`, { fillId: fill.id });
  res.json({ fill });
});
