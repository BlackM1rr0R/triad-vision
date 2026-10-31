import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { ContractKind, PartnerContract, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { clientDocFilter, decodeOriginalName, verifyUploadedFile } from '../../middleware/upload.js';
import { INLINE_MIME, resolveMime } from '../fileCheck.js';
import { renderContract } from '../contracts/render.js';
import { asContractLang, companyValues, fmtContractDate, triadParty, triadValues, type ContractLang } from '../contracts/values.js';
import { renderContractPdf } from '../contracts/pdf.js';
import { loadOwner, ownerData, ownerOfRow, ownerShape, ownerWhere, type Owner } from './owner.js';

/**
 * Contracts with an employer (Company) or a referral partner (ReferralPartner): uploaded (contract file + signed
 * copy, private storage) or generated from a ContractTemplate of kind EMPLOYER / PARTNER through the shared
 * template renderer and contract PDF (lib/contracts/*).
 *
 * Status: DRAFT → SENT → ACTIVE (signed and started) → EXPIRED (after the end date) unless autoRenew, which
 * extends the term by its own length; TERMINATED is manual and final. The daily job (jobs/partnerContracts.ts)
 * applies that lifecycle and reminds the responsible staff `reminderDays` before the end date — or before the
 * notice deadline (end date − noticePeriodDays) when a notice period is set.
 */

export const CONTRACT_KINDS = ['COOPERATION', 'PERSONNEL', 'COMMISSION', 'FRAMEWORK', 'NDA', 'OTHER'] as const;
export const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'ACTIVE', 'EXPIRED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
/** Scanned signed copies can be large: at least 20 MB, more when the general upload limit is higher. */
export const MAX_CONTRACT_FILE = Math.max(config.uploads.maxFileSize, 20 * MB);
export const contractsDir = () => path.join(config.uploads.privateDir, 'partner-contracts');

// ─── Days ───────────────────────────────────────────────────────────────

/** "2026-11-01" (a real calendar day) or null. */
export const parseDay = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};
export const dayToDate = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : v === null ? null : undefined);
export const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** Today in Baku (UTC+4) as a UTC-midnight date, comparable with @db.Date columns. */
export const todayOf = (now = new Date()) => new Date(`${new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00.000Z`);
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

const addMonths = (d: Date, months: number) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
};

/**
 * The next term after `end`: same length as the current one (whole months when the term is in months, e.g.
 * 01.01.–31.12. → next 01.01.–31.12.; else in days); one year when there is no start date.
 */
export const nextTerm = (start: Date | null, end: Date): [Date, Date] => {
  const from = new Date(end.getTime() + DAY);
  if (start && start < from) {
    const months = (from.getUTCFullYear() - start.getUTCFullYear()) * 12 + (from.getUTCMonth() - start.getUTCMonth());
    if (from.getUTCDate() === start.getUTCDate() && months > 0) return [from, new Date(addMonths(from, months).getTime() - DAY)];
    return [from, new Date(from.getTime() + (from.getTime() - start.getTime()) - DAY)];
  }
  return [from, new Date(addMonths(from, 12).getTime() - DAY)];
};

// ─── Input ──────────────────────────────────────────────────────────────

const day = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v == null || parseDay(v) !== null, 'INVALID_DATE');

export const contractFields = {
  title: z.string().trim().min(2).max(200),
  kind: z.enum(CONTRACT_KINDS),
  status: z.enum(CONTRACT_STATUSES),
  startDate: day,
  endDate: day,
  signedAt: day,
  autoRenew: z.boolean(),
  noticePeriodDays: z.number().int().min(0).max(3650).nullable(),
  reminderDays: z.number().int().min(0).max(365),
  valueCents: z.number().int().min(0).max(2_000_000_000).nullable(),
  currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{3}$/.test(v), 'INVALID_CURRENCY'),
  note: z.string().trim().max(5000).nullable(),
};

