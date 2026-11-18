import type { SeoLocale } from '../seoCatalogue.js';

/**
 * E-mails of the Germany job alerts (lib/germanyJobs/alerts.ts) in the six site languages. The consent wording
 * itself is shown by the form (client i18n/pagesGermanyJobAlerts.ts, key gjAlert.consent); CONSENT_VERSION names
 * the wording a subscriber agreed to and is stored with the alert — bump it when that text changes.
 */
export const CONSENT_VERSION = '2026-11-15';

export interface GermanyAlertMail {
  confirmSubject: string;
  confirmBody: (search: string, frequency: string) => string;
  confirmCta: string;
  digestSubject: (n: number) => string;
  digestIntro: (search: string) => string;
  /** Intro when "apply via Triad Vision" for external listings is switched off (policy allowExternalApplications). */
  digestIntroListings: (search: string) => string;
  apply: string;
  /** Link to the original ad on the source site (used when applying via Triad Vision is off). */
  original: string;
  allResults: string;
  via: (source: string) => string;
  manage: string;
  unsubscribe: string;
  why: (frequency: string) => string;
  daily: string;
  weekly: string;
  /** Search summary pieces. */
  anyJob: string;
  ausbildung: string;
  inPlace: (place: string, radius: number) => string;
  remote: string;
  visa: string;
  fullTime: string;
  partTime: string;
}

