import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { requestDocument } from '../ai/features/caseAi/actions.js';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { REQUEST_BATCH } from './texts.js';

export interface RequestInput {
  requirementId?: string;
  requirementKey?: string;
  title?: L10n;
}

/**
 * Asks the client for several documents at once through the existing request flow (lib/ai/features/caseAi
 * requestDocument: reminder for an existing requirement, else a new one), then sends ONE notification in
 * the client's language listing them all.
 */
export const requestDocuments = async (caseId: string, inputs: RequestInput[], actorId: string) => {
  if (!inputs.length) throw badRequest('NOTHING_TO_REQUEST');
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const out: { requirementId: string; created: boolean; title: string }[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const r = await requestDocument(c.id, input, actorId, { notify: false });
    if (seen.has(r.requirement.id)) continue;
    seen.add(r.requirement.id);
    const t = r.requirement.title as Record<string, string>;
    out.push({ requirementId: r.requirement.id, created: r.created, title: t[c.client.locale] || t.de || t.en || '' });
  }
  const tx = REQUEST_BATCH[c.client.locale] ?? REQUEST_BATCH.de;
  await notifyUser(c.clientId, { type: 'DOCUMENT_REQUESTED', title: tx.title, body: tx.body(out.map((o) => o.title)), link: `/account/cases/${c.id}`, caseId: c.id });
  return out;
};
