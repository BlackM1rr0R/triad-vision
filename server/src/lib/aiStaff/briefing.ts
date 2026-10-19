import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { listExpiring } from '../expiry/index.js';
import { buildSummary } from '../settlement/summary.js';
import { aiComplete, CHEAP_MODEL } from '../ai/complete.js';
import { getAiSettings } from '../ai/settings.js';
import { monthSpentUsd } from '../ai/limits.js';
import { listRiskyCases } from './risk.js';
import { claimFlag } from './cache.js';
import { BRIEFING_TEXTS, LOCALE_NAMES } from './texts.js';

/**
 * Daily briefing e-mail for SUPER_ADMIN / ADMIN users who opted in (Setting `aiBriefing:<userId>`), sent from
 * 08:00 Asia/Baku. Numbers come from DB queries (yesterday + today); the AI only writes a 3–4 sentence intro
 * (cheap model; on failure the e-mail goes out without it). A day with nothing to report is skipped; each
 * user gets at most one briefing per Baku day (Setting flag `aiBriefingSent:<userId>:<day>`).
 */

export const BRIEFING_HOUR = 8;
const DAY = 24 * 60 * 60 * 1000;
const BAKU_OFFSET = 4 * 60 * 60 * 1000; // Asia/Baku is UTC+4 all year

export const optInKey = (userId: string) => `aiBriefing:${userId}`;
const sentKey = (userId: string, day: string) => `aiBriefingSent:${userId}:${day}`;

export const bakuDay = (now: Date) => new Date(now.getTime() + BAKU_OFFSET).toISOString().slice(0, 10);
export const bakuHour = (now: Date) => new Date(now.getTime() + BAKU_OFFSET).getUTCHours();
/** Baku midnight of `now`'s Baku day, as a UTC instant. */
const bakuMidnight = (now: Date) => new Date(Date.parse(`${bakuDay(now)}T00:00:00Z`) - BAKU_OFFSET);

export const isBriefingEnabled = async (userId: string) => {
  const row = await prisma.setting.findUnique({ where: { key: optInKey(userId) } });
  return (row?.value as { enabled?: boolean } | null)?.enabled === true;
};

export const setBriefingEnabled = async (userId: string, enabled: boolean) => {
  await prisma.setting.upsert({ where: { key: optInKey(userId) }, create: { key: optInKey(userId), value: { enabled } }, update: { value: { enabled } } });
  return enabled;
};

const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const fmtBag = (b: Partial<Record<string, number>>) =>
  Object.entries(b)
    .filter(([, v]) => !!v)
    .map(([c, v]) => `${Math.round((v ?? 0) / 100).toLocaleString('de-DE')} ${c}`)
    .join(', ');
const hhmm = (d: Date) => new Date(d.getTime() + BAKU_OFFSET).toISOString().slice(11, 16);

export interface BriefingData {
  day: string;
  newCases: { count: number; items: { number: string; client: string; visaType: string }[] };
  docsWaiting: { docs: number; cases: number };
  decisions: { approved: { number: string; client: string }[]; refused: { number: string; client: string }[] };
  appointments: { number: string; client: string; at: string; when: 'today' | 'tomorrow'; place: string | null }[];
  interviews: { candidate: string; company: string | null; at: string; when: 'today' | 'tomorrow' }[];
  expiring: { count: number; items: { client: string; document: string; daysLeft: number; case: string | null }[] };
  stuck: { count: number; high: number; items: { number: string; client: string; risk: string; severity: string }[] };
  unpaidShares: { name: string; amount: string }[];
  commissions: { count: number; amount: string };
  overdueTasks: { count: number; items: { title: string; due: string }[] };
  aiSpend: { spentUsd: number; budgetUsd: number };
}

