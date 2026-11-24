import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { brandSync } from '../brand/index.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { emailDomain, parseDeliveryReport, smtpRejectKind, type ReportPart, type ReportResult } from './dsn.js';
import { adjustHealth, effectiveDailyLimit, readHealth, type SendHealth, type SendStats } from './health.js';

/**
 * E-mail deliverability (Admin → E-poçt göndərişi): bounce / complaint reports found in the agency mailbox (workspace
 * mail sync → lib/deliverability/inbound.ts) and SMTP rejects while sending become EmailBounce rows; hard bounces and
 * complaints put the address on EmailSuppression, which the automatic senders (external auto-send, campaigns) respect.
 * The external auto-send daily limit follows the bounce / failure rate (health.ts). Every function here never throws.
 */

export const EMPLOYER_CATEGORY = 'EMPLOYER_APPLICATION';
export const CAMPAIGN_CATEGORY = 'CAMPAIGN';
export const HEALTH_KEY = 'externalAutoSendHealth';

const addrOf = (s: string) => (/[^\s<>"]+@[^\s<>"]+/.exec(s)?.[0] ?? '').toLowerCase();

/** Our own domains (brand, From, SMTP sender, support / admin addresses): never a bounced recipient. */
export const ownDomains = (): string[] => {
  const b = brandSync();
  const list = [b.domain, emailDomain(addrOf(b.emailFrom)), emailDomain(addrOf(config.smtp.from)), emailDomain(b.supportEmail), emailDomain(config.adminNotifyEmail)];
  return Array.from(new Set(list.map((d) => (d ?? '').toLowerCase()).filter(Boolean)));
};

/** The domain we send from (From address of the brand). */
export const sendingDomain = () => emailDomain(addrOf(brandSync().emailFrom)) || emailDomain(addrOf(config.smtp.from)) || brandSync().domain;

const normal = (address: string) => address.trim().toLowerCase().slice(0, 190);

export const isSuppressed = async (address: string | null | undefined) => {
  if (!address) return false;
  try {
    return !!(await prisma.emailSuppression.findUnique({ where: { address: normal(address) }, select: { id: true } }));
  } catch (err) {
    console.error('[deliverability] suppression check failed', err);
    return false;
  }
};

/** Suppressed addresses among the given ones (lower case). */
export const suppressedAmong = async (addresses: string[]) => {
  const list = Array.from(new Set(addresses.filter(Boolean).map(normal)));
  if (!list.length) return new Set<string>();
  const rows = await prisma.emailSuppression.findMany({ where: { address: { in: list } }, select: { address: true } });
  return new Set(rows.map((r) => r.address));
};

const suppress = async (address: string, reason: 'HARD_BOUNCE' | 'COMPLAINT', detail: string | null) => {
  const a = normal(address);
  await prisma.emailSuppression.upsert({
    where: { address: a },
    create: { address: a, reason, detail: detail?.slice(0, 500) ?? null },
    // A complaint outranks a bounce; a staff entry (MANUAL) stays as it is.
    update: reason === 'COMPLAINT' ? { reason, detail: detail?.slice(0, 500) ?? null } : {},
  });
};

/** Stores one parsed report. Returns the number of new bounce rows (0 = already known from another mailbox). */
export const recordReport = async (report: ReportResult, reportMessageId: string | null, source: 'DSN' | 'ARF' | 'SMTP') => {
  if (isImpersonating()) return 0;
  try {
    let created = 0;
    let hard = false;
    const rows =
      report.type === 'BOUNCE'
        ? report.recipients.map((r) => ({ address: normal(r.address), kind: r.kind, status: r.status, diagnostic: r.diagnostic?.slice(0, 500) ?? null, suppress: r.suppress }))
        : report.recipients.map((r) => ({ address: normal(r.address), kind: 'COMPLAINT', status: r.feedbackType, diagnostic: null, suppress: true }));
    for (const r of rows) {
      try {
        await prisma.emailBounce.create({
          data: { address: r.address, kind: r.kind, status: r.status, diagnostic: r.diagnostic, source, reportMessageId: reportMessageId?.slice(0, 500) ?? null, originalMessageId: report.originalMessageId?.slice(0, 500) ?? null },
        });
        created++;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // same report seen in another mailbox
        throw err;
      }
      if (r.kind === 'HARD') hard = true;
      if (r.suppress && (r.kind === 'HARD' || r.kind === 'COMPLAINT')) await suppress(r.address, r.kind === 'COMPLAINT' ? 'COMPLAINT' : 'HARD_BOUNCE', [r.status, r.diagnostic].filter(Boolean).join(' · ') || null);
    }
    if (hard) await refreshSendHealth();
    return created;
  } catch (err) {
    console.error('[deliverability] report not stored', err);
    return 0;
  }
};

