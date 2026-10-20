import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocStage, DocStatus } from '@prisma/client';
import { config } from '../../../../config.js';
import { prisma } from '../../../../db.js';
import { notFound } from '../../../http.js';
import { mrzOf } from '../../../docsIntel/ocr.js';
import { aiOf } from '../../../aiDocs/docCheck.js';
import { filePart } from '../../../aiDocs/input.js';
import { pdfPageTexts } from '../../../driveIntel/extract.js';
import type { AiPart } from '../../complete.js';

/**
 * Everything the case AI checks read about ONE case: profile, case fields, visa category, employer, vacancy,
 * arrival plan, requirements and the documents with what was already extracted from them (passport MRZ from
 * the OCR job, fields from the AI document check). Document text and files are only read on demand, capped,
 * and never for purged cases. Personal data of other people is never loaded.
 */

const DAY = 24 * 3600 * 1000;
export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export interface DocEvidence {
  id: string;
  name: string;
  stage: DocStage;
  status: DocStatus;
  mimeType: string;
  requirementId: string | null;
  requirementKey: string | null;
  requirementTitle: string | null;
  createdAt: string;
  expiresAt: string | null;
  mrz: { surname: string; givenNames: string; birthDate: string; expiryDate: string; documentNumber: string; nationality: string; issuingCountry: string; sex: string; valid: boolean } | null;
  ai: { documentType: string | null; name?: string; birthDate?: string; documentNumber?: string; issueDate?: string; expiryDate?: string; issuer?: string } | null;
  storedName: string;
}

const l10nDe = (v: unknown) => {
  const t = (v ?? {}) as Record<string, string>;
  return t.de || t.en || t.az || '';
};

export const loadCaseContext = async (caseId: string, now = new Date()) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: {
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true, locale: true, birthDate: true, nationality: true, city: true, address: true,
          profession: true, germanLevel: true, education: true, passportNumber: true, passportExpiry: true, experienceYears: true,
        },
      },
      visaCategory: { select: { id: true, slug: true, visaLabel: true, title: true, germanLevel: true, salaryMin: true, salaryMax: true, processingMin: true, processingMax: true } },
      company: { select: { id: true, name: true, legalForm: true, address: true, city: true, contactName: true, phone: true, email: true } },
      vacancy: { select: { id: true, city: true, salaryMin: true, salaryMax: true, germanLevel: true, employmentType: true, title: true } },
      arrivalPlan: { select: { flightDate: true, housingCity: true } },
      contract: { select: { fileDocumentId: true, signedDocumentId: true, version: true, sentAt: true, signedAt: true } },
      requirements: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], select: { id: true, key: true, stage: true, title: true, required: true } },
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, originalName: true, stage: true, status: true, mimeType: true, requirementId: true, createdAt: true, expiresAt: true, ocr: true, checks: true, storedName: true,
          requirement: { select: { key: true, title: true } },
        },
      },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const purged = !!c.documentsPurgedAt;
  const documents: DocEvidence[] = purged
    ? []
    : c.documents.map((d) => {
        const m = mrzOf(d.ocr);
        const ai = aiOf(d.checks);
        return {
          id: d.id,
          name: d.originalName,
          stage: d.stage,
          status: d.status,
          mimeType: d.mimeType,
          requirementId: d.requirementId,
          requirementKey: d.requirement?.key ?? null,
          requirementTitle: d.requirement ? l10nDe(d.requirement.title) : null,
          createdAt: d.createdAt.toISOString(),
          expiresAt: isoDay(d.expiresAt),
          mrz: m
            ? { surname: m.surname, givenNames: m.givenNames, birthDate: m.birthDate, expiryDate: m.expiryDate, documentNumber: m.documentNumber, nationality: m.nationality, issuingCountry: m.issuingCountry, sex: m.sex, valid: m.valid }
            : null,
          ai: ai && 'fields' in ai ? { documentType: ai.documentType, ...ai.fields } : null,
          storedName: d.storedName,
        };
      });

  // Planned entry: flight date, else appointment + 4 weeks, else today + the category's longest processing time (default 12 weeks).
  let plannedEntry: { date: string; source: 'flight' | 'appointment' | 'estimate' };
  if (c.arrivalPlan?.flightDate) plannedEntry = { date: isoDay(c.arrivalPlan.flightDate)!, source: 'flight' };
  else if (c.appointmentAt) plannedEntry = { date: isoDay(new Date(c.appointmentAt.getTime() + 28 * DAY))!, source: 'appointment' };
  else plannedEntry = { date: isoDay(new Date(now.getTime() + (c.visaCategory?.processingMax ?? 12) * 7 * DAY))!, source: 'estimate' };

  return {
    id: c.id,
    number: c.number,
    status: c.status,
    visaType: c.visaType,
    profession: c.profession,
    appointmentAt: isoDay(c.appointmentAt),
    client: c.client,
    visaCategory: c.visaCategory ? { ...c.visaCategory, titleDe: l10nDe(c.visaCategory.title) } : null,
    company: c.company,
    vacancy: c.vacancy ? { ...c.vacancy, titleDe: l10nDe(c.vacancy.title) } : null,
    arrival: c.arrivalPlan,
    contract: c.contract,
    requirements: c.requirements.map((r) => ({ ...r, titleDe: l10nDe(r.title), titleL10n: r.title as Record<string, string> })),
    documents,
    purged,
    plannedEntry,
    now,
  };
};

