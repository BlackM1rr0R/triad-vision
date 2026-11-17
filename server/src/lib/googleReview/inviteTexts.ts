import type { GrTrigger } from './rules.js';

/**
 * Copy of the rating-first Google review request e-mail (and its one reminder) in the client languages
 * az / de / en / ru (User.locale); anything else → English. Staff task texts are Azerbaijani (team language).
 */
export const INVITE_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type InviteLocale = (typeof INVITE_LOCALES)[number];
export const inviteLocale = (l: string | null | undefined): InviteLocale =>
  (INVITE_LOCALES as readonly string[]).includes(l ?? '') ? (l as InviteLocale) : 'en';

export interface InviteTexts {
  subject: string;
  reminderSubject: string;
  greeting: (firstName: string) => string;
  intro: Record<GrTrigger, string>;
  reminderIntro: string;
  question: string;
  scaleLow: string;
  scaleHigh: string;
  ratingLabels: [string, string, string, string, string];
  direct: string;
  directLink: string;
  thanks: string;
  optOut: string;
  optOutLink: string;
  inApp: string;
}

export const INVITE_TEXTS: Record<InviteLocale, InviteTexts> = {
  az: {
    subject: 'Triad Vision ilə təcrübəniz necə idi?',
    reminderSubject: 'Xatırlatma: bir kliklə fikrinizi bildirin',
    greeting: (n) => `Salam, ${n}!`,
    intro: {
      APPROVED: 'Vizanızın təsdiqlənməsi bizi çox sevindirdi — təbrik edirik!',
      ARRIVAL: 'Almaniyaya xoş gəldiniz! Ümid edirik, ilk həftələriniz yaxşı keçir.',
      CLOSED: 'İşiniz uğurla tamamlandı. Bizə etibar etdiyiniz üçün təşəkkür edirik!',
    },
    reminderIntro: 'Bir neçə gün əvvəl sizdən qısa bir fikir istəmişdik. Cəmi bir klik çəkir.',
    question: 'Bizimlə işləməkdən nə dərəcədə razı qaldınız?',
    scaleLow: '1 — heç razı deyiləm',
    scaleHigh: '5 — çox razıyam',
    ratingLabels: ['Heç razı deyiləm', 'Razı deyiləm', 'Orta', 'Razıyam', 'Çox razıyam'],
    direct: 'Birbaşa Google-da rəy yazmaq istəyirsiniz?',
    directLink: 'Google-da rəy yazın',
    thanks: 'Hər bir fikir xidmətimizi yaxşılaşdırmağa kömək edir. Təşəkkür edirik!',
    optOut: 'Belə xahişlər almaq istəmirsinizsə:',
    optOutLink: 'imtina edin',
    inApp: 'Bir kliklə bizi qiymətləndirin — Triad Vision ilə təcrübəniz necə idi?',
  },
  de: {
    subject: 'Wie war Ihre Erfahrung mit Triad Vision?',
    reminderSubject: 'Erinnerung: Ihre Meinung mit einem Klick',
    greeting: (n) => `Hallo ${n},`,
    intro: {
      APPROVED: 'wir freuen uns sehr über die Genehmigung Ihres Visums — herzlichen Glückwunsch!',
      ARRIVAL: 'willkommen in Deutschland! Wir hoffen, Ihre ersten Wochen laufen gut.',
      CLOSED: 'Ihr Verfahren ist erfolgreich abgeschlossen. Danke für Ihr Vertrauen!',
    },
    reminderIntro: 'vor ein paar Tagen haben wir Sie um eine kurze Einschätzung gebeten. Es dauert nur einen Klick.',
    question: 'Wie zufrieden sind Sie mit unserer Zusammenarbeit?',
    scaleLow: '1 — gar nicht zufrieden',
    scaleHigh: '5 — sehr zufrieden',
    ratingLabels: ['Gar nicht zufrieden', 'Unzufrieden', 'Neutral', 'Zufrieden', 'Sehr zufrieden'],
    direct: 'Sie möchten direkt auf Google bewerten?',
    directLink: 'Bewertung auf Google schreiben',
    thanks: 'Jede Rückmeldung hilft uns, besser zu werden. Vielen Dank!',
    optOut: 'Wenn Sie solche Anfragen nicht erhalten möchten:',
    optOutLink: 'abmelden',
    inApp: 'Bewerten Sie uns mit einem Klick — wie war Ihre Erfahrung mit Triad Vision?',
  },
  en: {
    subject: 'How was your experience with Triad Vision?',
    reminderSubject: 'Reminder: your opinion in one click',
    greeting: (n) => `Hello ${n},`,
    intro: {
      APPROVED: 'we are delighted that your visa was approved — congratulations!',
      ARRIVAL: 'welcome to Germany! We hope your first weeks are going well.',
      CLOSED: 'your case has been completed successfully. Thank you for trusting us!',
    },
    reminderIntro: 'a few days ago we asked for your quick opinion. It only takes one click.',
    question: 'How satisfied are you with working with us?',
    scaleLow: '1 — not satisfied at all',
    scaleHigh: '5 — very satisfied',
    ratingLabels: ['Not satisfied at all', 'Not satisfied', 'Neutral', 'Satisfied', 'Very satisfied'],
    direct: 'Prefer to go straight to Google?',
    directLink: 'Write a Google review',
    thanks: 'Every opinion helps us improve. Thank you!',
    optOut: 'If you do not want such requests:',
    optOutLink: 'opt out',
    inApp: 'Rate us in one click — how was your experience with Triad Vision?',
  },
  ru: {
    subject: 'Как вам работа с Triad Vision?',
    reminderSubject: 'Напоминание: ваше мнение в один клик',
    greeting: (n) => `Здравствуйте, ${n}!`,
    intro: {
      APPROVED: 'Мы очень рады, что ваша виза одобрена, — поздравляем!',
      ARRIVAL: 'Добро пожаловать в Германию! Надеемся, первые недели проходят хорошо.',
      CLOSED: 'Ваше дело успешно завершено. Спасибо за доверие!',
    },
    reminderIntro: 'Несколько дней назад мы попросили вас коротко оценить нашу работу. Это займёт один клик.',
    question: 'Насколько вы довольны работой с нами?',
    scaleLow: '1 — совсем не доволен',
    scaleHigh: '5 — очень доволен',
    ratingLabels: ['Совсем не доволен', 'Не доволен', 'Нейтрально', 'Доволен', 'Очень доволен'],
    direct: 'Хотите сразу написать отзыв в Google?',
    directLink: 'Написать отзыв в Google',
    thanks: 'Каждое мнение помогает нам стать лучше. Спасибо!',
    optOut: 'Если вы не хотите получать такие просьбы:',
    optOutLink: 'отписаться',
    inApp: 'Оцените нас в один клик — как вам работа с Triad Vision?',
  },
};

