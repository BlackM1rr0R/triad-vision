import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { DocStatus, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, HttpError, notFound } from '../http.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import { checklistFor, getCaseAiSettings } from '../ai/features/caseAi/config.js';
import { PURPOSE_DE } from '../ai/features/caseAi/videxMaps.js';
import { toLatin } from '../ai/features/caseAi/videx.js';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { imageKind, isPdfBytes } from './image.js';
import { buildPackagePdf, buildPackageParts, type PackageEntry, type PackageInfo, type PackageSection } from './packagePdf.js';
import { fmtDateTime } from './texts.js';

/**
 * One-click embassy package: the preview checklist (what of the visa type's embassy checklist is in the
 * case) and the build (one PDF, or one PDF per section as ZIP) saved as a case Document (stage EMBASSY).
 * The checklist is the editable one of the case AI settings (caseAi/config.ts checklistFor) — not a copy.
 */

const MB = 1024 * 1024;
/** Upper bound of the produced package (and of the files that go into it). Env override for tests / ops. */
export const packageMaxBytes = () => {
  const v = Number(process.env.EMBASSY_PACKAGE_MAX_MB);
  return (Number.isFinite(v) && v > 0 ? v : 50) * MB;
};

export const PACKAGE_EVENT = 'EMBASSY_PACKAGE_BUILT';
export const MAX_COPIES = 4;

export type ItemStatus = 'found' | 'pending' | 'missing' | 'manual';

export interface CandidateDoc {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: DocStatus;
  stage: string;
  createdAt: string;
  embeddable: boolean;
}

export interface PreviewItem {
  key: string;
  source: 'checklist' | 'extra';
  label: L10n;
  requirementKey: string | null;
  /** Existing requirement of the case (reminders go there). */
  requirementId: string | null;
  status: ItemStatus;
  /** The document that goes into the package by default (latest accepted, else latest pending). */
  document: CandidateDoc | null;
  /** Accepted and pending documents, newest first (rejected ones never). */
  candidates: CandidateDoc[];
  /** Default of the include toggle. */
  include: boolean;
}

export interface PackagePreview {
  caseId: string;
  number: string;
  visaType: string;
  items: PreviewItem[];
  summary: { found: number; pending: number; missing: number; manual: number };
  appointmentAt: string | null;
  appointmentPlace: string | null;
  maxBytes: number;
  lastPackage: { documentId: string; name: string; createdAt: string } | null;
}

const embeddable = (mime: string, name: string) => mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png' || /\.(pdf|jpe?g|png)$/i.test(name);

const candidate = (d: { id: string; originalName: string; mimeType: string; size: number; status: DocStatus; stage: string; createdAt: Date }): CandidateDoc => ({
  id: d.id,
  name: d.originalName,
  mimeType: d.mimeType,
  size: d.size,
  status: d.status,
  stage: d.stage,
  createdAt: d.createdAt.toISOString(),
  embeddable: embeddable(d.mimeType, d.originalName),
});

const sortCandidates = (list: CandidateDoc[]) =>
  [...new Map(list.map((d) => [d.id, d])).values()].sort((a, b) => Number(b.status === 'ACCEPTED') - Number(a.status === 'ACCEPTED') || b.createdAt.localeCompare(a.createdAt));

