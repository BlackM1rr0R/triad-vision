import type { FutureLetter } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict } from '../http.js';
import { open, seal } from '../secretBox.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { LETTER_DATE_LOCALE, LETTER_TEXTS, asLetterLocale } from './texts.js';
import { deliveryReason, parseDeliverOn } from './rules.js';

/**
 * "Letter to my future self" (client portal /account/future-letter).
 *
 * The client writes one letter (text only, ≤ 5,000 characters) any time before the arrival. It is sealed at rest with
 * lib/secretBox (AES-256-GCM) and opened ONLY for its author: there is no staff / admin endpoint, "view as client"
 * shows that a letter exists but never its text, and the privacy export contains it only for the owner. Delivery
 * (e-mail with the text + portal) happens once, when the arrival in Germany is recorded (arrival plan COMPLETED or
 * the post-arrival follow-up exists — the same rule as the arrival certificate) or on the fallback date the client
 * picked, whichever comes first. Editable until delivered, deletable any time; erased with the account.
 */

export const LETTER_MAX_CHARS = 5000;
/** User ids (of the given ones) with an arrival recorded on any of their cases. */
export const arrivedUserIds = async (userIds: string[]) => {
  if (!userIds.length) return new Set<string>();
  const cases = await prisma.case.findMany({
    where: { clientId: { in: userIds }, OR: [{ arrivalFollowUp: { isNot: null } }, { arrivalPlan: { is: { status: 'COMPLETED' } } }] },
    select: { clientId: true },
  });
  return new Set(cases.map((c) => c.clientId));
};

/** Marks the letter delivered (once — a parallel run loses the race) and sends the e-mail with the text. */
const deliver = async (letter: FutureLetter, via: 'ARRIVAL' | 'DATE', now: Date) => {
  const claimed = await prisma.futureLetter.updateMany({ where: { id: letter.id, deliveredAt: null }, data: { deliveredAt: now, deliveredVia: via } });
  if (!claimed.count) return false;
  const user = await prisma.user.findUnique({ where: { id: letter.userId }, select: { email: true, locale: true, isActive: true } });
  if (!user || !user.isActive) return true;
  const T = LETTER_TEXTS[asLetterLocale(user.locale)];
  const text = open(letter.sealed);
  if (text) {
    const written = new Intl.DateTimeFormat(LETTER_DATE_LOCALE[asLetterLocale(user.locale)], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baku' }).format(letter.updatedAt);
    // Sent straight to the owner (EmailLog keeps only the subject); the in-app notification carries no letter text.
    void sendMail(user.email, `Triad Vision · ${T.subject}`, renderEmail(T.subject, `${T.intro(written)}\n\n${text}\n\n${T.outro}`, { label: T.cta, url: `${config.clientUrl}/account/future-letter` }));
  }
  await notifyUser(letter.userId, { type: 'FUTURE_LETTER', title: T.notifyTitle, body: T.notifyBody, link: '/account/future-letter', email: false });
  return true;
};

/** Delivers the client's own letter when it became due (called on page load; never while staff view the portal). */
export const deliverIfDue = async (userId: string, now = new Date()) => {
  if (isImpersonating()) return;
  const letter = await prisma.futureLetter.findUnique({ where: { userId } });
  if (!letter || letter.deliveredAt) return;
  const reason = deliveryReason(letter, (await arrivedUserIds([userId])).has(userId), now);
  if (reason) await deliver(letter, reason, now);
};

/** Scheduler: every undelivered letter whose client arrived or whose fallback day began. */
export const runFutureLetterDeliveries = async (now = new Date()) => {
  let delivered = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.futureLetter.findMany({ where: { deliveredAt: null }, orderBy: { id: 'asc' }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!batch.length) break;
    const arrived = await arrivedUserIds(batch.map((l) => l.userId));
    for (const l of batch) {
      const reason = deliveryReason(l, arrived.has(l.userId), now);
      if (reason && (await deliver(l, reason, now))) delivered++;
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 200) break;
  }
  return { delivered };
};

/** The client's view. While staff view the portal as the client: existence and dates only, never the text. */
export const letterView = async (userId: string) => {
  await deliverIfDue(userId);
  const l = await prisma.futureLetter.findUnique({ where: { userId } });
  const arrived = (await arrivedUserIds([userId])).has(userId);
  if (!l) return { letter: null, arrived };
  const hidden = isImpersonating();
  return {
    arrived,
    letter: {
      body: hidden ? null : (open(l.sealed) ?? ''),
      hidden,
      deliverOn: l.deliverOn ? l.deliverOn.toISOString().slice(0, 10) : null,
      delivered: !!l.deliveredAt,
      deliveredAt: l.deliveredAt,
      deliveredVia: l.deliveredVia,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    },
  };
};

export const saveLetter = async (userId: string, input: { body: string; deliverOn?: string | null }, now = new Date()) => {
  const body = input.body.replace(/\r\n/g, '\n').trim();
  if (!body) throw badRequest('LETTER_EMPTY');
  if (body.length > LETTER_MAX_CHARS) throw badRequest('LETTER_TOO_LONG');
  const deliverOn = parseDeliverOn(input.deliverOn, now);
  if (deliverOn === 'INVALID') throw badRequest('LETTER_BAD_DATE');
  const existing = await prisma.futureLetter.findUnique({ where: { userId } });
  if (existing?.deliveredAt) throw conflict('LETTER_DELIVERED');
  // Written before the arrival only (afterwards it would be delivered at once).
  if (!existing && (await arrivedUserIds([userId])).has(userId)) throw conflict('ALREADY_ARRIVED');
  const sealed = seal(body);
  await prisma.futureLetter.upsert({ where: { userId }, create: { userId, sealed, deliverOn }, update: { sealed, deliverOn } });
};

export const deleteLetter = async (userId: string) => (await prisma.futureLetter.deleteMany({ where: { userId } })).count;

/** DSGVO export for the owner only (the export is self-service; while staff view the portal the text is withheld). */
export const futureLetterExport = async (userId: string) => {
  const l = await prisma.futureLetter.findUnique({ where: { userId } });
  if (!l) return null;
  return {
    text: isImpersonating() ? '[hidden while viewed by staff]' : open(l.sealed),
    deliverOn: l.deliverOn,
    deliveredAt: l.deliveredAt,
    deliveredVia: l.deliveredVia,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
};

export const eraseFutureLetter = (userId: string) => prisma.futureLetter.deleteMany({ where: { userId } });