export const GERMANY_ALERT_MAIL: Record<SeoLocale, GermanyAlertMail> = {
  az: {
    confirmSubject: 'Almaniyada yeni iş elanları barədə bildirişi təsdiqləyin',
    confirmBody: (s, f) =>
      `Bu axtarışa uyğun yeni iş elanları barədə sizə e-poçt göndərməyimizi istədiniz: ${s} (${f}). Zəhmət olmasa e-poçt ünvanınızı təsdiqləyin — təsdiq olmadan heç nə göndərmirik və sorğu 7 gündən sonra silinir.\n\nBunu siz etməmisinizsə, bu məktubu sadəcə nəzərə almayın.`,
    confirmCta: 'Bildirişi təsdiqlə',
    digestSubject: (n) => `Axtarışınıza uyğun ${n} yeni iş elanı`,
    digestIntro: (s) => `Axtarışınıza uyğun yeni elanlar: ${s}. Bəyəndiyiniz vakansiyaya Triad Vision vasitəsilə müraciət edin — elanı və şərtləri sizin üçün yoxlayaq.`,
    digestIntroListings: (s) => `Axtarışınıza uyğun yeni elanlar: ${s}. Elanlar başqa saytlardandır — müraciət orijinal elan vasitəsilə olur.`,
    apply: 'Triad Vision ilə müraciət et',
    original: 'Orijinal elanı aç',
    allResults: 'Bütün nəticələr',
    via: (s) => `mənbə: ${s}`,
    manage: 'Bildirişi idarə etmək',
    unsubscribe: 'Abunəlikdən çıxmaq',
    why: (f) => `Bu məktubu triad-vision.de saytında Almaniya iş axtarışı üçün bildirişə abunə olduğunuz üçün alırsınız (${f}). Elanlar başqa saytlardandır.`,
    daily: 'gündə bir dəfə',
    weekly: 'həftədə bir dəfə',
    anyJob: 'bütün işlər',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} km)` : p),
    remote: 'uzaqdan iş',
    visa: 'viza dəstəyi',
    fullTime: 'tam ştat',
    partTime: 'yarım ştat',
  },
  de: {
    confirmSubject: 'Bitte bestätigen Sie Ihren Job-Alarm für Deutschland',
    confirmBody: (s, f) =>
      `Sie möchten per E-Mail über neue Stellen zu dieser Suche informiert werden: ${s} (${f}). Bitte bestätigen Sie Ihre E-Mail-Adresse — ohne Bestätigung senden wir nichts, und die Anfrage wird nach 7 Tagen gelöscht.\n\nWaren Sie das nicht, ignorieren Sie diese E-Mail einfach.`,
    confirmCta: 'Job-Alarm bestätigen',
    digestSubject: (n) => `${n} neue Stellen zu Ihrer Suche`,
    digestIntro: (s) => `Neue Stellen zu Ihrer Suche: ${s}. Bewerben Sie sich über Triad Vision — wir prüfen die Anzeige und die Bedingungen für Sie.`,
    digestIntroListings: (s) => `Neue Stellen zu Ihrer Suche: ${s}. Die Anzeigen stammen von anderen Jobbörsen — beworben wird über die Originalanzeige.`,
    apply: 'Über Triad Vision bewerben',
    original: 'Originalanzeige öffnen',
    allResults: 'Alle Ergebnisse',
    via: (s) => `via ${s}`,
    manage: 'Job-Alarm verwalten',
    unsubscribe: 'Abmelden',
    why: (f) => `Sie erhalten diese E-Mail, weil Sie auf triad-vision.de einen Job-Alarm für die Jobsuche Deutschland abonniert haben (${f}). Die Anzeigen stammen von anderen Jobbörsen.`,
    daily: 'täglich',
    weekly: 'wöchentlich',
    anyJob: 'alle Stellen',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} km)` : p),
    remote: 'Homeoffice',
    visa: 'Visa-Sponsoring',
    fullTime: 'Vollzeit',
    partTime: 'Teilzeit',
  },
  en: {
    confirmSubject: 'Please confirm your Germany job alert',
    confirmBody: (s, f) =>
      `You asked us to e-mail you about new jobs for this search: ${s} (${f}). Please confirm your e-mail address — we send nothing without confirmation, and the request is deleted after 7 days.\n\nIf this was not you, simply ignore this e-mail.`,
    confirmCta: 'Confirm job alert',
    digestSubject: (n) => `${n} new jobs for your search`,
    digestIntro: (s) => `New jobs for your search: ${s}. Apply through Triad Vision — we check the listing and the conditions for you.`,
    digestIntroListings: (s) => `New jobs for your search: ${s}. The listings come from other job sites — you apply through the original ad.`,
    apply: 'Apply via Triad Vision',
    original: 'Open the original ad',
    allResults: 'All results',
    via: (s) => `via ${s}`,
    manage: 'Manage job alert',
    unsubscribe: 'Unsubscribe',
    why: (f) => `You receive this e-mail because you subscribed to a job alert for the Germany job search on triad-vision.de (${f}). The listings come from other job sites.`,
    daily: 'daily',
    weekly: 'weekly',
    anyJob: 'all jobs',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} km)` : p),
    remote: 'remote',
    visa: 'visa sponsorship',
    fullTime: 'full-time',
    partTime: 'part-time',
  },
  ru: {
    confirmSubject: 'Подтвердите уведомления о вакансиях в Германии',
    confirmBody: (s, f) =>
      `Вы попросили присылать вам письма о новых вакансиях по этому поиску: ${s} (${f}). Пожалуйста, подтвердите адрес — без подтверждения мы ничего не отправляем, а запрос удаляется через 7 дней.\n\nЕсли это были не вы, просто проигнорируйте это письмо.`,
    confirmCta: 'Подтвердить уведомления',
    digestSubject: (n) => `Новые вакансии по вашему поиску: ${n}`,
    digestIntro: (s) => `Новые вакансии по вашему поиску: ${s}. Подайте заявку через Triad Vision — мы проверим объявление и условия для вас.`,
    digestIntroListings: (s) => `Новые вакансии по вашему поиску: ${s}. Объявления взяты с других сайтов — откликнуться можно в оригинальном объявлении.`,
    apply: 'Подать заявку через Triad Vision',
    original: 'Открыть оригинальное объявление',
    allResults: 'Все результаты',
    via: (s) => `источник: ${s}`,
    manage: 'Настроить уведомления',
    unsubscribe: 'Отписаться',
    why: (f) => `Вы получаете это письмо, потому что подписались на уведомления о вакансиях в Германии на triad-vision.de (${f}). Объявления взяты с других сайтов.`,
    daily: 'ежедневно',
    weekly: 'еженедельно',
    anyJob: 'все вакансии',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} км)` : p),
    remote: 'удалённо',
    visa: 'визовая поддержка',
    fullTime: 'полный день',
    partTime: 'неполный день',
  },
  tr: {
    confirmSubject: 'Almanya iş bildiriminizi onaylayın',
    confirmBody: (s, f) =>
      `Bu aramaya uygun yeni iş ilanları hakkında size e-posta göndermemizi istediniz: ${s} (${f}). Lütfen e-posta adresinizi onaylayın — onay olmadan hiçbir şey göndermiyoruz ve talep 7 gün sonra silinir.\n\nBunu siz yapmadıysanız bu e-postayı dikkate almayın.`,
    confirmCta: 'Bildirimi onayla',
    digestSubject: (n) => `Aramanıza uygun ${n} yeni ilan`,
    digestIntro: (s) => `Aramanıza uygun yeni ilanlar: ${s}. Triad Vision üzerinden başvurun — ilanı ve koşulları sizin için kontrol edelim.`,
    digestIntroListings: (s) => `Aramanıza uygun yeni ilanlar: ${s}. İlanlar başka sitelerden — başvuru orijinal ilan üzerinden yapılır.`,
    apply: 'Triad Vision ile başvur',
    original: 'Orijinal ilanı aç',
    allResults: 'Tüm sonuçlar',
    via: (s) => `kaynak: ${s}`,
    manage: 'Bildirimi yönet',
    unsubscribe: 'Abonelikten çık',
    why: (f) => `Bu e-postayı triad-vision.de üzerinde Almanya iş araması için bildirime abone olduğunuz için alıyorsunuz (${f}). İlanlar başka sitelerden gelir.`,
    daily: 'günlük',
    weekly: 'haftalık',
    anyJob: 'tüm işler',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} km)` : p),
    remote: 'uzaktan',
    visa: 'vize desteği',
    fullTime: 'tam zamanlı',
    partTime: 'yarı zamanlı',
  },
  uk: {
    confirmSubject: 'Підтвердьте сповіщення про вакансії в Німеччині',
    confirmBody: (s, f) =>
      `Ви попросили надсилати вам листи про нові вакансії за цим пошуком: ${s} (${f}). Будь ласка, підтвердьте адресу — без підтвердження ми нічого не надсилаємо, а запит видаляється через 7 днів.\n\nЯкщо це були не ви, просто проігноруйте цей лист.`,
    confirmCta: 'Підтвердити сповіщення',
    digestSubject: (n) => `Нові вакансії за вашим пошуком: ${n}`,
    digestIntro: (s) => `Нові вакансії за вашим пошуком: ${s}. Подайте заявку через Triad Vision — ми перевіримо оголошення та умови для вас.`,
    digestIntroListings: (s) => `Нові вакансії за вашим пошуком: ${s}. Оголошення взято з інших сайтів — відгукнутися можна в оригінальному оголошенні.`,
    apply: 'Подати заявку через Triad Vision',
    original: 'Відкрити оригінальне оголошення',
    allResults: 'Усі результати',
    via: (s) => `джерело: ${s}`,
    manage: 'Налаштувати сповіщення',
    unsubscribe: 'Відписатися',
    why: (f) => `Ви отримуєте цей лист, бо підписалися на сповіщення про вакансії в Німеччині на triad-vision.de (${f}). Оголошення взято з інших сайтів.`,
    daily: 'щодня',
    weekly: 'щотижня',
    anyJob: 'усі вакансії',
    ausbildung: 'Ausbildung',
    inPlace: (p, r) => (r ? `${p} (+${r} км)` : p),
    remote: 'віддалено',
    visa: 'візова підтримка',
    fullTime: 'повний день',
    partTime: 'неповний день',
  },
};
