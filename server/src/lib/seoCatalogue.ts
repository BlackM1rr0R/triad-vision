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
      az: 'Azərbaycandan Almaniyaya etibarlı işçi təminatı: vakansiyalar, viza prosesi, sənədləşmə və inteqrasiya üzrə ilk gündən tam dəstək.',
      de: 'Zuverlässige Arbeitskräfte aus Aserbaidschan für deutsche Unternehmen: Auswahl, Visumverfahren, Dokumente und Integration aus einer Hand.',
      en: 'Reliable workers from Azerbaijan for German companies: recruiting, visa process, paperwork and integration support from one team.',
      ru: 'Работа в Германии для специалистов из Азербайджана: вакансии, визовый процесс, документы и интеграция — сопровождение до переезда.',
      tr: 'Azerbaycan, Türkiye ve Ukrayna\'dan Almanya\'ya: iş ilanları, çalışma vizesi, belgeler ve uyum için ilk danışmanlıktan taşınmaya kadar destek.',
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
      az: 'Almaniyada iş, viza və Ausbildung: vakansiyalar, sənədlər, dil hazırlığı və köç — ilk addımdan ilk maaşa qədər addım-addım dəstək.',
      de: 'Arbeit, Visum und Ausbildung in Deutschland: Stellen, Dokumente, Sprachvorbereitung und Umzug — Begleitung bis zum ersten Gehalt.',
      en: 'Work, visa and Ausbildung in Germany: jobs, documents, language preparation and the move — support up to your first salary.',
      ru: 'Работа, виза и Ausbildung в Германии: вакансии, документы, языковая подготовка и переезд — поддержка до первой зарплаты.',
      tr: 'Almanya\'da iş, çalışma vizesi ve Ausbildung: iş ilanları, belgeler, dil hazırlığı ve taşınma — ilk başvurudan ilk maaşınıza kadar destek.',
      uk: 'Робота, віза та Ausbildung у Німеччині: вакансії, документи, мовна підготовка й переїзд — підтримка від заявки до першої зарплати.',
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
      de: 'Geprüfte Fachkräfte aus dem Ausland für Ihr Unternehmen: Kandidatenauswahl, Interviews, Visum, Anerkennung und Integration aus einer Hand.',
      en: 'Screened workers from abroad for German companies: candidate selection, interviews, visa, recognition and integration from one team.',
      ru: 'Проверенные работники из-за рубежа для компаний Германии: подбор, собеседования, виза, признание дипломов и интеграция под ключ.',
      tr: 'Alman şirketleri için yurt dışından elemeden geçmiş personel: aday seçimi, mülakat, vize, diploma denkliği ve uyum tek ekipten.',
      uk: 'Перевірені працівники з-за кордону для компаній Німеччини: підбір, співбесіди, віза, визнання дипломів та інтеграція під ключ.',
    },
  },
  '/tools': {
    name: { az: 'Alətlər', de: 'Tools', en: 'Tools', ru: 'Инструменты', tr: 'Araçlar', uk: 'Інструменти' },
    title: {
      az: 'Almaniyaya köç üçün pulsuz kalkulyatorlar',
      de: 'Kostenlose Rechner und Checks für Deutschland',
      en: 'Free calculators and checks for Germany',
      ru: 'Калькуляторы и тесты для переезда в Германию',
      tr: 'Almanya için ücretsiz hesaplama araçları',
      uk: 'Калькулятори й тести для Німеччини',
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
    title: { az: 'Haqqımızda: Almaniyaya işçi yerləşdirmə', de: 'Über uns: Fachkräfte aus Aserbaidschan', en: 'About us: Azerbaijan–Germany recruiting', ru: 'О компании: трудоустройство в Германии', tr: 'Hakkımızda: Almanya\'ya personel yerleştirme', uk: 'Про компанію: працевлаштування в Німеччині' },
    description: {
      az: 'Triad Vision kimdir: Azərbaycan və Almaniya arasında işçi yerləşdirmə üzrə komandamız, dəyərlərimiz və iş prinsiplərimiz.',
      de: 'Wer wir sind: das Team von Triad Vision, unsere Werte und wie wir Fachkräfte aus Aserbaidschan nach Deutschland vermitteln.',
      en: 'Who we are: the Triad Vision team, our values and how we place skilled workers from Azerbaijan with employers in Germany.',
      ru: 'Кто мы: команда Triad Vision, наши ценности и то, как мы трудоустраиваем специалистов из Азербайджана у работодателей в Германии.',
      tr: 'Triad Vision kimdir: Almanya\'ya nitelikli işgücü yerleştiren Bakü ve Berlin ekibimiz, değerlerimiz ve şeffaf çalışma ilkelerimiz.',
      uk: 'Хто ми: команда Triad Vision у Баку та Берліні, наші цінності та те, як ми допомагаємо фахівцям знайти роботу в Німеччині.',
    },
  },
  '/services': {
    name: { az: 'Xidmətlər', de: 'Leistungen', en: 'Services', ru: 'Услуги', tr: 'Hizmetler', uk: 'Послуги' },
    title: { az: 'Xidmətlər: işçi seçimi, viza və inteqrasiya', de: 'Leistungen: Personalvermittlung und Visum', en: 'Services: recruiting, visas and integration', ru: 'Услуги: подбор персонала, визы, интеграция', tr: 'Hizmetler: personel seçimi, vize ve uyum', uk: 'Послуги: підбір персоналу, візи, інтеграція' },
    description: {
      az: 'İşçi seçimi, viza və sənədləşmə, alman dili hazırlığı və Almaniyada inteqrasiya — namizədlər və şirkətlər üçün xidmətlərimiz.',
      de: 'Personalauswahl, Visum und Dokumente, Sprachvorbereitung und Integration in Deutschland — unsere Leistungen für Firmen und Bewerber.',
      en: 'Recruiting, visa and paperwork, language preparation and integration in Germany — our services for companies and candidates.',
      ru: 'Подбор персонала, рабочие визы и документы, языковая подготовка и интеграция в Германии — услуги для компаний и кандидатов.',
      tr: 'Personel seçimi, çalışma vizesi ve belgeler, Almanca hazırlığı ve Almanya\'da uyum — adaylar ve şirketler için tüm hizmetlerimiz.',
      uk: 'Підбір персоналу, робочі візи та документи, мовна підготовка й інтеграція в Німеччині — послуги для компаній і кандидатів.',
    },
  },
  '/visas': {
    name: { az: 'Vizalar', de: 'Visa', en: 'Visas', ru: 'Визы', tr: 'Vizeler', uk: 'Візи' },
    title: { az: 'Almaniya iş vizası: növlər və peşələr', de: 'Arbeitsvisum Deutschland: Visumarten', en: 'German work visa types and professions', ru: 'Рабочая виза в Германию: виды и профессии', tr: 'Almanya çalışma vizesi türleri ve meslekler', uk: 'Робоча віза до Німеччини: види та професії' },
    description: {
      az: 'Almaniya iş vizası növləri: §18b, Ausbildung, mövsümi iş və digərləri. Tələblər, maaşlar, sənədlər və müddətlər bir yerdə.',
      de: 'Visumarten für die Arbeit in Deutschland: §18b, Ausbildung, Saisonarbeit und mehr. Voraussetzungen, Gehälter und Dauer im Überblick.',
      en: 'Work visa types for Germany: §18b, Ausbildung, seasonal work and more. Requirements, salaries and processing times in one place.',
      ru: 'Типы рабочих виз в Германию: §18b, Ausbildung, сезонная работа и другие. Требования, зарплаты, документы и сроки в одном месте.',
      tr: 'Almanya çalışma vizesi türleri: §18b, Ausbildung, mevsimlik iş ve daha fazlası. Şartlar, maaşlar ve süreler tek sayfada.',
      uk: 'Типи робочих віз до Німеччини: §18b, Ausbildung, сезонна робота та інші. Вимоги, зарплати, документи й терміни в одному місці.',
    },
  },
  '/partners': {
    name: { az: 'Tərəfdaşlar', de: 'Partner', en: 'Partners', ru: 'Партнёры', tr: 'Partnerler', uk: 'Партнери' },
    title: { az: 'Almaniyada tərəfdaş şirkətlərimiz', de: 'Partnerunternehmen in Deutschland', en: 'Our partner companies in Germany', ru: 'Компании-партнёры в Германии', tr: 'Almanya\'daki partner şirketlerimiz', uk: 'Компанії-партнери в Німеччині' },
    description: {
      az: 'Logistika, tikinti, qonaqpərvərlik, tibb və xidmət sahələrində Almaniyanın aparıcı şirkətləri ilə əməkdaşlıq edirik — açıq vakansiyalara baxın.',
      de: 'Wir arbeiten mit führenden deutschen Unternehmen aus Logistik, Bau, Gastronomie, Pflege und Dienstleistung zusammen — offene Stellen ansehen.',
      en: 'We work with leading German employers in logistics, construction, hospitality, care and services — see who hires and browse the open jobs.',
      ru: 'Мы сотрудничаем с ведущими компаниями Германии в логистике, строительстве, гостиничном бизнесе и сфере услуг — смотрите вакансии.',
      tr: 'Lojistik, inşaat, otelcilik, bakım ve hizmet sektörlerinde Almanya\'nın önde gelen şirketleriyle çalışıyoruz — açık ilanlara göz atın.',
      uk: 'Ми співпрацюємо з провідними компаніями Німеччини в логістиці, будівництві, готельному бізнесі та сфері послуг — дивіться вакансії.',
    },
  },
  '/stories': {
    name: { az: 'Uğur hekayələri', de: 'Erfolgsgeschichten', en: 'Success stories', ru: 'Истории успеха', tr: 'Başarı hikâyeleri', uk: 'Історії успіху' },
    title: { az: 'Uğur hekayələri: Almaniyada yeni başlanğıc', de: 'Erfolgsgeschichten: Neustart in Deutschland', en: 'Success stories: starting work in Germany', ru: 'Истории успеха: работа в Германии', tr: 'Başarı hikâyeleri: Almanya\'da yeni başlangıç', uk: 'Історії успіху: робота в Німеччині' },
    description: {
      az: 'Triad Vision ilə Almaniyada işə başlayan insanların real hekayələri, video müsahibələr və əməkdaşlıq etdiyimiz şirkətlərin rəyləri.',
      de: 'Echte Geschichten von Menschen, die mit Triad Vision in Deutschland angefangen haben, und Stimmen unserer Partnerfirmen.',
      en: 'Real stories and video interviews of people who started working in Germany with Triad Vision, and what our partner companies say.',
      ru: 'Реальные истории и видео людей, которые начали работать в Германии с Triad Vision, и отзывы компаний-партнёров о сотрудничестве.',
      tr: 'Triad Vision ile Almanya\'da işe başlayan insanların gerçek hikâyeleri, video röportajlar ve partner şirketlerimizin görüşleri.',
      uk: 'Реальні історії та відео людей, які почали працювати в Німеччині з Triad Vision, і відгуки компаній-партнерів про співпрацю.',
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
      az: 'Almaniyada ödənişli dual peşə təhsili: öyrən, maaş al və karyera qur. Şərtlər, B1 alman dili, ixtisaslar, maaşlar və müraciət qaydası.',
      de: 'Bezahlte duale Ausbildung in Deutschland: lernen, verdienen, Karriere machen. Voraussetzungen, Berufe und Ablauf der Bewerbung.',
      en: 'Paid dual vocational training in Germany: learn, earn and build a career. Requirements, German level, professions, pay and how to apply.',
      ru: 'Оплачиваемое дуальное профобучение в Германии: учитесь, зарабатывайте, стройте карьеру. Условия, уровень немецкого, профессии и подача.',
      tr: 'Almanya\'da ücretli ikili meslek eğitimi: öğrenin, kazanın, kariyer yapın. Şartlar, Almanca seviyesi, meslekler, maaş ve başvuru.',
      uk: 'Оплачуване дуальне профнавчання в Німеччині: навчайтеся, заробляйте, будуйте кар’єру. Умови, рівень німецької, професії та подання.',
    },
  },
  '/eligibility': {
    name: { az: 'Viza testi', de: 'Visum-Check', en: 'Visa check', ru: 'Подбор визы', tr: 'Vize testi', uk: 'Підбір візи' },
    title: { az: 'Almaniya viza testi: hansı viza uyğundur?', de: 'Visum-Check: Welches Visum für Deutschland?', en: 'Germany visa eligibility check', ru: 'Подбор визы в Германию: онлайн-тест', tr: 'Almanya vize uygunluk testi', uk: 'Підбір візи до Німеччини: онлайн-тест' },
    description: {
      az: 'Bir neçə suala cavab verin və Almaniya üçün sizə uyğun viza növünü, tələbləri və növbəti addımları pulsuz öyrənin — 2 dəqiqəlik test.',
      de: 'Beantworten Sie ein paar Fragen und erfahren Sie kostenlos, welches Visum für Deutschland zu Ihnen passt und wie es weitergeht.',
      en: 'Answer a few questions to find out for free which German visa fits you, what it requires and what your next steps are — a 2-minute check.',
      ru: 'Ответьте на несколько вопросов и бесплатно узнайте, какая виза в Германию вам подходит, что для неё нужно и что делать дальше.',
      tr: 'Birkaç soruyu yanıtlayın; Almanya için size uygun vize türünü, şartlarını ve sonraki adımları ücretsiz öğrenin — 2 dakikalık test.',
      uk: 'Дайте відповідь на кілька запитань і безкоштовно дізнайтеся, яка віза до Німеччини вам підходить, що для неї потрібно і що далі.',
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
      tr: '7 soru: çalışma vizesi, Ausbildung, Fırsat Kartı veya aile birleşimi — Almanya için size uygun yol, tipik süre ve eksik belgeler.',
      uk: '7 запитань: робоча віза, Ausbildung, Chancenkarte чи возз’єднання сім’ї — ваш шлях до Німеччини, терміни та чого бракує.',
    },
  },
  '/path-finder': {
    name: { az: 'Yol seçici', de: 'Wegfinder', en: 'Path finder', ru: 'Подбор пути', tr: 'Yol bulucu', uk: 'Підбір шляху' },
    title: {
      az: 'Almaniyaya hansı yol uyğundur? 5 sual',
      de: 'Welcher Weg nach Deutschland? 5 Fragen',
      en: 'Which path to Germany fits me? 5 questions',
      ru: 'Какой путь в Германию мне подходит?',
      tr: 'Almanya’ya hangi yol uygun? 5 soru',
      uk: 'Який шлях до Німеччини мені підходить?',
    },
    description: {
      az: 'Peşə, təhsil, alman dili, təcrübə və yaş: 5 sualdan sonra sizə uyğun viza yolları, gözlənilən maaş, adi müddət və xidmət paketinin qiyməti.',
      de: 'Beruf, Abschluss, Deutsch, Erfahrung und Alter: nach 5 Fragen Ihre passenden Visawege mit erwartetem Gehalt, typischer Dauer und Paketpreis.',
      en: 'Profession, education, German, experience and age: after 5 questions your best visa routes with expected salary, typical duration and price.',
      ru: 'Профессия, образование, немецкий, опыт и возраст: после 5 вопросов подходящие визовые пути, ожидаемая зарплата, обычные сроки и цена пакета.',
      tr: 'Meslek, eğitim, Almanca, deneyim ve yaş: 5 sorudan sonra size uygun vize yolları, beklenen maaş, tipik süre ve hizmet paketinin fiyatı.',
      uk: 'Професія, освіта, німецька, досвід і вік: після 5 запитань відповідні візові шляхи, очікувана зарплата, звичайні терміни та ціна пакета.',
    },
  },
  '/compare-jobs': {
    sitemap: false,
    index: false,
    name: { az: 'Vakansiyaların müqayisəsi', de: 'Stellenvergleich', en: 'Compare jobs', ru: 'Сравнение вакансий', tr: 'İlan karşılaştırma', uk: 'Порівняння вакансій' },
    title: { az: 'Vakansiyaları müqayisə edin', de: 'Stellenangebote vergleichen', en: 'Compare vacancies', ru: 'Сравнить вакансии', tr: 'İş ilanlarını karşılaştırın', uk: 'Порівняти вакансії' },
    description: {
      az: '2–3 vakansiyanı yan-yana müqayisə edin: maaş, xalis maaş, şəhər, yaşayış xərcləri, alman dili və tələblər.',
      de: '2–3 Stellen nebeneinander vergleichen: Gehalt, Netto, Stadt, Lebenshaltungskosten, Deutschniveau und Anforderungen.',
      en: 'Compare 2–3 vacancies side by side: salary, net pay, city, cost of living, German level and requirements.',
      ru: 'Сравните 2–3 вакансии рядом: зарплата, нетто, город, стоимость жизни, уровень немецкого и требования.',
      tr: '2–3 ilanı yan yana karşılaştırın: maaş, net maaş, şehir, yaşam maliyeti, Almanca seviyesi ve şartlar.',
      uk: 'Порівняйте 2–3 вакансії поруч: зарплата, нетто, місто, вартість життя, рівень німецької та вимоги.',
    },
  },
  '/salary-calculator': {
    name: { az: 'Maaş kalkulyatoru', de: 'Gehaltsrechner', en: 'Salary calculator', ru: 'Калькулятор зарплаты', tr: 'Maaş hesaplayıcı', uk: 'Калькулятор зарплати' },
    title: { az: 'Almaniya maaş kalkulyatoru 2026: brutto-netto', de: 'Brutto Netto Rechner 2026 Deutschland', en: 'Salary calculator Germany 2026: gross to net', ru: 'Калькулятор налогов и зарплаты Германия 2026', tr: 'Almanya maaş hesaplama 2026: brütten nete', uk: 'Податковий калькулятор Німеччини 2026: нетто' },
    description: {
      az: 'Almaniyada brutto maaşdan xalis maaşı hesablayın (2026): vergi sinfi, kilsə vergisi, tibbi sığorta və pensiya ayırmaları ilə pulsuz hesab.',
      de: 'Brutto Netto Rechner 2026: Nettogehalt mit Steuerklasse, Kirchensteuer, Kranken-, Pflege-, Renten- und Arbeitslosenversicherung berechnen.',
      en: 'Free German salary calculator 2026: gross to net pay with tax class, church tax, health, care, pension and unemployment insurance.',
      ru: 'Калькулятор налогов в Германии 2026: зарплата нетто из брутто с учётом налогового класса, церковного налога, медицинской и пенсионной страховки.',
      tr: 'Almanya maaş hesaplama 2026: brüt maaştan neti hesaplayın — vergi sınıfı, kilise vergisi, sağlık, bakım, emeklilik ve işsizlik sigortası.',
      uk: 'Податковий калькулятор Німеччини 2026: зарплата нетто з брутто з урахуванням податкового класу, церковного податку, медичного й пенсійного страхування.',
    },
  },
  '/anerkennung': {
    name: { az: 'Diplomun tanınması', de: 'Anerkennung', en: 'Diploma recognition', ru: 'Признание диплома', tr: 'Diploma denkliği', uk: 'Визнання диплома' },
    title: { az: 'Almaniyada diplomun tanınması (Anerkennung)', de: 'Anerkennung ausländischer Abschlüsse', en: 'Foreign diploma recognition in Germany', ru: 'Подтверждение и признание диплома в Германии', tr: 'Almanya\'da diploma denkliği (Anerkennung)', uk: 'Підтвердження диплома в Німеччині (визнання)' },
    description: {
      az: 'Peşənizə görə Almaniyada diplomun tanınması (Anerkennung): hansı qurum, hansı sənədlər, nə qədər vaxt və xərc – addım-addım bələdçi.',
      de: 'Anerkennung Ihres Berufsabschlusses in Deutschland: zuständige Stelle, Unterlagen, Dauer und Kosten – Schritt für Schritt.',
      en: 'Getting your foreign diploma recognised in Germany (Anerkennung): the competent authority, documents, duration and cost — step by step.',
      ru: 'Подтверждение диплома в Германии по вашей профессии: какое ведомство, какие документы нужны, сроки и стоимость признания — пошагово.',
      tr: 'Mesleğinize göre Almanya\'da diploma denkliği (Anerkennung): yetkili kurum, gerekli belgeler, süre ve maliyet — adım adım rehber.',
      uk: 'Підтвердження диплома в Німеччині за вашою професією: яке відомство, які документи потрібні, терміни та вартість визнання — покроково.',
    },
  },
  '/calculator': {
    name: { az: 'Başlama tarixi kalkulyatoru', de: 'Startdatum-Rechner', en: 'Start date calculator', ru: 'Калькулятор срока', tr: 'Başlama tarihi hesaplayıcı', uk: 'Калькулятор терміну' },
    title: { az: 'Nə vaxt işə başlaya bilərəm?', de: 'Wann kann ich in Deutschland anfangen?', en: 'When can I start working in Germany?', ru: 'Когда я смогу начать работать?', tr: 'Almanya\'da ne zaman başlayabilirim?', uk: 'Коли я зможу почати працювати?' },
    description: {
      az: 'Viza növü, alman dili səviyyəsi və sənədlərə görə Almaniyada işə başlama tarixinizi və mərhələlərin müddətini təxmini hesablayın.',
      de: 'Schätzen Sie Ihren Arbeitsbeginn in Deutschland: nach Visumart, Deutschniveau und Unterlagen – mit der Dauer jeder einzelnen Etappe.',
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
      tr: 'Vize türü ve aile büyüklüğüne göre vize harcı, tercüme, apostil, denklik, sigorta, uçak bileti ve bloke hesap için masraf tahmini.',
      uk: 'Оцініть візовий збір, переклади, апостиль, визнання диплома, страховку, переліт і блокований рахунок — за типом візи та складом сім’ї.',
    },
  },
  '/budget': {
    name: { az: 'İlk ayın büdcəsi', de: 'Budget erster Monat', en: 'First-month budget', ru: 'Бюджет первого месяца', tr: 'İlk ay bütçesi', uk: 'Бюджет першого місяця' },
    title: { az: 'Almaniyada ilk ayın büdcəsi', de: 'Budget für den ersten Monat in Deutschland', en: 'First-month budget in Germany', ru: 'Бюджет на первый месяц в Германии', tr: 'Almanya\'da ilk ay bütçesi', uk: 'Бюджет на перший місяць у Німеччині' },
    description: {
      az: 'Xalis maaş, depozit, ilk maaşa qədər xərclər, aylıq büdcə və özünüzlə nə qədər pul gətirməli — şəhər, maaş və ailəyə görə təxmini hesab.',
      de: 'Nettogehalt, Kaution, Kosten bis zum ersten Gehalt, Monatsbudget und wie viel Geld Sie mitbringen sollten – geschätzt nach Stadt und Gehalt.',
      en: 'Net salary, deposit, costs until the first salary, monthly budget and how much money to bring — estimated by city, salary and household.',
      ru: 'Зарплата нетто, залог, расходы до первой зарплаты, бюджет на месяц и сколько денег взять с собой — оценка по городу и зарплате.',
      tr: 'Net maaş, depozito, ilk maaşa kadar masraflar, aylık bütçe ve yanınıza almanız gereken para — şehir ve maaşa göre tahmin.',
      uk: 'Зарплата нетто, застава, витрати до першої зарплати, місячний бюджет і скільки грошей узяти з собою — оцінка за містом і зарплатою.',
    },
  },
  '/map': {
    name: { az: 'İşçilərimizin xəritəsi', de: 'Karte unserer Fachkräfte', en: 'Placement map', ru: 'Карта трудоустройства', tr: 'Yerleştirme haritası', uk: 'Карта працевлаштування' },
    title: { az: 'Almaniyada işçilərimiz harada çalışır', de: 'Wo unsere Fachkräfte arbeiten', en: 'Where our workers are in Germany', ru: 'Где работают наши специалисты', tr: 'Çalışanlarımız Almanya\'da nerede?', uk: 'Де працюють наші фахівці' },
    description: {
      az: 'Triad Vision vasitəsilə Almaniyaya gedən işçilər hansı şəhərlərdə və hansı peşələrdə çalışır — şəhərlər üzrə interaktiv xəritə.',
      de: 'In welchen deutschen Städten und Berufen die über Triad Vision vermittelten Fachkräfte arbeiten – die Karte nach Städten.',
      en: 'Which German cities and jobs the workers placed by Triad Vision went to — an interactive map by city, profession and year of arrival.',
      ru: 'В каких городах и профессиях Германии работают специалисты, трудоустроенные через Triad Vision, — интерактивная карта по городам.',
      tr: 'Triad Vision aracılığıyla Almanya\'ya giden çalışanlar hangi şehirlerde ve mesleklerde çalışıyor — şehirlere göre harita.',
      uk: 'У яких містах і професіях Німеччини працюють фахівці, працевлаштовані через Triad Vision, — інтерактивна карта за містами.',
    },
  },
  '/events': {
    name: { az: 'Tədbirlər', de: 'Veranstaltungen', en: 'Events', ru: 'Мероприятия', tr: 'Etkinlikler', uk: 'Заходи' },
    title: { az: 'Vebinarlar və məlumat sessiyaları', de: 'Webinare und Infoveranstaltungen', en: 'Webinars and info sessions', ru: 'Вебинары и инфосессии', tr: 'Webinarlar ve bilgilendirme oturumları', uk: 'Вебінари та інформаційні сесії' },
    description: {
      az: 'Almaniyada iş və viza haqqında pulsuz onlayn vebinarlar və Bakı ofisində məlumat sessiyaları — qeydiyyatdan keçin, suallarınızı verin.',
      de: 'Kostenlose Webinare und Infoveranstaltungen in Baku zu Arbeit und Visum in Deutschland – melden Sie sich an und stellen Sie Ihre Fragen.',
      en: 'Free webinars and info sessions in our Baku office about working in Germany and visas — register and ask your questions.',
      ru: 'Бесплатные онлайн-вебинары и встречи в офисе в Баку о работе и визах в Германию — зарегистрируйтесь и задайте свои вопросы.',
      tr: 'Almanya\'da iş ve vize hakkında ücretsiz online webinarlar ve Bakü ofisinde bilgilendirme oturumları — kaydolun, sorularınızı sorun.',
      uk: 'Безкоштовні онлайн-вебінари та зустрічі в офісі в Баку про роботу й візи до Німеччини — реєструйтеся та ставте запитання.',
    },
  },
  '/cities': {
    name: { az: 'Alman şəhərləri', de: 'Deutsche Städte', en: 'German cities', ru: 'Города Германии', tr: 'Alman şehirleri', uk: 'Міста Німеччини' },
    title: { az: 'Almaniya şəhərləri: yaşayış xərcləri 2026', de: 'Lebenshaltungskosten deutscher Städte 2026', en: 'Cost of living in German cities 2026', ru: 'Города Германии: стоимость жизни 2026', tr: 'Almanya şehirleri: yaşam maliyeti 2026', uk: 'Міста Німеччини: вартість життя 2026' },
    description: {
      az: 'Almaniya şəhərlərini müqayisə edin: Berlin, Münhen, Hamburq və digər 11 şəhərdə kirayə, nəqliyyat, ərzaq xərcləri və aylıq büdcə kalkulyatoru.',
      de: 'Lebenshaltungskosten in 14 deutschen Städten: Miete, Nahverkehr, Lebensmittel im Vergleich – mit Rechner für Ihr Monatsbudget 2026.',
      en: 'Compare the cost of living in 14 German cities: rent, public transport and groceries in Berlin, Munich, Hamburg and more, plus a budget calculator.',
      ru: 'Стоимость жизни в 14 городах Германии: аренда квартиры, транспорт и продукты в Берлине, Мюнхене, Гамбурге и др. — с калькулятором бюджета.',
      tr: 'Almanya\'nın 14 şehrinde yaşam maliyeti: Berlin, Münih, Hamburg ve diğerlerinde kira, toplu taşıma, market giderleri ve aylık bütçe hesaplayıcı.',
      uk: 'Вартість життя в 14 містах Німеччини: оренда житла, транспорт і продукти в Берліні, Мюнхені, Гамбурзі та інших — з калькулятором бюджету.',
    },
  },
  '/faq': {
    name: { az: 'FAQ', de: 'FAQ', en: 'FAQ', ru: 'FAQ', tr: 'SSS', uk: 'Запитання' },
    title: { az: 'FAQ: Almaniyada iş və viza sualları', de: 'FAQ: Arbeit und Visum in Deutschland', en: 'FAQ: working in Germany and visas', ru: 'Вопросы о работе и визе в Германию', tr: 'SSS: Almanya\'da iş ve vize soruları', uk: 'Запитання про роботу й візу до Німеччини' },
    description: {
      az: 'Almaniyada iş, viza prosesi, sənədlər, alman dili, müddətlər və xərclər haqqında ən çox verilən suallar və Triad Vision-un cavabları.',
      de: 'Antworten auf die häufigsten Fragen zu Arbeit in Deutschland, Visumverfahren, Dokumenten, Deutschkenntnissen, Dauer und Kosten.',
      en: 'Answers to the most common questions about working in Germany, the visa process, documents, German level, timelines and costs.',
      ru: 'Ответы на частые вопросы о работе в Германии: визовый процесс, документы, уровень немецкого, сроки оформления и стоимость.',
      tr: 'Almanya\'da çalışma, vize süreci, belgeler, Almanca seviyesi, süreler ve maliyetler hakkında en sık sorulan sorular ve yanıtları.',
      uk: 'Відповіді на найчастіші запитання про роботу в Німеччині: візовий процес, документи, рівень німецької, терміни та вартість.',
    },
  },
  '/news': {
    name: { az: 'Xəbərlər', de: 'News', en: 'News', ru: 'Новости', tr: 'Haberler', uk: 'Новини' },
    title: { az: 'Xəbərlər: Almaniyada iş və viza qaydaları', de: 'News: Arbeit und Visum in Deutschland', en: 'News: work and visa rules in Germany', ru: 'Новости: работа и визы в Германии', tr: 'Haberler: Almanya\'da iş ve vize kuralları', uk: 'Новини: робота та візи в Німеччині' },
    description: {
      az: 'Almaniyada iş və viza qaydaları üzrə son xəbərlər, qanun dəyişiklikləri, praktiki bələdçilər və Triad Vision-dan yeniliklər.',
      de: 'Aktuelles zu Arbeit und Visaregeln in Deutschland: Gesetzesänderungen, praktische Ratgeber und Neuigkeiten von Triad Vision.',
      en: 'Latest news on work and visa rules in Germany: changes in the law, practical guides and updates from the Triad Vision team.',
      ru: 'Новости о работе и визовых правилах в Германии: изменения в законах, практические гиды и обновления от команды Triad Vision.',
      tr: 'Almanya\'da çalışma ve vize kurallarına dair güncel haberler, yasa değişiklikleri, pratik rehberler ve Triad Vision\'dan yenilikler.',
      uk: 'Новини про роботу та візові правила в Німеччині: зміни в законах, практичні поради й оновлення від команди Triad Vision.',
    },
  },
  '/contact': {
    name: { az: 'Əlaqə', de: 'Kontakt', en: 'Contact', ru: 'Контакты', tr: 'İletişim', uk: 'Контакти' },
    title: { az: 'Əlaqə: Bakı və Berlin ofisləri', de: 'Kontakt: Büros in Baku und Berlin', en: 'Contact us: offices in Baku and Berlin', ru: 'Контакты: офисы в Баку и Берлине', tr: 'İletişim: Bakü ve Berlin ofisleri', uk: 'Контакти: офіси в Баку та Берліні' },
    description: {
      az: 'Bakı və Berlin ofislərimiz, telefon, WhatsApp və e-poçt, iş saatları. Suallarınızı yazın və ya görüş təyin edin — tezliklə cavab verəcəyik.',
      de: 'Unsere Büros in Baku und Berlin, Telefon, WhatsApp, E-Mail und Öffnungszeiten. Schreiben Sie uns oder buchen Sie einen Termin.',
      en: 'Our offices in Baku and Berlin, phone, WhatsApp, e-mail and opening hours. Send us your question or book a call — we reply quickly.',
      ru: 'Наши офисы в Баку и Берлине, телефон, WhatsApp, e-mail и часы работы. Напишите нам или запишитесь на консультацию — ответим быстро.',
      tr: 'Bakü ve Berlin ofislerimiz, telefon, WhatsApp, e-posta ve çalışma saatleri. Sorunuzu yazın veya görüşme planlayın — hızla yanıtlarız.',
      uk: 'Наші офіси в Баку та Берліні, телефон, WhatsApp, e-mail і години роботи. Напишіть нам або запишіться на консультацію — відповімо швидко.',
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
      az: 'Almaniyadakı şirkətiniz üçün Azərbaycandan işçi lazımdır? Əməkdaşlıq sorğusu göndərin — seçim, viza və inteqrasiyanı biz idarə edək.',
      de: 'Sie suchen Arbeitskräfte aus Aserbaidschan? Senden Sie eine Kooperationsanfrage — wir übernehmen Auswahl und Visumverfahren.',
      en: 'Need workers from Azerbaijan for your company in Germany? Send a cooperation request and we handle recruiting and visas.',
      ru: 'Нужны работники из Азербайджана для вашей компании в Германии? Отправьте запрос на сотрудничество — подбор и визы берём на себя.',
      tr: 'Almanya\'daki şirketiniz için yurt dışından çalışan mı arıyorsunuz? Talep gönderin; seçim ve vize sürecini biz yönetelim.',
      uk: 'Шукаєте працівників з-за кордону для компанії в Німеччині? Надішліть запит на співпрацю — підбір, візи й інтеграцію візьмемо на себе.',
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
      en: 'Open jobs in Germany: drivers, construction, hospitality, care, Ausbildung and more. Apply online now with full visa and relocation support.',
      ru: 'Открытые вакансии в Германии: водители, стройка, гостиничный бизнес, Ausbildung и другие. Подайте заявку с визовой поддержкой.',
      tr: 'Almanya\'da açık pozisyonlar: şoförler, inşaat, otelcilik, bakım, Ausbildung ve daha fazlası. Vize desteğiyle hemen online başvurun.',
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
      de: 'Basic, Standard und Premium für Ihr Visumverfahren: Leistungen, Preise, Ratenzahlung und den Vertrag bequem online unterschreiben.',
      en: 'Basic, Standard and Premium packages for your visa process: what is included, prices, instalments and signing the contract online.',
      ru: 'Пакеты Basic, Standard и Premium для визового процесса: что входит, цены, оплата частями и подпись договора онлайн за пару минут.',
      tr: 'Vize süreciniz için Basic, Standard ve Premium paketler: kapsam, fiyatlar, taksitli ödeme ve sözleşmeyi online imzalama.',
      uk: 'Пакети Basic, Standard і Premium для візового процесу: що входить, ціни, оплата частинами та підпис договору онлайн за кілька хвилин.',
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
      az: 'Komandamızla pulsuz onlayn konsultasiya üçün sizə uyğun vaxtı seçin — Almaniyada iş, viza, sənədlər və növbəti addımlar barədə danışaq.',
      de: 'Wählen Sie einen passenden Termin für ein kostenloses Online-Gespräch mit unserem Team zu Job, Visum, Anerkennung und Dokumenten.',
      en: 'Pick a time for a free online consultation with our team about jobs in Germany, visas, documents and your next steps — in your language.',
      ru: 'Выберите удобное время для бесплатной онлайн-консультации с нашей командой о работе в Германии, визе, документах и следующих шагах.',
      tr: 'Ekibimizle ücretsiz online danışmanlık için uygun saati seçin — Almanya\'da iş, vize, belgeler ve sonraki adımlar hakkında konuşalım.',
      uk: 'Виберіть зручний час для безкоштовної онлайн-консультації з нашою командою щодо роботи в Німеччині, візи, документів і наступних кроків.',
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
      de: 'Chancenkarte Punkterechner: Punktesystem 2026',
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
      tr: 'Almanya Fırsat Kartı (Chancenkarte) puanınızı hesaplayın: denklik, Almanca ve İngilizce, iş deneyimi, yaş, önceki kalış ve eş durumu.',
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
      az: 'Mavi Kart 2026: minimum maaş həddi yoxlaması',
      de: 'Blaue Karte Gehaltsgrenze 2026: Gehaltscheck',
      en: 'EU Blue Card salary threshold 2026 check',
      ru: 'Голубая карта ЕС 2026: минимальная зарплата',
      tr: 'AB Mavi Kart 2026 maaş sınırı kontrolü',
      uk: 'Блакитна карта ЄС 2026: мінімальна зарплата',
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
      az: 'Triad Vision haqqında hüquqi məlumat: şirkət, ünvan, əlaqə və məsul şəxs (Almaniya qanunvericiliyinə uyğun Impressum, § 5 DDG).',
      de: 'Impressum von Triad Vision: Anbieterkennzeichnung, Anschrift, Kontakt, Registereintrag und Verantwortliche gemäß § 5 DDG.',
      en: 'Legal notice (Impressum) of Triad Vision: provider identification, address, contact and the responsible person under German law.',
      ru: 'Правовая информация (Impressum) Triad Vision: компания, адрес, контакты и ответственное лицо согласно законодательству Германии.',
      tr: 'Triad Vision yasal bilgileri: şirket, adres, iletişim bilgileri ve sorumlu kişi (Alman mevzuatına uygun Impressum, § 5 DDG).',
      uk: 'Правова інформація (Impressum) Triad Vision: компанія, адреса, контакти та відповідальна особа згідно із законодавством Німеччини.',
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
      az: 'Triad Vision şəxsi məlumatlarınızı necə toplayır, emal edir və qoruyur, kukilər və GDPR / DSGVO üzrə hansı hüquqlarınız var.',
      de: 'Wie Triad Vision personenbezogene Daten erhebt, verarbeitet und schützt, welche Cookies wir nutzen und welche Rechte Sie nach der DSGVO haben.',
      en: 'How Triad Vision collects, processes and protects your personal data, which cookies we use and which rights you have under the GDPR.',
      ru: 'Как Triad Vision собирает, обрабатывает и защищает ваши персональные данные, какие cookies мы используем и какие у вас права по GDPR.',
      tr: 'Triad Vision kişisel verilerinizi nasıl toplar, işler ve korur, hangi çerezleri kullanır ve GDPR (DSGVO) kapsamında haklarınız nelerdir.',
      uk: 'Як Triad Vision збирає, обробляє та захищає ваші персональні дані, які cookies ми використовуємо і які права ви маєте згідно з GDPR.',
    },
  },
  '/accessibility': {
    name: { az: 'Əlçatanlıq', de: 'Barrierefreiheit', en: 'Accessibility', ru: 'Доступность', tr: 'Erişilebilirlik', uk: 'Доступність' },
    title: { az: 'Əlçatanlıq bəyanatı', de: 'Barrierefreiheit', en: 'Accessibility statement', ru: 'Доступность сайта', tr: 'Erişilebilirlik beyanı', uk: 'Заява про доступність' },
    description: {
      az: 'Saytımızın əlçatanlıq imkanları: mətn ölçüsü, kontrast, oxunaqlı şrift, klaviatura ilə idarəetmə və digər tənzimləmələr.',
      de: 'Barrierefreiheit unserer Website: Schriftgröße, Kontrast, gut lesbare Schrift, Tastaturbedienung und weitere Einstellungen.',
      en: 'Accessibility features of our website: text size, contrast, a readable font, keyboard navigation and other settings — and how to reach us.',
      ru: 'Возможности доступности сайта: размер текста, контраст, удобочитаемый шрифт, управление с клавиатуры и другие настройки.',
      tr: 'Sitemizin erişilebilirlik özellikleri: yazı boyutu, kontrast, okunaklı yazı tipi, klavye ile gezinme ve diğer kullanım ayarları.',
      uk: 'Можливості доступності сайту: розмір тексту, контраст, зручний для читання шрифт, керування з клавіатури та інші налаштування.',
    },
  },
  '/register': {
    sitemap: false,
    name: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Register', ru: 'Регистрация', tr: 'Kayıt', uk: 'Реєстрація' },
    title: { az: 'Qeydiyyat', de: 'Registrieren', en: 'Create an account', ru: 'Регистрация', tr: 'Hesap oluştur', uk: 'Реєстрація' },
    description: {
      az: 'Pulsuz hesab yaradın, viza müraciətinizi başladın, sənədləri yükləyin və prosesin hər addımını şəxsi kabinetdən izləyin.',
      de: 'Kostenloses Konto anlegen, Visumantrag starten, Dokumente hochladen und jeden Schritt des Verfahrens im Kundenbereich verfolgen.',
      en: 'Create a free account, start your visa application, upload your documents and track every step of the process in your personal portal.',
      ru: 'Создайте бесплатный аккаунт, начните визовую заявку, загрузите документы и следите за каждым шагом процесса в личном кабинете.',
      tr: 'Ücretsiz hesap oluşturun, vize başvurunuzu başlatın, belgelerinizi yükleyin ve sürecin tüm adımlarını kişisel panelinizden takip edin.',
      uk: 'Створіть безкоштовний акаунт, почніть візову заявку, завантажте документи й стежте за кожним кроком процесу в особистому кабінеті.',
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
      az: 'Şirkətinizi qeydiyyatdan keçirin, vakansiya yerləşdirin və Azərbaycandan yoxlanılmış, uyğun namizədlərin profillərini alın.',
      de: 'Registrieren Sie Ihr Unternehmen, veröffentlichen Sie Stellen und erhalten Sie geprüfte, passende Kandidaten aus Aserbaidschan.',
      en: 'Register your company, post vacancies and receive screened, matching candidates from Azerbaijan — with visa paperwork handled for you.',
      ru: 'Зарегистрируйте компанию, размещайте вакансии и получайте проверенных подходящих кандидатов из Азербайджана с визовым сопровождением.',
      tr: 'Şirketinizi kaydedin, iş ilanı yayınlayın ve yurt dışından elemeden geçmiş uygun adayların profillerini alın; vize sürecini biz yönetelim.',
      uk: 'Зареєструйте компанію, публікуйте вакансії та отримуйте перевірених відповідних кандидатів з-за кордону з візовим супроводом.',
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
  '/confirm-email-change', // e-mail change link (token)
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
  '/r', // personal referral landing pages (/r/<slug>) and tracked review links
];

/**
 * Public SPA routes besides STATIC_PAGES and the private areas (client/src/App.tsx, site layout). Used for the
 * crawler status code (lib/seo.ts pageStatus): any other path answers 404 instead of a soft-404 SPA shell.
 * ":param" matches one path segment. Content routes (/visas/:slug …) are checked against the data.
 * tests/unit/seo.test.ts fails when App.tsx gains a route this list does not know.
 */
export const SPA_ROUTES = [
  '/calculators', // → /tools (client redirect; Caddy answers 301)
  '/workers',
  '/candidates',
  '/employers',
  '/ebook/:slug',
  '/l/:slug',
  '/success/:token',
  '/certificate/:code',
  '/referral-terms',
  '/status',
  '/p/:code',
  '/agb',
  '/terms',
  '/cookies',
  '/legal/:kind/:version',
  '/packages/order/:token',
];

/**
 * The tools hub (/tools): every calculator, check and planning aid, grouped as on the page
 * (client/src/components/audience/tools.ts). Paths without a catalogue entry are skipped in the crawlable body.
 */
export type ToolGroupKey = 'eligibility' | 'costs' | 'plan' | 'explore';
export const TOOL_GROUPS: { key: ToolGroupKey; paths: string[] }[] = [
  { key: 'eligibility', paths: ['/path-finder', '/uygunluq-testi', '/eligibility', '/compare-visas', '/blue-card-check', '/chancenkarte-calculator', '/anerkennung'] },
  { key: 'costs', paths: ['/salary-calculator', '/cost-calculator', '/budget'] },
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
