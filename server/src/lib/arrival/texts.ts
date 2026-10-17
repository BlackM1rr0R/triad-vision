import type { HousingStatus, Locale } from '@prisma/client';

/** Notification texts for arrival planning (pickup, first accommodation), in the four portal languages. */

export type ArrivalNoticeKind =
  // to the client
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'UPDATED'
  | 'REMINDER_48H'
  | 'REMINDER_6H'
  // to staff
  | 'SUBMITTED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_CANCELLED'
  | 'ASSIGNED'
  | 'STAFF_REMINDER_48H'
  | 'STAFF_REMINDER_6H'
  | 'STALE';

export interface ArrivalNoticeParams {
  number: string; // case number
  client?: string;
  flight?: string | null;
  when?: string | null; // formatted arrival time
  airport?: string | null;
  pickup?: string | null; // pickup details written by staff (only when confirmed)
  housing?: string | null; // housing status label + details
  note?: string | null;
}

type Texts = Record<ArrivalNoticeKind, (p: ArrivalNoticeParams) => { title: string; body: string }>;

const line = (label: string, v?: string | null) => (v ? `\n\n${label}: ${v}` : '');
const flightLine = (p: ArrivalNoticeParams, labels: { flight: string; when: string; airport: string }) =>
  [p.flight ? `${labels.flight}: ${p.flight}` : null, p.when ? `${labels.when}: ${p.when}` : null, p.airport ? `${labels.airport}: ${p.airport}` : null]
    .filter(Boolean)
    .join('\n');
const block = (s: string) => (s ? `\n\n${s}` : '');

const az: Texts = (() => {
  const L = { flight: 'Reys', when: 'Gəliş', airport: 'Hava limanı' };
  const details = (p: ArrivalNoticeParams) => block(flightLine(p, L)) + line('Hava limanında qarşılanma', p.pickup) + line('İlk yaşayış yeri', p.housing);
  return {
    CONFIRMED: (p) => ({ title: 'Gəliş planınız təsdiqləndi', body: 'Komandamız Almaniyaya gəliş planınızı təsdiqlədi.' + details(p) + line('Qeyd', p.note) }),
    COMPLETED: (p) => ({
      title: 'Almaniyaya xoş gəlmisiniz!',
      body: 'Gəlişiniz qeydə alındı. İndi kabinetinizdəki "İlk addımlar" siyahısı ilə qeydiyyat (Anmeldung), bank hesabı, sığorta və digər addımları izləyin.' + line('Qeyd', p.note),
    }),
    CANCELLED: (p) => ({ title: 'Gəliş planı ləğv edildi', body: 'Gəliş planınız ləğv edildi.' + line('Səbəb', p.note) }),
    UPDATED: (p) => ({ title: 'Gəliş planınızda yenilik var', body: 'Komandamız gəliş planınızı yenilədi.' + details(p) + line('Qeyd', p.note) }),
    REMINDER_48H: (p) => ({ title: 'Almaniyaya gəlişinizə 2 gün qalıb', body: 'Xatırlatma: tezliklə yola düşürsünüz. Pasportunuzu, vizanızı və vacib sənədlərin orijinallarını əl yükündə saxlayın.' + details(p) }),
    REMINDER_6H: (p) => ({ title: 'Gəlişinizə bir neçə saat qalıb', body: 'Uğurlu səfər! Telefonunuz yüklü olsun, qarşılanma məlumatlarını əlinizin altında saxlayın.' + details(p) }),
    SUBMITTED: (p) => ({ title: `Yeni gəliş planı: ${p.client} (${p.number})`, body: `${p.client} gəliş planını göndərdi.` + details(p) + line('Müştərinin qeydi', p.note) }),
    CLIENT_UPDATED: (p) => ({ title: `Gəliş planı dəyişdi: ${p.client} (${p.number})`, body: `${p.client} gəliş planını yenilədi.` + details(p) }),
    CLIENT_CANCELLED: (p) => ({ title: `Gəliş planı ləğv edildi: ${p.client} (${p.number})`, body: `${p.client} gəliş planını ləğv etdi.` }),
    ASSIGNED: (p) => ({ title: `Sizə gəliş planı təyin edildi: ${p.client} (${p.number})`, body: 'Gəliş planı sizə təyin edildi.' + details(p) }),
    STAFF_REMINDER_48H: (p) => ({ title: `Gəliş 48 saat sonra: ${p.client}`, body: 'Qarşılanma və yaşayış yerinin hazır olduğunu yoxlayın.' + details(p) }),
    STAFF_REMINDER_6H: (p) => ({ title: `Gəliş 6 saat sonra: ${p.client}`, body: 'Müştəri tezliklə Almaniyaya çatır.' + details(p) }),
    STALE: (p) => ({ title: `Gəliş planı cavab gözləyir: ${p.client} (${p.number})`, body: 'Göndərilmiş gəliş planı 2 gündür işlənməyib.' + details(p) }),
  };
})();

