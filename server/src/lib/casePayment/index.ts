import type { CaseStatus, Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { OPEN_STATUSES, openCents } from '../billing/math.js';
import { recordPayment } from '../billing/service.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import type { ContractTurn, StepState } from '../caseContracts/flow.js';
import { loadContractInfo } from '../caseContracts/turn.js';

/**
 * Payment step after the Əmək müqaviləsi (status CONTRACT_SIGNED, single-contract flow): the client pays in the
 * office BEFORE the German documents are prepared and sent. No online payment yet.
 *
 * "Paid" for a case = staff recorded it: a CaseEvent PAYMENT_RECEIVED ("Ödəniş alındı" action) OR the case's
 * client invoices are all PAID (at least one, none open) — so a payment recorded in the billing module counts too.
 * Recording through the action pays the open invoices of the case (method CASH) or, without an invoice, writes a
 * ClientPayment when an amount is given. The Fertig send is never blocked by it (the send dialog only warns).
 */

export const PAYMENT_EVENT = 'PAYMENT_RECEIVED';
/** Office-visit reason (lib/clientProcess/texts VISIT_REASONS) of the payment appointment. */
export const PAYMENT_VISIT_REASON = 'payment';

export interface CasePayment {
  paid: boolean;
  paidAt: Date | null;
  /** Open amount of the case's issued invoices (0 = no open invoice). */
  openCents: number;
  currency: string;
  invoiceNumber: string | null;
  /** Next upcoming office visit booked for the payment. */
  visit: { id: string; startsAt: Date; endsAt: Date; location: string | null } | null;
}

/** Pure: is the client expected to pay now (single-contract flow: Əmək müqaviləsi approved, nothing sent after it)? */
export const paymentDue = (f: { status: CaseStatus; contractTurn?: ContractTurn | null; work?: StepState | null; paid?: boolean | null }): boolean =>
  f.status === 'CONTRACT_SIGNED' && f.contractTurn === 'STAFF' && f.work === 'NOT_SENT' && f.paid === false;

/** Payment facts of several cases (3 queries). */
export const loadCasePayments = async (caseIds: string[], now = new Date()): Promise<Map<string, CasePayment>> => {
  const ids = [...new Set(caseIds)];
  const out = new Map<string, CasePayment>();
  if (!ids.length) return out;
  const [events, invoices, visits] = await Promise.all([
    prisma.caseEvent.findMany({ where: { caseId: { in: ids }, type: PAYMENT_EVENT }, orderBy: { createdAt: 'asc' }, select: { caseId: true, createdAt: true } }),
    prisma.clientInvoice.findMany({
      where: { caseId: { in: ids }, status: { in: [...OPEN_STATUSES, 'PAID'] } },
      orderBy: { dueDate: 'asc' },
      select: { caseId: true, number: true, status: true, grossCents: true, paidCents: true, currency: true, paidAt: true },
    }),
    prisma.booking.findMany({
      where: { caseId: { in: ids }, topic: PAYMENT_VISIT_REASON, status: 'BOOKED', slot: { kind: 'OFFICE', endsAt: { gt: now } } },
      orderBy: { slot: { startsAt: 'asc' } },
      select: { id: true, caseId: true, slot: { select: { startsAt: true, endsAt: true, location: true } } },
    }),
  ]);
  for (const id of ids) {
    const ev = events.find((e) => e.caseId === id);
    const inv = invoices.filter((i) => i.caseId === id);
    const open = inv.filter((i) => i.status !== 'PAID');
    const paidInv = inv.filter((i) => i.status === 'PAID');
    const paid = !!ev || (!open.length && paidInv.length > 0);
    const v = visits.find((b) => b.caseId === id);
    out.set(id, {
      paid,
      paidAt: ev?.createdAt ?? (paid ? (paidInv.map((i) => i.paidAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null) : null),
      openCents: open.reduce((n, i) => n + openCents(i), 0),
      currency: (open[0] ?? paidInv[0])?.currency ?? 'EUR',
      invoiceNumber: open[0]?.number ?? null,
      visit: v ? { id: v.id, startsAt: v.slot.startsAt, endsAt: v.slot.endsAt, location: v.slot.location } : null,
    });
  }
  return out;
};

const NOTE: Record<Locale, { title: string; body: string }> = {
  az: { title: 'Ödənişiniz qəbul edildi', body: 'Ödənişiniz qəbul edildi. Almaniya üçün sənədləriniz hazırlanır — sizdən hazırda heç nə tələb olunmur. Hazır olanda bildiriş alacaqsınız.' },
  de: { title: 'Ihre Zahlung ist eingegangen', body: 'Ihre Zahlung ist eingegangen. Ihre deutschen Unterlagen werden vorbereitet — von Ihnen wird gerade nichts benötigt. Sie erhalten eine Nachricht, sobald sie fertig sind.' },
  en: { title: 'Your payment was received', body: 'Your payment was received. Your German documents are being prepared — nothing is required from you right now. You will be notified when they are ready.' },
  ru: { title: 'Ваш платёж получен', body: 'Ваш платёж получен. Ваши немецкие документы готовятся — от вас сейчас ничего не требуется. Мы сообщим, когда они будут готовы.' },
};

/** Staff action "Ödəniş alındı": records the payment, closes the booked payment visit and tells the client. */
export const recordCasePayment = async (caseId: string, actorId: string, input: { amountCents?: number | null; note?: string | null } = {}, now = new Date()) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, status: true, clientId: true, number: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (FINAL_STATUSES.includes(c.status)) throw conflict('CASE_CLOSED');
  const state = (await loadCasePayments([c.id], now)).get(c.id);
  if (state?.paid) throw conflict('ALREADY_PAID');

  const open = await prisma.clientInvoice.findMany({ where: { caseId: c.id, status: { in: OPEN_STATUSES } }, select: { id: true, grossCents: true, paidCents: true, status: true } });
  let paidCents = 0;
  for (const inv of open) {
    const amount = openCents(inv);
    if (amount > 0) {
      await recordPayment(inv.id, { amountCents: amount, method: 'CASH', note: input.note ?? undefined }, actorId, now);
      paidCents += amount;
    }
  }
  if (!open.length && input.amountCents && input.amountCents > 0) {
    await prisma.clientPayment.create({ data: { clientId: c.clientId, caseId: c.id, amountCents: input.amountCents, currency: 'EUR', method: 'CASH', paidAt: now, note: input.note ?? null, recordedById: actorId } });
    paidCents = input.amountCents;
  }
  await prisma.caseEvent.create({ data: { caseId: c.id, type: PAYMENT_EVENT, note: input.note ?? null, actorId, visibleToClient: false } });
  await prisma.booking.updateMany({ where: { caseId: c.id, topic: PAYMENT_VISIT_REASON, status: 'BOOKED' }, data: { status: 'DONE' } });
  const t = NOTE[c.client.locale] ?? NOTE.az;
  await notifyUser(c.clientId, { type: 'CASE_PAYMENT_RECEIVED', title: t.title, body: t.body, link: `/account/cases/${c.id}`, caseId: c.id, email: false }).catch(() => undefined);
  return { paid: true, paidCents };
};

/** Client portal / app: the payment step of one own case (due now, paid, the amount of the open invoice, the booked office visit). */
export const paymentViewFor = async (caseId: string, now = new Date()) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, status: true, contract: { select: { signedAt: true, signatureRequestId: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const [info, pay] = await Promise.all([loadContractInfo([c], now).then((m) => m.get(c.id)), loadCasePayments([c.id], now).then((m) => m.get(c.id))]);
  const paid = pay?.paid ?? false;
  const due = paymentDue({ status: c.status, contractTurn: info?.turn, work: info?.work, paid });
  return {
    caseId: c.id,
    due,
    paid,
    paidAt: pay?.paidAt ?? null,
    amountCents: pay && pay.openCents > 0 ? pay.openCents : null,
    currency: pay?.currency ?? 'EUR',
    invoiceNumber: pay?.invoiceNumber ?? null,
    visit: pay?.visit ?? null,
  };
};
