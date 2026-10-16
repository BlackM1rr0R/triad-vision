import type { CommissionType, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { AGENT_TEXT, EVENT_LABEL, formatMoney } from './texts.js';
import { displayName } from './privacy.js';

export const PAYOUT_EVENTS = ['CASE_CREATED', 'CONTRACT_SIGNED', 'VISA_APPROVED', 'INVOICE_PAID'] as const;
export type PayoutEvent = (typeof PAYOUT_EVENTS)[number];
/** Agents without explicit settings are paid when the visa is approved. */
export const DEFAULT_PAYOUT_EVENTS: PayoutEvent[] = ['VISA_APPROVED'];

/** Reads the `payoutEvents` JSON column defensively (unknown values are dropped). */
export const payoutEventsOf = (value: Prisma.JsonValue | null | undefined): PayoutEvent[] => {
  if (!Array.isArray(value)) return [...DEFAULT_PAYOUT_EVENTS];
  return PAYOUT_EVENTS.filter((e) => value.includes(e));
};

/**
 * Commission for one event, or null when nothing is due.
 * FIXED pays `commissionValue` cents for every enabled event; PERCENT pays `commissionValue` basis
 * points of the invoice amount and therefore only applies to INVOICE_PAID.
 */
export const computeCommission = (
  agent: { commissionType: CommissionType; commissionValue: number },
  event: PayoutEvent,
  invoiceAmountCents?: number | null,
): number | null => {
  if (agent.commissionValue <= 0) return null;
  if (agent.commissionType === 'FIXED') return agent.commissionValue;
  if (event !== 'INVOICE_PAID' || !invoiceAmountCents || invoiceAmountCents <= 0) return null;
  const amount = Math.round((invoiceAmountCents * agent.commissionValue) / 10000);
  return amount > 0 ? amount : null;
};

export interface AwardInput {
  clientId: string;
  caseId?: string | null;
  event: PayoutEvent;
  sourceRef?: string | null;
  invoiceAmountCents?: number | null;
}

/**
 * Creates a PENDING commission for the agent who referred `clientId`, if that agent is ACTIVE, pays
 * for `event` and the same (agent, event, case, sourceRef) has not been paid yet. Notifies the agent
 * in their language. Never throws: a commission problem must not break a case or invoice action.
 */
export const awardCommission = async (input: AwardInput) => {
  try {
    const client = await prisma.user.findUnique({
      where: { id: input.clientId },
      select: { firstName: true, lastName: true, referredByAgentId: true },
    });
    if (!client?.referredByAgentId) return null;
    const agent = await prisma.agent.findUnique({ where: { id: client.referredByAgentId } });
    if (!agent || agent.status !== 'ACTIVE') return null;
    if (!payoutEventsOf(agent.payoutEvents).includes(input.event)) return null;
    const amountCents = computeCommission(agent, input.event, input.invoiceAmountCents);
    if (amountCents === null) return null;

    const caseId = input.caseId ?? null;
    const sourceRef = input.sourceRef ?? null;
    // MySQL unique indexes treat NULLs as distinct, so the duplicate check is done here.
    const existing = await prisma.agentCommission.findFirst({ where: { agentId: agent.id, event: input.event, caseId, sourceRef }, select: { id: true } });
    if (existing) return null;

    const row = await prisma.agentCommission.create({
      data: { agentId: agent.id, clientId: input.clientId, caseId, event: input.event, sourceRef, amountCents, currency: agent.currency },
    });

    const user = await prisma.user.findUnique({ where: { id: agent.userId }, select: { locale: true } });
    const locale = user?.locale ?? 'az';
    const t = AGENT_TEXT[locale];
    await notifyUser(agent.userId, {
      type: 'AGENT_COMMISSION',
      title: t.earnedTitle(formatMoney(amountCents, agent.currency, locale)),
      body: t.earnedBody(EVENT_LABEL[locale][input.event] ?? input.event, displayName(client)),
      link: '/agent/earnings',
      ctaLabel: t.cta,
      push: false,
    });
    return row;
  } catch (err) {
    console.error('[agents] award commission failed', input, err);
    return null;
  }
};

/** INVOICE_PAID: invoices go to companies, so the commission goes to the agent who referred one of its users. */
export const awardInvoiceCommission = async (invoice: { id: string; companyId: string; grossCents: number }) => {
  try {
    const referred = await prisma.user.findFirst({
      where: { companyId: invoice.companyId, referredByAgentId: { not: null } },
      orderBy: { referredAt: 'asc' },
      select: { id: true },
    });
    if (!referred) return null;
    return await awardCommission({ clientId: referred.id, event: 'INVOICE_PAID', sourceRef: invoice.id, invoiceAmountCents: invoice.grossCents });
  } catch (err) {
    console.error('[agents] invoice commission failed', invoice.id, err);
    return null;
  }
};

/** Case hooks (caseFlow): resolves the case's client and awards the event. Never throws. */
export const awardCaseCommission = async (caseId: string, event: Exclude<PayoutEvent, 'INVOICE_PAID'>) => {
  try {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    return c ? await awardCommission({ clientId: c.clientId, caseId, event }) : null;
  } catch (err) {
    console.error('[agents] case commission failed', caseId, event, err);
    return null;
  }
};