const TRIGGER_AZ: Record<GrTrigger, string> = { APPROVED: 'viza təsdiqi', ARRIVAL: 'Almaniyaya gəliş', CLOSED: 'iş bağlandı' };

/** Staff task when a 1–3 rating comes in (feedback text is appended when the client sends it). */
export const lowRatingTaskText = (p: { clientName: string; number: string | null; rating: number; trigger: GrTrigger; feedback?: string | null }) => ({
  title: `Aşağı qiymət (${p.rating}/5): ${p.clientName}${p.number ? ` (${p.number})` : ''}`,
  description: [
    `Müştəri Google rəyi xahişindəki qiymətləndirmədə ${p.rating}/5 verib (səbəb: ${TRIGGER_AZ[p.trigger]}). Müştəri ilə əlaqə saxlayın, nəyin yaxşı getmədiyini öyrənin və həll edin.`,
    'Qeyd: Google siyasətinə görə Google linki hər kəsə göstərilir — müştəridən rəyi silməyi və ya dəyişməyi istəməyin, sadəcə problemi həll edin.',
    p.feedback ? `\nMüştərinin rəyi:\n${p.feedback}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n'),
});

/** Staff task when a recent low NPS score postpones the request (it is sent after the hold period). */
export const lowScoreHoldTaskText = (p: { clientName: string; number: string | null; score: number; comment: string | null; holdDays: number }) => ({
  title: `Narazı müştəri ilə əlaqə: ${p.clientName}${p.number ? ` (${p.number})` : ''}`,
  description: [
    `Müştəri məmnuniyyət sorğusunda ${p.score}/10 qiymət verib. Google rəyi xahişi ${p.holdDays} gün təxirə salındı — əvvəlcə müştəri ilə əlaqə saxlayın, nəyin yaxşı getmədiyini öyrənin və həll edin.`,
    p.comment ? `\nMüştərinin şərhi:\n${p.comment}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n'),
});

export const feedbackAppendix = (feedback: string) => `\n\nMüştərinin rəyi:\n${feedback}`;