const de: Texts = (() => {
  const L = { flight: 'Flug', when: 'Ankunft', airport: 'Flughafen' };
  const details = (p: ArrivalNoticeParams) => block(flightLine(p, L)) + line('Abholung am Flughafen', p.pickup) + line('Erste Unterkunft', p.housing);
  return {
    CONFIRMED: (p) => ({ title: 'Ihr Ankunftsplan ist bestätigt', body: 'Unser Team hat Ihren Ankunftsplan für Deutschland bestätigt.' + details(p) + line('Hinweis', p.note) }),
    COMPLETED: (p) => ({
      title: 'Willkommen in Deutschland!',
      body: 'Ihre Ankunft ist vermerkt. Folgen Sie jetzt der Checkliste „Erste Schritte“ in Ihrem Kundenbereich: Anmeldung, Bankkonto, Versicherung und mehr.' + line('Hinweis', p.note),
    }),
    CANCELLED: (p) => ({ title: 'Ankunftsplan storniert', body: 'Ihr Ankunftsplan wurde storniert.' + line('Grund', p.note) }),
    UPDATED: (p) => ({ title: 'Neuigkeiten zu Ihrem Ankunftsplan', body: 'Unser Team hat Ihren Ankunftsplan aktualisiert.' + details(p) + line('Hinweis', p.note) }),
    REMINDER_48H: (p) => ({ title: 'Noch 2 Tage bis zu Ihrer Ankunft', body: 'Erinnerung: Bald geht es los. Reisepass, Visum und die Originale wichtiger Dokumente gehören ins Handgepäck.' + details(p) }),
    REMINDER_6H: (p) => ({ title: 'Ihre Ankunft ist in wenigen Stunden', body: 'Gute Reise! Halten Sie Ihr Telefon geladen und die Abholdaten griffbereit.' + details(p) }),
    SUBMITTED: (p) => ({ title: `Neuer Ankunftsplan: ${p.client} (${p.number})`, body: `${p.client} hat einen Ankunftsplan gesendet.` + details(p) + line('Hinweis des Kunden', p.note) }),
    CLIENT_UPDATED: (p) => ({ title: `Ankunftsplan geändert: ${p.client} (${p.number})`, body: `${p.client} hat den Ankunftsplan geändert.` + details(p) }),
    CLIENT_CANCELLED: (p) => ({ title: `Ankunftsplan storniert: ${p.client} (${p.number})`, body: `${p.client} hat den Ankunftsplan storniert.` }),
    ASSIGNED: (p) => ({ title: `Ankunftsplan zugewiesen: ${p.client} (${p.number})`, body: 'Ihnen wurde ein Ankunftsplan zugewiesen.' + details(p) }),
    STAFF_REMINDER_48H: (p) => ({ title: `Ankunft in 48 Stunden: ${p.client}`, body: 'Bitte prüfen, ob Abholung und Unterkunft organisiert sind.' + details(p) }),
    STAFF_REMINDER_6H: (p) => ({ title: `Ankunft in 6 Stunden: ${p.client}`, body: 'Der Kunde landet bald in Deutschland.' + details(p) }),
    STALE: (p) => ({ title: `Ankunftsplan wartet: ${p.client} (${p.number})`, body: 'Ein gesendeter Ankunftsplan ist seit 2 Tagen unbearbeitet.' + details(p) }),
  };
})();