export type CaseContext = Awaited<ReturnType<typeof loadCaseContext>>;

export const docPath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

export const readDoc = async (storedName: string): Promise<Buffer | null> => {
  try {
    return await fs.readFile(docPath(storedName));
  } catch {
    return null;
  }
};

/** The passport documents, best first (accepted with a valid MRZ, then any MRZ, then newest). */
export const passportDocs = (ctx: CaseContext) =>
  ctx.documents
    .filter((d) => d.requirementKey === 'PASSPORT' || !!d.mrz)
    .sort((a, b) => Number(!!b.mrz?.valid) - Number(!!a.mrz?.valid) || Number(b.status === 'ACCEPTED') - Number(a.status === 'ACCEPTED') || Number(!!b.mrz) - Number(!!a.mrz));

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Text layer of the PDF documents (first pages), capped per document and in total. Images and scans
 * without a text layer give nothing here (see `documentParts`).
 */
export const documentTexts = async (docs: DocEvidence[], opts: { perDoc?: number; total?: number; maxDocs?: number } = {}) => {
  const perDoc = opts.perDoc ?? 1500;
  let left = opts.total ?? 12_000;
  const out = new Map<string, string>();
  for (const d of docs.filter((x) => x.mimeType === 'application/pdf' && x.stage !== 'CONTRACT_SIGNED').slice(0, opts.maxDocs ?? 12)) {
    if (left <= 200) break;
    const buf = await readDoc(d.storedName);
    if (!buf) continue;
    const pages = await withTimeout(pdfPageTexts(buf, 3).catch(() => [] as string[]), 8000, [] as string[]);
    const text = pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) continue;
    const cut = text.slice(0, Math.min(perDoc, left));
    out.set(d.id, cut);
    left -= cut.length;
  }
  return out;
};

/** Files for the model (images, first PDF pages) of documents that have no extracted data and no text. */
export const documentParts = async (docs: DocEvidence[], max = 3, maxBytes = 8 * 1024 * 1024) => {
  const parts: AiPart[] = [];
  const used: string[] = [];
  let bytes = 0;
  for (const d of docs) {
    if (used.length >= max) break;
    const buf = await readDoc(d.storedName);
    if (!buf) continue;
    const p = await filePart(buf, d.mimeType, d.name);
    if (!p.ok) continue;
    const size = p.parts.reduce((a, x) => a + (x.type === 'text' ? x.text.length : x.data.length), 0);
    if (bytes + size > maxBytes) continue;
    bytes += size;
    parts.push({ type: 'text', text: `File of document ${d.id} ("${d.name}"):` }, ...p.parts);
    used.push(d.id);
  }
  return { parts, used };
};

export const ageAt = (birth: Date | null, at: Date) => {
  if (!birth) return null;
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const m = at.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};
