import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { loadCaseContext } from '../ai/features/caseAi/data.js';
import { mapVidex } from '../ai/features/caseAi/videx.js';
import type { ContractResult } from '../ai/features/caseAi/contract.js';
import { employerRevealedFor } from '../caseContracts/employerVisibility.js';
import { buildCvPdf, cvProfileSelect } from '../cv/load.js';
import { asciiName } from '../cv/pdf.js';
import { emptyCv, readCv } from '../cv/schema.js';
import { prefillCv } from '../cv/prefill.js';
import { renderLetterPdf } from '../cv/letterPdf.js';
import { fillTemplate } from '../coverLetters/fill.js';
import { listCoverTemplates } from '../coverLetters/index.js';
import { buildCoverValues, jobTypeOf, type CoverListing } from '../coverLetters/values.js';
import { ensureCaseFolder } from '../drive/caseFolders.js';
import { nodeLiteSelect } from '../drive/access.js';
import { createFileIn } from '../drive/files.js';
import { maskJson, type MaskGroup } from '../privacy/mask.js';
import { missingRequired, renderVidexSheet, videxSheetFileName, videxSheetRows } from './videxSheet.js';
import { TEMPLATES_FOLDER_NAME, type SheetLang } from './texts.js';

/**
 * Prefilled document templates of a case ("Hazır sənəd şablonları"), generated on demand from the profile and
 * case data (nothing is stored unless staff attach a copy to the client's drive folder):
 *   videx        VIDEX preparation sheet — every field of the embassy's online form with the prefilled answer
 *                (deterministic mapping of lib/ai/features/caseAi/videx.ts, no AI call), missing ones highlighted
 *   lebenslauf   German tabular CV (lib/cv: the CV builder data, else built from the profile + experience fields)
 *   anschreiben  generic cover letter for the case's profession / vacancy (cover-letter templates of the external
 *                applications, lib/coverLetters)
 * The client never sees the employer before it is revealed (lib/caseContracts/employerVisibility); staff do.
 * Lebenslauf and Anschreiben belong to the account holder, so they are not offered on a family member's case.
 */

export const DOC_TEMPLATE_KINDS = ['videx', 'lebenslauf', 'anschreiben'] as const;
export type DocTemplateKind = (typeof DOC_TEMPLATE_KINDS)[number];
export type Audience = 'client' | 'staff';

export interface TemplateCase {
  id: string;
  number: string;
  status: Prisma.CaseGetPayload<object>['status'];
  visaType: Prisma.CaseGetPayload<object>['visaType'];
  clientId: string;
  profession: string;
  familyMember: boolean;
  company: { name: string; legalForm: string | null; city: string | null } | null;
  vacancy: { title: unknown; city: string | null } | null;
  client: { firstName: string; lastName: string };
}

const caseSelect = {
  id: true,
  number: true,
  status: true,
  visaType: true,
  clientId: true,
  profession: true,
  familyProfile: { select: { id: true } },
  company: { select: { name: true, legalForm: true, city: true } },
  vacancy: { select: { title: true, city: true } },
  client: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CaseSelect;

/** The case (for the client: only their own one — anything else is "not found"). */
export const loadTemplateCase = async (caseId: string, ownerId?: string): Promise<TemplateCase> => {
  const c = await prisma.case.findFirst({ where: { id: caseId, ...(ownerId ? { clientId: ownerId } : {}) }, select: caseSelect });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const { familyProfile, ...rest } = c;
  return { ...rest, familyMember: !!familyProfile };
};

export const kindAvailable = (c: Pick<TemplateCase, 'familyMember'>, kind: DocTemplateKind) => kind === 'videx' || !c.familyMember;

const l10nDe = (v: unknown) => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['de', 'en', 'az']) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
  }
  return '';
};

// ─── VIDEX ──────────────────────────────────────────────────────────────

const videxRows = async (c: TemplateCase, audience: Audience, lang: SheetLang) => {
  const [ctx, lastContract, revealed] = await Promise.all([
    loadCaseContext(c.id),
    prisma.caseAiRun.findFirst({ where: { caseId: c.id, kind: 'CONTRACT' }, orderBy: { createdAt: 'desc' }, select: { result: true } }),
    audience === 'staff' ? Promise.resolve(true) : employerRevealedFor(c.id),
  ]);
  const terms = lastContract ? ((lastContract.result as unknown as ContractResult).terms ?? null) : null;
  return { rows: videxSheetRows(mapVidex(ctx, terms), { lang, employerRevealed: revealed }), name: `${ctx.client.firstName} ${ctx.client.lastName}`.trim() };
};

// ─── Anschreiben ───────────────────────────────────────────────────────

const coverInput = async (c: TemplateCase, audience: Audience) => {
  const user = await prisma.user.findUnique({ where: { id: c.clientId }, select: cvProfileSelect });
  if (!user) throw notFound('CLIENT_NOT_FOUND');
  const row = await prisma.candidateCv.findUnique({ where: { userId: c.clientId }, select: { data: true } });
  const cv = row ? readCv(row.data) : prefillCv(emptyCv(), user).data;
  const revealed = audience === 'staff' || (await employerRevealedFor(c.id));
  const company = revealed && c.company ? `${c.company.name}${c.company.legalForm && !c.company.name.includes(c.company.legalForm) ? ` ${c.company.legalForm}` : ''}` : null;
  const listing: CoverListing = {
    title: l10nDe(c.vacancy?.title) || c.profession,
    company,
    location: c.vacancy?.city ?? (revealed ? c.company?.city : null) ?? null,
    jobType: c.visaType === 'AUSBILDUNG' ? 'ausbildung' : 'job',
    profession: c.profession,
  };
  return { user, cv, listing, company };
};