const en: Texts = (() => {
  const L = { flight: 'Flight', when: 'Arrival', airport: 'Airport' };
  const details = (p: ArrivalNoticeParams) => block(flightLine(p, L)) + line('Airport pickup', p.pickup) + line('First accommodation', p.housing);
  return {
    CONFIRMED: (p) => ({ title: 'Your arrival plan is confirmed', body: 'Our team has confirmed your arrival plan for Germany.' + details(p) + line('Note', p.note) }),
    COMPLETED: (p) => ({
      title: 'Welcome to Germany!',
      body: 'Your arrival has been recorded. Now follow the "First steps" checklist in your account: registration (Anmeldung), bank account, insurance and more.' + line('Note', p.note),
    }),
    CANCELLED: (p) => ({ title: 'Arrival plan cancelled', body: 'Your arrival plan was cancelled.' + line('Reason', p.note) }),
    UPDATED: (p) => ({ title: 'Update on your arrival plan', body: 'Our team updated your arrival plan.' + details(p) + line('Note', p.note) }),
    REMINDER_48H: (p) => ({ title: '2 days until you arrive in Germany', body: 'Reminder: you travel soon. Keep your passport, visa and the originals of important documents in your hand luggage.' + details(p) }),
    REMINDER_6H: (p) => ({ title: 'You arrive in a few hours', body: 'Have a good trip! Keep your phone charged and the pickup details at hand.' + details(p) }),
    SUBMITTED: (p) => ({ title: `New arrival plan: ${p.client} (${p.number})`, body: `${p.client} submitted an arrival plan.` + details(p) + line('Client note', p.note) }),
    CLIENT_UPDATED: (p) => ({ title: `Arrival plan changed: ${p.client} (${p.number})`, body: `${p.client} changed the arrival plan.` + details(p) }),
    CLIENT_CANCELLED: (p) => ({ title: `Arrival plan cancelled: ${p.client} (${p.number})`, body: `${p.client} cancelled the arrival plan.` }),
    ASSIGNED: (p) => ({ title: `Arrival plan assigned to you: ${p.client} (${p.number})`, body: 'An arrival plan was assigned to you.' + details(p) }),
    STAFF_REMINDER_48H: (p) => ({ title: `Arrival in 48 hours: ${p.client}`, body: 'Please check that pickup and accommodation are organised.' + details(p) }),
    STAFF_REMINDER_6H: (p) => ({ title: `Arrival in 6 hours: ${p.client}`, body: 'The client lands in Germany soon.' + details(p) }),
    STALE: (p) => ({ title: `Arrival plan waiting: ${p.client} (${p.number})`, body: 'A submitted arrival plan has not been handled for 2 days.' + details(p) }),
  };
})();

const ru: Texts = (() => {
  const L = { flight: 'Рейс', when: 'Прибытие', airport: 'Аэропорт' };
  const details = (p: ArrivalNoticeParams) => block(flightLine(p, L)) + line('Встреча в аэропорту', p.pickup) + line('Первое жильё', p.housing);
  return {
    CONFIRMED: (p) => ({ title: 'Ваш план приезда подтверждён', body: 'Наша команда подтвердила ваш план приезда в Германию.' + details(p) + line('Примечание', p.note) }),
    COMPLETED: (p) => ({
      title: 'Добро пожаловать в Германию!',
      body: 'Ваш приезд отмечен. Теперь следуйте чек-листу «Первые шаги» в личном кабинете: регистрация (Anmeldung), банковский счёт, страховка и другое.' + line('Примечание', p.note),
    }),
    CANCELLED: (p) => ({ title: 'План приезда отменён', body: 'Ваш план приезда отменён.' + line('Причина', p.note) }),
    UPDATED: (p) => ({ title: 'Новости по вашему плану приезда', body: 'Наша команда обновила ваш план приезда.' + details(p) + line('Примечание', p.note) }),
    REMINDER_48H: (p) => ({ title: 'До приезда в Германию 2 дня', body: 'Напоминание: скоро в путь. Паспорт, виза и оригиналы важных документов должны быть в ручной клади.' + details(p) }),
    REMINDER_6H: (p) => ({ title: 'До прибытия несколько часов', body: 'Счастливого пути! Держите телефон заряженным, а данные встречи — под рукой.' + details(p) }),
    SUBMITTED: (p) => ({ title: `Новый план приезда: ${p.client} (${p.number})`, body: `${p.client} отправил(а) план приезда.` + details(p) + line('Комментарий клиента', p.note) }),
    CLIENT_UPDATED: (p) => ({ title: `План приезда изменён: ${p.client} (${p.number})`, body: `${p.client} изменил(а) план приезда.` + details(p) }),
    CLIENT_CANCELLED: (p) => ({ title: `План приезда отменён: ${p.client} (${p.number})`, body: `${p.client} отменил(а) план приезда.` }),
    ASSIGNED: (p) => ({ title: `Вам назначен план приезда: ${p.client} (${p.number})`, body: 'Вам назначен план приезда.' + details(p) }),
    STAFF_REMINDER_48H: (p) => ({ title: `Прибытие через 48 часов: ${p.client}`, body: 'Проверьте, организованы ли встреча и жильё.' + details(p) }),
    STAFF_REMINDER_6H: (p) => ({ title: `Прибытие через 6 часов: ${p.client}`, body: 'Клиент скоро прилетает в Германию.' + details(p) }),
    STALE: (p) => ({ title: `План приезда ждёт ответа: ${p.client} (${p.number})`, body: 'Отправленный план приезда не обработан уже 2 дня.' + details(p) }),
  };
})();

