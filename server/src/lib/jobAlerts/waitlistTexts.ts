import type { SeoLocale } from '../seoCatalogue.js';

/** Vacancy waitlist e-mails and in-app texts in the six site languages (lib/jobAlerts/waitlist.ts). */

interface WaitlistMail {
  confirmSubject: string;
  confirmBody: (profession: string, place: string | null) => string;
  confirmCta: string;
  noticeSubject: (title: string) => string;
  noticeBody: (profession: string, n: number) => string;
  noticeCta: string;
  allJobs: string;
  why: string;
  /** In-app notification (signed-in clients). */
  appTitle: (title: string) => string;
  appBody: (profession: string, place: string | null) => string;
}

export const WAITLIST_MAIL: Record<SeoLocale, WaitlistMail> = {
  az: {
    confirmSubject: 'Vakansiya gözləmə siyahısını təsdiqləyin',
    confirmBody: (p, place) =>
      `Uyğun vakansiya açılanda sizə xəbər verməyimizi istədiniz: ${p}${place ? ` · ${place}` : ''}. Zəhmət olmasa e-poçt ünvanınızı təsdiqləyin — təsdiq olmadan heç nə göndərmirik və sorğu 7 gündən sonra silinir.\n\nBunu siz etməmisinizsə, bu məktubu sadəcə nəzərə almayın.`,
    confirmCta: 'Təsdiq et',
    noticeSubject: (t) => `Uyğun vakansiya açıldı: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `Gözlədiyiniz peşə üzrə (${p}) boş yeri olan vakansiya açıldı. Yerlər məhduddur — maraqlanırsınızsa, tez müraciət edin.`
        : `Gözlədiyiniz peşə üzrə (${p}) boş yeri olan ${n} vakansiya açıldı. Yerlər məhduddur — maraqlanırsınızsa, tez müraciət edin.`,
    noticeCta: 'Vakansiyaya baxın',
    allJobs: 'Bütün vakansiyalar',
    why: 'Bu məktubu triad-vision.de saytında «Uyğun vakansiya açılanda xəbər ver» siyahısına yazıldığınız üçün alırsınız. Hər vakansiya barədə yalnız bir dəfə yazırıq.',
    appTitle: (t) => `Uyğun vakansiya açıldı: ${t}`,
    appBody: (p, place) => `Gözlədiyiniz peşə üzrə (${p}${place ? `, ${place}` : ''}) boş yeri olan vakansiya var. Maraqlanırsınızsa, müraciət edin.`,
  },
  de: {
    confirmSubject: 'Bitte bestätigen Sie Ihre Warteliste',
    confirmBody: (p, place) =>
      `Sie möchten benachrichtigt werden, sobald eine passende Stelle frei wird: ${p}${place ? ` · ${place}` : ''}. Bitte bestätigen Sie Ihre E-Mail-Adresse — ohne Bestätigung senden wir nichts, und die Anfrage wird nach 7 Tagen gelöscht.\n\nWaren Sie das nicht, ignorieren Sie diese E-Mail einfach.`,
    confirmCta: 'Bestätigen',
    noticeSubject: (t) => `Passende Stelle frei: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `Für Ihren Beruf (${p}) ist eine Stelle mit freien Plätzen ausgeschrieben. Die Plätze sind begrenzt — bewerben Sie sich bei Interesse bald.`
        : `Für Ihren Beruf (${p}) sind ${n} Stellen mit freien Plätzen ausgeschrieben. Die Plätze sind begrenzt — bewerben Sie sich bei Interesse bald.`,
    noticeCta: 'Stelle ansehen',
    allJobs: 'Alle Stellen',
    why: 'Sie erhalten diese E-Mail, weil Sie sich auf triad-vision.de für „Benachrichtigen, wenn eine passende Stelle frei wird“ eingetragen haben. Zu jeder Stelle schreiben wir nur einmal.',
    appTitle: (t) => `Passende Stelle frei: ${t}`,
    appBody: (p, place) => `Für Ihren Beruf (${p}${place ? `, ${place}` : ''}) gibt es eine Stelle mit freien Plätzen. Bewerben Sie sich bei Interesse.`,
  },
  en: {
    confirmSubject: 'Please confirm your vacancy waitlist',
    confirmBody: (p, place) =>
      `You asked us to tell you when a matching vacancy opens: ${p}${place ? ` · ${place}` : ''}. Please confirm your e-mail address — we send nothing without confirmation, and the request is deleted after 7 days.\n\nIf this was not you, simply ignore this e-mail.`,
    confirmCta: 'Confirm',
    noticeSubject: (t) => `A matching vacancy opened: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `A vacancy with free places has opened for your profession (${p}). Places are limited — if you are interested, apply soon.`
        : `${n} vacancies with free places have opened for your profession (${p}). Places are limited — if you are interested, apply soon.`,
    noticeCta: 'See the vacancy',
    allJobs: 'All vacancies',
    why: 'You receive this e-mail because you joined “Tell me when a matching vacancy opens” on triad-vision.de. We write about each vacancy only once.',
    appTitle: (t) => `A matching vacancy opened: ${t}`,
    appBody: (p, place) => `There is a vacancy with free places for your profession (${p}${place ? `, ${place}` : ''}). Apply if you are interested.`,
  },
  ru: {
    confirmSubject: 'Подтвердите лист ожидания вакансий',
    confirmBody: (p, place) =>
      `Вы попросили сообщить, когда откроется подходящая вакансия: ${p}${place ? ` · ${place}` : ''}. Пожалуйста, подтвердите адрес — без подтверждения мы ничего не отправляем, а заявка удаляется через 7 дней.\n\nЕсли это были не вы, просто проигнорируйте это письмо.`,
    confirmCta: 'Подтвердить',
    noticeSubject: (t) => `Открылась подходящая вакансия: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `По вашей профессии (${p}) открылась вакансия со свободными местами. Мест немного — если интересно, откликнитесь поскорее.`
        : `По вашей профессии (${p}) открылись вакансии со свободными местами: ${n}. Мест немного — если интересно, откликнитесь поскорее.`,
    noticeCta: 'Посмотреть вакансию',
    allJobs: 'Все вакансии',
    why: 'Вы получили это письмо, потому что записались в лист «Сообщить, когда откроется подходящая вакансия» на triad-vision.de. О каждой вакансии мы пишем только один раз.',
    appTitle: (t) => `Открылась подходящая вакансия: ${t}`,
    appBody: (p, place) => `По вашей профессии (${p}${place ? `, ${place}` : ''}) есть вакансия со свободными местами. Откликнитесь, если интересно.`,
  },
  tr: {
    confirmSubject: 'İlan bekleme listenizi onaylayın',
    confirmBody: (p, place) =>
      `Uygun bir ilan açıldığında size haber vermemizi istediniz: ${p}${place ? ` · ${place}` : ''}. Lütfen e-posta adresinizi onaylayın — onay olmadan hiçbir şey göndermiyoruz ve talep 7 gün sonra silinir.\n\nBunu siz yapmadıysanız bu e-postayı dikkate almayın.`,
    confirmCta: 'Onayla',
    noticeSubject: (t) => `Uygun ilan açıldı: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `Mesleğiniz için (${p}) boş yeri olan bir ilan açıldı. Yerler sınırlı — ilgileniyorsanız kısa sürede başvurun.`
        : `Mesleğiniz için (${p}) boş yeri olan ${n} ilan açıldı. Yerler sınırlı — ilgileniyorsanız kısa sürede başvurun.`,
    noticeCta: 'İlana bakın',
    allJobs: 'Tüm ilanlar',
    why: 'Bu e-postayı triad-vision.de sitesinde “Uygun ilan açılınca haber ver” listesine kaydolduğunuz için alıyorsunuz. Her ilan için yalnızca bir kez yazıyoruz.',
    appTitle: (t) => `Uygun ilan açıldı: ${t}`,
    appBody: (p, place) => `Mesleğiniz için (${p}${place ? `, ${place}` : ''}) boş yeri olan bir ilan var. İlgileniyorsanız başvurun.`,
  },
  uk: {
    confirmSubject: 'Підтвердьте список очікування вакансій',
    confirmBody: (p, place) =>
      `Ви попросили повідомити, коли відкриється відповідна вакансія: ${p}${place ? ` · ${place}` : ''}. Будь ласка, підтвердьте адресу — без підтвердження ми нічого не надсилаємо, а запит видаляється через 7 днів.\n\nЯкщо це були не ви, просто проігноруйте цей лист.`,
    confirmCta: 'Підтвердити',
    noticeSubject: (t) => `Відкрилася відповідна вакансія: ${t}`,
    noticeBody: (p, n) =>
      n === 1
        ? `За вашою професією (${p}) відкрилася вакансія з вільними місцями. Місць небагато — якщо цікаво, відгукніться якнайшвидше.`
        : `За вашою професією (${p}) відкрилися вакансії з вільними місцями: ${n}. Місць небагато — якщо цікаво, відгукніться якнайшвидше.`,
    noticeCta: 'Переглянути вакансію',
    allJobs: 'Усі вакансії',
    why: 'Ви отримали цей лист, бо записалися до списку «Повідомити, коли відкриється відповідна вакансія» на triad-vision.de. Про кожну вакансію ми пишемо лише один раз.',
    appTitle: (t) => `Відкрилася відповідна вакансія: ${t}`,
    appBody: (p, place) => `За вашою професією (${p}${place ? `, ${place}` : ''}) є вакансія з вільними місцями. Відгукніться, якщо цікаво.`,
  },
};
