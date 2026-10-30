import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * DSGVO storage limitation for website leads (Inquiry). A lead that was never converted into a
 * client / employer and is closed (DONE / ARCHIVED) is anonymised once its last activity (the latest
 * of created / assigned) is older than the configured period (Setting `inquiryRetention`, default
 * 24 months). The row stays for statistics (kind, sector, workers, status, score, source, dates),
 * the personal data goes: name, e-mail, phone, message, company name, UTM, visitor id, quiz result,
 * cost estimate and the team's notes.
 *
 * The same anonymisation backs the privacy tools (Admin → Privacy requests: export / erase by e-mail)
 * and the account deletion (lib/userDeletion.ts).
 */

export const INQUIRY_RETENTION_KEY = 'inquiryRetention';
/** Result of the last daily run (written by the job, read by Admin → Settings). */
export const INQUIRY_RETENTION_RUN_KEY = 'inquiryRetentionRun';
export const INQUIRY_RETENTION_DEFAULTS = { months: 24 };

export const inquiryRetentionSchema = z.object({
  months: z.number().int().min(1).max(120),
});
export type InquiryRetentionSettings = z.infer<typeof inquiryRetentionSchema>;

export const getInquiryRetentionSettings = async (): Promise<InquiryRetentionSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: INQUIRY_RETENTION_KEY } });
  const parsed = inquiryRetentionSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...INQUIRY_RETENTION_DEFAULTS };
};

/** Placeholder stored in place of the name (contactName is required). */
export const ANONYMIZED_NAME = '—';
/** email is a required column: a per-row, undeliverable placeholder (RFC 2606 `.invalid`). */
export const anonymizedEmail = (id: string) => `anonymized-${id}@anonymized.invalid`;

const anonymizedData = (id: string, now: Date): Prisma.InquiryUpdateInput => ({
  contactName: ANONYMIZED_NAME,
  email: anonymizedEmail(id),
  phone: null,
  message: '',
  companyName: null,
  utm: Prisma.DbNull,
  visitorId: null,
  quizResult: Prisma.DbNull,
  estimate: Prisma.DbNull,
  scoreReasons: Prisma.DbNull,
  staffNotes: null,
  anonymizedAt: now,
});

/** Anonymises the given inquiries (already anonymised rows are skipped); returns how many changed. */
export const anonymizeInquiries = async (ids: string[], now = new Date(), tx: Prisma.TransactionClient = prisma) => {
  let count = 0;
  for (const id of ids) {
    const r = await tx.inquiry.updateMany({ where: { id, anonymizedAt: null }, data: anonymizedData(id, now) as Prisma.InquiryUpdateManyMutationInput });
    count += r.count;
  }
  return count;
};

/** Inquiries that belong to an e-mail address (case-insensitive; MySQL default collation) or a converted account. */
export const inquiriesOfWhere = (email: string, userId?: string | null): Prisma.InquiryWhereInput => ({
  anonymizedAt: null,
  OR: [{ email: email.trim().toLowerCase() }, ...(userId ? [{ convertedUserId: userId }] : [])],
});

/** Art. 15 export of a person's inquiries (no staff notes, no scoring internals). */
export const exportInquiries = async (email: string, userId?: string | null) =>
  prisma.inquiry.findMany({
    where: inquiriesOfWhere(email, userId),
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      companyName: true,
      contactName: true,
      email: true,
      phone: true,
      sector: true,
      workersNeeded: true,
      message: true,
      locale: true,
      source: true,
      status: true,
      createdAt: true,
      quizResult: true,
      estimate: true,
      utm: true,
    },
  });

/** Art. 17 erase by e-mail: anonymises every inquiry of the address / account. */
export const eraseInquiries = async (email: string, userId?: string | null, tx: Prisma.TransactionClient = prisma) => {
  const rows = await tx.inquiry.findMany({ where: inquiriesOfWhere(email, userId), select: { id: true } });
  return anonymizeInquiries(
    rows.map((r) => r.id),
    new Date(),
    tx,
  );
};

/** `now` minus whole calendar months (end-of-month safe). */
const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
};

/** Not converted, closed, not anonymised, and no activity since the cutoff. */
export const inquiryRetentionWhere = (cutoff: Date): Prisma.InquiryWhereInput => ({
  anonymizedAt: null,
  convertedAt: null,
  convertedUserId: null,
  convertedCompanyId: null,
  status: { in: ['DONE', 'ARCHIVED'] },
  createdAt: { lt: cutoff },
  OR: [{ assignedAt: null }, { assignedAt: { lt: cutoff } }],
});

const BATCH = 500;

export interface InquiryRetentionRun {
  at: string;
  months: number;
  cutoff: string;
  anonymized: number;
  failed: number;
}

export const runInquiryRetention = async (now = new Date()): Promise<InquiryRetentionRun> => {
  const { months } = await getInquiryRetentionSettings();
  const cutoff = monthsBefore(now, months);
  const due = await prisma.inquiry.findMany({ where: inquiryRetentionWhere(cutoff), select: { id: true }, orderBy: { createdAt: 'asc' }, take: BATCH });
  let anonymized = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      anonymized += await anonymizeInquiries([id], now);
    } catch (err) {
      failed++;
      console.error(`[inquiry-retention] inquiry ${id} failed`, err);
    }
  }
  const run: InquiryRetentionRun = { at: now.toISOString(), months, cutoff: cutoff.toISOString(), anonymized, failed };
  await prisma.setting.upsert({
    where: { key: INQUIRY_RETENTION_RUN_KEY },
    create: { key: INQUIRY_RETENTION_RUN_KEY, value: run as unknown as Prisma.InputJsonValue },
    update: { value: run as unknown as Prisma.InputJsonValue },
  });
  if (anonymized > 0 || failed > 0) {
    await prisma.auditLog.create({ data: { action: 'INQUIRY_RETENTION_ANONYMIZED', target: 'inquiries', details: run as unknown as Prisma.InputJsonValue } });
  }
  return run;
};

/** For Admin → Settings: the rule, what is due and the last run. */
export const inquiryRetentionStatus = async (now = new Date()) => {
  const settings = await getInquiryRetentionSettings();
  const cutoff = monthsBefore(now, settings.months);
  const [due, anonymizedTotal, lastRow] = await Promise.all([
    prisma.inquiry.count({ where: inquiryRetentionWhere(cutoff) }),
    prisma.inquiry.count({ where: { anonymizedAt: { not: null } } }),
    prisma.setting.findUnique({ where: { key: INQUIRY_RETENTION_RUN_KEY } }),
  ]);
  return { settings, cutoff, due, anonymizedTotal, lastRun: (lastRow?.value as InquiryRetentionRun | undefined) ?? null };
};
