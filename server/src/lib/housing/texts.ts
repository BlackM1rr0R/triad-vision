import type { Locale } from '@prisma/client';

/**
 * Notification texts of the housing + Anmeldung feature in the four portal languages (German "Sie",
 * Russian "вы"). Every message goes through notifyUser in the recipient's own language — clients and staff.
 * Times are shown in German local time (Europe/Berlin): the Bürgeramt appointment is in Germany.
 */

type Msg = { title: string; body: string };

export interface HousingNoticeParams {
  number: string;
  client: string;
  when?: string | null;
  address?: string | null;
  deadline?: string | null;
  days?: number;
  listing?: string | null;
  note?: string | null;
}

export type HousingClientKind =
  | 'APPT_SET'
  | 'APPT_3D'
  | 'APPT_1D'
  | 'APPT_MORNING'
  | 'DEADLINE_SOON'
  | 'CONTRACT_REVIEWED'
  | 'PROPOSAL_NEW'
  | 'PROPOSAL_INTRODUCED'
  | 'ANMELDUNG_DONE';

export type HousingStaffKind =
  | 'STAFF_APPT_SET'
  | 'STAFF_CONTRACT_REVIEW'
  | 'STAFF_DEADLINE_SOON'
  | 'STAFF_DEADLINE_OVERDUE'
  | 'STAFF_PROPOSAL_INTERESTED'
  | 'STAFF_PROPOSAL_DECLINED'
  | 'STAFF_CLIENT_INTEREST'
  | 'STAFF_MELDE_UPLOADED';

export type HousingNoticeKind = HousingClientKind | HousingStaffKind;

const DATE_LOCALE: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const TZ_LABEL: Record<Locale, string> = { az: ' (Almaniya vaxtı)', de: ' (deutsche Zeit)', en: ' (German time)', ru: ' (по времени Германии)' };

/** "Monday, 2 November 2026, 09:30 (German time)" */
export const fmtBerlin = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(d) + TZ_LABEL[locale];

/** "12 November 2026" for a calendar day stored as 00:00 UTC. */
export const fmtDayUtc = (d: Date, locale: Locale) => new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

const line = (label: string, v?: string | null) => (v ? `\n${label}: ${v}` : '');

