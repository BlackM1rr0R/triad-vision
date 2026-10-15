import type { AttendeeStatus, Locale } from '@prisma/client';

/** Notification texts for the team calendar, in the recipient's language. */
interface Texts {
  invite: (p: { actor: string; title: string; when: string }) => { title: string; body: string };
  updated: (p: { actor: string; title: string; when: string }) => { title: string; body: string };
  cancelled: (p: { actor: string; title: string; when: string }) => { title: string; body: string };
  response: (p: { actor: string; title: string; status: AttendeeStatus }) => { title: string; body: string };
  reminder: (p: { title: string; when: string; minutes: number; location?: string | null }) => { title: string; body: string };
  cta: string;
  status: Record<AttendeeStatus, string>;
}

const where = (loc?: string | null) => (loc ? `\n${loc}` : '');

const T: Record<Locale, Texts> = {
  az: {
    invite: ({ actor, title, when }) => ({ title: `Dəvət: ${title}`, body: `${actor} sizi "${title}" tədbirinə dəvət etdi.\n${when}` }),
    updated: ({ actor, title, when }) => ({ title: `Tədbir dəyişdi: ${title}`, body: `${actor} "${title}" tədbirini yenilədi.\n${when}` }),
    cancelled: ({ actor, title, when }) => ({ title: `Tədbir ləğv edildi: ${title}`, body: `${actor} "${title}" tədbirini ləğv etdi.\n${when}` }),
    response: ({ actor, title, status }) => ({ title: `${actor}: ${T.az.status[status].toLowerCase()}`, body: `"${title}" tədbirinə cavab: ${T.az.status[status]}` }),
    reminder: ({ title, when, minutes, location }) => ({ title: `${minutes} dəqiqəyə: ${title}`, body: `${when}${where(location)}` }),
    cta: 'Təqvimi aç',
    status: { NEEDS_ACTION: 'Cavab gözlənilir', ACCEPTED: 'Qəbul etdi', DECLINED: 'İmtina etdi', TENTATIVE: 'Bəlkə' },
  },
  de: {
    invite: ({ actor, title, when }) => ({ title: `Einladung: ${title}`, body: `${actor} hat Sie zu „${title}" eingeladen.\n${when}` }),
    updated: ({ actor, title, when }) => ({ title: `Termin geändert: ${title}`, body: `${actor} hat „${title}" aktualisiert.\n${when}` }),
    cancelled: ({ actor, title, when }) => ({ title: `Termin abgesagt: ${title}`, body: `${actor} hat „${title}" abgesagt.\n${when}` }),
    response: ({ actor, title, status }) => ({ title: `${actor}: ${T.de.status[status]}`, body: `Antwort auf „${title}": ${T.de.status[status]}` }),
    reminder: ({ title, when, minutes, location }) => ({ title: `In ${minutes} Minuten: ${title}`, body: `${when}${where(location)}` }),
    cta: 'Kalender öffnen',
    status: { NEEDS_ACTION: 'Ausstehend', ACCEPTED: 'Zugesagt', DECLINED: 'Abgesagt', TENTATIVE: 'Vielleicht' },
  },
  en: {
    invite: ({ actor, title, when }) => ({ title: `Invitation: ${title}`, body: `${actor} invited you to "${title}".\n${when}` }),
    updated: ({ actor, title, when }) => ({ title: `Event changed: ${title}`, body: `${actor} updated "${title}".\n${when}` }),
    cancelled: ({ actor, title, when }) => ({ title: `Event cancelled: ${title}`, body: `${actor} cancelled "${title}".\n${when}` }),
    response: ({ actor, title, status }) => ({ title: `${actor}: ${T.en.status[status].toLowerCase()}`, body: `Response to "${title}": ${T.en.status[status]}` }),
    reminder: ({ title, when, minutes, location }) => ({ title: `In ${minutes} minutes: ${title}`, body: `${when}${where(location)}` }),
    cta: 'Open calendar',
    status: { NEEDS_ACTION: 'Pending', ACCEPTED: 'Accepted', DECLINED: 'Declined', TENTATIVE: 'Tentative' },
  },
  ru: {
    invite: ({ actor, title, when }) => ({ title: `Приглашение: ${title}`, body: `${actor} пригласил(а) вас на «${title}».\n${when}` }),
    updated: ({ actor, title, when }) => ({ title: `Событие изменено: ${title}`, body: `${actor} обновил(а) «${title}».\n${when}` }),
    cancelled: ({ actor, title, when }) => ({ title: `Событие отменено: ${title}`, body: `${actor} отменил(а) «${title}».\n${when}` }),
    response: ({ actor, title, status }) => ({ title: `${actor}: ${T.ru.status[status].toLowerCase()}`, body: `Ответ на «${title}»: ${T.ru.status[status]}` }),
    reminder: ({ title, when, minutes, location }) => ({ title: `Через ${minutes} мин: ${title}`, body: `${when}${where(location)}` }),
    cta: 'Открыть календарь',
    status: { NEEDS_ACTION: 'Ожидает ответа', ACCEPTED: 'Принято', DECLINED: 'Отклонено', TENTATIVE: 'Возможно' },
  },
};

export const calendarTexts = (locale: Locale) => T[locale] ?? T.az;

const LOCALE_TAG: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** "Thursday, 16 October 2026, 15:00–16:00" in Baku time (or the date only for all-day events). */
export const formatWhen = (start: Date, end: Date, allDay: boolean, locale: Locale) => {
  const tag = LOCALE_TAG[locale];
  if (allDay) return new Intl.DateTimeFormat(tag, { dateStyle: 'full', timeZone: 'Asia/Baku' }).format(start);
  const day = new Intl.DateTimeFormat(tag, { dateStyle: 'full', timeZone: 'Asia/Baku' }).format(start);
  const time = new Intl.DateTimeFormat(tag, { timeStyle: 'short', timeZone: 'Asia/Baku' });
  return `${day}, ${time.format(start)}–${time.format(end)}`;
};
