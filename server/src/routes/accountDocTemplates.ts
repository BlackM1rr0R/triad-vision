import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, parse } from '../lib/http.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { DOC_TEMPLATE_KINDS, buildTemplatePdf, loadTemplateCase, templateStatus } from '../lib/docTemplates/index.js';
import { SHEET_LANGS, asSheetLang } from '../lib/docTemplates/texts.js';

/**
 * Client cabinet: prefilled document templates of the OWN case ("Hazır sənəd şablonları", lib/docTemplates) —
 * mounted at /api/account/doc-templates (before the account router). Read-only: generated on demand, nothing
 * is stored (so "view as client" works without writes).
 *   GET /cases/:caseId                    per template: available, missing answers, Lebenslauf source
 *   GET /cases/:caseId/:kind.pdf?lang=    videx (sheet in the client's language) | lebenslauf | anschreiben
 * Another client's case answers 404 (CASE_NOT_FOUND).
 */
export const accountDocTemplatesRouter = Router();
accountDocTemplatesRouter.use(requireAuth);
accountDocTemplatesRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

accountDocTemplatesRouter.get('/cases/:caseId', async (req, res) => {
  const c = await loadTemplateCase(String(req.params.caseId), req.user!.id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ caseId: c.id, items: await templateStatus(c, 'client') });
});

const pdfQuery = z.object({ lang: z.enum(SHEET_LANGS).optional(), inline: z.enum(['0', '1']).optional() });

accountDocTemplatesRouter.get('/cases/:caseId/:kind.pdf', async (req, res) => {
  const kind = parse(z.enum(DOC_TEMPLATE_KINDS), req.params.kind);
  const q = parse(pdfQuery, req.query);
  const c = await loadTemplateCase(String(req.params.caseId), req.user!.id);
  const out = await buildTemplatePdf(c, kind, { audience: 'client', lang: q.lang ?? asSheetLang(req.user!.locale) });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, q.inline === '1'));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(out.pdf);
});
