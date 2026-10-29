import type { Locale } from '@prisma/client';

/**
 * Texts of the client-process features (client tasks, office visits) in the four portal languages.
 * German uses the formal "Sie", Russian "вы". Staff notices that go through notifyStaff stay Azerbaijani
 * like the rest of the case flow; per-user notices use the recipient's language.
 */

export type L4 = Record<Locale, string>;

const DATE_LOCALE: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** "25 oktyabr 2026" (Baku calendar day). */
export const fmtDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baku' }).format(d);

/** "Monday, 25 October 2026, 10:30 (Baku)" */
export const fmtWhen = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Baku' }).format(d) +
  { az: ' (Bakı vaxtı)', de: ' (Ortszeit Baku)', en: ' (Baku time)', ru: ' (по Баку)' }[locale];

// ─── Task templates ───────────────────────────────────────────────────

export interface TaskTemplate {
  key: string;
  title: L4;
  description: L4;
  /** Suggested deadline in days from today. */
  dueDays: number;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    key: 'POLICE_CERT',
    title: { az: 'Polis arayışı alın', de: 'Beantragen Sie ein polizeiliches Führungszeugnis', en: 'Get a police clearance certificate', ru: 'Получите справку о несудимости' },
    description: {
      az: 'Daxili İşlər Nazirliyindən məhkumluq barədə arayış alın (ASAN xidmət və ya e-gov.az). Arayışı yükləyin və ya ofisə gətirin.',
      de: 'Beantragen Sie die Bescheinigung über das Nichtvorliegen einer Vorstrafe beim Innenministerium (ASAN-Service oder e-gov.az). Laden Sie sie hoch oder bringen Sie sie ins Büro.',
      en: 'Request the certificate of no criminal record from the Ministry of Internal Affairs (ASAN service or e-gov.az). Upload it or bring it to the office.',
      ru: 'Получите справку об отсутствии судимости в МВД (ASAN xidmət или e-gov.az). Загрузите её или принесите в офис.',
    },
    dueDays: 14,
  },
  {
    key: 'GOETHE_EXAM',
    title: { az: 'Goethe imtahanına yazılın', de: 'Melden Sie sich zur Goethe-Prüfung an', en: 'Register for the Goethe exam', ru: 'Запишитесь на экзамен Goethe' },
    description: {
      az: 'Goethe-Institut Bakıda tələb olunan səviyyə üçün imtahana qeydiyyatdan keçin və təsdiq məktubunu bizə göndərin.',
      de: 'Melden Sie sich beim Goethe-Institut Baku zur Prüfung auf dem geforderten Niveau an und senden Sie uns die Anmeldebestätigung.',
      en: 'Register at the Goethe-Institut Baku for the exam at the required level and send us the confirmation.',
      ru: 'Зарегистрируйтесь в Goethe-Institut Баку на экзамен нужного уровня и пришлите нам подтверждение.',
    },
    dueDays: 30,
  },
  {
    key: 'PASSPORT_PHOTO',
    title: { az: 'Pasport şəkli çəkdirin', de: 'Lassen Sie biometrische Passfotos machen', en: 'Get biometric passport photos', ru: 'Сделайте биометрические фото на паспорт' },
    description: {
      az: 'Biometrik şəkil: 35×45 mm, açıq fon, son 6 ay ərzində çəkilmiş. 2 ədəd.',
      de: 'Biometrisches Foto: 35×45 mm, heller Hintergrund, nicht älter als 6 Monate. 2 Stück.',
      en: 'Biometric photo: 35×45 mm, light background, taken within the last 6 months. 2 copies.',
      ru: 'Биометрическое фото: 35×45 мм, светлый фон, не старше 6 месяцев. 2 штуки.',
    },
    dueDays: 7,
  },
  {
    key: 'APOSTILLE',
    title: { az: 'Diplomunuza apostil qoydurun', de: 'Lassen Sie Ihr Diplom apostillieren', en: 'Get an apostille on your diploma', ru: 'Поставьте апостиль на диплом' },
    description: {
      az: 'Diplomun və əlavəsinin apostilini Ədliyyə Nazirliyində (ASAN xidmət) alın.',
      de: 'Lassen Sie Diplom und Anlage beim Justizministerium (ASAN-Service) apostillieren.',
      en: 'Have the diploma and its supplement apostilled at the Ministry of Justice (ASAN service).',
      ru: 'Поставьте апостиль на диплом и приложение в Министерстве юстиции (ASAN xidmət).',
    },
    dueDays: 21,
  },
  {
    key: 'TRANSLATION',
    title: { az: 'Sənədləri alman dilinə tərcümə etdirin', de: 'Lassen Sie die Dokumente ins Deutsche übersetzen', en: 'Have the documents translated into German', ru: 'Закажите перевод документов на немецкий' },
    description: {
      az: 'Tərcümə andlı tərcüməçi tərəfindən edilməlidir. Hazır olduqda yükləyin.',
      de: 'Die Übersetzung muss von einem vereidigten Übersetzer stammen. Laden Sie sie hoch, sobald sie fertig ist.',
      en: 'The translation must be done by a sworn translator. Upload it when it is ready.',
      ru: 'Перевод должен выполнить присяжный переводчик. Загрузите его, когда он будет готов.',
    },
    dueDays: 14,
  },
  {
    key: 'BRING_ORIGINALS',
    title: { az: 'Orijinal sənədləri ofisə gətirin', de: 'Bringen Sie die Originaldokumente ins Büro', en: 'Bring the original documents to the office', ru: 'Принесите оригиналы документов в офис' },
    description: {
      az: 'Portalda "Ofisə gəliş təyin et" ilə özünüzə uyğun vaxt seçin.',
      de: 'Wählen Sie im Portal unter „Bürotermin buchen" einen passenden Termin.',
      en: 'Pick a time that suits you in the portal under "Book an office visit".',
      ru: 'Выберите удобное время в портале: «Записаться в офис».',
    },
    dueDays: 7,
  },
  // After the Anmeldung (lib/housing creates these automatically once the Meldebescheinigung is on file).
  {
    key: 'STEUER_ID',
    title: { az: 'Steuer-ID məktubunu gözləyin və işəgötürənə verin', de: 'Steuer-ID abwarten und dem Arbeitgeber geben', en: 'Wait for your Steuer-ID and give it to your employer', ru: 'Дождитесь Steuer-ID и передайте его работодателю' },
    description: {
      az: 'Anmeldung-dan sonra Bundeszentralamt für Steuern vergi identifikasiya nömrənizi (11 rəqəm) adətən bir neçə həftə ərzində poçtla göndərir. Nömrəni işəgötürənə verin. Məktub gəlməyibsə, Finanzamt-dan soruşun.',
      de: 'Nach der Anmeldung schickt das Bundeszentralamt für Steuern Ihre steuerliche Identifikationsnummer (11 Ziffern) in der Regel innerhalb einiger Wochen per Post. Geben Sie die Nummer Ihrem Arbeitgeber. Kommt kein Brief, fragen Sie beim Finanzamt nach.',
      en: 'After the Anmeldung the Federal Central Tax Office usually sends your tax identification number (11 digits) by post within a few weeks. Give the number to your employer. If no letter arrives, ask the local Finanzamt.',
      ru: 'После Anmeldung Федеральное центральное налоговое ведомство обычно в течение нескольких недель присылает по почте ваш налоговый идентификатор (11 цифр). Передайте номер работодателю. Если письма нет, обратитесь в Finanzamt.',
    },
    dueDays: 28,
  },
  {
    key: 'BANK_ACCOUNT',
    title: { az: 'Almaniyada bank hesabı açın', de: 'Eröffnen Sie ein Girokonto in Deutschland', en: 'Open a German bank account', ru: 'Откройте банковский счёт в Германии' },
    description: {
      az: 'Pasport və Meldebescheinigung ilə Girokonto açın. IBAN-ı işəgötürənə və tibbi sığorta kassasına bildirin.',
      de: 'Eröffnen Sie mit Reisepass und Meldebescheinigung ein Girokonto. Teilen Sie die IBAN Ihrem Arbeitgeber und Ihrer Krankenkasse mit.',
      en: 'Open a current account (Girokonto) with your passport and Meldebescheinigung. Give the IBAN to your employer and your health insurer.',
      ru: 'Откройте Girokonto с паспортом и Meldebescheinigung. Сообщите IBAN работодателю и больничной кассе.',
    },
    dueDays: 14,
  },
  {
    key: 'HEALTH_CARD',
    title: { az: 'Tibbi sığorta kartını alın', de: 'Gesundheitskarte erhalten', en: 'Get your health insurance card', ru: 'Получите карту медицинской страховки' },
    description: {
      az: 'Tibbi sığorta kassası elektron sığorta kartını (eGK) poçtla göndərir; çox vaxt şəkil tələb olunur. Kart gələndə bu tapşırığı tamamlayın.',
      de: 'Die Krankenkasse schickt die elektronische Gesundheitskarte (eGK) per Post; oft wird dafür ein Foto verlangt. Erledigen Sie diese Aufgabe, sobald die Karte da ist.',
      en: 'Your health insurer sends the electronic health card (eGK) by post; a photo is often required. Mark this task done when the card has arrived.',
      ru: 'Больничная касса присылает электронную карту (eGK) по почте; часто нужна фотография. Отметьте задачу, когда карта придёт.',
    },
    dueDays: 28,
  },
];