export const draftAnschreiben = async (c: TemplateCase, audience: Audience, now = new Date()) => {
  const { user, cv, listing, company } = await coverInput(c, audience);
  const type = jobTypeOf(listing);
  const t = (await listCoverTemplates()).find((x) => x.jobType === type)!;
  const values = buildCoverValues({ person: { ...user }, cv, listing, now });
  const subject = fillTemplate(t.subject, values);
  const body = fillTemplate(t.body, values);
  // "firma" / "ort" are expected to be empty while the employer is not known to the client: not "missing".
  const missing = [...new Set([...subject.missing, ...body.missing])].filter((k) => company || (k !== 'firma' && k !== 'ort'));
  return { jobType: type, subject: subject.text, body: body.text, missing, user, listing };
};

// ─── Status + PDFs ─────────────────────────────────────────────────────

export interface TemplateStatus {
  kind: DocTemplateKind;
  available: boolean;
  /** Required answers / placeholders still missing. */
  missing: string[];
  /** lebenslauf: built from the CV builder ('cv') or from the profile fields only ('profile'). */
  source?: 'cv' | 'profile';
}

export const templateStatus = async (c: TemplateCase, audience: Audience): Promise<TemplateStatus[]> => {
  const out: TemplateStatus[] = [];
  const videx = await videxRows(c, audience, 'az');
  out.push({ kind: 'videx', available: true, missing: missingRequired(videx.rows) });
  if (!c.familyMember) {
    const cv = await prisma.candidateCv.findUnique({ where: { userId: c.clientId }, select: { id: true } });
    out.push({ kind: 'lebenslauf', available: true, missing: [], source: cv ? 'cv' : 'profile' });
    const a = await draftAnschreiben(c, audience);
    out.push({ kind: 'anschreiben', available: true, missing: a.missing });
  } else {
    out.push({ kind: 'lebenslauf', available: false, missing: [] }, { kind: 'anschreiben', available: false, missing: [] });
  }
  return out;
};

export interface BuildOpts {
  audience: Audience;
  lang: SheetLang;
  /** Staff: the viewer's masking groups (the same as their JSON views; lib/privacy). */
  maskGroups?: Set<MaskGroup>;
  now?: Date;
}

export const buildTemplatePdf = async (c: TemplateCase, kind: DocTemplateKind, opts: BuildOpts): Promise<{ pdf: Buffer; filename: string }> => {
  if (!kindAvailable(c, kind)) throw conflict('TEMPLATE_NOT_AVAILABLE');
  const now = opts.now ?? new Date();
  if (kind === 'videx') {
    const { rows, name } = await videxRows(c, opts.audience, opts.lang);
    // { key: 'passportNumber', value } rows are masked like the VIDEX fields of the staff views.
    const shown = opts.maskGroups?.size ? (maskJson(opts.maskGroups, rows) as typeof rows) : rows;
    const pdf = await renderVidexSheet(shown, { lang: opts.lang, caseNumber: c.number, clientName: name, date: now });
    return { pdf, filename: videxSheetFileName(c.number, opts.lang) };
  }
  if (kind === 'lebenslauf') {
    // German tabular Lebenslauf: the CV builder data, or (never opened) the profile + experience fields.
    const out = await buildCvPdf(c.clientId, { template: 'lebenslauf', lang: 'de', photo: true });
    if (!out) throw notFound('CLIENT_NOT_FOUND');
    return { pdf: out.pdf, filename: out.filename };
  }
  const a = await draftAnschreiben(c, opts.audience, now);
  const u = a.user;
  const recipient = [a.listing.company?.trim(), a.listing.location?.trim()].filter((l): l is string => !!l);
  const pdf = await renderLetterPdf({
    language: 'de',
    sender: { name: `${u.firstName} ${u.lastName}`.trim(), address: u.address, city: u.city, phone: u.phone, email: u.email },
    recipient: recipient.length ? recipient : ['Personalabteilung'],
    title: a.subject,
    body: a.body,
    date: now,
    longDate: true,
  });
  const filename = `Anschreiben_${asciiName(u.lastName || u.firstName).replace(/[^A-Za-z0-9-]+/g, '-') || 'Bewerbung'}.pdf`;
  return { pdf, filename };
};

// ─── Attach (staff) ────────────────────────────────────────────────────

/** "<client folder>/Sənəd şablonları" (created when missing); null when the case has no drive folder. */
const templatesFolder = async (caseId: string) => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) return null;
  const existing = await prisma.driveNode.findFirst({
    where: { parentId: folderId, kind: 'FOLDER', deletedAt: null, name: TEMPLATES_FOLDER_NAME },
    select: nodeLiteSelect,
    orderBy: { createdAt: 'asc' },
  });
  return existing ?? prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: TEMPLATES_FOLDER_NAME, parentId: folderId }, select: nodeLiteSelect });
};

/** Saves the generated PDF into the client's drive folder (a new file each time) + an internal case event. */
export const attachTemplate = async (c: TemplateCase, kind: DocTemplateKind, actorId: string, opts: BuildOpts) => {
  const { pdf, filename } = await buildTemplatePdf(c, kind, { ...opts, audience: 'staff' });
  const folder = await templatesFolder(c.id);
  if (!folder) throw conflict('NO_DRIVE_FOLDER');
  const node = await createFileIn(folder, filename, pdf, 'application/pdf', actorId);
  await prisma.caseEvent
    .create({ data: { caseId: c.id, type: 'DOC_TEMPLATE_ATTACHED', actorId, note: `${TEMPLATES_FOLDER_NAME}/${filename}`.slice(0, 2000), visibleToClient: false } })
    .catch(() => undefined);
  return { nodeId: node.id, name: filename };
};
