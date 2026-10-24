// Cookie consent banner, footer links and the sign-up AGB checkbox (components/legal/CookieConsent, Register). Small on purpose: it ships with the
// site layout, so the full legal copy (pagesLegalDocs) is not part of every page.
const az = {
  legalDocs: {
    footer: { terms: 'AGB (şərtlər)', cookies: 'Cookie ayarları' },
    cookie: {
      title: 'Cookie-lər və məxfilik',
      text: 'Sayt üçün zəruri cookie-lərdən (giriş, dil) həmişə istifadə edirik. Razılıq versəniz, saytı yaxşılaşdırmaq üçün statistika və reklamın effektivliyini ölçmək üçün marketinq cookie-lərindən də istifadə edəcəyik. Seçiminizi istənilən vaxt dəyişə bilərsiniz.',
      acceptAll: 'Hamısını qəbul et',
      necessaryOnly: 'Yalnız zəruri',
      settings: 'Ayarlar',
      save: 'Seçimi yadda saxla',
      back: 'Geri',
      settingsTitle: 'Cookie ayarları',
      policy: 'Cookie siyasəti',
      privacy: 'Məxfilik siyasəti',
      always: 'Həmişə aktiv',
      saved: 'Seçiminiz yadda saxlanıldı',
      categories: {
        necessary: { title: 'Zəruri', text: 'Giriş sessiyası, dil, görünüş və bu seçim. Bunlarsız sayt işləmir.' },
        analytics: { title: 'Statistika', text: 'Səhifələrdən necə istifadə edildiyini anonim ölçməyə və saytı yaxşılaşdırmağa kömək edir.' },
        marketing: { title: 'Marketinq', text: 'Reklam kampaniyalarımızın effektivliyini ölçür.' },
      },
    },
    register: {
      termsBefore: '',
      termsLink: 'Ümumi işgüzar şərtləri (AGB)',
      termsAfter: ' oxudum və qəbul edirəm.',
      termsError: 'Davam etmək üçün AGB-ni qəbul edin.',
    },
  },
};

const de: typeof az = {
  legalDocs: {
    footer: { terms: 'AGB', cookies: 'Cookie-Einstellungen' },
    cookie: {
      title: 'Cookies und Datenschutz',
      text: 'Notwendige Cookies (Anmeldung, Sprache) verwenden wir immer. Mit Ihrer Einwilligung nutzen wir außerdem Statistik-Cookies, um die Website zu verbessern, und Marketing-Cookies, um den Erfolg unserer Werbung zu messen. Sie können Ihre Wahl jederzeit ändern.',
      acceptAll: 'Alle akzeptieren',
      necessaryOnly: 'Nur notwendige',
      settings: 'Einstellungen',
      save: 'Auswahl speichern',
      back: 'Zurück',
      settingsTitle: 'Cookie-Einstellungen',
      policy: 'Cookie-Richtlinie',
      privacy: 'Datenschutzerklärung',
      always: 'Immer aktiv',
      saved: 'Ihre Auswahl wurde gespeichert',
      categories: {
        necessary: { title: 'Notwendig', text: 'Anmeldesitzung, Sprache, Darstellung und diese Auswahl. Ohne sie funktioniert die Website nicht.' },
        analytics: { title: 'Statistik', text: 'Hilft uns, anonym zu messen, wie die Seiten genutzt werden, und die Website zu verbessern.' },
        marketing: { title: 'Marketing', text: 'Misst den Erfolg unserer Werbekampagnen.' },
      },
    },
    register: {
      termsBefore: 'Ich habe die ',
      termsLink: 'Allgemeinen Geschäftsbedingungen (AGB)',
      termsAfter: ' gelesen und akzeptiere sie.',
      termsError: 'Bitte akzeptieren Sie die AGB, um fortzufahren.',
    },
  },
};

const en: typeof az = {
  legalDocs: {
    footer: { terms: 'Terms (AGB)', cookies: 'Cookie settings' },
    cookie: {
      title: 'Cookies and privacy',
      text: 'We always use necessary cookies (login, language). With your consent we also use statistics cookies to improve the website and marketing cookies to measure the success of our advertising. You can change your choice at any time.',
      acceptAll: 'Accept all',
      necessaryOnly: 'Necessary only',
      settings: 'Settings',
      save: 'Save choice',
      back: 'Back',
      settingsTitle: 'Cookie settings',
      policy: 'Cookie policy',
      privacy: 'Privacy policy',
      always: 'Always on',
      saved: 'Your choice has been saved',
      categories: {
        necessary: { title: 'Necessary', text: 'Login session, language, display and this choice. The website does not work without them.' },
        analytics: { title: 'Statistics', text: 'Helps us measure anonymously how pages are used and improve the website.' },
        marketing: { title: 'Marketing', text: 'Measures the success of our advertising campaigns.' },
      },
    },
    register: {
      termsBefore: 'I have read and accept the ',
      termsLink: 'general terms and conditions (AGB)',
      termsAfter: '.',
      termsError: 'Please accept the terms (AGB) to continue.',
    },
  },
};

const ru: typeof az = {
  legalDocs: {
    footer: { terms: 'Условия (AGB)', cookies: 'Настройки cookie' },
    cookie: {
      title: 'Cookie и конфиденциальность',
      text: 'Необходимые cookie (вход, язык) мы используем всегда. С вашего согласия мы также используем cookie статистики, чтобы улучшать сайт, и маркетинговые cookie, чтобы измерять эффективность рекламы. Вы можете изменить выбор в любое время.',
      acceptAll: 'Принять все',
      necessaryOnly: 'Только необходимые',
      settings: 'Настройки',
      save: 'Сохранить выбор',
      back: 'Назад',
      settingsTitle: 'Настройки cookie',
      policy: 'Политика cookie',
      privacy: 'Политика конфиденциальности',
      always: 'Всегда включены',
      saved: 'Ваш выбор сохранён',
      categories: {
        necessary: { title: 'Необходимые', text: 'Сессия входа, язык, отображение и этот выбор. Без них сайт не работает.' },
        analytics: { title: 'Статистика', text: 'Помогает анонимно измерять использование страниц и улучшать сайт.' },
        marketing: { title: 'Маркетинг', text: 'Измеряет эффективность наших рекламных кампаний.' },
      },
    },
    register: {
      termsBefore: 'Я прочитал(а) и принимаю ',
      termsLink: 'общие условия обслуживания (AGB)',
      termsAfter: '.',
      termsError: 'Чтобы продолжить, примите условия (AGB).',
    },
  },
};

export const cookieConsentCopy = { az, de, en, ru };