export const contractCreateSchema = z.object({
  ...ownerShape,
  title: contractFields.title,
  kind: contractFields.kind.default('COOPERATION'),
  status: z.enum(['DRAFT', 'SENT', 'ACTIVE', 'TERMINATED']).default('DRAFT'),
  startDate: contractFields.startDate,
  endDate: contractFields.endDate,
  signedAt: contractFields.signedAt,
  autoRenew: contractFields.autoRenew.default(false),
  noticePeriodDays: contractFields.noticePeriodDays.optional(),
  reminderDays: contractFields.reminderDays.default(30),
  valueCents: contractFields.valueCents.optional(),
  currency: contractFields.currency.default('EUR'),
  note: contractFields.note.optional(),
});

export const contractUpdateSchema = z.object({
  title: contractFields.title.optional(),
  kind: contractFields.kind.optional(),
  status: contractFields.status.optional(),
  startDate: contractFields.startDate,
  endDate: contractFields.endDate,
  signedAt: contractFields.signedAt,
  autoRenew: contractFields.autoRenew.optional(),
  noticePeriodDays: contractFields.noticePeriodDays.optional(),
  reminderDays: contractFields.reminderDays.optional(),
  valueCents: contractFields.valueCents.optional(),
  currency: contractFields.currency.optional(),
  note: contractFields.note.optional(),
});

type ContractInput = Partial<z.infer<typeof contractUpdateSchema>>;

/** Prisma data of a create / update (days → dates); 400 CONTRACT_DATES_INVALID when the end is before the start. */
export const contractData = (body: ContractInput, current: PartnerContract | null) => {
  const { startDate, endDate, signedAt, ...rest } = body;
  const start = startDate !== undefined ? dayToDate(startDate) : current?.startDate;
  const end = endDate !== undefined ? dayToDate(endDate) : current?.endDate;
  if (start && end && end < start) throw badRequest('CONTRACT_DATES_INVALID');
  const data: Prisma.PartnerContractUncheckedUpdateInput = { ...rest };
  if (startDate !== undefined) data.startDate = dayToDate(startDate);
  if (endDate !== undefined) data.endDate = dayToDate(endDate);
  if (signedAt !== undefined) data.signedAt = dayToDate(signedAt);
  // A new end date, notice period or reminder lead time arms the reminder again.
  if (
    current &&
    ((endDate !== undefined && dayOf(current.endDate) !== (endDate ?? null)) ||
      (body.noticePeriodDays !== undefined && body.noticePeriodDays !== current.noticePeriodDays) ||
      (body.reminderDays !== undefined && body.reminderDays !== current.reminderDays))
  )
    data.reminderSentAt = null;
  return data;
};

// ─── View ───────────────────────────────────────────────────────────────

export const noticeDeadlineOf = (c: Pick<PartnerContract, 'endDate' | 'noticePeriodDays'>) =>
  c.endDate && c.noticePeriodDays ? new Date(c.endDate.getTime() - c.noticePeriodDays * DAY) : null;

/** What the UI gets: days as "YYYY-MM-DD", file flags instead of storage paths, days left to the end / notice deadline. */
export const contractView = (c: PartnerContract, now = new Date()) => {
  const today = todayOf(now);
  const notice = noticeDeadlineOf(c);
  const { filePath, signedFilePath, ...rest } = c;
  return {
    ...rest,
    startDate: dayOf(c.startDate),
    endDate: dayOf(c.endDate),
    signedAt: dayOf(c.signedAt),
    hasFile: !!filePath,
    hasSignedFile: !!signedFilePath,
    daysLeft: c.endDate ? daysBetween(today, c.endDate) : null,
    noticeDeadline: dayOf(notice),
    noticeDaysLeft: notice ? daysBetween(today, notice) : null,
  };
};
export type ContractView = ReturnType<typeof contractView>;

export const loadContract = async (id: string) => {
  const c = await prisma.partnerContract.findUnique({ where: { id } });
  if (!c) throw notFound('CONTRACT_NOT_FOUND');
  return c;
};