/** Called by the mailer when the SMTP server refused a recipient while sending. */
export const recordSmtpReject = async (to: string, responseCode: number | undefined, message: string) => {
  try {
    if (smtpRejectKind(responseCode, message) !== 'HARD') return;
    const status = /\b5\.\d{1,3}\.\d{1,3}\b/.exec(message)?.[0] ?? (responseCode ? `${responseCode}` : null);
    await recordReport({ type: 'BOUNCE', recipients: [{ address: to, kind: 'HARD', status, diagnostic: message.slice(0, 500), suppress: true }], originalMessageId: null }, null, 'SMTP');
  } catch (err) {
    console.error('[deliverability] smtp reject not stored', err);
  }
};

/** Inbound mail (bounce / ARF?) → stored. Returns true when the mail was a delivery report (handled here). */
export const handleInboundReport = async (m: { rfcMessageId: string | null; fromAddr: string | null; subject: string | null; text: string | null; contentType: string | null; parts: ReportPart[] }) => {
  const report = parseDeliveryReport({ fromAddr: m.fromAddr, subject: m.subject, contentType: m.contentType, text: m.text, parts: m.parts, ownDomains: ownDomains() });
  if (!report) return false;
  await recordReport(report, m.rfcMessageId, report.type === 'COMPLAINT' ? 'ARF' : 'DSN');
  return true;
};

// ─── Automatic limit of the external auto-send ─────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

/** Employer e-mails of the last 7 days: sent, refused while sending, hard bounces reported back. */
export const employerSendStats = async (now = new Date()): Promise<SendStats> => {
  const since = new Date(now.getTime() - 7 * DAY);
  const [sent, failures, logs] = await Promise.all([
    prisma.emailLog.count({ where: { category: EMPLOYER_CATEGORY, status: { in: ['SENT', 'CONSOLE'] }, createdAt: { gte: since } } }),
    prisma.emailLog.count({ where: { category: EMPLOYER_CATEGORY, status: 'FAILED', createdAt: { gte: since } } }),
    prisma.emailLog.findMany({ where: { category: EMPLOYER_CATEGORY, createdAt: { gte: new Date(since.getTime() - 3 * DAY) } }, select: { to: true, messageId: true }, take: 5000 }),
  ]);
  const addresses = Array.from(new Set(logs.map((l) => l.to.toLowerCase())));
  const ids = logs.map((l) => l.messageId).filter((v): v is string => !!v);
  const hardBounces = addresses.length || ids.length
    ? await prisma.emailBounce.count({
        where: {
          kind: 'HARD',
          source: { not: 'SMTP' }, // SMTP rejects are already counted as failures
          createdAt: { gte: since },
          OR: [...(addresses.length ? [{ address: { in: addresses } }] : []), ...(ids.length ? [{ originalMessageId: { in: ids } }] : [])],
        },
      })
    : 0;
  return { sent, failures, hardBounces };
};

export const getSendHealth = async (): Promise<SendHealth> => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: HEALTH_KEY } });
    return readHealth(row?.value);
  } catch {
    return readHealth(null);
  }
};

/** Re-evaluates the factor (scheduler + after a hard bounce). Never throws. */
export const refreshSendHealth = async (now = new Date()): Promise<SendHealth> => {
  try {
    const before = await getSendHealth();
    const next = adjustHealth(before, await employerSendStats(now), now);
    const value = next as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({ where: { key: HEALTH_KEY }, create: { key: HEALTH_KEY, value }, update: { value } });
    if (next.factor !== before.factor) console.log(`[deliverability] auto-send limit factor ${before.factor} → ${next.factor}`);
    return next;
  } catch (err) {
    console.error('[deliverability] health not updated', err);
    return getSendHealth();
  }
};

/** Daily limit actually applied to the automatic sending. */
export const effectiveLimit = async (dailyLimit: number) => effectiveDailyLimit(dailyLimit, (await getSendHealth()).factor);

/** Staff "reset to full limit" (Admin → E-poçt göndərişi). */
export const resetSendHealth = async () => {
  const value = { factor: 1, changedAt: new Date().toISOString(), reason: null, last: (await getSendHealth()).last } as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: HEALTH_KEY }, create: { key: HEALTH_KEY, value }, update: { value } });
};
