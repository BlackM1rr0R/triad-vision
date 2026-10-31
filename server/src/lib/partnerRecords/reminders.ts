import type { Locale, PartnerContract } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { applyLifecycle, dayOf, noticeDeadlineOf, todayOf } from './contracts.js';
import { loadOwner, ownerLink, ownerOfRow } from './owner.js';

/**
 * Daily partner-contract run (jobs/partnerContracts.ts): lifecycle (signed + started → ACTIVE, past the end →
 * EXPIRED or renewed by autoRenew) and one reminder per term `reminderDays` before the end date — or before the
 * notice deadline (end date − noticePeriodDays) when a notice period is set, since that is the last day to act.
 * The reminder goes to the staff member who created the contract (if still an active staff login), else to the
 * admins; `reminderSentAt` marks it sent (a new end date / renewal re-arms it).
 */

const DAY = 24 * 60 * 60 * 1000;

/** When the reminder for this contract is due (null = none / already sent). */
export const reminderDue = (c: Pick<PartnerContract, 'status' | 'endDate' | 'noticePeriodDays' | 'reminderDays' | 'reminderSentAt'>) => {
  if (c.status !== 'ACTIVE' || !c.endDate || c.reminderSentAt) return null;
  const notice = noticeDeadlineOf(c);
  const deadline = notice ?? c.endDate;
  return { deadline, kind: notice ? ('NOTICE' as const) : ('END' as const), remindFrom: new Date(deadline.getTime() - c.reminderDays * DAY) };
};

const TEXT: Record<Locale, { title: (t: string) => string; end: (owner: string, day: string, n: number) => string; notice: (owner: string, day: string, n: number, end: string) => string }> = {
  az: {
    title: (t) => `Müqavilə bitir: ${t}`,
    end: (o, d, n) => `${o} ilə müqavilə ${d} tarixində bitir (${n} gün qalıb).`,
    notice: (o, d, n, e) => `${o} ilə müqavilənin ləğvi üçün son tarix ${d} (${n} gün qalıb); müqavilə ${e} tarixində bitir.`,
  },
  de: {
    title: (t) => `Vertrag läuft aus: ${t}`,
    end: (o, d, n) => `Der Vertrag mit ${o} endet am ${d} (noch ${n} Tage).`,
    notice: (o, d, n, e) => `Kündigungsfrist für den Vertrag mit ${o}: ${d} (noch ${n} Tage); Vertragsende ${e}.`,
  },
  en: {
    title: (t) => `Contract ending: ${t}`,
    end: (o, d, n) => `The contract with ${o} ends on ${d} (${n} days left).`,
    notice: (o, d, n, e) => `Notice deadline for the contract with ${o}: ${d} (${n} days left); the contract ends on ${e}.`,
  },
  ru: {
    title: (t) => `Договор истекает: ${t}`,
    end: (o, d, n) => `Договор с ${o} заканчивается ${d} (осталось ${n} дн.).`,
    notice: (o, d, n, e) => `Срок уведомления о расторжении договора с ${o}: ${d} (осталось ${n} дн.); договор заканчивается ${e}.`,
  },
};

const dmy = (d: Date) => (dayOf(d) ?? '').split('-').reverse().join('.');

/** Sends the reminder of one contract to the responsible staff (creator) or the admins. */
export const sendContractReminder = async (c: PartnerContract, now = new Date()) => {
  const due = reminderDue(c);
  if (!due) return false;
  const claimed = await prisma.partnerContract.updateMany({ where: { id: c.id, reminderSentAt: null }, data: { reminderSentAt: now } });
  if (!claimed.count) return false;
  const owner = ownerOfRow(c);
  const { name } = await loadOwner(owner).catch(() => ({ name: '—' }));
  const left = Math.max(0, Math.round((due.deadline.getTime() - todayOf(now).getTime()) / DAY));
  const link = ownerLink(owner, 'contracts');
  const text = (l: Locale) => (due.kind === 'NOTICE' ? TEXT[l].notice(name, dmy(due.deadline), left, dmy(c.endDate!)) : TEXT[l].end(name, dmy(due.deadline), left));
  const creator = c.createdById
    ? await prisma.user.findFirst({ where: { id: c.createdById, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } })
    : null;
  if (creator) await notifyUser(creator.id, { type: 'PARTNER_CONTRACT_EXPIRING', title: TEXT[creator.locale].title(c.title), body: text(creator.locale), link });
  else await notifyStaff(TEXT.az.title(c.title), text('az'), { link, type: 'PARTNER_CONTRACT_EXPIRING' });
  return true;
};

export const runPartnerContractJob = async (now = new Date()) => {
  const open = await prisma.partnerContract.findMany({ where: { status: { in: ['DRAFT', 'SENT', 'ACTIVE'] } } });
  const lifecycle = await applyLifecycle(open, now);
  const today = todayOf(now);
  const active = await prisma.partnerContract.findMany({ where: { status: 'ACTIVE', reminderSentAt: null, endDate: { not: null } } });
  let reminders = 0;
  for (const c of active) {
    const due = reminderDue(c);
    if (due && due.remindFrom <= today && (await sendContractReminder(c, now))) reminders++;
  }
  return { activated: lifecycle.ACTIVATED, renewed: lifecycle.RENEWED, expired: lifecycle.EXPIRED, reminders };
};