const az: Record<HousingNoticeKind, (p: HousingNoticeParams) => Msg> = {
  APPT_SET: (p) => ({ title: 'Anmeldung görüşü qeyd edildi', body: `Bürgeramt görüşünüz qeyd edildi.\n\nVaxt: ${p.when}${line('Ünvan', p.address)}\n\nSiyahıdakı sənədləri özünüzlə götürün. Görüşdən 3 gün, 1 gün əvvəl və həmin gün səhər xatırladacağıq.` }),
  APPT_3D: (p) => ({ title: '3 gün sonra Anmeldung görüşü', body: `Bürgeramt görüşünüz: ${p.when}${line('Ünvan', p.address)}\n\nSənədləri indidən hazırlayın: pasport, Wohnungsgeberbestätigung, qeydiyyat forması (Anmeldeformular).` }),
  APPT_1D: (p) => ({ title: 'Sabah Anmeldung görüşü', body: `Sabah Bürgeramt görüşünüz var: ${p.when}${line('Ünvan', p.address)}\n\nPasport, Wohnungsgeberbestätigung və doldurulmuş formanı unutmayın.` }),
  APPT_MORNING: (p) => ({ title: 'Bu gün Anmeldung görüşü', body: `Bu gün Bürgeramt görüşünüz var: ${p.when}${line('Ünvan', p.address)}\n\nGörüşdən sonra Meldebescheinigung-u portala yükləyin.` }),
  DEADLINE_SOON: (p) => ({ title: 'Anmeldung müddəti yaxınlaşır', body: `Köçdükdən sonra yaşayış yerinizi 2 həftə ərzində qeydiyyata salmalısınız. Hesablanmış son tarix: ${p.deadline} (${p.days} gün qalıb).\n\nHələ görüş yoxdursa, şəhərinizin Bürgeramt saytında görüş götürün və portalda qeyd edin.` }),
  CONTRACT_REVIEWED: (p) => ({ title: 'Kirayə müqaviləniz yoxlanıldı', body: `Komandamız kirayə müqavilənizə baxdı.${line('Cavab', p.note)}\n\nBu, ümumi məlumatdır, hüquqi məsləhət deyil.` }),
  PROPOSAL_NEW: (p) => ({ title: 'Sizə mənzil təklifi', body: `Komandamız tərəfdaş mənzilini təklif edir: ${p.listing}.${line('Qeyd', p.note)}\n\nPortalda "Maraqlanıram" və ya "Maraqlanmıram" seçin.` }),
  PROPOSAL_INTRODUCED: (p) => ({ title: 'Mənzil sahibi ilə əlaqə', body: `Sizi tərəfdaş mənzil sahibi ilə tanış etdik: ${p.listing}. Əlaqə məlumatları indi portalda görünür.\n\nXatırlatma: baxışdan və müqavilədən əvvəl heç vaxt pul ödəməyin.` }),
  ANMELDUNG_DONE: () => ({ title: 'Anmeldung tamamlandı', body: 'Qeydiyyatınız qeyd edildi. Növbəti addımlar tapşırıqlarınızdadır: Steuer-ID məktubu (poçtla gəlir), bank hesabı və tibbi sığorta kartı.' }),
  STAFF_APPT_SET: (p) => ({ title: `${p.number}: Anmeldung görüşü`, body: `${p.client} Bürgeramt görüşünü qeyd etdi.\n\nVaxt: ${p.when}${line('Ünvan', p.address)}` }),
  STAFF_CONTRACT_REVIEW: (p) => ({ title: `${p.number}: kirayə müqaviləsinə baxış istənir`, body: `${p.client} kirayə müqaviləsini yüklədi və baxılmasını istəyir.${line('Sual', p.note)}` }),
  STAFF_DEADLINE_SOON: (p) => ({ title: `${p.number}: Anmeldung müddəti yaxındır`, body: `${p.client} hələ qeydiyyatdan keçməyib. Son tarix: ${p.deadline} (${p.days} gün).${p.when ? `\nGörüş: ${p.when}` : '\nGörüş qeyd edilməyib.'}` }),
  STAFF_DEADLINE_OVERDUE: (p) => ({ title: `${p.number}: Anmeldung müddəti keçib`, body: `${p.client} üçün 2 həftəlik müddət ${p.deadline} tarixində bitib və Meldebescheinigung yoxdur. Müştəri ilə əlaqə saxlayın.` }),
  STAFF_PROPOSAL_INTERESTED: (p) => ({ title: `${p.number}: mənzil təklifi qəbul edildi`, body: `${p.client} maraqlanır: ${p.listing}.${line('Qeyd', p.note)}\n\nTanış etmək üçün Mənzil səhifəsində "Tanış edildi" seçin.` }),
  STAFF_PROPOSAL_DECLINED: (p) => ({ title: `${p.number}: mənzil təklifindən imtina`, body: `${p.client} maraqlanmır: ${p.listing}.${line('Qeyd', p.note)}` }),
  STAFF_CLIENT_INTEREST: (p) => ({ title: `${p.number}: tərəfdaş mənzilə maraq`, body: `${p.client} bu mənzillə maraqlanır: ${p.listing}.${line('Qeyd', p.note)}` }),
  STAFF_MELDE_UPLOADED: (p) => ({ title: `${p.number}: Meldebescheinigung yükləndi`, body: `${p.client} Meldebescheinigung yüklədi; Anmeldung tamamlandı kimi qeyd edildi.` }),
};

