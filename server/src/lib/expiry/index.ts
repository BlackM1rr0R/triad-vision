import type { Locale, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { daysLeft, expiryFromRecords, kindForKey, toneOf, type ExpiryKind, type ExpiryTone } from './rules.js';

export * from './rules.js';

/**
 * Document expiry data: filling `Document.expiresAt` (OCR, vault copy, staff), the "current" documents
 * of open cases the warnings look at, and the list behind /admin/expiring. The reminder runs live in
 * jobs/expiry.ts.
 */

/** Case documents the warnings care about: open cases, not rejected. */
const activeDocWhere = (extra: Prisma.DocumentWhereInput = {}): Prisma.DocumentWhereInput => ({
  status: { not: 'REJECTED' },
  case: { status: { notIn: FINAL_STATUSES } },
  ...extra,
});

/** Sets (or clears) the expiry date; a changed date starts its warnings from scratch. */
export const setDocumentExpiry = async (docId: string, expiresAt: Date | null) => {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId }, select: { expiresAt: true } });
  const same = (doc.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null);
  return prisma.document.update({ where: { id: docId }, data: same ? { expiresAt } : { expiresAt, expiryRemindedAt: null } });
};

/**
 * Called right after an OCR result was stored on a document: an expiry date found there fills an
 * empty `expiresAt` (a date staff entered is never overwritten). Never throws.
 */
export const fillExpiryFromOcr = async (docId: string, ocr: unknown, checks?: unknown) => {
  try {
    const found = expiryFromRecords(ocr, checks);
    if (!found) return null;
    const res = await prisma.document.updateMany({ where: { id: docId, expiresAt: null }, data: { expiresAt: found, expiryRemindedAt: null } });
    return res.count ? found : null;
  } catch (err) {
    console.error('[expiry] could not fill the expiry date from OCR', err);
    return null;
  }
};

/**
 * One pass over documents of open cases without an expiry date: reads it from the stored OCR / check
 * results or from the vault document the file was copied from. Returns the number filled.
 */
