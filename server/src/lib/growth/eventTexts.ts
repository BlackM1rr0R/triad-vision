/**
 * E-mail texts for info sessions / webinars (public /events) in the four site languages.
 * German uses the formal "Sie", Russian the polite "вы".
 */
import { asBookingLocale, formatSlot, type BookingLocale } from '../bookingTexts.js';

export type EventLocale = BookingLocale;
export const asEventLocale = asBookingLocale;
export { formatSlot as formatEventTime };

export interface EventCtx {
  name: string;
  title: string;
  when: string;
  /** Jitsi link (online) or address (offline) */
  where: string;
  online: boolean;
  eventUrl: string;
  bookingUrl: string;
  note?: string;
  /** Personal .ics link of the registrant (includes the join link). */
  icsUrl?: string;
  /** Recording of the past event (follow-up mail). */
  recordingUrl?: string;
}

interface Msg {
  title: string;
  body: string;
  cta: string;
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join('\n\n');
/** "Label: url" line, left out when there is no url. */
const line = (label: string, url?: string) => (url ? `${label}: ${url}` : null);

export const eventTexts: Record<
  EventLocale,
  {
    confirmed: (c: EventCtx) => Msg;
    reminder24h: (c: EventCtx) => Msg;
    reminder1h: (c: EventCtx) => Msg;
    cancelled: (c: EventCtx) => Msg;
    followUp: (c: EventCtx) => Msg;
    whereLabel: (online: boolean) => string;
    icsDescription: (c: EventCtx) => string;
  }
> = {
  az: {
    confirmed: (c) => ({
      title: `Qeydiyyat təsdiqləndi: ${c.title}`,
      body: join(
        `Salam, ${c.name}!`,
        `"${c.title}" tədbirinə qeydiyyatınız təsdiqləndi.`,
        `Vaxt:\n${c.when}`,
        `${c.online ? 'Onlayn qoşulma linki' : 'Ünvan'}: ${c.where}`,
        'Təqvim faylı (.ics) əlavə olunub. Tədbirdən 24 saat və 1 saat əvvəl xatırlatma göndərəcəyik.',
        line('Təqvimə əlavə et', c.icsUrl),
      ),
      cta: 'Tədbirə bax',
    }),
    reminder24h: (c) => ({
      title: `Sabah: ${c.title}`,
      body: join(`Salam, ${c.name}!`, `"${c.title}" tədbiri sabahdır.`, `Vaxt:\n${c.when}`, `${c.online ? 'Qoşulma linki' : 'Ünvan'}: ${c.where}`, line('Təqvimə əlavə et (.ics)', c.icsUrl)),
      cta: c.online ? 'Linki aç' : 'Tədbirə bax',
    }),
    reminder1h: (c) => ({
      title: `1 saat sonra: ${c.title}`,
      body: join(`Salam, ${c.name}!`, `"${c.title}" 1 saatdan sonra başlayır.`, `${c.online ? 'Qoşulma linki' : 'Ünvan'}: ${c.where}`),
      cta: c.online ? 'Qoşul' : 'Tədbirə bax',
    }),
    cancelled: (c) => ({
      title: `Tədbir ləğv edildi: ${c.title}`,
      body: join(`Salam, ${c.name}!`, `Təəssüf ki, "${c.title}" tədbiri (${c.when.split('\n')[0]}) ləğv edildi.`, 'Növbəti tədbirlərə saytımızda baxa və ya pulsuz konsultasiya təyin edə bilərsiniz.'),
      cta: 'Pulsuz konsultasiya',
    }),
    followUp: (c) => ({
      title: `İştirakınız üçün təşəkkürlər — ${c.title}`,
      body: join(
        `Salam, ${c.name}!`,
        `"${c.title}" tədbirində iştirak etdiyiniz üçün təşəkkür edirik.`,
        c.note,
        line('Tədbirin video yazısı', c.recordingUrl),
        'Növbəti addım: şəxsi vəziyyətinizi müzakirə etmək üçün pulsuz konsultasiya təyin edin — sizə uyğun viza yolunu və müddətləri birlikdə dəqiqləşdirək.',
      ),
      cta: 'Pulsuz konsultasiya təyin et',
    }),
    whereLabel: (online) => (online ? 'Onlayn (Jitsi)' : 'Ofis'),
    icsDescription: (c) => join(c.title, c.online ? `Link: ${c.where}` : `Ünvan: ${c.where}`, c.eventUrl),
  },
  de: {
    confirmed: (c) => ({
      title: `Anmeldung bestätigt: ${c.title}`,
      body: join(
        `Guten Tag ${c.name},`,
        `Ihre Anmeldung zur Veranstaltung „${c.title}“ ist bestätigt.`,
        `Zeit:\n${c.when}`,
        `${c.online ? 'Link zur Teilnahme' : 'Adresse'}: ${c.where}`,
        'Die Kalenderdatei (.ics) ist angehängt. Wir erinnern Sie 24 Stunden und 1 Stunde vorher.',
        line('Zum Kalender hinzufügen', c.icsUrl),
      ),
      cta: 'Zur Veranstaltung',
    }),
    reminder24h: (c) => ({
      title: `Morgen: ${c.title}`,
      body: join(`Guten Tag ${c.name},`, `die Veranstaltung „${c.title}“ findet morgen statt.`, `Zeit:\n${c.when}`, `${c.online ? 'Link' : 'Adresse'}: ${c.where}`, line('Zum Kalender hinzufügen (.ics)', c.icsUrl)),
      cta: c.online ? 'Link öffnen' : 'Zur Veranstaltung',
    }),
    reminder1h: (c) => ({
      title: `In 1 Stunde: ${c.title}`,
      body: join(`Guten Tag ${c.name},`, `„${c.title}“ beginnt in einer Stunde.`, `${c.online ? 'Link' : 'Adresse'}: ${c.where}`),
      cta: c.online ? 'Teilnehmen' : 'Zur Veranstaltung',
    }),
    cancelled: (c) => ({
      title: `Veranstaltung abgesagt: ${c.title}`,
      body: join(`Guten Tag ${c.name},`, `leider müssen wir „${c.title}“ (${c.when.split('\n')[0]}) absagen.`, 'Weitere Termine finden Sie auf unserer Website, oder vereinbaren Sie eine kostenlose Beratung.'),
      cta: 'Kostenlose Beratung',
    }),
    followUp: (c) => ({
      title: `Danke für Ihre Teilnahme — ${c.title}`,
      body: join(
        `Guten Tag ${c.name},`,
        `vielen Dank für Ihre Teilnahme an „${c.title}“.`,
        c.note,
        line('Aufzeichnung der Veranstaltung', c.recordingUrl),
        'Nächster Schritt: Vereinbaren Sie eine kostenlose Beratung — wir klären gemeinsam Ihren passenden Visumweg und den Zeitplan.',
      ),
      cta: 'Kostenlose Beratung buchen',
    }),
    whereLabel: (online) => (online ? 'Online (Jitsi)' : 'Vor Ort'),
    icsDescription: (c) => join(c.title, c.online ? `Link: ${c.where}` : `Adresse: ${c.where}`, c.eventUrl),
  },
  en: {
    confirmed: (c) => ({
      title: `Registration confirmed: ${c.title}`,
      body: join(
        `Hello ${c.name},`,
        `your registration for "${c.title}" is confirmed.`,
        `Time:\n${c.when}`,
        `${c.online ? 'Join link' : 'Address'}: ${c.where}`,
        'The calendar file (.ics) is attached. We will remind you 24 hours and 1 hour before.',
        line('Add to calendar', c.icsUrl),
      ),
      cta: 'View event',
    }),
    reminder24h: (c) => ({
      title: `Tomorrow: ${c.title}`,
      body: join(`Hello ${c.name},`, `"${c.title}" takes place tomorrow.`, `Time:\n${c.when}`, `${c.online ? 'Join link' : 'Address'}: ${c.where}`, line('Add to calendar (.ics)', c.icsUrl)),
      cta: c.online ? 'Open link' : 'View event',
    }),
    reminder1h: (c) => ({
      title: `In 1 hour: ${c.title}`,
      body: join(`Hello ${c.name},`, `"${c.title}" starts in one hour.`, `${c.online ? 'Join link' : 'Address'}: ${c.where}`),
      cta: c.online ? 'Join' : 'View event',
    }),
    cancelled: (c) => ({
      title: `Event cancelled: ${c.title}`,
      body: join(`Hello ${c.name},`, `unfortunately "${c.title}" (${c.when.split('\n')[0]}) has been cancelled.`, 'See our upcoming events on the website or book a free consultation.'),
      cta: 'Free consultation',
    }),
    followUp: (c) => ({
      title: `Thanks for attending — ${c.title}`,
      body: join(
        `Hello ${c.name},`,
        `thank you for attending "${c.title}".`,
        c.note,
        line('Recording of the session', c.recordingUrl),
        'Next step: book your free consultation — together we will work out the right visa path and timeline for you.',
      ),
      cta: 'Book your free consultation',
    }),
    whereLabel: (online) => (online ? 'Online (Jitsi)' : 'In person'),
    icsDescription: (c) => join(c.title, c.online ? `Link: ${c.where}` : `Address: ${c.where}`, c.eventUrl),
  },
  ru: {
    confirmed: (c) => ({
      title: `Регистрация подтверждена: ${c.title}`,
      body: join(
        `Здравствуйте, ${c.name}!`,
        `Ваша регистрация на «${c.title}» подтверждена.`,
        `Время:\n${c.when}`,
        `${c.online ? 'Ссылка для подключения' : 'Адрес'}: ${c.where}`,
        'Файл календаря (.ics) во вложении. Мы напомним вам за 24 часа и за 1 час.',
        line('Добавить в календарь', c.icsUrl),
      ),
      cta: 'Открыть мероприятие',
    }),
    reminder24h: (c) => ({
      title: `Завтра: ${c.title}`,
      body: join(`Здравствуйте, ${c.name}!`, `Мероприятие «${c.title}» состоится завтра.`, `Время:\n${c.when}`, `${c.online ? 'Ссылка' : 'Адрес'}: ${c.where}`, line('Добавить в календарь (.ics)', c.icsUrl)),
      cta: c.online ? 'Открыть ссылку' : 'Открыть мероприятие',
    }),
    reminder1h: (c) => ({
      title: `Через 1 час: ${c.title}`,
      body: join(`Здравствуйте, ${c.name}!`, `«${c.title}» начнётся через час.`, `${c.online ? 'Ссылка' : 'Адрес'}: ${c.where}`),
      cta: c.online ? 'Подключиться' : 'Открыть мероприятие',
    }),
    cancelled: (c) => ({
      title: `Мероприятие отменено: ${c.title}`,
      body: join(`Здравствуйте, ${c.name}!`, `К сожалению, «${c.title}» (${c.when.split('\n')[0]}) отменено.`, 'Другие мероприятия смотрите на сайте — или запишитесь на бесплатную консультацию.'),
      cta: 'Бесплатная консультация',
    }),
    followUp: (c) => ({
      title: `Спасибо за участие — ${c.title}`,
      body: join(
        `Здравствуйте, ${c.name}!`,
        `Спасибо, что приняли участие в «${c.title}».`,
        c.note,
        line('Запись мероприятия', c.recordingUrl),
        'Следующий шаг: запишитесь на бесплатную консультацию — вместе подберём подходящий визовый путь и сроки.',
      ),
      cta: 'Записаться на бесплатную консультацию',
    }),
    whereLabel: (online) => (online ? 'Онлайн (Jitsi)' : 'Очно'),
    icsDescription: (c) => join(c.title, c.online ? `Ссылка: ${c.where}` : `Адрес: ${c.where}`, c.eventUrl),
  },
};