const de: Record<HousingNoticeKind, (p: HousingNoticeParams) => Msg> = {
  APPT_SET: (p) => ({ title: 'Anmeldetermin eingetragen', body: `Ihr Termin beim Bürgeramt ist eingetragen.\n\nZeit: ${p.when}${line('Adresse', p.address)}\n\nBringen Sie die Unterlagen aus der Liste mit. Wir erinnern Sie 3 Tage und 1 Tag vorher sowie am Morgen des Termins.` }),
  APPT_3D: (p) => ({ title: 'In 3 Tagen: Termin zur Anmeldung', body: `Ihr Termin beim Bürgeramt: ${p.when}${line('Adresse', p.address)}\n\nLegen Sie die Unterlagen schon bereit: Reisepass, Wohnungsgeberbestätigung, Anmeldeformular.` }),
  APPT_1D: (p) => ({ title: 'Morgen: Termin zur Anmeldung', body: `Morgen haben Sie Ihren Termin beim Bürgeramt: ${p.when}${line('Adresse', p.address)}\n\nDenken Sie an Reisepass, Wohnungsgeberbestätigung und das ausgefüllte Formular.` }),
  APPT_MORNING: (p) => ({ title: 'Heute: Termin zur Anmeldung', body: `Heute ist Ihr Termin beim Bürgeramt: ${p.when}${line('Adresse', p.address)}\n\nLaden Sie danach die Meldebescheinigung im Portal hoch.` }),
  DEADLINE_SOON: (p) => ({ title: 'Frist für die Anmeldung läuft bald ab', body: `Nach dem Einzug müssen Sie sich innerhalb von zwei Wochen anmelden. Berechnete Frist: ${p.deadline} (noch ${p.days} Tage).\n\nFalls Sie noch keinen Termin haben, buchen Sie ihn auf der Website Ihres Bürgeramts und tragen Sie ihn im Portal ein.` }),
  CONTRACT_REVIEWED: (p) => ({ title: 'Ihr Mietvertrag wurde angesehen', body: `Unser Team hat sich Ihren Mietvertrag angesehen.${line('Antwort', p.note)}\n\nDies ist eine allgemeine Information und keine Rechtsberatung.` }),
  PROPOSAL_NEW: (p) => ({ title: 'Ein Wohnungsangebot für Sie', body: `Unser Team schlägt Ihnen eine Partnerunterkunft vor: ${p.listing}.${line('Hinweis', p.note)}\n\nWählen Sie im Portal „Interessiert“ oder „Nicht interessiert“.` }),
  PROPOSAL_INTRODUCED: (p) => ({ title: 'Kontakt zum Vermieter', body: `Wir haben Sie mit dem Partnervermieter bekannt gemacht: ${p.listing}. Die Kontaktdaten sehen Sie jetzt im Portal.\n\nZur Erinnerung: Zahlen Sie nie Geld vor Besichtigung und Vertrag.` }),
  ANMELDUNG_DONE: () => ({ title: 'Anmeldung erledigt', body: 'Ihre Anmeldung ist vermerkt. Die nächsten Schritte finden Sie in Ihren Aufgaben: Brief mit der Steuer-ID (kommt per Post), Bankkonto und Gesundheitskarte.' }),
  STAFF_APPT_SET: (p) => ({ title: `${p.number}: Anmeldetermin`, body: `${p.client} hat den Termin beim Bürgeramt eingetragen.\n\nZeit: ${p.when}${line('Adresse', p.address)}` }),
  STAFF_CONTRACT_REVIEW: (p) => ({ title: `${p.number}: Mietvertrag ansehen`, body: `${p.client} hat den Mietvertrag hochgeladen und bittet um einen Blick darauf.${line('Frage', p.note)}` }),
  STAFF_DEADLINE_SOON: (p) => ({ title: `${p.number}: Anmeldefrist läuft bald ab`, body: `${p.client} ist noch nicht angemeldet. Frist: ${p.deadline} (${p.days} Tage).${p.when ? `\nTermin: ${p.when}` : '\nKein Termin eingetragen.'}` }),
  STAFF_DEADLINE_OVERDUE: (p) => ({ title: `${p.number}: Anmeldefrist überschritten`, body: `Für ${p.client} ist die Zwei-Wochen-Frist am ${p.deadline} abgelaufen, eine Meldebescheinigung liegt nicht vor. Bitte Kontakt aufnehmen.` }),
  STAFF_PROPOSAL_INTERESTED: (p) => ({ title: `${p.number}: Wohnungsangebot – interessiert`, body: `${p.client} ist interessiert: ${p.listing}.${line('Hinweis', p.note)}\n\nNach dem Bekanntmachen „Vorgestellt“ setzen.` }),
  STAFF_PROPOSAL_DECLINED: (p) => ({ title: `${p.number}: Wohnungsangebot abgelehnt`, body: `${p.client} ist nicht interessiert: ${p.listing}.${line('Hinweis', p.note)}` }),
  STAFF_CLIENT_INTEREST: (p) => ({ title: `${p.number}: Interesse an Partnerunterkunft`, body: `${p.client} interessiert sich für: ${p.listing}.${line('Hinweis', p.note)}` }),
  STAFF_MELDE_UPLOADED: (p) => ({ title: `${p.number}: Meldebescheinigung hochgeladen`, body: `${p.client} hat die Meldebescheinigung hochgeladen; die Anmeldung ist als erledigt markiert.` }),
};

