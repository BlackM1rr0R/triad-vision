import type { Locale } from '@prisma/client';

/** Server-built texts of the site features (problem report answers, test push), in the recipient's language. */
export const SITE_TEXTS: Record<
  Locale,
  { replyTitle: string; replyIntro: string; replyQuote: string; testTitle: string; testBody: string; taskTitle: string; anonymous: string }
> = {
  az: {
    replyTitle: 'Problem bildirişinizə cavab',
    replyIntro: 'Bildirdiyiniz problemə baxdıq:',
    replyQuote: 'Sizin bildirişiniz',
    testTitle: 'Bildirişlər işləyir',
    testBody: 'Bu brauzer Triad Vision bildirişlərini alacaq.',
    taskTitle: 'Problem bildirişi',
    anonymous: 'Qonaq (daxil olmayıb)',
  },
  de: {
    replyTitle: 'Antwort auf Ihre Problemmeldung',
    replyIntro: 'Wir haben uns das gemeldete Problem angesehen:',
    replyQuote: 'Ihre Meldung',
    testTitle: 'Benachrichtigungen funktionieren',
    testBody: 'Dieser Browser erhält ab jetzt Benachrichtigungen von Triad Vision.',
    taskTitle: 'Problemmeldung',
    anonymous: 'Besucher (nicht angemeldet)',
  },
  en: {
    replyTitle: 'Reply to your problem report',
    replyIntro: 'We have looked at the problem you reported:',
    replyQuote: 'Your report',
    testTitle: 'Notifications work',
    testBody: 'This browser will now receive Triad Vision notifications.',
    taskTitle: 'Problem report',
    anonymous: 'Visitor (not logged in)',
  },
  ru: {
    replyTitle: 'Ответ на ваше сообщение о проблеме',
    replyIntro: 'Мы рассмотрели проблему, о которой вы сообщили:',
    replyQuote: 'Ваше сообщение',
    testTitle: 'Уведомления работают',
    testBody: 'Этот браузер теперь будет получать уведомления Triad Vision.',
    taskTitle: 'Сообщение о проблеме',
    anonymous: 'Посетитель (без входа)',
  },
};

export const siteLocale = (raw: string | null | undefined): Locale =>
  raw === 'de' || raw === 'en' || raw === 'ru' || raw === 'az' ? raw : 'az';