export const buildBriefingData = async (now: Date, locale: Locale): Promise<BriefingData> => {
  const today = bakuMidnight(now);
  const since = new Date(today.getTime() - DAY);
  const tomorrow = new Date(today.getTime() + DAY);
  const until = new Date(today.getTime() + 2 * DAY);
  const when = (d: Date): 'today' | 'tomorrow' => (d < tomorrow ? 'today' : 'tomorrow');

  const [newCases, newCount, pendingDocs, decided, appts, interviews, expiring, risky, summary, commissions, tasks, taskCount, spent, settings] = await Promise.all([
    prisma.case.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 10, select: { number: true, visaType: true, client: { select: { firstName: true, lastName: true } } } }),
    prisma.case.count({ where: { createdAt: { gte: since } } }),
    prisma.document.groupBy({ by: ['caseId'], where: { status: 'PENDING', stage: { in: ['INITIAL', 'EMBASSY'] }, case: { status: { notIn: FINAL_STATUSES } } }, _count: { _all: true } }),
    prisma.case.findMany({ where: { decisionAt: { gte: since }, status: { in: ['APPROVED', 'REJECTED'] } }, take: 20, select: { number: true, status: true, client: { select: { firstName: true, lastName: true } } } }),
    prisma.case.findMany({
      where: { appointmentAt: { gte: today, lt: until }, status: { notIn: FINAL_STATUSES } },
      orderBy: { appointmentAt: 'asc' },
      take: 20,
      select: { number: true, appointmentAt: true, appointmentPlace: true, client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.interview.findMany({
      where: { startsAt: { gte: today, lt: until }, status: { in: ['PROPOSED', 'CONFIRMED'] } },
      orderBy: { startsAt: 'asc' },
      take: 20,
      select: { startsAt: true, candidate: { select: { firstName: true, lastName: true } }, company: { select: { name: true } } },
    }),
    listExpiring({ days: 30, now, locale }),
    listRiskyCases({ minSeverity: 'medium', locale, now }),
    buildSummary(),
    prisma.partnerCommission.groupBy({ by: ['currency'], where: { status: { in: ['PENDING', 'APPROVED'] } }, _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.task.findMany({ where: { status: { notIn: ['DONE', 'CANCELLED'] }, dueAt: { lt: now } }, orderBy: { dueAt: 'asc' }, take: 5, select: { title: true, dueAt: true } }),
    prisma.task.count({ where: { status: { notIn: ['DONE', 'CANCELLED'] }, dueAt: { lt: now } } }),
    monthSpentUsd(),
    getAiSettings(),
  ]);

  const commissionBag: Record<string, number> = {};
  for (const c of commissions) commissionBag[c.currency] = (commissionBag[c.currency] ?? 0) + (c._sum.amountCents ?? 0);

  return {
    day: bakuDay(now),
    newCases: { count: newCount, items: newCases.map((c) => ({ number: c.number, client: name(c.client), visaType: c.visaType })) },
    docsWaiting: { docs: pendingDocs.reduce((n, g) => n + g._count._all, 0), cases: pendingDocs.length },
    decisions: {
      approved: decided.filter((c) => c.status === 'APPROVED').map((c) => ({ number: c.number, client: name(c.client) })),
      refused: decided.filter((c) => c.status === 'REJECTED').map((c) => ({ number: c.number, client: name(c.client) })),
    },
    appointments: appts.map((c) => ({ number: c.number, client: name(c.client), at: hhmm(c.appointmentAt!), when: when(c.appointmentAt!), place: c.appointmentPlace })),
    interviews: interviews.map((i) => ({ candidate: name(i.candidate), company: i.company?.name ?? null, at: hhmm(i.startsAt), when: when(i.startsAt) })),
    expiring: { count: expiring.length, items: expiring.slice(0, 8).map((e) => ({ client: e.client.name, document: e.document, daysLeft: e.daysLeft, case: e.case?.number ?? null })) },
    stuck: {
      count: risky.length,
      high: risky.filter((r) => r.severity === 'high').length,
      items: risky.slice(0, 8).map((r) => ({ number: r.number, client: r.clientName, risk: r.risks[0].title, severity: r.severity })),
    },
    unpaidShares: summary.beneficiaries.map((b) => ({ name: b.name, amount: fmtBag(b.overall.pending) })).filter((b) => b.amount),
    commissions: { count: commissions.reduce((n, c) => n + c._count._all, 0), amount: fmtBag(commissionBag) },
    overdueTasks: { count: taskCount, items: tasks.map((t) => ({ title: t.title, due: t.dueAt!.toISOString().slice(0, 10) })) },
    aiSpend: { spentUsd: Math.round(spent * 100) / 100, budgetUsd: settings.monthlyBudgetUsd },
  };
};

/**
 * Nothing new and nothing urgent: no new cases, reviews, decisions, appointments, interviews, expiring
 * documents, stuck cases or overdue tasks. Money still owed alone is a standing state, not a reason to write.
 */
export const briefingIsEmpty = (d: BriefingData) =>
  !d.newCases.count && !d.docsWaiting.docs && !d.decisions.approved.length && !d.decisions.refused.length && !d.appointments.length && !d.interviews.length && !d.expiring.count && !d.stuck.count && !d.overdueTasks.count;

const usd = (n: number) => `$${n.toFixed(2)}`;

export const renderBriefing = (d: BriefingData, locale: Locale, intro: string | null) => {
  const tx = BRIEFING_TEXTS[locale];
  const list = <T,>(items: T[], total: number, fmt: (x: T) => string) => {
    const lines = items.map((x) => `• ${fmt(x)}`);
    if (total > items.length) lines.push(tx.more(total - items.length));
    return lines.join('\n');
  };
  const sections: string[] = [];
  if (intro) sections.push(`${tx.intro}\n${intro}`);
  if (d.newCases.count) sections.push(`${tx.newCases}: ${d.newCases.count}\n${list(d.newCases.items, d.newCases.count, (c) => `${c.number} · ${c.client} · ${c.visaType}`)}`);
  if (d.docsWaiting.docs) sections.push(tx.docsWaiting(d.docsWaiting.docs, d.docsWaiting.cases));
  const dec = [...d.decisions.approved.map((c) => `${c.number} · ${c.client} — ${tx.approved}`), ...d.decisions.refused.map((c) => `${c.number} · ${c.client} — ${tx.refused}`)];
  if (dec.length) sections.push(`${tx.decisions}: ${dec.length}\n${dec.map((x) => `• ${x}`).join('\n')}`);
  if (d.appointments.length)
    sections.push(`${tx.appointments}\n${d.appointments.map((a) => `• ${tx[a.when]} ${a.at} · ${a.number} · ${a.client}${a.place ? ` · ${a.place.slice(0, 60)}` : ''}`).join('\n')}`);
  if (d.interviews.length) sections.push(`${tx.interviews}\n${d.interviews.map((i) => `• ${tx[i.when]} ${i.at} · ${i.candidate}${i.company ? ` · ${i.company}` : ''}`).join('\n')}`);
  if (d.expiring.count) sections.push(`${tx.expiring}: ${d.expiring.count}\n${list(d.expiring.items, d.expiring.count, (e) => `${e.client} · ${e.document} · ${tx.daysLeft(e.daysLeft)}${e.case ? ` · ${e.case}` : ''}`)}`);
  if (d.stuck.count) sections.push(`${tx.stuck}: ${d.stuck.count}\n${list(d.stuck.items, d.stuck.count, (s) => `${s.severity === 'high' ? '‼ ' : ''}${s.number} · ${s.client} — ${s.risk}`)}`);
  const money: string[] = [];
  if (d.unpaidShares.length) money.push(`${tx.unpaidShares}: ${d.unpaidShares.map((s) => `${s.name} ${s.amount}`).join(' · ')}`);
  if (d.commissions.count) money.push(`${tx.commissions}: ${d.commissions.count} · ${d.commissions.amount}`);
  if (money.length) sections.push(`${tx.money}\n${money.join('\n')}`);
  if (d.overdueTasks.count) sections.push(`${tx.overdueTasks}: ${d.overdueTasks.count}\n${list(d.overdueTasks.items, d.overdueTasks.count, (t) => `${t.title} (${t.due})`)}`);
  sections.push(tx.aiSpend(usd(d.aiSpend.spentUsd), usd(d.aiSpend.budgetUsd)));
  sections.push(tx.optOut);
  return { subject: tx.subject(d.day), title: tx.title, body: sections.join('\n\n') };
};

/** Compact numbers for the AI intro (no client names: the intro talks about counts and priorities). */
const introInput = (d: BriefingData) =>
  JSON.stringify({
    newCases: d.newCases.count,
    docsWaitingForReview: d.docsWaiting.docs,
    approved: d.decisions.approved.length,
    refused: d.decisions.refused.length,
    appointmentsToday: d.appointments.filter((a) => a.when === 'today').length,
    appointmentsTomorrow: d.appointments.filter((a) => a.when === 'tomorrow').length,
    interviewsToday: d.interviews.filter((i) => i.when === 'today').length,
    expiringDocs30d: d.expiring.count,
    expiredDocs: d.expiring.items.filter((e) => e.daysLeft < 0).length,
    stuckCases: d.stuck.count,
    stuckHigh: d.stuck.high,
    topRisks: d.stuck.items.slice(0, 3).map((s) => `${s.number}: ${s.risk}`),
    overdueTasks: d.overdueTasks.count,
    unpaidShares: d.unpaidShares,
    openPartnerCommissions: d.commissions.count,
    aiSpendUsd: d.aiSpend.spentUsd,
    aiBudgetUsd: d.aiSpend.budgetUsd,
  });

export const briefingIntro = async (d: BriefingData, locale: Locale, userId: string | null) => {
  const r = await aiComplete({
    userId,
    scope: 'ADMIN',
    purpose: 'briefing',
    model: CHEAP_MODEL,
    system: `You write the opening of the daily morning briefing e-mail for the manager of Triad Vision, a visa agency (Azerbaijan → Germany). From the numbers (JSON) write 3–4 short sentences in ${LOCALE_NAMES[locale]}: what matters most today and what to do first (urgent appointments, stuck cases, reviews, expiring documents). Plain text, no greeting, no list, no markdown, no invented facts.`,
    input: introInput(d),
    maxTokens: 300,
    timeoutMs: 20_000,
  });
  return r.ok && r.text ? r.text.replace(/\s+/g, ' ').trim().slice(0, 900) : null;
};

export interface BriefingRecipient {
  id: string;
  email: string;
  locale: Locale;
}

/**
 * Builds and sends one briefing. `test`: send now even when empty or already sent today (the super admin's
 * "send me a test briefing" button); otherwise skipped when empty and claimed once per Baku day.
 */
export const sendBriefing = async (
  user: BriefingRecipient,
  opts: { now?: Date; test?: boolean; cache?: Map<string, { data: BriefingData; intro: string | null }> } = {},
): Promise<{ sent: boolean; reason?: 'EMPTY' | 'ALREADY_SENT'; intro: boolean }> => {
  const now = opts.now ?? new Date();
  const key = sentKey(user.id, bakuDay(now));
  // Already handled today (sent, or found empty): nothing is built again, so the hourly job costs nothing.
  if (!opts.test && (await prisma.setting.findUnique({ where: { key } }))) return { sent: false, reason: 'ALREADY_SENT', intro: false };
  let entry = opts.cache?.get(user.locale);
  if (!entry) {
    const data = await buildBriefingData(now, user.locale);
    const intro = briefingIsEmpty(data) && !opts.test ? null : await briefingIntro(data, user.locale, user.id);
    entry = { data, intro };
    opts.cache?.set(user.locale, entry);
  }
  if (briefingIsEmpty(entry.data) && !opts.test) {
    await claimFlag(key, { empty: true, at: now.toISOString() });
    return { sent: false, reason: 'EMPTY', intro: false };
  }
  if (!opts.test && !(await claimFlag(key, { at: now.toISOString() }))) return { sent: false, reason: 'ALREADY_SENT', intro: false };
  const { subject, title, body } = renderBriefing(entry.data, user.locale, entry.intro);
  await sendMail(user.email, `Triad Vision · ${subject}`, renderEmail(title, body, { label: BRIEFING_TEXTS[user.locale].cta, url: `${config.clientUrl}/admin` }));
  return { sent: true, intro: !!entry.intro };
};

/** Recipients: active ADMIN / SUPER_ADMIN users with the opt-in flag. */
export const briefingRecipients = async (): Promise<BriefingRecipient[]> => {
  const flags = await prisma.setting.findMany({ where: { key: { startsWith: 'aiBriefing:' } } });
  const ids = flags.filter((f) => (f.value as { enabled?: boolean } | null)?.enabled === true).map((f) => f.key.slice('aiBriefing:'.length));
  if (!ids.length) return [];
  return prisma.user.findMany({ where: { id: { in: ids }, isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, email: true, locale: true } });
};

/** Hourly job body: from 08:00 Baku time, one briefing per opted-in admin per day (data and intro built once per language). */
export const runBriefingJob = async (now = new Date()) => {
  if (bakuHour(now) < BRIEFING_HOUR) return 0;
  const users = await briefingRecipients();
  const cache = new Map<string, { data: BriefingData; intro: string | null }>();
  let sent = 0;
  for (const u of users) {
    try {
      if ((await sendBriefing(u, { now, cache })).sent) sent++;
    } catch (err) {
      console.error('[job:ai-briefing] failed for', u.id, err);
    }
  }
  return sent;
};
