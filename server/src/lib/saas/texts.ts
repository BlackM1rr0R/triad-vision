import type { SeoLocale } from '../seoCatalogue.js';

/** Server texts of lib/saas (demo-request confirmation, staff invitation of the onboarding wizard). */

export const DEMO_MAIL: Record<SeoLocale, { subject: string; hello: (n: string) => string; body: (agency: string) => string; cta: string }> = {
  az: {
    subject: 'Demo sorğunuz qəbul edildi',
    hello: (n) => `Salam, ${n}!`,
    body: (a) => `${a} üçün platformanın demo sorğusunu aldıq. 2 iş günü ərzində sizinlə əlaqə saxlayıb demo üçün vaxt təklif edəcəyik. Qiymət agentliyinizin ehtiyaclarına görə fərdi hesablanır.\n\nSualınız olarsa, bu məktuba cavab yazın.`,
    cta: 'Platforma haqqında',
  },
  de: {
    subject: 'Ihre Demo-Anfrage ist eingegangen',
    hello: (n) => `Hallo ${n},`,
    body: (a) => `wir haben Ihre Demo-Anfrage für ${a} erhalten. Wir melden uns innerhalb von 2 Werktagen und schlagen einen Termin für die Demo vor. Den Preis kalkulieren wir individuell nach dem Bedarf Ihrer Agentur.\n\nBei Fragen antworten Sie einfach auf diese E-Mail.`,
    cta: 'Zur Plattform',
  },
  en: {
    subject: 'We received your demo request',
    hello: (n) => `Hello ${n},`,
    body: (a) => `we received your demo request for ${a}. We will get back to you within 2 working days and suggest a time for the demo. Pricing is quoted individually for your agency's needs.\n\nIf you have questions, just reply to this e-mail.`,
    cta: 'About the platform',
  },
  ru: {
    subject: 'Ваш запрос демо получен',
    hello: (n) => `Здравствуйте, ${n}!`,
    body: (a) => `Мы получили запрос демо платформы для ${a}. Мы свяжемся с вами в течение 2 рабочих дней и предложим время демонстрации. Стоимость рассчитывается индивидуально под задачи вашего агентства.\n\nЕсли есть вопросы, просто ответьте на это письмо.`,
    cta: 'О платформе',
  },
  tr: {
    subject: 'Demo talebiniz alındı',
    hello: (n) => `Merhaba ${n},`,
    body: (a) => `${a} için platform demo talebinizi aldık. 2 iş günü içinde sizinle iletişime geçip demo için bir zaman önereceğiz. Fiyat, ajansınızın ihtiyaçlarına göre ayrıca belirlenir.\n\nSorunuz olursa bu e-postayı yanıtlamanız yeterli.`,
    cta: 'Platform hakkında',
  },
  uk: {
    subject: 'Ваш запит на демо отримано',
    hello: (n) => `Вітаємо, ${n}!`,
    body: (a) => `Ми отримали запит на демо платформи для ${a}. Ми зв’яжемося з вами протягом 2 робочих днів і запропонуємо час демонстрації. Вартість розраховується індивідуально під потреби вашої агенції.\n\nЯкщо маєте запитання, просто дайте відповідь на цей лист.`,
    cta: 'Про платформу',
  },
};

export const INVITE_MAIL: Record<'az' | 'de' | 'en' | 'ru', { subject: (brand: string) => string; body: (inviter: string, brand: string) => string; cta: string }> = {
  az: {
    subject: (b) => `${b}: əməkdaş hesabına dəvət`,
    body: (i, b) => `${i} sizi ${b} əməkdaş panelinə dəvət etdi. Şifrənizi təyin etmək üçün aşağıdakı düyməyə basın. Link 7 gün etibarlıdır.`,
    cta: 'Şifrəni təyin et',
  },
  de: {
    subject: (b) => `${b}: Einladung zum Mitarbeiterkonto`,
    body: (i, b) => `${i} hat Sie in den Mitarbeiterbereich von ${b} eingeladen. Klicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`,
    cta: 'Passwort festlegen',
  },
  en: {
    subject: (b) => `${b}: invitation to your staff account`,
    body: (i, b) => `${i} invited you to the ${b} staff panel. Click the button to set your password. The link is valid for 7 days.`,
    cta: 'Set password',
  },
  ru: {
    subject: (b) => `${b}: приглашение в аккаунт сотрудника`,
    body: (i, b) => `${i} пригласил(а) вас в панель сотрудников ${b}. Нажмите кнопку, чтобы задать пароль. Ссылка действительна 7 дней.`,
    cta: 'Задать пароль',
  },
};

export const TEST_MAIL: Record<'az' | 'de' | 'en' | 'ru', { subject: string; body: string }> = {
  az: { subject: 'Test məktubu (quraşdırma ustası)', body: 'Bu məktub gəlibsə, serverin e-poçt göndərişi işləyir. Spam qovluğunu da yoxlayın: məktub ora düşübsə, göndərən domen üçün SPF / DKIM qeydlərini yoxlayın.' },
  de: { subject: 'Test-E-Mail (Einrichtungsassistent)', body: 'Wenn diese E-Mail angekommen ist, funktioniert der E-Mail-Versand des Servers. Prüfen Sie auch den Spam-Ordner: Landet sie dort, prüfen Sie SPF / DKIM der Absenderdomain.' },
  en: { subject: 'Test e-mail (setup wizard)', body: 'If this e-mail arrived, the server can send e-mail. Check the spam folder too: if it landed there, check the SPF / DKIM records of the sender domain.' },
  ru: { subject: 'Тестовое письмо (мастер настройки)', body: 'Если письмо пришло, отправка почты с сервера работает. Проверьте также папку «Спам»: если письмо там, проверьте записи SPF / DKIM домена отправителя.' },
};