export const backfillDocumentExpiry = async (batch = 500) => {
  let filled = 0;
  let cursor: string | undefined;
  for (;;) {
    const docs = await prisma.document.findMany({
      where: activeDocWhere({ expiresAt: null, OR: [{ ocrAt: { not: null } }, { checkedAt: { not: null } }, { vaultDocumentId: { not: null } }] }),
      select: { id: true, ocr: true, checks: true, vaultDocumentId: true },
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!docs.length) break;
    cursor = docs[docs.length - 1].id;
    const vaultIds = [...new Set(docs.map((d) => d.vaultDocumentId).filter((v): v is string => !!v))];
    const vault = vaultIds.length
      ? new Map((await prisma.vaultDocument.findMany({ where: { id: { in: vaultIds }, expiresAt: { not: null } }, select: { id: true, expiresAt: true } })).map((v) => [v.id, v.expiresAt!]))
      : new Map<string, Date>();
    for (const d of docs) {
      const found = expiryFromRecords(d.ocr, d.checks) ?? (d.vaultDocumentId ? vault.get(d.vaultDocumentId) ?? null : null);
      if (!found) continue;
      const res = await prisma.document.updateMany({ where: { id: d.id, expiresAt: null }, data: { expiresAt: found, expiryRemindedAt: null } });
      filled += res.count;
    }
    if (docs.length < batch) break;
  }
  return filled;
};

/** Requirement / vault title in the reader's language. */
export const l10nTitle = (title: unknown, locale: Locale) => {
  const t = (title ?? {}) as Partial<Record<Locale, string>>;
  return t[locale] || t.az || t.en || '';
};

const docInclude = {
  requirement: { select: { id: true, key: true, title: true } },
  case: {
    select: {
      id: true,
      number: true,
      status: true,
      visaType: true,
      clientId: true,
      assignedStaffId: true,
      client: { select: { id: true, firstName: true, lastName: true, locale: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true, locale: true, isActive: true } },
    },
  },
} satisfies Prisma.DocumentInclude;

export type TrackedDocument = Prisma.DocumentGetPayload<{ include: typeof docInclude }>;

/**
 * Documents of open cases with an expiry date up to `until` (no lower bound: expired ones stay listed).
 * Only the latest non-rejected upload of each requirement counts — older uploads were replaced.
 */
export const trackedDocuments = async (opts: { until: Date; caseWhere?: Prisma.CaseWhereInput }): Promise<TrackedDocument[]> => {
  const docs = await prisma.document.findMany({
    where: activeDocWhere({
      expiresAt: { not: null, lte: opts.until },
      ...(opts.caseWhere ? { case: { status: { notIn: FINAL_STATUSES }, ...opts.caseWhere } } : {}),
    }),
    include: docInclude,
    orderBy: { expiresAt: 'asc' },
  });
  if (!docs.length) return [];
  const reqIds = [...new Set(docs.map((d) => d.requirementId).filter((r): r is string => !!r))];
  const latest = new Map<string, string>();
  if (reqIds.length) {
    const all = await prisma.document.findMany({
      where: { requirementId: { in: reqIds }, status: { not: 'REJECTED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, requirementId: true },
    });
    for (const d of all) if (!latest.has(d.requirementId!)) latest.set(d.requirementId!, d.id);
  }
  return docs.filter((d) => !d.requirementId || latest.get(d.requirementId) === d.id);
};

/** Clients whose passport validity is tracked on a case document (the old profile-based reminder skips them). */
export const clientsWithTrackedPassport = async (clientIds: string[]) => {
  if (!clientIds.length) return new Set<string>();
  const rows = await prisma.document.findMany({
    where: activeDocWhere({ expiresAt: { not: null }, requirement: { is: { key: 'PASSPORT' } }, case: { status: { notIn: FINAL_STATUSES }, clientId: { in: clientIds } } }),
    select: { case: { select: { clientId: true } } },
  });
  return new Set(rows.map((r) => r.case.clientId));
};

// ─── List for /admin/expiring and the digest ─────────────────────────────

export interface ExpiringRow {
  source: 'case' | 'vault';
  id: string;
  document: string;
  fileName: string;
  key: string | null;
  kind: ExpiryKind;
  expiresAt: string;
  daysLeft: number;
  tone: ExpiryTone;
  client: { id: string; name: string };
  case: { id: string; number: string; status: string; visaType: VisaType } | null;
  staff: { id: string; name: string } | null;
}

const DAY = 24 * 60 * 60 * 1000;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/**
 * Documents expiring within `days` (or already expired) in open cases, plus vault documents of clients
 * with an open case (read-only rows). A vault document already copied into a listed case document is
 * shown once, as the case document.
 */
export const listExpiring = async (opts: { days: number; staffId?: string; visaType?: VisaType; now?: Date; locale?: Locale }): Promise<ExpiringRow[]> => {
  const now = opts.now ?? new Date();
  const locale = opts.locale ?? 'az';
  const until = new Date(now.getTime() + opts.days * DAY);
  const caseWhere: Prisma.CaseWhereInput = {
    status: { notIn: FINAL_STATUSES },
    ...(opts.staffId ? { assignedStaffId: opts.staffId === 'none' ? null : opts.staffId } : {}),
    ...(opts.visaType ? { visaType: opts.visaType } : {}),
  };

  const docs = await trackedDocuments({ until, caseWhere });
  const rows: ExpiringRow[] = docs.map((d) => {
    const kind = kindForKey(d.requirement?.key);
    return {
      source: 'case',
      id: d.id,
      document: l10nTitle(d.requirement?.title, locale) || d.originalName,
      fileName: d.originalName,
      key: d.requirement?.key ?? null,
      kind,
      expiresAt: d.expiresAt!.toISOString(),
      daysLeft: daysLeft(d.expiresAt!, now),
      tone: toneOf(kind, d.expiresAt!, now),
      client: { id: d.case.client.id, name: name(d.case.client) },
      case: { id: d.case.id, number: d.case.number, status: d.case.status, visaType: d.case.visaType },
      staff: d.case.assignedStaff ? { id: d.case.assignedStaff.id, name: name(d.case.assignedStaff) } : null,
    };
  });

  const copied = new Set(docs.map((d) => d.vaultDocumentId).filter(Boolean));
  const vault = await prisma.vaultDocument.findMany({
    where: { expiresAt: { not: null, lte: until }, user: { isActive: true, cases: { some: caseWhere } } },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          cases: {
            where: caseWhere,
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, number: true, status: true, visaType: true, assignedStaff: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      },
    },
  });
  for (const v of vault) {
    if (copied.has(v.id)) continue;
    const c = v.user.cases[0];
    if (!c) continue;
    const kind = kindForKey(v.kind);
    rows.push({
      source: 'vault',
      id: v.id,
      document: v.title,
      fileName: v.filename,
      key: v.kind,
      kind,
      expiresAt: v.expiresAt!.toISOString(),
      daysLeft: daysLeft(v.expiresAt!, now),
      tone: toneOf(kind, v.expiresAt!, now),
      client: { id: v.user.id, name: name(v.user) },
      case: { id: c.id, number: c.number, status: c.status, visaType: c.visaType },
      staff: c.assignedStaff ? { id: c.assignedStaff.id, name: name(c.assignedStaff) } : null,
    });
  }
  return rows.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.client.name.localeCompare(b.client.name));
};
