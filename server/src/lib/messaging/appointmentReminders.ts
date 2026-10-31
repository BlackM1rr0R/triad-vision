import type { Locale, OutboundChannel, User } from '@prisma/client';
import { prisma } from '../../db.js';
import { preferredChannel, sendSms, sendWhatsApp } from './outbound.js';

/**
 * Appointment reminders by phone (WhatsApp preferred, else SMS) on top of the e-mail / in-app ones:
 * Botschaft appointments, German exams, booked consultations / office visits and confirmed job
 * interviews, `leadMinutes` before the start (default 1 day and 2 hours; Admin → Messaging).
 *
 * Only the tightest window that has been reached sends (inside the last 2 hours only the 2-hour
 * reminder goes out, never a late "1 day" one as well). Every send is claimed in ReminderLog first:
 * the key carries the start time, so a moved appointment gets fresh reminders and a repeated run
 * never sends twice. The phone channel follows the client's choice (whatsappOptIn /
 * smsNotifications) and needs a phone number; outbound.ts records a CONSOLE row instead of sending
 * when no provider is configured. The embassy "1 day" reminder shares its key with the one
 * jobs/reminders.ts sends next to the in-app notification, so the two never both go out.
 */

export const REMINDER_KINDS = ['EMBASSY', 'GERMAN_EXAM', 'BOOKING', 'INTERVIEW'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface PhoneReminderSettings {
  enabled: boolean;
  /** Minutes before the start, ascending (15 min … 7 days, at most 3). */
  leadMinutes: number[];
  kinds: Record<ReminderKind, boolean>;
}

export const PHONE_REMINDER_SETTINGS_KEY = 'phoneReminders';
export const MIN_LEAD = 15;
export const MAX_LEAD = 7 * 24 * 60;
export const DEFAULT_PHONE_REMINDERS: PhoneReminderSettings = {
  enabled: true,
  leadMinutes: [120, 1440],
  kinds: { EMBASSY: true, GERMAN_EXAM: true, BOOKING: true, INTERVIEW: true },
};

/** Valid, unique, ascending lead times (falls back to the defaults when nothing usable is left). */
export const normaliseLeads = (raw: unknown): number[] => {
  const list = Array.isArray(raw) ? raw : [];
  const leads = [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n >= MIN_LEAD && n <= MAX_LEAD))].sort((a, b) => a - b).slice(0, 3);
  return leads.length ? leads : [...DEFAULT_PHONE_REMINDERS.leadMinutes];
};

export const getPhoneReminderSettings = async (): Promise<PhoneReminderSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: PHONE_REMINDER_SETTINGS_KEY } });
  const v = (row?.value ?? {}) as Partial<PhoneReminderSettings>;
  const kinds = (v.kinds ?? {}) as Partial<Record<ReminderKind, unknown>>;
  return {
    enabled: v.enabled !== false,
    leadMinutes: normaliseLeads(v.leadMinutes),
    kinds: Object.fromEntries(REMINDER_KINDS.map((k) => [k, kinds[k] !== false])) as Record<ReminderKind, boolean>,
  };
};

export const savePhoneReminderSettings = async (s: PhoneReminderSettings) => {
  const value = {
    enabled: !!s.enabled,
    leadMinutes: normaliseLeads(s.leadMinutes),
    kinds: Object.fromEntries(REMINDER_KINDS.map((k) => [k, s.kinds?.[k] !== false])),
  };
  await prisma.setting.upsert({ where: { key: PHONE_REMINDER_SETTINGS_KEY }, update: { value }, create: { key: PHONE_REMINDER_SETTINGS_KEY, value } });
  return value as PhoneReminderSettings;
};

/**
 * The lead window `startsAt` is in: the smallest lead L with (time left) ≤ L, or null when the start
 * is further away than the largest lead (or already past). `leads` ascending.
 */
export const dueLead = (startsAt: Date, now: Date, leads: number[]): number | null => {
  const left = (startsAt.getTime() - now.getTime()) / 60_000;
  if (left <= 0) return null;
  return leads.find((l) => left <= l) ?? null;
};

// ─── Texts ─────────────────────────────────────────────────────────────

const fmt = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'az-Latn-AZ', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Baku',
  }).format(d) + ' (GMT+4)';

type Params = { date: string; what?: string | null; place?: string | null };
const tail = (p?: string | null) => (p ? `, ${p}` : '');

