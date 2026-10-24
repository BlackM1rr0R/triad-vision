import type { LegalDocument, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { privacySchema } from '../legalSettings.js';
import { COOKIES_BODY, COOKIES_TITLE, TERMS_BODY, TERMS_TITLE } from './templates.js';

/**
 * Versioned legal texts (AGB / privacy policy / cookie policy). One PUBLISHED version per kind is
 * current; publishing archives the previous one. Consents (ConsentRecord) point at the version the
 * person accepted (legalDocumentId + version). Until a version is published the built-in starter text
 * (TERMS, COOKIES) or the generated privacy policy page is shown and the legacy version label is used,
 * so nothing breaks on an empty table.
 */

export const LEGAL_KINDS = ['TERMS', 'PRIVACY', 'COOKIES'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export const LEGAL_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

/** Version label used while no LegalDocument of the kind is published (the old POLICY_VERSION constant). */
export const LEGACY_POLICY_VERSION = '2026-10';
const FALLBACK_VERSION: Record<LegalKind, string> = { TERMS: LEGACY_POLICY_VERSION, PRIVACY: LEGACY_POLICY_VERSION, COOKIES: '1' };

/** Consent type that records acceptance of each kind (ConsentRecord.type). */
export const CONSENT_TYPE_FOR_KIND = { TERMS: 'TERMS', PRIVACY: 'PRIVACY_POLICY', COOKIES: 'COOKIES' } as const satisfies Record<LegalKind, string>;
export const kindForConsentType = (type: string): LegalKind | null =>
  (Object.entries(CONSENT_TYPE_FOR_KIND).find(([, t]) => t === type)?.[0] as LegalKind | undefined) ?? null;

/** Kinds a signed-in user accepts (and may have to re-accept). Cookies are a per-browser choice. */
export const ACCEPT_KINDS = ['TERMS', 'PRIVACY'] as const satisfies readonly LegalKind[];

type L10n = { az: string; de: string; en: string; ru: string };

const PRIVACY_TITLE: L10n = { az: 'Məxfilik siyasəti', de: 'Datenschutzerklärung', en: 'Privacy policy', ru: 'Политика конфиденциальности' };
const EMPTY: L10n = { az: '', de: '', en: '', ru: '' };

export const currentDocument = (kind: LegalKind) =>
  prisma.legalDocument.findFirst({ where: { kind, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } });

/** Version label + id of the current published text (fallback: legacy label, no id). */
export const currentRef = async (kind: LegalKind): Promise<{ id: string | null; version: string }> => {
  const doc = await prisma.legalDocument.findFirst({ where: { kind, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, select: { id: true, version: true } });
  return doc ? { id: doc.id, version: doc.version } : { id: null, version: FALLBACK_VERSION[kind] };
};

/** The admin-provided privacy text from Settings (the pre-versioning replacement for the generated policy). */
const privacySettingText = async (): Promise<L10n> => {
  const row = await prisma.setting.findUnique({ where: { key: 'privacy' } });
  const parsed = privacySchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data.text : { ...EMPTY };
};

/**
 * Text shown / copied when no version is published yet. PRIVACY returns the custom text from Settings
 * (often empty: the public page then keeps rendering its generated template).
 */
export const fallbackContent = async (kind: LegalKind): Promise<{ title: L10n; body: L10n }> => {
  if (kind === 'TERMS') return { title: { ...TERMS_TITLE }, body: { ...TERMS_BODY } };
  if (kind === 'COOKIES') return { title: { ...COOKIES_TITLE }, body: { ...COOKIES_BODY } };
  return { title: { ...PRIVACY_TITLE }, body: await privacySettingText() };
};

/** Public shape of a document (no author). */
export const publicDocument = (d: LegalDocument) => ({
  id: d.id,
  kind: d.kind,
  version: d.version,
  title: d.title,
  body: d.body,
  changeSummary: d.changeSummary,
  requiresReacceptance: d.requiresReacceptance,
  status: d.status,
  publishedAt: d.publishedAt,
  effectiveAt: d.effectiveAt,
});

/** Next free version label for a new draft: today's date, then "-2", "-3" … on the same day. */
export const nextVersionLabel = async (kind: LegalKind, now = new Date()) => {
  const base = now.toISOString().slice(0, 10);
  const taken = new Set((await prisma.legalDocument.findMany({ where: { kind, version: { startsWith: base } }, select: { version: true } })).map((d) => d.version));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
};

/** New DRAFT copied from the current published version (or the fallback text). */
export const createDraft = async (kind: LegalKind, opts: { version?: string; createdById?: string | null; copyFromId?: string | null } = {}) => {
  const source = opts.copyFromId
    ? await prisma.legalDocument.findFirst({ where: { id: opts.copyFromId, kind } })
    : await currentDocument(kind);
  const content = source ? { title: source.title as L10n, body: source.body as L10n } : await fallbackContent(kind);
  return prisma.legalDocument.create({
    data: {
      kind,
      version: opts.version ?? (await nextVersionLabel(kind)),
      title: content.title,
      body: content.body,
      status: 'DRAFT',
      createdById: opts.createdById ?? null,
    },
  });
};

export class LegalPublishError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Publishes a DRAFT: the previous PUBLISHED version of the kind becomes ARCHIVED (in one transaction,
 * so there is never more than one current version). The German text is binding and must not be empty.
 */
export const publishDocument = async (id: string, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    const doc = await tx.legalDocument.findUnique({ where: { id } });
    if (!doc) throw new LegalPublishError('LEGAL_DOCUMENT_NOT_FOUND');
    if (doc.status !== 'DRAFT') throw new LegalPublishError('LEGAL_DOCUMENT_NOT_DRAFT');
    const body = doc.body as Partial<L10n>;
    if (!body.de?.trim()) throw new LegalPublishError('LEGAL_GERMAN_TEXT_REQUIRED');
    const previous = await tx.legalDocument.findMany({ where: { kind: doc.kind, status: 'PUBLISHED' }, select: { id: true } });
    if (previous.length) await tx.legalDocument.updateMany({ where: { id: { in: previous.map((p) => p.id) } }, data: { status: 'ARCHIVED' } });
    const published = await tx.legalDocument.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: now, effectiveAt: doc.effectiveAt && doc.effectiveAt > now ? doc.effectiveAt : now },
    });
    return { published, archivedIds: previous.map((p) => p.id) };
  });

