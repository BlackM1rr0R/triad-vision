import crypto from 'node:crypto';
import type { CaseStatus, Locale } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { formatDateTime, notifyUser } from '../notifications.js';
import { formatMoney } from '../agents/texts.js';
import { PARTNER_TEXT } from './texts.js';

/**
 * Notifications for referral partners with a portal login (in-app + e-mail in their language).
 * Every function here is fire-and-forget safe: errors are logged, never thrown.
 */

const clientName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/**
 * Called from every case transition (caseFlow): tells the case's partner about the steps that matter
 * to them — appointment set / rescheduled, visa approved, visa refused.
 */
export const notifyPartnerCaseStatus = async (caseId: string, to: CaseStatus, eventType?: string) => {
  try {
    if (to !== 'APPROVED' && to !== 'REJECTED' && to !== 'APPOINTMENT_SCHEDULED') return;
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        number: true,
        appointmentAt: true,
        client: { select: { firstName: true, lastName: true } },
        partner: { select: { userId: true, active: true, user: { select: { locale: true, role: true } } } },
      },
    });
    const userId = c?.partner?.userId;
    if (!c || !userId || c.partner?.user?.role !== 'AGENT') return;
    const locale: Locale = c.partner.user.locale ?? 'az';
    const t = PARTNER_TEXT[locale];
    const name = clientName(c.client);
    const msg =
      to === 'APPROVED'
        ? { title: t.approvedTitle(name), body: t.approvedBody(name, c.number) }
        : to === 'REJECTED'
          ? { title: t.rejectedTitle(name), body: t.rejectedBody(name, c.number) }
          : { title: t.appointmentTitle(name), body: t.appointmentBody(name, c.number, c.appointmentAt ? formatDateTime(c.appointmentAt, locale) : '—') };
    await notifyUser(userId, {
      type: to === 'APPOINTMENT_SCHEDULED' ? (eventType === 'APPOINTMENT_RESCHEDULED' ? 'PARTNER_APPOINTMENT_MOVED' : 'PARTNER_APPOINTMENT') : `PARTNER_CASE_${to}`,
      ...msg,
      link: `/partner/clients/${caseId}`,
      ctaLabel: t.caseCta,
      push: false,
    });
  } catch (err) {
    console.error('[partner-portal] case notification failed', caseId, err);
  }
};

/** Tells partners that commissions were paid (one message per partner and currency). */
export const notifyPartnerCommissionsPaid = async (rows: { partnerId: string; amountCents: number; currency: string }[]) => {
  try {
    const groups = new Map<string, { partnerId: string; currency: string; cents: number; n: number }>();
    for (const r of rows) {
      const k = `${r.partnerId}:${r.currency}`;
      const g = groups.get(k) ?? { partnerId: r.partnerId, currency: r.currency, cents: 0, n: 0 };
      g.cents += r.amountCents;
      g.n++;
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      const p = await prisma.referralPartner.findUnique({ where: { id: g.partnerId }, select: { userId: true, user: { select: { locale: true, role: true } } } });
      if (!p?.userId || p.user?.role !== 'AGENT') continue;
      const locale: Locale = p.user.locale ?? 'az';
      const t = PARTNER_TEXT[locale];
      await notifyUser(p.userId, {
        type: 'PARTNER_COMMISSION_PAID',
        title: t.paidTitle(formatMoney(g.cents, g.currency, locale)),
        body: t.paidBody(g.n),
        link: '/partner/commissions',
        ctaLabel: t.commissionsCta,
        push: false,
      });
    }
  } catch (err) {
    console.error('[partner-portal] commission notification failed', err);
  }
};

/**
 * Emails a 7-day "set your password" link through the regular password-reset token flow (the same
 * mechanism as the agent and employer invitations). Earlier unused tokens of the user are dropped.
 */
export const sendPartnerInvite = async (user: { id: string; email: string; locale: Locale; firstName: string }) => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const t = PARTNER_TEXT[user.locale] ?? PARTNER_TEXT.az;
  void sendMail(
    user.email,
    `Triad Vision · ${t.inviteTitle}`,
    renderEmail(t.inviteTitle, t.inviteBody(user.firstName), { label: t.inviteCta, url: `${config.clientUrl}/reset-password?token=${token}` }),
  );
};
