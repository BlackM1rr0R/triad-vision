import type { CaseStatus, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { buildXlsx } from '../xlsx.js';
import { syncCaseFolder } from '../drive/caseFolders.js';
import { maskWith, type MaskGroup } from '../privacy/mask.js';

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
  lastCaseAt: Date | null;
}

const emptyCounts = (): PartnerCounts => ({ clients: 0, activeCases: 0, approved: 0, closedNegative: 0, lastCaseAt: null });

/** Per-partner counters (distinct clients, active / approved / rejected+cancelled cases, newest case). */
export const partnerCounts = async (partnerIds: string[]) => {
  const out = new Map<string, PartnerCounts>(partnerIds.map((id) => [id, emptyCounts()]));
  if (!partnerIds.length) return out;
  const cases = await prisma.case.findMany({
    where: { partnerId: { in: partnerIds } },
    select: { partnerId: true, clientId: true, status: true, createdAt: true },
  });
  const clients = new Map<string, Set<string>>();
  for (const c of cases) {
    const k = out.get(c.partnerId!)!;
    if (!clients.has(c.partnerId!)) clients.set(c.partnerId!, new Set());
    clients.get(c.partnerId!)!.add(c.clientId);
    if (!FINAL_STATUSES.includes(c.status)) k.activeCases++;
    else if (c.status === 'APPROVED') k.approved++;
    else k.closedNegative++;
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
      status: true,
      createdAt: true,
      decisionAt: true,
      client: { select: { id: true, firstName: true, lastName: true, phone: true, passportNumber: true } },
      visaCategory: { select: { title: true, visaLabel: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
    },
  });

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

/** The partner's client list as an .xlsx workbook (for settling accounts). */
export const buildPartnerWorkbook = async (partner: { id: string; name: string }, mask: Set<MaskGroup> = new Set()) => {
  const cases = await partnerCases(partner.id);
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
  return buildXlsx(sheet, PARTNER_EXPORT_HEADERS, rows, [5, 14, 16, 18, 14, 16, 18, 26, 26, 22, 14, 14]);
};
