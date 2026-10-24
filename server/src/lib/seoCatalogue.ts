/**
 * Hand-written SEO metadata for the static pages of the public site, in all six site languages.
 *
 * - `name` is the short label used in breadcrumbs.
 * - `title` is the page part of <title>; the site name is appended (" | Triad Vision") unless `fullTitle`.
 *   The rendered title must stay ≤ 60 characters, the description ≤ 155 (tests/unit/seo.test.ts checks both).
 * - `sitemap: false` keeps an indexable page out of sitemap.xml; `index: false` marks it noindex.
 * Dynamic pages (/visas/:slug, /services/:slug, /news/:slug, /jobs/:slug, /guides/:slug) take their text from
 * the database.
 *
 * Languages and URLs: az lives at the root (x-default), the others under a path prefix (/de/…, /tr/…).
 * CMS content exists in the four content languages; tr / uk pages fall back to English content.
 * Turkish and Ukrainian texts here are optional per entry (missing → English) so a page added later with
 * four languages still type-checks.
 */
export const SEO_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];
/** Languages every CMS text (L10n JSON) exists in. */
export const CONTENT_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
/** Languages with a URL prefix (az is the root). */
export const PREFIX_LOCALES = ['de', 'en', 'ru', 'tr', 'uk'] as const satisfies readonly SeoLocale[];
export type L10nText = Record<ContentLocale, string> & Partial<Record<'tr' | 'uk', string>>;

