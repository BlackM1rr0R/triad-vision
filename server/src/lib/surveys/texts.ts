import type { Locale } from '@prisma/client';

/** Survey e-mail / in-app texts per client language (the client is addressed in their locale). */
interface SurveyTexts {
  inviteTitle: string;
  inviteBody: (p: { firstName: string; number: string; approved: boolean }) => string;
  reminderTitle: string;
  reminderBody: (p: { firstName: string; number: string }) => string;
  cta: string;
}

const texts: Record<Locale, SurveyTexts> = {
  az: {
    inviteTitle: 'Xidmətimizi qiymətləndirin',
    inviteBody: ({ firstName, number, approved }) =>
      `Hörmətli ${firstName},\n\n${approved ? `${number} nömrəli müraciətiniz üzrə vizanız təsdiqləndi — təbrik edirik!` : `${number} nömrəli müraciətiniz bağlandı.`}\n\nBizimlə işləmək təcrübənizi 1 dəqiqəlik qısa sorğu ilə qiymətləndirsəniz, çox minnətdar olarıq. Cavablarınız yalnız komandamızın daxili istifadəsi üçündür.\n\nLink 30 gün etibarlıdır.`,
    reminderTitle: 'Xatırlatma: 1 dəqiqəlik sorğu',
    reminderBody: ({ firstName, number }) =>
      `Hörmətli ${firstName},\n\n${number} nömrəli müraciətiniz üzrə xidmətimizi hələ qiymətləndirməmisiniz. Rəyiniz xidmətimizi yaxşılaşdırmağa kömək edir.\n\nBu, yeganə xatırlatmadır.`,
    cta: 'Sorğunu açın',
  },
  de: {
    inviteTitle: 'Wie zufrieden waren Sie mit uns?',
    inviteBody: ({ firstName, number, approved }) =>
      `Hallo ${firstName},\n\n${approved ? `Ihr Visum zum Antrag ${number} wurde erteilt — herzlichen Glückwunsch!` : `Ihr Antrag ${number} wurde abgeschlossen.`}\n\nWir würden uns sehr freuen, wenn Sie uns in einer kurzen Umfrage (1 Minute) sagen, wie zufrieden Sie mit unserer Betreuung waren. Ihre Antworten nutzen wir nur intern.\n\nDer Link ist 30 Tage gültig.`,
    reminderTitle: 'Erinnerung: Umfrage in 1 Minute',
    reminderBody: ({ firstName, number }) =>
      `Hallo ${firstName},\n\nSie haben unsere Betreuung zu Ihrem Antrag ${number} noch nicht bewertet. Ihre Meinung hilft uns, besser zu werden.\n\nDies ist die einzige Erinnerung.`,
    cta: 'Zur Umfrage',
  },
  en: {
    inviteTitle: 'How satisfied were you with us?',
    inviteBody: ({ firstName, number, approved }) =>
      `Hello ${firstName},\n\n${approved ? `Your visa for application ${number} has been approved — congratulations!` : `Your application ${number} has been closed.`}\n\nWe would be grateful if you could tell us in a short survey (1 minute) how satisfied you were with our support. Your answers are used internally only.\n\nThe link is valid for 30 days.`,
    reminderTitle: 'Reminder: 1-minute survey',
    reminderBody: ({ firstName, number }) =>
      `Hello ${firstName},\n\nYou have not rated our support for application ${number} yet. Your opinion helps us improve.\n\nThis is the only reminder.`,
    cta: 'Open the survey',
  },
  ru: {
    inviteTitle: 'Оцените нашу работу',
    inviteBody: ({ firstName, number, approved }) =>
      `Здравствуйте, ${firstName}!\n\n${approved ? `Виза по заявке ${number} одобрена — поздравляем!` : `Ваша заявка ${number} закрыта.`}\n\nБудем благодарны, если вы ответите на короткий опрос (1 минута) о том, насколько вы довольны нашей работой. Ответы используются только внутри компании.\n\nСсылка действительна 30 дней.`,
    reminderTitle: 'Напоминание: опрос на 1 минуту',
    reminderBody: ({ firstName, number }) =>
      `Здравствуйте, ${firstName}!\n\nВы ещё не оценили нашу работу по заявке ${number}. Ваше мнение помогает нам становиться лучше.\n\nЭто единственное напоминание.`,
    cta: 'Открыть опрос',
  },
};

export const surveyTexts = (locale: Locale | string | null | undefined): SurveyTexts =>
  texts[(locale && locale in texts ? locale : 'az') as Locale];
