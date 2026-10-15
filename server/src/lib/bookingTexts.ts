/**
 * Email / notification texts for consultation bookings in all four site languages.
 * Times are always shown twice: Baku (where most candidates are) and Berlin (employers, our German office).
 */
export type BookingLocale = 'az' | 'de' | 'en' | 'ru';

export const asBookingLocale = (l: string | null | undefined): BookingLocale =>
  l === 'de' || l === 'en' || l === 'ru' || l === 'az' ? l : 'az';

const INTL: Record<BookingLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

const fmt = (d: Date, locale: BookingLocale, timeZone: string, withDate: boolean) =>
  new Intl.DateTimeFormat(INTL[locale], {
    ...(withDate ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(d);

const CITY: Record<BookingLocale, { baku: string; berlin: string }> = {
  az: { baku: 'Bakı', berlin: 'Berlin' },
  de: { baku: 'Baku', berlin: 'Berlin' },
  en: { baku: 'Baku', berlin: 'Berlin' },
  ru: { baku: 'Баку', berlin: 'Берлин' },
};

/** "Monday, 20 October 2026, 14:00 (Baku) · 12:00 (Berlin)" in the reader's language. */
export const formatSlot = (start: Date, locale: BookingLocale) =>
  `${fmt(start, locale, 'Asia/Baku', true)} (${CITY[locale].baku}, GMT+4)\n${fmt(start, locale, 'Europe/Berlin', true)} (${CITY[locale].berlin})`;

export const formatSlotShort = (start: Date, locale: BookingLocale) =>
  `${fmt(start, locale, 'Asia/Baku', true)} (${CITY[locale].baku}) / ${fmt(start, locale, 'Europe/Berlin', false)} (${CITY[locale].berlin})`;

export const TOPIC_LABEL: Record<BookingLocale, Record<string, string>> = {
  az: { candidate: 'Namizəd (Almaniyada iş)', company: 'Şirkət (işçi axtarışı)', other: 'Digər sual' },
  de: { candidate: 'Bewerber (Arbeit in Deutschland)', company: 'Unternehmen (Personalsuche)', other: 'Sonstiges' },
  en: { candidate: 'Candidate (work in Germany)', company: 'Company (hiring workers)', other: 'Other question' },
  ru: { candidate: 'Кандидат (работа в Германии)', company: 'Компания (поиск работников)', other: 'Другой вопрос' },
};

export const topicLabel = (topic: string | null | undefined, locale: BookingLocale) =>
  TOPIC_LABEL[locale][topic ?? 'other'] ?? TOPIC_LABEL[locale].other;

interface Ctx {
  name: string;
  when: string;
  topic: string;
  meetingUrl: string;
  manageUrl: string;
  rebookUrl: string;
  staffName?: string;
  message?: string | null;
}

interface Msg {
  title: string;
  body: string;
  cta: string;
}

interface Catalogue {
  confirmed: (c: Ctx) => Msg;
  cancelledByBooker: (c: Ctx) => Msg;
  cancelledByStaff: (c: Ctx) => Msg;
  reminder24h: (c: Ctx) => Msg;
  reminder1h: (c: Ctx) => Msg;
  /** staff-side texts */
  staffNew: (c: Ctx) => { title: string; body: string };
  staffCancelled: (c: Ctx) => { title: string; body: string };
  staffReminder24h: (c: Ctx) => { title: string; body: string };
  staffReminder1h: (c: Ctx) => { title: string; body: string };
  icsSummary: string;
  icsDescription: (c: Ctx) => string;
}

const opt = (label: string, v?: string | null) => (v ? `\n\n${label}: ${v}` : '');

const az: Catalogue = {
  confirmed: (c) => ({
    title: 'Pulsuz məsləhət təsdiqləndi',
    body: `Salam, ${c.name}!\n\nTriad Vision ilə pulsuz video-məsləhətiniz təsdiqləndi.\n\nVaxt:\n${c.when}\n\nMövzu: ${c.topic}\n\nGörüş linki (Jitsi, quraşdırma tələb etmir):\n${c.meetingUrl}\n\nTəqvim faylı (.ics) məktuba əlavə olunub. Planlar dəyişərsə, aşağıdakı düymə ilə görüşü ləğv edə və ya yeni vaxt seçə bilərsiniz.`,
    cta: 'Görüşü idarə et',
  }),
  cancelledByBooker: (c) => ({
    title: 'Məsləhət ləğv edildi',
    body: `Salam, ${c.name}!\n\n${c.when}\n\nvaxtına olan məsləhətiniz ləğv edildi. İstənilən vaxt yeni görüş təyin edə bilərsiniz.`,
    cta: 'Yeni vaxt seç',
  }),
  cancelledByStaff: (c) => ({
    title: 'Məsləhət ləğv edildi',
    body: `Salam, ${c.name}!\n\nTəəssüf ki, ${c.when}\n\nvaxtına olan məsləhətinizi ləğv etməli olduq.${opt('Əməkdaşımızın qeydi', c.message)}\n\nZəhmət olmasa sizə uyğun yeni vaxt seçin.`,
    cta: 'Yeni vaxt seç',
  }),
  reminder24h: (c) => ({
    title: 'Xatırlatma: sabah məsləhətiniz var',
    body: `Salam, ${c.name}!\n\nTriad Vision ilə məsləhətiniz 24 saat sonra başlayır.\n\nVaxt:\n${c.when}\n\nGörüş linki:\n${c.meetingUrl}`,
    cta: 'Görüşü idarə et',
  }),
  reminder1h: (c) => ({
    title: 'Xatırlatma: məsləhət 1 saat sonra başlayır',
    body: `Salam, ${c.name}!\n\nMəsləhətiniz təxminən 1 saat sonra başlayır.\n\nVaxt:\n${c.when}\n\nGörüş linki:\n${c.meetingUrl}\n\nKamera və mikrofonunuzu əvvəlcədən yoxlayın.`,
    cta: 'Görüşü idarə et',
  }),
  staffNew: (c) => ({ title: `Yeni məsləhət: ${c.name}`, body: `${c.when}\n\nMövzu: ${c.topic}${opt('Mesaj', c.message)}\n\nLink: ${c.meetingUrl}` }),
  staffCancelled: (c) => ({ title: `Məsləhət ləğv edildi: ${c.name}`, body: `${c.when}\n\nSlot yenidən boşdur.${opt('Səbəb', c.message)}` }),
  staffReminder24h: (c) => ({ title: `Sabah məsləhət: ${c.name}`, body: `${c.when}\n\nMövzu: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  staffReminder1h: (c) => ({ title: `1 saat sonra məsləhət: ${c.name}`, body: `${c.when}\n\nMövzu: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  icsSummary: 'Triad Vision — pulsuz məsləhət',
  icsDescription: (c) => `Mövzu: ${c.topic}\nGörüş linki: ${c.meetingUrl}\nİdarə et / ləğv et: ${c.manageUrl}`,
};

const de: Catalogue = {
  confirmed: (c) => ({
    title: 'Ihre kostenlose Beratung ist bestätigt',
    body: `Hallo ${c.name},\n\nIhre kostenlose Video-Beratung mit Triad Vision ist bestätigt.\n\nTermin:\n${c.when}\n\nThema: ${c.topic}\n\nLink zum Gespräch (Jitsi, keine Installation nötig):\n${c.meetingUrl}\n\nEine Kalenderdatei (.ics) ist angehängt. Falls sich Ihre Pläne ändern, können Sie den Termin über die Schaltfläche unten absagen oder neu buchen.`,
    cta: 'Termin verwalten',
  }),
  cancelledByBooker: (c) => ({
    title: 'Beratung abgesagt',
    body: `Hallo ${c.name},\n\nIhr Beratungstermin am\n${c.when}\n\nwurde abgesagt. Sie können jederzeit einen neuen Termin buchen.`,
    cta: 'Neuen Termin wählen',
  }),
  cancelledByStaff: (c) => ({
    title: 'Beratung abgesagt',
    body: `Hallo ${c.name},\n\nleider müssen wir Ihren Beratungstermin am\n${c.when}\n\nabsagen.${opt('Hinweis unseres Teams', c.message)}\n\nBitte wählen Sie einen neuen Termin, der Ihnen passt.`,
    cta: 'Neuen Termin wählen',
  }),
  reminder24h: (c) => ({
    title: 'Erinnerung: Ihre Beratung ist morgen',
    body: `Hallo ${c.name},\n\nIhre Beratung mit Triad Vision beginnt in 24 Stunden.\n\nTermin:\n${c.when}\n\nLink zum Gespräch:\n${c.meetingUrl}`,
    cta: 'Termin verwalten',
  }),
  reminder1h: (c) => ({
    title: 'Erinnerung: Ihre Beratung beginnt in 1 Stunde',
    body: `Hallo ${c.name},\n\nIhre Beratung beginnt in etwa einer Stunde.\n\nTermin:\n${c.when}\n\nLink zum Gespräch:\n${c.meetingUrl}\n\nBitte prüfen Sie vorab Kamera und Mikrofon.`,
    cta: 'Termin verwalten',
  }),
  staffNew: (c) => ({ title: `Neue Beratung: ${c.name}`, body: `${c.when}\n\nThema: ${c.topic}${opt('Nachricht', c.message)}\n\nLink: ${c.meetingUrl}` }),
  staffCancelled: (c) => ({ title: `Beratung abgesagt: ${c.name}`, body: `${c.when}\n\nDer Termin ist wieder frei.${opt('Grund', c.message)}` }),
  staffReminder24h: (c) => ({ title: `Morgen Beratung: ${c.name}`, body: `${c.when}\n\nThema: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  staffReminder1h: (c) => ({ title: `Beratung in 1 Stunde: ${c.name}`, body: `${c.when}\n\nThema: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  icsSummary: 'Triad Vision — kostenlose Beratung',
  icsDescription: (c) => `Thema: ${c.topic}\nLink zum Gespräch: ${c.meetingUrl}\nVerwalten / absagen: ${c.manageUrl}`,
};

const en: Catalogue = {
  confirmed: (c) => ({
    title: 'Your free consultation is confirmed',
    body: `Hello ${c.name},\n\nYour free video consultation with Triad Vision is confirmed.\n\nTime:\n${c.when}\n\nTopic: ${c.topic}\n\nMeeting link (Jitsi, nothing to install):\n${c.meetingUrl}\n\nA calendar file (.ics) is attached. If your plans change, you can cancel or rebook with the button below.`,
    cta: 'Manage booking',
  }),
  cancelledByBooker: (c) => ({
    title: 'Consultation cancelled',
    body: `Hello ${c.name},\n\nYour consultation on\n${c.when}\n\nwas cancelled. You can book a new time whenever you like.`,
    cta: 'Pick a new time',
  }),
  cancelledByStaff: (c) => ({
    title: 'Consultation cancelled',
    body: `Hello ${c.name},\n\nunfortunately we have to cancel your consultation on\n${c.when}.${opt('Note from our team', c.message)}\n\nPlease pick a new time that suits you.`,
    cta: 'Pick a new time',
  }),
  reminder24h: (c) => ({
    title: 'Reminder: your consultation is tomorrow',
    body: `Hello ${c.name},\n\nYour consultation with Triad Vision starts in 24 hours.\n\nTime:\n${c.when}\n\nMeeting link:\n${c.meetingUrl}`,
    cta: 'Manage booking',
  }),
  reminder1h: (c) => ({
    title: 'Reminder: your consultation starts in 1 hour',
    body: `Hello ${c.name},\n\nYour consultation starts in about one hour.\n\nTime:\n${c.when}\n\nMeeting link:\n${c.meetingUrl}\n\nPlease check your camera and microphone beforehand.`,
    cta: 'Manage booking',
  }),
  staffNew: (c) => ({ title: `New consultation: ${c.name}`, body: `${c.when}\n\nTopic: ${c.topic}${opt('Message', c.message)}\n\nLink: ${c.meetingUrl}` }),
  staffCancelled: (c) => ({ title: `Consultation cancelled: ${c.name}`, body: `${c.when}\n\nThe slot is free again.${opt('Reason', c.message)}` }),
  staffReminder24h: (c) => ({ title: `Consultation tomorrow: ${c.name}`, body: `${c.when}\n\nTopic: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  staffReminder1h: (c) => ({ title: `Consultation in 1 hour: ${c.name}`, body: `${c.when}\n\nTopic: ${c.topic}\n\nLink: ${c.meetingUrl}` }),
  icsSummary: 'Triad Vision — free consultation',
  icsDescription: (c) => `Topic: ${c.topic}\nMeeting link: ${c.meetingUrl}\nManage / cancel: ${c.manageUrl}`,
};

const ru: Catalogue = {
  confirmed: (c) => ({
    title: 'Бесплатная консультация подтверждена',
    body: `Здравствуйте, ${c.name}!\n\nВаша бесплатная видеоконсультация с Triad Vision подтверждена.\n\nВремя:\n${c.when}\n\nТема: ${c.topic}\n\nСсылка на встречу (Jitsi, установка не нужна):\n${c.meetingUrl}\n\nФайл календаря (.ics) приложен к письму. Если планы изменятся, вы можете отменить встречу или выбрать новое время по кнопке ниже.`,
    cta: 'Управлять записью',
  }),
  cancelledByBooker: (c) => ({
    title: 'Консультация отменена',
    body: `Здравствуйте, ${c.name}!\n\nВаша консультация на\n${c.when}\n\nотменена. Вы можете записаться на новое время в любой момент.`,
    cta: 'Выбрать новое время',
  }),
  cancelledByStaff: (c) => ({
    title: 'Консультация отменена',
    body: `Здравствуйте, ${c.name}!\n\nК сожалению, нам пришлось отменить вашу консультацию на\n${c.when}.${opt('Комментарий нашего сотрудника', c.message)}\n\nПожалуйста, выберите новое удобное время.`,
    cta: 'Выбрать новое время',
  }),
  reminder24h: (c) => ({
    title: 'Напоминание: консультация завтра',
    body: `Здравствуйте, ${c.name}!\n\nВаша консультация с Triad Vision начнётся через 24 часа.\n\nВремя:\n${c.when}\n\nСсылка на встречу:\n${c.meetingUrl}`,
    cta: 'Управлять записью',
  }),
  reminder1h: (c) => ({
    title: 'Напоминание: консультация через 1 час',
    body: `Здравствуйте, ${c.name}!\n\nВаша консультация начнётся примерно через час.\n\nВремя:\n${c.when}\n\nСсылка на встречу:\n${c.meetingUrl}\n\nПожалуйста, заранее проверьте камеру и микрофон.`,
    cta: 'Управлять записью',
  }),
  staffNew: (c) => ({ title: `Новая консультация: ${c.name}`, body: `${c.when}\n\nТема: ${c.topic}${opt('Сообщение', c.message)}\n\nСсылка: ${c.meetingUrl}` }),
  staffCancelled: (c) => ({ title: `Консультация отменена: ${c.name}`, body: `${c.when}\n\nСлот снова свободен.${opt('Причина', c.message)}` }),
  staffReminder24h: (c) => ({ title: `Завтра консультация: ${c.name}`, body: `${c.when}\n\nТема: ${c.topic}\n\nСсылка: ${c.meetingUrl}` }),
  staffReminder1h: (c) => ({ title: `Консультация через 1 час: ${c.name}`, body: `${c.when}\n\nТема: ${c.topic}\n\nСсылка: ${c.meetingUrl}` }),
  icsSummary: 'Triad Vision — бесплатная консультация',
  icsDescription: (c) => `Тема: ${c.topic}\nСсылка на встречу: ${c.meetingUrl}\nУправление / отмена: ${c.manageUrl}`,
};

export const bookingTexts: Record<BookingLocale, Catalogue> = { az, de, en, ru };