export const templateByKey = (key: string | null | undefined) => (key ? TASK_TEMPLATES.find((t) => t.key === key) : undefined);

/** Title shown to a reader: a template title that was not changed is shown in the reader's language. */
export const displayTitle = (t: { template: string | null; title: string }, locale: Locale) => {
  const tpl = templateByKey(t.template);
  return tpl && Object.values(tpl.title).includes(t.title) ? tpl.title[locale] : t.title;
};
export const displayDescription = (t: { template: string | null; description: string | null }, locale: Locale) => {
  const tpl = templateByKey(t.template);
  return tpl && t.description && Object.values(tpl.description).includes(t.description) ? tpl.description[locale] : t.description;
};

// ─── Client task notifications ───────────────────────────────────────

type TaskCtx = { title: string; due: string | null; description?: string | null; number: string };
type Msg = { title: string; body: string };

const dueLine: Record<Locale, (d: string) => string> = {
  az: (d) => `Son tarix: ${d}`,
  de: (d) => `Frist: ${d}`,
  en: (d) => `Due: ${d}`,
  ru: (d) => `Срок: ${d}`,
};

export const taskTexts: Record<Locale, { created: (c: TaskCtx) => Msg; dueSoon: (c: TaskCtx) => Msg; dueToday: (c: TaskCtx) => Msg; overdue: (c: TaskCtx & { n: number }) => Msg; cta: string }> = {
  az: {
    created: (c) => ({ title: `Yeni tapşırıq: ${c.title}`, body: [`Komandamız sizə yeni tapşırıq verdi (${c.number}).`, c.title, c.due ? dueLine.az(c.due) : '', c.description ?? ''].filter(Boolean).join('\n\n') }),
    dueSoon: (c) => ({ title: `2 gün qalıb: ${c.title}`, body: `"${c.title}" tapşırığının son tarixinə 2 gün qalıb.${c.due ? `\n\n${dueLine.az(c.due)}` : ''}` }),
    dueToday: (c) => ({ title: `Bu gün son gündür: ${c.title}`, body: `"${c.title}" tapşırığının son tarixi bu gündür. Hazırdırsa, kabinetdə "Hazırdır" düyməsini basın.` }),
    overdue: (c) => ({ title: `Müddət keçib: ${c.title}`, body: `"${c.title}" tapşırığının müddəti keçib${c.due ? ` (${c.due})` : ''}. Zəhmət olmasa tezliklə tamamlayın və ya menecerinizə yazın.` }),
    cta: 'Tapşırığa bax',
  },
  de: {
    created: (c) => ({ title: `Neue Aufgabe: ${c.title}`, body: [`Unser Team hat Ihnen eine neue Aufgabe gegeben (${c.number}).`, c.title, c.due ? dueLine.de(c.due) : '', c.description ?? ''].filter(Boolean).join('\n\n') }),
    dueSoon: (c) => ({ title: `Noch 2 Tage: ${c.title}`, body: `Die Frist für „${c.title}" endet in 2 Tagen.${c.due ? `\n\n${dueLine.de(c.due)}` : ''}` }),
    dueToday: (c) => ({ title: `Heute fällig: ${c.title}`, body: `Die Aufgabe „${c.title}" ist heute fällig. Wenn sie erledigt ist, klicken Sie im Kundenbereich auf „Erledigt".` }),
    overdue: (c) => ({ title: `Frist überschritten: ${c.title}`, body: `Die Frist für „${c.title}" ist abgelaufen${c.due ? ` (${c.due})` : ''}. Bitte erledigen Sie die Aufgabe bald oder schreiben Sie Ihrem Betreuer.` }),
    cta: 'Aufgabe ansehen',
  },
  en: {
    created: (c) => ({ title: `New task: ${c.title}`, body: [`Our team gave you a new task (${c.number}).`, c.title, c.due ? dueLine.en(c.due) : '', c.description ?? ''].filter(Boolean).join('\n\n') }),
    dueSoon: (c) => ({ title: `2 days left: ${c.title}`, body: `The task "${c.title}" is due in 2 days.${c.due ? `\n\n${dueLine.en(c.due)}` : ''}` }),
    dueToday: (c) => ({ title: `Due today: ${c.title}`, body: `The task "${c.title}" is due today. When it is done, press "Done" in your account.` }),
    overdue: (c) => ({ title: `Overdue: ${c.title}`, body: `The task "${c.title}" is overdue${c.due ? ` (${c.due})` : ''}. Please complete it soon or write to your case manager.` }),
    cta: 'Open the task',
  },
  ru: {
    created: (c) => ({ title: `Новая задача: ${c.title}`, body: [`Наша команда дала вам новую задачу (${c.number}).`, c.title, c.due ? dueLine.ru(c.due) : '', c.description ?? ''].filter(Boolean).join('\n\n') }),
    dueSoon: (c) => ({ title: `Осталось 2 дня: ${c.title}`, body: `Срок задачи «${c.title}» истекает через 2 дня.${c.due ? `\n\n${dueLine.ru(c.due)}` : ''}` }),
    dueToday: (c) => ({ title: `Срок сегодня: ${c.title}`, body: `Сегодня последний день для задачи «${c.title}». Если она выполнена, нажмите «Готово» в личном кабинете.` }),
    overdue: (c) => ({ title: `Срок истёк: ${c.title}`, body: `Срок задачи «${c.title}» истёк${c.due ? ` (${c.due})` : ''}. Пожалуйста, выполните её как можно скорее или напишите вашему менеджеру.` }),
    cta: 'Открыть задачу',
  },
};

