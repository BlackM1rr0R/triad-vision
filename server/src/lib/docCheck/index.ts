import path from 'node:path';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { mrzOf, type OcrRecord } from '../docsIntel/ocr.js';
import {
  buildChecks,
  checksOf,
  docCheckDeps,
  expiryIssue,
  runChecks,
  targetForRequirement,
  targetForVaultKind,
  type CheckIssue,
  type DocChecks,
} from './checks.js';

export * from './checks.js';

/** Folder of the client's document vault files (inside the private uploads folder). */
export const vaultDir = () => path.join(config.uploads.privateDir, 'vault');

const json = (checks: DocChecks) => checks as unknown as Prisma.InputJsonValue;

/**
 * Runs the checks for a case document that was just stored and saves them on the row. Never throws:
 * a failing check must not fail the upload. `checkedAt` stays empty while the MRZ OCR is still pending.
 */
export const checkCaseDocument = async (docId: string, now = new Date()): Promise<DocChecks | null> => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: docId }, include: { requirement: { select: { key: true } } } });
    if (!doc) return null;
    const { checks } = await runChecks({
      path: path.join(config.uploads.privateDir, doc.storedName),
      mimeType: doc.mimeType,
      target: targetForRequirement(doc.requirement?.key),
      now,
    });
    await prisma.document.update({ where: { id: doc.id }, data: { checks: json(checks), checkedAt: checks.pending ? null : now } });
    return checks;
  } catch (err) {
    console.error('[docCheck] case document check failed', err);
    return null;
  }
};

// ─── Follow-up of pending OCR checks ─────────────────────────────────────

const TEXT: Record<Locale, { title: string; body: Partial<Record<CheckIssue['code'], string>>; fallback: string }> = {
  az: {
    title: 'Yüklədiyiniz sənəddə problem tapıldı',
    body: {
      WRONG_TYPE_SUSPECTED: 'Pasportun MRZ sətirləri (səhifənin aşağısındakı iki sətir) oxunmadı. Zəhmət olmasa pasportun foto səhifəsinin aydın, tam şəklini yükləyin.',
      PASSPORT_EXPIRED: 'Pasportun etibarlılıq müddəti bitib. Zəhmət olmasa yeni pasport yükləyin.',
      PASSPORT_EXPIRES_SOON: 'Pasportun etibarlılıq müddəti tezliklə bitir. Səfirlik ən azı 12 ay etibarlı pasport tələb edir.',
    },
    fallback: 'Sənədi yoxlayın və lazım olsa yenisini yükləyin.',
  },
  de: {
    title: 'Problem mit Ihrem hochgeladenen Dokument',
    body: {
      WRONG_TYPE_SUSPECTED: 'Die maschinenlesbare Zone (die zwei Zeilen unten auf der Passseite) war nicht lesbar. Bitte laden Sie ein scharfes, vollständiges Foto der Passdatenseite hoch.',
      PASSPORT_EXPIRED: 'Ihr Reisepass ist abgelaufen. Bitte laden Sie einen gültigen Pass hoch.',
      PASSPORT_EXPIRES_SOON: 'Ihr Reisepass läuft bald ab. Die Botschaft verlangt mindestens 12 Monate Gültigkeit.',
    },
    fallback: 'Bitte prüfen Sie das Dokument und laden Sie bei Bedarf ein neues hoch.',
  },
  en: {
    title: 'A problem was found in your uploaded document',
    body: {
      WRONG_TYPE_SUSPECTED: 'The machine-readable lines (the two lines at the bottom of the passport page) could not be read. Please upload a sharp, complete photo of your passport photo page.',
      PASSPORT_EXPIRED: 'Your passport has expired. Please upload a valid passport.',
      PASSPORT_EXPIRES_SOON: 'Your passport expires soon. The embassy requires at least 12 months of validity.',
    },
    fallback: 'Please check the document and upload a new one if needed.',
  },
  ru: {
    title: 'В загруженном документе найдена проблема',
    body: {
      WRONG_TYPE_SUSPECTED: 'Машиночитаемые строки (две строки внизу страницы паспорта) не распознаны. Загрузите чёткое полное фото страницы паспорта с фотографией.',
      PASSPORT_EXPIRED: 'Срок действия паспорта истёк. Загрузите действующий паспорт.',
      PASSPORT_EXPIRES_SOON: 'Срок действия паспорта скоро истекает. Посольство требует не менее 12 месяцев действия.',
    },
    fallback: 'Проверьте документ и при необходимости загрузите новый.',
  },
};