/** Published version before `doc` of the same kind (for the diff); for a draft: the current version. */
export const previousPublished = async (doc: Pick<LegalDocument, 'id' | 'kind' | 'status' | 'publishedAt'>) => {
  const where: Prisma.LegalDocumentWhereInput = { kind: doc.kind, id: { not: doc.id }, status: { in: ['PUBLISHED', 'ARCHIVED'] }, publishedAt: { not: null } };
  if (doc.status !== 'DRAFT' && doc.publishedAt) where.publishedAt = { lt: doc.publishedAt };
  return prisma.legalDocument.findFirst({ where, orderBy: { publishedAt: 'desc' } });
};

// ─── Re-acceptance ─────────────────────────────────────────────────────

export interface PendingAcceptance {
  kind: LegalKind;
  id: string;
  version: string;
  title: unknown;
  changeSummary: unknown;
  effectiveAt: Date | null;
  publishedAt: Date | null;
}

/**
 * Current versions the user still has to accept: the version is flagged "requires re-acceptance" and
 * the user has no granted consent for exactly this version (by id, or by version label for consents
 * logged before the id was stored). A version published without the flag never blocks anyone.
 */
export const pendingAcceptances = async (userId: string): Promise<PendingAcceptance[]> => {
  const docs = await prisma.legalDocument.findMany({ where: { kind: { in: [...ACCEPT_KINDS] }, status: 'PUBLISHED', requiresReacceptance: true } });
  if (!docs.length) return [];
  const accepted = await prisma.consentRecord.findMany({
    where: { userId, granted: true, type: { in: docs.map((d) => CONSENT_TYPE_FOR_KIND[d.kind as LegalKind]) } },
    select: { type: true, version: true, legalDocumentId: true },
  });
  return docs
    .filter((d) => !accepted.some((a) => a.type === CONSENT_TYPE_FOR_KIND[d.kind as LegalKind] && (a.legalDocumentId === d.id || a.version === d.version)))
    .map((d) => ({ kind: d.kind as LegalKind, id: d.id, version: d.version, title: d.title, changeSummary: d.changeSummary, effectiveAt: d.effectiveAt, publishedAt: d.publishedAt }));
};

// ─── Diff ──────────────────────────────────────────────────────────────

export type DiffLine = { op: 'same' | 'add' | 'del'; text: string };

/**
 * Line diff (longest common subsequence) between two texts, for "what changed since the last published
 * version". Legal texts are a few hundred lines at most; above ~4 million cells it degrades to "all
 * removed, all added" instead of using lots of memory.
 */
export const lineDiff = (before: string, after: string): DiffLine[] => {
  const a = before.replace(/\r\n?/g, '\n').split('\n');
  const b = after.replace(/\r\n?/g, '\n').split('\n');
  if (before === '') return after === '' ? [] : b.map((text) => ({ op: 'add' as const, text }));
  if (after === '') return a.map((text) => ({ op: 'del' as const, text }));
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return [...a.map((text) => ({ op: 'del' as const, text })), ...b.map((text) => ({ op: 'add' as const, text }))];
  // lcs[i][j] = LCS length of a[i..] and b[j..], stored flat.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push({ op: 'del', text: a[i++] });
    else out.push({ op: 'add', text: b[j++] });
  }
  while (i < n) out.push({ op: 'del', text: a[i++] });
  while (j < m) out.push({ op: 'add', text: b[j++] });
  return out;
};