const en: Record<HousingNoticeKind, (p: HousingNoticeParams) => Msg> = {
  APPT_SET: (p) => ({ title: 'Anmeldung appointment saved', body: `Your Bürgeramt appointment is saved.\n\nTime: ${p.when}${line('Address', p.address)}\n\nBring the documents from the list. We will remind you 3 days and 1 day before and on the morning of the appointment.` }),
  APPT_3D: (p) => ({ title: 'In 3 days: Anmeldung appointment', body: `Your Bürgeramt appointment: ${p.when}${line('Address', p.address)}\n\nGet the documents ready now: passport, Wohnungsgeberbestätigung, registration form (Anmeldeformular).` }),
  APPT_1D: (p) => ({ title: 'Tomorrow: Anmeldung appointment', body: `Tomorrow is your Bürgeramt appointment: ${p.when}${line('Address', p.address)}\n\nRemember your passport, the Wohnungsgeberbestätigung and the completed form.` }),
  APPT_MORNING: (p) => ({ title: 'Today: Anmeldung appointment', body: `Your Bürgeramt appointment is today: ${p.when}${line('Address', p.address)}\n\nAfterwards, upload the Meldebescheinigung in the portal.` }),
  DEADLINE_SOON: (p) => ({ title: 'Anmeldung deadline is close', body: `After moving in you must register within two weeks. Calculated deadline: ${p.deadline} (${p.days} days left).\n\nIf you have no appointment yet, book one on your Bürgeramt's website and add it in the portal.` }),
  CONTRACT_REVIEWED: (p) => ({ title: 'Your rental contract was looked at', body: `Our team has looked at your rental contract.${line('Reply', p.note)}\n\nThis is general information, not legal advice.` }),
  PROPOSAL_NEW: (p) => ({ title: 'A housing offer for you', body: `Our team suggests a partner accommodation: ${p.listing}.${line('Note', p.note)}\n\nChoose "Interested" or "Not interested" in the portal.` }),
  PROPOSAL_INTRODUCED: (p) => ({ title: 'Contact with the landlord', body: `We introduced you to the partner landlord: ${p.listing}. The contact details are now shown in the portal.\n\nReminder: never pay money before a viewing and a contract.` }),
  ANMELDUNG_DONE: () => ({ title: 'Anmeldung done', body: 'Your registration is recorded. The next steps are in your tasks: the Steuer-ID letter (arrives by post), a bank account and the health insurance card.' }),
  STAFF_APPT_SET: (p) => ({ title: `${p.number}: Anmeldung appointment`, body: `${p.client} saved the Bürgeramt appointment.\n\nTime: ${p.when}${line('Address', p.address)}` }),
  STAFF_CONTRACT_REVIEW: (p) => ({ title: `${p.number}: rental contract review requested`, body: `${p.client} uploaded the rental contract and asks for a review.${line('Question', p.note)}` }),
  STAFF_DEADLINE_SOON: (p) => ({ title: `${p.number}: Anmeldung deadline close`, body: `${p.client} is not registered yet. Deadline: ${p.deadline} (${p.days} days).${p.when ? `\nAppointment: ${p.when}` : '\nNo appointment saved.'}` }),
  STAFF_DEADLINE_OVERDUE: (p) => ({ title: `${p.number}: Anmeldung deadline passed`, body: `The two-week period for ${p.client} ended on ${p.deadline} and there is no Meldebescheinigung. Please get in touch.` }),
  STAFF_PROPOSAL_INTERESTED: (p) => ({ title: `${p.number}: housing offer – interested`, body: `${p.client} is interested: ${p.listing}.${line('Note', p.note)}\n\nOnce introduced, set "Introduced".` }),
  STAFF_PROPOSAL_DECLINED: (p) => ({ title: `${p.number}: housing offer declined`, body: `${p.client} is not interested: ${p.listing}.${line('Note', p.note)}` }),
  STAFF_CLIENT_INTEREST: (p) => ({ title: `${p.number}: interest in a partner listing`, body: `${p.client} is interested in: ${p.listing}.${line('Note', p.note)}` }),
  STAFF_MELDE_UPLOADED: (p) => ({ title: `${p.number}: Meldebescheinigung uploaded`, body: `${p.client} uploaded the Meldebescheinigung; the Anmeldung is marked as done.` }),
};

