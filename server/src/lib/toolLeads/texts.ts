import type { SeoLocale } from '../seoCatalogue.js';

/**
 * E-mail texts of "e-mail me my result" (lib/toolLeads/service.ts) in the six site languages.
 * The result e-mail is what the visitor asked for (no consent needed); the follow-up is sent only after the
 * visitor ticked the separate checkbox AND confirmed it with the link in the result e-mail (double opt-in).
 */
export interface ToolMailTexts {
  resultSubject: (tool: string) => string;
  hello: (name: string | null) => string;
  resultIntro: (tool: string) => string;
  estimateNote: string;
  openTool: string;
  confirmTitle: string;
  confirmText: string;
  confirmCta: string;
  footerResult: string;
  followSubject: string;
  followBody: (tool: string) => string;
  followBooking: string;
  followRegister: string;
  followFooter: string;
  unsubscribe: string;
  phone: string;
}

export const TOOL_MAIL: Record<SeoLocale, ToolMailTexts> = {
  az: {
    resultSubject: (t) => `Nəticəniz: ${t}`,
    hello: (n) => (n ? `Salam, ${n}!` : 'Salam!'),
    resultIntro: (t) => `"${t}" alətində hesabladığınız nəticə aşağıdadır. Dəyərləri dəyişib yenidən baxmaq üçün düyməyə toxunun.`,
    estimateNote: 'Rəqəmlər təxminidir və hüquqi və ya vergi məsləhəti sayılmır.',
    openTool: 'Aləti yenidən aç',
    confirmTitle: 'Sizə 3 gündən sonra yazaq?',
    confirmText: 'Formada qeyd etdiniz ki, nəticəniz barədə sizə bir dəfə yazmağımızı istəyirsiniz. Bunu təsdiqləmək üçün düyməyə basın — təsdiq etməsəniz, heç nə göndərməyəcəyik.',
    confirmCta: 'Bəli, mənə yazın',
    footerResult: 'Bu məktubu triad-vision.de saytında nəticənizi e-poçtla istədiyiniz üçün alırsınız. Başqa məktub almayacaqsınız, əgər yuxarıda təsdiq etməsəniz.',
    followSubject: 'Nəticənizlə bağlı necə kömək edə bilərik?',
    followBody: (t) => `Bir neçə gün əvvəl "${t}" alətindən istifadə etdiniz. Almaniyada iş, viza və ya sənədlərlə bağlı sualınız varsa, pulsuz konsultasiya təyin edin və ya hesab açın — sənədləri birlikdə hazırlayırıq, müraciəti səfirliyə siz verirsiniz.`,
    followBooking: 'Pulsuz konsultasiya təyin et',
    followRegister: 'Hesab aç',
    followFooter: 'Bu məktubu nəticənizdən sonra bir dəfə yazmağımıza razılıq verdiyiniz üçün alırsınız. Başqa bu cür məktub olmayacaq.',
    unsubscribe: 'Abunədən çıx',
    phone: 'Telefon / WhatsApp',
  },
  de: {
    resultSubject: (t) => `Ihr Ergebnis: ${t}`,
    hello: (n) => (n ? `Hallo ${n},` : 'Hallo,'),
    resultIntro: (t) => `hier ist Ihr Ergebnis aus „${t}“. Über den Button öffnen Sie das Tool mit Ihren Werten erneut.`,
    estimateNote: 'Alle Werte sind Schätzungen und keine Rechts- oder Steuerberatung.',
    openTool: 'Tool erneut öffnen',
    confirmTitle: 'Dürfen wir uns in 3 Tagen melden?',
    confirmText: 'Sie haben im Formular angekreuzt, dass wir Ihnen einmal zu Ihrem Ergebnis schreiben dürfen. Bitte bestätigen Sie das mit dem Button — ohne Bestätigung schicken wir nichts.',
    confirmCta: 'Ja, gerne melden',
    footerResult: 'Sie erhalten diese E-Mail, weil Sie Ihr Ergebnis auf triad-vision.de angefordert haben. Weitere E-Mails erhalten Sie nur, wenn Sie oben bestätigen.',
    followSubject: 'Wie können wir Ihnen weiterhelfen?',
    followBody: (t) => `vor ein paar Tagen haben Sie „${t}“ genutzt. Wenn Sie Fragen zu Arbeit, Visum oder Unterlagen für Deutschland haben, buchen Sie eine kostenlose Beratung oder legen Sie ein Konto an — wir bereiten die Unterlagen mit Ihnen vor, den Antrag stellen Sie selbst bei der Botschaft.`,
    followBooking: 'Kostenlose Beratung buchen',
    followRegister: 'Konto anlegen',
    followFooter: 'Sie erhalten diese E-Mail, weil Sie zugestimmt haben, dass wir uns einmal nach Ihrem Ergebnis melden. Weitere E-Mails dieser Art folgen nicht.',
    unsubscribe: 'Abmelden',
    phone: 'Telefon / WhatsApp',
  },
  en: {
    resultSubject: (t) => `Your result: ${t}`,
    hello: (n) => (n ? `Hello ${n},` : 'Hello,'),
    resultIntro: (t) => `here is your result from "${t}". Use the button to open the tool with your values again.`,
    estimateNote: 'All figures are estimates and not legal or tax advice.',
    openTool: 'Open the tool again',
    confirmTitle: 'May we get in touch in 3 days?',
    confirmText: 'You ticked the box that we may write to you once about your result. Please confirm with the button — without confirmation we send nothing.',
    confirmCta: 'Yes, get in touch',
    footerResult: 'You receive this e-mail because you requested your result on triad-vision.de. You will get no other e-mails unless you confirm above.',
    followSubject: 'How can we help you with your result?',
    followBody: (t) => `a few days ago you used "${t}". If you have questions about work, visas or documents for Germany, book a free consultation or create an account — we prepare the documents with you, and you file the application at the embassy yourself.`,
    followBooking: 'Book a free consultation',
    followRegister: 'Create an account',
    followFooter: 'You receive this e-mail because you agreed that we may write to you once after your result. No further e-mails of this kind will follow.',
    unsubscribe: 'Unsubscribe',
    phone: 'Phone / WhatsApp',
  },
  ru: {
    resultSubject: (t) => `Ваш результат: ${t}`,
    hello: (n) => (n ? `Здравствуйте, ${n}!` : 'Здравствуйте!'),
    resultIntro: (t) => `ниже ваш результат из инструмента «${t}». Кнопка откроет инструмент снова с вашими значениями.`,
    estimateNote: 'Все значения — оценка, а не юридическая или налоговая консультация.',
    openTool: 'Открыть инструмент снова',
    confirmTitle: 'Можно написать вам через 3 дня?',
    confirmText: 'Вы отметили в форме, что мы можем один раз написать вам о результате. Подтвердите это кнопкой — без подтверждения мы ничего не отправим.',
    confirmCta: 'Да, напишите мне',
    footerResult: 'Вы получили это письмо, потому что запросили результат на triad-vision.de. Других писем не будет, если вы не подтвердите выше.',
    followSubject: 'Чем мы можем помочь?',
    followBody: (t) => `несколько дней назад вы пользовались инструментом «${t}». Если у вас есть вопросы о работе, визе или документах для Германии, запишитесь на бесплатную консультацию или создайте аккаунт — мы готовим документы вместе с вами, а заявление в посольство подаёте вы сами.`,
    followBooking: 'Записаться на бесплатную консультацию',
    followRegister: 'Создать аккаунт',
    followFooter: 'Вы получили это письмо, потому что согласились, чтобы мы один раз написали вам после результата. Других таких писем не будет.',
    unsubscribe: 'Отписаться',
    phone: 'Телефон / WhatsApp',
  },
  tr: {
    resultSubject: (t) => `Sonucunuz: ${t}`,
    hello: (n) => (n ? `Merhaba ${n},` : 'Merhaba,'),
    resultIntro: (t) => `"${t}" aracındaki sonucunuz aşağıda. Düğmeyle aracı değerlerinizle yeniden açabilirsiniz.`,
    estimateNote: 'Tüm değerler tahminidir; hukuki veya vergi danışmanlığı değildir.',
    openTool: 'Aracı yeniden aç',
    confirmTitle: '3 gün sonra size yazabilir miyiz?',
    confirmText: 'Formda sonucunuz hakkında size bir kez yazmamızı istediğinizi işaretlediniz. Lütfen düğmeyle onaylayın — onay olmadan hiçbir şey göndermeyiz.',
    confirmCta: 'Evet, bana yazın',
    footerResult: 'Bu e-postayı triad-vision.de üzerinde sonucunuzu talep ettiğiniz için alıyorsunuz. Yukarıda onaylamazsanız başka e-posta almazsınız.',
    followSubject: 'Size nasıl yardımcı olabiliriz?',
    followBody: (t) => `birkaç gün önce "${t}" aracını kullandınız. Almanya'da iş, vize veya belgelerle ilgili sorularınız varsa ücretsiz danışmanlık alın veya hesap açın — belgeleri sizinle birlikte hazırlıyoruz, başvuruyu büyükelçiliğe siz yapıyorsunuz.`,
    followBooking: 'Ücretsiz danışmanlık al',
    followRegister: 'Hesap aç',
    followFooter: 'Bu e-postayı, sonucunuzdan sonra size bir kez yazmamıza izin verdiğiniz için alıyorsunuz. Bu türden başka e-posta gelmeyecek.',
    unsubscribe: 'Abonelikten çık',
    phone: 'Telefon / WhatsApp',
  },
  uk: {
    resultSubject: (t) => `Ваш результат: ${t}`,
    hello: (n) => (n ? `Вітаємо, ${n}!` : 'Вітаємо!'),
    resultIntro: (t) => `нижче ваш результат з інструмента «${t}». Кнопка відкриє інструмент знову з вашими значеннями.`,
    estimateNote: 'Усі значення — оцінка, а не юридична чи податкова консультація.',
    openTool: 'Відкрити інструмент знову',
    confirmTitle: 'Можна написати вам через 3 дні?',
    confirmText: 'Ви позначили у формі, що ми можемо один раз написати вам щодо результату. Підтвердьте це кнопкою — без підтвердження ми нічого не надішлемо.',
    confirmCta: 'Так, напишіть мені',
    footerResult: 'Ви отримали цей лист, бо запросили результат на triad-vision.de. Інших листів не буде, якщо ви не підтвердите вище.',
    followSubject: 'Чим ми можемо допомогти?',
    followBody: (t) => `кілька днів тому ви користувалися інструментом «${t}». Якщо маєте запитання про роботу, візу чи документи для Німеччини, запишіться на безкоштовну консультацію або створіть акаунт — ми готуємо документи разом із вами, а заяву до посольства подаєте ви самі.`,
    followBooking: 'Записатися на безкоштовну консультацію',
    followRegister: 'Створити акаунт',
    followFooter: 'Ви отримали цей лист, бо погодилися, щоб ми один раз написали вам після результату. Інших таких листів не буде.',
    unsubscribe: 'Відписатися',
    phone: 'Телефон / WhatsApp',
  },
};