export const listContracts = async (owner: Owner) => {
  await loadOwner(owner);
  await applyLifecycle(await prisma.partnerContract.findMany({ where: { ...ownerWhere(owner), status: { in: ['DRAFT', 'SENT', 'ACTIVE'] } } }));
  return prisma.partnerContract.findMany({ where: ownerWhere(owner), orderBy: [{ endDate: 'asc' }, { createdAt: 'desc' }] });
};

/** The contract that counts for the profile header: active first (soonest end), else the latest one. */
export const currentContract = (rows: PartnerContract[]) =>
  rows.filter((r) => r.status === 'ACTIVE').sort((a, b) => (a.endDate?.getTime() ?? Infinity) - (b.endDate?.getTime() ?? Infinity))[0] ?? null;

// ─── Lifecycle ──────────────────────────────────────────────────────────

export type LifecycleEvent = 'ACTIVATED' | 'RENEWED' | 'EXPIRED';

/** The change the lifecycle makes to a contract today (null = none). Pure, unit-testable. */
export const lifecyclePatch = (c: Pick<PartnerContract, 'status' | 'signedAt' | 'startDate' | 'endDate' | 'autoRenew'>, now = new Date()) => {
  if (c.status === 'TERMINATED' || c.status === 'EXPIRED') return null;
  const today = todayOf(now);
  const data: Prisma.PartnerContractUncheckedUpdateInput = {};
  const events: LifecycleEvent[] = [];
  let status = c.status;
  if ((status === 'DRAFT' || status === 'SENT') && c.signedAt && (!c.startDate || c.startDate <= today)) {
    status = 'ACTIVE';
    data.status = 'ACTIVE';
    events.push('ACTIVATED');
  }
  if (status === 'ACTIVE' && c.endDate && c.endDate < today) {
    if (c.autoRenew) {
      let start = c.startDate;
      let end = c.endDate;
      for (let i = 0; i < 100 && end < today; i++) [start, end] = nextTerm(start, end);
      data.startDate = start;
      data.endDate = end;
      data.reminderSentAt = null;
      events.push('RENEWED');
    } else {
      data.status = 'EXPIRED';
      events.push('EXPIRED');
    }
  }
  return events.length ? { data, events } : null;
};

const systemAudit = (action: string, target: string, details: Prisma.InputJsonValue) =>
  prisma.auditLog.create({ data: { actorId: null, action, target, details, ip: null } }).catch((err) => console.error('[partnerContracts] audit failed', err));

/** Applies the lifecycle to the given rows (guarded against concurrent changes); returns the counts per event. */
export const applyLifecycle = async (rows: PartnerContract[], now = new Date()) => {
  const counts: Record<LifecycleEvent, number> = { ACTIVATED: 0, RENEWED: 0, EXPIRED: 0 };
  for (const c of rows) {
    const p = lifecyclePatch(c, now);
    if (!p) continue;
    const done = await prisma.partnerContract.updateMany({ where: { id: c.id, status: c.status, endDate: c.endDate }, data: p.data as Prisma.PartnerContractUncheckedUpdateManyInput });
    if (!done.count) continue;
    for (const e of p.events) counts[e]++;
    const owner = ownerOfRow(c);
    await systemAudit(`PARTNER_CONTRACT_${p.events[p.events.length - 1]}`, owner.companyId ? `company:${owner.companyId}` : `partner:${owner.referralPartnerId}`, {
      contractId: c.id,
      title: c.title,
      events: p.events,
      ...(p.data.endDate ? { changes: { endDate: { from: dayOf(c.endDate), to: dayOf(p.data.endDate as Date) } } } : {}),
      ...(p.data.status ? { status: { from: c.status, to: p.data.status as string } } : {}),
    });
  }
  return counts;
};

// ─── Files ──────────────────────────────────────────────────────────────

const randomName = (original: string) => {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
};

