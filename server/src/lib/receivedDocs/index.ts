import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { isAppointmentDocName } from '../caseAppointment/files.js';
import { parseSentFiles } from '../clientFolders/logic.js';
import { CLIENT_STAGES, groupReceived, newCountOf, type RawDoc } from './logic.js';

/**
 * Everything staff / Triad Vision sent to the client of a case, for the cabinet's Sənədlər > "Bizdən gələn sənədlər":
 *  - the German documents of each "Müştəriyə göndər" send (CaseReadyDocsSend, one group per send),
 *  - the Əmək müqaviləsi to sign and its signed copies (stage CONTRACT / CONTRACT_SIGNED),
 *  - the embassy appointment confirmation files (documents named "Səfirlik görüşü — təsdiq …"),
 *  - other files the team stored for the client (stage OTHER / VISA / EMBASSY, stored by staff).
 * Internal material never appears: only case documents without a requirement, stored by the team, in those stages
 * (rules in ./logic.ts isReceivedDoc); the client's own uploads and the team's embassy package are excluded.
 */
export const receivedDocumentsFor = async (caseId: string, userId: string) => {
  const [docs, sends, seenRows] = await Promise.all([
    prisma.document.findMany({
      where: { caseId, requirementId: null, stage: { in: [...CLIENT_STAGES] } },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true, stage: true, requirementId: true, uploadedBy: { select: { role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.caseReadyDocsSend.findMany({ where: { caseId }, select: { id: true, createdAt: true, files: true } }),
    prisma.caseReceivedDocSeen.findMany({ where: { caseId, userId }, select: { documentId: true } }),
  ]);
  const raw: RawDoc[] = docs.map(({ uploadedBy, ...d }) => ({ ...d, uploaderRole: uploadedBy?.role ?? null }));
  const groups = groupReceived({
    docs: raw,
    sends: sends.map((s) => ({ id: s.id, createdAt: s.createdAt, documentIds: parseSentFiles(s.files).map((f) => f.documentId) })),
    seen: new Set(seenRows.map((r) => r.documentId)),
    isAppointment: isAppointmentDocName,
  });
  return { groups, newCount: newCountOf(groups), total: groups.reduce((n, g) => n + g.files.length, 0) };
};

/** Marks documents (all of the list when `ids` is empty) as seen. POST only; skipped while an admin views as the client. */
export const markReceivedSeen = async (caseId: string, userId: string, ids?: string[]) => {
  const view = await receivedDocumentsFor(caseId, userId);
  if (isImpersonating()) return view; // "view as client" is read-only
  const unseen = new Set(view.groups.flatMap((g) => g.files.filter((f) => f.isNew).map((f) => f.id)));
  const todo = ids?.length ? ids.filter((id) => unseen.has(id)) : [...unseen];
  if (!todo.length) return view;
  await prisma.caseReceivedDocSeen.createMany({ data: todo.map((documentId) => ({ userId, documentId, caseId })), skipDuplicates: true });
  return receivedDocumentsFor(caseId, userId);
};

export const assertClientOwnsCase = async (caseId: string, userId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
  if (!c || c.clientId !== userId) throw notFound('CASE_NOT_FOUND');
};
