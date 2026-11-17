/** Texts of the "letter to my future self" delivery (e-mail + portal notification), az / de / en / ru. */

export type LetterLocale = 'az' | 'de' | 'en' | 'ru';
export const asLetterLocale = (v: unknown): LetterLocale => (v === 'az' || v === 'de' || v === 'en' || v === 'ru' ? v : 'az');

export const LETTER_TEXTS: Record<LetterLocale, { subject: string; intro: (written: string) => string; outro: string; cta: string; notifyTitle: string; notifyBody: string }> = {
  az: {
    subject: 'Keçmişdən sizə məktub var',
    intro: (d) => `${d} tarixində özünüzə bu məktubu yazmışdınız — Almaniyaya gəldiyiniz gün oxumaq üçün:`,
    outro: 'Bu məktubu yalnız siz görə bilərsiniz. Triad Vision komandası onun mətnini oxuya bilmir.',
    cta: 'Kabinetdə aç',
    notifyTitle: 'Gələcəyə məktubunuz çatdı',
    notifyBody: 'Özünüzə yazdığınız məktub artıq açıqdır. Kabinetdə oxuya bilərsiniz.',
  },
  de: {
    subject: 'Ein Brief aus der Vergangenheit für Sie',
    intro: (d) => `Diesen Brief haben Sie sich am ${d} selbst geschrieben — zum Lesen am Tag Ihrer Ankunft in Deutschland:`,
    outro: 'Nur Sie können diesen Brief sehen. Das Triad Vision Team kann den Text nicht lesen.',
    cta: 'Im Portal öffnen',
    notifyTitle: 'Ihr Brief an Ihr zukünftiges Ich ist da',
    notifyBody: 'Der Brief, den Sie sich selbst geschrieben haben, ist jetzt geöffnet. Sie können ihn im Portal lesen.',
  },
  en: {
    subject: 'A letter from your past self',
    intro: (d) => `You wrote this letter to yourself on ${d} — to read on the day you arrive in Germany:`,
    outro: 'Only you can see this letter. The Triad Vision team cannot read its text.',
    cta: 'Open in the portal',
    notifyTitle: 'Your letter to your future self has arrived',
    notifyBody: 'The letter you wrote to yourself is now open. You can read it in the portal.',
  },
  ru: {
    subject: 'Письмо вам из прошлого',
    intro: (d) => `Это письмо вы написали себе ${d} — чтобы прочитать в день приезда в Германию:`,
    outro: 'Это письмо видите только вы. Команда Triad Vision не может прочитать его текст.',
    cta: 'Открыть в портале',
    notifyTitle: 'Ваше письмо себе в будущее пришло',
    notifyBody: 'Письмо, которое вы написали себе, теперь открыто. Его можно прочитать в портале.',
  },
};

export const LETTER_DATE_LOCALE: Record<LetterLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