export const REMINDER_TEXTS: Record<Locale, Record<ReminderKind, (p: Params) => string>> = {
  az: {
    EMBASSY: (p) => `Xatırlatma: Botschaft (səfirlik) termininiz — ${p.date}${tail(p.place)}. Pasportunuzu və bütün sənədlərinizi götürün. — Triad Vision`,
    GERMAN_EXAM: (p) => `Xatırlatma: ${p.what ?? 'alman dili'} imtahanınız — ${p.date}${tail(p.place)}. Pasportunuzu və qeydiyyat təsdiqini götürün. Uğurlar! — Triad Vision`,
    BOOKING: (p) => `Xatırlatma: Triad Vision ilə görüşünüz — ${p.date}${tail(p.place)}.`,
    INTERVIEW: (p) => `Xatırlatma: iş müsahibəniz${p.what ? ` (${p.what})` : ''} — ${p.date}${tail(p.place)}. Uğurlar! — Triad Vision`,
  },
  de: {
    EMBASSY: (p) => `Erinnerung: Ihr Botschaftstermin — ${p.date}${tail(p.place)}. Bitte Reisepass und alle Unterlagen mitbringen. — Triad Vision`,
    GERMAN_EXAM: (p) => `Erinnerung: Ihre Prüfung ${p.what ?? 'Deutsch'} — ${p.date}${tail(p.place)}. Bitte Reisepass und Anmeldebestätigung mitbringen. Viel Erfolg! — Triad Vision`,
    BOOKING: (p) => `Erinnerung: Ihr Termin bei Triad Vision — ${p.date}${tail(p.place)}.`,
    INTERVIEW: (p) => `Erinnerung: Ihr Vorstellungsgespräch${p.what ? ` (${p.what})` : ''} — ${p.date}${tail(p.place)}. Viel Erfolg! — Triad Vision`,
  },
  en: {
    EMBASSY: (p) => `Reminder: your embassy (Botschaft) appointment — ${p.date}${tail(p.place)}. Bring your passport and all documents. — Triad Vision`,
    GERMAN_EXAM: (p) => `Reminder: your ${p.what ?? 'German'} exam — ${p.date}${tail(p.place)}. Bring your passport and the registration confirmation. Good luck! — Triad Vision`,
    BOOKING: (p) => `Reminder: your appointment with Triad Vision — ${p.date}${tail(p.place)}.`,
    INTERVIEW: (p) => `Reminder: your job interview${p.what ? ` (${p.what})` : ''} — ${p.date}${tail(p.place)}. Good luck! — Triad Vision`,
  },
  ru: {
    EMBASSY: (p) => `Напоминание: ваш термин в посольстве (Botschaft) — ${p.date}${tail(p.place)}. Возьмите паспорт и все документы. — Triad Vision`,
    GERMAN_EXAM: (p) => `Напоминание: ваш экзамен ${p.what ?? 'по немецкому'} — ${p.date}${tail(p.place)}. Возьмите паспорт и подтверждение регистрации. Удачи! — Triad Vision`,
    BOOKING: (p) => `Напоминание: ваша встреча с Triad Vision — ${p.date}${tail(p.place)}.`,
    INTERVIEW: (p) => `Напоминание: ваше собеседование${p.what ? ` (${p.what})` : ''} — ${p.date}${tail(p.place)}. Удачи! — Triad Vision`,
  },
};

export const reminderText = (kind: ReminderKind, locale: Locale, p: { at: Date; what?: string | null; place?: string | null }) =>
  (REMINDER_TEXTS[locale] ?? REMINDER_TEXTS.az)[kind]({ date: fmt(p.at, locale), what: p.what, place: p.place });

const TEMPLATE_KEY: Record<ReminderKind, string> = {
  EMBASSY: 'APPOINTMENT_REMINDER',
  GERMAN_EXAM: 'GERMAN_EXAM_REMINDER',
  BOOKING: 'BOOKING_REMINDER',
  INTERVIEW: 'INTERVIEW_REMINDER',
};

// ─── Sending ───────────────────────────────────────────────────────────

type Recipient = Pick<User, 'id' | 'phone' | 'whatsappOptIn' | 'smsNotifications' | 'isActive' | 'locale'>;

export interface Due {
  kind: ReminderKind;
  id: string;
  at: Date;
  user: Recipient;
  caseId?: string | null;
  what?: string | null;
  place?: string | null;
  /** When the appointment was made: a lead window that had already begun then is skipped (the confirmation covered it). */
  madeAt?: Date | null;
}

