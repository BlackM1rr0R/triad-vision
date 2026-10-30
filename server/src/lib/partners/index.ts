import type { CaseStatus, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { buildXlsxBook } from '../xlsx.js';
import { syncCaseFolder } from '../drive/caseFolders.js';
import { maskWith, type MaskGroup } from '../privacy/mask.js';
import { profileRows } from './profile.js'; // second sheet: the partner's profile
import { listFieldDefs } from './fieldDefs.js';
import { effectiveStage, emptyStageCounts, isRefused, processingSummaries, PROCESSING_SELECT, type StageCounts } from '../caseProcessing/index.js';

/**
 * Referral partners — middlemen (Ilqar, Ənvər, …) who bring visa clients. Each case can name the
 * partner who brought it; the shared drive keeps a folder per partner with the clients inside, and
 * the partner's Excel list is used to settle commissions.
 */

export interface PartnerCounts {
  clients: number;
  activeCases: number;
  approved: number;
  closedNegative: number; // rejected or cancelled
  /** Visa refused: CaseStatus REJECTED or marked "Ablehnung" by the team (lib/caseProcessing). */
  rejected: number;
  cancelled: number;
  /** Team document workflow: cases per stage (In Bearbeitung / Schon geschrieben / Fertig / Ablehnung). */
  stages: StageCounts;
  lastCaseAt: Date | null;
}

const emptyCounts = (): PartnerCounts => ({ clients: 0, activeCases: 0, approved: 0, closedNegative: 0, rejected: 0, cancelled: 0, stages: emptyStageCounts(), lastCaseAt: null });

/** Visa kind of a case for filters and counts: its visa category when it has one, else the visa type. */
export const visaKeyOf = (c: { visaType: VisaType; visaCategoryId?: string | null }) => (c.visaCategoryId ? `cat:${c.visaCategoryId}` : `type:${c.visaType}`);

/** Per-partner counters (distinct clients, active / approved / refused / cancelled cases, workflow stages, newest case). */
export const partnerCounts = async (partnerIds: string[]) => {
  const out = new Map<string, PartnerCounts>(partnerIds.map((id) => [id, emptyCounts()]));
  if (!partnerIds.length) return out;
  const cases = await prisma.case.findMany({
    where: { partnerId: { in: partnerIds } },
    select: { partnerId: true, clientId: true, status: true, processingStage: true, createdAt: true },
  });
  const clients = new Map<string, Set<string>>();
  for (const c of cases) {
    const k = out.get(c.partnerId!)!;
    if (!clients.has(c.partnerId!)) clients.set(c.partnerId!, new Set());
    clients.get(c.partnerId!)!.add(c.clientId);
    const refused = isRefused(c);
    if (refused) k.rejected++;
    if (!FINAL_STATUSES.includes(c.status)) {
      if (!refused) k.activeCases++;
    } else if (c.status === 'APPROVED') k.approved++;
    else {
      k.closedNegative++;
      if (c.status === 'CANCELLED') k.cancelled++;
    }
    const stage = effectiveStage(c.processingStage, c.status);
    if (stage) k.stages[stage]++;
    if (!k.lastCaseAt || c.createdAt > k.lastCaseAt) k.lastCaseAt = c.createdAt;
  }
  for (const [id, set] of clients) out.get(id)!.clients = set.size;
  return out;
};

/** The partner's cases as shown on the detail page and in the Excel list. */
export const partnerCases = (partnerId: string) =>
  prisma.case.findMany({
    where: { partnerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      visaType: true,
      visaCategoryId: true,
      createdAt: true,
      decisionAt: true,
      ...PROCESSING_SELECT,
      client: { select: { id: true, firstName: true, lastName: true, phone: true, passportNumber: true } },
      visaCategory: { select: { title: true, visaLabel: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
    },
  });

/** The partner's cases for the admin detail page: + visa key, refused flag and the workflow summary. */
export const partnerCaseRows = async (partnerId: string) => {
  const rows = await partnerCases(partnerId);
  const summaries = await processingSummaries(rows);
  return rows.map(({ processingStage: _s, processingStageAt: _a, processingStageById: _b, processingAssigneeId: _c, ...c }, i) => ({
    ...c,
    visaKey: visaKeyOf(c),
    refused: isRefused(rows[i]!),
    processing: summaries.get(c.id) ?? null,
  }));
};

/** Re-syncs the drive folders of these cases a few at a time, in the background (never throws). */
export const syncFoldersLater = (caseIds: string[]) => {
  if (!caseIds.length) return;
  void (async () => {
    for (let i = 0; i < caseIds.length; i += 5) {
      await Promise.all(caseIds.slice(i, i + 5).map((id) => syncCaseFolder(id).catch(() => {})));
    }
  })().catch(() => {});
};

const STATUS_AZ: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Sənədlər gözlənilir',
  DOCUMENTS_REVIEW: 'Sənədlər yoxlanılır',
  CONTRACT_SENT: 'Müqavilə göndərilib',
  CONTRACT_SIGNED: 'Müqavilə imzalanıb',
  EMBASSY_DOCUMENTS: 'Səfirlik sənədləri gözlənilir',
  EMBASSY_REVIEW: 'Səfirlik sənədləri yoxlanılır',
  APPOINTMENT_SCHEDULED: 'Səfirlik görüşü təyin olunub',
  DECISION_PENDING: 'Qərar gözlənilir',
  APPROVED: 'Viza verilib',
  REJECTED: 'İmtina',
  CANCELLED: 'Ləğv edilib',
};

const TYPE_AZ: Record<VisaType, string> = {
  WORK: 'İş vizası',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'İş axtarışı',
  STUDY: 'Təhsil vizası',
  FAMILY: 'Ailə birləşməsi',
  TOURIST: 'Turist vizası',
};

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const az = (v: unknown) => (v && typeof v === 'object' ? ((v as Record<string, string>).az ?? '') : '');

export const PARTNER_EXPORT_HEADERS = [
  '№',
  'Müraciət №',
  'Ad',
  'Soyad',
  'Pasport №',
  'Telefon',
  'Müraciət növü',
  'Viza kateqoriyası',
  'Status',
  'Məsul əməkdaş',
  'Yaradılma tarixi',
  'Qərar tarixi',
];

/**
 * The partner's client list as an .xlsx workbook (for settling accounts), with the partner's profile
 * (contacts, company, custom fields; bank data only with `canSeeBank`) on a second sheet.
 */
export const buildPartnerWorkbook = async (partner: { id: string; name: string }, mask: Set<MaskGroup> = new Set(), opts: { canSeeBank?: boolean } = {}) => {
  const [cases, record, defs] = await Promise.all([partnerCases(partner.id), prisma.referralPartner.findUnique({ where: { id: partner.id } }), listFieldDefs()]);
  const rows = cases.map((c, i) => [
    i + 1,
    c.number,
    c.client.firstName,
    c.client.lastName,
    maskWith(mask, 'passportNumber', c.client.passportNumber) ?? '',
    c.client.phone ?? '',
    TYPE_AZ[c.visaType] ?? c.visaType,
    c.visaCategory ? `${az(c.visaCategory.title)} (${c.visaCategory.visaLabel})` : '',
    STATUS_AZ[c.status] ?? c.status,
    c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}` : '',
    day(c.createdAt),
    day(c.decisionAt),
  ]);
  // Excel sheet names: max 31 chars, no []:*?/\
  const sheet = partner.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Partnyor';
  return buildXlsxBook([
    { name: sheet, headers: PARTNER_EXPORT_HEADERS, rows, widths: [5, 14, 16, 18, 14, 16, 18, 26, 26, 22, 14, 14] },
    ...(record ? [{ name: 'Profil', headers: ['Sahə', 'Dəyər'], rows: profileRows(record, defs, { mask, canSeeBank: !!opts.canSeeBank }), widths: [26, 60] }] : []),
  ]);
};