/** In-app (+ push/email) notice about problems the background OCR found after the upload. */
export const notifyCheckProblems = async (userId: string, issues: CheckIssue[], link: string, caseId?: string) => {
  if (!issues.length) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  if (!user) return;
  const t = TEXT[user.locale];
  const body = [...new Set(issues.map((i) => t.body[i.code] ?? t.fallback))].join(' ');
  await notifyUser(userId, { type: 'DOCUMENT_CHECK', title: t.title, body, link, caseId, email: false });
};

/** Issues from an OCR record the passport OCR job stored on a case document. */
export const issuesFromOcrRecord = (target: ReturnType<typeof targetForRequirement>, ocr: unknown, now = new Date()): CheckIssue[] => {
  const mrz = mrzOf(ocr);
  if (mrz) {
    const issue = expiryIssue(mrz.expiryDate || null, now);
    return issue ? [issue] : [];
  }
  const rec = ocr as Partial<Extract<OcrRecord, { raw: string }>> | null;
  return rec?.error === 'MRZ_NOT_FOUND' && target === 'PASSPORT' ? [{ code: 'WRONG_TYPE_SUSPECTED', level: 'warn' }] : [];
};

const merge = (checks: DocChecks, extra: CheckIssue[], now: Date) => buildChecks([...checks.issues, ...extra], now);

/**
 * Finishes checks left `pending` by a slow OCR:
 *   - case documents: once the passport OCR job (jobs/ocr.ts) stored its result on the document;
 *   - vault documents: runs the OCR here with a generous deadline.
 * Problems found are added to the checks and the client is notified. Returns the number finished.
 */
export const finishPendingChecks = async (now = new Date(), limit = 10) => {
  let done = 0;
  const pendingFilter = { path: '$.pending', equals: true } as const;

  const docs = await prisma.document.findMany({
    where: { checkedAt: null, ocrAt: { not: null }, checks: pendingFilter },
    include: { requirement: { select: { key: true } }, case: { select: { id: true, clientId: true } } },
    take: limit,
  });
  for (const d of docs) {
    const checks = checksOf(d.checks);
    if (!checks) continue;
    const extra = issuesFromOcrRecord(targetForRequirement(d.requirement?.key), d.ocr, now);
    // The AI result (checks.ai, lib/aiDocs) stays next to the finished checks.
    const ai = (d.checks as { ai?: unknown } | null)?.ai;
    await prisma.document.update({ where: { id: d.id }, data: { checks: json({ ...merge(checks, extra, now), ...(ai ? { ai } : {}) } as DocChecks), checkedAt: now } });
    if (d.uploadedById === d.case.clientId) await notifyCheckProblems(d.case.clientId, extra, `/account/cases/${d.case.id}`, d.case.id);
    done++;
  }

  // Stale case documents (OCR disabled since the upload, or the OCR job could not read them) are closed after a day.
  await prisma.document.updateMany({
    where: { checkedAt: null, checks: pendingFilter, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    data: { checkedAt: now },
  });

  const vault = await prisma.vaultDocument.findMany({ where: { checks: pendingFilter }, orderBy: { createdAt: 'asc' }, take: limit });
  for (const v of vault) {
    const checks = checksOf(v.checks);
    if (!checks) continue;
    let next = buildChecks(checks.issues, now);
    if (docCheckDeps.ocrAvailable()) {
      try {
        const { checks: full } = await runChecks({
          path: path.join(vaultDir(), v.storageKey),
          mimeType: v.mimeType,
          target: targetForVaultKind(v.kind),
          now,
          timeoutMs: 60_000,
        });
        // A second timeout just closes the check without OCR findings.
        next = buildChecks(full.issues, now);
      } catch (err) {
        console.error('[docCheck] vault follow-up failed', err);
      }
    }
    await prisma.vaultDocument.update({ where: { id: v.id }, data: { checks: json(next) } });
    const added = next.issues.filter((i) => !checks.issues.some((c) => c.code === i.code));
    await notifyCheckProblems(v.userId, added, '/account/vault');
    done++;
  }
  return done;
};
