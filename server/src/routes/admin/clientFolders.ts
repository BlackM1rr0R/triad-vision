import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { bulkMoveStage, bulkStageSchema, caseList, runForCases } from '../../lib/clientFolders/bulk.js';
import { summarize } from '../../lib/clientFolders/logic.js';
import { setCasePartner } from '../../lib/clientFolders/partner.js';
import { readyDocsView, sendReadyDocs } from '../../lib/clientFolders/readyDocs.js';

/**
 * Client folder actions of the documents section ("Sənədlər", drive) without opening the folder — mounted on the
 * admin router at /client-folders (STAFF+). Permissions (lib/access/routeMap): partner = partners:edit, processing =
 * cases:edit, ready docs = documents:view / documents:edit; the staff case scope is checked per case (OUT_OF_SCOPE
 * in the results), or by the guard for the single-case read (/cases/:caseId/…).
 *
 *   POST /client-folders/partner              { cases, partnerId | null, note? }  set / change / remove the partner
 *   POST /client-folders/processing           { cases, stage, assigneeId?, note? } team workflow stage (bulk)
 *   GET  /client-folders/cases/:caseId/ready-docs   the case's Fertig files (sent or not) and the sends so far
 *   POST /client-folders/ready-docs/send      { cases, resend? }  Fertig documents → the client's portal
 *
 * Every bulk answer: { results: [{ caseId, ok, skipped?, error?, number, name }], summary: { total, succeeded, skipped, failed } }.
 */
export const adminClientFoldersRouter = Router();

adminClientFoldersRouter.post('/partner', async (req, res) => {
  const body = parse(z.object({ cases: caseList, partnerId: z.string().trim().min(1).max(40).nullable(), note: z.string().trim().max(500).nullish() }), req.body);
  const me = req.user!;
  const results = await runForCases(me, body.cases, async (caseId) => {
    const r = await setCasePartner(caseId, body.partnerId, me.id, body.note ?? null);
    if (!r.changed) return { skipped: true };
    await audit(req, body.partnerId ? 'CASE_PARTNER_SET' : 'CASE_PARTNER_REMOVED', `case:${caseId}`, {
      from: r.from?.id ?? null,
      to: r.to?.id ?? null,
      ownerChanged: r.ownerChanged,
      origin: 'drive',
      ...(body.note ? { note: body.note } : {}),
    });
    return {};
  });
  res.json({ results, summary: summarize(results) });
});

adminClientFoldersRouter.post('/processing', async (req, res) => {
  const body = parse(bulkStageSchema, req.body);
  const results = await bulkMoveStage(req.user!, body);
  for (const r of results.filter((x) => x.ok && !x.skipped)) {
    await audit(req, 'CASE_PROCESSING_MOVED', `case:${r.caseId}`, { to: body.stage, assigneeId: body.assigneeId ?? null, origin: 'drive', bulk: true });
  }
  res.json({ results, summary: summarize(results) });
});

adminClientFoldersRouter.get('/cases/:caseId/ready-docs', async (req, res) => {
  res.json(await readyDocsView(String(req.params.caseId)));
});

adminClientFoldersRouter.post('/ready-docs/send', async (req, res) => {
  const body = parse(z.object({ cases: caseList, resend: z.boolean().optional() }), req.body);
  const me = req.user!;
  const results = await runForCases(me, body.cases, async (caseId) => {
    const r = await sendReadyDocs(caseId, me, { resend: body.resend });
    await audit(req, 'CASE_READY_DOCS_SENT', `case:${caseId}`, { sendId: r.sendId, total: r.total, sent: r.sent, resend: r.resend, documentIds: r.documents.map((d) => d.id) });
    return {};
  });
  res.json({ results, summary: summarize(results) });
});