/** PDF, Word, JPEG / PNG / WebP (HEIC photos become JPEG); stored outside the public folder. */
export const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => fs.mkdir(contractsDir(), { recursive: true }, (err) => cb(err ?? null, contractsDir())),
    filename: (_req, file, cb) => cb(null, randomName(file.originalname)),
  }),
  limits: { fileSize: MAX_CONTRACT_FILE, files: 1 },
  fileFilter: clientDocFilter,
});

const storedFile = (key: string) => path.join(contractsDir(), path.basename(key));
export const removeStored = (key: string | null | undefined) => (key ? fsp.unlink(storedFile(key)).catch(() => undefined) : Promise.resolve());

export type FileSlot = 'file' | 'signed';

/** Checks the bytes and attaches the upload to the contract (the replaced file is removed). The signed copy sets signedAt. */
export const attachUpload = async (c: PartnerContract, slot: FileSlot, file: Express.Multer.File) => {
  await verifyUploadedFile(file);
  const name = decodeOriginalName(file.originalname).slice(0, 255);
  const data: Prisma.PartnerContractUncheckedUpdateInput =
    slot === 'file'
      ? { fileName: name, filePath: file.filename, mimeType: file.mimetype, sizeBytes: file.size }
      : { signedFileName: name, signedFilePath: file.filename, ...(c.signedAt ? {} : { signedAt: todayOf() }) };
  const updated = await prisma.partnerContract.update({ where: { id: c.id }, data });
  await removeStored(slot === 'file' ? c.filePath : c.signedFilePath);
  await applyLifecycle([updated]);
  return prisma.partnerContract.findUniqueOrThrow({ where: { id: c.id } });
};

/** Stores generated / signed bytes (PDF) for the contract. */
export const writeContractPdf = async (pdf: Buffer, fileName: string) => {
  await fsp.mkdir(contractsDir(), { recursive: true });
  const key = randomName(`${fileName}.pdf`);
  await fsp.writeFile(storedFile(key), pdf);
  return key;
};

export const detachFile = async (c: PartnerContract, slot: FileSlot) => {
  const data: Prisma.PartnerContractUncheckedUpdateInput =
    slot === 'file' ? { fileName: null, filePath: null, mimeType: null, sizeBytes: null } : { signedFileName: null, signedFilePath: null };
  const updated = await prisma.partnerContract.update({ where: { id: c.id }, data });
  await removeStored(slot === 'file' ? c.filePath : c.signedFilePath);
  return updated;
};

export const sendContractFile = (res: Response, c: PartnerContract, slot: FileSlot, download: boolean) => {
  const key = slot === 'file' ? c.filePath : c.signedFilePath;
  const name = (slot === 'file' ? c.fileName : c.signedFileName) ?? 'contract.pdf';
  if (!key) throw notFound('FILE_NOT_FOUND');
  const mime = (slot === 'file' ? c.mimeType : null) ?? resolveMime('', name) ?? 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${download || !INLINE_MIME.has(mime) ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(storedFile(key), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'FILE_NOT_FOUND' });
  });
};

// ─── Generation from a template ─────────────────────────────────────────

/** Template kind per owner type. */
export const templateKindFor = (owner: Owner): ContractKind => (owner.companyId ? 'EMPLOYER' : 'PARTNER');

export interface MissingField {
  /** placeholder key, e.g. "company.betriebsnummer" */
  key: string;
  /** company | partner | contract | triad | … */
  group: string;
  /** column / form field to fill (Company / ReferralPartner column, contract field, "settings.legal"), null if none */
  field: string | null;
}

const COMPANY_FIELD: Record<string, string> = {
  'company.name': 'name',
  'company.address': 'street',
  'company.contactPerson': 'contactName',
  'company.signatoryName': 'signatoryName',
};
const PARTNER_FIELD: Record<string, string> = {
  'partner.name': 'name',
  'partner.address': 'street',
  'partner.commission': 'commissionCents',
  'partner.contactPerson': 'contactPerson',
};
const CONTRACT_FIELD: Record<string, string> = {
  'contract.title': 'title',
  'contract.startDate': 'startDate',
  'contract.endDate': 'endDate',
  'contract.value': 'valueCents',
  'contract.noticePeriodDays': 'noticePeriodDays',
};