const catalogs: Record<Locale, Texts> = { az, de, en, ru };

export const arrivalNotice = (kind: ArrivalNoticeKind, locale: Locale, p: ArrivalNoticeParams) => (catalogs[locale] ?? az)[kind](p);

const HOUSING: Record<Locale, Record<HousingStatus, string>> = {
  az: { NONE: 'Tələb olunmayıb', REQUESTED: 'Sorğu göndərilib', SEARCHING: 'Axtarılır', OFFERED: 'Təklif var', ARRANGED: 'Hazırdır' },
  de: { NONE: 'Nicht angefragt', REQUESTED: 'Angefragt', SEARCHING: 'Wird gesucht', OFFERED: 'Angebot liegt vor', ARRANGED: 'Organisiert' },
  en: { NONE: 'Not requested', REQUESTED: 'Requested', SEARCHING: 'Searching', OFFERED: 'Offer available', ARRANGED: 'Arranged' },
  ru: { NONE: 'Не запрошено', REQUESTED: 'Запрос отправлен', SEARCHING: 'Ищем', OFFERED: 'Есть предложение', ARRANGED: 'Готово' },
};
export const housingLabel = (s: HousingStatus, locale: Locale) => (HOUSING[locale] ?? HOUSING.az)[s];

const PICKUP_CONFIRMED: Record<Locale, string> = { az: 'Təsdiqləndi', de: 'Bestätigt', en: 'Confirmed', ru: 'Подтверждена' };
export const pickupConfirmedLabel = (locale: Locale) => PICKUP_CONFIRMED[locale] ?? PICKUP_CONFIRMED.az;

const TZ_LABEL: Record<Locale, string> = { az: 'Almaniya vaxtı', de: 'deutsche Zeit', en: 'German time', ru: 'время в Германии' };
const intlLocale: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Arrival times are shown in German local time: that is what the flight ticket says. */
export const formatArrival = (d: Date, locale: Locale) =>
  `${new Intl.DateTimeFormat(intlLocale[locale] ?? 'az-Latn-AZ', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(d)} (${TZ_LABEL[locale] ?? TZ_LABEL.az})`;

const ICS: Record<Locale, { summary: string; from: string; pickup: string; housing: string; travellers: string }> = {
  az: { summary: 'Almaniyaya gəliş', from: 'Haradan', pickup: 'Qarşılanma', housing: 'Yaşayış yeri', travellers: 'Səyahət edənlər' },
  de: { summary: 'Ankunft in Deutschland', from: 'Abflug', pickup: 'Abholung', housing: 'Unterkunft', travellers: 'Reisende' },
  en: { summary: 'Arrival in Germany', from: 'From', pickup: 'Pickup', housing: 'Accommodation', travellers: 'Travellers' },
  ru: { summary: 'Прибытие в Германию', from: 'Откуда', pickup: 'Встреча', housing: 'Жильё', travellers: 'Путешественники' },
};
export const icsLabels = (locale: Locale) => ICS[locale] ?? ICS.az;
