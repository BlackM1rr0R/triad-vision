/**
 * Hand-written SEO metadata for the static pages of the public site, in all four site languages.
 *
 * - `name` is the short label used in breadcrumbs.
 * - `title` is the page part of <title>; the site name is appended (" | Triad Vision") unless `fullTitle`.
 *   The rendered title must stay ≤ 60 characters, the description ≤ 155 (tests/unit/seo.test.ts checks both).
 * - `sitemap: false` keeps an indexable page out of sitemap.xml; `index: false` marks it noindex.
 * Dynamic pages (/visas/:slug, /services/:slug, /news/:slug, /jobs/:slug) take their text from the database.
 */
export const SEO_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];
export type L10nText = Record<SeoLocale, string>;

export interface StaticPageMeta {
  name: L10nText;
  title: L10nText;
  description: L10nText;
  fullTitle?: boolean;
  sitemap?: boolean;
  index?: boolean;
}

export const SITE_NAME = 'Triad Vision';

export const STATIC_PAGES: Record<string, StaticPageMeta> = {
  '/': {
    fullTitle: true,
    name: { az: 'Ana səhifə', de: 'Startseite', en: 'Home', ru: 'Главная' },
    title: {
      az: 'Triad Vision — Almaniyada iş və viza dəstəyi',
      de: 'Triad Vision — Fachkräfte aus Aserbaidschan',
      en: 'Triad Vision — Work and visas for Germany',
      ru: 'Triad Vision — работа и визы в Германию',
    },
    description: {
      az: 'Azərbaycandan Almaniyaya etibarlı işçi təminatı: vakansiyalar, viza prosesi, sənədləşmə və inteqrasiya üzrə tam dəstək.',
      de: 'Zuverlässige Arbeitskräfte aus Aserbaidschan für deutsche Unternehmen: Auswahl, Visumverfahren, Dokumente und Integration aus einer Hand.',
      en: 'Reliable workers from Azerbaijan for German companies: recruiting, visa process, paperwork and integration support from one team.',
      ru: 'Надёжный подбор работников из Азербайджана для компаний Германии: вакансии, визовый процесс, документы и интеграция.',
    },
  },
  '/about': {
    name: { az: 'Haqqımızda', de: 'Über uns', en: 'About us', ru: 'О нас' },
    title: { az: 'Haqqımızda', de: 'Über uns', en: 'About us', ru: 'О компании' },
    description: {
      az: 'Triad Vision kimdir: Azərbaycan və Almaniya arasında işçi yerləşdirmə üzrə komandamız, dəyərlərimiz və iş prinsiplərimiz.',
      de: 'Wer wir sind: das Team von Triad Vision, unsere Werte und wie wir Fachkräfte aus Aserbaidschan nach Deutschland vermitteln.',
      en: 'Who we are: the Triad Vision team, our values and how we place skilled workers from Azerbaijan with employers in Germany.',
      ru: 'Кто мы: команда Triad Vision, наши ценности и то, как мы трудоустраиваем специалистов из Азербайджана в Германии.',
    },
  },
  '/services': {
    name: { az: 'Xidmətlər', de: 'Leistungen', en: 'Services', ru: 'Услуги' },
    title: { az: 'Xidmətlərimiz', de: 'Unsere Leistungen', en: 'Our services', ru: 'Наши услуги' },
    description: {
      az: 'İşçi seçimi, viza və sənədləşmə, dil hazırlığı və Almaniyada inteqrasiya — namizədlər və şirkətlər üçün xidmətlərimiz.',
      de: 'Personalauswahl, Visum und Dokumente, Sprachvorbereitung und Integration in Deutschland — unsere Leistungen für Firmen und Bewerber.',
      en: 'Recruiting, visa and paperwork, language preparation and integration in Germany — our services for companies and candidates.',
      ru: 'Подбор персонала, визы и документы, языковая подготовка и интеграция в Германии — услуги для компаний и кандидатов.',
    },
  },
  '/visas': {
    name: { az: 'Vizalar', de: 'Visa', en: 'Visas', ru: 'Визы' },
    title: { az: 'Viza növləri və peşələr', de: 'Visumarten und Berufe', en: 'Visa types and professions', ru: 'Виды виз и профессии' },
    description: {
      az: 'Almaniya üçün iş vizası növləri: §18b, Ausbildung, mövsümi iş və digərləri. Tələblər, maaşlar və müddətlər bir yerdə.',
      de: 'Visumarten für die Arbeit in Deutschland: §18b, Ausbildung, Saisonarbeit und mehr. Voraussetzungen, Gehälter und Dauer im Überblick.',
      en: 'Work visa types for Germany: §18b, Ausbildung, seasonal work and more. Requirements, salaries and processing times in one place.',
      ru: 'Типы рабочих виз в Германию: §18b, Ausbildung, сезонная работа и другие. Требования, зарплаты и сроки в одном месте.',
    },
  },
  '/partners': {
    name: { az: 'Tərəfdaşlar', de: 'Partner', en: 'Partners', ru: 'Партнёры' },
    title: { az: 'Tərəfdaş şirkətlər', de: 'Partnerunternehmen', en: 'Partner companies', ru: 'Компании-партнёры' },
    description: {
      az: 'Logistika, tikinti, qonaqpərvərlik və xidmət sahələrində Almaniyanın aparıcı şirkətləri ilə əməkdaşlıq edirik.',
      de: 'Wir arbeiten mit führenden deutschen Unternehmen aus Logistik, Bau, Gastronomie und Dienstleistung zusammen.',
      en: 'We work with leading German companies in logistics, construction, hospitality and services.',
      ru: 'Мы сотрудничаем с ведущими компаниями Германии в логистике, строительстве, гостиничном бизнесе и сфере услуг.',
    },
  },
  '/stories': {
    name: { az: 'Uğur hekayələri', de: 'Erfolgsgeschichten', en: 'Success stories', ru: 'Истории успеха' },
    title: { az: 'Uğur hekayələri', de: 'Erfolgsgeschichten', en: 'Success stories', ru: 'Истории успеха' },
    description: {
      az: 'Triad Vision ilə Almaniyada işə başlayan insanların real hekayələri və əməkdaşlıq etdiyimiz şirkətlərin rəyləri.',
      de: 'Echte Geschichten von Menschen, die mit Triad Vision in Deutschland angefangen haben, und Stimmen unserer Partnerfirmen.',
      en: 'Real stories of people who started working in Germany with Triad Vision, and what our partner companies say.',
      ru: 'Реальные истории людей, начавших работать в Германии с Triad Vision, и отзывы компаний-партнёров.',
    },
  },
  '/ausbildung': {
    name: { az: 'Ausbildung', de: 'Ausbildung', en: 'Ausbildung', ru: 'Ausbildung' },
    title: {
      az: 'Almaniyada Ausbildung',
      de: 'Ausbildung in Deutschland',
      en: 'Ausbildung in Germany',
      ru: 'Ausbildung в Германии',
    },
    description: {
      az: 'Almaniyada ödənişli dual peşə təhsili: öyrən, qazan və karyera qur. Şərtlər, ixtisaslar və müraciət qaydası.',
      de: 'Bezahlte duale Ausbildung in Deutschland: lernen, verdienen, Karriere machen. Voraussetzungen, Berufe und Ablauf der Bewerbung.',
      en: 'Paid dual vocational training in Germany: learn, earn and build a career. Requirements, professions and how to apply.',
      ru: 'Оплачиваемое дуальное профобучение в Германии: учитесь, зарабатывайте, стройте карьеру. Условия, профессии и подача.',
    },
  },
  '/eligibility': {
    name: { az: 'Viza testi', de: 'Visum-Check', en: 'Visa check', ru: 'Подбор визы' },
    title: { az: 'Viza testi', de: 'Visum-Check', en: 'Visa eligibility check', ru: 'Подбор визы' },
    description: {
      az: 'Bir neçə suala cavab verin və Almaniya üçün sizə uyğun viza növünü və növbəti addımları öyrənin.',
      de: 'Beantworten Sie ein paar Fragen und erfahren Sie, welches Visum für Deutschland zu Ihnen passt und wie es weitergeht.',
      en: 'Answer a few questions to find out which German visa fits you and what your next steps are.',
      ru: 'Ответьте на несколько вопросов и узнайте, какая виза в Германию вам подходит и что делать дальше.',
    },
  },
  '/salary-calculator': {
    name: { az: 'Maaş kalkulyatoru', de: 'Gehaltsrechner', en: 'Salary calculator', ru: 'Калькулятор зарплаты' },
    title: { az: 'Almaniyada xalis maaş kalkulyatoru', de: 'Brutto-Netto-Rechner Deutschland', en: 'German net salary calculator', ru: 'Калькулятор зарплаты нетто в Германии' },
    description: {
      az: 'Almaniyada brutto maaşdan xalis maaşı hesablayın: vergi sinfi, kilsə vergisi, sığorta və pensiya ayırmaları ilə təxmini hesab.',
      de: 'Berechnen Sie Ihr Nettogehalt in Deutschland: Steuerklasse, Kirchensteuer, Kranken-, Pflege-, Renten- und Arbeitslosenversicherung – als Schätzung.',
      en: 'Estimate your net salary in Germany from the gross: tax class, church tax, health, care, pension and unemployment insurance.',
      ru: 'Рассчитайте зарплату нетто в Германии из брутто: налоговый класс, церковный налог, медицинское, пенсионное страхование и др.',
    },
  },
  '/anerkennung': {
    name: { az: 'Diplomun tanınması', de: 'Anerkennung', en: 'Diploma recognition', ru: 'Признание диплома' },
    title: { az: 'Almaniyada diplomun tanınması (Anerkennung)', de: 'Anerkennung ausländischer Abschlüsse', en: 'Recognising foreign diplomas in Germany', ru: 'Признание иностранного диплома в Германии' },
    description: {
      az: 'Peşənizə görə Almaniyada diplomun tanınması: hansı qurum, hansı sənədlər, nə qədər vaxt və xərc – addım-addım bələdçi.',
      de: 'Anerkennung Ihres Berufsabschlusses in Deutschland: zuständige Stelle, Unterlagen, Dauer und Kosten – Schritt für Schritt.',
      en: 'Getting your qualification recognised in Germany: the competent authority, documents, duration and cost — step by step.',
      ru: 'Признание вашей квалификации в Германии: какое ведомство, какие документы, сроки и стоимость — пошагово.',
    },
  },
  '/cities': {
    name: { az: 'Alman şəhərləri', de: 'Deutsche Städte', en: 'German cities', ru: 'Города Германии' },
    title: { az: 'Alman şəhərləri və yaşayış xərcləri', de: 'Deutsche Städte und Lebenshaltungskosten', en: 'German cities and cost of living', ru: 'Города Германии и стоимость жизни' },
    description: {
      az: 'Almaniyanın 14 şəhərini müqayisə edin: kirayə, nəqliyyat, ərzaq xərcləri və aylıq büdcə kalkulyatoru.',
      de: 'Vergleichen Sie 14 deutsche Städte: Miete, Nahverkehr, Lebensmittel und ein Rechner für Ihr Monatsbudget.',
      en: 'Compare 14 German cities: rent, public transport, groceries and a monthly budget calculator.',
      ru: 'Сравните 14 городов Германии: аренда, транспорт, продукты и калькулятор месячного бюджета.',
    },
  },
  '/faq': {
    name: { az: 'FAQ', de: 'FAQ', en: 'FAQ', ru: 'FAQ' },
    title: { az: 'Tez-tez verilən suallar', de: 'Häufige Fragen', en: 'Frequently asked questions', ru: 'Частые вопросы' },
    description: {
      az: 'Almaniyada iş, viza prosesi, sənədlər, müddətlər və xərclər haqqında ən çox verilən suallar və cavablar.',
      de: 'Antworten auf die häufigsten Fragen zu Arbeit in Deutschland, Visumverfahren, Dokumenten, Dauer und Kosten.',
      en: 'Answers to the most common questions about working in Germany, the visa process, documents, timelines and costs.',
      ru: 'Ответы на частые вопросы о работе в Германии, визовом процессе, документах, сроках и стоимости.',
    },
  },
  '/news': {
    name: { az: 'Xəbərlər', de: 'News', en: 'News', ru: 'Новости' },
    title: { az: 'Xəbərlər və bələdçilər', de: 'News und Ratgeber', en: 'News and guides', ru: 'Новости и гиды' },
    description: {
      az: 'Almaniyada iş və viza qaydaları üzrə son xəbərlər, praktiki bələdçilər və Triad Vision yenilikləri.',
      de: 'Aktuelles zu Arbeit und Visaregeln in Deutschland, praktische Ratgeber und Neuigkeiten von Triad Vision.',
      en: 'Latest news on work and visa rules in Germany, practical guides and updates from Triad Vision.',
      ru: 'Новости о работе и визовых правилах в Германии, практические гиды и обновления Triad Vision.',
    },
  },
  '/contact': {
    name: { az: 'Əlaqə', de: 'Kontakt', en: 'Contact', ru: 'Контакты' },
    title: { az: 'Əlaqə', de: 'Kontakt', en: 'Contact us', ru: 'Контакты' },
    description: {
      az: 'Bakı və Berlin ofislərimiz, telefon, WhatsApp və e-poçt. Suallarınızı yazın — tezliklə cavab verəcəyik.',
      de: 'Unsere Büros in Baku und Berlin, Telefon, WhatsApp und E-Mail. Schreiben Sie uns — wir antworten schnell.',
      en: 'Our offices in Baku and Berlin, phone, WhatsApp and e-mail. Send us your question and we will reply soon.',
      ru: 'Наши офисы в Баку и Берлине, телефон, WhatsApp и e-mail. Напишите нам — мы быстро ответим.',
    },
  },
  '/cooperation': {
    name: { az: 'Əməkdaşlıq', de: 'Kooperation', en: 'Cooperation', ru: 'Сотрудничество' },
    title: {
      az: 'Şirkətlər üçün əməkdaşlıq',
      de: 'Kooperation für Unternehmen',
      en: 'Cooperation for employers',
      ru: 'Сотрудничество для компаний',
    },
    description: {
      az: 'Almaniyadakı şirkətiniz üçün Azərbaycandan işçi lazımdır? Əməkdaşlıq sorğusu göndərin, prosesi biz idarə edək.',
      de: 'Sie suchen Arbeitskräfte aus Aserbaidschan? Senden Sie eine Kooperationsanfrage — wir übernehmen Auswahl und Visumverfahren.',
      en: 'Need workers from Azerbaijan for your company in Germany? Send a cooperation request and we handle recruiting and visas.',
      ru: 'Нужны работники из Азербайджана для вашей компании в Германии? Отправьте запрос — подбор и визы берём на себя.',
    },
  },
  '/jobs': {
    name: { az: 'Vakansiyalar', de: 'Stellenangebote', en: 'Jobs', ru: 'Вакансии' },
    title: {
      az: 'Almaniyada vakansiyalar',
      de: 'Stellenangebote in Deutschland',
      en: 'Jobs in Germany',
      ru: 'Вакансии в Германии',
    },
    description: {
      az: 'Almaniyada açıq iş elanları: sürücülər, tikinti, qonaqpərvərlik, Ausbildung və daha çoxu. Viza dəstəyi ilə müraciət edin.',
      de: 'Offene Stellen in Deutschland: Fahrer, Bau, Gastronomie, Ausbildung und mehr. Jetzt bewerben — inklusive Visumunterstützung.',
      en: 'Open jobs in Germany: drivers, construction, hospitality, Ausbildung and more. Apply now with full visa support.',
      ru: 'Открытые вакансии в Германии: водители, стройка, гостиничный бизнес, Ausbildung и другие. Подайте заявку с визовой поддержкой.',
    },
  },
  '/booking': {
    name: { az: 'Görüş təyin et', de: 'Termin buchen', en: 'Book a call', ru: 'Запись' },
    title: {
      az: 'Konsultasiya üçün görüş təyin et',
      de: 'Beratungstermin buchen',
      en: 'Book a consultation',
      ru: 'Записаться на консультацию',
    },
    description: {
      az: 'Komandamızla pulsuz onlayn konsultasiya üçün sizə uyğun vaxtı seçin — iş, viza və sənədlər barədə danışaq.',
      de: 'Wählen Sie einen passenden Termin für ein kostenloses Online-Gespräch mit unserem Team zu Job, Visum und Dokumenten.',
      en: 'Pick a time for a free online consultation with our team about jobs, visas and documents.',
      ru: 'Выберите удобное время для бесплатной онлайн-консультации с нашей командой о работе, визе и документах.',
    },
  },
  '/impressum': {
    name: { az: 'Impressum', de: 'Impressum', en: 'Imprint', ru: 'Impressum' },
    title: { az: 'Impressum', de: 'Impressum', en: 'Imprint (Impressum)', ru: 'Impressum' },
    description: {
      az: 'Triad Vision haqqında hüquqi məlumat: şirkət, ünvan, əlaqə və məsul şəxs (Almaniya qanunvericiliyinə uyğun Impressum).',
      de: 'Impressum von Triad Vision: Anbieterkennzeichnung, Anschrift, Kontakt und Verantwortliche gemäß § 5 DDG.',
      en: 'Legal notice of Triad Vision: provider identification, address, contact and responsible person under German law.',
      ru: 'Правовая информация Triad Vision: компания, адрес, контакты и ответственное лицо согласно законодательству Германии.',
    },
  },
  '/privacy': {
    name: { az: 'Məxfilik siyasəti', de: 'Datenschutz', en: 'Privacy policy', ru: 'Конфиденциальность' },
    title: {
      az: 'Məxfilik siyasəti',
      de: 'Datenschutzerklärung',
      en: 'Privacy policy',
      ru: 'Политика конфиденциальности',
    },
    description: {
      az: 'Triad Vision şəxsi məlumatlarınızı necə emal edir, qoruyur və hansı hüquqlarınız var (GDPR / DSGVO).',
      de: 'Wie Triad Vision personenbezogene Daten verarbeitet und schützt und welche Rechte Sie nach der DSGVO haben.',
      en: 'How Triad Vision processes and protects your personal data and which rights you have under the GDPR.',
      ru: 'Как Triad Vision обрабатывает и защищает ваши персональные данные и какие у вас права по GDPR.',
    },
  },
  '/accessibility': {
    name: { az: 'Əlçatanlıq', de: 'Barrierefreiheit', en: 'Accessibility', ru: 'Доступность' },
    title: { az: 'Əlçatanlıq bəyanatı', de: 'Barrierefreiheit', en: 'Accessibility statement', ru: 'Доступность сайта' },
    description: {
      az: 'Saytımızın əlçatanlıq imkanları: mətn ölçüsü, kontrast, oxunaqlı şrift və digər tənzimləmələr.',
      de: 'Barrierefreiheit unserer Website: Schriftgröße, Kontrast, gut lesbare Schrift und weitere Einstellungen.',
      en: 'Accessibility features of our website: text size, contrast, readable font and other settings.',
      ru: 'Возможности доступности сайта: размер текста, контраст, удобочитаемый шрифт и другие настройки.',
    },
  },
  '/register': {
    sitemap: false,
    name: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Register', ru: 'Регистрация' },
    title: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Create an account', ru: 'Регистрация' },
    description: {
      az: 'Pulsuz hesab yaradın, viza müraciətinizi başladın və prosesi şəxsi kabinetdən izləyin.',
      de: 'Kostenloses Konto anlegen, Visumantrag starten und den Fortschritt im Kundenbereich verfolgen.',
      en: 'Create a free account, start your visa application and track every step in your personal portal.',
      ru: 'Создайте бесплатный аккаунт, начните визовую заявку и следите за процессом в личном кабинете.',
    },
  },
  '/employers/register': {
    sitemap: false,
    name: { az: 'İşəgötürənlər üçün', de: 'Für Arbeitgeber', en: 'For employers', ru: 'Работодателям' },
    title: {
      az: 'İşəgötürən qeydiyyatı',
      de: 'Registrierung für Arbeitgeber',
      en: 'Employer registration',
      ru: 'Регистрация работодателя',
    },
    description: {
      az: 'Şirkətinizi qeydiyyatdan keçirin, vakansiya yerləşdirin və Azərbaycandan uyğun namizədlər alın.',
      de: 'Registrieren Sie Ihr Unternehmen, veröffentlichen Sie Stellen und erhalten Sie passende Kandidaten aus Aserbaidschan.',
      en: 'Register your company, post vacancies and receive matching candidates from Azerbaijan.',
      ru: 'Зарегистрируйте компанию, размещайте вакансии и получайте подходящих кандидатов из Азербайджана.',
    },
  },
  '/login': {
    sitemap: false,
    index: false,
    name: { az: 'Daxil ol', de: 'Anmelden', en: 'Sign in', ru: 'Войти' },
    title: { az: 'Daxil ol', de: 'Anmelden', en: 'Sign in', ru: 'Вход' },
    description: {
      az: 'Triad Vision şəxsi kabinetinə daxil olun.',
      de: 'Melden Sie sich im Triad Vision Kundenbereich an.',
      en: 'Sign in to your Triad Vision portal.',
      ru: 'Вход в личный кабинет Triad Vision.',
    },
  },
  '/forgot-password': {
    sitemap: false,
    index: false,
    name: { az: 'Şifrəni bərpa et', de: 'Passwort vergessen', en: 'Forgot password', ru: 'Восстановление пароля' },
    title: { az: 'Şifrəni bərpa et', de: 'Passwort vergessen', en: 'Forgot password', ru: 'Восстановление пароля' },
    description: {
      az: 'Triad Vision hesabınızın şifrəsini bərpa edin.',
      de: 'Setzen Sie das Passwort Ihres Triad Vision Kontos zurück.',
      en: 'Reset the password of your Triad Vision account.',
      ru: 'Восстановите пароль от аккаунта Triad Vision.',
    },
  },
};

/** Generic tags for unknown and private paths. */
export const GENERIC_META: { title: L10nText; description: L10nText } = {
  title: {
    az: 'Triad Vision — İnsanlar · İş · İmkanlar',
    de: 'Triad Vision — Menschen · Arbeit · Chancen',
    en: 'Triad Vision — People · Work · Opportunities',
    ru: 'Triad Vision — Люди · Работа · Возможности',
  },
  description: STATIC_PAGES['/'].description,
};

/** Paths that must never be indexed (prefix match on a path segment boundary). Mirrors robots.txt. */
export const PRIVATE_PREFIXES = [
  '/admin',
  '/workspace',
  '/account',
  '/company',
  '/api',
  '/booking/manage',
  '/review',
  '/verify-email',
  '/login/2fa',
  '/reset-password',
  '/sign',
];

/** Static routes listed in sitemap.xml, in this order. */
export const SITEMAP_STATIC = Object.entries(STATIC_PAGES)
  .filter(([, m]) => m.sitemap !== false && m.index !== false)
  .map(([p]) => p);

/** Breadcrumb parent for dynamic detail pages. */
export const SECTION_OF: Record<string, string> = {
  visas: '/visas',
  services: '/services',
  news: '/news',
  jobs: '/jobs',
};
