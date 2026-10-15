import type { LeaveType, Locale } from '@prisma/client';

/**
 * Notification texts for the team workspace (leave requests, announcements), in the recipient's
 * language. Formal register: German "Sie", Russian "вы".
 */

type Msg = { title: string; body: string };

interface WorkspaceCatalog {
  leaveType: Record<LeaveType, string>;
  leaveRequested: (p: { actor: string; type: string; from: string; to: string; note?: string | null }) => Msg;
  leaveApproved: (p: { actor: string; type: string; from: string; to: string; note?: string | null }) => Msg;
  leaveRejected: (p: { actor: string; type: string; from: string; to: string; note?: string | null }) => Msg;
  announcement: (p: { actor: string; title: string; excerpt: string }) => Msg;
  cta: { leave: string; home: string };
}

const noteLine = (label: string, note?: string | null) => (note ? `\n${label}: ${note}` : '');

const az: WorkspaceCatalog = {
  leaveType: { VACATION: 'Məzuniyyət', SICK: 'Xəstəlik', REMOTE: 'Uzaqdan iş', OTHER: 'Digər' },
  leaveRequested: (p) => ({
    title: `Yeni məzuniyyət sorğusu: ${p.actor}`,
    body: `${p.actor} sorğu göndərdi: ${p.type}, ${p.from} – ${p.to}.${noteLine('Qeyd', p.note)}`,
  }),
  leaveApproved: (p) => ({
    title: `Sorğunuz təsdiqləndi: ${p.type}`,
    body: `${p.actor} ${p.from} – ${p.to} tarixləri üçün sorğunuzu təsdiqlədi.${noteLine('Qeyd', p.note)}`,
  }),
  leaveRejected: (p) => ({
    title: `Sorğunuz rədd edildi: ${p.type}`,
    body: `${p.actor} ${p.from} – ${p.to} tarixləri üçün sorğunuzu rədd etdi.${noteLine('Səbəb', p.note)}`,
  }),
  announcement: (p) => ({ title: `Elan: ${p.title}`, body: `${p.actor} yeni elan dərc etdi.\n\n${p.excerpt}` }),
  cta: { leave: 'Komanda səhifəsini aç', home: 'İş mühitini aç' },
};

const de: WorkspaceCatalog = {
  leaveType: { VACATION: 'Urlaub', SICK: 'Krankheit', REMOTE: 'Homeoffice', OTHER: 'Sonstiges' },
  leaveRequested: (p) => ({
    title: `Neuer Abwesenheitsantrag: ${p.actor}`,
    body: `${p.actor} hat einen Antrag gestellt: ${p.type}, ${p.from} – ${p.to}.${noteLine('Notiz', p.note)}`,
  }),
  leaveApproved: (p) => ({
    title: `Ihr Antrag wurde genehmigt: ${p.type}`,
    body: `${p.actor} hat Ihren Antrag für ${p.from} – ${p.to} genehmigt.${noteLine('Notiz', p.note)}`,
  }),
  leaveRejected: (p) => ({
    title: `Ihr Antrag wurde abgelehnt: ${p.type}`,
    body: `${p.actor} hat Ihren Antrag für ${p.from} – ${p.to} abgelehnt.${noteLine('Grund', p.note)}`,
  }),
  announcement: (p) => ({ title: `Ankündigung: ${p.title}`, body: `${p.actor} hat eine neue Ankündigung veröffentlicht.\n\n${p.excerpt}` }),
  cta: { leave: 'Teamseite öffnen', home: 'Arbeitsbereich öffnen' },
};

const en: WorkspaceCatalog = {
  leaveType: { VACATION: 'Vacation', SICK: 'Sick leave', REMOTE: 'Remote work', OTHER: 'Other' },
  leaveRequested: (p) => ({
    title: `New leave request: ${p.actor}`,
    body: `${p.actor} requested ${p.type}, ${p.from} – ${p.to}.${noteLine('Note', p.note)}`,
  }),
  leaveApproved: (p) => ({
    title: `Your request was approved: ${p.type}`,
    body: `${p.actor} approved your request for ${p.from} – ${p.to}.${noteLine('Note', p.note)}`,
  }),
  leaveRejected: (p) => ({
    title: `Your request was rejected: ${p.type}`,
    body: `${p.actor} rejected your request for ${p.from} – ${p.to}.${noteLine('Reason', p.note)}`,
  }),
  announcement: (p) => ({ title: `Announcement: ${p.title}`, body: `${p.actor} published a new announcement.\n\n${p.excerpt}` }),
  cta: { leave: 'Open the team page', home: 'Open the workspace' },
};

const ru: WorkspaceCatalog = {
  leaveType: { VACATION: 'Отпуск', SICK: 'Больничный', REMOTE: 'Удалённая работа', OTHER: 'Другое' },
  leaveRequested: (p) => ({
    title: `Новая заявка на отсутствие: ${p.actor}`,
    body: `${p.actor} подал(а) заявку: ${p.type}, ${p.from} – ${p.to}.${noteLine('Примечание', p.note)}`,
  }),
  leaveApproved: (p) => ({
    title: `Ваша заявка одобрена: ${p.type}`,
    body: `${p.actor} одобрил(а) вашу заявку на ${p.from} – ${p.to}.${noteLine('Примечание', p.note)}`,
  }),
  leaveRejected: (p) => ({
    title: `Ваша заявка отклонена: ${p.type}`,
    body: `${p.actor} отклонил(а) вашу заявку на ${p.from} – ${p.to}.${noteLine('Причина', p.note)}`,
  }),
  announcement: (p) => ({ title: `Объявление: ${p.title}`, body: `${p.actor} опубликовал(а) новое объявление.\n\n${p.excerpt}` }),
  cta: { leave: 'Открыть страницу команды', home: 'Открыть рабочую среду' },
};

const catalogs: Record<Locale, WorkspaceCatalog> = { az, de, en, ru };

export const workspaceTexts = (locale: Locale) => catalogs[locale] ?? catalogs.az;

const DATE_LOCALE: Record<Locale, string> = { az: 'az-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Day-granular date for leave notifications (leave spans are stored as UTC calendar days). */
export const formatLeaveDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);

/** First ~160 characters of a markdown body, flattened to plain text. */
export const excerptOf = (body: string, len = 160) => {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > len ? `${plain.slice(0, len - 1)}…` : plain;
};
