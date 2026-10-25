/**
 * Copy of the Google review request (e-mail, in-app notification, WhatsApp) and of the staff task created
 * instead when the client was unhappy. Client languages az / de / en / ru; anything else (tr / uk) → English.
 */
export const GR_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type GrLocale = (typeof GR_LOCALES)[number];
export const grLocale = (l: string | null | undefined): GrLocale => ((GR_LOCALES as readonly string[]).includes(l ?? '') ? (l as GrLocale) : 'en');

interface GrTexts {
  title: string;
  body: (p: { firstName: string; trigger: 'APPROVED' | 'ARRIVAL' }) => string;
  cta: string;
  optOut: string;
  optOutLink: string;
  whatsapp: (p: { firstName: string; url: string }) => string;
}

export const GR_TEXTS: Record<GrLocale, GrTexts> = {
  az: {
    title: 'Təcrübənizi Google-da paylaşarsınız?',
    body: ({ firstName, trigger }) =>
      `Salam, ${firstName}!\n\n${trigger === 'ARRIVAL' ? 'Almaniyaya xoş gəldiniz! Ümid edirik, ilk günləriniz yaxşı keçir.' : 'Vizanızın təsdiqlənməsi bizi çox sevindirdi.'} Sizinlə işləmək bizim üçün xoş idi.\n\nTriad Vision ilə təcrübənizi Google-da bir neçə cümlə ilə paylaşsanız, Almaniyaya yol axtaran başqa insanlara çox kömək etmiş olarsınız. Bu, cəmi bir dəqiqə çəkir.\n\nTəşəkkür edirik!`,
    cta: 'Google-da rəy yazın',
    optOut: 'Bu xahişi bir dəfə göndəririk. Belə xahişlər almaq istəmirsinizsə:',
    optOutLink: 'imtina edin',
    whatsapp: ({ firstName, url }) => `Salam, ${firstName}! Triad Vision ilə təcrübənizi Google-da paylaşsanız, başqalarına çox kömək edərsiniz (1 dəqiqə): ${url}`,
  },
  de: {
    title: 'Teilen Sie Ihre Erfahrung auf Google?',
    body: ({ firstName, trigger }) =>
      `Hallo ${firstName},\n\n${trigger === 'ARRIVAL' ? 'willkommen in Deutschland! Wir hoffen, Ihre ersten Tage laufen gut.' : 'wir freuen uns sehr über die Genehmigung Ihres Visums.'} Es war schön, Sie begleiten zu dürfen.\n\nWenn Sie Ihre Erfahrung mit Triad Vision in ein paar Sätzen auf Google teilen, helfen Sie anderen Menschen auf ihrem Weg nach Deutschland sehr. Es dauert nur eine Minute.\n\nVielen Dank!`,
    cta: 'Bewertung auf Google schreiben',
    optOut: 'Wir senden diese Bitte nur einmal. Wenn Sie solche Bitten nicht erhalten möchten:',
    optOutLink: 'abmelden',
    whatsapp: ({ firstName, url }) => `Hallo ${firstName}! Wenn Sie Ihre Erfahrung mit Triad Vision auf Google teilen, helfen Sie anderen sehr (1 Minute): ${url}`,
  },
  en: {
    title: 'Would you share your experience on Google?',
    body: ({ firstName, trigger }) =>
      `Hello ${firstName},\n\n${trigger === 'ARRIVAL' ? 'welcome to Germany! We hope your first days are going well.' : 'we are delighted that your visa was approved.'} It was a pleasure to work with you.\n\nIf you share your experience with Triad Vision in a few sentences on Google, you help other people on their way to Germany a lot. It only takes a minute.\n\nThank you!`,
    cta: 'Write a Google review',
    optOut: 'We send this request only once. If you do not want such requests:',
    optOutLink: 'opt out',
    whatsapp: ({ firstName, url }) => `Hello ${firstName}! Sharing your experience with Triad Vision on Google helps others a lot (1 minute): ${url}`,
  },
  ru: {
    title: 'Поделитесь впечатлениями в Google?',
    body: ({ firstName, trigger }) =>
      `Здравствуйте, ${firstName}!\n\n${trigger === 'ARRIVAL' ? 'Добро пожаловать в Германию! Надеемся, первые дни проходят хорошо.' : 'Мы очень рады, что ваша виза одобрена.'} Нам было приятно с вами работать.\n\nЕсли вы поделитесь опытом работы с Triad Vision в нескольких предложениях в Google, вы очень поможете другим людям на пути в Германию. Это займёт всего минуту.\n\nСпасибо!`,
    cta: 'Написать отзыв в Google',
    optOut: 'Мы отправляем эту просьбу только один раз. Если вы не хотите получать такие просьбы:',
    optOutLink: 'отписаться',
    whatsapp: ({ firstName, url }) => `Здравствуйте, ${firstName}! Отзыв о Triad Vision в Google очень поможет другим (1 минута): ${url}`,
  },
};

/** Staff task (Azerbaijani: the team's working language) when a low satisfaction score routes the client to us instead of Google. */
export const internalTaskText = (p: { clientName: string; number: string | null; score: number; comment: string | null }) => ({
  title: `Narazı müştəri ilə əlaqə: ${p.clientName}${p.number ? ` (${p.number})` : ''}`,
  description: [
    `Müştəri məmnuniyyət sorğusunda ${p.score}/10 qiymət verib. Google rəyi xahişi göndərilmədi — əvəzində müştəri ilə əlaqə saxlayın, nəyin yaxşı getmədiyini öyrənin və həll edin.`,
    p.comment ? `\nMüştərinin şərhi:\n${p.comment}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n'),
});
