import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { conflict, HttpError, notFound, parse } from '../../lib/http.js';
import {
  createDraft,
  currentRef,
  LEGAL_KINDS,
  LegalPublishError,
  lineDiff,
  previousPublished,
  publishDocument,
  type LegalKind,
} from '../../lib/legal/documents.js';

/**
 * Admin → Legal texts (ADMIN+) — mounted at /api/admin/legal.
 *
 *   GET    /                    all versions per kind (+ the current version label, published or fallback)
 *   GET    /:id                 one version with its text and the previous published version
 *   GET    /:id/diff?lang=de    line diff against the previous published version
 *   POST   /                    { kind, version?, copyFromId? } → new DRAFT copied from the current text
 *   PUT    /:id                 DRAFT only: version, title, body, changeSummary, requiresReacceptance, effectiveAt
 *   POST   /:id/publish         DRAFT → PUBLISHED; the previous published version is archived
 *   DELETE /:id                 DRAFT only
 */
export const adminLegalRouter = Router();
adminLegalRouter.use(requireMinRole('ADMIN'));

const text = (max: number) => z.string().max(max);
const l10n = (max: number) => z.object({ az: text(max), de: text(max), en: text(max), ru: text(max) });
const versionLabel = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/);
const LANGS = ['az', 'de', 'en', 'ru'] as const;

const listSelect = {
  id: true,
  kind: true,
  version: true,
  title: true,
  status: true,
  requiresReacceptance: true,
  publishedAt: true,
  effectiveAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LegalDocumentSelect;

const loadDoc = async (id: string) => {
  const doc = await prisma.legalDocument.findUnique({ where: { id } });
  if (!doc) throw notFound('LEGAL_DOCUMENT_NOT_FOUND');
  return doc;
};

adminLegalRouter.get('/', async (_req, res) => {
  const rows = await prisma.legalDocument.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }], select: listSelect });
  const kinds = await Promise.all(
    LEGAL_KINDS.map(async (kind) => {
      const ref = await currentRef(kind);
      const accepted = ref.id ? await prisma.consentRecord.count({ where: { legalDocumentId: ref.id, granted: true } }) : 0;
      return { kind, current: { ...ref, fallback: !ref.id, accepted }, versions: rows.filter((r) => r.kind === kind) };
    }),
  );
  res.json({ kinds });
});

adminLegalRouter.get('/:id', async (req, res) => {
  const doc = await loadDoc(String(req.params.id));
  const previous = await previousPublished(doc);
  const accepted = await prisma.consentRecord.count({ where: { legalDocumentId: doc.id, granted: true } });
  res.json({ item: doc, previous: previous && { id: previous.id, version: previous.version, publishedAt: previous.publishedAt }, accepted });
});

adminLegalRouter.get('/:id/diff', async (req, res) => {
  const { lang } = parse(z.object({ lang: z.enum(LANGS).default('de') }), req.query);
  const doc = await loadDoc(String(req.params.id));
  const previous = await previousPublished(doc);
  const before = previous ? ((previous.body as Record<string, string>)[lang] ?? '') : '';
  const after = (doc.body as Record<string, string>)[lang] ?? '';
  const lines = lineDiff(before, after);
  res.json({
    previous: previous && { id: previous.id, version: previous.version },
    lines,
    stats: { added: lines.filter((l) => l.op === 'add').length, removed: lines.filter((l) => l.op === 'del').length },
  });
});

adminLegalRouter.post('/', async (req, res) => {
  const body = parse(z.object({ kind: z.enum(LEGAL_KINDS), version: versionLabel.optional(), copyFromId: z.string().min(1).max(40).optional() }), req.body ?? {});
  if (body.version && (await prisma.legalDocument.findUnique({ where: { kind_version: { kind: body.kind, version: body.version } } }))) throw conflict('LEGAL_VERSION_TAKEN');
  const item = await createDraft(body.kind as LegalKind, { version: body.version, copyFromId: body.copyFromId, createdById: req.user!.id });
  await audit(req, 'LEGAL_DRAFT_CREATED', `legal:${item.id}`, { kind: item.kind, version: item.version });
  res.status(201).json({ item });
});

adminLegalRouter.put('/:id', async (req, res) => {
  const doc = await loadDoc(String(req.params.id));
  if (doc.status !== 'DRAFT') throw conflict('LEGAL_DOCUMENT_NOT_DRAFT');
  const d = parse(
    z
      .object({
        version: versionLabel,
        title: l10n(300),
        body: l10n(200_000),
        changeSummary: l10n(4000).nullable(),
        requiresReacceptance: z.boolean(),
        effectiveAt: z.string().datetime({ offset: true }).nullable(),
      })
      .partial(),
    req.body ?? {},
  );
  if (d.version && d.version !== doc.version) {
    const taken = await prisma.legalDocument.findUnique({ where: { kind_version: { kind: doc.kind, version: d.version } } });
    if (taken) throw conflict('LEGAL_VERSION_TAKEN');
  }
  const data: Prisma.LegalDocumentUpdateInput = {};
  if (d.version !== undefined) data.version = d.version;
  if (d.title !== undefined) data.title = d.title;
  if (d.body !== undefined) data.body = d.body;
  if (d.changeSummary !== undefined) data.changeSummary = d.changeSummary && Object.values(d.changeSummary).some((v) => v.trim()) ? d.changeSummary : Prisma.DbNull;
  if (d.requiresReacceptance !== undefined) data.requiresReacceptance = d.requiresReacceptance;
  if (d.effectiveAt !== undefined) data.effectiveAt = d.effectiveAt ? new Date(d.effectiveAt) : null;
  const item = await prisma.legalDocument.update({ where: { id: doc.id }, data });
  await audit(req, 'LEGAL_DRAFT_UPDATED', `legal:${item.id}`, { kind: item.kind, version: item.version });
  res.json({ item });
});

adminLegalRouter.post('/:id/publish', async (req, res) => {
  try {
    const { published, archivedIds } = await publishDocument(String(req.params.id));
    await audit(req, 'LEGAL_PUBLISHED', `legal:${published.id}`, {
      kind: published.kind,
      version: published.version,
      requiresReacceptance: published.requiresReacceptance,
      archived: archivedIds,
    });
    res.json({ item: published, archivedIds });
  } catch (err) {
    if (err instanceof LegalPublishError) throw new HttpError(err.code === 'LEGAL_DOCUMENT_NOT_FOUND' ? 404 : err.code === 'LEGAL_DOCUMENT_NOT_DRAFT' ? 409 : 400, err.code);
    throw err;
  }
});

adminLegalRouter.delete('/:id', async (req, res) => {
  const doc = await loadDoc(String(req.params.id));
  if (doc.status !== 'DRAFT') throw conflict('LEGAL_DOCUMENT_NOT_DRAFT');
  await prisma.legalDocument.delete({ where: { id: doc.id } });
  await audit(req, 'LEGAL_DRAFT_DELETED', `legal:${doc.id}`, { kind: doc.kind, version: doc.version });
  res.json({ ok: true });
});