// ─── Office visits ────────────────────────────────────────────────────

export const VISIT_REASONS = ['originals', 'passport', 'sign', 'other'] as const;
export type VisitReason = (typeof VISIT_REASONS)[number];

export const reasonLabel: Record<Locale, Record<VisitReason, string>> = {
  az: { originals: 'Orijinal sənədləri təhvil vermək', passport: 'Pasportu götürmək', sign: 'Sənədləri imzalamaq', other: 'Digər' },
  de: { originals: 'Originaldokumente abgeben', passport: 'Reisepass abholen', sign: 'Dokumente unterschreiben', other: 'Sonstiges' },
  en: { originals: 'Hand over original documents', passport: 'Collect passport', sign: 'Sign documents', other: 'Other' },
  ru: { originals: 'Сдать оригиналы документов', passport: 'Забрать паспорт', sign: 'Подписать документы', other: 'Другое' },
};

export const asReason = (topic: string | null | undefined): VisitReason => ((VISIT_REASONS as readonly string[]).includes(topic ?? '') ? (topic as VisitReason) : 'other');

type VisitCtx = { when: string; address: string; reason: string; number: string; message?: string | null };
export type VisitMail = 'confirmed' | 'rescheduled' | 'cancelledByClient' | 'cancelledByStaff' | 'reminder24h' | 'reminder2h';