const loadPackageCase = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: { select: { firstName: true, lastName: true, passportNumber: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
      visaCategory: { select: { visaLabel: true } },
      contract: { select: { signedDocumentId: true } },
      requirements: {
        orderBy: [{ stage: 'desc' }, { sortOrder: 'asc' }], // EMBASSY before INITIAL
        include: { documents: { where: { status: { not: 'REJECTED' } }, orderBy: { createdAt: 'desc' } } },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const signed = c.contract?.signedDocumentId ? await prisma.document.findUnique({ where: { id: c.contract.signedDocumentId } }) : null;
  return { c, signed };
};

type PackageCase = Awaited<ReturnType<typeof loadPackageCase>>;

const l10n = (v: unknown): L10n => {
  const t = (v ?? {}) as Partial<L10n>;
  const fb = t.de || t.en || t.az || t.ru || '';
  return { az: t.az || fb, de: t.de || fb, en: t.en || fb, ru: t.ru || fb };
};

const previewFrom = async ({ c, signed }: PackageCase): Promise<PackagePreview> => {
  const settings = await getCaseAiSettings();
  const checklist = checklistFor(settings, c.visaType);
  const usedReqs = new Set<string>();
  const items: PreviewItem[] = checklist.map((i) => {
    // Items without a requirement key (fee, employer declaration …) count once they were requested from the
    // client: the requirement created then carries the checklist label as its title.
    const reqs = i.requirementKey ? c.requirements.filter((r) => r.key === i.requirementKey) : c.requirements.filter((r) => !r.key && l10n(r.title).de === i.label.de);
    reqs.forEach((r) => usedReqs.add(r.id));
    const docs = reqs.flatMap((r) => r.documents.map((d) => candidate(d)));
    if (i.requirementKey === 'SIGNED_CONTRACT' && signed && signed.status !== 'REJECTED') docs.push({ ...candidate(signed), status: 'ACCEPTED' });
    const candidates = sortCandidates(docs);
    const accepted = candidates.find((d) => d.status === 'ACCEPTED') ?? null;
    const pending = candidates.find((d) => d.status === 'PENDING') ?? null;
    const status: ItemStatus = accepted ? 'found' : pending ? 'pending' : !i.requirementKey && !reqs.length ? 'manual' : 'missing';
    return {
      key: i.key,
      source: 'checklist',
      label: i.label,
      requirementKey: i.requirementKey ?? null,
      requirementId: reqs[0]?.id ?? null,
      status,
      document: accepted ?? pending,
      candidates,
      include: status === 'found',
    };
  });
  // Accepted case documents the checklist does not name (driving licence, references …): offered, embassy-stage ones on.
  for (const r of c.requirements) {
    if (usedReqs.has(r.id)) continue;
    const candidates = sortCandidates(r.documents.map((d) => candidate(d)));
    const accepted = candidates.find((d) => d.status === 'ACCEPTED');
    if (!accepted) continue;
    items.push({
      key: `req:${r.id}`,
      source: 'extra',
      label: l10n(r.title),
      requirementKey: r.key,
      requirementId: r.id,
      status: 'found',
      document: accepted,
      candidates,
      include: r.stage === 'EMBASSY',
    });
  }
  const last = await prisma.document.findFirst({
    where: { caseId: c.id, stage: 'EMBASSY', requirementId: null, originalName: { contains: '_Botschaft_' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, originalName: true, createdAt: true },
  });
  const count = (s: ItemStatus) => items.filter((i) => i.source === 'checklist' && i.status === s).length;
  return {
    caseId: c.id,
    number: c.number,
    visaType: c.visaType,
    items,
    summary: { found: count('found'), pending: count('pending'), missing: count('missing'), manual: count('manual') },
    appointmentAt: c.appointmentAt?.toISOString() ?? null,
    appointmentPlace: c.appointmentPlace,
    maxBytes: packageMaxBytes(),
    lastPackage: last ? { documentId: last.id, name: last.originalName, createdAt: last.createdAt.toISOString() } : null,
  };
};

export const packagePreview = async (caseId: string) => previewFrom(await loadPackageCase(caseId));

// ─── Build ─────────────────────────────────────────────────────────

export interface BuildOptions {
  /** Order = array order. Items left out keep their default include and come after the listed ones. */
  items?: { key: string; include: boolean; copies?: number; documentId?: string }[];
  separators?: boolean;
  /** Default copies for every included item. */
  copies?: number;
  format?: 'pdf' | 'zip';
}

const asciiName = (s: string) =>
  toLatin(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'X';

export const packageFileName = (lastName: string, firstName: string, date: Date, ext: 'pdf' | 'zip') =>
  `${asciiName(lastName)}_${asciiName(firstName)}_Botschaft_${date.toISOString().slice(0, 10)}.${ext}`;

const contactInfo = async (staff: { firstName: string; lastName: string } | null) => {
  const row = await prisma.setting.findUnique({ where: { key: 'legal' } });
  const v = (row?.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
  return {
    company: [s('companyName') || 'Triad Vision', s('legalForm')].filter(Boolean).join(' '),
    phone: s('phone') || '+994 50 748 70 48',
    email: s('email') || 'info@triad-vision.de',
    staff: staff ? `${staff.firstName} ${staff.lastName}`.trim() || null : null,
  };
};

export interface BuildResult {
  document: { id: string; originalName: string; mimeType: string; size: number; stage: string; createdAt: Date };
  format: 'pdf' | 'zip';
  pages: number;
  sizeBytes: number;
  entries: PackageEntry[];
  /** Checklist items that are not in the package (missing / excluded / manual). */
  notIncluded: { key: string; label: L10n; status: ItemStatus }[];
}

const tooLarge = (bytes: number) => new HttpError(413, 'PACKAGE_TOO_LARGE', `The package would be ${(bytes / MB).toFixed(1)} MB; the limit is ${Math.round(packageMaxBytes() / MB)} MB. Exclude large files or reduce copies.`);

export const buildEmbassyPackage = async (caseId: string, opts: BuildOptions, actor: { id: string }): Promise<BuildResult> => {
  const loaded = await loadPackageCase(caseId);
  const { c } = loaded;
  const preview = await previewFrom(loaded);
  const byKey = new Map(preview.items.map((i) => [i.key, i]));
  const defaultCopies = Math.min(MAX_COPIES, Math.max(1, Math.round(opts.copies ?? 1)));

  // Requested order first, then the remaining items in checklist order.
  const listed = new Map((opts.items ?? []).map((o) => [o.key, o]));
  for (const k of listed.keys()) if (!byKey.has(k)) throw badRequest('UNKNOWN_ITEM', k);
  const ordered = [...(opts.items ?? []).map((o) => byKey.get(o.key)!), ...preview.items.filter((i) => !listed.has(i.key))];

  const chosen: { item: PreviewItem; doc: CandidateDoc; copies: number }[] = [];
  for (const item of ordered) {
    const o = listed.get(item.key);
    const include = o ? o.include : item.include;
    if (!include || item.status === 'manual' || item.status === 'missing') continue;
    let doc = item.document;
    if (o?.documentId) {
      doc = item.candidates.find((d) => d.id === o.documentId) ?? null; // rejected documents are never candidates
      if (!doc) throw badRequest('INVALID_DOCUMENT', o.documentId);
    }
    if (!doc) continue;
    chosen.push({ item, doc, copies: Math.min(MAX_COPIES, Math.max(1, Math.round(o?.copies ?? defaultCopies))) });
  }
  if (!chosen.length) throw badRequest('NOTHING_TO_BUILD');

  const estimate = chosen.reduce((a, x) => a + x.doc.size * x.copies, 0);
  if (estimate > packageMaxBytes()) throw tooLarge(estimate);

  const docs = await prisma.document.findMany({ where: { id: { in: chosen.map((x) => x.doc.id) } }, select: { id: true, storedName: true } });
  const stored = new Map(docs.map((d) => [d.id, d.storedName]));
  const read = async (id: string) => {
    const name = stored.get(id);
    if (!name) return null;
    return fs.readFile(path.join(config.uploads.privateDir, path.basename(name))).catch(() => null);
  };
  const sections: PackageSection[] = [];
  for (const x of chosen) {
    const bytes = await read(x.doc.id);
    // Images stored under a generic MIME type are recognised by their bytes.
    const mime = bytes && x.doc.mimeType !== 'application/pdf' && !x.doc.mimeType.startsWith('image/') ? (isPdfBytes(bytes) ? 'application/pdf' : imageKind(bytes) ? `image/${imageKind(bytes)}` : x.doc.mimeType) : x.doc.mimeType;
    sections.push({ key: x.item.key, documentId: x.doc.id, title: x.item.label.de, file: { name: x.doc.name, mimeType: mime, bytes }, copies: x.copies });
  }

  const now = new Date();
  const info: PackageInfo = {
    caseNumber: c.number,
    applicant: `${c.client.lastName.toUpperCase()}, ${c.client.firstName}`,
    passportNumber: c.client.passportNumber,
    visaType: [PURPOSE_DE[c.visaType], c.visaCategory?.visaLabel].filter(Boolean).join(' – '),
    appointment: c.appointmentAt ? `${fmtDateTime(c.appointmentAt, 'de')} Uhr` : null,
    appointmentPlace: c.appointmentPlace,
    contact: await contactInfo(c.assignedStaff),
    date: now,
    separators: opts.separators ?? true,
    bringSeparately: preview.items.filter((i) => i.source === 'checklist' && i.status === 'manual').map((i) => i.label.de),
  };

  const format = opts.format ?? 'pdf';
  let file: Buffer;
  let pages: number;
  let entries: PackageEntry[];
  if (format === 'zip') {
    const out = await buildPackageParts(info, sections, (i, s) => `${String(i + 1).padStart(2, '0')}_${asciiName(s.title).slice(0, 50)}.pdf`);
    const zip = new JSZip();
    for (const p of out.parts) zip.file(p.name, p.pdf);
    file = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    pages = out.parts.reduce((a, p) => a + p.pages, 0);
    entries = out.entries;
  } else {
    const out = await buildPackagePdf(info, sections);
    file = out.pdf;
    pages = out.pages;
    entries = out.entries;
  }
  if (file.length > packageMaxBytes()) throw tooLarge(file.length);

  const name = packageFileName(c.client.lastName, c.client.firstName, now, format);
  const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${format}`;
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(path.join(config.uploads.privateDir, storedName), file);
  let document;
  try {
    document = await prisma.document.create({
      data: { caseId: c.id, stage: 'EMBASSY', originalName: name, storedName, mimeType: format === 'zip' ? 'application/zip' : 'application/pdf', size: file.length, status: 'ACCEPTED', uploadedById: actor.id },
    });
  } catch (err) {
    await fs.unlink(path.join(config.uploads.privateDir, storedName)).catch(() => undefined);
    throw err;
  }
  void copyDocumentToDrive(document.id); // a copy in the client's drive folder (never throws)
  const notIncluded = preview.items
    .filter((i) => i.source === 'checklist' && !chosen.some((x) => x.item.key === i.key))
    .map((i) => ({ key: i.key, label: i.label, status: i.status }));
  await prisma.caseEvent.create({
    data: {
      caseId: c.id,
      type: PACKAGE_EVENT,
      note: `${name} · ${pages} S. · ${chosen.length} Unterlagen${notIncluded.length ? ` · fehlt/nicht enthalten: ${notIncluded.map((i) => i.label.de).join(', ')}` : ''}`.slice(0, 2000),
      actorId: actor.id,
      visibleToClient: false,
    },
  });
  return {
    document: { id: document.id, originalName: document.originalName, mimeType: document.mimeType, size: document.size, stage: document.stage, createdAt: document.createdAt },
    format,
    pages,
    sizeBytes: file.length,
    entries,
    notIncluded,
  };
};

export const auditDetails = (r: BuildResult): Prisma.InputJsonValue => ({
  documentId: r.document.id,
  format: r.format,
  pages: r.pages,
  sizeBytes: r.sizeBytes,
  sections: r.entries.map((e) => e.key),
  notIncluded: r.notIncluded.map((i) => i.key),
});
