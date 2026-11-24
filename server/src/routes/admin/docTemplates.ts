import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { attachmentHeader } from '../../lib/cv/pdf.js';
import { requestMaskGroups } from '../../lib/privacy/mask.js';
import { DOC_TEMPLATE_KINDS, attachTemplate, buildTemplatePdf, loadTemplateCase, templateStatus } from '../../lib/docTemplates/index.js';
import { SHEET_LANGS } from '../../lib/docTemplates/texts.js';

/**
 * Prefilled document templates of a case, staff side (lib/docTemplates) — mounted on /api/admin (STAFF+, area
 * "documents" via the route map; case scope enforced by the access guard from the path):
 *   GET  /cases/:id/doc-templates                    per template: available, missing answers, Lebenslauf source
 *   GET  /cases/:id/doc-templates/:kind.pdf?lang=    generated PDF (not stored; audited)
 *   POST /cases/:id/doc-templates/:kind/attach       { lang? } → copy into "<client folder>/Sənəd şablonları" (audited)
 * Staff see the employer even before the client does; masked fields follow the viewer's masking settings.
 */
export const adminDocTemplatesRouter = Router();

const kindOf = (v: unknown) => parse(z.enum(DOC_TEMPLATE_KINDS), v);
const langSchema = z.enum(SHEET_LANGS).default('az');

adminDocTemplatesRouter.get('/cases/:id/doc-templates', async (req, res) => {
  const c = await loadTemplateCase(String(req.params.id));
  res.json({ caseId: c.id, items: await templateStatus(c, 'staff') });
});

adminDocTemplatesRouter.get('/cases/:id/doc-templates/:kind.pdf', async (req, res) => {
  const kind = kindOf(req.params.kind);
  const { lang } = parse(z.object({ lang: langSchema }), req.query);
  const c = await loadTemplateCase(String(req.params.id));
  const out = await buildTemplatePdf(c, kind, { audience: 'staff', lang, maskGroups: requestMaskGroups(res) });
  await audit(req, 'DOC_TEMPLATE_GENERATED', `case:${c.id}`, { kind, lang });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});

adminDocTemplatesRouter.post('/cases/:id/doc-templates/:kind/attach', async (req, res) => {
  const kind = kindOf(req.params.kind);
  const { lang } = parse(z.object({ lang: langSchema }), req.body ?? {});
  const c = await loadTemplateCase(String(req.params.id));
  const out = await attachTemplate(c, kind, req.user!.id, { audience: 'staff', lang, maskGroups: requestMaskGroups(res) });
  await audit(req, 'DOC_TEMPLATE_ATTACHED', `case:${c.id}`, { kind, lang, nodeId: out.nodeId });
  res.status(201).json(out);
});