const claim = async (key: string, now: Date) => {
  try {
    await prisma.reminderLog.create({ data: { key: key.slice(0, 191), sentAt: now } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/** ReminderLog key of one phone reminder (the embassy 1-day one matches jobs/reminders.ts sendPhoneReminder). */
export const reminderKey = (d: Pick<Due, 'kind' | 'id' | 'at'>, lead: number, channel: OutboundChannel) => {
  const iso = d.at.toISOString();
  if (d.kind === 'EMBASSY' && lead === 1440) return `${channel === 'WHATSAPP' ? 'appt-24h-wa' : 'appt-24h-sms'}:${d.id}:${iso}`;
  return `phone-rem:${d.kind}:${d.id}:${iso}:${lead}`;
};

/** Sends the due reminder of one appointment (if any). True when a message was handed to the messaging layer. */
export const remindOne = async (d: Due, leads: number[], now: Date): Promise<boolean> => {
  if (!d.user.isActive) return false;
  const lead = dueLead(d.at, now, leads);
  if (lead === null) return false;
  if (d.madeAt && d.at.getTime() - d.madeAt.getTime() < lead * 60_000) return false;
  const channel = preferredChannel(d.user);
  if (!channel) return false; // no phone number or both phone channels switched off
  if (!(await claim(reminderKey(d, lead, channel), now))) return false;
  const text = reminderText(d.kind, d.user.locale, d);
  const target = { userId: d.user.id, to: d.user.phone, caseId: d.caseId ?? null, templateKey: TEMPLATE_KEY[d.kind] };
  const row = channel === 'WHATSAPP' ? await sendWhatsApp(target, text) : await sendSms(target, text);
  return !!row;
};

const recipient = { select: { id: true, phone: true, whatsappOptIn: true, smsNotifications: true, isActive: true, locale: true } } as const;
const EXAM_PROVIDER: Record<string, string> = { GOETHE: 'Goethe', TELC: 'telc', OESD: 'ÖSD', TESTDAF: 'TestDaF', OTHER: '' };

/** Every appointment starting within `horizonMin` minutes that may get a phone reminder. */
export const collectDue = async (now: Date, horizonMin: number, kinds: Record<ReminderKind, boolean>): Promise<Due[]> => {
  const range = { gt: now, lte: new Date(now.getTime() + horizonMin * 60_000) };
  const [cases, exams, bookings, interviews] = await Promise.all([
    kinds.EMBASSY
      ? prisma.case.findMany({ where: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: range }, select: { id: true, appointmentAt: true, appointmentPlace: true, client: recipient } })
      : [],
    kinds.GERMAN_EXAM
      ? prisma.germanExam.findMany({
          where: { status: { in: ['PLANNED', 'REGISTERED'] }, examDate: range },
          select: { id: true, provider: true, level: true, examDate: true, location: true, user: recipient },
        })
      : [],
    kinds.BOOKING
      ? prisma.booking.findMany({
          where: { status: 'BOOKED', userId: { not: null }, slot: { startsAt: range } },
          select: { id: true, createdAt: true, caseId: true, phone: true, meetingUrl: true, slot: { select: { startsAt: true, kind: true, location: true } }, user: recipient },
        })
      : [],
    kinds.INTERVIEW
      ? prisma.interview.findMany({
          where: { status: 'CONFIRMED', startsAt: range },
          select: { id: true, startsAt: true, updatedAt: true, meetingUrl: true, company: { select: { name: true } }, candidate: recipient },
        })
      : [],
  ]);
  const out: Due[] = [];
  for (const c of cases) out.push({ kind: 'EMBASSY', id: c.id, at: c.appointmentAt!, user: c.client, caseId: c.id, place: c.appointmentPlace });
  for (const e of exams) {
    out.push({ kind: 'GERMAN_EXAM', id: e.id, at: e.examDate!, user: e.user, what: `${EXAM_PROVIDER[e.provider] ?? ''} ${e.level}`.trim(), place: e.location });
  }
  for (const b of bookings) {
    if (!b.user) continue;
    // A booking without a phone on the account can still use the number given when booking.
    const user = b.user.phone ? b.user : { ...b.user, phone: b.phone };
    out.push({ kind: 'BOOKING', id: b.id, at: b.slot.startsAt, user, caseId: b.caseId, place: b.slot.kind === 'OFFICE' ? b.slot.location : b.meetingUrl, madeAt: b.createdAt });
  }
  for (const i of interviews) {
    out.push({ kind: 'INTERVIEW', id: i.id, at: i.startsAt, user: i.candidate, what: i.company?.name ?? null, place: i.meetingUrl, madeAt: i.updatedAt });
  }
  return out;
};

/** One pass over every kind; returns the number of reminders handed to WhatsApp / SMS. */
export const runPhoneReminders = async (now = new Date()) => {
  const s = await getPhoneReminderSettings();
  if (!s.enabled) return 0;
  const due = await collectDue(now, Math.max(...s.leadMinutes), s.kinds);
  let sent = 0;
  for (const d of due) {
    try {
      if (await remindOne(d, s.leadMinutes, now)) sent++;
    } catch (err) {
      console.error(`[phone-reminders] ${d.kind} ${d.id} failed`, err);
    }
  }
  return sent;
};
