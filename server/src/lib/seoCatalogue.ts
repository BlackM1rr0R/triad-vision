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
  /** Canonical URL path when it is another page (embeddable widget → the full tool), also emitted on noindex pages. */
  canonical?: string;
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
  // Profession hubs (lib/professionHubs.ts): tools, work scene, vocabulary, mock exam, guides and vacancies per profession.
  '/for/truck-driver': {
    name: { az: 'Sürücülər üçün', de: 'Für Berufskraftfahrer', en: 'For truck drivers', ru: 'Водителям', tr: 'Şoförler için', uk: 'Водіям' },
    title: {
      az: 'Almaniyada sürücü işi: alətlər və işlər',
      de: 'LKW-Fahrer in Deutschland: Tools und Jobs',
      en: 'Truck driver in Germany: tools and jobs',
      ru: 'Водитель в Германии: инструменты и вакансии',
      tr: 'Almanya\'da TIR şoförü: araçlar ve ilanlar',
      uk: 'Водій у Німеччині: інструменти й вакансії',
    },
    description: {
      az: 'Almaniyada sürücü olmaq istəyənlər üçün: maaş, sürmə vaxtı, sürücülük vəsiqəsi, kabin lüğəti, alman dili testi və açıq vakansiyalar.',
      de: 'Für Berufskraftfahrer: Gehalt, Lenk- und Ruhezeiten, Führerschein, Vokabeln im LKW, Deutsch-Probetest und offene Stellen in Deutschland.',
      en: 'For truck drivers moving to Germany: salary, driving hours, licence, cab vocabulary, a German mock exam and open driver jobs.',
      ru: 'Для водителей: зарплата, время вождения, права, лексика кабины, пробный тест по немецкому и открытые вакансии в Германии.',
      tr: 'Almanya\'ya gitmek isteyen şoförler için: maaş, sürüş süreleri, ehliyet, kabin kelimeleri, Almanca deneme sınavı ve açık ilanlar.',
      uk: 'Для водіїв: зарплата, час керування, посвідчення, лексика кабіни, пробний тест з німецької та відкриті вакансії в Німеччині.',
    },
  },
  '/for/cook': {
    name: { az: 'Aşpazlar üçün', de: 'Für Köche', en: 'For cooks', ru: 'Поварам', tr: 'Aşçılar için', uk: 'Кухарям' },
    title: {
      az: 'Almaniyada aşpaz işi: alətlər və vakansiyalar',
      de: 'Koch in Deutschland: Tools und offene Stellen',
      en: 'Cook in Germany: tools and open jobs',
      ru: 'Повар в Германии: инструменты и вакансии',
      tr: 'Almanya\'da aşçı olmak: araçlar ve ilanlar',
      uk: 'Кухар у Німеччині: інструменти й вакансії',
    },
    description: {
      az: 'Almaniyada aşpaz və ya otel işçisi olmaq üçün: maaş, növbə əlavələri, diplomun tanınması, mətbəx lüğəti, dil testi və vakansiyalar.',
      de: 'Für Köche und Gastro-Fachkräfte: Gehalt, Schichtzuschläge, Anerkennung, Küchenvokabeln, Deutsch-Probetest und offene Stellen.',
      en: 'For cooks and hospitality staff: salary, shift supplements, recognition, kitchen vocabulary, a German mock exam and open jobs.',
      ru: 'Для поваров и работников гостиниц: зарплата, надбавки за смены, признание диплома, лексика кухни, тест по немецкому и вакансии.',
      tr: 'Aşçılar ve otel-restoran çalışanları için: maaş, vardiya zamları, denklik, mutfak kelimeleri, Almanca deneme sınavı ve ilanlar.',
      uk: 'Для кухарів і працівників готелів: зарплата, доплати за зміни, визнання диплома, лексика кухні, тест з німецької та вакансії.',
    },
  },
  '/for/nurse': {
    name: { az: 'Tibb bacıları üçün', de: 'Für Pflegefachkräfte', en: 'For nurses', ru: 'Медсёстрам', tr: 'Hemşireler için', uk: 'Медсестрам' },
    title: {
      az: 'Almaniyada tibb bacısı: tanınma və işlər',
      de: 'Pflegekraft in Deutschland: Tools und Jobs',
      en: 'Nurse in Germany: recognition and jobs',
      ru: 'Медсестра в Германии: признание и работа',
      tr: 'Almanya\'da hemşirelik: denklik ve ilanlar',
      uk: 'Медсестра в Німеччині: визнання й робота',
    },
    description: {
      az: 'Almaniyada tibb bacısı kimi işləmək üçün: diplomun tanınması, maaş, növbə əlavələri, xəstəxana lüğəti, B1 testi və vakansiyalar.',
      de: 'Für Pflegefachkräfte: Anerkennung, Gehalt, Schichtzuschläge, Vokabeln auf Station, Deutsch-Probetest B1 und offene Stellen.',
      en: 'For nurses: recognition of your diploma, salary, shift supplements, hospital vocabulary, a B1 German mock exam and open jobs.',
      ru: 'Для медсестёр: признание диплома, зарплата, надбавки за смены, лексика отделения, пробный тест B1 и открытые вакансии в Германии.',
      tr: 'Hemşireler için: diploma denkliği, maaş, vardiya zamları, hastane kelimeleri, B1 Almanca deneme sınavı ve Almanya\'daki açık ilanlar.',
      uk: 'Для медсестер: визнання диплома, зарплата, доплати за зміни, лексика відділення, пробний тест B1 та відкриті вакансії в Німеччині.',
    },
  },
  '/for/care-worker': {
    name: { az: 'Qulluq işçiləri üçün', de: 'Für Pflegehilfskräfte', en: 'For care workers', ru: 'Работникам по уходу', tr: 'Bakım çalışanları için', uk: 'Працівникам догляду' },
    title: {
      az: 'Almaniyada qulluq işi: alətlər və işlər',
      de: 'Pflegehilfe in Deutschland: Tools und Jobs',
      en: 'Care worker in Germany: tools and jobs',
      ru: 'Работа по уходу в Германии: всё в одном',
      tr: 'Almanya\'da bakım işi: araçlar ve ilanlar',
      uk: 'Догляд у Німеччині: інструменти й робота',
    },
    description: {
      az: 'Yaşlılara qulluq və köməkçi tibbi işlər üçün: maaş, növbə əlavələri, dil səviyyəsi, xəstəxana lüğəti, büdcə və açıq vakansiyalar.',
      de: 'Für Pflegehilfskräfte und Altenpflege: Gehalt, Schichtzuschläge, Sprachniveau, Vokabeln auf Station, Budget und offene Stellen.',
      en: 'For care assistants and elderly care: salary, shift supplements, your German level, ward vocabulary, budget and open jobs.',
      ru: 'Для помощников по уходу и в домах престарелых: зарплата, надбавки, уровень немецкого, лексика, бюджет и открытые вакансии.',
      tr: 'Yaşlı bakımı ve bakım yardımcıları için: maaş, vardiya zamları, Almanca seviyesi, servis kelimeleri, bütçe ve açık ilanlar.',
      uk: 'Для помічників з догляду та догляду за літніми: зарплата, доплати, рівень німецької, лексика, бюджет і відкриті вакансії.',
    },
  },
  '/for/electrician': {
    name: { az: 'Elektriklər üçün', de: 'Für Elektriker', en: 'For electricians', ru: 'Электрикам', tr: 'Elektrikçiler için', uk: 'Електрикам' },
    title: {
      az: 'Almaniyada elektrik işi: alətlər və işlər',
      de: 'Elektriker in Deutschland: Tools und Jobs',
      en: 'Electrician in Germany: tools and jobs',
      ru: 'Электрик в Германии: инструменты и работа',
      tr: 'Almanya\'da elektrikçi: araçlar ve ilanlar',
      uk: 'Електрик у Німеччині: інструменти й робота',
    },
    description: {
      az: 'Almaniyada elektrik kimi işləmək üçün: diplomun tanınması, maaş, Mavi Kart, elektrik şitinin lüğəti, dil testi və vakansiyalar.',
      de: 'Für Elektriker: Anerkennung, Gehalt, Blaue Karte, Vokabeln am Schaltschrank, Deutsch-Probetest und offene Stellen in Deutschland.',
      en: 'For electricians: recognition, salary, Blue Card check, switchboard vocabulary, a German mock exam and open jobs in Germany.',
      ru: 'Для электриков: признание диплома, зарплата, Голубая карта, лексика электрощита, тест по немецкому и вакансии в Германии.',
      tr: 'Elektrikçiler için: denklik, maaş, Mavi Kart kontrolü, elektrik panosu kelimeleri, Almanca deneme sınavı ve açık ilanlar.',
      uk: 'Для електриків: визнання диплома, зарплата, Блакитна карта, лексика електрощита, тест з німецької та вакансії в Німеччині.',
    },
  },
  '/for/construction-worker': {
    name: { az: 'İnşaatçılar üçün', de: 'Für Bauarbeiter', en: 'For construction workers', ru: 'Строителям', tr: 'İnşaat işçileri için', uk: 'Будівельникам' },
    title: {
      az: 'Almaniyada inşaat işi: alətlər və işlər',
      de: 'Bauarbeiter in Deutschland: Tools und Jobs',
      en: 'Construction work in Germany: tools and jobs',
      ru: 'Стройка в Германии: инструменты и вакансии',
      tr: 'Almanya\'da inşaat işi: araçlar ve ilanlar',
      uk: 'Будівництво в Німеччині: інструменти й робота',
    },
    description: {
      az: 'İnşaatçı, qaynaqçı, dülgər və santexniklər üçün: maaş, növbə əlavələri, tikinti sahəsinin lüğəti, dil testi və açıq vakansiyalar.',
      de: 'Für Bauarbeiter, Schweißer, Tischler und SHK: Gehalt, Zuschläge, Vokabeln auf der Baustelle, Deutsch-Probetest und offene Stellen.',
      en: 'For construction workers, welders, carpenters and plumbers: salary, supplements, site vocabulary, a German mock exam and jobs.',
      ru: 'Для строителей, сварщиков, столяров и сантехников: зарплата, надбавки, лексика стройплощадки, тест по немецкому и вакансии.',
      tr: 'İnşaat işçisi, kaynakçı, marangoz ve tesisatçılar için: maaş, zamlar, şantiye kelimeleri, Almanca deneme sınavı ve ilanlar.',
      uk: 'Для будівельників, зварників, столярів і сантехніків: зарплата, доплати, лексика будмайданчика, тест з німецької та вакансії.',
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
  '/reports': {
    name: { az: 'Rüblük hesabatlar', de: 'Quartalsberichte', en: 'Quarterly reports', ru: 'Квартальные отчёты', tr: 'Üç aylık raporlar', uk: 'Квартальні звіти' },
    title: {
      az: 'Azərbaycan → Almaniya: rüblük hesabatlar',
      de: 'Aserbaidschan → Deutschland: Quartalsberichte',
      en: 'Azerbaijan → Germany: labour mobility reports',
      ru: 'Азербайджан → Германия: квартальные отчёты',
      tr: 'Azerbaycan → Almanya: üç aylık raporlar',
      uk: 'Азербайджан → Німеччина: квартальні звіти',
    },
    description: {
      az: 'Təsdiqlənmiş vizalar, peşələr, viza növləri, əyalətlər və müddətlər üzrə anonim rüblük statistika (PDF). Yalnız 3 və daha çox müraciəti olan qruplar.',
      de: 'Anonyme Quartalsstatistik (PDF): erteilte Visa nach Beruf, Visumart, Bundesland und Bearbeitungsdauer. Nur Gruppen ab 3 Anträgen.',
      en: 'Anonymous quarterly statistics (PDF): visas approved by profession, visa type, German state and processing time. Only groups of 3+ applications.',
      ru: 'Анонимная квартальная статистика (PDF): одобренные визы по профессиям, типам виз, землям и срокам. Только группы от 3 заявлений.',
      tr: 'Anonim üç aylık istatistik (PDF): mesleğe, vize türüne, eyalete ve süreye göre onaylanan vizeler. Yalnızca 3+ başvurulu gruplar.',
      uk: 'Анонімна квартальна статистика (PDF): схвалені візи за професіями, типами віз, землями й строками. Лише групи від 3 заяв.',
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
  '/life-in-germany': {
    name: { az: 'Almaniyada həyat', de: 'Leben in Deutschland', en: 'Life in Germany', ru: 'Жизнь в Германии', tr: 'Almanya\'da yaşam', uk: 'Життя в Німеччині' },
    title: { az: 'Almaniyada həyat simulyatoru: maaş və xərclər', de: 'Leben in Deutschland: Gehalt und Kosten 2026', en: 'Life in Germany simulator: salary and costs', ru: 'Жизнь в Германии: зарплата и расходы 2026', tr: 'Almanya\'da yaşam: maaş ve giderler 2026', uk: 'Життя в Німеччині: зарплата й витрати 2026' },
    description: {
      az: 'Peşə, şəhər və ailəyə görə Almaniyada aylıq həyat: brutto və xalis maaş, kirayə, ərzaq, nəqliyyat və qənaət — avro və AMB məzənnəsi ilə manatla.',
      de: 'Leben in Deutschland nach Beruf, Stadt und Haushalt: Brutto und Netto, Miete, Essen, Deutschlandticket und Ersparnis – in Euro und Manat (CBAR-Kurs).',
      en: 'Monthly life in Germany by profession, city and household: gross and net pay, rent, food, transport and savings — in euro and manat at the CBAR rate.',
      ru: 'Жизнь в Германии по профессии, городу и семье: зарплата брутто и нетто, аренда, еда, транспорт и сбережения — в евро и манатах по курсу ЦБА.',
      tr: 'Mesleğe, şehre ve haneye göre Almanya\'da aylık yaşam: brüt ve net maaş, kira, gıda, ulaşım ve birikim — euro ve CBAR kuruyla manat olarak.',
      uk: 'Життя в Німеччині за професією, містом і родиною: зарплата брутто й нетто, оренда, їжа, транспорт і заощадження — в євро та манатах за курсом ЦБА.',
    },
  },
  '/when-in-germany': {
    name: { az: 'Almaniyada nə vaxt?', de: 'Wann in Deutschland?', en: 'When in Germany?', ru: 'Когда в Германии?', tr: 'Almanya\'da ne zaman?', uk: 'Коли в Німеччині?' },
    title: { az: 'Almaniyaya nə vaxt gedə bilərəm? 2026', de: 'Wann kann ich nach Deutschland? Rechner 2026', en: 'When can I move to Germany? Estimator 2026', ru: 'Когда я смогу переехать в Германию? 2026', tr: 'Almanya\'ya ne zaman gidebilirim? 2026', uk: 'Коли я зможу переїхати до Німеччини? 2026' },
    description: {
      az: 'Peşə, alman dili və sənədlərə görə Almaniyaya təxmini gəliş ayı: sənədlər, dil, tanınma, müqavilə, səfirlik və viza — real müraciətlərin müddətləri ilə.',
      de: 'Voraussichtlicher Ankunftsmonat in Deutschland nach Beruf, Deutschniveau und Unterlagen: Zeitstrahl von Anerkennung, Vertrag, Botschaft und Visum.',
      en: 'Estimated arrival month in Germany by profession, German level and documents: a timeline of recognition, contract, embassy and visa from real case data.',
      ru: 'Примерный месяц переезда в Германию по профессии, уровню немецкого и документам: шкала признания, договора, посольства и визы по реальным делам.',
      tr: 'Mesleğe, Almanca seviyesine ve belgelere göre Almanya\'ya tahmini varış ayı: denklik, sözleşme, konsolosluk ve vize zaman çizelgesi, gerçek verilerle.',
      uk: 'Орієнтовний місяць переїзду до Німеччини за професією, рівнем німецької та документами: шкала визнання, договору, посольства й візи за реальними справами.',
    },
  },
  '/payslip-explained': {
    name: { az: 'Maaş vərəqəsi izahlı', de: 'Lohnabrechnung erklärt', en: 'Payslip explained', ru: 'Расчётный лист', tr: 'Maaş bordrosu', uk: 'Розрахунковий лист' },
    title: { az: 'Almaniyada maaş vərəqəsi izahlı 2026', de: 'Lohnabrechnung erklärt: jede Zeile 2026', en: 'German payslip explained line by line 2026', ru: 'Расчётный лист в Германии: пояснения 2026', tr: 'Almanya\'da maaş bordrosu açıklaması 2026', uk: 'Розрахунковий лист у Німеччині 2026' },
    description: {
      az: 'Alman maaş vərəqəsi sətir-sətir: brutto, gəlir vergisi, kilsə vergisi, sağlamlıq, pensiya, işsizlik və qulluq sığortası, xalis maaş və işəgötürən xərci.',
      de: 'Lohnabrechnung Zeile für Zeile: Brutto, Lohnsteuer, Kirchensteuer, Kranken-, Renten-, Arbeitslosen- und Pflegeversicherung, Netto und Arbeitgeberkosten.',
      en: 'A German payslip line by line: gross, wage tax, church tax, health, pension, unemployment and care insurance, net pay and what the employer pays on top.',
      ru: 'Немецкий расчётный лист по строкам: брутто, подоходный и церковный налог, медстраховка, пенсия, безработица, уход, нетто и расходы работодателя.',
      tr: 'Alman maaş bordrosu satır satır: brüt, gelir ve kilise vergisi, sağlık, emeklilik, işsizlik ve bakım sigortası, net maaş ve işverenin ek maliyeti.',
      uk: 'Німецький розрахунковий лист по рядках: брутто, податок на зарплату, церковний податок, медичне й пенсійне страхування, нетто й витрати роботодавця.',
    },
  },
  '/tax-refund-calculator': {
    name: { az: 'Vergi qaytarılması', de: 'Steuererstattung', en: 'Tax refund calculator', ru: 'Возврат налога', tr: 'Vergi iadesi', uk: 'Повернення податку' },
    title: { az: 'Almaniyada vergi qaytarılması 2026', de: 'Steuererstattung berechnen 2026: Rechner', en: 'German tax refund calculator 2026', ru: 'Возврат налога в Германии: калькулятор 2026', tr: 'Almanya vergi iadesi hesaplama 2026', uk: 'Повернення податку в Німеччині 2026' },
    description: {
      az: 'Bəyannamə ilə nə qədər vergi geri alarsınız: yol pulu 0,38 €/km, ev ofisi, iş ləvazimatı, ikiqat təsərrüfat, köçmə — 2026 qaydaları, manatla.',
      de: 'Wie viel Steuer bekommen Sie zurück? Entfernungspauschale 0,38 €/km, Homeoffice, Arbeitsmittel, doppelte Haushaltsführung, Umzug – Regeln 2026.',
      en: 'How much tax will you get back? Commuting allowance 0.38 €/km, home office, equipment, double household, moving costs — 2026 rules, in euro and manat.',
      ru: 'Сколько налога вы вернёте: дорога 0,38 €/км, хоум-офис, рабочие расходы, двойное хозяйство, переезд — правила 2026 года, в евро и манатах.',
      tr: 'Ne kadar vergi geri alırsınız? Yol götürüsü 0,38 €/km, ev ofisi, iş malzemesi, çifte hane, taşınma — 2026 kuralları, euro ve manat olarak.',
      uk: 'Скільки податку ви повернете: дорога 0,38 €/км, хоум-офіс, робочі витрати, подвійне господарство, переїзд — правила 2026 року.',
    },
  },
  '/shift-pay-calculator': {
    name: { az: 'Gecə və bayram əlavələri', de: 'Zuschlagsrechner', en: 'Shift pay calculator', ru: 'Калькулятор надбавок', tr: 'Vardiya zammı hesaplama', uk: 'Калькулятор надбавок' },
    title: { az: 'Gecə və bayram əlavələri: vergisiz?', de: 'Nacht- und Feiertagszuschlag: steuerfrei?', en: 'Night & holiday pay in Germany: tax-free?', ru: 'Надбавки за ночь и праздники в Германии', tr: 'Gece, pazar ve tatil zammı: vergisiz mi?', uk: 'Надбавки за ніч і свята в Німеччині' },
    description: {
      az: 'Gecə (25/40%), bazar (50%), bayram (125/150%) əlavələrinin vergisiz və sığortasız hissəsi §3b EStG üzrə: tibb bacısı, aşpaz və sürücü nümunələri.',
      de: 'Steuer- und beitragsfreie Zuschläge nach §3b EStG: Nacht 25/40 %, Sonntag 50 %, Feiertag 125/150 %. Mit Beispielen für Pflege, Küche und Fahrer.',
      en: 'Tax- and contribution-free supplements under §3b EStG: night 25/40 %, Sunday 50 %, holidays 125/150 %. With presets for nurses, cooks and drivers.',
      ru: 'Необлагаемые надбавки по §3b EStG: ночь 25/40 %, воскресенье 50 %, праздники 125/150 %. С примерами для медсестёр, поваров и водителей.',
      tr: '§3b EStG’ye göre vergisiz ve primsiz zamlar: gece %25/40, pazar %50, tatil %125/150. Hemşire, aşçı ve şoför örnekleriyle.',
      uk: 'Неоподатковувані надбавки за §3b EStG: ніч 25/40 %, неділя 50 %, свята 125/150 %. З прикладами для медсестер, кухарів і водіїв.',
    },
  },
  '/rent-check': {
    name: { az: 'Kirayə yoxlaması', de: 'Mietcheck', en: 'Rent check', ru: 'Проверка аренды', tr: 'Kira kontrolü', uk: 'Перевірка оренди' },
    title: { az: 'Kirayə yoxlaması: qiymət normaldır?', de: 'Mietcheck: Ist meine Miete zu hoch?', en: 'Rent check Germany: is my rent fair?', ru: 'Проверка аренды в Германии: не дорого ли?', tr: 'Almanya kira kontrolü: kiram makul mü?', uk: 'Перевірка оренди в Німеччині: чи не дорого?' },
    description: {
      az: 'Soyuq kirayəni m²-yə görə şəhərin tipik aralığı ilə müqayisə edin: ucuz, normal və ya baha. Kommunal xərclər və Mietpreisbremse (+10%) qeydi ilə.',
      de: 'Kaltmiete pro m² mit der typischen Spanne der Stadt vergleichen: günstig, normal oder teuer. Mit Nebenkosten-Check und Hinweis zur Mietpreisbremse.',
      en: 'Compare your cold rent per m² with the city’s typical range: cheap, normal or expensive. With a utilities check and a note on the rent cap (+10 %).',
      ru: 'Сравните холодную аренду за м² с типичным диапазоном города: дёшево, нормально или дорого. С проверкой коммуналки и Mietpreisbremse.',
      tr: 'Soğuk kiranızı m² başına şehrin tipik aralığıyla karşılaştırın: ucuz, normal veya pahalı. Yan gider kontrolü ve kira freni notuyla.',
      uk: 'Порівняйте холодну оренду за м² із типовим діапазоном міста: дешево, нормально чи дорого. З перевіркою комуналки й Mietpreisbremse.',
    },
  },
  '/real-salaries': {
    name: { az: 'Real maaşlar', de: 'Echte Gehälter', en: 'Real salaries', ru: 'Реальные зарплаты', tr: 'Gerçek maaşlar', uk: 'Реальні зарплати' },
    title: {
      az: 'Almaniyada real maaşlar: peşə və şəhər',
      de: 'Echte Gehälter nach Beruf und Stadt',
      en: 'Real salaries in Germany by job and city',
      ru: 'Реальные зарплаты в Германии по городам',
      tr: 'Almanya’da gerçek maaşlar: meslek, şehir',
      uk: 'Реальні зарплати в Німеччині за містами',
    },
    description: {
      az: 'İşçilərimizin əmək müqavilələrindəki brutto aylıq maaşlar: peşə və şəhər üzrə P25–P75 aralığı və median. Ən azı 3 işçi, fərdi məbləğ yoxdur.',
      de: 'Bruttomonatsgehälter aus Arbeitsverträgen unserer Fachkräfte: Spanne P25–P75 und Median nach Beruf und Stadt. Ab 3 Personen, keine Einzelwerte.',
      en: 'Gross monthly pay from our placed workers’ contracts: P25–P75 range and median by profession and city. Groups of 3+ workers only, no single values.',
      ru: 'Брутто-зарплаты из трудовых договоров наших работников: диапазон P25–P75 и медиана по профессии и городу. От 3 человек, без отдельных сумм.',
      tr: 'Çalışanlarımızın iş sözleşmelerindeki brüt aylık maaşlar: mesleğe ve şehre göre P25–P75 aralığı ve medyan. En az 3 kişi, tek tutar yok.',
      uk: 'Брутто-зарплати з трудових договорів наших працівників: діапазон P25–P75 і медіана за професією та містом. Від 3 осіб, без окремих сум.',
    },
  },
  '/health-insurance-comparison': {
    name: { az: 'Krankenkasse müqayisəsi', de: 'Krankenkassen-Vergleich', en: 'Health insurance comparison', ru: 'Сравнение больничных касс', tr: 'Krankenkasse karşılaştırması', uk: 'Порівняння лікарняних кас' },
    title: { az: 'Krankenkasse müqayisəsi 2026', de: 'Krankenkassen-Vergleich 2026', en: 'German health insurance compared 2026', ru: 'Сравнение больничных касс 2026', tr: 'Krankenkasse karşılaştırması 2026', uk: 'Порівняння лікарняних кас 2026' },
    description: {
      az: 'Bütün Almaniya üzrə açıq kassalar və AOK-lar 2026 Zusatzbeitrag ilə: brutto maaşa görə aylıq və illik payınız, qənaət və kassanı dəyişmə qaydası.',
      de: 'Alle bundesweit geöffneten Kassen und die AOKs mit Zusatzbeitrag 2026: Ihr Anteil pro Monat und Jahr, Ersparnis und wie der Kassenwechsel funktioniert.',
      en: 'All nationwide funds and the regional AOKs with their 2026 additional rate: your share per month and year, your savings and how to switch funds.',
      ru: 'Все больничные кассы Германии и региональные AOK с доп. взносом 2026: ваша доля в месяц и год, экономия и как сменить кассу.',
      tr: 'Tüm Almanya’ya açık kasalar ve bölgesel AOK’lar 2026 ek primiyle: aylık ve yıllık payınız, tasarruf ve kasa değiştirme kuralları.',
      uk: 'Усі лікарняні каси Німеччини та регіональні AOK із дод. внеском 2026: ваша частка за місяць і рік, економія і як змінити касу.',
    },
  },
  '/emergency-wallpaper': {
    name: { az: 'Təcili yardım ekran şəkli', de: 'Notfall-Sperrbildschirm', en: 'Emergency lock screen', ru: 'Экстренные обои', tr: 'Acil durum kilit ekranı', uk: 'Екстрені шпалери' },
    title: { az: 'Təcili yardım ekran şəkli (telefon)', de: 'Notfall-Sperrbildschirm fürs Handy', en: 'Emergency lock screen for Germany', ru: 'Экстренные обои для телефона', tr: 'Acil durum kilit ekranı (Almanya)', uk: 'Екстрені шпалери для телефону' },
    description: {
      az: '112, 110, 116 117, işəgötürən, ünvan və səfirlik nömrəsi ilə kilid ekranı şəkli yaradın. Telefonda yaradılır, heç nə göndərilmir. PNG yükləyin.',
      de: 'Sperrbildschirm mit 112, 110, 116 117, Arbeitgeber, Adresse und Botschaft erstellen. Wird auf dem Gerät erzeugt, nichts wird hochgeladen. Als PNG.',
      en: 'Create a lock screen with 112, 110, 116 117, your employer, address and the embassy. Made on your device, nothing is uploaded. Download as PNG.',
      ru: 'Обои экрана блокировки с 112, 110, 116 117, работодателем, адресом и посольством. Создаются на устройстве, ничего не загружается. PNG.',
      tr: '112, 110, 116 117, işveren, adres ve büyükelçilik numarasıyla kilit ekranı oluşturun. Cihazda üretilir, hiçbir şey yüklenmez. PNG indirin.',
      uk: 'Шпалери екрана блокування з 112, 110, 116 117, роботодавцем, адресою й посольством. Створюються на пристрої, нічого не завантажується.',
    },
  },
  '/holiday-planner': {
    name: { az: 'Bayramlar və körpü günləri', de: 'Feiertage & Brückentage', en: 'Holidays & bridge days', ru: 'Праздники и «мостики»', tr: 'Tatiller ve köprü günleri', uk: 'Свята й «містки»' },
    title: { az: 'Almaniyada bayramlar və körpü günləri', de: 'Feiertage 2026–2028 und Brückentage', en: 'German holidays 2026–2028 & bridge days', ru: 'Праздники Германии 2026–2028 и «мостики»', tr: 'Almanya tatilleri ve köprü günleri', uk: 'Свята Німеччини 2026–2028 і «містки»' },
    description: {
      az: 'Bütün 16 federal ştat üçün 2026–2028 rəsmi bayramları, təqvim və ən yaxşı körpü günləri: 4 gün məzuniyyət → 9 gün istirahət. .ics yükləyin.',
      de: 'Gesetzliche Feiertage 2026–2028 aller 16 Bundesländer, Jahreskalender und die besten Brückentage: 4 Urlaubstage → 9 Tage frei. Als .ics laden.',
      en: 'Public holidays 2026–2028 for all 16 German states, a year calendar and the best bridge days: 4 vacation days → 9 days off. Download as .ics.',
      ru: 'Официальные праздники 2026–2028 всех 16 земель Германии, календарь и лучшие «мостики»: 4 дня отпуска → 9 дней отдыха. Скачать .ics.',
      tr: 'Almanya’nın 16 eyaleti için 2026–2028 resmî tatilleri, yıllık takvim ve en iyi köprü günleri: 4 gün izin → 9 gün tatil. .ics indirin.',
      uk: 'Офіційні свята 2026–2028 усіх 16 земель Німеччини, календар і найкращі «містки»: 4 дні відпустки → 9 днів відпочинку. Завантажити .ics.',
    },
  },
  '/grade-converter': {
    name: { az: 'Qiymət çevirici', de: 'Notenumrechnung', en: 'Grade converter', ru: 'Пересчёт оценок', tr: 'Not dönüştürücü', uk: 'Перерахунок оцінок' },
    title: { az: 'Azərbaycan qiymətini alman qiymətinə çevir', de: 'Notenumrechnung Aserbaidschan → deutsche Note', en: 'Convert Azerbaijani grades to German grades', ru: 'Пересчёт азербайджанских оценок в немецкие', tr: 'Azerbaycan notunu Alman notuna çevirme', uk: 'Перерахунок оцінок з Азербайджану' },
    description: {
      az: 'Attestat (5 ballıq) və ya universitet qiymətini (100 ballıq) modifikasiya olunmuş Bavariya formulu ilə alman 1,0–4,0 qiymətinə çevirin — uni-assist üçün.',
      de: 'Attestat (5-Punkte-Skala) oder Hochschulnote (100 Punkte) mit der modifizierten bayerischen Formel in die deutsche Note 1,0–4,0 umrechnen.',
      en: 'Convert an Azerbaijani attestat (5-point) or university grade (100-point) into the German 1.0–4.0 scale with the modified Bavarian formula.',
      ru: 'Аттестат (5 баллов) или оценку вуза (100 баллов) — в немецкую шкалу 1,0–4,0 по модифицированной баварской формуле. Для uni-assist.',
      tr: 'Azerbaycan attestatını (5’lik) veya üniversite notunu (100’lük) değiştirilmiş Bavyera formülüyle Alman 1,0–4,0 ölçeğine çevirin.',
      uk: 'Атестат (5 балів) або оцінку вишу (100 балів) — у німецьку шкалу 1,0–4,0 за модифікованою баварською формулою. Для uni-assist.',
    },
  },
  // Work & employer calculators: drivers' hours, ArbZG shift plan, Steuerklassenwahl, employer cost (B2B, German first).
  '/driving-time-calculator': {
    name: { az: 'Sürmə və istirahət vaxtı', de: 'Lenk- und Ruhezeiten', en: 'Driving & rest times', ru: 'Время вождения и отдыха', tr: 'Sürüş ve dinlenme süresi', uk: 'Час керування й відпочинку' },
    title: { az: 'Sürücülər üçün sürmə və istirahət vaxtı', de: 'Lenk- und Ruhezeiten-Rechner für Lkw-Fahrer', en: 'Truck driver hours & rest time checker', ru: 'Время вождения и отдыха водителя: проверка', tr: 'Tır şoförü sürüş ve dinlenme süresi', uk: 'Час керування й відпочинку водія' },
    description: {
      az: 'Həftəni gün-gün daxil edin: AB 561/2006 (9/10 saat, 45 dəq fasilə, 11/9 saat istirahət, 56/90 saat) və §21a ArbZG pozuntuları, təxmini cərimələr.',
      de: 'Woche Tag für Tag eintragen: Verstöße gegen VO 561/2006 (9/10 h, 45 min, 11/9 h Ruhe, 56/90 h) und §21a ArbZG mit Bußgeld-Richtwerten.',
      en: 'Enter your week day by day: breaches of EU 561/2006 (9/10 h, 45-min break, 11/9 h rest, 56/90 h) and German §21a ArbZG, with indicative fines.',
      ru: 'Неделя по дням: нарушения Регламента ЕС 561/2006 (9/10 ч, перерыв 45 мин, отдых 11/9 ч, 56/90 ч) и §21a ArbZG с ориентировочными штрафами.',
      tr: 'Haftanızı gün gün girin: AB 561/2006 (9/10 sa, 45 dk mola, 11/9 sa dinlenme, 56/90 sa) ve §21a ArbZG ihlalleri, tahmini cezalarla.',
      uk: 'Тиждень по днях: порушення Регламенту ЄС 561/2006 (9/10 год, перерва 45 хв, відпочинок 11/9 год, 56/90 год) і §21a ArbZG з орієнтовними штрафами.',
    },
  },
  '/work-schedule-check': {
    name: { az: 'İş qrafiki yoxlaması', de: 'Dienstplan-Check', en: 'Work schedule check', ru: 'Проверка графика', tr: 'Çalışma planı kontrolü', uk: 'Перевірка графіка' },
    title: { az: 'İş qrafikim qanunidirmi? ArbZG yoxlaması', de: 'Dienstplan prüfen: Ist er legal? (ArbZG)', en: 'Is my work schedule legal in Germany?', ru: 'Законен ли мой график работы в Германии?', tr: 'Çalışma planım Almanya’da yasal mı?', uk: 'Чи законний мій графік роботи?' },
    description: {
      az: 'Tibb bacısı, aşpaz və növbəli işçilər üçün: 8/10 saat, fasilələr, 11 saat istirahət, gecə və bazar işi alman iş vaxtı qanunu üzrə yoxlanılır.',
      de: 'Für Pflege, Küche und Schichtdienst: 8/10 h, Pausen, 11 h Ruhezeit (10 h mit Ausgleich), Nacht- und Sonntagsarbeit nach dem Arbeitszeitgesetz prüfen.',
      en: 'For nurses, cooks and shift workers: 8/10 h days, breaks, 11 h rest (10 h with compensation), night and Sunday work checked against the ArbZG.',
      ru: 'Для медсестёр, поваров и сменных работников: 8/10 ч, перерывы, отдых 11 ч, ночная и воскресная работа — проверка по закону о рабочем времени.',
      tr: 'Hemşire, aşçı ve vardiyalı çalışanlar için: 8/10 saat, molalar, 11 saat dinlenme, gece ve pazar çalışması Alman çalışma süresi kanununa göre.',
      uk: 'Для медсестер, кухарів і змінних працівників: 8/10 год, перерви, відпочинок 11 год, нічна й недільна робота — перевірка за законом про робочий час.',
    },
  },
  '/tax-class-chooser': {
    name: { az: 'Vergi sinfi seçimi', de: 'Steuerklassenwahl', en: 'Tax class chooser', ru: 'Выбор налогового класса', tr: 'Vergi sınıfı seçimi', uk: 'Вибір податкового класу' },
    title: { az: 'Evlilər üçün vergi sinfi: III/V və ya IV/IV', de: 'Steuerklassenwahl 2026: III/V, IV/IV, Faktor', en: 'Tax class chooser for couples 2026', ru: 'Налоговый класс для супругов 2026', tr: 'Evli çiftler için vergi sınıfı 2026', uk: 'Податковий клас для подружжя 2026' },
    description: {
      az: 'III/V, IV/IV və faktorlu IV/IV müqayisəsi: hər tərəfdaşın aylıq xalisi, bəyannamədən sonra qaytarma və ya əlavə ödəniş, Elterngeld təsiri.',
      de: 'III/V, IV/IV oder IV/IV mit Faktor: Netto je Partner und gemeinsam, Erstattung oder Nachzahlung, Pflichtveranlagung und Folgen fürs Elterngeld.',
      en: 'Compare III/V, IV/IV and IV/IV with factor: monthly net per partner and together, refund or back payment, mandatory return and parental allowance.',
      ru: 'Сравнение III/V, IV/IV и IV/IV с фактором: нетто каждого и вместе, возврат или доплата, обязательная декларация и влияние на Elterngeld.',
      tr: 'III/V, IV/IV ve faktörlü IV/IV karşılaştırması: eş başına ve toplam aylık net, iade veya ek ödeme, zorunlu beyanname ve Elterngeld etkisi.',
      uk: 'Порівняння III/V, IV/IV та IV/IV з фактором: нетто кожного й разом, повернення чи доплата, обовʼязкова декларація та вплив на Elterngeld.',
    },
  },
  '/employer-cost-calculator': {
    name: { az: 'İşəgötürən xərci', de: 'Arbeitgeberkosten', en: 'Employer cost', ru: 'Расходы работодателя', tr: 'İşveren maliyeti', uk: 'Витрати роботодавця' },
    title: { az: 'Almaniyada işəgötürən xərci 2026', de: 'Arbeitgeberkosten-Rechner 2026', en: 'Employer cost calculator Germany 2026', ru: 'Расходы работодателя в Германии 2026', tr: 'Almanya işveren maliyeti hesaplama 2026', uk: 'Витрати роботодавця в Німеччині 2026' },
    description: {
      az: 'Brutto maaşdan işəgötürən xərcinə: sosial sığorta payları, U1/U2/U3, BG, illik xərc, viza 75 €, §81a 411 € və boş vakansiyanın qiyməti.',
      de: 'Vom Brutto zu den Personalkosten: Arbeitgeberanteile 2026, U1/U2/U3, BG, Jahreskosten, Visum 75 €, §81a-Verfahren 411 € und Kosten der Vakanz.',
      en: 'From gross salary to employer cost: 2026 social contributions, U1/U2/U3, accident insurance, visa 75 €, §81a procedure 411 € and the cost of a vacancy.',
      ru: 'От брутто к расходам работодателя: взносы 2026, U1/U2/U3, BG, годовые расходы, виза 75 €, процедура §81a 411 € и стоимость вакансии.',
      tr: 'Brüt maaştan işveren maliyetine: 2026 primleri, U1/U2/U3, BG, yıllık maliyet, vize 75 €, §81a prosedürü 411 € ve boş pozisyonun maliyeti.',
      uk: 'Від брутто до витрат роботодавця: внески 2026, U1/U2/U3, BG, річні витрати, віза 75 €, процедура §81a 411 € і вартість вакансії.',
    },
  },
  // Content pages: Deutschlandticket day trips, employer guide Azerbaijan (German first), Azerbaijan in Germany map.
  '/weekend-trips': {
    name: { az: 'Həftəsonu səfərləri', de: 'Wochenendausflüge', en: 'Weekend trips', ru: 'Поездки на выходные', tr: 'Hafta sonu gezileri', uk: 'Поїздки на вихідні' },
    title: { az: 'Deutschlandticket ilə həftəsonu səfərləri', de: 'Ausflüge mit dem Deutschlandticket', en: 'Day trips with the Deutschlandticket', ru: 'Поездки с Deutschlandticket на выходные', tr: 'Deutschlandticket ile hafta sonu gezileri', uk: 'Поїздки з Deutschlandticket на вихідні' },
    description: {
      az: 'Deutschlandticket ilə 14 alman şəhərindən günlük səfərlər: hər biri üçün yalnız RE, RB və S-Bahn ilə 10 yer — yol vaxtı, mövsüm və bahn.de linki.',
      de: 'Tagesausflüge mit dem Deutschlandticket ab 14 Städten: je 10 Ziele nur mit RE, RB und S-Bahn – mit Fahrzeit, Jahreszeit und Link zu bahn.de.',
      en: 'Day trips with the Deutschlandticket from 14 German cities: 10 destinations each by RE, RB and S-Bahn only — travel time, season and bahn.de link.',
      ru: 'Поездки на день с Deutschlandticket из 14 городов Германии: по 10 мест только на RE, RB и S-Bahn — время в пути, сезон и ссылка на bahn.de.',
      tr: 'Deutschlandticket ile 14 Alman şehrinden günübirlik geziler: her biri için yalnız RE, RB ve S-Bahn ile 10 yer — yol süresi, mevsim ve bahn.de.',
      uk: 'Поїздки на день із Deutschlandticket із 14 міст Німеччини: по 10 місць лише RE, RB і S-Bahn — час у дорозі, сезон і посилання на bahn.de.',
    },
  },
  '/employer-guide-azerbaijan': {
    name: { az: 'İşəgötürən bələdçisi: Azərbaycan', de: 'Leitfaden Aserbaidschan', en: 'Employer guide Azerbaijan', ru: 'Гид: найм из Азербайджана', tr: 'İşveren rehberi: Azerbaycan', uk: 'Гід: найм з Азербайджану' },
    title: { az: 'Azərbaycandan işçi: işəgötürən bələdçisi', de: 'Leitfaden: Mitarbeiter aus Aserbaidschan', en: 'Hiring from Azerbaijan: employer guide', ru: 'Найм работников из Азербайджана: гид', tr: 'Azerbaycan’dan işçi alımı: işveren rehberi', uk: 'Найм працівників з Азербайджану: гід' },
    description: {
      az: 'Təhsil sistemi, tanınma (anabin, EQF), Bakıda alman dili imtahanları, iş mədəniyyəti, bayramlar və § 81a daxil viza yolları — işəgötürənlər üçün.',
      de: 'Bildungssystem, Anerkennung (anabin, DQR), Deutschprüfungen in Baku, Arbeitskultur, Feiertage und Visumwege inkl. § 81a – für Arbeitgeber.',
      en: 'Education system, recognition (anabin, EQF), German exams in Baku, work culture, holidays and visa routes incl. § 81a — a guide for employers.',
      ru: 'Образование, признание (anabin, EQF), экзамены по немецкому в Баку, рабочая культура, праздники и визы, включая § 81a, — для работодателей.',
      tr: 'Eğitim sistemi, denklik (anabin, EQF), Bakü’de Almanca sınavları, iş kültürü, bayramlar ve § 81a dahil vize yolları — işverenler için.',
      uk: 'Освіта, визнання (anabin, EQF), іспити з німецької в Баку, робоча культура, свята й візи, зокрема § 81a, — для роботодавців.',
    },
  },
  '/azerbaijan-in-germany': {
    name: { az: 'Almaniyada Azərbaycan', de: 'Aserbaidschan in Deutschland', en: 'Azerbaijan in Germany', ru: 'Азербайджан в Германии', tr: 'Almanya’da Azerbaycan', uk: 'Азербайджан у Німеччині' },
    title: { az: 'Almaniyada Azərbaycan: səfirlik və icma', de: 'Aserbaidschan in Deutschland: Karte', en: 'Azerbaijan in Germany: embassy and community', ru: 'Азербайджан в Германии: посольство и община', tr: 'Almanya’da Azerbaycan: harita', uk: 'Азербайджан у Німеччині: посольство й громада' },
    description: {
      az: 'Almaniyada Azərbaycan səfirliyi, fəxri konsulluq, mədəniyyət mərkəzi, birliklər və kafe: xəritə, mənbə və tarixlə yoxlanılmış siyahı.',
      de: 'Botschaft, Honorarkonsulat, Kulturzentrum, Vereine und aserbaidschanisches Café in Deutschland: geprüfte Liste mit Karte, Quellen und Datum.',
      en: 'Embassy, honorary consulate, cultural centre, associations and an Azerbaijani café in Germany: a verified list with map, sources and dates.',
      ru: 'Посольство, почётное консульство, культурный центр, объединения и азербайджанское кафе в Германии: проверенный список с картой и источниками.',
      tr: 'Almanya’da büyükelçilik, fahri konsolosluk, kültür merkezi, dernekler ve Azerbaycan kafesi: harita ve kaynaklarla doğrulanmış liste.',
      uk: 'Посольство, почесне консульство, культурний центр, об’єднання й азербайджанське кафе в Німеччині: перевірений список із мапою та джерелами.',
    },
  },
  '/german-apartment': {
    name: { az: 'Virtual alman mənzili', de: 'Virtuelle deutsche Wohnung', en: 'Virtual German apartment', ru: 'Виртуальная немецкая квартира', tr: 'Sanal Alman dairesi', uk: 'Віртуальна німецька квартира' },
    title: { az: 'Alman mənzili: Nebenkosten, Pfand və qaydalar', de: 'Deutsche Wohnung erklärt: Heizung bis Pfand', en: 'German apartment explained: rules and tips', ru: 'Немецкая квартира: правила и советы', tr: 'Alman dairesi: kurallar ve ipuçları', uk: 'Німецька квартира: правила й поради' },
    description: {
      az: 'İnteraktiv alman mənzili: termostat, havalandırma və kif, zibil və Pfand, Nebenkosten, sakitlik saatları, Kaution — məsləhət və tipik səhvlərlə.',
      de: 'Interaktive Mietwohnung: Thermostat, Stoßlüften und Schimmel, Mülltrennung, Pfand, Nebenkosten, Ruhezeiten, Kaution — mit Tipps und typischen Fehlern.',
      en: 'An interactive German flat: thermostat numbers, airing and mould, bins and Pfand, Nebenkosten, quiet hours and Kaution — with tips and common mistakes.',
      ru: 'Интерактивная немецкая квартира: термостат, проветривание, мусор и Pfand, Nebenkosten, часы тишины и Kaution — с советами и частыми ошибками.',
      tr: 'Etkileşimli Alman dairesi: termostat, havalandırma ve küf, çöp ve Pfand, Nebenkosten, sessizlik saatleri ve Kaution — ipuçları ve sık hatalarla.',
      uk: 'Інтерактивна німецька квартира: термостат, провітрювання, сміття й Pfand, Nebenkosten, години тиші й Kaution — з порадами та частими помилками.',
    },
  },
  // Interactive work scenes (client pages/tools/workScenes, lib/workScenes): hub + one page per workplace.
  '/work-scenes': {
    name: { az: 'İş səhnələri', de: 'Arbeitsszenen', en: 'Work scenes', ru: 'Рабочие сцены', tr: 'İş sahneleri', uk: 'Робочі сцени' },
    title: { az: 'İş yerində almanca: interaktiv səhnələr', de: 'Deutsch am Arbeitsplatz: interaktive Szenen', en: 'German at work: interactive workplace scenes', ru: 'Немецкий на работе: интерактивные сцены', tr: 'İş yerinde Almanca: etkileşimli sahneler', uk: 'Німецька на роботі: інтерактивні сцени' },
    description: {
      az: 'Mətbəx, yük maşını, xəstəxana, tikinti və elektrik lövhəsi: alman iş sözləri artikl, tələffüz, tərcümə, təhlükəsizlik qaydası və testlə.',
      de: 'Küche, Lkw, Krankenstation, Baustelle und Sicherungskasten: deutsche Fachwörter mit Artikel, Aussprache, Übersetzung, Sicherheitsregel und Quiz.',
      en: 'Kitchen, truck cab, hospital ward, construction site and fuse box: German work words with article, pronunciation, translation, safety rules and a quiz.',
      ru: 'Кухня, грузовик, больница, стройка и электрощит: немецкие рабочие слова с артиклем, произношением, переводом, правилами безопасности и тестом.',
      tr: 'Mutfak, tır, hastane, şantiye ve elektrik panosu: artikel, telaffuz, çeviri, güvenlik kuralı ve testle Almanca iş kelimeleri.',
      uk: 'Кухня, вантажівка, лікарня, будмайданчик і електрощит: німецькі робочі слова з артиклем, вимовою, перекладом, правилами безпеки й тестом.',
    },
  },
  '/work-scenes/restaurant-kitchen': {
    name: { az: 'Restoran mətbəxi', de: 'Restaurantküche', en: 'Restaurant kitchen', ru: 'Кухня ресторана', tr: 'Restoran mutfağı', uk: 'Кухня ресторану' },
    title: { az: 'Mətbəx almancası: HACCP və allergenlər', de: 'Küchendeutsch für Köche: HACCP und Allergene', en: 'Kitchen German for cooks: HACCP and allergens', ru: 'Немецкий для поваров: кухня, HACCP, аллергены', tr: 'Aşçılar için mutfak Almancası: HACCP, alerjen', uk: 'Німецька для кухарів: кухня, HACCP, алергени' },
    description: {
      az: 'İnteraktiv peşəkar mətbəx: Herd, Fritteuse, Kombidämpfer, Kühlhaus, HACCP lövhə rəngləri, 14 allergen, yağ yanğını — tələffüz və testlə.',
      de: 'Interaktive Profiküche: Herd, Fritteuse, Kombidämpfer, Kühlhaus, HACCP-Brettfarben, 14 Allergene, Fettbrand — mit Aussprache und Quiz.',
      en: 'An interactive professional kitchen: stove, fryer, combi steamer, cold room, HACCP board colours, 14 allergens, fat fires — with audio and a quiz.',
      ru: 'Интерактивная профкухня: плита, фритюрница, пароконвектомат, холодильная камера, цвета досок HACCP, 14 аллергенов — с озвучкой и тестом.',
      tr: 'Etkileşimli profesyonel mutfak: ocak, fritöz, kombi fırın, soğuk oda, HACCP tahta renkleri, 14 alerjen, yağ yangını — sesli ve testli.',
      uk: 'Інтерактивна профкухня: плита, фритюрниця, пароконвектомат, холодильна камера, кольори дощок HACCP, 14 алергенів — з озвученням і тестом.',
    },
  },
  '/work-scenes/truck-cab': {
    name: { az: 'Yük maşını kabinəsi', de: 'Lkw-Fahrerhaus', en: 'Truck cab', ru: 'Кабина грузовика', tr: 'Tır kabini', uk: 'Кабіна вантажівки' },
    title: { az: 'Sürücü almancası: takoqraf, Fahrerkarte', de: 'Lkw-Deutsch: Tachograf, Fahrerkarte, Spiegel', en: 'Truck driver German: tachograph, driver card', ru: 'Немецкий для водителя: тахограф и карта', tr: 'Tır şoförü Almancası: takograf, sürücü kartı', uk: 'Німецька для водія: тахограф і картка водія' },
    description: {
      az: 'İnteraktiv yük maşını kabinəsi: Fahrerkarte, takoqraf işarələri, Retarder, Rampenspiegel, Maut-Box, AdBlue, Ladungssicherung — qaydalar və testlə.',
      de: 'Interaktives Lkw-Fahrerhaus: Fahrerkarte, Tachograf-Symbole, Retarder, Rampenspiegel, Maut-Box, AdBlue, Ladungssicherung — mit Regeln und Quiz.',
      en: 'An interactive truck cab: driver card, tachograph symbols, retarder, mirrors, toll box, AdBlue, load securing, rest times — with rules and a quiz.',
      ru: 'Интерактивная кабина грузовика: карта водителя, символы тахографа, ретардер, зеркала, Maut-Box, AdBlue, крепление груза — с правилами и тестом.',
      tr: 'Etkileşimli tır kabini: sürücü kartı, takograf sembolleri, retarder, aynalar, Maut-Box, AdBlue, yük güvenliği — kurallar ve testle.',
      uk: 'Інтерактивна кабіна вантажівки: картка водія, символи тахографа, ретардер, дзеркала, Maut-Box, AdBlue, кріплення вантажу — з правилами й тестом.',
    },
  },
  '/work-scenes/hospital-ward': {
    name: { az: 'Xəstəxana palatası', de: 'Krankenstation', en: 'Hospital ward', ru: 'Больничная палата', tr: 'Hastane servisi', uk: 'Лікарняна палата' },
    title: { az: 'Tibb bacıları üçün almanca: palata, qaydalar', de: 'Pflegedeutsch: Station, Hygiene, 6-R-Regel', en: 'German for nurses: ward, hygiene, 6-R rule', ru: 'Немецкий для медсестёр: палата, гигиена, 6 R', tr: 'Hemşireler için Almanca: servis, hijyen, 6-R', uk: 'Німецька для медсестер: палата, гігієна, 6 R' },
    description: {
      az: 'İnteraktiv palata: Perfusor, Infusion, ÜST-ün 5 əl gigiyenası anı, 6-R qaydası, Dekubitus və yıxılmanın qarşısı, Notfallwagen — tələffüz və testlə.',
      de: 'Interaktive Station: Perfusor, Infusion, 5 Momente der Händehygiene (WHO), 6-R-Regel, Dekubitus- und Sturzprophylaxe, Notfallwagen — mit Quiz.',
      en: 'An interactive ward: syringe pump, infusion, WHO 5 moments of hand hygiene, 6-R rule, pressure-ulcer and fall prevention — with audio and a quiz.',
      ru: 'Интерактивная палата: перфузор, капельница, 5 моментов гигиены рук ВОЗ, правило 6 R, пролежни и падения, реанимационная тележка — с тестом.',
      tr: 'Etkileşimli servis: perfüzör, infüzyon, DSÖ el hijyeninin 5 anı, 6-R kuralı, bası yarası ve düşme önleme, acil arabası — sesli ve testli.',
      uk: 'Інтерактивна палата: перфузор, крапельниця, 5 моментів гігієни рук ВООЗ, правило 6 R, пролежні й падіння, реанімаційний візок — з тестом.',
    },
  },
  '/work-scenes/construction-site': {
    name: { az: 'Tikinti sahəsi', de: 'Baustelle', en: 'Construction site', ru: 'Стройка', tr: 'Şantiye', uk: 'Будмайданчик' },
    title: { az: 'Tikinti almancası: dəbilqə, iskələ, qaydalar', de: 'Baustellendeutsch: Helm, Gerüst, Sicherheit', en: 'Construction German: helmet, scaffold, safety', ru: 'Немецкий на стройке: каска, леса, правила', tr: 'Şantiye Almancası: baret, iskele, güvenlik', uk: 'Німецька на будові: каска, риштування' },
    description: {
      az: 'İnteraktiv tikinti sahəsi: Helm, S3 ayaqqabı, Gerüst, Absturzsicherung, Bagger təhlükə zonası, kran işarələri, nərdivan qaydaları, FFP2 — testlə.',
      de: 'Interaktive Baustelle: Helm, S3-Schuhe, Gerüst, Absturzsicherung, Gefahrenbereich Bagger, Kranzeichen, Leiterregeln, Gehörschutz, FFP2 — mit Quiz.',
      en: 'An interactive construction site: helmet, S3 boots, scaffold, fall protection, excavator danger zone, crane signals, ladder rules, FFP2 — with a quiz.',
      ru: 'Интерактивная стройка: каска, обувь S3, леса, защита от падения, опасная зона экскаватора, сигналы крану, правила лестниц, FFP2 — с тестом.',
      tr: 'Etkileşimli şantiye: baret, S3 ayakkabı, iskele, düşme koruması, ekskavatör tehlike alanı, vinç işaretleri, merdiven kuralları, FFP2 — testli.',
      uk: 'Інтерактивний будмайданчик: каска, взуття S3, риштування, захист від падіння, небезпечна зона екскаватора, сигнали крану, FFP2 — з тестом.',
    },
  },
  '/work-scenes/electrical-panel': {
    name: { az: 'Elektrik lövhəsi', de: 'Sicherungskasten', en: 'Electrical panel', ru: 'Электрощит', tr: 'Elektrik panosu', uk: 'Електрощит' },
    title: { az: 'Elektrik almancası: FI, LS, 5 qayda', de: 'Elektro-Deutsch: FI, LS, 5 Sicherheitsregeln', en: 'Electrician German: RCD, MCB, 5 safety rules', ru: 'Немецкий электрика: УЗО, автомат, 5 правил', tr: 'Elektrikçi Almancası: RCD, sigorta, 5 kural', uk: 'Німецька електрика: ПЗВ, автомат, 5 правил' },
    description: {
      az: 'İnteraktiv elektrik lövhəsi: LS, FI/RCD, Hauptschalter, Zähler, kabel rəngləri, 5 Sicherheitsregeln, iki qütblü yoxlayıcı, Schutzklassen, IP — testlə.',
      de: 'Interaktiver Sicherungskasten: LS, FI/RCD, Hauptschalter, Zähler, Aderfarben, 5 Sicherheitsregeln, Spannungsprüfer, Schutzklassen, IP-Code — mit Quiz.',
      en: 'An interactive fuse box: MCB, RCD, main switch, meter, wire colours, the 5 safety rules, voltage tester, protection classes, IP codes — with a quiz.',
      ru: 'Интерактивный электрощит: автомат, УЗО, главный выключатель, счётчик, цвета жил, 5 правил безопасности, указатель, IP — с тестом.',
      tr: 'Etkileşimli elektrik panosu: sigorta, kaçak akım rölesi, ana şalter, sayaç, kablo renkleri, 5 güvenlik kuralı, test cihazı, IP — testli.',
      uk: 'Інтерактивний електрощит: автомат, ПЗВ, головний вимикач, лічильник, кольори жил, 5 правил безпеки, покажчик напруги, IP — з тестом.',
    },
  },
  '/residence-card-explained': {
    name: { az: 'Yaşayış kartı (eAT) izahlı', de: 'Aufenthaltstitel (eAT) erklärt', en: 'Residence card (eAT) explained', ru: 'Карта ВНЖ (eAT) с пояснениями', tr: 'Oturum kartı (eAT) açıklaması', uk: 'Картка посвідки (eAT) з поясненнями' },
    title: { az: 'Alman yaşayış kartı (eAT) izahlı', de: 'Aufenthaltstitel (eAT) erklärt: jedes Feld', en: 'German residence card (eAT) explained', ru: 'Карта ВНЖ Германии (eAT): все поля', tr: 'Alman oturum kartı (eAT) açıklaması', uk: 'Картка посвідки Німеччини (eAT)' },
    description: {
      az: 'Nümunə kartda eAT-ın hər sahəsi: icazənin növü və paraqrafı, etibarlılıq, qeydlər, CAN, MRZ, PIN məktubu, Zusatzblatt və uzatmadan əvvəl nə etməli.',
      de: 'Jedes Feld des eAT am Muster: Art und Paragraf, Gültigkeit, Anmerkungen, CAN, MRZ, PIN-Brief, Zusatzblatt und was vor der Verlängerung zu tun ist.',
      en: 'Every field of the German eAT on a specimen: permit type and §, validity, remarks, CAN, MRZ, PIN letter, Zusatzblatt and what to do before it expires.',
      ru: 'Каждое поле eAT на образце: вид разрешения и параграф, срок, примечания, CAN, MRZ, письмо с PIN, Zusatzblatt и что делать до окончания срока.',
      tr: 'Örnek kartta eAT’ın her alanı: izin türü ve paragraf, geçerlilik, notlar, CAN, MRZ, PIN mektubu, Zusatzblatt ve süre dolmadan yapılacaklar.',
      uk: 'Кожне поле eAT на зразку: вид дозволу й параграф, строк дії, примітки, CAN, MRZ, лист із PIN, Zusatzblatt і що робити до закінчення строку.',
    },
  },
  '/shortage-barometer': {
    name: { az: 'Kadr çatışmazlığı barometri', de: 'Engpass-Barometer', en: 'Skilled-shortage barometer', ru: 'Барометр дефицита кадров', tr: 'Eleman açığı barometresi', uk: 'Барометр дефіциту кадрів' },
    title: { az: 'Almaniyada kadr çatışmazlığı 2025: xəritə', de: 'Fachkräfteengpass 2025 nach Bundesland', en: 'Skilled shortage in Germany 2025 by state', ru: 'Дефицит кадров в Германии 2025 по землям', tr: 'Almanya’da eleman açığı 2025: eyaletler', uk: 'Дефіцит кадрів у Німеччині 2025: землі' },
    description: {
      az: 'BA Engpassanalyse 2025: tibb bacısı, aşpaz, sürücü, elektrik, SHK, IT və digər peşələr üçün çatışmazlıq — ölkə üzrə və federal ştatlar xəritəsində.',
      de: 'BA-Engpassanalyse 2025 für Pflege, Köche, Berufskraftfahrer, Elektriker, SHK, IT und mehr — bundesweit und als Karte der Bundesländer, mit Quellen.',
      en: 'BA shortage analysis 2025 for nursing, cooks, truck drivers, electricians, SHK, IT and more — nationally and on a map of the German states, with sources.',
      ru: 'Анализ дефицита BA 2025: медсёстры, повара, водители, электрики, SHK, IT и другие — по Германии и на карте федеральных земель, с источниками.',
      tr: 'BA eleman açığı analizi 2025: hemşire, aşçı, şoför, elektrikçi, SHK, BT ve diğerleri — ülke geneli ve eyalet haritasında, kaynaklarıyla.',
      uk: 'Аналіз дефіциту BA 2025: медсестри, кухарі, водії, електрики, SHK, IT та інші — по Німеччині й на карті федеральних земель, із джерелами.',
    },
  },
  '/which-city': {
    name: { az: 'Hansı şəhər sənə uyğundur?', de: 'Welche Stadt passt zu dir?', en: 'Which German city suits you?', ru: 'Какой город тебе подходит?', tr: 'Hangi şehir sana uygun?', uk: 'Яке місто тобі підходить?' },
    title: { az: 'Hansı alman şəhəri sənə uyğundur? Test', de: 'Welche deutsche Stadt passt zu dir? Quiz', en: 'Which German city suits you? Quiz', ru: 'Какой город Германии тебе подходит? Тест', tr: 'Hangi Alman şehri sana uygun? Test', uk: 'Яке місто Німеччини тобі підходить? Тест' },
    description: {
      az: '8 sual — iqlim, büdcə, peşə, nəqliyyat, azərbaycanlı icması və dil — və 14 alman şəhəri arasından sənin şəhərin, səbəbləri və paylaşıla bilən kartla.',
      de: '8 Fragen zu Klima, Budget, Beruf, Verkehr, Community und Sprache – und aus 14 deutschen Städten deine Stadt, mit Gründen und teilbarer Karte.',
      en: '8 questions on climate, budget, job, transport, community and language — your city out of 14 German cities, with reasons and a shareable card.',
      ru: '8 вопросов — климат, бюджет, профессия, транспорт, община и язык — и твой город из 14 городов Германии с объяснением и карточкой.',
      tr: 'İklim, bütçe, meslek, ulaşım, topluluk ve dil üzerine 8 soru — 14 Alman şehri arasından gerekçeleriyle senin şehrin ve paylaşılabilir kart.',
      uk: '8 запитань — клімат, бюджет, професія, транспорт, громада й мова — і твоє місто з 14 міст Німеччини з поясненням і карткою.',
    },
  },
  '/permanent-residence': {
    name: { az: 'Daimi yaşayış və vətəndaşlıq', de: 'Niederlassung & Einbürgerung', en: 'Permanent residence & citizenship', ru: 'ПМЖ и гражданство', tr: 'Süresiz oturum ve vatandaşlık', uk: 'ПМП і громадянство' },
    title: { az: 'Daimi yaşayış və vətəndaşlıq: nə vaxt?', de: 'Niederlassung & Einbürgerung: wann?', en: 'Permanent residence & citizenship: when?', ru: 'ПМЖ и гражданство Германии: когда? Расчёт', tr: 'Süresiz oturum ve vatandaşlık: ne zaman?', uk: 'ПМП і громадянство Німеччини: коли?' },
    description: {
      az: 'Mavi Kart, mütəxəssis, Ausbildung, Chancenkarte və ailə üçün Niederlassungserlaubnis və vətəndaşlığın ən tez tarixi — 2026 qaydaları, zaman xətti.',
      de: 'Frühester Termin für Niederlassungserlaubnis und Einbürgerung mit Blauer Karte, als Fachkraft, nach Ausbildung oder Chancenkarte – Rechtsstand 2026.',
      en: 'Earliest settlement permit and citizenship dates for Blue Card, skilled workers, Ausbildung, Chancenkarte and family — 2026 rules with a timeline.',
      ru: 'Самые ранние даты ПМЖ и гражданства Германии для Голубой карты, специалистов, Ausbildung, Chancenkarte и семьи — правила 2026 года.',
      tr: 'Mavi Kart, nitelikli işçi, Ausbildung, Chancenkarte ve aile için süresiz oturum ve vatandaşlığın en erken tarihi — 2026 kuralları.',
      uk: 'Найраніші дати ПМП і громадянства Німеччини для Блакитної карти, фахівців, Ausbildung, Chancenkarte та сім’ї — правила 2026 року.',
    },
  },
  '/apartment-viewing': {
    name: { az: 'Mənzilə baxış və anket', de: 'Wohnungsbesichtigung & Selbstauskunft', en: 'Apartment viewing & self-disclosure', ru: 'Осмотр квартиры и анкета', tr: 'Daire gezme ve kiracı beyanı', uk: 'Огляд квартири й анкета' },
    title: { az: 'Mənzilə baxış və kirayəçi anketi', de: 'Wohnungsbesichtigung & Selbstauskunft', en: 'Flat viewing & tenant self-disclosure', ru: 'Осмотр квартиры и анкета арендатора', tr: 'Daire gezme ve kiracı beyan formu', uk: 'Огляд квартири та анкета орендаря' },
    description: {
      az: 'Baxışı alman dilində məşq edin: Kaltmiete, Kaution, SCHUFA. Ev sahibi nəyi soruşa bilməz, fırıldaqlar və DSK-ya uyğun Mieterselbstauskunft PDF.',
      de: 'Besichtigung auf Deutsch üben: Kaltmiete, Kaution, SCHUFA. Was Vermieter nicht fragen dürfen, Betrugsmaschen und DSK-konforme Selbstauskunft als PDF.',
      en: 'Practise a German flat viewing: cold rent, deposit, SCHUFA. What landlords may not ask, scams to avoid and a DSK-compliant self-disclosure PDF.',
      ru: 'Тренировка осмотра на немецком: Kaltmiete, залог, SCHUFA. Что нельзя спрашивать арендодателю, мошенники и анкета Mieterselbstauskunft в PDF.',
      tr: 'Almanca daire görmeyi çalışın: soğuk kira, depozito, SCHUFA. Ev sahibinin soramayacakları, dolandırıcılık ve DSK uyumlu kiracı beyanı PDF.',
      uk: 'Тренування огляду німецькою: Kaltmiete, застава, SCHUFA. Що не можна питати орендодавцю, шахраї та анкета Mieterselbstauskunft у PDF.',
    },
  },
  '/send-money-home': {
    name: { az: 'Ailəyə pul kalkulyatoru', de: 'Geld für die Familie', en: 'Money for family calculator', ru: 'Калькулятор «Деньги семье»', tr: 'Aileye para hesaplayıcısı', uk: 'Калькулятор «Гроші родині»' },
    title: { az: 'Ailəyə nə qədər pul göndərə bilərəm?', de: 'Geld für die Familie: wie viel bleibt?', en: 'Money for family: how much to send home?', ru: 'Сколько денег отправлять семье?', tr: 'Aileye ne kadar para gönderebilirim?', uk: 'Скільки грошей надсилати родині?' },
    description: {
      az: 'Xalis maaş, şəhər və həyat tərzi: xərclərdən sonra hər ay evə nə qədər qalır, manatla, köçürmə xərcləri və Bakı qiymətləri ilə müqayisə.',
      de: 'Nettogehalt, Stadt und Lebensstil: Was monatlich für die Familie bleibt – in Manat, mit Überweisungskosten und Vergleich mit Preisen in Baku.',
      en: 'Net salary, city and lifestyle: what is left each month for your family — in manat, with transfer costs and a comparison with prices in Baku.',
      ru: 'Чистая зарплата, город и образ жизни: сколько остаётся семье каждый месяц — в манатах, с комиссиями за перевод и сравнением с ценами Баку.',
      tr: 'Net maaş, şehir ve yaşam tarzı: her ay ailenize ne kalır — manat olarak, transfer masrafları ve Bakü fiyatlarıyla karşılaştırmalı.',
      uk: 'Чиста зарплата, місто й спосіб життя: скільки лишається родині щомісяця — у манатах, з комісіями за переказ і порівнянням із цінами Баку.',
    },
  },
  '/five-years-in-germany': {
    name: { az: 'Almaniyada 5 il', de: '5 Jahre in Deutschland', en: '5 years in Germany', ru: '5 лет в Германии', tr: 'Almanya’da 5 yıl', uk: '5 років у Німеччині' },
    title: { az: 'Zaman maşını: Almaniyada 5 il', de: 'Zeitmaschine: 5 Jahre in Deutschland', en: 'Time machine: 5 years in Germany', ru: 'Машина времени: 5 лет в Германии', tr: 'Zaman makinesi: Almanya’da 5 yıl', uk: 'Машина часу: 5 років у Німеччині' },
    description: {
      az: 'Peşə, şəhər və alman dili: maaş, yığım, daimi yaşayış və vətəndaşlıq il-il, Azərbaycanda eyni sahə ilə müqayisədə. Fərziyyələri özünüz dəyişin.',
      de: 'Beruf, Stadt und Deutsch: Gehalt, Ersparnisse, Niederlassung und Einbürgerung Jahr für Jahr, verglichen mit Aserbaidschan. Annahmen selbst anpassen.',
      en: 'Profession, city and German: salary, savings, settlement permit and citizenship year by year, compared with Azerbaijan. Adjust every assumption.',
      ru: 'Профессия, город и немецкий: зарплата, сбережения, ПМЖ и гражданство по годам в сравнении с Азербайджаном. Все допущения можно менять.',
      tr: 'Meslek, şehir ve Almanca: maaş, birikim, süresiz oturum ve vatandaşlık yıl yıl, Azerbaycan ile karşılaştırmalı. Varsayımları siz ayarlayın.',
      uk: 'Професія, місто й німецька: зарплата, заощадження, ПМП і громадянство рік за роком порівняно з Азербайджаном. Усі припущення можна змінити.',
    },
  },
  '/germany-vs-other-countries': {
    name: { az: 'Almaniya və digər ölkələr', de: 'Deutschland im Ländervergleich', en: 'Germany vs other countries', ru: 'Германия и другие страны', tr: 'Almanya ve diğer ülkeler', uk: 'Німеччина та інші країни' },
    title: { az: 'Almaniya, Polşa, Çexiya, UK, Avstriya', de: 'Deutschland vs. Polen, Tschechien, Österreich', en: 'Germany vs Poland, Czechia, UK, Austria', ru: 'Германия, Польша, Чехия, UK, Австрия', tr: 'Almanya, Polonya, Çekya, UK, Avusturya', uk: 'Німеччина, Польща, Чехія, UK, Австрія' },
    description: {
      az: 'Azərbaycanlı işçi üçün maaş, minimum əmək haqqı, viza yolu, rüsumlar, dil, ailə, daimi yaşayış və vətəndaşlıq — rəsmi mənbələrlə müqayisə 2026.',
      de: 'Für Fachkräfte aus Aserbaidschan: Gehalt, Mindestlohn, Visumweg, Gebühren, Sprache, Familie, Daueraufenthalt und Einbürgerung im Vergleich 2026.',
      en: 'For workers from Azerbaijan: pay, minimum wage, visa route, fees, language, family, permanent residence and citizenship compared, 2026, with sources.',
      ru: 'Для работника из Азербайджана: зарплата, МРОТ, путь к визе, сборы, язык, семья, ПМЖ и гражданство — сравнение 2026 с источниками.',
      tr: 'Azerbaycanlı çalışan için maaş, asgari ücret, vize yolu, ücretler, dil, aile, kalıcı oturum ve vatandaşlık — kaynaklı karşılaştırma 2026.',
      uk: 'Для працівника з Азербайджану: зарплата, мінімалка, шлях до візи, збори, мова, родина, ПМП і громадянство — порівняння 2026 з джерелами.',
    },
  },
  '/visa-refusal': {
    name: { az: 'Vizadan imtina', de: 'Visum abgelehnt', en: 'Visa refusal', ru: 'Отказ в визе', tr: 'Vize reddi', uk: 'Відмова у візі' },
    title: { az: 'Alman vizasından imtina: indi nə etməli?', de: 'Visum abgelehnt: Gründe und was jetzt?', en: 'German visa refused: reasons and next steps', ru: 'Отказ в немецкой визе: что делать?', tr: 'Almanya vizesi reddi: şimdi ne yapmalı?', uk: 'Відмова в німецькій візі: що робити?' },
    description: {
      az: 'Milli vizadan imtinanın səbəbləri, remonstrasiyanın ləğvi (2025), yeni müraciət və Berlin məhkəməsi. Alman dilində müşayiət məktubu yaradın.',
      de: 'Häufige Ablehnungsgründe beim nationalen Visum, Ende der Remonstration (2025), neuer Antrag oder Klage in Berlin. Mit Anschreiben-Generator.',
      en: 'Common national visa refusal reasons, the end of remonstration (2025), a new application or a lawsuit in Berlin. With a German cover letter generator.',
      ru: 'Частые причины отказа в национальной визе, отмена ремонстрации (2025), новая подача или иск в Берлине. Генератор письма на немецком.',
      tr: 'Ulusal vize retlerinin sık nedenleri, itirazın kaldırılması (2025), yeni başvuru veya Berlin’de dava. Almanca ön yazı oluşturucu ile.',
      uk: 'Часті причини відмови в національній візі, скасування ремонстрації (2025), нова подача або позов у Берліні. Генератор листа німецькою.',
    },
  },
  '/visa-document-checklist': {
    name: { az: 'Viza sənədləri siyahısı', de: 'Visum-Checkliste', en: 'Visa document checklist', ru: 'Чек-лист документов на визу', tr: 'Vize belge listesi', uk: 'Чек-лист документів на візу' },
    title: { az: 'Alman vizası üçün sənəd siyahısı', de: 'Checkliste: Unterlagen fürs Visum', en: 'German visa document checklist', ru: 'Документы на визу в Германию: чек-лист', tr: 'Almanya vizesi belge kontrol listesi', uk: 'Документи на візу до Німеччини' },
    description: {
      az: 'Viza növü və peşəyə görə Bakıdakı Almaniya səfirliyi üçün sənəd siyahısı: mütəxəssis, Mavi Kart, Ausbildung, Chancenkarte, ailə, təhsil. Çap / PDF.',
      de: 'Unterlagenliste für die Botschaft Baku nach Visumart und Beruf: Fachkraft, Blaue Karte, Ausbildung, Chancenkarte, Familie, Studium. Drucken / PDF.',
      en: 'Document list for the German Embassy Baku by visa type and profession: skilled worker, Blue Card, Ausbildung, Chancenkarte, family, study. Print / PDF.',
      ru: 'Список документов для посольства Германии в Баку по типу визы и профессии: специалист, Голубая карта, Ausbildung, семья, учёба. Печать / PDF.',
      tr: 'Bakü Almanya Büyükelçiliği için vize türü ve mesleğe göre belge listesi: nitelikli işçi, Mavi Kart, Ausbildung, aile, öğrenim. Yazdır / PDF.',
      uk: 'Список документів для посольства Німеччини в Баку за типом візи та професією: фахівець, Блакитна карта, Ausbildung, родина, навчання. PDF.',
    },
  },
  '/driving-licence-germany': {
    name: { az: 'Sürücülük vəsiqəsi Almaniyada', de: 'Führerschein in Deutschland', en: 'Driving licence in Germany', ru: 'Водительские права в Германии', tr: 'Almanya’da ehliyet', uk: 'Посвідчення водія в Німеччині' },
    title: { az: 'Azərbaycan sürücülük vəsiqəsi Almaniyada', de: 'Aserbaidschanischer Führerschein: Umschreiben', en: 'Azerbaijani driving licence in Germany', ru: 'Азербайджанские права в Германии: замена', tr: 'Azerbaycan ehliyeti Almanya’da', uk: 'Азербайджанське посвідчення водія в Німеччині' },
    description: {
      az: 'Azərbaycan vəsiqəsi ilə Almaniyada 6 ay, sonra imtahanla alman vəsiqəsi: addımlar, sənədlər, xərclər və C/CE yük maşını sürücüləri üçün tələblər.',
      de: '6 Monate mit dem aserbaidschanischen Führerschein, dann Umschreibung mit Prüfung: Schritte, Unterlagen, Kosten und was Lkw-Fahrer (C/CE) brauchen.',
      en: '6 months on an Azerbaijani licence, then a German one with tests: steps, documents, costs and what C/CE truck drivers need.',
      ru: '6 месяцев с азербайджанскими правами, затем немецкие с экзаменами: шаги, документы, расходы и что нужно водителям грузовиков C/CE.',
      tr: 'Azerbaycan ehliyetiyle 6 ay, ardından sınavla Alman ehliyeti: adımlar, belgeler, maliyetler ve C/CE tır şoförleri için gerekenler.',
      uk: '6 місяців з азербайджанським посвідченням, далі німецьке з іспитами: кроки, документи, витрати й вимоги для водіїв вантажівок C/CE.',
    },
  },
  '/family-reunification-check': {
    name: { az: 'Ailə birləşməsi yoxlaması', de: 'Familiennachzug-Check', en: 'Family reunification check', ru: 'Проверка воссоединения семьи', tr: 'Aile birleşimi kontrolü', uk: 'Перевірка возз’єднання сім’ї' },
    title: { az: 'Ailəmi Almaniyaya gətirə bilərəmmi? Yoxlama', de: 'Familiennachzug: Kann meine Familie kommen?', en: 'Can I bring my family to Germany? Free check', ru: 'Могу ли я перевезти семью в Германию?', tr: 'Ailemi Almanya’ya getirebilir miyim? Kontrol', uk: 'Чи можу я перевезти сім’ю до Німеччини?' },
    description: {
      az: 'Ailə birləşməsi üçün pulsuz yoxlama: icazə növü, gəlir, mənzil, A1 və uşaqların yaşı — kim indi, kim sonra gələ bilər və hansı sənədlər lazımdır.',
      de: 'Gratis-Check Familiennachzug: Titel, Einkommen, Wohnraum, A1 und Alter der Kinder – wer jetzt oder später kommen kann und welche Unterlagen nötig sind.',
      en: 'Free family reunification self-check: permit, income, flat, A1 and children’s ages — who can join you now or later and which documents you need.',
      ru: 'Бесплатная проверка воссоединения семьи: ВНЖ, доход, жильё, A1 и возраст детей — кто может приехать сейчас или позже и какие нужны документы.',
      tr: 'Ücretsiz aile birleşimi kontrolü: oturum, gelir, konut, A1 ve çocukların yaşı — kim şimdi, kim sonra gelebilir ve hangi belgeler gerekli.',
      uk: 'Безкоштовна перевірка возз’єднання сім’ї: дозвіл, дохід, житло, A1 і вік дітей — хто може приїхати зараз чи пізніше та які потрібні документи.',
    },
  },
  // Learning games (client pages/games): static pages, no API besides the CBAR rate on /price-game.
  '/german-simulator': {
    name: { az: 'Bürgeramt simulyatoru', de: 'Bürgeramt-Simulator', en: 'Bürgeramt simulator', ru: 'Симулятор бюргерамта', tr: 'Bürgeramt simülatörü', uk: 'Симулятор бюргерамту' },
    title: { az: 'Bürgeramt simulyatoru: almanca dialoqlar', de: 'Bürgeramt-Simulator: Deutsch im Amt üben', en: 'Bürgeramt simulator: practise German', ru: 'Симулятор бюргерамта: немецкий в диалогах', tr: 'Bürgeramt simülatörü: Almanca diyalog', uk: 'Симулятор бюргерамту: німецька в діалогах' },
    description: {
      az: 'Almanca dialoq məşqi: Bürgeramt-da qeydiyyat, bank hesabı, həkimə zəng, ilk iş günü və istilik problemi. Cavab seçin, əsas ifadələri öyrənin.',
      de: 'Gespräche auf Deutsch üben: Anmeldung, Girokonto, Arzttermin am Telefon, erster Arbeitstag und kaputte Heizung. Antworten wählen, Ausdrücke lernen.',
      en: 'Practise German dialogues: Anmeldung, a bank account, a doctor’s appointment by phone, your first workday and broken heating. Pick replies, learn phrases.',
      ru: 'Тренируйте диалоги на немецком: регистрация, счёт в банке, запись к врачу по телефону, первый рабочий день и отопление. Выбирайте ответы, учите фразы.',
      tr: 'Almanca diyalog alıştırması: ikamet kaydı, banka hesabı, telefonla doktor randevusu, ilk iş günü ve bozuk kalorifer. Cevap seçin, önemli ifadeleri öğrenin.',
      uk: 'Тренуйте діалоги німецькою: реєстрація, рахунок у банку, запис до лікаря телефоном, перший робочий день і опалення. Обирайте відповіді, вчіть фрази.',
    },
  },
  '/pronunciation': {
    name: { az: 'Tələffüz məşqçisi', de: 'Aussprachetrainer', en: 'Pronunciation trainer', ru: 'Тренажёр произношения', tr: 'Telaffuz antrenörü', uk: 'Тренажер вимови' },
    title: { az: 'Alman dili tələffüz məşqçisi', de: 'Aussprachetrainer Deutsch: online üben', en: 'German pronunciation trainer online', ru: 'Тренажёр немецкого произношения', tr: 'Almanca telaffuz antrenörü', uk: 'Тренажер німецької вимови' },
    description: {
      az: 'Alman cümlələrini dinləyin, mikrofona deyin və hansı sözlərin düz tanındığını görün: A1–B1, gündəlik həyat, qulluq, tikinti, sürücülər və restoran.',
      de: 'Deutsche Sätze anhören, nachsprechen und sehen, welche Wörter erkannt wurden: A1–B1, Alltag, Amt, Pflege, Bau, Fahrer, Gastronomie und Elektro.',
      en: 'Listen to German sentences, say them and see which words were recognised: A1–B1, everyday life, offices, care, construction, drivers and hospitality.',
      ru: 'Слушайте немецкие фразы, произносите их и смотрите, какие слова распознаны: A1–B1, быт, ведомства, уход, стройка, водители и рестораны.',
      tr: 'Almanca cümleleri dinleyin, söyleyin ve hangi kelimelerin tanındığını görün: A1–B1, günlük hayat, daireler, bakım, inşaat, şoförler ve restoran.',
      uk: 'Слухайте німецькі речення, промовляйте їх і дивіться, які слова розпізнано: A1–B1, побут, установи, догляд, будівництво, водії та ресторани.',
    },
  },
  '/price-game': {
    name: { az: 'Qiyməti tap', de: 'Preis-Raten', en: 'Guess the price', ru: 'Угадай цену', tr: 'Fiyatı tahmin et', uk: 'Вгадай ціну' },
    title: { az: 'Qiyməti tap: Almaniyada nə neçəyədir?', de: 'Preis-Raten: Was kostet das in Deutschland?', en: 'Guess the price: what things cost in Germany', ru: 'Угадай цену: сколько стоит в Германии?', tr: 'Fiyatı tahmin et: Almanya’da ne kadar?', uk: 'Вгадай ціну: скільки коштує в Німеччині?' },
    description: {
      az: 'Almaniyada çörək, süd, Döner, kirayə, benzin və Deutschlandticket neçəyədir? 10 raundluq oyun, 2026 qiymətləri, mənbələr və manatla ekvivalent.',
      de: 'Was kosten Brot, Milch, Döner, Miete, Benzin und das Deutschlandticket? 10 Runden Preis-Raten mit Preisen von 2026, Quellen und Umrechnung in Manat.',
      en: 'What do bread, milk, a döner, rent, petrol and the Deutschlandticket cost in Germany? A 10-round game with 2026 prices, sources and manat equivalents.',
      ru: 'Сколько стоят хлеб, молоко, дёнер, аренда, бензин и Deutschlandticket в Германии? Игра из 10 раундов: цены 2026 года, источники и перевод в манаты.',
      tr: 'Almanya’da ekmek, süt, döner, kira, benzin ve Deutschlandticket ne kadar? 2026 fiyatları, kaynaklar ve manat karşılığıyla 10 turluk oyun.',
      uk: 'Скільки коштують хліб, молоко, дьонер, оренда, бензин і Deutschlandticket у Німеччині? Гра з 10 раундів: ціни 2026 року, джерела та манати.',
    },
  },
  '/traffic-signs': {
    name: { az: 'Alman yol nişanları', de: 'Verkehrszeichen-Test', en: 'German traffic signs', ru: 'Дорожные знаки Германии', tr: 'Alman trafik işaretleri', uk: 'Дорожні знаки Німеччини' },
    title: { az: 'Alman yol nişanları: test və öyrənmə', de: 'Verkehrszeichen lernen: Test mit 30 Fragen', en: 'German traffic signs: learn and test', ru: 'Дорожные знаки Германии: учить и тест', tr: 'Alman trafik işaretleri: öğren ve sına', uk: 'Дорожні знаки Німеччини: вивчення і тест' },
    description: {
      az: 'Ən vacib alman yol nişanları (StVO): xəbərdarlıq, qadağa, üstünlük və məlumat nişanları izahla, 30 suallıq imtahan və səhvlərin təhlili.',
      de: 'Die wichtigsten Verkehrszeichen der StVO: Gefahr-, Vorschrift-, Vorfahrt- und Richtzeichen mit Erklärung, Prüfung mit 30 Fragen und Fehleranalyse.',
      en: 'The key German StVO traffic signs: warning, regulatory, priority and information signs explained, a 30-question exam and a review of your mistakes.',
      ru: 'Главные дорожные знаки Германии (StVO): предупреждающие, запрещающие, знаки приоритета и информационные с пояснениями, экзамен из 30 вопросов.',
      tr: 'En önemli Alman trafik işaretleri (StVO): uyarı, yasak, öncelik ve bilgi işaretleri açıklamalı, 30 soruluk sınav ve hata analizi.',
      uk: 'Найважливіші дорожні знаки Німеччини (StVO): попереджувальні, заборонні, знаки пріоритету й інформаційні з поясненнями, іспит із 30 питань.',
    },
  },
  '/waste-sorting': {
    name: { az: 'Zibili çeşidlə', de: 'Mülltrennung-Spiel', en: 'Waste sorting game', ru: 'Сортировка мусора', tr: 'Atık ayrıştırma oyunu', uk: 'Сортування сміття' },
    title: { az: 'Almaniyada zibil çeşidləmə: oyun', de: 'Mülltrennung lernen: das Spiel', en: 'Waste sorting in Germany: the game', ru: 'Сортировка мусора в Германии: игра', tr: 'Almanya’da atık ayrıştırma: oyun', uk: 'Сортування сміття в Німеччині: гра' },
    description: {
      az: 'Gelber Sack, Papier, Bio, Restmüll, Glas, Pfand və ya Wertstoffhof? 60-dan çox əşya, çətin hallar (pizza qutusu, çek, batareya) izahla, taymer və xal.',
      de: 'Gelber Sack, Papier, Bio, Restmüll, Glas, Pfand oder Wertstoffhof? Über 60 Dinge mit Erklärung, knifflige Fälle wie Pizzakarton, Kassenbon und Batterie.',
      en: 'Yellow bag, paper, bio, residual waste, glass, Pfand or recycling centre? 60+ items explained, tricky cases like pizza boxes, receipts and batteries.',
      ru: 'Жёлтый мешок, бумага, био, остаточный мусор, стекло, Pfand или пункт приёма? Более 60 предметов с пояснениями: коробка от пиццы, чеки, батарейки.',
      tr: 'Sarı torba, kâğıt, bio, karışık atık, cam, Pfand ya da geri dönüşüm merkezi? 60’tan fazla eşya açıklamalı: pizza kutusu, fiş, pil gibi zor durumlar.',
      uk: 'Жовтий мішок, папір, біо, залишкове сміття, скло, Pfand чи пункт прийому? Понад 60 предметів із поясненнями: коробка з-під піци, чеки, батарейки.',
    },
  },
  // Virtual German street + street games (client pages/games/GermanStreet, TicketMachine, SupermarketGame; lib/games/street|ticket|supermarket): static, no API.
  '/german-street': {
    name: { az: 'Virtual alman küçəsi', de: 'Virtuelle deutsche Straße', en: 'Virtual German street', ru: 'Виртуальная немецкая улица', tr: 'Sanal Alman sokağı', uk: 'Віртуальна німецька вулиця' },
    title: { az: 'Virtual alman küçəsi: gündəlik həyat məşqi', de: 'Virtuelle deutsche Straße: Alltag üben', en: 'Virtual German street: practise daily life', ru: 'Немецкая улица: тренажёр быта', tr: 'Sanal Alman sokağı: günlük hayatı çalış', uk: 'Німецька вулиця: тренажер побуту' },
    description: {
      az: 'İnteraktiv alman küçəsi: Bürgeramt, bank, vağzal, supermarket, aptek və həkim. Binaya daxil olun: alman sözü səslə, izah və uyğun oyun və ya dialoq.',
      de: 'Interaktive deutsche Straße: Bürgeramt, Bank, Bahnhof, Supermarkt, Apotheke und Arzt. Hineingehen: Wort mit Audio, Erklärung und passendes Spiel.',
      en: 'An interactive German street: Bürgeramt, bank, station, supermarket, pharmacy and doctor. Step inside for the German word with audio and a matching game.',
      ru: 'Интерактивная немецкая улица: Bürgeramt, банк, вокзал, супермаркет, аптека и врач. Заходите: слово с озвучкой, пояснение и подходящая игра.',
      tr: 'Etkileşimli Alman sokağı: Bürgeramt, banka, istasyon, süpermarket, eczane ve doktor. İçeri girin: sesli Almanca kelime, açıklama ve ilgili oyun.',
      uk: 'Інтерактивна німецька вулиця: Bürgeramt, банк, вокзал, супермаркет, аптека й лікар. Заходьте: слово з озвученням, пояснення й відповідна гра.',
    },
  },
  '/ticket-machine': {
    name: { az: 'Bilet avtomatı simulyatoru', de: 'Fahrkartenautomat-Simulator', en: 'Ticket machine simulator', ru: 'Симулятор билетного автомата', tr: 'Bilet otomatı simülatörü', uk: 'Симулятор квиткового автомата' },
    title: { az: 'Almaniyada bilet avtomatı: simulyator', de: 'Fahrkartenautomat üben: Simulator', en: 'German ticket machine simulator', ru: 'Билетный автомат в Германии: симулятор', tr: 'Almanya’da bilet otomatı: simülatör', uk: 'Квитковий автомат у Німеччині: симулятор' },
    description: {
      az: 'Alman bilet avtomatında məşq: təyinat, AB/ABC zonası, gündəlik və qrup bileti, ödəniş və kompostlama. Tapşırıqlar, xal və 60 € cərimənin izahı.',
      de: 'Fahrkartenkauf üben: Ziel, Tarifzone AB/ABC, Tages- und Gruppenkarte, Bezahlen und Entwerten. Aufgaben mit Punkten und das 60-€-Bußgeld erklärt.',
      en: 'Practise a German ticket machine: destination, zones AB/ABC, day and group tickets, payment and validation. Scored tasks and the €60 penalty explained.',
      ru: 'Тренажёр немецкого билетного автомата: цель, зоны AB/ABC, дневной и групповой билет, оплата и компостирование. Задания и штраф 60 €.',
      tr: 'Alman bilet otomatında pratik: varış yeri, AB/ABC bölgeleri, günlük ve grup bileti, ödeme ve damgalama. Puanlı görevler ve 60 € ceza.',
      uk: 'Тренажер німецького квиткового автомата: мета, зони AB/ABC, денний і груповий квиток, оплата й компостування. Завдання та штраф 60 €.',
    },
  },
  '/supermarket-game': {
    name: { az: 'Supermarket oyunu', de: 'Supermarkt-Spiel', en: 'Supermarket game', ru: 'Игра «Супермаркет»', tr: 'Süpermarket oyunu', uk: 'Гра «Супермаркет»' },
    title: { az: 'Alman supermarketi: alış-veriş oyunu', de: 'Einkaufen in Deutschland: Supermarkt-Spiel', en: 'German supermarket: the shopping game', ru: 'Немецкий супермаркет: игра', tr: 'Alman süpermarketi: alışveriş oyunu', uk: 'Німецький супермаркет: гра' },
    description: {
      az: 'Siyahı ilə alman supermarketində alış-veriş: Quark, Sahne, Mehl Type 405, Sprudel. Pfand avtomatı, “Tüte?” sualı, kart və ya nağd, ƏDV ilə çek.',
      de: 'Mit Einkaufszettel durch den Supermarkt: Quark, Sahne, Mehl Type 405, Sprudel. Pfandautomat, „Tüte?“, Karte oder bar und der Kassenbon mit MwSt.',
      en: 'Shop a German supermarket from a list: Quark, Sahne, Mehl Type 405, Sprudel. The Pfand machine, “Tüte?”, card or cash and the receipt with VAT.',
      ru: 'Покупки в немецком супермаркете по списку: Quark, Sahne, Mehl Type 405, Sprudel. Автомат Pfand, «Tüte?», карта или наличные и чек с НДС.',
      tr: 'Listeyle Alman süpermarketinde alışveriş: Quark, Sahne, Mehl Type 405, Sprudel. Pfand otomatı, “Tüte?”, kart ya da nakit ve KDV’li fiş.',
      uk: 'Покупки в німецькому супермаркеті за списком: Quark, Sahne, Mehl Type 405, Sprudel. Автомат Pfand, «Tüte?», картка чи готівка та чек із ПДВ.',
    },
  },
  // German mock exams + level self-assessment (client pages/tools/GermanMockExam, GermanLevelSelf; lib/germanExam): static, no API.
  '/german-mock-exam': {
    name: { az: 'Alman dili sınaq imtahanı', de: 'Deutsch-Übungsprüfung', en: 'German mock exam', ru: 'Пробный экзамен по немецкому', tr: 'Almanca deneme sınavı', uk: 'Пробний іспит з німецької' },
    title: { az: 'Alman dili sınaq imtahanı A1 və B1', de: 'Deutsch-Übungsprüfung A1 und B1', en: 'German mock exam A1 and B1', ru: 'Пробный экзамен по немецкому A1 и B1', tr: 'Almanca deneme sınavı A1 ve B1', uk: 'Пробний іспит з німецької A1 і B1' },
    description: {
      az: 'Goethe-Zertifikat A1 və B1 formatında pulsuz sınaq testləri: dinləmə, oxu, yazı və danışıq — taymer, bal, nümunə cavablar və səhvlərin izahı ilə.',
      de: 'Kostenlose Übungstests im Format Goethe-Zertifikat A1 und B1: Hören, Lesen, Schreiben, Sprechen mit Timer, Punkten, Musterlösungen und Erklärungen.',
      en: 'Free practice tests in the Goethe-Zertifikat A1 and B1 format: listening, reading, writing and speaking with timer, scores, model answers and explanations.',
      ru: 'Бесплатные пробные тесты в формате Goethe-Zertifikat A1 и B1: аудирование, чтение, письмо и говорение с таймером, баллами и разбором ошибок.',
      tr: 'Goethe-Zertifikat A1 ve B1 formatında ücretsiz deneme sınavları: süre, puan, örnek cevaplar ve açıklamalarla dinleme, okuma, yazma ve konuşma.',
      uk: 'Безкоштовні пробні тести у форматі Goethe-Zertifikat A1 і B1: аудіювання, читання, письмо й говоріння з таймером, балами та розбором помилок.',
    },
  },
  '/german-mock-exam/a1': {
    name: { az: 'A1 sınaq imtahanı', de: 'Übungsprüfung A1', en: 'A1 mock exam', ru: 'Пробный экзамен A1', tr: 'A1 deneme sınavı', uk: 'Пробний іспит A1' },
    title: { az: 'Alman dili A1 sınaq imtahanı', de: 'Übungsprüfung Deutsch A1 (Start Deutsch 1)', en: 'German A1 mock exam (Start Deutsch 1)', ru: 'Пробный экзамен по немецкому A1', tr: 'Almanca A1 deneme sınavı', uk: 'Пробний іспит з німецької A1' },
    description: {
      az: 'Start Deutsch 1 quruluşunda pulsuz A1 sınaq testi: dinləmə (səs), oxu, form və qısa mesaj, danışıq kartları. Avtomatik bal, 60/100 keçid həddi.',
      de: 'Kostenloser A1-Übungstest im Aufbau von Start Deutsch 1: Hören mit Audio, Lesen, Formular und Kurznachricht, Sprechkarten. Bewertung mit 60/100.',
      en: 'Free A1 practice test in the Start Deutsch 1 structure: listening with audio, reading, a form and a short message, speaking cards. Pass mark 60/100.',
      ru: 'Бесплатный пробный тест A1 в формате Start Deutsch 1: аудирование, чтение, анкета и короткое сообщение, карточки для говорения. Порог 60/100.',
      tr: 'Start Deutsch 1 yapısında ücretsiz A1 deneme sınavı: sesli dinleme, okuma, form ve kısa mesaj, konuşma kartları. 60/100 geçme puanıyla.',
      uk: 'Безкоштовний пробний тест A1 у форматі Start Deutsch 1: аудіювання, читання, анкета й коротке повідомлення, картки для говоріння. Поріг 60/100.',
    },
  },
  '/german-mock-exam/b1': {
    name: { az: 'B1 sınaq imtahanı', de: 'Übungsprüfung B1', en: 'B1 mock exam', ru: 'Пробный экзамен B1', tr: 'B1 deneme sınavı', uk: 'Пробний іспит B1' },
    title: { az: 'Alman dili B1 sınaq imtahanı', de: 'Übungsprüfung Deutsch B1 online', en: 'German B1 mock exam online', ru: 'Пробный экзамен по немецкому B1', tr: 'Almanca B1 deneme sınavı', uk: 'Пробний іспит з німецької B1' },
    description: {
      az: 'Goethe-Zertifikat B1 quruluşunda pulsuz sınaq testi: 4 modul, taymer, avtomatik dinləmə və oxu balı, e-poçt və təqdimat üçün nümunə cavablar.',
      de: 'Kostenloser B1-Übungstest im Aufbau des Goethe-Zertifikats: 4 Module mit Timer, automatische Wertung für Hören und Lesen, Musterlösungen für Schreiben.',
      en: 'Free B1 practice test in the Goethe-Zertifikat structure: 4 modules with timer, automatic scoring for listening and reading, model answers for writing.',
      ru: 'Бесплатный пробный тест B1 в формате Goethe-Zertifikat: 4 модуля с таймером, автопроверка аудирования и чтения, образцы письма и презентации.',
      tr: 'Goethe-Zertifikat yapısında ücretsiz B1 deneme sınavı: süreli 4 modül, dinleme ve okumada otomatik puan, yazma ve sunum için örnek cevaplar.',
      uk: 'Безкоштовний пробний тест B1 у форматі Goethe-Zertifikat: 4 модулі з таймером, автоперевірка аудіювання й читання, зразки листів і презентації.',
    },
  },
  '/german-level-test-self': {
    name: { az: 'Alman dili səviyyə testi', de: 'Deutsch-Niveau-Selbsttest', en: 'German level self-assessment', ru: 'Самооценка уровня немецкого', tr: 'Almanca seviye öz değerlendirmesi', uk: 'Самооцінка рівня німецької' },
    title: { az: 'Alman dili səviyyəm nədir? Özünüyoxlama', de: 'Welches Deutschniveau habe ich?', en: 'What is my German level? Self-test', ru: 'Какой у меня уровень немецкого?', tr: 'Almanca seviyem ne? Öz değerlendirme', uk: 'Який у мене рівень німецької?' },
    description: {
      az: 'CEFR “bacarıram” ifadələri ilə dinləmə, oxu, danışıq və yazı üzrə A1–B2 səviyyənizi təxmin edin və növbəti səviyyə üçün həftəlik öyrənmə planı alın.',
      de: 'Schätzen Sie Ihr Niveau A1–B2 in Hören, Lesen, Sprechen und Schreiben mit GER-Kann-Beschreibungen und erhalten Sie einen Wochenplan zum nächsten Niveau.',
      en: 'Estimate your A1–B2 level in listening, reading, speaking and writing with CEFR “can do” statements and get a week-by-week plan to the next level.',
      ru: 'Оцените свой уровень A1–B2 по аудированию, чтению, говорению и письму по шкале CEFR и получите понедельный план до следующего уровня.',
      tr: 'CEFR “yapabilirim” ifadeleriyle dinleme, okuma, konuşma ve yazmada A1–B2 seviyenizi tahmin edin, sonraki seviye için haftalık plan alın.',
      uk: 'Оцініть свій рівень A1–B2 з аудіювання, читання, говоріння та письма за шкалою CEFR і отримайте потижневий план до наступного рівня.',
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
  '/phrase-of-the-day': {
    name: { az: 'Günün alman ifadəsi', de: 'Deutscher Satz des Tages', en: 'German phrase of the day', ru: 'Немецкая фраза дня', tr: 'Günün Almanca ifadesi', uk: 'Німецька фраза дня' },
    title: { az: 'Günün alman ifadəsi: tərcümə və oxunuş', de: 'Deutscher Satz des Tages mit Übersetzung', en: 'German phrase of the day with translation', ru: 'Немецкая фраза дня с переводом', tr: 'Günün Almanca ifadesi ve çevirisi', uk: 'Німецька фраза дня з перекладом' },
    description: {
      az: 'Hər gün Almaniyada iş və gündəlik həyat üçün bir sadə alman ifadəsi: azərbaycanca tərcümə, oxunuş və dinləmə. Son 30 günün ifadələri də buradadır.',
      de: 'Jeden Tag ein einfacher deutscher Satz für Arbeit und Alltag: mit Übersetzung ins Aserbaidschanische, Russische und Englische, Aussprache und Archiv.',
      en: 'One simple German phrase a day for work and everyday life in Germany, with translation, pronunciation help and audio, plus the phrases of the last 30 days.',
      ru: 'Каждый день — простая немецкая фраза для работы и жизни в Германии: перевод, произношение русскими буквами, озвучка и фразы последних 30 дней.',
      tr: 'Her gün Almanya\'da iş ve günlük yaşam için basit bir Almanca ifade: Türkçe çeviri, okunuş ve sesli dinleme, ayrıca son 30 günün ifadeleri.',
      uk: 'Щодня — проста німецька фраза для роботи й життя в Німеччині: переклад українською, вимова, озвучення та фрази за останні 30 днів.',
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
  // Public vacancy API for partners (docs; the API itself: /api/public/v1, server/src/routes/publicApi.ts).
  '/developers': {
    name: { az: 'Tərtibatçılar üçün API', de: 'Entwickler-API', en: 'Developer API', ru: 'API для разработчиков', tr: 'Geliştirici API', uk: 'API для розробників' },
    title: {
      az: 'Vakansiya API-si: tərəfdaşlar üçün sənədlər',
      de: 'Stellen-API für Partner: Dokumentation',
      en: 'Vacancy API for partners: documentation',
      ru: 'API вакансий для партнёров: документация',
      tr: 'Ortaklar için iş ilanı API: belgeler',
      uk: 'API вакансій для партнерів: документація',
    },
    description: {
      az: 'Kolleclər, dil məktəbləri və tərəfdaşlar üçün Triad Vision vakansiyalarının JSON API-si: açar, limitlər, filtrlər və müraciət linki.',
      de: 'JSON-API der Triad-Vision-Stellen für Partner, Schulen und Sprachschulen: API-Schlüssel, Limits, Filter und Bewerbungslink mit Zuordnung.',
      en: 'JSON API of Triad Vision vacancies for partners, colleges and language schools: API keys, rate limits, filters and attributed apply links.',
      ru: 'JSON API вакансий Triad Vision для партнёров, колледжей и языковых школ: ключи, лимиты, фильтры и ссылка на отклик с атрибуцией.',
      tr: 'Ortaklar, kolejler ve dil okulları için Triad Vision iş ilanı JSON API: anahtarlar, limitler, filtreler ve başvuru bağlantısı.',
      uk: 'JSON API вакансій Triad Vision для партнерів, коледжів і мовних шкіл: API-ключі, ліміти запитів, фільтри та посилання на відгук.',
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
  // Almaniya iş bazası (/jobs/germany): German jobs + Ausbildung from free job APIs (lib/germanyJobs), "apply via Triad Vision", BA Jobbörse link.
  // The landing page (our own intro + the form) is indexable; the result list is third-party content: noindex.
  '/jobs/germany': {
    name: { az: 'Almaniya iş bazası', de: 'Jobbörse Deutschland', en: 'Germany job search', ru: 'Поиск работы в Германии', tr: 'Almanya iş arama', uk: 'Пошук роботи в Німеччині' },
    title: {
      az: 'Almaniya iş bazası: iş və Ausbildung',
      de: 'Jobbörse Deutschland: Jobs und Ausbildung',
      en: 'Germany job search: jobs and Ausbildung',
      ru: 'Поиск работы в Германии и Ausbildung',
      tr: 'Almanya iş arama: iş ve Ausbildung',
      uk: 'Пошук роботи в Німеччині та Ausbildung',
    },
    description: {
      az: 'Almaniyada minlərlə iş və Ausbildung elanında peşə və şəhər üzrə axtarış edin, bəyəndiyiniz vakansiyaya isə Triad Vision vasitəsilə müraciət edin.',
      de: 'Tausende Jobs und Ausbildungsplätze in Deutschland nach Beruf und Ort durchsuchen und passende Stellen direkt über Triad Vision bewerben.',
      en: 'Search thousands of jobs and Ausbildung places in Germany by profession and city, then apply for the one you like through Triad Vision.',
      ru: 'Ищите среди тысяч вакансий и мест Ausbildung в Германии по профессии и городу и подавайте заявку на понравившуюся через Triad Vision.',
      tr: 'Almanya\'daki binlerce iş ve Ausbildung ilanında meslek ve şehre göre arama yapın, beğendiğiniz ilana Triad Vision üzerinden başvurun.',
      uk: 'Шукайте серед тисяч вакансій і місць Ausbildung у Німеччині за професією та містом і подавайте заявку на обрану через Triad Vision.',
    },
  },
  '/jobs/germany/search': {
    sitemap: false,
    index: false,
    name: { az: 'Axtarış nəticələri', de: 'Suchergebnisse', en: 'Search results', ru: 'Результаты поиска', tr: 'Arama sonuçları', uk: 'Результати пошуку' },
    title: {
      az: 'Almaniyada iş axtarışı: nəticələr',
      de: 'Jobsuche Deutschland: Ergebnisse',
      en: 'Germany job search: results',
      ru: 'Поиск работы в Германии: результаты',
      tr: 'Almanya iş arama: sonuçlar',
      uk: 'Пошук роботи в Німеччині: результати',
    },
    description: {
      az: 'Almaniyada iş və Ausbildung elanları üzrə axtarış nəticələri. Bəyəndiyiniz vakansiyaya Triad Vision vasitəsilə müraciət edin.',
      de: 'Suchergebnisse für Jobs und Ausbildung in Deutschland. Bewerben Sie sich über Triad Vision auf die passende Stelle.',
      en: 'Search results for jobs and Ausbildung in Germany. Apply for the right one through Triad Vision.',
      ru: 'Результаты поиска вакансий и Ausbildung в Германии. Подайте заявку на подходящую через Triad Vision.',
      tr: 'Almanya\'da iş ve Ausbildung arama sonuçları. Uygun ilana Triad Vision üzerinden başvurun.',
      uk: 'Результати пошуку вакансій і Ausbildung у Німеччині. Подайте заявку на відповідну через Triad Vision.',
    },
  },
  // Study in Germany (/study, /study/:slug): programme catalogue curated by staff (lib/study), "apply via Triad Vision".
  '/study': {
    name: { az: 'Almaniyada təhsil', de: 'Studium in Deutschland', en: 'Study in Germany', ru: 'Учёба в Германии', tr: 'Almanya\'da eğitim', uk: 'Навчання в Німеччині' },
    title: {
      az: 'Almaniyada təhsil: proqramlar və müddətlər',
      de: 'Studium in Deutschland: Studiengänge, Fristen',
      en: 'Study in Germany: programmes and deadlines',
      ru: 'Учёба в Германии: программы и сроки',
      tr: 'Almanya\'da eğitim: programlar ve tarihler',
      uk: 'Навчання в Німеччині: програми і строки',
    },
    description: {
      az: 'Almaniyada bakalavr və magistr proqramları: tədris dili, dil tələbləri, təhsil haqqı və müraciət müddətləri. Uyğun proqrama Triad Vision ilə müraciət edin.',
      de: 'Bachelor- und Masterstudiengänge in Deutschland: Unterrichtssprache, Sprachnachweis, Gebühren und Bewerbungsfristen — bewerben Sie sich über Triad Vision.',
      en: 'Bachelor\'s and master\'s programmes in Germany: teaching language, language requirements, tuition and application deadlines. Apply via Triad Vision.',
      ru: 'Бакалавриат и магистратура в Германии: язык обучения, языковые требования, стоимость и сроки подачи. Подайте заявку на программу через Triad Vision.',
      tr: 'Almanya\'da lisans ve yüksek lisans programları: eğitim dili, dil şartları, ücretler ve başvuru tarihleri. Uygun programa Triad Vision ile başvurun.',
      uk: 'Бакалаврат і магістратура в Німеччині: мова навчання, мовні вимоги, вартість і строки подання. Подайте заявку на програму через Triad Vision.',
    },
  },
  // Product page of the platform for other visa / recruitment agencies (owner instance only; lib/saas).
  '/platform': {
    name: { az: 'Agentliklər üçün platforma', de: 'Plattform für Agenturen', en: 'Platform for agencies', ru: 'Платформа для агентств', tr: 'Ajanslar için platform', uk: 'Платформа для агенцій' },
    title: {
      az: 'Viza və işə qəbul agentlikləri üçün platforma',
      de: 'Software für Visa- und Personalagenturen',
      en: 'Software for visa and recruitment agencies',
      ru: 'Платформа для визовых и кадровых агентств',
      tr: 'Vize ve işe alım ajansları için platform',
      uk: 'Платформа для візових і кадрових агенцій',
    },
    description: {
      az: 'CRM, müştəri və işəgötürən kabineti, sənədlər, səfirlik paketi, alman dili və iş axtarışı alətləri — öz brendinizlə. Demo istəyin.',
      de: 'CRM, Kunden- und Arbeitgeberportal, Dokumente, Botschaftspaket, Deutsch-Lerntools und Jobsuche – unter Ihrer Marke. Demo anfragen.',
      en: 'CRM, client and employer portals, documents, embassy package, German learning and job search tools – under your own brand. Request a demo.',
      ru: 'CRM, кабинеты клиентов и работодателей, документы, пакет для посольства, немецкий язык и поиск работы — под вашим брендом. Запросите демо.',
      tr: 'CRM, müşteri ve işveren portalı, belgeler, konsolosluk paketi, Almanca ve iş arama araçları — kendi markanızla. Demo isteyin.',
      uk: 'CRM, кабінети клієнтів і роботодавців, документи, пакет для посольства, німецька мова та пошук роботи — під вашим брендом. Демо.',
    },
  },
  // German bureaucracy glossary (/glossary, /glossary/:slug): static terms in lib/glossary.
  // Employer B2B (German first): anonymous candidate catalogue (lib/candidateCatalogue) and the Trust Center (lib/trust).
  '/kandidaten': {
    name: { az: 'Namizəd kataloqu', de: 'Kandidatenkatalog', en: 'Candidate catalogue', ru: 'Каталог кандидатов', tr: 'Aday kataloğu', uk: 'Каталог кандидатів' },
    title: {
      az: 'Azərbaycandan namizədlər: anonim kataloq',
      de: 'Fachkräfte aus Aserbaidschan: Kandidaten',
      en: 'Candidates from Azerbaijan: catalogue',
      ru: 'Кандидаты из Азербайджана: каталог',
      tr: "Azerbaycan'dan adaylar: anonim katalog",
      uk: 'Кандидати з Азербайджану: каталог',
    },
    description: {
      az: 'Almaniyada işləməyə hazır namizədlər peşə, alman dili səviyyəsi, təcrübə və başlama vaxtına görə — anonim qruplar, ad və şəkil olmadan.',
      de: 'Kandidaten aus Aserbaidschan nach Beruf, Deutschniveau, Berufserfahrung und Starttermin – anonyme Gruppen ohne Namen oder Fotos. Jetzt anfragen.',
      en: 'Candidates from Azerbaijan by profession, German level, experience and start date — anonymous groups without names or photos. Request candidates.',
      ru: 'Кандидаты из Азербайджана по профессии, уровню немецкого, опыту и сроку выхода — анонимные группы без имён и фото. Запросите кандидатов.',
      tr: "Azerbaycan'dan adaylar: meslek, Almanca seviyesi, deneyim ve başlangıç tarihine göre — isim ve fotoğraf olmadan anonim gruplar.",
      uk: 'Кандидати з Азербайджану за професією, рівнем німецької, досвідом і датою старту — анонімні групи без імен і фото. Запитайте кандидатів.',
    },
  },
  '/trust': {
    name: { az: 'Etibar mərkəzi', de: 'Trust Center', en: 'Trust Center', ru: 'Центр доверия', tr: 'Güven Merkezi', uk: 'Центр довіри' },
    title: {
      az: 'Etibar mərkəzi: məlumat və təhlükəsizlik',
      de: 'Trust Center: Datenschutz und Sicherheit',
      en: 'Trust Center: data protection, security',
      ru: 'Центр доверия: данные и безопасность',
      tr: 'Güven Merkezi: veri koruma ve güvenlik',
      uk: 'Центр довіри: захист даних і безпека',
    },
    description: {
      az: 'DSGVO sənədləri, AVV, tətbiq olunan təhlükəsizlik tədbirləri, alt-emalçılar, status səhifəsi və təhlükəsizlik problemləri üçün əlaqə.',
      de: 'DSGVO-Dokumente, AVV nach Art. 28, umgesetzte Sicherheitsmaßnahmen, Unterauftragsverarbeiter, Statusseite und Kontakt für Sicherheitsmeldungen.',
      en: 'GDPR documents, data processing agreement, implemented security measures, sub-processors, status page and a contact for security reports.',
      ru: 'Документы DSGVO, договор AVV, реализованные меры безопасности, субподрядчики, страница статуса и контакт для сообщений об уязвимостях.',
      tr: 'GDPR belgeleri, AVV sözleşmesi, uygulanan güvenlik önlemleri, alt işleyenler, durum sayfası ve güvenlik bildirimi iletişimi.',
      uk: 'Документи GDPR, договір AVV, впроваджені заходи безпеки, субпідрядники, сторінка статусу та контакт для повідомлень про вразливості.',
    },
  },
  '/glossary': {
    name: { az: 'Alman bürokratiya lüğəti', de: 'Glossar Behördendeutsch', en: 'German bureaucracy glossary', ru: 'Словарь немецкой бюрократии', tr: 'Alman bürokrasi sözlüğü', uk: 'Словник німецької бюрократії' },
    title: {
      az: 'Alman bürokratiya lüğəti: 200 termin izahlı',
      de: 'Glossar: Behördendeutsch einfach erklärt',
      en: 'German bureaucracy glossary: 200 terms',
      ru: 'Словарь немецкой бюрократии: 200 терминов',
      tr: 'Alman bürokrasi sözlüğü: 200 terim açıklamalı',
      uk: 'Словник німецької бюрократії: 200 термінів',
    },
    description: {
      az: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution və digər alman terminləri: artikl, oxunuş, sadə izah və nümunə cümlə.',
      de: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution und mehr: rund 200 Begriffe mit Artikel, Aussprache, Erklärung und Beispielsatz.',
      en: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution and more: about 200 German terms with article, pronunciation and a plain explanation.',
      ru: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution и другие термины: артикль, произношение, простое объяснение и пример.',
      tr: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution ve diğer Almanca terimler: artikel, okunuş, kısa açıklama ve örnek.',
      uk: 'Anmeldung, Aufenthaltstitel, Steuer-ID, Krankenkasse, Kaution та інші терміни: артикль, вимова, просте пояснення і приклад.',
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
  },  // Widget configurator (/widgets) and the embeddable widgets themselves (client lib/embeds.ts): the /embed/*
  // pages are made for other sites' iframes — noindex, with a canonical to the full tool.
  '/widgets': {
    name: { az: 'Vidjetlər', de: 'Widgets', en: 'Widgets', ru: 'Виджеты', tr: 'Widget\'lar', uk: 'Віджети' },
    title: {
      az: 'Saytınız üçün pulsuz vidjetlər',
      de: 'Kostenlose Widgets für Ihre Website',
      en: 'Free widgets for your website',
      ru: 'Бесплатные виджеты для вашего сайта',
      tr: 'Siteniz için ücretsiz widget\'lar',
      uk: 'Безкоштовні віджети для вашого сайту',
    },
    description: {
      az: 'Maaş kalkulyatoru, Mavi Kart yoxlaması və şəhər testi — öz saytınıza və ya bloqunuza bir neçə sətir kodla pulsuz əlavə edin.',
      de: 'Brutto-Netto-Rechner, Blaue-Karte-Check und Städte-Quiz kostenlos mit wenigen Zeilen Code in Ihre Website oder Ihren Blog einbinden.',
      en: 'Add the German salary calculator, the Blue Card check and the city quiz to your website or blog for free with a few lines of code.',
      ru: 'Калькулятор зарплаты, проверка Голубой карты и тест по городам — бесплатно на ваш сайт или блог несколькими строками кода.',
      tr: 'Almanya maaş hesaplayıcı, Mavi Kart kontrolü ve şehir testi — birkaç satır kodla sitenize veya blogunuza ücretsiz ekleyin.',
      uk: 'Калькулятор зарплати, перевірка Блакитної карти й тест за містами — безкоштовно на ваш сайт чи блог кількома рядками коду.',
    },
  },
  '/embed/salary-calculator': {
    index: false,
    sitemap: false,
    canonical: '/salary-calculator',
    name: { az: 'Maaş kalkulyatoru (vidjet)', de: 'Brutto-Netto-Rechner (Widget)', en: 'Salary calculator (widget)', ru: 'Калькулятор зарплаты (виджет)', tr: 'Maaş hesaplayıcı (widget)', uk: 'Калькулятор зарплати (віджет)' },
    title: { az: 'Maaş kalkulyatoru (vidjet)', de: 'Brutto-Netto-Rechner (Widget)', en: 'Salary calculator (widget)', ru: 'Калькулятор зарплаты (виджет)', tr: 'Maaş hesaplayıcı (widget)', uk: 'Калькулятор зарплати (віджет)' },
    description: {
      az: 'Almaniyada brutto maaşdan xalis maaşı hesablayan yerləşdirilə bilən vidjet.',
      de: 'Einbettbares Widget: Netto aus Brutto in Deutschland berechnen.',
      en: 'Embeddable widget: work out German net pay from gross pay.',
      ru: 'Встраиваемый виджет: зарплата на руки в Германии из брутто.',
      tr: 'Gömülebilir widget: Almanya\'da brüt maaştan net maaşı hesaplayın.',
      uk: 'Вбудовуваний віджет: зарплата на руки в Німеччині з брутто.',
    },
  },
  '/embed/blue-card-check': {
    index: false,
    sitemap: false,
    canonical: '/blue-card-check',
    name: { az: 'Mavi Kart yoxlaması (vidjet)', de: 'Blaue-Karte-Check (Widget)', en: 'Blue Card check (widget)', ru: 'Проверка Голубой карты (виджет)', tr: 'Mavi Kart kontrolü (widget)', uk: 'Перевірка Блакитної карти (віджет)' },
    title: { az: 'Mavi Kart yoxlaması (vidjet)', de: 'Blaue-Karte-Check (Widget)', en: 'Blue Card check (widget)', ru: 'Проверка Голубой карты (виджет)', tr: 'Mavi Kart kontrolü (widget)', uk: 'Перевірка Блакитної карти (віджет)' },
    description: {
      az: 'Maaşın AB Mavi Kartı həddinə çatdığını yoxlayan yerləşdirilə bilən vidjet.',
      de: 'Einbettbares Widget: Gehalt gegen die Gehaltsgrenze der Blauen Karte EU prüfen.',
      en: 'Embeddable widget: check a salary against the EU Blue Card threshold.',
      ru: 'Встраиваемый виджет: проверка зарплаты по порогу Голубой карты ЕС.',
      tr: 'Gömülebilir widget: maaşı AB Mavi Kart sınırına göre kontrol edin.',
      uk: 'Вбудовуваний віджет: перевірка зарплати за порогом Блакитної карти ЄС.',
    },
  },
  '/embed/which-city': {
    index: false,
    sitemap: false,
    canonical: '/which-city',
    name: { az: 'Şəhər testi (vidjet)', de: 'Städte-Quiz (Widget)', en: 'City quiz (widget)', ru: 'Тест по городам (виджет)', tr: 'Şehir testi (widget)', uk: 'Тест за містами (віджет)' },
    title: { az: 'Şəhər testi (vidjet)', de: 'Städte-Quiz (Widget)', en: 'City quiz (widget)', ru: 'Тест по городам (виджет)', tr: 'Şehir testi (widget)', uk: 'Тест за містами (віджет)' },
    description: {
      az: 'Almaniyanın hansı şəhərinin sizə uyğun olduğunu göstərən yerləşdirilə bilən test.',
      de: 'Einbettbares Quiz: Welche deutsche Stadt passt zu Ihnen?',
      en: 'Embeddable quiz: which German city suits you best?',
      ru: 'Встраиваемый тест: какой город Германии вам подходит?',
      tr: 'Gömülebilir test: Almanya\'nın hangi şehri size uygun?',
      uk: 'Вбудовуваний тест: яке місто Німеччини вам підходить?',
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
  '/upload', // login-free case upload link (/upload/<token>)
  '/originals', // hand-over receipt check (/originals/verify/<code>, QR on the act)
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
  '/arrival-certificate/:code',
  '/ready-certificate/:code', // public Germany Ready practice certificate check (noindex)
  '/referral-terms',
  '/status',
  '/p/:code',
  '/agb',
  '/terms',
  '/cookies',
  '/legal/:kind/:version',
  '/packages/order/:token',
  '/result-email', // "e-mail me my result": confirm / unsubscribe link (token in the query, lib/toolLeads)
];

/**
 * The tools hub (/tools): every calculator, check and planning aid, grouped as on the page
 * (client/src/components/audience/tools.ts). Paths without a catalogue entry are skipped in the crawlable body.
 */
export type ToolGroupKey = 'eligibility' | 'costs' | 'plan' | 'life' | 'learn' | 'employers' | 'explore';
export const TOOL_GROUPS: { key: ToolGroupKey; paths: string[] }[] = [
  { key: 'eligibility', paths: ['/path-finder', '/uygunluq-testi', '/eligibility', '/compare-visas', '/germany-vs-other-countries', '/visa-document-checklist', '/visa-refusal', '/blue-card-check', '/chancenkarte-calculator', '/anerkennung', '/family-reunification-check', '/grade-converter'] },
  { key: 'costs', paths: ['/salary-calculator', '/cost-calculator', '/budget', '/payslip-explained', '/tax-refund-calculator', '/shift-pay-calculator', '/rent-check', '/send-money-home', '/health-insurance-comparison', '/tax-class-chooser', '/real-salaries'] },
  { key: 'plan', paths: ['/when-in-germany', '/permanent-residence', '/five-years-in-germany', '/which-city', '/residence-card-explained', '/calculator', '/cities', '/events', '/status'] },
  { key: 'life', paths: ['/life-in-germany', '/german-apartment', '/apartment-viewing', '/german-street', '/driving-licence-germany', '/holiday-planner', '/weekend-trips', '/emergency-wallpaper', '/driving-time-calculator', '/work-schedule-check'] },
  { key: 'learn', paths: ['/german-mock-exam', '/german-level-test-self', '/german-simulator', '/pronunciation', '/price-game', '/traffic-signs', '/waste-sorting', '/ticket-machine', '/supermarket-game', '/work-scenes', '/work-scenes/restaurant-kitchen', '/work-scenes/truck-cab', '/work-scenes/hospital-ward', '/work-scenes/construction-site', '/work-scenes/electrical-panel'] },
  { key: 'employers', paths: ['/employer-cost-calculator', '/employer-guide-azerbaijan', '/kandidaten'] },
  { key: 'explore', paths: ['/map', '/azerbaijan-in-germany', '/guides', '/shortage-barometer', '/glossary', '/jobs', '/visas'] },
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