const fieldOf = (key: string): string | null => {
  const [group, name] = key.split('.');
  if (group === 'company') return COMPANY_FIELD[key] ?? name ?? null;
  if (group === 'partner') return PARTNER_FIELD[key] ?? name ?? null;
  if (group === 'contract') return CONTRACT_FIELD[key] ?? null;
  if (group === 'triad') return 'settings.legal';
  return null;
};

const fmtMoney = (cents: number | null | undefined, currency: string, lang: ContractLang) =>
  typeof cents === 'number'
    ? new Intl.NumberFormat({ de: 'de-DE', en: 'en-GB', az: 'az-Latn-AZ', ru: 'ru-RU' }[lang], { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
    : '';

/** Placeholder values of the owner (company.* or partner.*) plus its name and the default signer. */
export const ownerValues = async (owner: Owner, lang: ContractLang) => {
  if (owner.companyId) {
    const co = await prisma.company.findUnique({
      where: { id: owner.companyId },
      include: {
        users: { where: { isActive: true, role: 'COMPANY' }, orderBy: { createdAt: 'asc' }, take: 1, select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } },
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    });
    if (!co) throw notFound('COMPANY_NOT_FOUND');
    const primary = co.contacts[0];
    const login = co.users[0];
    const contact = co.contactName?.trim() || (primary ? `${primary.firstName} ${primary.lastName ?? ''}`.trim() : '') || (login ? `${login.firstName} ${login.lastName}`.trim() : '');
    const values = companyValues(co, contact);
    const signerName = co.signatoryName?.trim() || co.managingDirector?.trim() || contact || co.name;
    const signerEmail = (primary?.email || login?.email || co.email || '').toLowerCase() || null;
    return { values, name: values['company.name'], signer: signerEmail ? { name: signerName, email: signerEmail, userId: login && login.email.toLowerCase() === signerEmail ? login.id : null, locale: login?.locale ?? 'de' } : null, lang };
  }
  const p = await prisma.referralPartner.findUnique({ where: { id: owner.referralPartnerId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } });
  if (!p) throw notFound('PARTNER_NOT_FOUND');
  const primary = p.contacts[0];
  const name = [p.companyName?.trim() || p.name, p.legalForm && !(p.companyName ?? p.name).includes(p.legalForm) ? p.legalForm : ''].filter(Boolean).join(' ');
  const contact = p.contactPerson?.trim() || (primary ? `${primary.firstName} ${primary.lastName ?? ''}`.trim() : '');
  const street = p.street?.trim() ?? '';
  const address = street ? [street, [p.postalCode?.trim(), p.city?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ') : [p.address?.trim(), p.city?.trim()].filter(Boolean).join(', ');
  const values: Record<string, string> = {
    'partner.name': name,
    'partner.legalForm': p.legalForm ?? '',
    'partner.address': address,
    'partner.street': street,
    'partner.postalCode': p.postalCode ?? '',
    'partner.city': p.city ?? '',
    'partner.country': p.country ?? '',
    'partner.registerNumber': p.registerNumber ?? '',
    'partner.registerCourt': p.registerCourt ?? '',
    'partner.vatId': p.vatId ?? '',
    'partner.taxId': p.taxId ?? '',
    'partner.betriebsnummer': p.betriebsnummer ?? '',
    'partner.signatoryName': p.signatoryName?.trim() || contact || (p.partnerType === 'INDIVIDUAL' ? p.name : ''),
    'partner.signatoryRole': p.signatoryRole ?? '',
    'partner.contactPerson': contact,
    'partner.email': p.email ?? '',
    'partner.phone': p.phone ?? '',
    'partner.commission': fmtMoney(p.commissionCents, p.currency, lang),
  };
  const signerEmail = (primary?.email || p.email || '').toLowerCase() || null;
  return { values, name, signer: signerEmail ? { name: values['partner.signatoryName'] || name, email: signerEmail, userId: null, locale: (p.preferredLanguage === 'az' || p.preferredLanguage === 'en' || p.preferredLanguage === 'ru' ? p.preferredLanguage : 'de') as 'de' | 'az' | 'en' | 'ru' } : null, lang };
};

export const generateSchema = z.object({
  ...ownerShape,
  templateId: z.string().trim().min(1).max(40),
  /** Regenerate the file of an existing contract instead of creating a new one. */
  contractId: z.string().trim().min(1).max(40).optional(),
  /** Generate even though placeholders are empty (they render as "________"). */
  allowMissing: z.boolean().default(false),
  title: contractFields.title.optional(),
  kind: contractFields.kind.default('COOPERATION'),
  startDate: contractFields.startDate,
  endDate: contractFields.endDate,
  autoRenew: contractFields.autoRenew.default(false),
  noticePeriodDays: contractFields.noticePeriodDays.optional(),
  reminderDays: contractFields.reminderDays.default(30),
  valueCents: contractFields.valueCents.optional(),
  currency: contractFields.currency.default('EUR'),
  note: contractFields.note.optional(),
});
export type GenerateInput = z.infer<typeof generateSchema>;

const loadPartyTemplate = async (owner: Owner, templateId: string) => {
  const t = await prisma.contractTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  if (t.kind !== templateKindFor(owner)) throw badRequest('TEMPLATE_KIND_MISMATCH');
  return t;
};

interface ContractTerms {
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  valueCents?: number | null;
  currency?: string | null;
  noticePeriodDays?: number | null;
}

const contractTermValues = (c: ContractTerms, lang: ContractLang): Record<string, string> => ({
  'contract.title': c.title ?? '',
  'contract.startDate': c.startDate ? fmtContractDate(`${c.startDate}T00:00:00Z`, lang) : '',
  'contract.endDate': c.endDate ? fmtContractDate(`${c.endDate}T00:00:00Z`, lang) : '',
  'contract.value': fmtMoney(c.valueCents, c.currency ?? 'EUR', lang),
  'contract.noticePeriodDays': c.noticePeriodDays != null ? String(c.noticePeriodDays) : '',
});

/**
 * Renders a template for the owner. `terms` null = only the owner / Triad data is checked (the template picker:
 * contract.* placeholders are filled from the form later and not reported).
 */
export const renderForOwner = async (owner: Owner, templateId: string, terms: ContractTerms | null, staff: { firstName: string; lastName: string } | null, now = new Date()) => {
  const t = await loadPartyTemplate(owner, templateId);
  const lang = asContractLang(t.language);
  const [party, triad] = await Promise.all([ownerValues(owner, lang), triadParty()]);
  const values: Record<string, string> = {
    ...party.values,
    ...triadValues(triad),
    ...contractTermValues(terms ?? {}, lang),
    'staff.fullName': staff ? `${staff.firstName} ${staff.lastName}`.trim() : '',
    today: fmtContractDate(now, lang),
  };
  const rendered = renderContract(t.body, values);
  const missing: MissingField[] = rendered.missing
    .filter((key) => terms !== null || !key.startsWith('contract.'))
    .map((key) => ({ key, group: key.includes('.') ? key.split('.')[0] : key, field: fieldOf(key) }));
  return { t, lang, party, triad, rendered, missing };
};

/** Active templates of the owner's kind with what is still missing for each (template picker). */
export const templatesForOwner = async (owner: Owner) => {
  await loadOwner(owner);
  const rows = await prisma.contractTemplate.findMany({ where: { kind: templateKindFor(owner), active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  const out = [];
  for (const t of rows) {
    const { missing } = await renderForOwner(owner, t.id, null, null);
    out.push({ id: t.id, name: t.name, kind: t.kind, language: t.language, isDefault: t.isDefault, missing });
  }
  return out;
};

const safeBase = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'Vertrag';

export type GenerateResult = { ok: true; contract: PartnerContract; missing: MissingField[]; unknown: string[] } | { ok: false; missing: MissingField[] };

/**
 * Generates the contract PDF from a template and stores it as the contract file (new contract, or `contractId`
 * regenerated). Empty placeholders stop it with the list ({ ok: false }) unless `allowMissing`.
 */
export const generateContract = async (owner: Owner, input: GenerateInput, actor: { id: string; firstName: string; lastName: string }): Promise<GenerateResult> => {
  const existing = input.contractId ? await loadContract(input.contractId) : null;
  if (existing) {
    const o = ownerOfRow(existing);
    if (o.companyId !== owner.companyId || o.referralPartnerId !== owner.referralPartnerId) throw notFound('CONTRACT_NOT_FOUND');
  }
  const tpl = await prisma.contractTemplate.findUnique({ where: { id: input.templateId }, select: { name: true, active: true } });
  if (!tpl) throw notFound('TEMPLATE_NOT_FOUND');
  if (!tpl.active) throw badRequest('TEMPLATE_INACTIVE');
  const title = input.title ?? existing?.title ?? tpl.name;
  const terms: ContractTerms = {
    title,
    startDate: input.startDate !== undefined ? input.startDate : dayOf(existing?.startDate),
    endDate: input.endDate !== undefined ? input.endDate : dayOf(existing?.endDate),
    valueCents: input.valueCents !== undefined ? input.valueCents : existing?.valueCents,
    currency: input.currency ?? existing?.currency,
    noticePeriodDays: input.noticePeriodDays !== undefined ? input.noticePeriodDays : existing?.noticePeriodDays,
  };
  const { t, lang, party, triad, rendered, missing } = await renderForOwner(owner, input.templateId, terms, actor);
  if (missing.length && !input.allowMissing) return { ok: false, missing };
  const pdf = await renderContractPdf({ title, text: rendered.text, kind: t.kind, language: lang, parties: [triad.name, party.name] });
  const fileName = `${safeBase(title)}-${safeBase(party.name)}.pdf`;
  const key = await writeContractPdf(pdf, safeBase(title));
  const file = { fileName, filePath: key, mimeType: 'application/pdf', sizeBytes: pdf.length, templateId: t.id };
  let contract: PartnerContract;
  if (existing) {
    contract = await prisma.partnerContract.update({
      where: { id: existing.id },
      data: { ...contractData({ title, startDate: terms.startDate, endDate: terms.endDate, valueCents: terms.valueCents ?? null, currency: terms.currency ?? 'EUR', noticePeriodDays: terms.noticePeriodDays ?? null }, existing), ...file },
    });
    await removeStored(existing.filePath);
  } else {
    contract = await prisma.partnerContract.create({
      data: {
        ...ownerData(owner),
        ...(contractData({ startDate: terms.startDate, endDate: terms.endDate }, null) as object),
        title,
        kind: input.kind,
        status: 'DRAFT',
        autoRenew: input.autoRenew,
        noticePeriodDays: input.noticePeriodDays ?? null,
        reminderDays: input.reminderDays,
        valueCents: input.valueCents ?? null,
        currency: input.currency,
        note: input.note ?? null,
        createdById: actor.id,
        ...file,
      } as Prisma.PartnerContractUncheckedCreateInput,
    });
  }
  return { ok: true, contract, missing, unknown: rendered.unknown };
};

/** Days → dates for a create (owner + body). */
export const createData = (owner: Owner, body: z.infer<typeof contractCreateSchema>, createdById: string): Prisma.PartnerContractUncheckedCreateInput => {
  const { companyId: _c, referralPartnerId: _r, startDate, endDate, signedAt, ...rest } = body;
  void _c;
  void _r;
  const start = dayToDate(startDate) ?? null;
  const end = dayToDate(endDate) ?? null;
  if (start && end && end < start) throw badRequest('CONTRACT_DATES_INVALID');
  return { ...ownerData(owner), ...rest, noticePeriodDays: rest.noticePeriodDays ?? null, valueCents: rest.valueCents ?? null, note: rest.note ?? null, startDate: start, endDate: end, signedAt: dayToDate(signedAt) ?? null, createdById };
};
