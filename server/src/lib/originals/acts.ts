import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { nodeLiteSelect } from '../drive/access.js';
import { ensureCaseFolder } from '../drive/caseFolders.js';
import { createFileIn, readNodeBuffer, saveFileVersion } from '../drive/files.js';
import { renderEmail, sendMail } from '../mailer.js';
import { ACTS_FOLDER_NAME, ACTION_LABEL, type OriginalAction } from './constants.js';
import { buildActPdf, type ActItem } from './actPdf.js';
import { initialsOf, randomReceiptCode, receiptCodeFor, receiptVerifyUrl, saveReceipt, staffFirstNameOf } from './receipts.js';

/**
 * Hand-over acts in the drive: the PDF goes into "<client folder>/Übergabeprotokolle" (created on first
 * use), every event of the hand-over links to it (OriginalEvent.actNodeId). Signing on screen later saves
 * the re-rendered PDF as a new version of the same file.
 */

export interface Signatures {
  client?: Buffer | null;
  staff?: Buffer | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Baku wall-clock parts (the office works in Asia/Baku). */
const bakuParts = (d: Date) => {
  const b = new Date(d.getTime() + 4 * 60 * 60 * 1000);
  return { y: b.getUTCFullYear(), m: pad(b.getUTCMonth() + 1), d: pad(b.getUTCDate()), h: pad(b.getUTCHours()), min: pad(b.getUTCMinutes()) };
};

export const actNumber = (caseNumber: string, at: Date) => {
  const p = bakuParts(at);
  return `ÜP-${caseNumber}-${p.y}${p.m}${p.d}-${p.h}${p.min}`;
};

const actFileName = (action: OriginalAction, at: Date) => {
  const p = bakuParts(at);
  return `Übergabeprotokoll ${ACTION_LABEL[action].de.replace(/[/\\:*?"<>|]/g, '-')} ${p.y}-${p.m}-${p.d} ${p.h}.${p.min}.pdf`;
};

/** "<client folder>/Übergabeprotokolle", created when missing. */
const actsFolder = async (caseId: string) => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) throw new Error('CASE_FOLDER_MISSING');
  const rows = await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FOLDER', deletedAt: null, name: ACTS_FOLDER_NAME }, select: nodeLiteSelect, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((r) => r.name.toLowerCase() === ACTS_FOLDER_NAME.toLowerCase());
  if (hit) return hit;
  return prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: ACTS_FOLDER_NAME, parentId: folderId }, select: nodeLiteSelect });
};

const caseForAct = (caseId: string) =>
  prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { id: true, number: true, client: { select: { id: true, firstName: true, lastName: true, passportNumber: true, phone: true, email: true, locale: true } } },
  });

export interface ActRequest {
  caseId: string;
  action: OriginalAction;
  at: Date;
  items: ActItem[];
  holder?: string | null;
  condition?: string | null;
  signatures?: Signatures;
  actorId: string;
}

const renderAct = async (req: ActRequest, receiptCode: string) => {
  const [c, actor] = await Promise.all([
    caseForAct(req.caseId),
    prisma.user.findUnique({ where: { id: req.actorId }, select: { firstName: true, lastName: true } }),
  ]);
  const number = actNumber(c.number, req.at);
  const pdf = await buildActPdf({
    number,
    verifyUrl: receiptVerifyUrl(receiptCode), // QR → public receipt check (lib/originals/receipts.ts)
    action: req.action,
    at: req.at,
    caseNumber: c.number,
    client: { name: `${c.client.firstName} ${c.client.lastName}`.trim(), passportNumber: c.client.passportNumber, phone: c.client.phone, email: c.client.email },
    holder: req.holder,
    staffName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Triad Vision',
    items: req.items,
    condition: req.condition,
    signatures: req.signatures,
  });
  // Non-sensitive snapshot for the public check (initials + staff first name only).
  const snapshot = (actNodeId: string) => ({
    code: receiptCode,
    actNodeId,
    number,
    caseId: c.id,
    action: req.action,
    at: req.at,
    itemCount: req.items.length,
    staffFirstName: staffFirstNameOf(actor?.firstName),
    clientInitials: initialsOf(c.client.firstName, c.client.lastName),
  });
  return { c, pdf, snapshot };
};

/** Renders the act and stores it in the client folder. Returns the drive node id and the PDF. */
export const createAct = async (req: ActRequest) => {
  const { c, pdf, snapshot } = await renderAct(req, randomReceiptCode());
  const parent = await actsFolder(c.id);
  const file = await createFileIn(parent, actFileName(req.action, req.at), pdf, 'application/pdf', req.actorId);
  await saveReceipt(snapshot(file.id));
  return { nodeId: file.id, name: file.name, pdf };
};

/** Re-renders an existing act (e.g. after signing on screen) and saves it as the next version of its file (same QR code). */
export const rerenderAct = async (nodeId: string, req: ActRequest) => {
  const { pdf, snapshot } = await renderAct(req, (await receiptCodeFor(nodeId)) ?? randomReceiptCode());
  const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: nodeId }, select: { version: true } });
  await saveFileVersion(nodeId, pdf, 'application/pdf', node.version);
  await saveReceipt(snapshot(nodeId));
  return pdf;
};

export const readAct = (nodeId: string) => readNodeBuffer(nodeId);

const MAIL_TEXT: Record<string, { title: string; body: string; cta: string }> = {
  az: { title: 'Qəbul-təhvil aktı', body: 'Orijinal sənədlərinizlə bağlı qəbul-təhvil aktı əlavə olunub. Aktı kabinetinizdə də yükləyə bilərsiniz.', cta: 'Kabinetə keçin' },
  de: { title: 'Übergabeprotokoll', body: 'Anbei das Übergabeprotokoll zu Ihren Originaldokumenten. Sie finden es auch in Ihrem Kundenbereich.', cta: 'Zum Kundenbereich' },
  en: { title: 'Hand-over record', body: 'Attached is the hand-over record for your original documents. You can also download it in your account.', cta: 'Open your account' },
  ru: { title: 'Акт приёма-передачи', body: 'Во вложении акт приёма-передачи ваших оригиналов документов. Его также можно скачать в личном кабинете.', cta: 'Открыть кабинет' },
};

/** E-mails the act PDF to the client (attachment) with a link to the portal. Never throws. */
export const emailAct = async (caseId: string, pdf: Buffer, filename: string) => {
  const c = await caseForAct(caseId).catch(() => null);
  if (!c?.client.email) return false;
  const text = MAIL_TEXT[c.client.locale] ?? MAIL_TEXT.az;
  const html = renderEmail(text.title, `${text.body}\n\n${c.number}`, { label: text.cta, url: `${config.clientUrl}/account/cases/${c.id}` });
  await sendMail(c.client.email, `Triad Vision · ${text.title} (${c.number})`, html, [{ filename, content: pdf, contentType: 'application/pdf' }]);
  return true;
};