const ru: Record<HousingNoticeKind, (p: HousingNoticeParams) => Msg> = {
  APPT_SET: (p) => ({ title: 'Запись на Anmeldung сохранена', body: `Ваша запись в Bürgeramt сохранена.\n\nВремя: ${p.when}${line('Адрес', p.address)}\n\nВозьмите документы из списка. Мы напомним за 3 дня, за 1 день и утром в день приёма.` }),
  APPT_3D: (p) => ({ title: 'Через 3 дня: приём для Anmeldung', body: `Ваш приём в Bürgeramt: ${p.when}${line('Адрес', p.address)}\n\nПодготовьте документы уже сейчас: паспорт, Wohnungsgeberbestätigung, бланк регистрации (Anmeldeformular).` }),
  APPT_1D: (p) => ({ title: 'Завтра: приём для Anmeldung', body: `Завтра ваш приём в Bürgeramt: ${p.when}${line('Адрес', p.address)}\n\nНе забудьте паспорт, Wohnungsgeberbestätigung и заполненный бланк.` }),
  APPT_MORNING: (p) => ({ title: 'Сегодня: приём для Anmeldung', body: `Сегодня ваш приём в Bürgeramt: ${p.when}${line('Адрес', p.address)}\n\nПосле приёма загрузите Meldebescheinigung в портал.` }),
  DEADLINE_SOON: (p) => ({ title: 'Срок для Anmeldung скоро истекает', body: `После въезда нужно зарегистрироваться в течение двух недель. Расчётный срок: ${p.deadline} (осталось дней: ${p.days}).\n\nЕсли записи ещё нет, запишитесь на сайте вашего Bürgeramt и внесите её в портал.` }),
  CONTRACT_REVIEWED: (p) => ({ title: 'Ваш договор аренды просмотрен', body: `Наша команда посмотрела ваш договор аренды.${line('Ответ', p.note)}\n\nЭто общая информация, а не юридическая консультация.` }),
  PROPOSAL_NEW: (p) => ({ title: 'Предложение жилья для вас', body: `Наша команда предлагает жильё партнёра: ${p.listing}.${line('Примечание', p.note)}\n\nВыберите в портале «Интересно» или «Не интересно».` }),
  PROPOSAL_INTRODUCED: (p) => ({ title: 'Контакт с арендодателем', body: `Мы познакомили вас с арендодателем-партнёром: ${p.listing}. Контакты теперь видны в портале.\n\nНапоминаем: никогда не платите до осмотра и договора.` }),
  ANMELDUNG_DONE: () => ({ title: 'Anmeldung выполнена', body: 'Ваша регистрация отмечена. Следующие шаги — в ваших задачах: письмо со Steuer-ID (приходит по почте), банковский счёт и карта медицинской страховки.' }),
  STAFF_APPT_SET: (p) => ({ title: `${p.number}: запись на Anmeldung`, body: `${p.client} внёс(ла) запись в Bürgeramt.\n\nВремя: ${p.when}${line('Адрес', p.address)}` }),
  STAFF_CONTRACT_REVIEW: (p) => ({ title: `${p.number}: просьба посмотреть договор аренды`, body: `${p.client} загрузил(а) договор аренды и просит его посмотреть.${line('Вопрос', p.note)}` }),
  STAFF_DEADLINE_SOON: (p) => ({ title: `${p.number}: срок Anmeldung скоро истекает`, body: `${p.client} ещё не зарегистрирован(а). Срок: ${p.deadline} (дней: ${p.days}).${p.when ? `\nПриём: ${p.when}` : '\nЗапись не внесена.'}` }),
  STAFF_DEADLINE_OVERDUE: (p) => ({ title: `${p.number}: срок Anmeldung пропущен`, body: `Двухнедельный срок для ${p.client} истёк ${p.deadline}, Meldebescheinigung нет. Свяжитесь с клиентом.` }),
  STAFF_PROPOSAL_INTERESTED: (p) => ({ title: `${p.number}: предложение жилья – интересно`, body: `${p.client} заинтересован(а): ${p.listing}.${line('Примечание', p.note)}\n\nПосле знакомства отметьте «Познакомили».` }),
  STAFF_PROPOSAL_DECLINED: (p) => ({ title: `${p.number}: предложение жилья отклонено`, body: `${p.client} не интересуется: ${p.listing}.${line('Примечание', p.note)}` }),
  STAFF_CLIENT_INTEREST: (p) => ({ title: `${p.number}: интерес к жилью партнёра`, body: `${p.client} интересуется: ${p.listing}.${line('Примечание', p.note)}` }),
  STAFF_MELDE_UPLOADED: (p) => ({ title: `${p.number}: Meldebescheinigung загружена`, body: `${p.client} загрузил(а) Meldebescheinigung; Anmeldung отмечена как выполненная.` }),
};