const extra = (label: string, m?: string | null) => (m ? `\n\n${label}: ${m}` : '');

export const visitTexts: Record<Locale, Record<VisitMail, (c: VisitCtx) => Msg> & { icsSummary: string; icsDescription: (c: VisitCtx) => string; staffNew: (c: VisitCtx & { client: string }) => Msg; staffCancelled: (c: VisitCtx & { client: string }) => Msg; staffToday: (c: VisitCtx & { client: string }) => Msg; bring: string }> = {
  az: {
    confirmed: (c) => ({ title: 'Ofisə gəlişiniz təsdiqləndi', body: `Sizi ofisimizdə gözləyirik.\n\nVaxt: ${c.when}\nÜnvan: ${c.address}\nSəbəb: ${c.reason}\nMüraciət: ${c.number}\n\nŞəxsiyyət vəsiqənizi və ya pasportunuzu götürün.` }),
    rescheduled: (c) => ({ title: 'Ofisə gəliş vaxtı dəyişdirildi', body: `Yeni vaxt: ${c.when}\nÜnvan: ${c.address}\nSəbəb: ${c.reason}` }),
    cancelledByClient: (c) => ({ title: 'Ofisə gəliş ləğv edildi', body: `${c.when} tarixli ofisə gəlişiniz ləğv edildi. Kabinetdən istənilən vaxt yeni vaxt seçə bilərsiniz.` }),
    cancelledByStaff: (c) => ({ title: 'Ofisə gəlişiniz ləğv edildi', body: `Təəssüf ki, ${c.when} tarixli görüşü ləğv etməli olduq.${extra('Qeyd', c.message)}\n\nZəhmət olmasa kabinetdən yeni vaxt seçin.` }),
    reminder24h: (c) => ({ title: 'Sabah ofisdə görüşürük', body: `Xatırlatma: ${c.when}\nÜnvan: ${c.address}\nSəbəb: ${c.reason}` }),
    reminder2h: (c) => ({ title: '2 saat sonra ofisdə görüşürük', body: `Xatırlatma: ${c.when}\nÜnvan: ${c.address}` }),
    icsSummary: 'Triad Vision · ofisə gəliş',
    icsDescription: (c) => `${c.reason}\nMüraciət: ${c.number}`,
    staffNew: (c) => ({ title: `Ofisə gəliş: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}${extra('Qeyd', c.message)}` }),
    staffCancelled: (c) => ({ title: `Ofisə gəliş ləğv edildi: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    staffToday: (c) => ({ title: `Bu gün ofisə gəliş: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    bring: 'Şəxsiyyət vəsiqəsi və ya pasport',
  },
  de: {
    confirmed: (c) => ({ title: 'Ihr Bürotermin ist bestätigt', body: `Wir erwarten Sie in unserem Büro.\n\nZeit: ${c.when}\nAdresse: ${c.address}\nAnlass: ${c.reason}\nAntrag: ${c.number}\n\nBitte bringen Sie Ihren Ausweis oder Reisepass mit.` }),
    rescheduled: (c) => ({ title: 'Ihr Bürotermin wurde verschoben', body: `Neue Zeit: ${c.when}\nAdresse: ${c.address}\nAnlass: ${c.reason}` }),
    cancelledByClient: (c) => ({ title: 'Bürotermin storniert', body: `Ihr Bürotermin am ${c.when} wurde storniert. Sie können jederzeit im Kundenbereich einen neuen Termin wählen.` }),
    cancelledByStaff: (c) => ({ title: 'Ihr Bürotermin wurde abgesagt', body: `Leider mussten wir den Termin am ${c.when} absagen.${extra('Hinweis', c.message)}\n\nBitte wählen Sie im Kundenbereich einen neuen Termin.` }),
    reminder24h: (c) => ({ title: 'Morgen sehen wir uns im Büro', body: `Erinnerung: ${c.when}\nAdresse: ${c.address}\nAnlass: ${c.reason}` }),
    reminder2h: (c) => ({ title: 'In 2 Stunden sehen wir uns im Büro', body: `Erinnerung: ${c.when}\nAdresse: ${c.address}` }),
    icsSummary: 'Triad Vision · Bürotermin',
    icsDescription: (c) => `${c.reason}\nAntrag: ${c.number}`,
    staffNew: (c) => ({ title: `Bürotermin: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}${extra('Hinweis', c.message)}` }),
    staffCancelled: (c) => ({ title: `Bürotermin storniert: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    staffToday: (c) => ({ title: `Heute im Büro: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    bring: 'Ausweis oder Reisepass',
  },
  en: {
    confirmed: (c) => ({ title: 'Your office visit is confirmed', body: `We look forward to seeing you at our office.\n\nTime: ${c.when}\nAddress: ${c.address}\nReason: ${c.reason}\nApplication: ${c.number}\n\nPlease bring your ID card or passport.` }),
    rescheduled: (c) => ({ title: 'Your office visit was moved', body: `New time: ${c.when}\nAddress: ${c.address}\nReason: ${c.reason}` }),
    cancelledByClient: (c) => ({ title: 'Office visit cancelled', body: `Your office visit on ${c.when} was cancelled. You can pick a new time in your account at any time.` }),
    cancelledByStaff: (c) => ({ title: 'Your office visit was cancelled', body: `Unfortunately we had to cancel the visit on ${c.when}.${extra('Note', c.message)}\n\nPlease pick a new time in your account.` }),
    reminder24h: (c) => ({ title: 'See you at the office tomorrow', body: `Reminder: ${c.when}\nAddress: ${c.address}\nReason: ${c.reason}` }),
    reminder2h: (c) => ({ title: 'See you at the office in 2 hours', body: `Reminder: ${c.when}\nAddress: ${c.address}` }),
    icsSummary: 'Triad Vision · office visit',
    icsDescription: (c) => `${c.reason}\nApplication: ${c.number}`,
    staffNew: (c) => ({ title: `Office visit: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}${extra('Note', c.message)}` }),
    staffCancelled: (c) => ({ title: `Office visit cancelled: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    staffToday: (c) => ({ title: `Office visit today: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    bring: 'ID card or passport',
  },
  ru: {
    confirmed: (c) => ({ title: 'Ваш визит в офис подтверждён', body: `Ждём вас в нашем офисе.\n\nВремя: ${c.when}\nАдрес: ${c.address}\nЦель: ${c.reason}\nЗаявка: ${c.number}\n\nПожалуйста, возьмите удостоверение личности или паспорт.` }),
    rescheduled: (c) => ({ title: 'Время визита в офис изменено', body: `Новое время: ${c.when}\nАдрес: ${c.address}\nЦель: ${c.reason}` }),
    cancelledByClient: (c) => ({ title: 'Визит в офис отменён', body: `Ваш визит в офис ${c.when} отменён. Вы можете выбрать новое время в личном кабинете.` }),
    cancelledByStaff: (c) => ({ title: 'Ваш визит в офис отменён', body: `К сожалению, нам пришлось отменить встречу ${c.when}.${extra('Примечание', c.message)}\n\nПожалуйста, выберите новое время в личном кабинете.` }),
    reminder24h: (c) => ({ title: 'Завтра ждём вас в офисе', body: `Напоминание: ${c.when}\nАдрес: ${c.address}\nЦель: ${c.reason}` }),
    reminder2h: (c) => ({ title: 'Через 2 часа ждём вас в офисе', body: `Напоминание: ${c.when}\nАдрес: ${c.address}` }),
    icsSummary: 'Triad Vision · визит в офис',
    icsDescription: (c) => `${c.reason}\nЗаявка: ${c.number}`,
    staffNew: (c) => ({ title: `Визит в офис: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}${extra('Примечание', c.message)}` }),
    staffCancelled: (c) => ({ title: `Визит в офис отменён: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    staffToday: (c) => ({ title: `Сегодня визит в офис: ${c.client}`, body: `${c.when}\n${c.reason}\n${c.number}` }),
    bring: 'Удостоверение личности или паспорт',
  },
};

export const cta: Record<Locale, string> = { az: 'Kabinetdə aç', de: 'Im Kundenbereich öffnen', en: 'Open in my account', ru: 'Открыть в кабинете' };