/** One language of a catalogue text (tr / uk fall back to English). */
export const textIn = (t: L10nText, lng: SeoLocale): string => t[lng] ?? t.en;

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
    name: { az: 'Ana səhifə', de: 'Startseite', en: 'Home', ru: 'Главная', tr: 'Ana sayfa', uk: 'Головна' },
    title: {
      az: 'Triad Vision — Almaniyada iş və viza dəstəyi',
      de: 'Triad Vision — Fachkräfte aus Aserbaidschan',
      en: 'Triad Vision — Work and visas for Germany',
      ru: 'Triad Vision — работа и визы в Германию',
      tr: 'Triad Vision — Almanya\'da iş ve vize desteği',
      uk: 'Triad Vision — робота і візи до Німеччини',
    },
    description: {
      az: 'Azərbaycandan Almaniyaya etibarlı işçi təminatı: vakansiyalar, viza prosesi, sənədləşmə və inteqrasiya üzrə tam dəstək.',
      de: 'Zuverlässige Arbeitskräfte aus Aserbaidschan für deutsche Unternehmen: Auswahl, Visumverfahren, Dokumente und Integration aus einer Hand.',
      en: 'Reliable workers from Azerbaijan for German companies: recruiting, visa process, paperwork and integration support from one team.',
      ru: 'Надёжный подбор работников из Азербайджана для компаний Германии: вакансии, визовый процесс, документы и интеграция.',
      tr: 'Azerbaycan, Türkiye ve Ukrayna\'dan Almanya\'ya: iş ilanları, vize süreci, belgeler ve uyum için uçtan uca destek.',
      uk: 'Робота в Німеччині для фахівців: вакансії, візовий процес, документи та інтеграція — супровід від першої консультації до переїзду.',
    },
  },
  // The two audience landing pages and the tools hub (header: For workers ▾, For employers ▾ … ; footer: Resources).
  '/for-workers': {
    name: { az: 'İşçilər üçün', de: 'Für Fachkräfte', en: 'For workers', ru: 'Работникам', tr: 'Çalışanlar için', uk: 'Працівникам' },
    title: {
      az: 'Almaniyada iş: işçilər və namizədlər üçün',
      de: 'Arbeiten in Deutschland: für Fachkräfte',
      en: 'Work in Germany: for workers and trainees',
      ru: 'Работа в Германии: для работников',
      tr: 'Almanya\'da iş: çalışanlar ve adaylar için',
      uk: 'Робота в Німеччині: для працівників',
    },
    description: {
      az: 'Almaniyada iş, viza və Ausbildung: vakansiyalar, sənədlər, dil hazırlığı və köç — ilk addımdan ilk maaşa qədər dəstək.',
      de: 'Arbeit, Visum und Ausbildung in Deutschland: Stellen, Dokumente, Sprachvorbereitung und Umzug — Begleitung bis zum ersten Gehalt.',
      en: 'Work, visa and Ausbildung in Germany: jobs, documents, language preparation and the move — support up to your first salary.',
      ru: 'Работа, виза и Ausbildung в Германии: вакансии, документы, языковая подготовка и переезд — поддержка до первой зарплаты.',
      tr: 'Almanya\'da iş, vize ve Ausbildung: iş ilanları, belgeler, dil hazırlığı ve taşınma — ilk maaşınıza kadar destek.',
      uk: 'Робота, віза та Ausbildung у Німеччині: вакансії, документи, мовна підготовка й переїзд — підтримка до першої зарплати.',
    },
  },
  '/for-employers': {
    name: { az: 'İşəgötürənlər üçün', de: 'Für Arbeitgeber', en: 'For employers', ru: 'Работодателям', tr: 'İşverenler için', uk: 'Роботодавцям' },
    title: {
      az: 'İşəgötürənlər üçün: xaricdən işçi təminatı',
      de: 'Fachkräfte aus dem Ausland für Arbeitgeber',
      en: 'Hire skilled workers from abroad',
      ru: 'Работодателям: персонал из-за рубежа',
      tr: 'İşverenler için: yurt dışından personel',
      uk: 'Роботодавцям: персонал з-за кордону',
    },
    description: {
      az: 'Alman şirkətləri üçün xaricdən yoxlanılmış işçilər: namizəd seçimi, müsahibə, viza, Anerkennung və inteqrasiya bir komandadan.',
      de: 'Geprüfte Fachkräfte aus dem Ausland: Kandidatenauswahl, Interviews, Visum, Anerkennung und Integration aus einer Hand.',
      en: 'Screened workers from abroad for German companies: candidate selection, interviews, visa, recognition and integration from one team.',
      ru: 'Проверенные работники из-за рубежа для компаний Германии: подбор, собеседования, виза, признание дипломов и интеграция.',
      tr: 'Alman şirketleri için yurt dışından elemeden geçmiş personel: aday seçimi, mülakat, vize, denklik ve uyum tek ekipten.',
      uk: 'Перевірені працівники з-за кордону для компаній Німеччини: підбір, співбесіди, віза, визнання дипломів та інтеграція.',
    },
  },
  '/tools': {
    name: { az: 'Alətlər', de: 'Tools', en: 'Tools', ru: 'Инструменты', tr: 'Araçlar', uk: 'Інструменти' },
    title: {
      az: 'Pulsuz alətlər: kalkulyatorlar və testlər',
      de: 'Kostenlose Rechner und Checks für Deutschland',
      en: 'Free calculators and checks for Germany',
      ru: 'Бесплатные калькуляторы и тесты',
      tr: 'Ücretsiz hesaplayıcılar ve testler',
      uk: 'Безкоштовні калькулятори й тести',
    },
    description: {
      az: 'Viza testi, Mavi Kart və İmkan Kartı yoxlaması, maaş və xərc kalkulyatoru, şəhərlər və xəritə — Almaniyaya köç üçün bütün alətlər.',
      de: 'Visum-Check, Blaue Karte und Chancenkarte, Gehalts- und Kostenrechner, Städte und Karte — alle Tools für den Weg nach Deutschland.',
      en: 'Visa check, Blue Card and Opportunity Card checks, salary and cost calculators, cities and map — every tool for your move to Germany.',
      ru: 'Подбор визы, проверка Голубой карты и Chancenkarte, калькуляторы зарплаты и расходов, города и карта — всё для переезда.',
      tr: 'Vize testi, Mavi Kart ve Fırsat Kartı kontrolü, maaş ve maliyet hesaplayıcı, şehirler ve harita — Almanya\'ya taşınma için tüm araçlar.',
      uk: 'Підбір візи, перевірка Блакитної карти й Chancenkarte, калькулятори зарплати та витрат, міста й карта — усе для переїзду.',
    },
  },
  '/about': {
    name: { az: 'Haqqımızda', de: 'Über uns', en: 'About us', ru: 'О нас', tr: 'Hakkımızda', uk: 'Про нас' },
    title: { az: 'Haqqımızda', de: 'Über uns', en: 'About us', ru: 'О компании', tr: 'Hakkımızda', uk: 'Про компанію' },
    description: {
      az: 'Triad Vision kimdir: Azərbaycan və Almaniya arasında işçi yerləşdirmə üzrə komandamız, dəyərlərimiz və iş prinsiplərimiz.',
      de: 'Wer wir sind: das Team von Triad Vision, unsere Werte und wie wir Fachkräfte aus Aserbaidschan nach Deutschland vermitteln.',
      en: 'Who we are: the Triad Vision team, our values and how we place skilled workers from Azerbaijan with employers in Germany.',
      ru: 'Кто мы: команда Triad Vision, наши ценности и то, как мы трудоустраиваем специалистов из Азербайджана в Германии.',
      tr: 'Triad Vision kimdir: Almanya\'ya nitelikli işgücü yerleştiren ekibimiz, değerlerimiz ve çalışma ilkelerimiz.',
      uk: 'Хто ми: команда Triad Vision, наші цінності та те, як ми допомагаємо фахівцям знайти роботу в Німеччині.',
    },
  },
  '/services': {
    name: { az: 'Xidmətlər', de: 'Leistungen', en: 'Services', ru: 'Услуги', tr: 'Hizmetler', uk: 'Послуги' },
    title: { az: 'Xidmətlərimiz', de: 'Unsere Leistungen', en: 'Our services', ru: 'Наши услуги', tr: 'Hizmetlerimiz', uk: 'Наші послуги' },
    description: {
      az: 'İşçi seçimi, viza və sənədləşmə, dil hazırlığı və Almaniyada inteqrasiya — namizədlər və şirkətlər üçün xidmətlərimiz.',
      de: 'Personalauswahl, Visum und Dokumente, Sprachvorbereitung und Integration in Deutschland — unsere Leistungen für Firmen und Bewerber.',
      en: 'Recruiting, visa and paperwork, language preparation and integration in Germany — our services for companies and candidates.',
      ru: 'Подбор персонала, визы и документы, языковая подготовка и интеграция в Германии — услуги для компаний и кандидатов.',
      tr: 'Personel seçimi, vize ve belgeler, dil hazırlığı ve Almanya\'da uyum — adaylar ve şirketler için hizmetlerimiz.',
      uk: 'Підбір персоналу, візи та документи, мовна підготовка й інтеграція в Німеччині — послуги для компаній і кандидатів.',
    },
  },
  '/visas': {
    name: { az: 'Vizalar', de: 'Visa', en: 'Visas', ru: 'Визы', tr: 'Vizeler', uk: 'Візи' },
    title: { az: 'Viza növləri və peşələr', de: 'Visumarten und Berufe', en: 'Visa types and professions', ru: 'Виды виз и профессии', tr: 'Vize türleri ve meslekler', uk: 'Види віз і професії' },
    description: {
      az: 'Almaniya üçün iş vizası növləri: §18b, Ausbildung, mövsümi iş və digərləri. Tələblər, maaşlar və müddətlər bir yerdə.',
      de: 'Visumarten für die Arbeit in Deutschland: §18b, Ausbildung, Saisonarbeit und mehr. Voraussetzungen, Gehälter und Dauer im Überblick.',
      en: 'Work visa types for Germany: §18b, Ausbildung, seasonal work and more. Requirements, salaries and processing times in one place.',
      ru: 'Типы рабочих виз в Германию: §18b, Ausbildung, сезонная работа и другие. Требования, зарплаты и сроки в одном месте.',
      tr: 'Almanya çalışma vizesi türleri: §18b, Ausbildung, mevsimlik iş ve daha fazlası. Şartlar, maaşlar ve süreler tek sayfada.',
      uk: 'Типи робочих віз до Німеччини: §18b, Ausbildung, сезонна робота та інші. Вимоги, зарплати й терміни в одному місці.',
    },
  },
  '/partners': {
    name: { az: 'Tərəfdaşlar', de: 'Partner', en: 'Partners', ru: 'Партнёры', tr: 'Partnerler', uk: 'Партнери' },
    title: { az: 'Tərəfdaş şirkətlər', de: 'Partnerunternehmen', en: 'Partner companies', ru: 'Компании-партнёры', tr: 'Partner şirketler', uk: 'Компанії-партнери' },
    description: {
      az: 'Logistika, tikinti, qonaqpərvərlik və xidmət sahələrində Almaniyanın aparıcı şirkətləri ilə əməkdaşlıq edirik.',
      de: 'Wir arbeiten mit führenden deutschen Unternehmen aus Logistik, Bau, Gastronomie und Dienstleistung zusammen.',
      en: 'We work with leading German companies in logistics, construction, hospitality and services.',
      ru: 'Мы сотрудничаем с ведущими компаниями Германии в логистике, строительстве, гостиничном бизнесе и сфере услуг.',
      tr: 'Lojistik, inşaat, otelcilik ve hizmet sektörlerinde Almanya\'nın önde gelen şirketleriyle çalışıyoruz.',
      uk: 'Ми співпрацюємо з провідними компаніями Німеччини в логістиці, будівництві, готельному бізнесі та сфері послуг.',
    },
  },
  '/stories': {
    name: { az: 'Uğur hekayələri', de: 'Erfolgsgeschichten', en: 'Success stories', ru: 'Истории успеха', tr: 'Başarı hikâyeleri', uk: 'Історії успіху' },
    title: { az: 'Uğur hekayələri', de: 'Erfolgsgeschichten', en: 'Success stories', ru: 'Истории успеха', tr: 'Başarı hikâyeleri', uk: 'Історії успіху' },
    description: {
      az: 'Triad Vision ilə Almaniyada işə başlayan insanların real hekayələri və əməkdaşlıq etdiyimiz şirkətlərin rəyləri.',
      de: 'Echte Geschichten von Menschen, die mit Triad Vision in Deutschland angefangen haben, und Stimmen unserer Partnerfirmen.',
      en: 'Real stories of people who started working in Germany with Triad Vision, and what our partner companies say.',
      ru: 'Реальные истории людей, начавших работать в Германии с Triad Vision, и отзывы компаний-партнёров.',
      tr: 'Triad Vision ile Almanya\'da işe başlayan insanların gerçek hikâyeleri ve partner şirketlerimizin görüşleri.',
      uk: 'Реальні історії людей, які почали працювати в Німеччині з Triad Vision, і відгуки компаній-партнерів.',
    },
  },
  '/ausbildung': {
    name: { az: 'Ausbildung', de: 'Ausbildung', en: 'Ausbildung', ru: 'Ausbildung', tr: 'Ausbildung', uk: 'Ausbildung' },
    title: {
      az: 'Almaniyada Ausbildung',
      de: 'Ausbildung in Deutschland',
      en: 'Ausbildung in Germany',
      ru: 'Ausbildung в Германии',
      tr: 'Almanya\'da Ausbildung (meslek eğitimi)',
      uk: 'Ausbildung у Німеччині',
    },
    description: {
      az: 'Almaniyada ödənişli dual peşə təhsili: öyrən, qazan və karyera qur. Şərtlər, ixtisaslar və müraciət qaydası.',
      de: 'Bezahlte duale Ausbildung in Deutschland: lernen, verdienen, Karriere machen. Voraussetzungen, Berufe und Ablauf der Bewerbung.',
      en: 'Paid dual vocational training in Germany: learn, earn and build a career. Requirements, professions and how to apply.',
      ru: 'Оплачиваемое дуальное профобучение в Германии: учитесь, зарабатывайте, стройте карьеру. Условия, профессии и подача.',
      tr: 'Almanya\'da ücretli ikili meslek eğitimi: öğrenin, kazanın, kariyer yapın. Şartlar, meslekler ve başvuru süreci.',
      uk: 'Оплачуване дуальне профнавчання в Німеччині: навчайтеся, заробляйте, будуйте кар’єру. Умови, професії та подання.',
    },
  },
  '/eligibility': {
    name: { az: 'Viza testi', de: 'Visum-Check', en: 'Visa check', ru: 'Подбор визы', tr: 'Vize testi', uk: 'Підбір візи' },
    title: { az: 'Viza testi', de: 'Visum-Check', en: 'Visa eligibility check', ru: 'Подбор визы', tr: 'Vize uygunluk testi', uk: 'Підбір візи до Німеччини' },
    description: {
      az: 'Bir neçə suala cavab verin və Almaniya üçün sizə uyğun viza növünü və növbəti addımları öyrənin.',
      de: 'Beantworten Sie ein paar Fragen und erfahren Sie, welches Visum für Deutschland zu Ihnen passt und wie es weitergeht.',
      en: 'Answer a few questions to find out which German visa fits you and what your next steps are.',
      ru: 'Ответьте на несколько вопросов и узнайте, какая виза в Германию вам подходит и что делать дальше.',
      tr: 'Birkaç soruyu yanıtlayın; Almanya için size uygun vize türünü ve sonraki adımları öğrenin.',
      uk: 'Дайте відповідь на кілька запитань і дізнайтеся, яка віза до Німеччини вам підходить і що робити далі.',
    },
  },
  '/uygunluq-testi': {
    name: { az: 'Uyğunluq testi', de: 'Eignungstest', en: 'Eligibility quiz', ru: 'Тест на соответствие', tr: 'Uygunluk testi', uk: 'Тест на відповідність' },
    title: { az: 'Almaniya üçün uyğunluq testi', de: 'Eignungstest: Ihr Weg nach Deutschland', en: 'Eligibility quiz for Germany', ru: 'Тест: ваш путь в Германию', tr: 'Almanya için uygunluk testi', uk: 'Тест: ваш шлях до Німеччини' },
    description: {
      az: '7 suala cavab verin: iş vizası, Ausbildung, Chancenkarte və ya ailə birləşməsi — sizə uyğun yol, müddət və çatışmayanlar.',
      de: '7 Fragen: Arbeitsvisum, Ausbildung, Chancenkarte oder Familiennachzug — Ihr passender Weg, typische Dauer und was noch fehlt.',
      en: '7 questions: work visa, Ausbildung, Opportunity Card or family reunion — your best path to Germany, typical duration and what is missing.',
      ru: '7 вопросов: рабочая виза, Ausbildung, Chancenkarte или воссоединение семьи — ваш путь в Германию, сроки и чего не хватает.',
      tr: '7 soru: çalışma vizesi, Ausbildung, Fırsat Kartı veya aile birleşimi — size uygun yol, tipik süre ve eksikler.',
      uk: '7 запитань: робоча віза, Ausbildung, Chancenkarte чи возз’єднання сім’ї — ваш шлях до Німеччини, терміни та чого бракує.',
    },
  },
  '/salary-calculator': {
    name: { az: 'Maaş kalkulyatoru', de: 'Gehaltsrechner', en: 'Salary calculator', ru: 'Калькулятор зарплаты', tr: 'Maaş hesaplayıcı', uk: 'Калькулятор зарплати' },
    title: { az: 'Almaniyada xalis maaş kalkulyatoru', de: 'Brutto-Netto-Rechner Deutschland', en: 'German net salary calculator', ru: 'Калькулятор зарплаты нетто в Германии', tr: 'Almanya net maaş hesaplama', uk: 'Калькулятор зарплати нетто в Німеччині' },
    description: {
      az: 'Almaniyada brutto maaşdan xalis maaşı hesablayın: vergi sinfi, kilsə vergisi, sığorta və pensiya ayırmaları ilə təxmini hesab.',
      de: 'Berechnen Sie Ihr Nettogehalt in Deutschland: Steuerklasse, Kirchensteuer, Kranken-, Pflege-, Renten- und Arbeitslosenversicherung – als Schätzung.',
      en: 'Estimate your net salary in Germany from the gross: tax class, church tax, health, care, pension and unemployment insurance.',
      ru: 'Рассчитайте зарплату нетто в Германии из брутто: налоговый класс, церковный налог, медицинское, пенсионное страхование и др.',
      tr: 'Almanya\'da brüt maaştan neti hesaplayın: vergi sınıfı, kilise vergisi, sağlık, bakım, emeklilik ve işsizlik sigortası.',
      uk: 'Розрахуйте зарплату нетто в Німеччині з брутто: податковий клас, церковний податок, медичне та пенсійне страхування.',
    },
  },
  '/anerkennung': {
    name: { az: 'Diplomun tanınması', de: 'Anerkennung', en: 'Diploma recognition', ru: 'Признание диплома', tr: 'Diploma denkliği', uk: 'Визнання диплома' },
    title: { az: 'Almaniyada diplomun tanınması (Anerkennung)', de: 'Anerkennung ausländischer Abschlüsse', en: 'Recognising foreign diplomas in Germany', ru: 'Признание иностранного диплома в Германии', tr: 'Almanya\'da diploma denkliği (Anerkennung)', uk: 'Визнання іноземного диплома в Німеччині' },
    description: {
      az: 'Peşənizə görə Almaniyada diplomun tanınması: hansı qurum, hansı sənədlər, nə qədər vaxt və xərc – addım-addım bələdçi.',
      de: 'Anerkennung Ihres Berufsabschlusses in Deutschland: zuständige Stelle, Unterlagen, Dauer und Kosten – Schritt für Schritt.',
      en: 'Getting your qualification recognised in Germany: the competent authority, documents, duration and cost — step by step.',
      ru: 'Признание вашей квалификации в Германии: какое ведомство, какие документы, сроки и стоимость — пошагово.',
      tr: 'Mesleğinize göre Almanya\'da diploma denkliği: yetkili kurum, belgeler, süre ve maliyet — adım adım rehber.',
      uk: 'Визнання вашої кваліфікації в Німеччині: яке відомство, які документи, терміни та вартість — покроково.',
    },
  },
  '/calculator': {
    name: { az: 'Başlama tarixi kalkulyatoru', de: 'Startdatum-Rechner', en: 'Start date calculator', ru: 'Калькулятор срока', tr: 'Başlama tarihi hesaplayıcı', uk: 'Калькулятор терміну' },
    title: { az: 'Nə vaxt işə başlaya bilərəm?', de: 'Wann kann ich in Deutschland anfangen?', en: 'When can I start working in Germany?', ru: 'Когда я смогу начать работать?', tr: 'Almanya\'da ne zaman başlayabilirim?', uk: 'Коли я зможу почати працювати?' },
    description: {
      az: 'Viza növü, alman dili səviyyəsi və sənədlərə görə Almaniyada işə başlama tarixinizi və mərhələlərin müddətini təxmini hesablayın.',
      de: 'Schätzen Sie Ihren Arbeitsbeginn in Deutschland: nach Visumart, Deutschniveau und Unterlagen – mit Dauer jeder Etappe.',
      en: 'Estimate when you can start working in Germany from your visa type, German level and documents — with each stage and its duration.',
      ru: 'Оцените, когда вы сможете начать работать в Германии: по типу визы, уровню немецкого и документам — с длительностью каждого этапа.',
      tr: 'Vize türü, Almanca seviyesi ve belgelerinize göre Almanya\'da işe başlama tarihinizi ve her aşamanın süresini tahmin edin.',
      uk: 'Оцініть, коли зможете почати роботу в Німеччині: за типом візи, рівнем німецької та документами — з тривалістю кожного етапу.',
    },
  },
  '/cost-calculator': {
    name: { az: 'Xərc kalkulyatoru', de: 'Kostenrechner', en: 'Cost calculator', ru: 'Калькулятор расходов', tr: 'Maliyet hesaplayıcı', uk: 'Калькулятор витрат' },
    title: { az: 'Almaniyaya köçmək nə qədərə başa gəlir?', de: 'Was kostet der Weg nach Deutschland?', en: 'How much does moving to Germany cost?', ru: 'Сколько стоит переезд в Германию?', tr: 'Almanya\'ya taşınmanın maliyeti ne kadar?', uk: 'Скільки коштує переїзд до Німеччини?' },
    description: {
      az: 'Viza növü və ailə üzvlərinə görə viza rüsumu, tərcümə, apostil, diplomun tanınması, sığorta, bilet və bloklanmış hesabın təxmini hesablanması.',
      de: 'Schätzen Sie Visumgebühr, Übersetzungen, Apostille, Anerkennung, Versicherung, Flug und Sperrkonto – nach Visumart und Familiengröße.',
      en: 'Estimate visa fees, translations, apostille, recognition, insurance, flights and the blocked account — by visa type and family size.',
      ru: 'Оцените визовый сбор, переводы, апостиль, признание диплома, страховку, перелёт и блокированный счёт — по типу визы и составу семьи.',
      tr: 'Vize türü ve aile büyüklüğüne göre vize harcı, tercüme, apostil, denklik, sigorta, uçuş ve bloke hesap tahmini.',
      uk: 'Оцініть візовий збір, переклади, апостиль, визнання диплома, страховку, переліт і блокований рахунок — за типом візи та складом сім’ї.',
    },
  },
  '/map': {
    name: { az: 'İşçilərimizin xəritəsi', de: 'Karte unserer Fachkräfte', en: 'Placement map', ru: 'Карта трудоустройства', tr: 'Yerleştirme haritası', uk: 'Карта працевлаштування' },
    title: { az: 'Almaniyada işçilərimiz harada çalışır', de: 'Wo unsere Fachkräfte arbeiten', en: 'Where our workers are in Germany', ru: 'Где работают наши специалисты', tr: 'Çalışanlarımız Almanya\'da nerede?', uk: 'Де працюють наші фахівці' },
    description: {
      az: 'Triad Vision vasitəsilə Almaniyaya gedən işçilər hansı şəhərlərdə və hansı peşələrdə çalışır — şəhərlər üzrə xəritə.',
      de: 'In welchen deutschen Städten und Berufen die über Triad Vision vermittelten Fachkräfte arbeiten – die Karte nach Städten.',
      en: 'Which German cities and jobs the workers placed by Triad Vision went to — a map by city.',
      ru: 'В каких городах и профессиях Германии работают специалисты, трудоустроенные через Triad Vision, — карта по городам.',
      tr: 'Triad Vision aracılığıyla Almanya\'ya giden çalışanlar hangi şehirlerde ve mesleklerde çalışıyor — şehirlere göre harita.',
      uk: 'У яких містах і професіях Німеччини працюють фахівці, працевлаштовані через Triad Vision, — карта за містами.',
    },
  },
  '/events': {
    name: { az: 'Tədbirlər', de: 'Veranstaltungen', en: 'Events', ru: 'Мероприятия', tr: 'Etkinlikler', uk: 'Заходи' },
    title: { az: 'Vebinarlar və məlumat sessiyaları', de: 'Webinare und Infoveranstaltungen', en: 'Webinars and info sessions', ru: 'Вебинары и инфосессии', tr: 'Webinarlar ve bilgilendirme oturumları', uk: 'Вебінари та інформаційні сесії' },
    description: {
      az: 'Almaniyada iş və viza haqqında pulsuz onlayn vebinarlar və Bakı ofisində məlumat sessiyaları — qeydiyyatdan keçin, suallarınızı verin.',
      de: 'Kostenlose Webinare und Infoveranstaltungen in Baku zu Arbeit und Visum in Deutschland – melden Sie sich an und stellen Sie Ihre Fragen.',
      en: 'Free webinars and info sessions in our Baku office about working in Germany and visas — register and ask your questions.',
      ru: 'Бесплатные вебинары и встречи в офисе в Баку о работе и визах в Германию — зарегистрируйтесь и задайте свои вопросы.',
      tr: 'Almanya\'da iş ve vize hakkında ücretsiz online webinarlar ve Bakü ofisinde bilgilendirme oturumları — kaydolun, sorun.',
      uk: 'Безкоштовні онлайн-вебінари та зустрічі в офісі в Баку про роботу й візи до Німеччини — реєструйтеся та ставте запитання.',
    },
  },
  '/cities': {
    name: { az: 'Alman şəhərləri', de: 'Deutsche Städte', en: 'German cities', ru: 'Города Германии', tr: 'Alman şehirleri', uk: 'Міста Німеччини' },
    title: { az: 'Alman şəhərləri və yaşayış xərcləri', de: 'Deutsche Städte und Lebenshaltungskosten', en: 'German cities and cost of living', ru: 'Города Германии и стоимость жизни', tr: 'Alman şehirleri ve yaşam maliyeti', uk: 'Міста Німеччини та вартість життя' },
    description: {
      az: 'Almaniyanın 14 şəhərini müqayisə edin: kirayə, nəqliyyat, ərzaq xərcləri və aylıq büdcə kalkulyatoru.',
      de: 'Vergleichen Sie 14 deutsche Städte: Miete, Nahverkehr, Lebensmittel und ein Rechner für Ihr Monatsbudget.',
      en: 'Compare 14 German cities: rent, public transport, groceries and a monthly budget calculator.',
      ru: 'Сравните 14 городов Германии: аренда, транспорт, продукты и калькулятор месячного бюджета.',
      tr: 'Almanya\'nın 14 şehrini karşılaştırın: kira, toplu taşıma, market giderleri ve aylık bütçe hesaplayıcı.',
      uk: 'Порівняйте 14 міст Німеччини: оренда, транспорт, продукти та калькулятор місячного бюджету.',
    },
  },
  '/faq': {
    name: { az: 'FAQ', de: 'FAQ', en: 'FAQ', ru: 'FAQ', tr: 'SSS', uk: 'Запитання' },
    title: { az: 'Tez-tez verilən suallar', de: 'Häufige Fragen', en: 'Frequently asked questions', ru: 'Частые вопросы', tr: 'Sıkça sorulan sorular', uk: 'Часті запитання' },
    description: {
      az: 'Almaniyada iş, viza prosesi, sənədlər, müddətlər və xərclər haqqında ən çox verilən suallar və cavablar.',
      de: 'Antworten auf die häufigsten Fragen zu Arbeit in Deutschland, Visumverfahren, Dokumenten, Dauer und Kosten.',
      en: 'Answers to the most common questions about working in Germany, the visa process, documents, timelines and costs.',
      ru: 'Ответы на частые вопросы о работе в Германии, визовом процессе, документах, сроках и стоимости.',
      tr: 'Almanya\'da çalışma, vize süreci, belgeler, süreler ve maliyetler hakkında en sık sorulan sorular ve yanıtları.',
      uk: 'Відповіді на найчастіші запитання про роботу в Німеччині, візовий процес, документи, терміни та вартість.',
    },
  },
  '/news': {
    name: { az: 'Xəbərlər', de: 'News', en: 'News', ru: 'Новости', tr: 'Haberler', uk: 'Новини' },
    title: { az: 'Xəbərlər və bələdçilər', de: 'News und Ratgeber', en: 'News and guides', ru: 'Новости и гиды', tr: 'Haberler ve rehberler', uk: 'Новини та поради' },
    description: {
      az: 'Almaniyada iş və viza qaydaları üzrə son xəbərlər, praktiki bələdçilər və Triad Vision yenilikləri.',
      de: 'Aktuelles zu Arbeit und Visaregeln in Deutschland, praktische Ratgeber und Neuigkeiten von Triad Vision.',
      en: 'Latest news on work and visa rules in Germany, practical guides and updates from Triad Vision.',
      ru: 'Новости о работе и визовых правилах в Германии, практические гиды и обновления Triad Vision.',
      tr: 'Almanya\'da çalışma ve vize kurallarına dair güncel haberler, pratik rehberler ve Triad Vision\'dan yenilikler.',
      uk: 'Новини про роботу та візові правила в Німеччині, практичні поради й оновлення від Triad Vision.',
    },
  },
  '/contact': {
    name: { az: 'Əlaqə', de: 'Kontakt', en: 'Contact', ru: 'Контакты', tr: 'İletişim', uk: 'Контакти' },
    title: { az: 'Əlaqə', de: 'Kontakt', en: 'Contact us', ru: 'Контакты', tr: 'İletişim', uk: 'Контакти' },
    description: {
      az: 'Bakı və Berlin ofislərimiz, telefon, WhatsApp və e-poçt. Suallarınızı yazın — tezliklə cavab verəcəyik.',
      de: 'Unsere Büros in Baku und Berlin, Telefon, WhatsApp und E-Mail. Schreiben Sie uns — wir antworten schnell.',
      en: 'Our offices in Baku and Berlin, phone, WhatsApp and e-mail. Send us your question and we will reply soon.',
      ru: 'Наши офисы в Баку и Берлине, телефон, WhatsApp и e-mail. Напишите нам — мы быстро ответим.',
      tr: 'Bakü ve Berlin ofislerimiz, telefon, WhatsApp ve e-posta. Sorunuzu yazın — kısa sürede yanıt verelim.',
      uk: 'Наші офіси в Баку та Берліні, телефон, WhatsApp і e-mail. Напишіть нам — ми швидко відповімо.',
    },
  },
  '/cooperation': {
    name: { az: 'Əməkdaşlıq', de: 'Kooperation', en: 'Cooperation', ru: 'Сотрудничество', tr: 'İş birliği', uk: 'Співпраця' },
    title: {
      az: 'Şirkətlər üçün əməkdaşlıq',
      de: 'Kooperation für Unternehmen',
      en: 'Cooperation for employers',
      ru: 'Сотрудничество для компаний',
      tr: 'İşverenler için iş birliği',
      uk: 'Співпраця для роботодавців',
    },
    description: {
      az: 'Almaniyadakı şirkətiniz üçün Azərbaycandan işçi lazımdır? Əməkdaşlıq sorğusu göndərin, prosesi biz idarə edək.',
      de: 'Sie suchen Arbeitskräfte aus Aserbaidschan? Senden Sie eine Kooperationsanfrage — wir übernehmen Auswahl und Visumverfahren.',
      en: 'Need workers from Azerbaijan for your company in Germany? Send a cooperation request and we handle recruiting and visas.',
      ru: 'Нужны работники из Азербайджана для вашей компании в Германии? Отправьте запрос — подбор и визы берём на себя.',
      tr: 'Almanya\'daki şirketiniz için yurt dışından çalışan mı arıyorsunuz? Talep gönderin; seçim ve vize sürecini biz yönetelim.',
      uk: 'Шукаєте працівників з-за кордону для компанії в Німеччині? Надішліть запит — підбір і візи ми візьмемо на себе.',
    },
  },
  '/jobs': {
    name: { az: 'Vakansiyalar', de: 'Stellenangebote', en: 'Jobs', ru: 'Вакансии', tr: 'İş ilanları', uk: 'Вакансії' },
    title: {
      az: 'Almaniyada vakansiyalar',
      de: 'Stellenangebote in Deutschland',
      en: 'Jobs in Germany',
      ru: 'Вакансии в Германии',
      tr: 'Almanya\'da iş ilanları',
      uk: 'Вакансії в Німеччині',
    },
    description: {
      az: 'Almaniyada açıq iş elanları: sürücülər, tikinti, qonaqpərvərlik, Ausbildung və daha çoxu. Viza dəstəyi ilə müraciət edin.',
      de: 'Offene Stellen in Deutschland: Fahrer, Bau, Gastronomie, Ausbildung und mehr. Jetzt bewerben — inklusive Visumunterstützung.',
      en: 'Open jobs in Germany: drivers, construction, hospitality, Ausbildung and more. Apply now with full visa support.',
      ru: 'Открытые вакансии в Германии: водители, стройка, гостиничный бизнес, Ausbildung и другие. Подайте заявку с визовой поддержкой.',
      tr: 'Almanya\'da açık pozisyonlar: şoförler, inşaat, otelcilik, Ausbildung ve daha fazlası. Vize desteğiyle hemen başvurun.',
      uk: 'Відкриті вакансії в Німеччині: водії, будівництво, готельний бізнес, Ausbildung та інші. Подавайте заявку з візовою підтримкою.',
    },
  },
  // Service packages (Basic / Standard / Premium) with online order and e-signature.
  '/packages': {
    name: { az: 'Paketlər və qiymətlər', de: 'Pakete und Preise', en: 'Packages and prices', ru: 'Пакеты и цены', tr: 'Paketler ve fiyatlar', uk: 'Пакети та ціни' },
    title: {
      az: 'Xidmət paketləri və qiymətlər',
      de: 'Servicepakete und Preise',
      en: 'Service packages and prices',
      ru: 'Пакеты услуг и цены',
      tr: 'Hizmet paketleri ve fiyatlar',
      uk: 'Пакети послуг і ціни',
    },
    description: {
      az: 'Viza dəstəyi üçün Basic, Standard və Premium paketlər: daxil olanlar, qiymət, hissə-hissə ödəniş və onlayn müqavilə imzası.',
      de: 'Basic, Standard und Premium für Ihr Visumverfahren: Leistungen, Preise, Ratenzahlung und Vertrag online unterschreiben.',
      en: 'Basic, Standard and Premium packages for your visa process: what is included, prices, instalments and signing the contract online.',
      ru: 'Пакеты Basic, Standard и Premium для визового процесса: что входит, цены, оплата частями и онлайн-подпись договора.',
      tr: 'Vize süreciniz için Basic, Standard ve Premium paketler: kapsam, fiyatlar, taksitli ödeme ve sözleşmeyi online imzalama.',
      uk: 'Пакети Basic, Standard і Premium для візового процесу: що входить, ціни, оплата частинами та онлайн-підпис договору.',
    },
  },
  '/booking': {
    name: { az: 'Görüş təyin et', de: 'Termin buchen', en: 'Book a call', ru: 'Запись', tr: 'Görüşme planla', uk: 'Запис' },
    title: {
      az: 'Konsultasiya üçün görüş təyin et',
      de: 'Beratungstermin buchen',
      en: 'Book a consultation',
      ru: 'Записаться на консультацию',
      tr: 'Danışmanlık randevusu alın',
      uk: 'Записатися на консультацію',
    },
    description: {
      az: 'Komandamızla pulsuz onlayn konsultasiya üçün sizə uyğun vaxtı seçin — iş, viza və sənədlər barədə danışaq.',
      de: 'Wählen Sie einen passenden Termin für ein kostenloses Online-Gespräch mit unserem Team zu Job, Visum und Dokumenten.',
      en: 'Pick a time for a free online consultation with our team about jobs, visas and documents.',
      ru: 'Выберите удобное время для бесплатной онлайн-консультации с нашей командой о работе, визе и документах.',
      tr: 'Ekibimizle ücretsiz online danışmanlık için size uygun saati seçin — iş, vize ve belgeler hakkında konuşalım.',
      uk: 'Виберіть зручний час для безкоштовної онлайн-консультації з нашою командою щодо роботи, візи та документів.',
    },
  },
  '/guides': {
    name: { az: 'Bələdçilər', de: 'Ratgeber', en: 'Guides', ru: 'Гиды', tr: 'Rehberler', uk: 'Посібники' },
    title: {
      az: 'Almaniya bələdçiləri: viza, iş, ailə 2026',
      de: 'Ratgeber 2026: Visum, Arbeit, Familie',
      en: 'Germany guides 2026: visas, work, family',
      ru: 'Гиды по Германии 2026: визы, работа, семья',
      tr: 'Almanya rehberleri 2026: vize, iş, aile',
      uk: 'Посібники 2026: візи, робота, сім’я',
    },
    description: {
      az: 'İmkan Kartı, Mavi Kart, Ausbildung, diplomun tanınması, tibb bacısı işi və ailə birləşməsi üzrə ətraflı və aktual bələdçilər.',
      de: 'Ausführliche Ratgeber zu Chancenkarte, Blauer Karte EU, Ausbildung, Anerkennung, Pflege und Familiennachzug – aktuell und verständlich.',
      en: 'In-depth guides to the Opportunity Card, EU Blue Card, Ausbildung, diploma recognition, nursing jobs and family reunification in Germany.',
      ru: 'Подробные гиды по Chancenkarte, Голубой карте ЕС, Ausbildung, признанию диплома, работе медсестрой и воссоединению семьи.',
      tr: 'Fırsat Kartı, AB Mavi Kart, Ausbildung, diploma denkliği, hemşirelik ve aile birleşimi hakkında ayrıntılı ve güncel rehberler.',
      uk: 'Докладні посібники про Карту можливостей, Блакитну карту ЄС, Ausbildung, визнання диплома, роботу медсестрою та возз’єднання сім’ї.',
    },
  },
  '/chancenkarte-calculator': {
    name: {
      az: 'İmkan Kartı xal kalkulyatoru',
      de: 'Chancenkarte-Punkterechner',
      en: 'Opportunity Card points calculator',
      ru: 'Калькулятор баллов Chancenkarte',
      tr: 'Fırsat Kartı puan hesaplama',
      uk: 'Калькулятор балів Chancenkarte',
    },
    title: {
      az: 'Chancenkarte xal kalkulyatoru 2026',
      de: 'Chancenkarte Punkterechner 2026',
      en: 'Opportunity Card points calculator 2026',
      ru: 'Калькулятор баллов Chancenkarte 2026',
      tr: 'Fırsat Kartı puan hesaplama 2026',
      uk: 'Калькулятор балів Chancenkarte 2026',
    },
    description: {
      az: 'Almaniya İmkan Kartı üçün xallarınızı hesablayın: diplomun tanınması, alman və ingilis dili, təcrübə, yaş, əvvəlki qalma və partnyor.',
      de: 'Berechnen Sie Ihre Punkte für die Chancenkarte: Anerkennung, Deutsch und Englisch, Berufserfahrung, Alter, Voraufenthalt und Partner.',
      en: 'Calculate your points for Germany’s Opportunity Card: recognition, German and English, work experience, age, previous stay and partner.',
      ru: 'Рассчитайте баллы для Chancenkarte: признание диплома, немецкий и английский, опыт работы, возраст, прежнее пребывание и партнёр.',
      tr: 'Almanya Fırsat Kartı puanınızı hesaplayın: denklik, Almanca ve İngilizce, iş deneyimi, yaş, önceki kalış ve eş durumu.',
      uk: 'Порахуйте бали для Карти можливостей: визнання диплома, німецька й англійська, досвід роботи, вік, попереднє перебування та партнер.',
    },
  },
  '/blue-card-check': {
    name: {
      az: 'Mavi Kart maaş yoxlaması',
      de: 'Blaue-Karte-Gehaltscheck',
      en: 'Blue Card salary check',
      ru: 'Проверка зарплаты для Голубой карты',
      tr: 'Mavi Kart maaş kontrolü',
      uk: 'Перевірка зарплати для Блакитної карти',
    },
    title: {
      az: 'Mavi Kart 2026: maaş həddi yoxlaması',
      de: 'Blaue Karte EU 2026: Gehaltscheck',
      en: 'EU Blue Card 2026 salary check',
      ru: 'Голубая карта ЕС 2026: проверка зарплаты',
      tr: 'AB Mavi Kart 2026 maaş kontrolü',
      uk: 'Блакитна карта ЄС 2026: перевірка зарплати',
    },
    description: {
      az: 'Təklif olunan maaşınız Almaniya Mavi Kartı üçün 2026 həddinə çatırmı? Standart və çatışmayan peşələr üçün həddi dərhal yoxlayın.',
      de: 'Reicht Ihr Gehalt für die Blaue Karte EU? Prüfen Sie es sofort gegen die Gehaltsgrenzen 2026 – Standard und Engpassberufe/Berufseinsteiger.',
      en: 'Does your salary offer meet the 2026 EU Blue Card threshold? Check it instantly against the standard and shortage-occupation limits.',
      ru: 'Достаточна ли ваша зарплата для Голубой карты ЕС? Сразу сравните её с порогами 2026 года: стандартным и для дефицитных профессий.',
      tr: 'Maaş teklifiniz 2026 AB Mavi Kart sınırını karşılıyor mu? Standart ve eleman açığı olan meslekler için sınırla hemen karşılaştırın.',
      uk: 'Чи достатня ваша зарплата для Блакитної карти ЄС? Одразу порівняйте її з порогами 2026 року: стандартним і для дефіцитних професій.',
    },
  },
  '/compare-visas': {
    name: { az: 'Vizaların müqayisəsi', de: 'Visa-Vergleich', en: 'Visa comparison', ru: 'Сравнение виз', tr: 'Vize karşılaştırması', uk: 'Порівняння віз' },
    title: {
      az: 'Hansı viza mənə uyğundur? Müqayisə 2026',
      de: 'Welches Visum passt? Vergleich 2026',
      en: 'Which German visa fits me? Comparison 2026',
      ru: 'Какая виза мне подходит? Сравнение 2026',
      tr: 'Hangi vize bana uygun? Karşılaştırma 2026',
      uk: 'Яка віза мені підходить? Порівняння 2026',
    },
    description: {
      az: 'İmkan Kartı, Mavi Kart, Ausbildung, §18a, yoxsa ailə birləşməsi? Tələbləri, alman dilini, maaşı və ailə imkanlarını müqayisə edin, qısa testdən keçin.',
      de: 'Chancenkarte, Blaue Karte, Ausbildung, § 18a oder Familiennachzug? Voraussetzungen, Deutsch, Gehalt und Familie im Vergleich – mit kurzem Test.',
      en: 'Opportunity Card, Blue Card, Ausbildung, §18a or family reunification? Compare requirements, German level, salary and family, and take a quick test.',
      ru: 'Chancenkarte, Голубая карта, Ausbildung, §18a или воссоединение семьи? Сравните требования, немецкий, зарплату и семью и пройдите короткий тест.',
      tr: 'Fırsat Kartı, Mavi Kart, Ausbildung, §18a mı, aile birleşimi mi? Şartları, Almancayı, maaşı ve aile olanaklarını karşılaştırın, kısa testi yapın.',
      uk: 'Chancenkarte, Блакитна карта, Ausbildung, §18a чи возз’єднання сім’ї? Порівняйте вимоги, німецьку, зарплату й сім’ю та пройдіть короткий тест.',
    },
  },
  '/search': {
    sitemap: false,
    index: false,
    name: { az: 'Axtarış', de: 'Suche', en: 'Search', ru: 'Поиск', tr: 'Arama', uk: 'Пошук' },
    title: { az: 'Saytda axtarış', de: 'Suche auf der Website', en: 'Search the site', ru: 'Поиск по сайту', tr: 'Sitede ara', uk: 'Пошук на сайті' },
    description: {
      az: 'Bələdçilər, vizalar, vakansiyalar, tədbirlər və alətlər üzrə axtarış.',
      de: 'Suche in Ratgebern, Visa, Stellenangeboten, Veranstaltungen und Tools.',
      en: 'Search guides, visas, jobs, events and tools.',
      ru: 'Поиск по гидам, визам, вакансиям, мероприятиям и инструментам.',
      tr: 'Rehberler, vizeler, iş ilanları, etkinlikler ve araçlarda arama.',
      uk: 'Пошук у посібниках, візах, вакансіях, заходах та інструментах.',
    },
  },
  '/impressum': {
    name: { az: 'Impressum', de: 'Impressum', en: 'Imprint', ru: 'Impressum', tr: 'Impressum', uk: 'Impressum' },
    title: { az: 'Impressum', de: 'Impressum', en: 'Imprint (Impressum)', ru: 'Impressum', tr: 'Künye (Impressum)', uk: 'Вихідні дані (Impressum)' },
    description: {
      az: 'Triad Vision haqqında hüquqi məlumat: şirkət, ünvan, əlaqə və məsul şəxs (Almaniya qanunvericiliyinə uyğun Impressum).',
      de: 'Impressum von Triad Vision: Anbieterkennzeichnung, Anschrift, Kontakt und Verantwortliche gemäß § 5 DDG.',
      en: 'Legal notice of Triad Vision: provider identification, address, contact and responsible person under German law.',
      ru: 'Правовая информация Triad Vision: компания, адрес, контакты и ответственное лицо согласно законодательству Германии.',
      tr: 'Triad Vision yasal bilgileri: şirket, adres, iletişim ve sorumlu kişi (Alman mevzuatına uygun Impressum).',
      uk: 'Правова інформація Triad Vision: компанія, адреса, контакти та відповідальна особа згідно із законодавством Німеччини.',
    },
  },
  '/privacy': {
    name: { az: 'Məxfilik siyasəti', de: 'Datenschutz', en: 'Privacy policy', ru: 'Конфиденциальность', tr: 'Gizlilik politikası', uk: 'Конфіденційність' },
    title: {
      az: 'Məxfilik siyasəti',
      de: 'Datenschutzerklärung',
      en: 'Privacy policy',
      ru: 'Политика конфиденциальности',
      tr: 'Gizlilik politikası',
      uk: 'Політика конфіденційності',
    },
    description: {
      az: 'Triad Vision şəxsi məlumatlarınızı necə emal edir, qoruyur və hansı hüquqlarınız var (GDPR / DSGVO).',
      de: 'Wie Triad Vision personenbezogene Daten verarbeitet und schützt und welche Rechte Sie nach der DSGVO haben.',
      en: 'How Triad Vision processes and protects your personal data and which rights you have under the GDPR.',
      ru: 'Как Triad Vision обрабатывает и защищает ваши персональные данные и какие у вас права по GDPR.',
      tr: 'Triad Vision kişisel verilerinizi nasıl işler ve korur, GDPR (DSGVO) kapsamında hangi haklara sahipsiniz.',
      uk: 'Як Triad Vision обробляє та захищає ваші персональні дані і які права ви маєте згідно з GDPR.',
    },
  },
  '/accessibility': {
    name: { az: 'Əlçatanlıq', de: 'Barrierefreiheit', en: 'Accessibility', ru: 'Доступность', tr: 'Erişilebilirlik', uk: 'Доступність' },
    title: { az: 'Əlçatanlıq bəyanatı', de: 'Barrierefreiheit', en: 'Accessibility statement', ru: 'Доступность сайта', tr: 'Erişilebilirlik beyanı', uk: 'Заява про доступність' },
    description: {
      az: 'Saytımızın əlçatanlıq imkanları: mətn ölçüsü, kontrast, oxunaqlı şrift və digər tənzimləmələr.',
      de: 'Barrierefreiheit unserer Website: Schriftgröße, Kontrast, gut lesbare Schrift und weitere Einstellungen.',
      en: 'Accessibility features of our website: text size, contrast, readable font and other settings.',
      ru: 'Возможности доступности сайта: размер текста, контраст, удобочитаемый шрифт и другие настройки.',
      tr: 'Sitemizin erişilebilirlik özellikleri: yazı boyutu, kontrast, okunaklı yazı tipi ve diğer ayarlar.',
      uk: 'Можливості доступності сайту: розмір тексту, контраст, зручний для читання шрифт та інші налаштування.',
    },
  },
  '/register': {
    sitemap: false,
    name: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Register', ru: 'Регистрация', tr: 'Kayıt', uk: 'Реєстрація' },
    title: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Create an account', ru: 'Регистрация', tr: 'Hesap oluştur', uk: 'Реєстрація' },
    description: {
      az: 'Pulsuz hesab yaradın, viza müraciətinizi başladın və prosesi şəxsi kabinetdən izləyin.',
      de: 'Kostenloses Konto anlegen, Visumantrag starten und den Fortschritt im Kundenbereich verfolgen.',
      en: 'Create a free account, start your visa application and track every step in your personal portal.',
      ru: 'Создайте бесплатный аккаунт, начните визовую заявку и следите за процессом в личном кабинете.',
      tr: 'Ücretsiz hesap oluşturun, vize başvurunuzu başlatın ve tüm adımları kişisel panelinizden takip edin.',
      uk: 'Створіть безкоштовний акаунт, почніть візову заявку й стежте за кожним кроком в особистому кабінеті.',
    },
  },
  '/employers/register': {
    sitemap: false,
    name: { az: 'İşəgötürənlər üçün', de: 'Für Arbeitgeber', en: 'For employers', ru: 'Работодателям', tr: 'İşverenler için', uk: 'Роботодавцям' },
    title: {
      az: 'İşəgötürən qeydiyyatı',
      de: 'Registrierung für Arbeitgeber',
      en: 'Employer registration',
      ru: 'Регистрация работодателя',
      tr: 'İşveren kaydı',
      uk: 'Реєстрація роботодавця',
    },
    description: {
      az: 'Şirkətinizi qeydiyyatdan keçirin, vakansiya yerləşdirin və Azərbaycandan uyğun namizədlər alın.',
      de: 'Registrieren Sie Ihr Unternehmen, veröffentlichen Sie Stellen und erhalten Sie passende Kandidaten aus Aserbaidschan.',
      en: 'Register your company, post vacancies and receive matching candidates from Azerbaijan.',
      ru: 'Зарегистрируйте компанию, размещайте вакансии и получайте подходящих кандидатов из Азербайджана.',
      tr: 'Şirketinizi kaydedin, ilan yayınlayın ve yurt dışından uygun adaylar alın.',
      uk: 'Зареєструйте компанію, публікуйте вакансії та отримуйте відповідних кандидатів з-за кордону.',
    },
  },
  '/login': {
    sitemap: false,
    index: false,
    name: { az: 'Daxil ol', de: 'Anmelden', en: 'Sign in', ru: 'Войти', tr: 'Giriş', uk: 'Увійти' },
    title: { az: 'Daxil ol', de: 'Anmelden', en: 'Sign in', ru: 'Вход', tr: 'Giriş yap', uk: 'Вхід' },
    description: {
      az: 'Triad Vision şəxsi kabinetinə daxil olun.',
      de: 'Melden Sie sich im Triad Vision Kundenbereich an.',
      en: 'Sign in to your Triad Vision portal.',
      ru: 'Вход в личный кабинет Triad Vision.',
      tr: 'Triad Vision kişisel panelinize giriş yapın.',
      uk: 'Вхід до особистого кабінету Triad Vision.',
    },
  },
  '/forgot-password': {
    sitemap: false,
    index: false,
    name: { az: 'Şifrəni bərpa et', de: 'Passwort vergessen', en: 'Forgot password', ru: 'Восстановление пароля', tr: 'Şifremi unuttum', uk: 'Відновлення пароля' },
    title: { az: 'Şifrəni bərpa et', de: 'Passwort vergessen', en: 'Forgot password', ru: 'Восстановление пароля', tr: 'Şifremi unuttum', uk: 'Відновлення пароля' },
    description: {
      az: 'Triad Vision hesabınızın şifrəsini bərpa edin.',
      de: 'Setzen Sie das Passwort Ihres Triad Vision Kontos zurück.',
      en: 'Reset the password of your Triad Vision account.',
      ru: 'Восстановите пароль от аккаунта Triad Vision.',
      tr: 'Triad Vision hesabınızın şifresini sıfırlayın.',
      uk: 'Відновіть пароль від акаунта Triad Vision.',
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
    tr: 'Triad Vision — İnsanlar · İş · Fırsatlar',
    uk: 'Triad Vision — Люди · Робота · Можливості',
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
  '/angebot',
  '/kandidat', // employer share link of a candidate
  '/agent',
  '/partner',
  '/share',
  '/q',
  '/survey',
  '/check-in',
  '/unsubscribe',
  '/job-alert', // job alert confirm / manage link (token)
];

/**
 * The tools hub (/tools): every calculator, check and planning aid, grouped as on the page
 * (client/src/components/audience/tools.ts). Paths without a catalogue entry are skipped in the crawlable body.
 */
export type ToolGroupKey = 'eligibility' | 'costs' | 'plan' | 'explore';
export const TOOL_GROUPS: { key: ToolGroupKey; paths: string[] }[] = [
  { key: 'eligibility', paths: ['/uygunluq-testi', '/eligibility', '/compare-visas', '/blue-card-check', '/chancenkarte-calculator', '/anerkennung'] },
  { key: 'costs', paths: ['/salary-calculator', '/cost-calculator'] },
  { key: 'plan', paths: ['/calculator', '/cities', '/events', '/status'] },
  { key: 'explore', paths: ['/map', '/guides', '/jobs', '/visas'] },
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
  events: '/events',
  guides: '/guides',
  ebook: '/guides',
};
