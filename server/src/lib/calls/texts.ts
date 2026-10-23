import type { Locale } from '@prisma/client';

/** Server-side texts of calls, callback requests and live chat (recipient's language; formal de/ru). */

export const LOCALES: Locale[] = ['az', 'de', 'en', 'ru'];
export const asLocale = (l: string | null | undefined): Locale => (LOCALES.includes(l as Locale) ? (l as Locale) : 'az');

const fmt = (d: Date, l: Locale, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[l], { timeZone: 'Asia/Baku', ...opts }).format(d);

export const windowLabel = (start: Date, end: Date, l: Locale, asap = false) =>
  asap ? T[l].asap : `${fmt(start, l, { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmt(start, l, { hour: '2-digit', minute: '2-digit', hour12: false })}–${fmt(end, l, { hour: '2-digit', minute: '2-digit', hour12: false })} (Bakı/GMT+4)`;

interface Texts {
  asap: string;
  confirmTitle: string;
  confirm: (when: string) => string;
  taskTitle: (name: string, when: string) => string;
  reminderTitle: (name: string) => string;
  reminderBody: (phone: string, when: string) => string;
  inboundTitle: (who: string) => string;
  missedTitle: (who: string) => string;
  closed: string;
  chatAccepted: (name: string) => string;
  chatClosed: string;
  chatMissed: string;
  chatQueueTitle: string;
  chatQueueBody: (name: string) => string;
}

const T: Record<Locale, Texts> = {
  az: {
    asap: 'mümkün qədər tez',
    confirmTitle: 'Zəng sifarişiniz qəbul edildi',
    confirm: (w) => `Təşəkkür edirik! Əməkdaşımız sizə ${w} zəng edəcək.`,
    taskTitle: (n, w) => `Geri zəng: ${n} · ${w}`,
    reminderTitle: (n) => `10 dəqiqəyə zəng: ${n}`,
    reminderBody: (p, w) => `${p} nömrəsinə ${w} zəng edin.`,
    inboundTitle: (w) => `Gələn zəng: ${w}`,
    missedTitle: (w) => `Buraxılmış zəng: ${w}`,
    closed: 'Triad Vision-a zəng etdiyiniz üçün təşəkkür edirik. Hazırda iş vaxtı deyil, sizə geri zəng edəcəyik.',
    chatAccepted: (n) => `${n} söhbətə qoşuldu.`,
    chatClosed: 'Söhbət bitdi. Təşəkkür edirik!',
    chatMissed: 'Hazırda bütün əməkdaşlar məşğuldur. Əlaqə məlumatınızı qoyun — sizinlə əlaqə saxlayacağıq.',
    chatQueueTitle: 'Yeni canlı söhbət',
    chatQueueBody: (n) => `${n} əməkdaşla danışmaq istəyir.`,
  },
  de: {
    asap: 'so bald wie möglich',
    confirmTitle: 'Ihr Rückrufwunsch ist eingegangen',
    confirm: (w) => `Vielen Dank! Unser Mitarbeiter ruft Sie ${w} an.`,
    taskTitle: (n, w) => `Rückruf: ${n} · ${w}`,
    reminderTitle: (n) => `Rückruf in 10 Minuten: ${n}`,
    reminderBody: (p, w) => `Bitte ${p} anrufen (${w}).`,
    inboundTitle: (w) => `Eingehender Anruf: ${w}`,
    missedTitle: (w) => `Verpasster Anruf: ${w}`,
    closed: 'Vielen Dank für Ihren Anruf bei Triad Vision. Wir sind gerade nicht erreichbar und rufen Sie zurück.',
    chatAccepted: (n) => `${n} ist dem Chat beigetreten.`,
    chatClosed: 'Der Chat wurde beendet. Vielen Dank!',
    chatMissed: 'Im Moment sind alle Mitarbeiter beschäftigt. Hinterlassen Sie bitte Ihre Kontaktdaten – wir melden uns bei Ihnen.',
    chatQueueTitle: 'Neuer Live-Chat',
    chatQueueBody: (n) => `${n} möchte mit einem Mitarbeiter sprechen.`,
  },
  en: {
    asap: 'as soon as possible',
    confirmTitle: 'Your callback request was received',
    confirm: (w) => `Thank you! Our colleague will call you ${w}.`,
    taskTitle: (n, w) => `Call back: ${n} · ${w}`,
    reminderTitle: (n) => `Callback in 10 minutes: ${n}`,
    reminderBody: (p, w) => `Please call ${p} (${w}).`,
    inboundTitle: (w) => `Incoming call: ${w}`,
    missedTitle: (w) => `Missed call: ${w}`,
    closed: 'Thank you for calling Triad Vision. We are not available right now and will call you back.',
    chatAccepted: (n) => `${n} joined the chat.`,
    chatClosed: 'The chat has ended. Thank you!',
    chatMissed: 'All our colleagues are busy right now. Please leave your contact details and we will get back to you.',
    chatQueueTitle: 'New live chat',
    chatQueueBody: (n) => `${n} would like to talk to a colleague.`,
  },
  ru: {
    asap: 'как можно скорее',
    confirmTitle: 'Ваша заявка на звонок принята',
    confirm: (w) => `Спасибо! Наш сотрудник позвонит вам ${w}.`,
    taskTitle: (n, w) => `Перезвонить: ${n} · ${w}`,
    reminderTitle: (n) => `Звонок через 10 минут: ${n}`,
    reminderBody: (p, w) => `Позвоните, пожалуйста, на ${p} (${w}).`,
    inboundTitle: (w) => `Входящий звонок: ${w}`,
    missedTitle: (w) => `Пропущенный звонок: ${w}`,
    closed: 'Спасибо за звонок в Triad Vision. Сейчас мы недоступны и перезвоним вам.',
    chatAccepted: (n) => `${n} подключился к чату.`,
    chatClosed: 'Чат завершён. Спасибо!',
    chatMissed: 'Сейчас все сотрудники заняты. Оставьте, пожалуйста, ваши контактные данные — мы с вами свяжемся.',
    chatQueueTitle: 'Новый живой чат',
    chatQueueBody: (n) => `${n} хочет поговорить с сотрудником.`,
  },
};

export const callTexts = (l: Locale | string) => T[asLocale(l)];
