import type { cookieConsentCopy } from '../../cookieConsent';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof cookieConsentCopy)['en']> = {
  legalDocs: {
    footer: { terms: 'Умови (AGB)', cookies: 'Налаштування cookie' },
    cookie: {
      title: 'Cookie та конфіденційність',
      text: 'Необхідні cookie (вхід, мова) ми використовуємо завжди. За вашою згодою ми також використовуємо статистичні cookie, щоб покращувати вебсайт, і маркетингові cookie, щоб оцінювати успішність нашої реклами. Ви можете змінити свій вибір будь-коли.',
      acceptAll: 'Прийняти всі',
      necessaryOnly: 'Лише необхідні',
      settings: 'Налаштування',
      save: 'Зберегти вибір',
      back: 'Назад',
      settingsTitle: 'Налаштування cookie',
      policy: 'Політика cookie',
      privacy: 'Політика конфіденційності',
      always: 'Завжди увімкнені',
      saved: 'Ваш вибір збережено',
      categories: {
        necessary: { title: 'Необхідні', text: 'Сесія входу, мова, відображення та цей вибір. Без них вебсайт не працює.' },
        analytics: { title: 'Статистика', text: 'Допомагає нам анонімно оцінювати, як використовуються сторінки, і покращувати вебсайт.' },
        marketing: { title: 'Маркетинг', text: 'Оцінює успішність наших рекламних кампаній.' },
      },
    },
    register: {
      termsBefore: 'Я прочитав(-ла) і приймаю ',
      termsLink: 'Загальні умови (AGB)',
      termsAfter: '.',
      termsError: 'Щоб продовжити, прийміть умови (AGB).',
    },
  },
};

export default copy;