const CATALOG: Record<Locale, Record<HousingNoticeKind, (p: HousingNoticeParams) => Msg>> = { az, de, en, ru };

export const housingNotice = (kind: HousingNoticeKind, locale: Locale, p: HousingNoticeParams): Msg => CATALOG[locale][kind](p);

/** Calendar file labels for the appointment (.ics). */
export const icsLabels: Record<Locale, { summary: string; bring: string }> = {
  az: { summary: 'Anmeldung (Bürgeramt)', bring: 'Götürün: pasport, Wohnungsgeberbestätigung, Anmeldeformular' },
  de: { summary: 'Anmeldung (Bürgeramt)', bring: 'Mitbringen: Reisepass, Wohnungsgeberbestätigung, Anmeldeformular' },
  en: { summary: 'Anmeldung (Bürgeramt)', bring: 'Bring: passport, Wohnungsgeberbestätigung, registration form' },
  ru: { summary: 'Anmeldung (Bürgeramt)', bring: 'Взять: паспорт, Wohnungsgeberbestätigung, Anmeldeformular' },
};

/** Titles of the vault entries the feature creates (in the client's language). */
export const vaultTitles: Record<Locale, { contract: string; melde: string }> = {
  az: { contract: 'Kirayə müqaviləsi (Mietvertrag)', melde: 'Meldebescheinigung (qeydiyyat arayışı)' },
  de: { contract: 'Mietvertrag', melde: 'Meldebescheinigung' },
  en: { contract: 'Rental contract (Mietvertrag)', melde: 'Meldebescheinigung (registration certificate)' },
  ru: { contract: 'Договор аренды (Mietvertrag)', melde: 'Meldebescheinigung (справка о регистрации)' },
};
