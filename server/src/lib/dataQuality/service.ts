import type { Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { scoped } from '../accessAudit/scope.js';
import { loadFormData, missingFields } from '../docsIntel/forms.js';
import { expiryCounts, missingRequired, qualityScore, stagesDue } from './score.js';

/**
 * Data-quality panel: every active case with what is missing — profile fields the VIDEX summary needs
 * (missingFields from lib/docsIntel/forms.ts), required documents of the current stage, expired / expiring
 * documents, passport expiry — and a 0–100 score (lib/dataQuality/score.ts). Worst first.
 */

export interface DataQualityFilter {
  staffId?: string; // 'none' = unassigned
  visaType?: VisaType;
  maxScore?: number;
  /** Staff case scope of the viewer (lib/access caseScopeWhere); missing / {} = every case. */
  scope?: Prisma.CaseWhereInput;
}

const MAX_CASES = 500;
const EMPLOYER_VISAS = new Set<string>(['WORK', 'AUSBILDUNG']);

/** Runs `fn` over `items` with at most `n` in flight. */
const mapLimit = async <T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) => {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
};

export const dataQualityList = async (f: DataQualityFilter, now = new Date()) => {
  let where: Prisma.CaseWhereInput = { status: { notIn: FINAL_STATUSES } };
  if (f.visaType) where.visaType = f.visaType;
  if (f.staffId === 'none') where.assignedStaffId = null;
  else if (f.staffId) where.assignedStaffId = f.staffId;
  where = scoped(where, f.scope);
  const [rows, total] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: MAX_CASES,
      select: {
        id: true,
        number: true,
        status: true,
        visaType: true,
        updatedAt: true,
        assignedStaff: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { id: true, firstName: true, lastName: true, passportExpiry: true } },
        requirements: { select: { required: true, stage: true, documents: { select: { status: true } } } },
        documents: { where: { status: { not: 'REJECTED' }, expiresAt: { not: null } }, select: { expiresAt: true } },
      },
    }),
    prisma.case.count({ where }),
  ]);

  const items = await mapLimit(rows, 8, async (c) => {
    const form = await loadFormData(c.id, now).catch(() => null);
    let profile = form ? missingFields('videx-summary', form) : [];
    profile = profile.filter((k) => k !== 'passportExpiry' && (k !== 'company' || EMPLOYER_VISAS.has(c.visaType)));
    const passportExpiry = c.client.passportExpiry ?? (form?.mrz?.valid && form.mrz.expiryDate ? new Date(form.mrz.expiryDate) : null);
    const exp = expiryCounts(c.documents.map((d) => d.expiresAt), now);
    const missingDocs = missingRequired(c.requirements, stagesDue(c.status));
    const q = qualityScore({ missingProfile: profile, missingDocs, expiredDocs: exp.expired, expiringDocs: exp.expiring, passportExpiry }, now);
    return {
      caseId: c.id,
      number: c.number,
      status: c.status,
      visaType: c.visaType,
      client: { id: c.client.id, name: `${c.client.firstName} ${c.client.lastName}`.trim() },
      staff: c.assignedStaff ? { id: c.assignedStaff.id, name: `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() } : null,
      score: q.score,
      grade: q.grade,
      issues: q.issues,
      missingProfile: profile,
      missingDocs,
      expiredDocs: exp.expired,
      expiringDocs: exp.expiring,
      passportExpiry,
      updatedAt: c.updatedAt,
    };
  });
  const filtered = items.filter((i) => f.maxScore === undefined || i.score <= f.maxScore).sort((a, b) => a.score - b.score || a.number.localeCompare(b.number));
  const avg = items.length ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length) : null;
  return {
    items: filtered,
    total,
    truncated: total > rows.length,
    summary: { average: avg, poor: items.filter((i) => i.grade === 'poor').length, fair: items.filter((i) => i.grade === 'fair').length, good: items.filter((i) => i.grade === 'good').length },
  };
};
