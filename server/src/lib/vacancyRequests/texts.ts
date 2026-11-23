import type { SeoLocale } from '../seoCatalogue.js';

/** E-mail and in-app texts of the vacancy requests in the six site languages (lib/vacancyRequests/service.ts). */

interface RequestMail {
  noticeSubject: (title: string) => string;
  noticeBody: (what: string, n: number) => string;
  offerBody: (what: string) => string;
  cta: string;
  allJobs: string;
  why: string;
  cancel: string;
  appTitle: (title: string) => string;
  appBody: (what: string) => string;
  typeWork: string;
  typeAusbildung: string;
}

export const REQUEST_MAIL: Record<SeoLocale, RequestMail> = {
  az: {
    noticeSubject: (t) => `Sorğunuza uyğun vakansiya: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `Vakansiya sorğunuza (${w}) uyğun yeni vakansiya açıldı. Yerlər məhduddur — maraqlanırsınızsa tezliklə müraciət edin.` : `Vakansiya sorğunuza (${w}) uyğun ${n} vakansiya var. Yerlər məhduddur — maraqlanırsınızsa tezliklə müraciət edin.`),
    offerBody: (w) => `Komandamız vakansiya sorğunuz (${w}) üçün sizə bir vakansiya təklif edir. Maraqlanırsınızsa müraciət edin.`,
    cta: 'Vakansiyaya bax',
    allJobs: 'Bütün vakansiyalar',
    why: 'Bu e-poçtu triad-vision.de saytında göndərdiyiniz vakansiya sorğusuna görə alırsınız. Hər vakansiya haqqında yalnız bir dəfə yazırıq.',
    cancel: 'Sorğunu ləğv et',
    appTitle: (t) => `Sorğunuza uyğun vakansiya: ${t}`,
    appBody: (w) => `Vakansiya sorğunuza (${w}) uyğun vakansiya var. Maraqlanırsınızsa müraciət edin.`,
    typeWork: 'İş',
    typeAusbildung: 'Ausbildung',
  },
  de: {
    noticeSubject: (t) => `Passende Stelle zu Ihrer Anfrage: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `Zu Ihrer Stellenanfrage (${w}) wurde eine passende Stelle veröffentlicht. Die Plätze sind begrenzt — bewerben Sie sich bei Interesse bald.` : `Zu Ihrer Stellenanfrage (${w}) gibt es ${n} passende Stellen. Die Plätze sind begrenzt — bewerben Sie sich bei Interesse bald.`),
    offerBody: (w) => `Unser Team schlägt Ihnen eine Stelle zu Ihrer Anfrage (${w}) vor. Bewerben Sie sich bei Interesse.`,
    cta: 'Stelle ansehen',
    allJobs: 'Alle Stellen',
    why: 'Sie erhalten diese E-Mail, weil Sie auf triad-vision.de eine Stellenanfrage gesendet haben. Zu jeder Stelle schreiben wir nur einmal.',
    cancel: 'Anfrage zurückziehen',
    appTitle: (t) => `Passende Stelle zu Ihrer Anfrage: ${t}`,
    appBody: (w) => `Zu Ihrer Stellenanfrage (${w}) gibt es eine passende Stelle. Bewerben Sie sich bei Interesse.`,
    typeWork: 'Arbeit',
    typeAusbildung: 'Ausbildung',
  },
  en: {
    noticeSubject: (t) => `A vacancy matching your request: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `A vacancy matching your request (${w}) has been published. Places are limited — apply soon if you are interested.` : `${n} vacancies match your request (${w}). Places are limited — apply soon if you are interested.`),
    offerBody: (w) => `Our team suggests a vacancy for your request (${w}). Apply if you are interested.`,
    cta: 'View vacancy',
    allJobs: 'All vacancies',
    why: 'You receive this e-mail because you sent a vacancy request on triad-vision.de. We write only once per vacancy.',
    cancel: 'Cancel the request',
    appTitle: (t) => `A vacancy matching your request: ${t}`,
    appBody: (w) => `A vacancy matches your request (${w}). Apply if you are interested.`,
    typeWork: 'Work',
    typeAusbildung: 'Ausbildung',
  },
  ru: {
    noticeSubject: (t) => `Вакансия по вашему запросу: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `Опубликована вакансия по вашему запросу (${w}). Количество мест ограничено — если интересно, подайте заявку скорее.` : `По вашему запросу (${w}) есть вакансий: ${n}. Количество мест ограничено — если интересно, подайте заявку скорее.`),
    offerBody: (w) => `Наша команда предлагает вам вакансию по запросу (${w}). Если интересно, подайте заявку.`,
    cta: 'Открыть вакансию',
    allJobs: 'Все вакансии',
    why: 'Вы получили это письмо, потому что отправили запрос на вакансию на triad-vision.de. О каждой вакансии мы пишем только один раз.',
    cancel: 'Отменить запрос',
    appTitle: (t) => `Вакансия по вашему запросу: ${t}`,
    appBody: (w) => `Есть вакансия по вашему запросу (${w}). Если интересно, подайте заявку.`,
    typeWork: 'Работа',
    typeAusbildung: 'Ausbildung',
  },
  tr: {
    noticeSubject: (t) => `Talebinize uygun ilan: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `Talebinize (${w}) uygun bir ilan yayınlandı. Kontenjan sınırlıdır — ilgileniyorsanız yakında başvurun.` : `Talebinize (${w}) uygun ${n} ilan var. Kontenjan sınırlıdır — ilgileniyorsanız yakında başvurun.`),
    offerBody: (w) => `Ekibimiz talebiniz (${w}) için bir ilan öneriyor. İlgileniyorsanız başvurun.`,
    cta: 'İlana bak',
    allJobs: 'Tüm ilanlar',
    why: 'Bu e-postayı triad-vision.de üzerinden gönderdiğiniz ilan talebi nedeniyle alıyorsunuz. Her ilan için yalnızca bir kez yazarız.',
    cancel: 'Talebi iptal et',
    appTitle: (t) => `Talebinize uygun ilan: ${t}`,
    appBody: (w) => `Talebinize (${w}) uygun bir ilan var. İlgileniyorsanız başvurun.`,
    typeWork: 'İş',
    typeAusbildung: 'Ausbildung',
  },
  uk: {
    noticeSubject: (t) => `Вакансія за вашим запитом: ${t}`,
    noticeBody: (w, n) => (n === 1 ? `Опубліковано вакансію за вашим запитом (${w}). Кількість місць обмежена — якщо цікаво, подайте заявку якнайшвидше.` : `За вашим запитом (${w}) є вакансій: ${n}. Кількість місць обмежена — якщо цікаво, подайте заявку якнайшвидше.`),
    offerBody: (w) => `Наша команда пропонує вам вакансію за запитом (${w}). Якщо цікаво, подайте заявку.`,
    cta: 'Відкрити вакансію',
    allJobs: 'Усі вакансії',
    why: 'Ви отримали цей лист, бо надіслали запит на вакансію на triad-vision.de. Про кожну вакансію ми пишемо лише один раз.',
    cancel: 'Скасувати запит',
    appTitle: (t) => `Вакансія за вашим запитом: ${t}`,
    appBody: (w) => `Є вакансія за вашим запитом (${w}). Якщо цікаво, подайте заявку.`,
    typeWork: 'Робота',
    typeAusbildung: 'Ausbildung',
  },
};
